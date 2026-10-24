# work — ワーク演習の問題データ

記述式（午後問題型）の問題を、1問（＝1つの「問」）につき1ファイルで持つ。ファイル名は `<year>_<section>_q<no>.js`（例：`r7_pm1_q1.js`）。各ファイルは `window.WORK_PROBLEMS` に1件 push する。図は `work/figs/` に PNG で同梱する。

出典は IPA 公開の過去問題（本文・表は文字起こし、構成図は PDF から描画した PNG、採点基準は公式「解答例」）。

## データ構造
```js
window.WORK_PROBLEMS = window.WORK_PROBLEMS || [];
window.WORK_PROBLEMS.push({
  id: 'r7_pm1_q1',              // 一意。<year>_<section>_q<no>
  year: 'R7', yearLabel: '令和7年',
  section: 'pm1',              // pm1 | pm2
  sectionLabel: '午後Ⅰ',       // 午後Ⅰ | 午後Ⅱ
  no: 1, title: 'ルータの更改', // 問番号・タイトル
  overview: '…',               // 出題趣旨（解答例PDF冒頭の文）
  source: 'https://www.ipa.go.jp/…',
  body: [ /* 本文ブロックの配列。下記 */ ],
  questions: [ /* 設問の配列。下記 */ ],
  commentary: '…',             // 採点講評（問全体。任意）
});
```

### body ブロック
| t | 使うキー | 意味 |
|---|---------|------|
| `p` | `text` | 段落 |
| `h` | `text` | 小見出し（〔…〕など） |
| `ul` | `items[]` | 箇条書き |
| `note` | `text` | 注記 |
| `fig` | `src`, `cap` | 図（`src` は `work/figs/…png`、`cap` は図番号＋表題） |
| `table` | `cap`, `head[]`, `rows[][]` | 表 |

本文中の空欄は `［ a ］`、下線部は丸数字（`①` 等）を文中にそのまま残す。全角カンマ「，」・全角読点など、原文の表記を踏襲する。

### question（設問）
```js
{
  id: '設問1(2)',              // 設問番号
  group: '設問2 〔…〕について答えよ。', // その設問群の先頭だけに付ける見出し（任意）
  type: 'desc' | 'fill',       // desc=記述, fill=空欄補充
  charLimit: '35字以内',        // 字数制限（任意）
  prompt: '…設問文…',
  answer: '…公式解答例…',       // 解答例PDFの「解答例・解答の要点」そのまま
}
```
複数の空欄（a〜c）をまとめて問う設問は1件にまとめ、`answer` に「a：… b：… c：…」と併記する。

## 実問題ページ画像（pages/ と _pages.js）
左ペインに表示する「実際の試験ページ」は、IPA 公開 PDF を問ごとに描画したグレースケール JPEG（`pages/<id>_pNN.jpg`）。各問のページ一覧は `_pages.js`（自動生成）が `window.WORK_PAGES[<id>] = [...]` として持つ。ページ画像を追加・再生成したら `_pages.js` を作り直す：

```bash
# apps/work/pages/ を走査して _pages.js を再生成する例（リポジトリ直下で）
node -e 'const fs=require("fs");const d="apps/work/pages";const m={};for(const f of fs.readdirSync(d).filter(f=>/_p\d+\.jpg$/.test(f))){const id=f.replace(/_p\d+\.jpg$/,"");(m[id]=m[id]||[]).push(f)}let o="window.WORK_PAGES=window.WORK_PAGES||{};\nObject.assign(window.WORK_PAGES,{\n";for(const id of Object.keys(m).sort())o+=`  "${id}": [${m[id].sort().map(f=>`"work/pages/${f}"`).join(", ")}],\n`;o+="});\n";fs.writeFileSync("apps/work/_pages.js",o)'
```

> ワーク演習はローカル専用のため、`work.html`・`work/`・`css/work.css`・`js/work-app.js` は公開オフラインキャッシュ（`sw.js`）に**含めない**。

## 追加の手順
1. 問題冊子PDFを読み、`body`・`questions` を文字起こしする。`answer` は必ず**解答例PDF**から取る。
2. 図は `work/figs/<id>_figN.png` として切り出して置く。
3. `apps/work.html` に `<script src="work/<file>.js"></script>` を追加する。
4. `apps/sw.js` の `FILES` に同ファイルと図を追加し、`VERSION` を上げる。
