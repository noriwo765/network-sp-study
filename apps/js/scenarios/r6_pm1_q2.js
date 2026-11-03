// R6午後Ⅰ問2 SD-WANによる拠点接続：MPLS VPN の経路制御から、IPsec オーバーレイと BFD による切替えまで
(() => {
  const update = (prefix, path, note) => [
    ['TCP', [['宛先ポート', '179', 'BGP']]],
    ['BGP UPDATE', [
      ['NLRI', prefix],
      ['AS_PATH', path, note],
    ]],
  ];
  const espFrame = (src, dst, te) => [
    ['外側IPヘッダ', [
      ['送信元IP', src, `${te} 側`],
      ['宛先IP', dst],
      ['プロトコル', '50', 'ESP'],
    ], 'plain'],
    ['元のIPパケット', [
      ['送信元IP', '10.12.1.20', '本部PC'],
      ['宛先IP', '10.13.1.30', '店舗PC'],
    ], 'enc'],
  ];
  const teTable = hit => ({
    title: '本部 → 店舗で通過する TE',
    head: ['回線', '本部側', '店舗側', '使う場面'],
    rows: [
      ['閉域網', 'M-HB', 'M-BH', '通常時'],
      ['インターネット', 'I-HB', 'I-BH', '閉域網が使えないとき'],
    ],
    hit,
    foot: 'M＝閉域網側、I＝インターネット側。H＝本部、B＝店舗、D＝データセンター',
  });
  const sdwan = { dc: 'SD-WAN装置', hq: 'SD-WAN装置', br: 'SD-WAN装置' };
  const tunnels = { 'dc-mpls': 'tunnel', 'hq-mpls': 'tunnel', 'br-mpls': 'tunnel', 'dc-inet': 'tunnel', 'hq-inet': 'tunnel', 'br-inet': 'tunnel' };

  SCENARIOS.push({
    id: 'r6_pm1_q2',
    title: 'SD-WAN の導入',
    subtitle: 'MPLS VPN の経路制御から、IPsec オーバーレイと回線の切替えまでを追う',
    viewBox: '0 0 900 360',
    nodes: {
      ctrl:  { x: 450, y: 35,  name: 'SD-WAN制御', kind: 'sv' },
      inet:  { x: 450, y: 130, name: 'インターネット', kind: 'cloud' },
      mpls:  { x: 450, y: 280, name: 'MPLS VPN', kind: 'cloud', lines: ['AS64700'] },
      proxy: { x: 60,  y: 205, name: 'プロキシ', kind: 'sv', lines: ['DMZ'] },
      dc:    { x: 200, y: 205, name: 'DC-RT', kind: 'rt', lines: ['AS65010'] },
      hq:    { x: 680, y: 110, name: 'HQ-RT', kind: 'rt', lines: ['AS65010'], linesAbove: true },
      br:    { x: 680, y: 280, name: 'BR-RT', kind: 'rt', lines: ['AS65010'] },
      l3hq:  { x: 835, y: 110, name: '本部L3SW', kind: 'sw', lines: ['10.12.0.0/16'] },
      l3br:  { x: 835, y: 280, name: '店舗L3SW', kind: 'sw', lines: ['10.13.0.0/16'] },
    },
    links: [
      { a: 'proxy', b: 'dc' },
      { a: 'ctrl', b: 'inet' },
      { a: 'dc', b: 'inet' },
      { a: 'dc', b: 'mpls' },
      { a: 'hq', b: 'inet' },
      { a: 'hq', b: 'mpls' },
      { a: 'br', b: 'inet' },
      { a: 'br', b: 'mpls' },
      { a: 'hq', b: 'l3hq' },
      { a: 'br', b: 'l3br' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>小売チェーンの拠点を、通信事業者の <b>MPLS VPN</b> で結んでいる。事業者の PE と向き合う拠点のルータは <b>CE（カスタマーエッジ）</b>で、両者は AS をまたぐので <b>eBGP</b> で経路を交換する。</p>
          <p>顧客の AS 番号は、インターネットに出ない AS 用の<b>プライベート AS 番号</b>で、<b>全拠点が同じ</b>。拠点内は OSPF で動かす。</p>
          <p>今回は、拠点追加を楽にするため <b>SD-WAN</b> を入れて回線も冗長化する。</p>`,
        badges: { dc: 'CE', hq: 'CE', br: 'CE' },
        side: {
          title: '拠点のアドレスと AS 番号',
          head: ['拠点', 'アドレス', 'AS番号'],
          rows: [
            ['データセンター', '10.11.0.0/16', '65010'],
            ['本部', '10.12.0.0/16', '65010'],
            ['店舗', '10.13.0.0/16', '65010'],
          ],
          foot: '図では店舗を1つに絞って描いている',
        },
      },
      {
        title: '① as-override で同じ AS 番号を使う',
        focus: ['mpls', 'hq'],
        pkt: 'ctl',
        label: 'UPDATE',
        desc: `<p>店舗の経路が事業者を通って本部へ届く。BGP には、<b>AS_PATH に自分の番号があれば捨てる</b>ループ防止がある。</p>
          <p>そのままでは本部が 65010 を見つけて捨てるので、PE に <b>as-override</b> を設定し、顧客の番号を事業者の番号へ<b>置き換える</b>。経路の長さは変わらず、AS_PATH は <b>64700 64700</b> になる。</p>`,
        phases: [[['br', 'mpls']], [['mpls', 'hq']]],
        frame: update('10.13.0.0/16', '64700 64700', '65010 が 64700 に置換された'),
        side: {
          title: '本部ルータに届く店舗の経路',
          head: ['as-override', 'Prefix', 'AS_PATH', '本部の扱い'],
          rows: [
            ['なし', '10.13.0.0/16', '64700 65010', '捨てる'],
            ['あり', '10.13.0.0/16', '64700 64700', '受け取る'],
          ],
          hit: 1,
        },
      },
      {
        title: '② 再配布とループの防止',
        focus: 'hq',
        pkt: 'ctl',
        label: '経路',
        desc: `<p>拠点のルータは、OSPF と BGP4 の間で経路を<b>再配布</b>する。</p>
          <p>BGP から OSPF へ渡した経路が、また BGP へ戻らないように<b>経路フィルタ</b>を置く。防ぐのは<b>ルーティングループによる障害</b>。</p>`,
        phases: [[['hq', 'l3hq', { label: 'BGP→OSPF' }]], [['l3hq', 'hq', { label: '戻り', kind: 'arp', drop: true }]]],
        badges: { hq: 'フィルタ' },
        side: {
          title: '再配布の向き',
          head: ['向き', '扱い'],
          rows: [
            ['BGP で学んだ経路を OSPF へ', '渡す'],
            ['その経路を再び BGP へ', 'フィルタで止める'],
          ],
          hit: 1,
        },
      },
      {
        title: '③ DMZ の経路は Type5 LSA で届く',
        focus: 'br',
        pkt: 'ctl',
        label: '経路',
        desc: `<p>全拠点が Web を使えるよう、プロキシのある <b>DMZ のサブネット</b>の経路を配る。データセンターの OSPF → BGP → 店舗の OSPF と渡っていく。</p>
          <p><b>LSA は BGP を越えない</b>。店舗の L3SW に届くのは、<b>BR-RT が再配布のときに作った Type5（外部 LSA）</b>で、生成元はデータセンターではなく店舗のルータ。</p>`,
        phases: [
          [['proxy', 'dc', { label: 'OSPF' }]],
          [['dc', 'mpls', { label: 'BGP' }]],
          [['mpls', 'br', { label: 'BGP' }], ['mpls', 'hq', { label: 'BGP' }]],
          [['br', 'l3br', { label: 'Type5' }], ['hq', 'l3hq', { label: 'Type5' }]],
        ],
        frame: [
          ['IPv4ヘッダ', [['プロトコル', '89', 'OSPF']]],
          ['OSPF LSU', [
            ['LSA タイプ', '5', '外部 LSA'],
            ['対象の経路', '198.51.100.32/27', 'DMZ'],
            ['生成元', 'BR-RT', '店舗で再配布したルータ'],
          ]],
        ],
        badges: { br: 'Type5 生成', hq: 'Type5 生成' },
      },
      {
        title: '④ SD-WAN 装置とコントローラー',
        focus: 'ctrl',
        pkt: 'ctl',
        label: 'TLS',
        desc: `<p>拠点のルータを SD-WAN 装置に置き換え、各拠点にインターネット回線を足す。回線は<b>閉域網とインターネットの2本</b>になる。</p>
          <p>各装置はクラウドのコントローラーと <b>TLS</b> で保護された通信を行い、接続に使う情報を集める。設定は集中管理できる。</p>`,
        phases: [[['dc', 'inet'], ['hq', 'inet'], ['br', 'inet']], [['inet', 'ctrl']]],
        frame: [['TLS で保護', [['送信元', 'SD-WAN 装置'], ['宛先', 'コントローラー'], ['内容', 'オーバーレイに必要な情報']]]],
        badges: sdwan,
      },
      {
        title: '⑤ コントローラーが配る情報',
        focus: 'ctrl',
        pkt: 'ctl',
        label: '配布',
        desc: `<p>配るものは大きく2種類で、1つはオーバーレイの経路情報。もう1つが IPsec トンネルを作るための情報で、<b>確立に使う IP アドレス</b>と<b>確立に使う鍵情報</b>にあたる。</p>
          <p>記述では「IPsec トンネル確立のため」と目的まで書く。装置は VRF で制御用とデータ用のルーティングインスタンスを分けて持つ。</p>`,
        phases: [[['ctrl', 'inet']], [['inet', 'dc'], ['inet', 'hq'], ['inet', 'br']]],
        badges: sdwan,
        side: {
          title: 'コントローラーが配る情報',
          head: ['種類', '内容'],
          rows: [
            ['オーバーレイの経路', '接続ネットワークと TE の情報'],
            ['IPsec の確立用', 'IP アドレス'],
            ['IPsec の確立用', '鍵情報'],
          ],
          hit: [1, 2],
        },
      },
      {
        title: '⑥ 2種類のトンネルと BFD',
        focus: ['hq', 'br'],
        pkt: 'ctl',
        label: 'BFD',
        desc: `<p>拠点の組ごとに<b>閉域網とインターネットの両方</b>で IPsec トンネルを張る。端点が <b>TE</b>。トンネルはすべての拠点間に直接張るので、拠点間通信はデータセンターを経由しない。</p>
          <p>トンネルインタフェースで <b>BFD</b> を有効にする。目的は <b>IPsec トンネルの障害を高速に検出する</b>こと。</p>`,
        phases: [[['hq', 'mpls'], ['br', 'mpls'], ['hq', 'inet'], ['br', 'inet']], [['mpls', 'br'], ['mpls', 'hq'], ['inet', 'br'], ['inet', 'hq']]],
        links: tunnels,
        badges: sdwan,
        side: teTable(),
      },
      {
        title: '⑦ 通常時は閉域網のトンネル',
        focus: ['hq', 'br'],
        pkt: 'esp',
        label: 'ESP',
        desc: `<p>本部の PC から店舗の PC へ送る。方針どおり閉域網を優先するので、通過する TE は <b>M-HB と M-BH</b> の2つ。</p>
          <p>このように、定めた方針に沿ってアプリケーションごとに道を選ぶ制御を<b>ポリシーベースルーティング</b>という。</p>`,
        phases: [[['l3hq', 'hq', { label: 'IP', kind: 'ip' }]], [['hq', 'mpls']], [['mpls', 'br']], [['br', 'l3br', { label: 'IP', kind: 'ip' }]]],
        frame: espFrame('172.30.2.1', '172.30.3.1', 'M-HB'),
        links: { 'hq-mpls': 'tunnel', 'br-mpls': 'tunnel' },
        badges: sdwan,
        side: teTable(0),
      },
      {
        title: '⑧ 店舗の閉域網回線が故障',
        focus: 'br',
        pkt: 'ctl',
        label: 'BFD',
        desc: `<p>店舗側の閉域網回線だけが切れた。本部側の回線は正常でも、<b>このトンネルは端点の片方を失うので使えない</b>。</p>
          <p>BFD の応答が途絶えることで、経路プロトコルのタイマーを待たずに障害を<b>高速に検出</b>できる。</p>`,
        phases: [[['hq', 'mpls']], [['mpls', 'br', { drop: true }]]],
        links: { 'br-mpls': 'down', 'hq-mpls': 'tunnel', 'hq-inet': 'tunnel', 'br-inet': 'tunnel' },
        badges: { br: 'TE 断', hq: 'SD-WAN装置' },
        side: teTable(0),
      },
      {
        title: '⑨ インターネットのトンネルへ切替え',
        focus: ['hq', 'br'],
        pkt: 'esp',
        label: 'ESP',
        desc: `<p>本部から店舗への通信は、インターネット側のトンネルへ移る。通過する TE は <b>I-HB と I-BH</b> の2つ。</p>
          <p>トンネルは同じ網の端点どうしで張っているので、<b>両端が一緒に切り替わる</b>。「本部は閉域網、店舗はインターネット」という組合せにはならない。</p>`,
        phases: [[['l3hq', 'hq', { label: 'IP', kind: 'ip' }]], [['hq', 'inet']], [['inet', 'br']], [['br', 'l3br', { label: 'IP', kind: 'ip' }]]],
        frame: espFrame('203.0.113.2', '203.0.113.3', 'I-HB'),
        links: { 'br-mpls': 'down', 'hq-inet': 'tunnel', 'br-inet': 'tunnel' },
        badges: sdwan,
        nodes: { br: 'done' },
        side: teTable(1),
      },
    ],
  });
})();
