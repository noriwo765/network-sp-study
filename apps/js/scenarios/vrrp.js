// VRRP：マスタ障害時の切替、GARP、プリエンプト、トラッキング【4-7】
(() => {
  const VMAC = ['00:00:5e:00:01:01', '仮想MAC'];
  const PCMAC = ['02:00:00:00:00:0a', 'PC'];
  const VIP = '192.168.1.254';

  function advFrame(srcIp, who, priority) {
    return [
      ['Ethernetヘッダ', [
        ['宛先MAC', '01:00:5e:00:00:12', 'VRRP マルチキャスト'],
        ['送信元MAC', ...VMAC],
        ['タイプ', '0x0800', 'IPv4'],
      ]],
      ['IPv4ヘッダ', [
        ['TTL', '255', '255 以外は破棄'],
        ['プロトコル', '112', 'VRRP'],
        ['送信元IP', srcIp, `${who} の実IP`],
        ['宛先IP', '224.0.0.18'],
      ]],
      ['VRRP', [
        ['VRID', '1'],
        ['優先度', String(priority)],
        ['アドバタイズ間隔', '1 秒'],
        ['仮想IPアドレス', VIP],
      ]],
    ];
  }

  const dataFrame = [
    ['Ethernetヘッダ', [
      ['宛先MAC', ...VMAC],
      ['送信元MAC', ...PCMAC],
      ['タイプ', '0x0800', 'IPv4'],
    ]],
    ['IPv4ヘッダ', [
      ['送信元IP', '192.168.1.10', 'PC'],
      ['宛先IP', '198.51.100.10', 'インターネット上のサーバ'],
    ]],
  ];

  const garpFrame = [
    ['Ethernetヘッダ', [
      ['宛先MAC', 'ff:ff:ff:ff:ff:ff', 'ブロードキャスト'],
      ['送信元MAC', ...VMAC],
      ['タイプ', '0x0806', 'ARP'],
    ]],
    ['ARP', [
      ['オペレーション', '1', '要求'],
      ['送信元MAC', ...VMAC],
      ['送信元IP', VIP],
      ['目標MAC', '00:00:00:00:00:00'],
      ['目標IP', VIP, '送信元IPと同じ＝GARP'],
    ]],
  ];

  const swTable = (port, hit) => ({
    title: 'SW MACアドレステーブル',
    head: ['MACアドレス', 'ポート'],
    rows: [['02:00:00:00:00:0a（PC）', 'p1'], [`${VMAC[0]}（仮想MAC）`, port]],
    hit,
  });
  const stateTable = (r1, r2, hit) => ({
    title: 'VRRP の状態',
    head: ['ルータ', '優先度', '状態'],
    rows: [['RT1', ...r1], ['RT2', ...r2]],
    hit,
  });

  SCENARIOS.push({
    id: 'vrrp',
    chapter: 12,
    title: 'VRRP',
    subtitle: 'デフォルトゲートウェイの冗長化。障害時に何が起き、端末から何が見えるか',
    viewBox: '0 0 810 275',
    nodes: {
      pc:  { x: 70,  y: 130, name: 'PC', kind: 'pc', lines: ['192.168.1.10', `GW: ${VIP}`] },
      sw:  { x: 230, y: 130, name: 'SW', kind: 'sw' },
      rt1: { x: 430, y: 75,  name: 'RT1', kind: 'rt', lines: ['192.168.1.1 / 優先度110'], linesAbove: true },
      rt2: { x: 430, y: 200, name: 'RT2', kind: 'rt', lines: ['192.168.1.2 / 優先度100'] },
      wan: { x: 660, y: 130, name: 'WAN', kind: 'cloud' },
    },
    links: [
      { a: 'pc', b: 'sw', pb: 'p1' },
      { a: 'sw', b: 'rt1', pa: 'p2' },
      { a: 'sw', b: 'rt2', pa: 'p3' },
      { a: 'rt1', b: 'wan' },
      { a: 'rt2', b: 'wan' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>RT1 と RT2 が<b>仮想IP ${VIP}</b> と<b>仮想MAC ${VMAC[0]}</b> を共有し、PC はこの仮想IPをデフォルトゲートウェイにしている。</p>
          <p>普段は優先度の高い RT1 が<b>マスタ</b>として仮想IP宛ての通信を処理し、RT2 は<b>バックアップ</b>として待機する。</p>
          <p>仮想MACは <b>00-00-5E-00-01-{VRID}</b> の形式（ここでは VRID=1）。</p>`,
        badges: { rt1: 'Master', rt2: 'Backup' },
      },
      {
        title: '① アドバタイズメント',
        focus: 'rt1',
        pkt: 'ctl',
        label: 'VRRP',
        desc: `<p>マスタの RT1 は <b>1秒ごとにアドバタイズメント</b>をマルチキャスト（224.0.0.18）で送り、「自分が生きている」ことを知らせる。</p>
          <p>送信元 MAC は<b>仮想MAC</b>なので、SW は仮想MACを <b>p2（RT1 側）</b>で学習する。</p>
          <p>RT2 はこれを受け取っている間はバックアップのまま。</p>`,
        phases: [[['rt1', 'sw']], [['sw', 'rt2'], ['sw', 'pc']]],
        frame: advFrame('192.168.1.1', 'RT1', 110),
        badges: { rt1: 'Master', rt2: 'Backup' },
        side: [stateTable(['110', 'Master'], ['100', 'Backup'], 0), swTable('p2', 1)],
      },
      {
        title: '② 通常時の通信',
        focus: 'pc',
        pkt: 'ip',
        desc: `<p>PC がインターネットへ通信する。宛先MAC は<b>仮想MAC</b>（PC が ${VIP} を ARP で解決すると、マスタが仮想MACで応答する）。</p>
          <p>SW は仮想MACを p2 で学習しているので、RT1 へ転送する。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'rt1']], [['rt1', 'wan']]],
        frame: dataFrame,
        badges: { rt1: 'Master', rt2: 'Backup' },
        side: [stateTable(['110', 'Master'], ['100', 'Backup'], 0), swTable('p2', 1)],
      },
      {
        title: '③ RT1 故障',
        focus: 'rt2',
        desc: `<p>RT1 が電源断で停止し、<b>アドバタイズメントが届かなくなった</b>。</p>
          <p>RT2 は <b>Master_Down_Interval</b> の間アドバタイズメントを受け取らなければ、マスタが停止したと判断する。</p>
          <p>Master_Down_Interval = 3 × アドバタイズ間隔 + Skew_Time<br>
          Skew_Time = (256 − 優先度) ÷ 256 = (256 − 100) ÷ 256 ≒ 0.61 秒 → <b>約 3.6 秒</b></p>
          <p>この間、PC の通信は止まっている（SW は仮想MACを p2 で覚えたまま）。</p>`,
        links: { 'sw-rt1': 'down', 'rt1-wan': 'down' },
        nodes: { rt1: 'down' },
        badges: { rt1: '停止', rt2: 'Backup' },
        side: [stateTable(['110', '停止'], ['100', 'Backup（待機中）'], 1), swTable('p2', 1)],
      },
      {
        title: '④ RT2 昇格・GARP',
        focus: 'rt2',
        pkt: 'arp',
        label: 'GARP',
        desc: `<p>RT2 が<b>マスタに昇格</b>し、すぐに<b>GARP（Gratuitous ARP）</b>を仮想MACでブロードキャストする。</p>
          <p>目的は <b>SW の MAC アドレステーブルを更新</b>させること。SW は仮想MACの場所を p2 → <b>p3</b> に書き換える。</p>
          <p>PC の ARP キャッシュは「${VIP} = 仮想MAC」のままで<b>変更不要</b>。これが仮想MACを使う理由。</p>`,
        phases: [[['rt2', 'sw']], [['sw', 'pc']]],
        frame: garpFrame,
        links: { 'sw-rt1': 'down', 'rt1-wan': 'down' },
        nodes: { rt1: 'down' },
        badges: { rt1: '停止', rt2: 'Master' },
        side: [stateTable(['110', '停止'], ['100', 'Master'], 1), swTable('p3', 1)],
      },
      {
        title: '⑤ 切替後の通信',
        focus: 'pc',
        pkt: 'ip',
        desc: `<p>PC は<b>何も変えずに</b>同じフレームを送る。右のフレームは②と全く同じ（「変化」が出ない）ことに注目。</p>
          <p>SW が仮想MACを p3 で学習し直したので、フレームは RT2 に届く。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'rt2']], [['rt2', 'wan']]],
        frame: dataFrame,
        links: { 'sw-rt1': 'down', 'rt1-wan': 'down' },
        nodes: { rt1: 'down' },
        badges: { rt1: '停止', rt2: 'Master' },
        side: [stateTable(['110', '停止'], ['100', 'Master'], 1), swTable('p3', 1)],
      },
      {
        title: '⑥ RT1 復旧・プリエンプト',
        focus: 'rt1',
        pkt: 'ctl',
        label: 'VRRP',
        desc: `<p>RT1 が復旧し、優先度 110 でアドバタイズメントを送る。RT1 の<b>プリエンプト</b>が有効（VRRP の既定）なので、自分より優先度の低い RT2 からマスタを奪い返す。RT2 はバックアップに戻る。</p>
          <p>仮想MACが送信元のアドバタイズメントで、SW のテーブルは再び p2 になる。</p>
          <p>プリエンプトを無効にすると RT2 がマスタのまま残る。<b>切り戻しの瞬間にも短い通信断</b>があるため、あえて無効にする設計もある。</p>`,
        phases: [[['rt1', 'sw']], [['sw', 'rt2'], ['sw', 'pc']]],
        frame: advFrame('192.168.1.1', 'RT1', 110),
        badges: { rt1: 'Master', rt2: 'Backup' },
        side: [stateTable(['110', 'Master'], ['100', 'Backup'], 0), swTable('p2', 1)],
      },
      {
        title: '⑦ 落とし穴：WAN側障害',
        focus: 'rt1',
        pkt: 'ip',
        desc: `<p>今度は RT1 の <b>WAN 側回線だけ</b>が切れた。LAN 側は正常なので、RT1 はアドバタイズメントを送り続け、<b>マスタのまま</b>。</p>
          <p>PC の通信は RT1 に届くが、WAN に出られず<b>破棄</b>される。VRRP は LAN 側しか見ていないので、この障害では切り替わらない。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'rt1', { drop: true }]]],
        frame: dataFrame,
        links: { 'rt1-wan': 'down' },
        badges: { rt1: 'Master', rt2: 'Backup' },
        side: [stateTable(['110', 'Master'], ['100', 'Backup'], 0), swTable('p2', 1)],
      },
      {
        title: '⑧ トラッキングで解決',
        focus: 'rt2',
        pkt: 'ip',
        desc: `<p><b>インタフェーストラッキング</b>：RT1 が WAN 側 IF を監視し、ダウンしたら優先度を <b>110 → 90</b>（−20）に下げる。</p>
          <p>RT2（100）のほうが高くなり、<b>RT2 のプリエンプト</b>が有効ならマスタを奪う → GARP で SW のテーブルが p3 に更新 → 通信は RT2 経由で復旧する。</p>
          <p>午後の定番：「下げ幅は、相手の優先度を下回るように設定する」（110 − 5 = 105 では 100 を下回らず切り替わらない）。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'rt2']], [['rt2', 'wan']]],
        frame: dataFrame,
        links: { 'rt1-wan': 'down' },
        badges: { rt1: 'Backup (90)', rt2: 'Master' },
        side: [stateTable(['110 → 90', 'Backup'], ['100', 'Master'], [0, 1]), swTable('p3', 1)],
      },
    ],
  });
})();
