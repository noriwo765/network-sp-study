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
- `server/notes.json` … ワーク演習のメモ・マーカー（Git 管理外。CBT のメモ機能）。`{ entries: { '<問題id>@<周の開始時刻 __round.at>': { pid, roundN, roundAt, at, text, marks: [[開始, 終了, 'r'|'b'|'y']] } } }`。履歴とは別キー（localStorage `nespe-work-notes-v1`）・別ファイルで、同期は項目ごとに at の新しい方を残すマージ（丸ごと上書きしない・項目を消さない）。リセットで周の開始時刻が変わるので新しい周は白紙、前の周は履歴画面と解答記録の「## メモ」に残る。
- `server/progress.json` … 単語カード・一問一答・理解度チェック・診断の記録（Git 管理外）。`{ at, data: { localStorage のキー: 値 } }`。中継サーバで開いたとき `apps/js/progress-sync.js` が自動で保存・復元する（at が新しい方を採用。初回だけは両方を合わせる）。スマホ（GitHub Pages）はトップページの「書き出す／読み込む」で手動バックアップ。
- `server/review.json` … 苦手ジャンル復習の解答・採点（Git 管理外。演習の履歴とは別管理）。形は history.json と同じ `data['<問題id>:<設問id>'] = { answer, attempts }` で、同期も同じ `mergeHistory`（`/review`）。対象＝演習の最新の採点が満点でない設問、克服＝復習の最新の採点が満点（`apps/js/work-review.js`）。演習の得点率・周回・想定合格率・`_学習状況.md` には入れない。状況は `解答記録/_復習/_復習状況.md`（自動生成）、各回は `解答記録/_復習/<日付>/<時刻>_<問題>.md`。復習のメモは notes.json のキー `review:<問題id>`。
- 練習モード（問題一覧の「練習」）… 模範解答を見ながら解く。AI 採点はできるが**どこにも記録しない**（履歴・周回・得点率・解答記録・想定合格率に入れない）。入力は localStorage `nespe-work-practice-v1`（この端末だけ。サーバ同期なし）、採点結果は画面を開いている間だけ。メモは notes.json のキー `practice:<問題id>`。
- まとめて採点（演習・復習・練習とも）は、画面に出ている最新の採点と解答が同じ設問を採点し直さない（書き直した設問だけ API を呼ぶ）。
- 苦手ジャンル … `flashcards/qa_weak.js`（一問一答。`weak / src / miss`、`theme` がジャンル）と `flashcards/terms.js` の `weak: true` の用語。ワーク演習の失点から作る。`qa.html?weak=1`・`terms.html?weak=1` で絞り込み。
- 過去問ベースの教材 … `flashcards/qa_<問題id>.js`（一問一答）と `apps/js/scenarios/<問題id>.js`（アニメ）。どちらも公開対象なので問題文・解答例・図を写さず、会社名やアドレスなどの設定も変える。問題の一覧は `apps/js/book.js` の `EXAMS`。
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
| `apps/js/work-tools.js` | CBT ツール（本番の試験アプリの再現）：電卓（四則演算・かっこ・＝確定、小中大、移動）とメモ（半透明・検索・マーカー赤青黄／白で消去・カット/コピー/ペースト・10,000字）。計算とマーカー範囲の計算は純粋関数で `require` できる（`WorkToolsPure`）。保存は `work-app.js` の `Notes` |
| `apps/js/work-merge.js` | 履歴の合わせ方（純粋関数 `mergeHistory`）。画面の起動時・復元・読み直しと、`relay.js` の `/history` 保存で共用。採点（attempts）は at で突き合わせて足すだけで消さない、`__round` は at の新しい方、片方にしかないキーは残す、下書き・タイマーは後から来た側（ただしその問題の採点を一部持っていない古い側なら base を残す） |
| `apps/js/work-review.js` | 苦手ジャンル復習の対象設問・克服の判定（純粋関数 `reviewTargets`・`byGenre`・`groupByProblem`・`isFull`）。画面はワーク演習の「苦手ジャンル復習」（分野→問題ごとに、実問題の横へ対象の設問だけを出す） |
| `apps/js/work-genre.js` | 設問→分野の対応（`WORK_GENRE[問題id][設問id]`、分野の一覧は `WORK_GENRES`）。学習状況の「分野別の得点率」と `_学習状況.md` の分野表で使う。問題を追加したら全設問ぶん足す（`work-check.js` が抜けを NG にする） |
| `apps/css/work.css` | ワーク演習のスタイル |
| `apps/plan.html`・`apps/js/plan-app.js`・`apps/css/plan.css` | 学習計画（ローカル専用）。履歴・配点は読むだけで、保存は `/plan` のみ。`work.html?p=<問題id>` でその問題を直接開く |
| `server/relay.js` | 中継サーバ。静的配信、`/progress`（暗記系の学習記録。古い at での上書きは 409）、`/grade`（Claude で採点）、`/history`、`/haiten`、`/plan`（学習計画。ファイル更新時刻を版にし、古い版での上書きは 409）、`/estimate`（想定合格率の AI 判定。GET で前回の結果）、`/notes`（メモ・マーカー。項目ごとに新しい方を残す。notes.json が壊れていたら書かない）、`/review`（苦手ジャンル復習。history と同じ合わせ方）、`/record`（解答記録/ への書き出し） |
| `apps/tools/work-check.js` | 整合性チェック（解答欄の分割・配点・履歴）。`--fields <問題id>` で欄の単位を表示 |
| `apps/tools/haiten-set.js` | 配点の一括登録（欄ラベルを検証し、rev を進めて保存） |
| `apps/tools/anki-export.js` | 苦手ジャンルの一問一答を Anki 用の `.apkg` に書き出す（`node --experimental-sqlite apps/tools/anki-export.js`）。`qa_weak.js` を更新したら書き出し直す。`--final` で本番前の定番の答え（`flashcards/qa_final.js`）を別デッキに書き出す |

解答欄の分け方（`work-shape.js`）：解答例が「ラベル：値　ラベル：値」→ラベル付きの複数欄、「ラベル：①X　②Y」「①X　②Y」→丸数字ごとの欄、「・X　・Y」→設問文が複数答えさせている（二つ/それぞれ/全て…）ときだけ番号付きの複数欄（そうでなければ別解の列挙なので1欄）、それ以外→1欄。「（順不同）」などの注記は欄にしない。

## 変更したら確認すること
- `node apps/tools/work-check.js`（解答欄・配点・履歴）、ほかの教材は `node apps/tools/check.js`。JS は `node --check <file>`。過去問ベースの教材は `node apps/tools/past-check.js`（問題文と20字以上一致したら NG）。
- `server/relay.js` を変えたら**サーバの再起動が必要**（ユーザーに伝える）。画面側（apps/）の変更はブラウザの再読み込みで反映される。
- 解答欄の分け方を変えたら `work-check.js` の件数（ラベル付き・箇条書き・1欄）と「要確認」を前後で比べる。1欄が正しいと確認した設問は `KNOWN_SINGLE` に理由つきで追加する。

## 過去の不具合と教訓
- **配点が2回消えた**：配点を履歴と同じ保存先に相乗りさせていたため、履歴同期の上書きに巻き込まれた。→ 配点は別キー・別ファイルにし、rev（最終編集時刻）で新旧を判定する。サーバは古い rev での上書きを拒否する。**利用者が入力したデータを、同期で丸ごと上書きされる塊に相乗りさせない。**
- **起動時同期で新しい変更が消えた**：以前は「ファイル優先の完全上書き」だった。→ 最終保存時刻を比べて、新しい方を採用するように変えた。
- **まとめて採点で記録ファイルが設問の数だけ重複した**：記録の保存は、採点アクションの呼び出し側で1回だけ行う（`runGrade` の中では保存しない）。
- **開きっぱなしの古いタブが採点結果を消した**（2026-11-07）：履歴は丸ごと上書きで保存していたため、16:46 に開いたままのタブがタイマーの保存のたびに古い履歴全体を書き戻し、その後の採点（R5午後Ⅱ問1・R4午後Ⅰ問1第2周）が消えた。→ サーバも画面も `work-merge.js` で合わせて保存する（採点は消えない）。同じブラウザの別タブが保存したら `storage` イベントで読み直す。復元は `解答記録/` の Markdown（設問ごとに最新の採点が全項目載っている）と `git local` の版から行った。
- **履歴の文字化け（「�」）**：`relay.js` の `readJson` が受信した塊ごとに文字列へ足していたため、64KB の境目で分かれた日本語の1文字が化けていた。→ Buffer のまま集めて最後に UTF-8 に直す。化けた文字列は過去の版・解答記録から直した。
- **解答欄の分割ミス**：別解の列挙（・）を複数欄にしていた、丸数字の連番を1欄にしていた。→ 上の分け方のルールで解決した。

## ルール
- `server/history.json`・`解答記録/` の記録・`server/.env`（APIキー）は **コミットしない**（.gitignore 済み。SSD で運ぶ）。
- `server/haiten.json` は **Git 管理**（消失防止）。配点を変えたらコミットする。手で編集せず `apps/tools/haiten-set.js` を使う。
- IPA 過去問由来のデータ・画像（`apps/work/pages/`・`figs/`・`r*_pm*_q*.js`・`_pages.js`・`tmp/`）は再配布しない（push 対象外）。
- `history.json` を直接編集するときは、**ワーク演習のサーバを止め、ブラウザのタブも閉じてから**行う（起動中はブラウザ側が書き戻すため）。
- 改行コードは `.gitattributes` で固定している（全体 LF、`.bat` のみ CRLF）。Windows と Mac で同じ作業ツリーを共有しているので変えないこと。

## ローカル専用リポジトリ（`.git-local`）
公開用の `.git` とは別に、同じフォルダで2つ目のリポジトリを使っている。リモートはなく、公開しない。SSD ごと持ち運ぶ。
- 管理するもの：`server/` の `history.json`・`plan.json`・`progress.json`・`estimate.json`・`notes.json`・`review.json`、`解答記録/`、過去問データ（`apps/work/pages/`・`figs/`・`_pages.js`・`r*_pm*_q*.js`）。`server/.env` は入れない。
- `git local-save [メッセージ]` … 上の一式を保存する。起動スクリプトが起動のたびに実行するので、前回の学習ぶんは次の起動時に記録される。
- `git local <コマンド>` … 例：`git local log`、`git local diff HEAD~1 --stat`。別名の定義は `.git/config` にある（`git --git-dir=.git-local --work-tree=. <コマンド>` と同じ）。
- 保存する一覧は `.git-local/save.sh` にある。公開用の `.gitignore` が優先されるため、新しいファイルは `git local add` では入らない。一覧に足して `git local-save` を使う。
- 戻すときは、サーバを止めてブラウザのタブも閉じてから `git local restore --source=<コミット> -- server/history.json` のようにする。

## 進め方（利用者の好み）
- Web ページ（まとめ・チェックリストなど）は Artifact ではなく、このワークスペースの `apps/` に置いて管理する。`index.html` からリンクし、`apps/sw.js` の FILES に足して VERSION を上げる（`check.js` が漏れを検出）。過去問由来の内容は `past-check.js` の全件検査の対象に入れる。
- 方針が分かれるときは、選択肢と推奨を示して確認してから作る（過去に意図とずれたことがある）。
- 学習面では**達成感**を大事にしている。数字で「できたこと」を見せる。
- コミットメッセージは日本語。1行目に要約、本文に変更点の箇条書き。

## 起動
- Windows：`ワーク演習を起動.bat`／Mac：`ワーク演習を起動.command`（どちらも `node server/relay.js` を起動してブラウザを開く）
- URL：`http://localhost:8787/apps/work.html`
- 詳細は `readme.md`・`server/README.md`・`apps/work/README.md`（問題データの追加手順）。
