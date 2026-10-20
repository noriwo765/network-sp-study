// ステートフルFW と非対称ルーティング【6-5】
(() => {
  const PC = '10.1.1.10';
  const SV = '172.16.0.10';

  const frame = (src, sport, dst, dport, flags) => [
    ['IPv4ヘッダ', [
      ['プロトコル', '6', 'TCP'],
      ['送信元IP', src],
      ['宛先IP', dst],
    ]],
    ['TCPヘッダ', [
      ['送信元ポート', String(sport)],
      ['宛先ポート', String(dport)],
      ['フラグ', flags],
    ]],
  ];
  const syn = frame(PC, 50000, SV, 443, 'SYN');
  const synAck = frame(SV, 443, PC, 50000, 'SYN+ACK');

  const SESSION = [`${PC}:50000`, `${SV}:443`, 'TCP'];
  const fwTable = (name, rows, hit) => ({
    title: `${name} セッションテーブル`,
    head: ['内側', '外側', 'プロトコル', '状態'],
    rows: rows.length ? rows : [['（なし）', '', '', '']],
    hit,
  });

  SCENARIOS.push({
    id: 'stateful-fw',
    chapter: 8,
    title: 'ステートフルFW',
    subtitle: '行きと帰りで経路が違う（非対称ルーティング）と、なぜ通信できないのか',
    viewBox: '0 0 810 275',
    nodes: {
      pc:  { x: 60,  y: 130, name: 'PC', kind: 'pc', lines: [PC] },
      l3:  { x: 220, y: 130, name: 'L3SW', kind: 'sw' },
      fw1: { x: 410, y: 55,  name: 'FW1', kind: 'fw' },
      fw2: { x: 410, y: 205, name: 'FW2', kind: 'fw' },
      rt:  { x: 600, y: 130, name: 'RT', kind: 'rt' },
      sv:  { x: 755, y: 130, name: 'Server', kind: 'sv', lines: [SV] },
    },
    links: [
      { a: 'pc', b: 'l3' },
      { a: 'l3', b: 'fw1' },
      { a: 'l3', b: 'fw2' },
      { a: 'fw1', b: 'rt' },
      { a: 'fw2', b: 'rt' },
      { a: 'rt', b: 'sv' },
      { a: 'fw1', b: 'fw2', net: '同期リンク', ldx: 42, ldy: 4 },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p><b>ステートフルインスペクション</b>型 FW は、内→外の通信を許可したときに<b>セッション情報を記録</b>し、それに対応する<b>戻りのパケットだけを自動で通す</b>。</p>
          <p>この構成では FW を2台並べ、次のように経路が設定されている。</p>
          <ul>
            <li>L3SW のデフォルトルート：<b>FW1</b> 経由（行き）</li>
            <li>RT の 10.1.1.0/24 への経路：<b>FW2</b> 経由（帰り）</li>
          </ul>
          <p>FW のポリシーは「内→外 TCP 443 を許可、外→内は全て拒否」。</p>`,
      },
      {
        title: '① SYN は FW1 を通る',
        focus: 'fw1',
        pkt: 'ip',
        label: 'SYN',
        noCompare: true,
        desc: `<p>PC が Server へ SYN を送る。FW1 はポリシー（内→外 443 許可）に一致するので通し、<b>セッションテーブルに記録</b>する。</p>
          <p>FW2 はこの SYN を見ていないので、何も知らない。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'fw1']], [['fw1', 'rt']], [['rt', 'sv']]],
        frame: syn,
        links: { 'l3-fw1': 'hit', 'fw1-rt': 'hit' },
        side: [fwTable('FW1', [[...SESSION, 'SYN 受信']], 0), fwTable('FW2', [])],
      },
      {
        title: '② SYN+ACK は FW2 で破棄',
        focus: 'fw2',
        pkt: 'ip',
        label: 'SYN+ACK',
        noCompare: true,
        desc: `<p>Server の SYN+ACK は、RT の経路に従って <b>FW2</b> に届く。</p>
          <p>FW2 のセッションテーブルには対応するエントリがない → 戻りパケットとは判断できず、<b>外→内の新しい通信</b>として扱われる → ポリシーで拒否され<b>破棄</b>。</p>
          <p>3ウェイハンドシェイクが完了しないので、PC は SYN を再送し続け、やがて<b>タイムアウト</b>する。</p>`,
        phases: [[['sv', 'rt']], [['rt', 'fw2', { drop: true }]]],
        frame: synAck,
        links: { 'l3-fw1': 'hit', 'fw1-rt': 'hit', 'rt-fw2': 'hit' },
        side: [fwTable('FW1', [[...SESSION, 'SYN 受信']], 0), fwTable('FW2', [], 0)],
      },
      {
        title: '③ 対策1：経路の対称化',
        focus: 'fw1',
        pkt: 'ip',
        label: 'SYN+ACK',
        noCompare: true,
        desc: `<p>RT の 10.1.1.0/24 への経路を <b>FW1 経由</b>に揃え、行きと帰りが<b>同じ FW を通る</b>ようにする。</p>
          <p>FW1 はセッションテーブルに一致するエントリがあるので、SYN+ACK を戻りパケットとして通す。</p>
          <p>FW を冗長化するなら、アクティブ/スタンバイ構成にして<b>常に1台だけを通る</b>ようにするのが基本。</p>`,
        phases: [[['sv', 'rt']], [['rt', 'fw1']], [['fw1', 'l3']], [['l3', 'pc']]],
        frame: synAck,
        links: { 'l3-fw1': 'path', 'fw1-rt': 'path' },
        side: [fwTable('FW1', [[...SESSION, '確立']], 0), fwTable('FW2', [])],
      },
      {
        title: '④ 対策2：セッション同期',
        focus: ['fw1', 'fw2'],
        pkt: 'ip',
        label: 'SYN+ACK',
        noCompare: true,
        desc: `<p>FW1 と FW2 の間でセッション情報を<b>同期</b>する（多くの冗長化対応 FW が持つ機能）。</p>
          <p>FW1 が SYN を通した時点でセッション情報が FW2 にもコピーされるので、FW2 も SYN+ACK を戻りパケットとして通せる。</p>
          <p>ただし同期には遅れがあり、IPS 機能などはパケットの順序が揃わないと正しく検査できない。<b>まずは対称化が第一</b>。</p>`,
        phases: [
          [['fw1', 'fw2', { label: '同期', kind: 'ctl' }]],
          [['sv', 'rt']], [['rt', 'fw2']], [['fw2', 'l3']], [['l3', 'pc']],
        ],
        frame: synAck,
        links: { 'fw1-fw2': 'path', 'rt-fw2': 'hit', 'l3-fw2': 'hit' },
        side: [fwTable('FW1', [[...SESSION, '確立']], 0), fwTable('FW2', [[...SESSION, '確立（同期）']], 0)],
      },
      {
        title: 'まとめ',
        desc: `<p>非対称ルーティングで問題が起きるのは、<b>状態（セッション）を持つ機器</b>全般。ステートフル FW のほか、<b>NAPT ルータ</b>や<b>負荷分散装置</b>でも同じことが起きる。</p>
          <p>午後で「一部の通信だけがつながらない」「冗長構成にしたら通信が不安定になった」と出てきたら、まず<b>行きと帰りの経路</b>を疑う。</p>`,
        side: {
          title: 'パケットフィルタとステートフルFWの違い',
          head: ['', '静的パケットフィルタ', 'ステートフルFW'],
          rows: [
            ['戻りパケット', 'ルールで明示的に許可', 'セッション情報で自動許可'],
            ['戻りのルール', '宛先ポート 1024〜65535 などを広く開ける必要あり', '不要'],
            ['非対称経路', '影響なし（状態を持たない）', '戻りが破棄される'],
          ],
        },
      },
    ],
  });
})();
