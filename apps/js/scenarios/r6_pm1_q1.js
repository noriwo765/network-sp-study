// R6午後Ⅰ問1 コンテンツ配信ネットワーク：LB の振分け、BGP anycast、DDoS を入口で捨てる RTBH と Flowspec
(() => {
  const updateFrame = (prefix, path, note) => [
    ['TCP', [['宛先ポート', '179', 'BGP']]],
    ['BGP UPDATE', [
      ['NLRI', prefix],
      ['AS_PATH', path, note],
    ]],
  ];
  const fromIsp = hit => ({
    title: 'ISP が持つ、配信アドレス宛ての経路',
    head: ['経路', 'AS_PATH', '長さ'],
    rows: [
      ['IX 経由', '64601', '1'],
      ['中継ISP 経由', '64602 64601', '2'],
    ],
    hit,
    foot: 'IX は L2 の接続点なので AS_PATH に載らない',
  });
  const fromPop = {
    title: '札幌POP が持つ、ISP 宛ての経路',
    head: ['経路', 'AS_PATH', '長さ'],
    rows: [
      ['IX 経由', '64603', '1'],
      ['中継ISP 経由', '64602 64603', '2'],
    ],
    hit: 0,
  };
  const attrs = {
    title: 'BGP の属性：どちらを優先するか',
    head: ['属性', '優先する値'],
    rows: [
      ['LOCAL_PREF', '大きい'],
      ['AS_PATH', '短い'],
      ['MED', '小さい'],
    ],
    hit: 1,
    foot: 'この会社では LOCAL_PREF と MED が効かない設定なので、AS_PATH の長さで決まる',
  };

  SCENARIOS.push({
    id: 'r6_pm1_q1',
    title: 'CDN と DDoS 対策',
    subtitle: 'LB の振分けから anycast、攻撃を入口で捨てるまでを追う',
    viewBox: '0 0 900 380',
    nodes: {
      bot:   { x: 190, y: 50,  name: '攻撃元', kind: 'pc' },
      term:  { x: 60,  y: 190, name: '利用者端末', kind: 'pc', lines: ['192.0.2.50'] },
      isp:   { x: 190, y: 190, name: 'ISP', kind: 'cloud', lines: ['AS64603'] },
      trans: { x: 350, y: 70,  name: '中継ISP', kind: 'cloud', lines: ['AS64602'] },
      ix:    { x: 350, y: 300, name: 'IX', kind: 'sw' },
      pop2:  { x: 520, y: 45,  name: 'ソウルPOP', kind: 'rt', lines: ['AS64601'] },
      pop1:  { x: 520, y: 190, name: '札幌POP', kind: 'rt', lines: ['AS64601'] },
      det:   { x: 650, y: 310, name: 'DDoS検知', kind: 'sv' },
      fw:    { x: 650, y: 190, name: 'FW', kind: 'fw' },
      lb:    { x: 760, y: 190, name: 'LB', kind: 'sw', lines: ['198.51.100.40'] },
      sv1:   { x: 855, y: 110, name: '配信1', kind: 'sv' },
      sv2:   { x: 855, y: 270, name: '配信2', kind: 'sv' },
    },
    links: [
      { a: 'term', b: 'isp' },
      { a: 'isp', b: 'trans' },
      { a: 'isp', b: 'ix' },
      { a: 'bot', b: 'trans' },
      { a: 'trans', b: 'pop2' },
      { a: 'trans', b: 'pop1' },
      { a: 'ix', b: 'pop1' },
      { a: 'pop1', b: 'fw' },
      { a: 'pop1', b: 'det' },
      { a: 'fw', b: 'lb' },
      { a: 'lb', b: 'sv1' },
      { a: 'lb', b: 'sv2' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>動画教材の配信会社が、自社の配信を <b>CDN</b> へ移す。CDN は同じアドレスを札幌とソウルの2拠点（POP）から出している。</p>
          <p>この図では、自社データセンターと POP に共通する「<b>LB → 配信サーバ</b>」の構造を1つにまとめて描く。</p>
          <p>追う順番は <b>LB の振分け → BGP による拠点選び → 経路の安全対策 → DDoS を入口で捨てる</b>。</p>`,
        badges: { pop1: 'POP', pop2: 'POP' },
      },
      {
        title: '① LB が TLS を終端して振り分ける',
        focus: 'lb',
        pkt: 'ip',
        label: 'HTTP',
        desc: `<p>端末からは HTTPS、LB から先は平文の HTTP。TLS を終端するのは LB なので、<b>サーバ証明書が必ず要るのは LB</b>。</p>
          <p>配るファイルの大きさがまちまちで接続時間がばらつくため、<b>最少接続数方式</b>を選ぶ。順番に配るラウンドロビンでは、長い接続が1台にたまっても気づかない。</p>
          <p>サーバは講座ごとに別セグメント。講座Bを強化するなら、<b>講座Bのセグメントへ足す</b>。</p>`,
        phases: [[['fw', 'lb', { label: 'HTTPS' }]], [['lb', 'sv1']]],
        frame: [
          ['LB より手前', [['プロトコル', 'HTTPS', 'ポート443'], ['URL', 'https://b.video.example/', '講座Bの例']]],
          ['LB より奥', [['プロトコル', 'HTTP', 'ポート80'], ['送信先', '10.32.1.0/24 のサーバ', '講座Bのセグメント']]],
        ],
        links: { 'lb-sv1': 'path' },
        side: {
          title: 'LB から見た接続数',
          head: ['サーバ', '今の接続数', '振分け'],
          rows: [['配信1', '12', '○'], ['配信2', '30', '—']],
          hit: 0,
          foot: '講座A 10.31.1.0/24・講座B 10.32.1.0/24・講座C 10.33.1.0/24',
        },
      },
      {
        title: '② HTTP で死活を確かめる',
        focus: ['lb', 'sv2'],
        pkt: 'ctl',
        label: 'ICMP',
        desc: `<p>配信2の HTTP プロセスだけが落ちた。OS は動いているので <b>ICMP Echo には応答する</b>。</p>
          <p>ping で監視していると「生きている」と判断してしまい、<b>HTTP が止まっている状態を検知できない</b>。そのため LB は HTTP でアクセスして確かめ、応答できないサーバへは振り分けない。</p>`,
        phases: [
          [['lb', 'sv2']],
          [['sv2', 'lb', { label: '応答' }]],
          [['lb', 'sv2', { label: 'HTTP', kind: 'ip', drop: true }]],
        ],
        badges: { sv2: 'HTTP停止' },
        side: {
          title: '監視の方法と結果',
          head: ['監視', '配信2の結果', '故障に気づくか'],
          rows: [['ICMP Echo', '応答あり', '気づかない'], ['HTTP', '応答なし', '気づく']],
          hit: 1,
        },
      },
      {
        title: '③ 同じアドレスを2拠点から広告する',
        focus: ['pop1', 'pop2'],
        pkt: 'ctl',
        label: 'UPDATE',
        desc: `<p><b>BGP anycast</b> では、札幌とソウルが<b>同じアドレスブロックを同じ AS 番号</b>で広告する。2拠点は直接つながっていない。</p>
          <p>中継ISP は両 POP から経路を受け、1本を選んで ISP へ流す。ISP には IX 経由と中継ISP 経由の2本が届く。</p>`,
        phases: [
          [['pop1', 'ix'], ['pop1', 'trans'], ['pop2', 'trans']],
          [['ix', 'isp'], ['trans', 'isp']],
        ],
        frame: updateFrame('198.51.100.0/24', '64601', 'CDN の AS 番号'),
        side: fromIsp(0),
      },
      {
        title: '④ 端末のリクエストは近い POP へ',
        focus: 'term',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>端末は宛先のアドレスへ送るだけで、どの拠点かを意識しない。<b>どの POP へ着くかは、途中の AS の経路選択で決まる</b>。</p>
          <p>ここでは ISP が AS_PATH の短い IX 経由を選び、札幌POP へ届く。</p>`,
        phases: [[['term', 'isp']], [['isp', 'ix']], [['ix', 'pop1']], [['pop1', 'fw']], [['fw', 'lb']]],
        frame: [['IPv4ヘッダ', [['送信元IP', '192.0.2.50'], ['宛先IP', '198.51.100.40', 'anycast のアドレス']]]],
        links: { 'isp-ix': 'path', 'ix-pop1': 'path' },
        side: fromIsp(0),
      },
      {
        title: '⑤ 下りの経路は AS_PATH で決まる',
        focus: 'pop1',
        pkt: 'ip',
        label: '配信',
        desc: `<p>下りの通信は、リクエストが来た道ではなく、<b>POP 側の経路表</b>で決まる。</p>
          <p><b>LOCAL_PREF は大きい方、MED は小さい方</b>を優先する。どちらも効かない設定なので比べるのは AS_PATH の長さで、IX 経由の1に対し、中継ISP 経由は2。下りは <b>IX</b> を通る。</p>`,
        phases: [[['pop1', 'ix']], [['ix', 'isp']], [['isp', 'term']]],
        frame: [['IPv4ヘッダ', [['送信元IP', '198.51.100.40'], ['宛先IP', '192.0.2.50', 'ISP のブロック宛て']]]],
        links: { 'ix-pop1': 'path', 'isp-ix': 'path' },
        side: [fromPop, attrs],
      },
      {
        title: '⑥ 不正な接続と不正な経路を防ぐ',
        focus: 'pop1',
        pkt: 'arp',
        label: '偽の経路',
        desc: `<p>隣接ルータとの <b>MD5 認証</b>は、パスワードを知らない相手との<b>不正な BGP 接続</b>を防ぐ。</p>
          <p><b>経路フィルタ</b>は、アドレスブロックや AS 番号を偽った経路を受け取らないためのもの。受け取った経路は<b>自分から出ていく通信</b>の向きを変えるので、取り込むと<b>そのブロック宛てへ配信できなくなる</b>。向きを逆に考えない。</p>`,
        phases: [[['trans', 'pop1', { drop: true }]]],
        frame: updateFrame('192.0.2.0/24', '64999', '正しい持ち主ではない AS'),
        badges: { pop1: 'フィルタ' },
        side: {
          title: '対策と防ぐもの',
          head: ['対策', '防ぐもの'],
          rows: [['MD5 認証', '不正な BGP 接続'], ['経路フィルタ', '偽の経路の取込み']],
        },
      },
      {
        title: '⑦ DDoS：FW まで届いてしまう',
        focus: ['pop1', 'det'],
        pkt: 'arp',
        label: '攻撃',
        desc: `<p>多数の送信元から LB へ HTTPS の大量攻撃が来る。FW で止めても、<b>そこまでの回線とルータは攻撃で圧迫されたまま</b>。</p>
          <p>BGP ルータは流入した通信のアドレスやポート番号を <b>NetFlow</b> で検知サーバへ送り、検知サーバが攻撃の有無と宛先アドレスを判断する。</p>`,
        phases: [
          [['bot', 'trans']],
          [['trans', 'pop1']],
          [['pop1', 'fw', { drop: true }], ['pop1', 'det', { label: 'NetFlow', kind: 'ctl' }]],
        ],
        frame: [['NetFlow の情報', [['宛先IP', '198.51.100.40', '攻撃先'], ['宛先ポート', '443'], ['送信元IP', '多数']]]],
        links: { 'trans-pop1': 'hit', 'pop1-fw': 'hit' },
        badges: { fw: '混雑', lb: '攻撃先' },
      },
      {
        title: '⑧ RTBH：入口の BGP ルータで捨てる',
        focus: ['det', 'pop1'],
        pkt: 'arp',
        label: '攻撃',
        desc: `<p>検知サーバが攻撃先への<b>ホスト経路（/32）</b>を作り、RTBH の印となる BGP コミュニティを付けて iBGP で配る。受けたルータは、その経路のネクストホップを<b>廃棄用インタフェース</b>にする。</p>
          <p>FW で止める方式と比べた長所は、<b>攻撃パケットを攻撃元に近い場所で止められる</b>こと。</p>
          <p>ただし宛先だけで判断するので、<b>同じアドレス宛ての正規の通信も一緒に捨てる</b>。</p>`,
        phases: [
          [['det', 'pop1', { label: 'iBGP', kind: 'ctl' }]],
          [['bot', 'trans'], ['isp', 'ix', { label: '正規', kind: 'ip' }]],
          [['trans', 'pop1', { drop: true }], ['ix', 'pop1', { label: '正規', kind: 'ip', drop: true }]],
        ],
        frame: [['BGP UPDATE', [
          ['NLRI', '198.51.100.40/32', '攻撃先のホスト経路'],
          ['コミュニティ', 'RTBH の印'],
          ['受信後のネクストホップ', '廃棄用インタフェース'],
        ]]],
        badges: { pop1: 'ここで廃棄' },
      },
      {
        title: '⑨ Flowspec：攻撃だけを捨てる',
        focus: 'pop1',
        pkt: 'arp',
        label: '攻撃',
        desc: `<p><b>BGP Flowspec</b> は宛先だけでなく、<b>送信元アドレスや宛先ポート番号も組み合わせて</b>ルータへ配れる。</p>
          <p>RTBH と比べた長所は、<b>より細かい条件で選別して捨てられる</b>こと。攻撃だけを捨て、同じ宛先への正規の通信はそのまま通せる。</p>`,
        phases: [
          [['bot', 'trans'], ['isp', 'ix', { label: '正規', kind: 'ip' }]],
          [['trans', 'pop1', { drop: true }], ['ix', 'pop1', { label: '正規', kind: 'ip' }]],
          [['pop1', 'fw', { label: '正規', kind: 'ip' }]],
          [['fw', 'lb', { label: '正規', kind: 'ip' }]],
        ],
        links: { 'ix-pop1': 'path', 'pop1-fw': 'path', 'fw-lb': 'path' },
        badges: { pop1: '条件で選別' },
        side: {
          title: '捨てる条件の比較',
          head: ['方式', '指定できる条件', '正規の通信'],
          rows: [['RTBH', '宛先アドレス', '一緒に捨てる'], ['Flowspec', '宛先・送信元・ポートなど', '通せる']],
          hit: 1,
        },
      },
    ],
  });
})();
