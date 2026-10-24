# apps — 教材（Webアプリ）

ブラウザで問題を解いて練習するためのアプリ。`index.html` がメニュー。

| ページ | 内容 |
|-------|------|
| terms.html | 単語カード（データ：[flashcards/terms.js](../flashcards/terms.js)）。覚えた／まだの仕分け、一覧・検索 |
| compare.html | 紛らわしい用語の比較（データ：[flashcards/compare.js](../flashcards/compare.js)）。比較表と見分けるポイント、隠して自己テスト |
| ports.html | ポート番号（データ：[flashcards/ports.js](../flashcards/ports.js)）。一覧・検索、その他の番号、4択の暗記テスト |
| check.html | 理解度チェック（データ：[quizzes/check.js](../quizzes/check.js)）。章ごとの4択、正答率の記録、間違えた問題の復習 |
| work.html | ワーク演習（AI採点）。直近3年の午後問題（記述式）を解き、Claude が採点。データ：[work/](work/)。**[中継サーバ](../server/)が必要** |
| packet-flow.html | アニメーション |
| drills.html | 計算ドリル |

学習記録（覚えた単語・正誤）はその端末のブラウザ（localStorage）に保存される。

## 使い方
- **パソコン**：`index.html` をダブルクリックしてブラウザで開く（サーバ・インストール不要）
- **iPhone / iPad**：GitHub Pages で公開した URL を Safari で開き、「共有 → ホーム画面に追加」。一度開けば以降は**電波がなくても動く**（Service Worker が全ファイルを端末に保存する）

## ワーク演習（work.html）— AI採点（CBT形式・ローカル専用）
直近3年（令和5〜7年）の午後Ⅰ・午後Ⅱ（記述式）を1問ずつ解き、**Claude に採点**してもらう。本番の CBT を想定した**2ペイン**（左＝実際の試験ページ画像／右＝解答欄）。

- **実問題を表示**：IPA 公開問題を描画したページ画像（[work/pages/](work/pages/)、グレースケールJPEG）を左に表示。下線①や空欄など原文の書式がそのまま見える。「文字版」への切替・拡大縮小も可。
- **タイマー**：経過時間と目安（午後Ⅰ=45分/問・午後Ⅱ=120分/問）、一時停止・時間リセット。
- **やり直し**：入力中の解答と時間を消して再挑戦（採点履歴は残る）。
- **採点**：判定・加点できる点・不足／誤り・解答例との差分・アドバイス・模範解答。採点基準は公式「解答例」。
- **保存**：解答・**採点履歴**・時間はすべてその端末（localStorage）に保存。

**このアプリはローカル専用**。採点には API キーを持つ中継サーバが要る（ブラウザに直接キーを置くと漏れるため）。公開用オフラインPWA（sw.js）には含めない。起動は [server/README.md](../server/README.md)：
```
node server/relay.js      # http://localhost:8787/apps/work.html を開く
```
問題データ（本文・解答例・図）の構造は [work/README.md](work/README.md) を参照。

## 計算ドリル（drills.html）
問題は毎回ランダムに生成される。【 】は [ジャンル一覧](../docs/ジャンル一覧.md) のサブトピック番号。

| ドリル | 内容 |
|-------|------|
| サブネット計算【2-6】 | マスク・ネットワーク・ブロードキャスト・ホスト数 |
| ロンゲストマッチ【4-1】 | ルーティングテーブルからネクストホップを選ぶ |
| 経路集約【4-3】 | 連続する /24 を集約 |
| フラグメント計算【2-4】 | 最大データ長・フラグメント数・オフセット値 |

## アニメーション（packet-flow.html）

構成図の上をパケットが動き、ステップごとにフレームの中身・各種テーブルを表示する。IPv4 / TCP / UDP は RFC 風の 32 ビット幅ヘッダ図でも表示し、前のパケットから変わったフィールドを点滅で示す。予想モード（値を隠してクリックで答え合わせ）あり。

並び（縦軸）は学習に使う本（［左門式ネスペ塾］ネスペ「ワークブック」）の章立てに合わせている。章ごとの対応と進捗は [学習計画](../docs/学習計画.md) を参照。

| 章 | シナリオ |
|----|---------|
| 1 LANとIPアドレス | VLAN |
| 2 LANの冗長化 | STP |
| 3 MACアドレスとARP | パケットの旅、ARPスプーフィング |
| 4 DHCP | DHCP |
| 5 DNS | DNS |
| 6 TCPとHTTP、DoS攻撃 | TCP、3ウェイハンドシェイク、ヘッダの書き換え、IPフラグメント、DoS攻撃 |
| 7 メール | 電子メール |
| 8 ファイアウォール、IPS、WAF | ステートフルFW、NAPT |
| 9 無線LAN | 802.1X |
| 10 音声とVoIP | VoIP（SIP/RTP） |
| 11 ルーティング | OSPF、BGP、traceroute |
| 12 VRRP | VRRP |
| 13 WAN | IP-VPN（MPLS） |
| 14 負荷分散装置 | 負荷分散装置 |
| 15 IPsecとGRE | IPsec VPN、GRE over IPsec |
| 16 SDN | SDN（OpenFlow）、VXLAN |
| 17 セキュリティ | TLS 1.3 |
| 18 プロキシサーバ | プロキシサーバ |
| 19 ネットワーク管理 | SNMP |

URL末尾に `#bgp/4` のように付けると、そのシナリオ・ステップから開く。

## 構成
```
apps/
├── index.html          … メニュー
├── drills.html         … 計算ドリル（タブ切替）
├── terms.html          … 単語カード
├── check.html          … 理解度チェック
├── compare.html        … 紛らわしい用語の比較
├── ports.html          … ポート番号
├── work.html           … ワーク演習（AI採点）
├── work/               … ワーク演習の問題データ（1問1ファイル）、図（figs/）、実問題ページ画像（pages/）、ページ一覧（_pages.js）
├── packet-flow.html    … アニメーション
├── manifest.webmanifest … ホーム画面に追加したときのアプリ情報
├── sw.js               … オフライン対応（Service Worker）
├── icons/              … アプリのアイコン
├── tools/check.js      … データ整合性チェック
├── css/
│   ├── style.css       … 共通の見た目（ライト/ダーク対応）
│   ├── flow.css        … アニメーション用
│   └── study.css       … メニュー・単語カード・理解度チェック用
└── js/
    ├── book.js         … 本の章立て（全アプリの縦軸）
    ├── study.js        … 学習記録の保存・章ボタン（単語カード・理解度チェック共通）
    ├── terms-app.js    … 単語カード
    ├── check-app.js    … 理解度チェック
    ├── compare-app.js  … 紛らわしい用語の比較
    ├── ports-app.js    … ポート番号
    ├── work-app.js     … ワーク演習（AI採点）

    ├── common.js       … IP計算などの共通処理と、ドリル画面の組み立て
    ├── drills.js       … 各ドリルの問題生成・正解・解説
    ├── flow-engine.js  … アニメーションの描画・再生エンジン
    ├── pwa.js          … Service Worker の登録
    └── scenarios/      … アニメーションのシナリオ（1ファイル1シナリオ）
```

## シナリオの追加方法
`js/scenarios/` にファイルを作って `SCENARIOS.push({...})`（`chapter` に本の章番号）し、`packet-flow.html` に `<script>` を1行追加する。
シナリオの書式は `js/flow-engine.js` 冒頭のコメントを参照。

## ドリルの追加方法
`js/drills.js` に `DRILLS.push({ id, title, desc, newProblem() })` を追記する。
`newProblem()` は `{ question, fields: [{ label, answer, type }], explain }` を返す（`type` は `num` / `ip` / `text`）。
外部ライブラリは使わない（`file://` で開いても動くようにするため）。

## 変更したら
```
node apps/tools/check.js
```
シナリオの参照ミスと、`sw.js` のキャッシュ対象の漏れを検出する。ファイルを追加・変更して公開するときは `sw.js` の `VERSION` を上げる（上げないと、端末に保存済みの古い版が使われ続けることがある）。
