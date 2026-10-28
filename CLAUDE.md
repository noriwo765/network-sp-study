# ネスペ学習 — Claude Code 向けメモ

ネットワークスペシャリスト試験の学習教材（Webアプリ）と、利用者本人の学習記録が入ったリポジトリ。
このフォルダは **SSD（exFAT）に置いて Windows と Mac で持ち運んで共用**している。
Claude Code のメモリ（~/.claude）はマシンごとで SSD に乗らないため、**両マシンで共有すべき知識はこのファイルに書く**。

## 学習記録の場所（どちらのマシンでも同じファイルを読む）
- **まず `解答記録/_学習状況.md`** … 自動生成のサマリー（挑戦数・完答数・得点率・問題ごとの状況・要復習の設問）。ワーク演習を起動・採点・中断保存するたびに更新される。
- `解答記録/<年度_区分_問_タイトル>/<日時>.md` … 採点（または中断保存）1回ごとのスナップショット。設問ごとの解答・AI採点・公式解答例。
- `server/history.json` … 生データ。`data['<問題id>:<設問id>'] = { answer, attempts: [{ at, elapsed, answer, result: { verdict, score, scoreMax, good, missing, diff, advice, modelAnswer } }] }`、`data['<問題id>:__timer'] = { sec }`。`savedAt` は最終保存時刻。
- `server/haiten.json` … 配点予想。`haiten['<問題id>:<設問id>'] = 点数` または `{ 欄ラベル: 点数 }`（欄ラベルは a/b/c・機器①・① など、解答例から自動生成される解答欄と同じ）。
- 問題データ … `apps/work/r*_pm*_q*.js`（`id` は `r7_pm1_q1` の形式、設問は `questions[].id`）。

弱点分析や「次に何をやるべきか」を聞かれたら、`_学習状況.md` → 該当問題の各回記録 → 必要なら `history.json` の順に見る。

## ルール
- `server/history.json`・`解答記録/` の記録・`server/.env`（APIキー）は **コミットしない**（.gitignore 済み。SSD で運ぶ）。
- `server/haiten.json` は **Git 管理**（消失防止）。配点を変えたらコミットする。
- IPA 過去問由来のデータ・画像（`apps/work/pages/`・`figs/`・`r*_pm*_q*.js`・`_pages.js`・`tmp/`）は再配布しない（push 対象外）。
- `history.json` / `haiten.json` を直接編集するときは、**ワーク演習のサーバを止めてから**行う（起動中はブラウザ側が書き戻すため競合する）。
  - `haiten.json` は起動時に「ブラウザ側を優先してマージ」される。ブラウザ側に既に値がある設問はファイルを書き換えても反映されないので、その場合は配点設定画面で直す。
- 改行コードは `.gitattributes` で固定（全体 LF、`.bat` のみ CRLF）。Windows と Mac で同じ作業ツリーを共有しているので変えないこと。

## 起動
- Windows：`ワーク演習を起動.bat`／Mac：`ワーク演習を起動.command`（どちらも `node server/relay.js` を起動してブラウザを開く）
- URL：`http://localhost:8787/apps/work.html`
- 詳細は `readme.md`・`server/README.md`。
