// GRE over IPsec：IPsec だけでは運べないマルチキャスト（OSPF）を GRE で包む【本書 Ch.15】
(() => {
  const RTA = '203.0.113.1';
  const RTB = '198.51.100.1';
  const TUNNEL = { 'rta-net': 'tunnel', 'net-rtb': 'tunnel' };

  const hello = ['OSPF Hello（元のパケット）', [
    ['送信元IP', '172.16.0.1', 'RT-A のトンネル IF'],
    ['宛先IP', '224.0.0.5', 'マルチキャスト'],
    ['プロトコル', '89', 'OSPF'],
  ]];
  const greOuter = proto => ['GRE用の外側IPヘッダ', [
    ['送信元IP', RTA, 'トンネルの始点'],
    ['宛先IP', RTB, 'トンネルの終点'],
    ['プロトコル', ...proto],
  ]];
  const greHeader = ['GREヘッダ（4バイト）', [['プロトコルタイプ', '0x0800', '中身は IPv4']]];

  SCENARIOS.push({
    id: 'gre',
    chapter: 15,
    title: 'GRE over IPsec',
    subtitle: 'IPsec VPN の上で OSPF を動かしたい。GRE で包んでから IPsec で暗号化する',
    nodes: {
      lana: { x: 60,  y: 125, name: '拠点A', kind: 'pc', lines: ['192.168.1.0/24'] },
      rta:  { x: 230, y: 125, name: 'RT-A', kind: 'rt', lines: [`外: ${RTA}`, 'Tunnel0: 172.16.0.1'] },
      net:  { x: 405, y: 125, name: 'インターネット', kind: 'cloud' },
      rtb:  { x: 580, y: 125, name: 'RT-B', kind: 'rt', lines: [`外: ${RTB}`, 'Tunnel0: 172.16.0.2'] },
      lanb: { x: 750, y: 125, name: '拠点B', kind: 'pc', lines: ['192.168.2.0/24'] },
    },
    links: [
      { a: 'lana', b: 'rta' },
      { a: 'rta', b: 'net' },
      { a: 'net', b: 'rtb' },
      { a: 'rtb', b: 'lanb' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>拠点 A と拠点 B を IPsec VPN でつないでいる。拠点が増えて経路の管理が大変になってきたので、VPN の上で <b>OSPF</b> を動かして経路を自動で交換したい。</p>
          <p>ところが IPsec（ポリシーベース）は<b>ユニキャストの IP パケット</b>しか運べず、OSPF が使う<b>マルチキャスト</b>（224.0.0.5）を通せない。</p>
          <p>そこで <b>GRE</b>（Generic Routing Encapsulation）で包んでユニキャストにし、それを IPsec で暗号化する（<b>GRE over IPsec</b>）。</p>`,
        links: TUNNEL,
      },
      {
        title: '① IPsec だけの場合',
        focus: 'rta', pkt: 'ctl', label: 'OSPF Hello', noCompare: true,
        desc: `<p>RT-A が OSPF Hello（宛先 224.0.0.5）を VPN の向こうに送ろうとする。しかし IPsec の暗号化対象（セキュリティポリシー）はユニキャストの拠点間通信だけなので、マルチキャストは<b>トンネルに入れられず破棄</b>される。</p>
          <p>OSPF の隣接関係が作れないので、経路を交換できない。</p>`,
        phases: [[['rta', 'net', { drop: true }]]],
        frame: [hello],
        links: TUNNEL,
      },
      {
        title: '② GRE で包む',
        focus: 'rta', pkt: 'ctl', label: 'GRE', noCompare: true,
        desc: `<p>RT-A と RT-B に<b>トンネルインタフェース</b>（Tunnel0）を作る。トンネルインタフェースに送られたパケットは、<b>GRE ヘッダと外側 IP ヘッダ</b>で包まれる。</p>
          <p>外側の宛先は RT-B の<b>ユニキャストアドレス</b>なので、中身がマルチキャストでも普通に運べる。OSPF から見ると、RT-A と RT-B が Tunnel0 で<b>直結</b>されているように見える。</p>
          <p>ただし GRE には<b>暗号化の機能がない</b>。このままインターネットに出すと中身が丸見え。</p>`,
        phases: [[['rta', 'net']]],
        frame: [greOuter(['47', 'GRE']), greHeader, hello],
        links: TUNNEL,
      },
      {
        title: '③ IPsec で暗号化',
        focus: 'rta', pkt: 'esp', label: 'ESP(GRE)', noCompare: true,
        desc: `<p>GRE で包んだパケット（RT-A → RT-B のユニキャスト）を、IPsec で暗号化する。GRE がすでに RT-A → RT-B の IP ヘッダを持っているので、IPsec は<b>トランスポートモード</b>にすることが多い（さらに IP ヘッダを足す必要がない）。</p>
          <p>右のフレームのとおり、<b>GRE ヘッダと OSPF パケット全体</b>が暗号化される。</p>`,
        phases: [[['rta', 'net']], [['net', 'rtb']]],
        frame: [
          ['IPヘッダ', [
            ['送信元IP', RTA],
            ['宛先IP', RTB],
            ['プロトコル', '50', 'ESP（トランスポートモード）'],
          ], 'plain'],
          ['ESPヘッダ', [['SPI', '0x00003001'], ['シーケンス番号', '1']], 'auth'],
          [greHeader[0], greHeader[1], 'enc'],
          [hello[0], hello[1], 'enc'],
          ['ESPトレーラ', [['次ヘッダ', '47', 'GRE']], 'enc'],
          ['ESP認証データ', [['ICV', 'HMAC 値']], 'plain'],
        ],
        links: TUNNEL,
      },
      {
        title: '④ OSPF で経路交換',
        focus: ['rta', 'rtb'], pkt: 'ctl', label: 'OSPF', noCompare: true,
        desc: `<p>RT-B で復号 → GRE を外すと OSPF Hello が出てくる。RT-A と RT-B は Tunnel0 経由で <b>OSPF の隣接関係</b>を作り、拠点の経路を交換する。</p>
          <p>拠点が増えても経路を自動で学習でき、回線が2本あれば OSPF のコストで<b>主回線・予備回線の切替</b>もできる。</p>`,
        phases: [[['rta', 'net'], ['rtb', 'net']], [['net', 'rtb'], ['net', 'rta']]],
        links: TUNNEL,
        side: {
          title: 'RT-A のルーティングテーブル（OSPF で学習）',
          head: ['宛先', 'ネクストホップ', '出力IF', '学習元'],
          rows: [['192.168.2.0/24', '172.16.0.2', 'Tunnel0', 'OSPF']],
          hit: 0,
        },
      },
      {
        title: 'まとめ',
        desc: `<p>ヘッダが増える分、<b>MTU が小さくなる</b>点に注意。GRE で 24 バイト（IP 20 ＋ GRE 4）、ESP でさらに数十バイト増えるので、トンネルインタフェースの MTU を下げたり、<b>TCP MSS を調整</b>（MSS クランプ）したりする。</p>
          <p>最近は、トンネルインタフェースに直接 IPsec を適用する<b>ルートベース VPN</b>（VTI）で同じことを実現する機器も多い。</p>`,
        side: {
          title: 'GRE と IPsec',
          head: ['', 'GRE', 'IPsec'],
          rows: [
            ['暗号化', 'できない', 'できる'],
            ['マルチキャスト・IP 以外', '運べる', '運べない（ポリシーベースの場合）'],
            ['プロトコル番号', '47', '50（ESP）/ 51（AH）'],
            ['組み合わせ', 'GRE で包む', '→ その GRE パケットを暗号化'],
          ],
        },
      },
    ],
  });
})();
