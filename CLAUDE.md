# ネスペ学習 — Claude Code 向けメモ

ネットワークスペシャリスト試験の学習教材（Webアプリ）と、利用者本人の学習記録が入ったリポジトリ。
このフォルダは **SSD（exFAT）に置いて Windows と Mac で持ち運んで共用**している。
Claude Code のメモリ（~/.claude）はマシンごとで SSD に乗らないため、**両マシンで共有すべき知識はこのファイルに書く**。

## 学習記録の場所（どちらのマシンでも同じファイルを読む）
- **まず `解答記録/_学習状況.md`** … 自動生成のサマリー（挑戦数・完答数・得点率・問題ごとの状況・要復習の設問）。ワーク演習を起動・採点・中断保存するたびに更新される。
- `解答記録/<年度_区分_問_タイトル>/<日時>.md` … 採点（または中断保存）1回ごとのスナップショット。設問ごとの解答・AI採点・公式解答例。
- `server/history.json` … 生データ。`data['<問題id>:<設問id>'] = { answer, attempts: [{ at, elapsed, answer, result: { verdict, score, scoreMax, good, missing, diff, advice, modelAnswer } }] }`、`data['<問題id>:__timer'] = { sec }`、`data['<問題id>:__round'] = { n: 第何周, at: 開始時刻 }`（周回モード。リセットで周を進め、演習画面には at 以降の採点だけを出す。attempts は全周ぶん残す）。`savedAt` は最終保存時刻。
- `server/haiten.json` … 配点予想。`{ rev, haiten: { '<問題id>:<設問id>': 点数 | { 欄ラベル: 点数 } } }`。欄ラベルは解答欄と同じ（a/b/c・機器①・① など）。
- `server/plan.json` … 本番までの学習計画（Git 管理外）。`{ createdAt, examDate, goals, tips, days: [{ date, hours, toggle?: { flag, label, hours, note }, tasks: [{ id, type: solve|redo|text, round, need, pid, qids, text, note, when?, unless? }] }], extra, flags: { フラグ: true }, checks: { タスクid: true }, memo: { 日付: 文 } }`。toggle は日ごとの切り替えスイッチ（例：休日出勤）で、flag が立つと when のタスクが出て unless のタスクが消える。画面は `apps/plan.html`。採点は createdAt 以降の分だけ数え、solve は全設問を need 回（既定1。2周目は2）採点、redo は指定設問を採点すると自動で済になる。計画を組み替えるときは checks・memo を消さない。`解答記録/_学習計画.md` は方針のメモ。
- `server/estimate.json` … 想定合格率の AI 判定結果（Git 管理外）。`{ at, rate, pm1, pm2, summary, reasons, actions, basis }`。判定材料は各設問の最終の採点結果で、未回答は0点。学習状況画面のボタンで判定し、`_学習状況.md` にも載る。
- 問題データ … `apps/work/r*_pm*_q*.js`（`id` は `r7_pm1_q1` の形式、設問は `questions[].id`）。

## Skill（このリポジトリ用）
- `study-review` … 学習記録を読んで、できたこと・弱点・次にやることをまとめる。
- `haiten-import` … 配点の画像を読み取り、配点ファイルに一括登録する。

## ワーク演習の構成
| ファイル | 役割 |
|---|---|
| `apps/work.html` | 画面（問題一覧・演習・履歴・学習状況・配点設定のセクション） |
| `apps/js/work-app.js` | 画面ロジック。`Store`（履歴：localStorage＋/history）、`Haiten`（配点：別キー＋/haiten）、採点、記録・サマリーの書き出し |
| `apps/js/work-shape.js` | 解答例の書式から解答欄（欄の分け方）と欄ごとの字数上限（`fieldLimits`）を決める純粋関数。画面と検証ツールで共用 |
| `apps/css/work.css` | ワーク演習のスタイル |
| `apps/plan.html`・`apps/js/plan-app.js`・`apps/css/plan.css` | 学習計画（ローカル専用）。履歴・配点は読むだけで、保存は `/plan` のみ。`work.html?p=<問題id>` でその問題を直接開く |
| `server/relay.js` | 中継サーバ。静的配信、`/grade`（Claude で採点）、`/history`、`/haiten`、`/plan`（学習計画。ファイル更新時刻を版にし、古い版での上書きは 409）、`/estimate`（想定合格率の AI 判定。GET で前回の結果）、`/record`（解答記録/ への書き出し） |
| `apps/tools/work-check.js` | 整合性チェック（解答欄の分割・配点・履歴）。`--fields <問題id>` で欄の単位を表示 |
| `apps/tools/haiten-set.js` | 配点の一括登録（欄ラベルを検証し、rev を進めて保存） |

解答欄の分け方（`work-shape.js`）：解答例が「ラベル：値　ラベル：値」→ラベル付きの複数欄、「ラベル：①X　②Y」「①X　②Y」→丸数字ごとの欄、「・X　・Y」→設問文が複数答えさせている（二つ/それぞれ/全て…）ときだけ番号付きの複数欄（そうでなければ別解の列挙なので1欄）、それ以外→1欄。「（順不同）」などの注記は欄にしない。

## 変更したら確認すること
- `node apps/tools/work-check.js`（解答欄・配点・履歴）、ほかの教材は `node apps/tools/check.js`。JS は `node --check <file>`。
- `server/relay.js` を変えたら**サーバの再起動が必要**（ユーザーに伝える）。画面側（apps/）の変更はブラウザの再読み込みで反映される。
- 解答欄の分け方を変えたら `work-check.js` の件数（ラベル付き・箇条書き・1欄）と「要確認」を前後で比べる。1欄が正しいと確認した設問は `KNOWN_SINGLE` に理由つきで追加する。

## 過去の不具合と教訓
- **配点が2回消えた**：配点を履歴と同じ保存先に相乗りさせていたため、履歴同期の上書きに巻き込まれた。→ 配点は別キー・別ファイルにし、rev（最終編集時刻）で新旧を判定する。サーバは古い rev での上書きを拒否する。**利用者が入力したデータを、同期で丸ごと上書きされる塊に相乗りさせない。**
- **起動時同期で新しい変更が消えた**：以前は「ファイル優先の完全上書き」だった。→ 最終保存時刻を比べて、新しい方を採用するように変えた。
- **まとめて採点で記録ファイルが設問の数だけ重複した**：記録の保存は、採点アクションの呼び出し側で1回だけ行う（`runGrade` の中では保存しない）。
- **解答欄の分割ミス**：別解の列挙（・）を複数欄にしていた、丸数字の連番を1欄にしていた。→ 上の分け方のルールで解決した。

## ルール
- `server/history.json`・`解答記録/` の記録・`server/.env`（APIキー）は **コミットしない**（.gitignore 済み。SSD で運ぶ）。
- `server/haiten.json` は **Git 管理**（消失防止）。配点を変えたらコミットする。手で編集せず `apps/tools/haiten-set.js` を使う。
- IPA 過去問由来のデータ・画像（`apps/work/pages/`・`figs/`・`r*_pm*_q*.js`・`_pages.js`・`tmp/`）は再配布しない（push 対象外）。
- `history.json` を直接編集するときは、**ワーク演習のサーバを止め、ブラウザのタブも閉じてから**行う（起動中はブラウザ側が書き戻すため）。
- 改行コードは `.gitattributes` で固定している（全体 LF、`.bat` のみ CRLF）。Windows と Mac で同じ作業ツリーを共有しているので変えないこと。

## 進め方（利用者の好み）
- 方針が分かれるときは、選択肢と推奨を示して確認してから作る（過去に意図とずれたことがある）。
- 学習面では**達成感**を大事にしている。数字で「できたこと」を見せる。
- コミットメッセージは日本語。1行目に要約、本文に変更点の箇条書き。

## 起動
- Windows：`ワーク演習を起動.bat`／Mac：`ワーク演習を起動.command`（どちらも `node server/relay.js` を起動してブラウザを開く）
- URL：`http://localhost:8787/apps/work.html`
- 詳細は `readme.md`・`server/README.md`・`apps/work/README.md`（問題データの追加手順）。
