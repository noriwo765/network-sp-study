# apps — 教材（Webアプリ）

ブラウザで問題を解いて練習するためのアプリ。

## 使い方
`index.html` をダブルクリックしてブラウザで開く（サーバ・インストール不要、オフラインで動作）。

## 収録ドリル
問題は毎回ランダムに生成される。【 】は [ジャンル一覧](../docs/ジャンル一覧.md) のサブトピック番号。

| ドリル | 内容 |
|-------|------|
| サブネット計算【2-6】 | マスク・ネットワーク・ブロードキャスト・ホスト数 |
| ロンゲストマッチ【4-1】 | ルーティングテーブルからネクストホップを選ぶ |
| 経路集約【4-3】 | 連続する /24 を集約 |
| フラグメント計算【2-4】 | 最大データ長・フラグメント数・オフセット値 |

## アニメーション（packet-flow.html）

構成図の上をパケットが動き、ステップごとにフレームの中身・各種テーブルを表示する。予想モード（値を隠してクリックで答え合わせ）あり。

並び（縦軸）は学習に使う本（［左門式ネスペ塾］ネスペ「ワークブック」）の章立てに合わせている。章ごとの対応と進捗は [学習計画](../docs/学習計画.md) を参照。

| 章 | シナリオ |
|----|---------|
| 1 LANとIPアドレス | VLAN |
| 2 LANの冗長化 | STP |
| 3 MACアドレスとARP | パケットの旅、ARPスプーフィング |
| 4 DHCP | DHCP |
| 5 DNS | DNS |
| 6 TCPとHTTP、DoS攻撃 | TCP、DoS攻撃 |
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
├── index.html          … 計算ドリル（タブ切替）
├── packet-flow.html    … アニメーション
├── css/
│   ├── style.css       … 共通の見た目（ライト/ダーク対応）
│   └── flow.css        … アニメーション用
└── js/
    ├── common.js       … IP計算などの共通処理と、ドリル画面の組み立て
    ├── drills.js       … 各ドリルの問題生成・正解・解説
    ├── flow-engine.js  … アニメーションの描画・再生エンジン
    └── scenarios/      … アニメーションのシナリオ（1ファイル1シナリオ）
```

## シナリオの追加方法
`js/scenarios/` にファイルを作って `SCENARIOS.push({...})`（`chapter` に本の章番号）し、`packet-flow.html` に `<script>` を1行追加する。
シナリオの書式は `js/flow-engine.js` 冒頭のコメントを参照。

## ドリルの追加方法
`js/drills.js` に `DRILLS.push({ id, title, desc, newProblem() })` を追記する。
`newProblem()` は `{ question, fields: [{ label, answer, type }], explain }` を返す（`type` は `num` / `ip` / `text`）。
外部ライブラリは使わない（`file://` で開いても動くようにするため）。
