# ネットワークスペシャリスト 学習教材

重点強化：**ルーティング／IPヘッダ／セキュリティ**

## フォルダ構成

| フォルダ | 内容 |
|---------|------|
| [docs/](docs/) | ドキュメント（ジャンル一覧、学習計画） |
| [flashcards/](flashcards/) | 単語集／一問一答 |
| [quizzes/](quizzes/) | 理解度テスト |
| [apps/](apps/) | 教材（Webアプリ） |
| [server/](server/) | ワーク演習のAI採点 中継サーバ（Node） |

## スマホで使う
公開URL：**https://noriwo765.github.io/network-sp-study/**

iPhone / iPad の Safari で開いて「共有 → ホーム画面に追加」する。一度開けばオフラインでも動く。

## 進め方
本（［左門式ネスペ塾］ネスペ「ワークブック」）の章に沿って学習し、章ごとにアプリで動作を確認する。詳しくは [学習計画](docs/学習計画.md)。

1. [重点3ジャンル診断テスト](quizzes/重点3ジャンル診断テスト.md)で苦手を把握する
2. 本の章を読む → [アニメーション](apps/packet-flow.html)で同じ章を予想モードで確認 → 本の演習
3. 気づき・アプリの誤りを学習計画のメモ欄に書き、アプリを修正・追加していく

## ワーク演習（記述式・AI採点）
令和4〜7年の午後問題を解いて **Claude に採点**してもらえる（[apps/work.html](apps/work.html)）。API キーを持つ中継サーバが必要。

かんたん起動（ダブルクリック）：
- **Windows**：`ワーク演習を起動.bat`
- **Mac**：`ワーク演習を起動.command`

直接コマンドでも起動できる：
```
node server/relay.js
```
を実行し、`http://localhost:8787/apps/work.html` を開く。準備は [server/README.md](server/README.md)。

AI 採点するたびに、その時点のスナップショット（解答・採点・模範解答）が Markdown で [解答記録/](解答記録/) に保存される。問題ごとのフォルダに日時つきで**回ごとに別ファイル**として残るので、何周しても上書きされない（見返し用。個人データなので Git 管理外）。

> このフォルダは SSD に置いて Windows と MacBook で持ち運んで使う。学習記録（`server/history.json`・`解答記録/`）、配点（`server/haiten.json`）、APIキー（`server/.env`）はすべてフォルダ内にあるので SSD ごと移動し、どちらのマシンでも同じ記録の続きから使える。抜く前はブラウザのタブを閉じてからサーバを Ctrl+C で止める。詳細は [server/README.md](server/README.md#ssd-で-windows-と-mac-を行き来する)。Claude Code 向けの共有メモは [CLAUDE.md](CLAUDE.md)。
