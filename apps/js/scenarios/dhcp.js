// DHCP：複数のクライアントと複数の VLAN、DHCP リレーエージェント【本書 Ch.4】
(() => {
  const SRV = '10.0.0.5';
  const GW10 = '192.168.10.1';
  const GW20 = '192.168.20.1';
  const CL = {
    a: { mac: '02:00:00:00:00:0a', name: 'PC-A', xid: '0x3903f326' },
    b: { mac: '02:00:00:00:00:0b', name: 'PC-B', xid: '0x7a11c0de' },
    c: { mac: '02:00:00:00:00:0c', name: 'PC-C', xid: '0x55e2b801' },
  };

  // 同じ項目名で並べ、区間やクライアントの違いが「変化」として出るようにする
  function frame({ src, dst, sport, dport, msg, cl, yiaddr = '0.0.0.0', giaddr = '0.0.0.0', opts = '-' }) {
    return [
      ['IPv4ヘッダ', [['送信元IP', ...src], ['宛先IP', ...dst]]],
      ['UDPヘッダ', [['送信元ポート', sport], ['宛先ポート', dport]]],
      ['DHCP', [
        ['メッセージ', msg],
        ['xid', cl.xid, 'トランザクションID（やり取りの識別）'],
        ['chaddr', cl.mac, `${cl.name} の MAC アドレス`],
        ['yiaddr', yiaddr, '割り当てるIP'],
        ['giaddr', giaddr, 'リレーエージェントのアドレス'],
        ['オプション', opts],
      ]],
    ];
  }
  const BC = ['255.255.255.255', 'ブロードキャスト'];
  const NONE = ['0.0.0.0', 'アドレスなし'];
  const opts = gw => `マスク 255.255.255.0 / ルータ ${gw} / DNS 10.0.0.53 / リース 86400秒`;

  const leases = (rows, hit) => ({
    title: 'DHCP サーバの割り当て状況',
    head: ['IP アドレス', 'MAC アドレス', 'スコープ'],
    rows: rows.length ? rows : [['（なし）', '', '']],
    hit,
  });
  const LA = ['192.168.10.100', '…:00:0a（PC-A）', 'VLAN10'];
  const LB = ['192.168.10.101', '…:00:0b（PC-B）', 'VLAN10'];
  const LC = ['192.168.20.100', '…:00:0c（PC-C）', 'VLAN20'];
  const scopes = hit => ({
    title: 'DHCP サーバのスコープ（giaddr で選ぶ）',
    head: ['スコープ', '範囲', 'ルータ'],
    rows: [['192.168.10.0/24', '.100〜.199', GW10], ['192.168.20.0/24', '.100〜.199', GW20]],
    hit,
  });

  // L2SW 経由の上り・下り（a: クライアント id）
  const up = (c, label, extra = []) => [[[c, 'sw', { label }]], [['sw', 'l3', { label }], ...extra], [['l3', 'srv', { label }]]];
  const down = (c, label) => [[['srv', 'l3', { label }]], [['l3', 'sw', { label }]], [['sw', c, { label }]]];

  SCENARIOS.push({
    id: 'dhcp',
    chapter: 4,
    title: 'DHCP',
    subtitle: '複数の VLAN・複数の端末に、1台の DHCP サーバからリレー経由でアドレスを配る',
    viewBox: '0 0 810 280',
    nodes: {
      a:   { x: 60,  y: 45,  name: 'PC-A', kind: 'pc', lines: ['VLAN10'] },
      b:   { x: 60,  y: 140, name: 'PC-B', kind: 'pc', lines: ['VLAN10'] },
      c:   { x: 60,  y: 235, name: 'PC-C', kind: 'pc', lines: ['VLAN20'] },
      sw:  { x: 230, y: 140, name: 'L2SW', kind: 'sw' },
      l3:  { x: 440, y: 140, name: 'L3SW', kind: 'rt', lines: [`VLAN10: ${GW10}`, `VLAN20: ${GW20}`, 'DHCP リレー'] },
      srv: { x: 710, y: 140, name: 'DHCP', kind: 'sv', lines: [SRV] },
    },
    links: [
      { a: 'a', b: 'sw' },
      { a: 'b', b: 'sw' },
      { a: 'c', b: 'sw' },
      { a: 'sw', b: 'l3', net: 'トランク', ldy: -10 },
      { a: 'l3', b: 'srv', net: 'サーバ用 10.0.0.0/24', ldy: -10 },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>企業のネットワークでは、<b>部署やフロアごとに VLAN</b> を分け、<b>DHCP サーバはサーバ用のネットワークに1台（または冗長化して2台）</b>置いて全 VLAN に配るのが一般的。</p>
          <p>この構成では VLAN10 に PC-A・PC-B、VLAN20 に PC-C がいて、DHCP サーバは別のネットワーク（10.0.0.0/24）にある。</p>
          <p>ポイントは2つ。</p>
          <ul>
            <li>DHCP の最初のメッセージは<b>ブロードキャスト</b>で、<b>ルータ（L3SW）を越えられない</b> → <b>DHCP リレーエージェント</b>が必要</li>
            <li>1台のサーバが、<b>どの VLAN の、どの端末</b>からの要求かを見分ける仕組み（giaddr、chaddr、xid）</li>
          </ul>`,
        side: [scopes(), leases([])],
      },
      {
        title: '① リレーがないと',
        focus: 'l3', pkt: 'ctl', label: 'Discover', frameGroup: 'disc',
        desc: `<p>PC-A が電源を入れ、DHCP サーバを探して <b>Discover をブロードキャスト</b>する（送信元 0.0.0.0、宛先 255.255.255.255）。</p>
          <p>L2SW は同じ VLAN10 のポート（PC-B と L3SW）にフラッディングする。PC-B は DHCP サーバではないので無視する。VLAN20 の PC-C には届かない。</p>
          <p>L3SW は<b>ブロードキャストを別のネットワークへ転送しない</b>ので、Discover は L3SW で止まり、DHCP サーバに届かない。PC-A はアドレスを取得できない。</p>`,
        phases: [[['a', 'sw']], [['sw', 'b'], ['sw', 'l3', { drop: true }]]],
        frame: frame({ src: NONE, dst: BC, sport: '68', dport: '67', msg: 'DHCPDISCOVER', cl: CL.a }),
        side: [scopes(), leases([])],
      },
      {
        title: '② リレーで中継',
        focus: 'l3', pkt: 'ctl', label: 'Discover', frameGroup: 'disc',
        desc: `<p>L3SW の VLAN10 と VLAN20 のインタフェースに、<b>DHCP リレー</b>（転送先 ${SRV}）を設定した。</p>
          <p>L3SW は受け取った Discover を、DHCP サーバ宛ての<b>ユニキャスト</b>に変えて転送する。そのとき <b>giaddr に受信インタフェースのアドレス（${GW10}）</b>を入れる。</p>
          <p>右は L3SW → DHCP サーバ の区間のフレーム。①と比べて、<b>IP アドレス・ポート・giaddr</b> が変わっている。chaddr と xid は PC-A のまま。</p>`,
        phases: up('a', 'Discover', [['sw', 'b', { label: 'Discover' }]]),
        frame: frame({ src: [GW10, 'L3SW（VLAN10）'], dst: [SRV, 'DHCP サーバ'], sport: '67', dport: '67', msg: 'DHCPDISCOVER', cl: CL.a, giaddr: GW10 }),
        side: [
          {
            title: 'L3SW のリレー設定',
            head: ['インタフェース', 'アドレス', 'リレー先'],
            rows: [['VLAN10', GW10, SRV], ['VLAN20', GW20, SRV]],
            hit: 0,
          },
          scopes(0),
        ],
      },
      {
        title: '③ PC-A に Offer',
        focus: 'srv', pkt: 'ctl', label: 'Offer', frameGroup: 'oa',
        desc: `<p>DHCP サーバは <b>giaddr = ${GW10}</b> から「VLAN10（192.168.10.0/24）の端末だ」と判断し、そのスコープから空きアドレス <b>192.168.10.100</b> を提示する。</p>
          <p>Offer は L3SW に返され、L3SW が VLAN10 の PC-A に届ける。PC-A は自分が送った <b>xid</b> と自分の <b>chaddr</b> を見て、自分宛ての応答だと分かる。右は L3SW → PC-A の区間。</p>`,
        phases: down('a', 'Offer'),
        frame: frame({ src: [GW10, 'L3SW'], dst: BC, sport: '67', dport: '68', msg: 'DHCPOFFER', cl: CL.a, yiaddr: '192.168.10.100', giaddr: GW10, opts: opts(GW10) }),
        side: [scopes(0), leases([[...LA.slice(0, 2), 'VLAN10（提示中）']], 0)],
      },
      {
        title: '④ PC-A の Request・Ack',
        focus: 'a', pkt: 'ctl', frameGroup: 'oa',
        desc: `<p>PC-A が <b>Request</b>（このアドレスを使います）を送り、DHCP サーバが <b>Ack</b> で確定する。Request もまだブロードキャストなので、同じようにリレーされる。</p>
          <p>PC-A は 192.168.10.100、デフォルトゲートウェイ ${GW10} で通信できるようになった。右は L3SW → PC-A の Ack。</p>`,
        phases: [...up('a', 'Request'), ...down('a', 'Ack')],
        frame: frame({ src: [GW10, 'L3SW'], dst: BC, sport: '67', dport: '68', msg: 'DHCPACK', cl: CL.a, yiaddr: '192.168.10.100', giaddr: GW10, opts: opts(GW10) }),
        side: [scopes(0), leases([LA], 0)],
      },
      {
        title: '⑤ PC-B（同じ VLAN）',
        focus: 'b', pkt: 'ctl', frameGroup: 'oa',
        desc: `<p>同じ VLAN10 の PC-B も DORA を行う（Discover / Offer / Request / Ack をまとめて表示）。giaddr は PC-A と同じ ${GW10} なので、同じスコープから<b>次の空きアドレス 192.168.10.101</b> が割り当てられる。</p>
          <p>同じ VLAN の端末同士は、<b>chaddr（MAC アドレス）と xid</b> で区別される。右の Ack を④と比べると、変わったのはこの2つと yiaddr だけ。</p>
          <p>DHCP サーバは MAC アドレスごとに割り当てを覚えているので、PC-A が再起動しても基本的に同じアドレスを返す。</p>`,
        phases: [...up('b', 'Discover・Request', [['sw', 'a', { label: 'Discover' }]]), ...down('b', 'Offer・Ack')],
        frame: frame({ src: [GW10, 'L3SW'], dst: BC, sport: '67', dport: '68', msg: 'DHCPACK', cl: CL.b, yiaddr: '192.168.10.101', giaddr: GW10, opts: opts(GW10) }),
        side: [scopes(0), leases([LA, LB], 1)],
      },
      {
        title: '⑥ PC-C（別の VLAN）',
        focus: 'c', pkt: 'ctl', frameGroup: 'oa',
        desc: `<p>VLAN20 の PC-C の要求は、L3SW の <b>VLAN20 インタフェース</b>で受信されるので、リレー時の giaddr は <b>${GW20}</b> になる。</p>
          <p>DHCP サーバは giaddr を見て <b>VLAN20 用のスコープ</b>を選び、192.168.20.100 と、ルータ ${GW20} を返す。1台のサーバで、VLAN ごとに正しいアドレスとゲートウェイを配れるのはこの仕組みのおかげ。</p>
          <p>右の Ack を⑤と比べると、<b>giaddr・yiaddr・ルータのオプション</b>が変わっている。</p>`,
        phases: [...up('c', 'Discover・Request'), ...down('c', 'Offer・Ack')],
        frame: frame({ src: [GW20, 'L3SW（VLAN20）'], dst: BC, sport: '67', dport: '68', msg: 'DHCPACK', cl: CL.c, yiaddr: '192.168.20.100', giaddr: GW20, opts: opts(GW20) }),
        side: [scopes(1), leases([LA, LB, LC], 2)],
      },
      {
        title: '⑦ リース更新',
        focus: 'a', pkt: 'ctl', label: 'Request', noCompare: true,
        desc: `<p>リース期間の <b>50%（T1）</b>が経つと、PC-A は DHCP サーバに<b>ユニキャストで直接</b> Request を送って延長する。今は自分のアドレスがあるので、<b>リレーではなく普通にルーティング</b>されて届く。</p>
          <p>応答がないまま <b>87.5%（T2）</b>になると、ブロードキャストで任意のサーバに延長を求める（リバインド。このときはまたリレーされる）。</p>`,
        phases: [...up('a', 'Request'), ...down('a', 'Ack')],
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '192.168.10.100', 'PC-A'], ['宛先IP', SRV, 'DHCP サーバ']]],
          ['DHCP', [['メッセージ', 'DHCPREQUEST', '更新'], ['ciaddr', '192.168.10.100', '使用中のアドレス'], ['giaddr', '0.0.0.0', 'リレーされていない']]],
        ],
        side: leases([LA, LB, LC], 0),
      },
      {
        title: 'まとめ',
        desc: `<p>午後で問われるポイント：</p>
          <ul>
            <li>DHCP サーバと別のセグメントに端末があるなら、<b>その VLAN の L3SW / ルータのインタフェースごと</b>にリレー（ヘルパーアドレス）の設定が必要。VLAN を追加したら設定漏れに注意</li>
            <li>サーバは <b>giaddr でスコープを選ぶ</b>。スコープ側にもその VLAN 用の範囲・ゲートウェイを登録しておく</li>
            <li>DHCP サーバを2台にするなら、リレー先を2つ設定し、<b>スコープの範囲を分けて</b>アドレスの重複を防ぐ（例：.100〜.149 と .150〜.199）</li>
            <li>不正な DHCP サーバ対策に <b>DHCP スヌーピング</b>（信頼ポート以外からの Offer / Ack を遮断）</li>
            <li>大量の偽の Discover でアドレスを使い切らせる攻撃（DHCP スタベーション）もある</li>
          </ul>`,
        side: {
          title: 'DORA のアドレスとポート（端末側の区間）',
          head: ['メッセージ', '送信元 → 宛先', 'ポート'],
          rows: [
            ['Discover', '0.0.0.0 → 255.255.255.255', '68 → 67'],
            ['Offer', 'サーバ（リレー）→ 端末', '67 → 68'],
            ['Request', '0.0.0.0 → 255.255.255.255', '68 → 67'],
            ['Ack', 'サーバ（リレー）→ 端末', '67 → 68'],
          ],
          foot: 'リレー区間（L3SW ⇔ サーバ）はユニキャストで、ポートは 67 ⇔ 67',
        },
      },
    ],
  });
})();
