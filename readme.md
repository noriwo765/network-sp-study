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
直近3年（令和5〜7年）の午後問題を解いて **Claude に採点**してもらえる（[apps/work.html](apps/work.html)）。API キーを持つ中継サーバが必要：
```
node server/relay.js
```
を実行し、`http://localhost:8787/apps/work.html` を開く。準備は [server/README.md](server/README.md)。
