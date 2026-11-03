# flashcards — 単語集・比較表・番号一覧

暗記系のデータ。アプリから読み込んで使う。

| ファイル | 内容 |
|---------|------|
| [terms.js](terms.js) | 用語データ（全19章）→ [単語カード](../apps/terms.html) |
| [compare.js](compare.js) | 紛らわしい用語の比較表 → [紛らわしい用語の比較](../apps/compare.html) |
| qa_<問題id>.js | 過去問 一問一答。令和4〜7年の午後20問の場面で問う → [一問一答](../apps/qa.html) |
| [qa_weak.js](qa_weak.js) | 苦手ジャンルの一問一答。ワーク演習で失点した論点（weak / miss 付き）→ [苦手だけ](../apps/qa.html?weak=1) |
| [ports.js](ports.js) | ポート番号と、IPプロトコル番号・マルチキャストアドレス・ICMPタイプなど → [ポート番号](../apps/ports.html) |

## データ形式
```js
// terms.js
{ ch: 本の章番号, term: '用語', desc: '意味', note: '補足・試験での狙われどころ（省略可）', weak: true（苦手ジャンル。省略可） }
// qa_<問題id>.js（問題文・解答例は写さない。node apps/tools/past-check.js で確認）
{ id, exam: 問題id, src: '出典の設問', theme: '論点', q, a, kaisetsu?, oboe?, scene?: 'アニメの問題id/ステップ', choices: [4つ], answer: 正解の位置 }
// qa_weak.js … 上に weak: true, miss: '前回のつまずき' を足す。theme は苦手ジャンル
// compare.js
{ ch, title: '見出し', point: '見分けるポイント', head: ['', '用語1', '用語2'], rows: [['観点', '値1', '値2']] }
// ports.js
{ port: 587, proto: 'TCP', name: 'サブミッション', desc: '用途', cat: '分類', ch }
```
追加・修正したら `node apps/tools/check.js` で確認し、`apps/sw.js` の `VERSION` を上げてから公開する。
