// BGP：マルチホーム接続での経路選択と、LOCAL_PREF / AS_PATH プリペンドによる制御【4-6】
(() => {
  const DEST = '192.0.2.0/24';
  const OWN = '203.0.113.0/24';

  const update = (nlri, asPath, nextHop, extra = []) => [
    ['TCPヘッダ', [['宛先ポート', '179', 'BGP']]],
    ['BGP UPDATE', [
      ['NLRI（経路）', nlri],
      ['AS_PATH', asPath],
      ['NEXT_HOP', nextHop],
      ['ORIGIN', 'IGP'],
      ...extra,
    ]],
  ];

  // ベストパス選択の比較表
  const decide = (title, rows, hit) => ({
    title, head: ['比較項目', 'ISP-A 経由', 'ISP-B 経由', '判定'], rows, hit,
  });

  SCENARIOS.push({
    id: 'bgp',
    chapter: 11,
    title: 'BGP',
    subtitle: '2つの ISP にマルチホーム接続。出ていく通信・入ってくる通信の経路をどう制御するか',
    viewBox: '0 0 810 275',
    nodes: {
      lan:  { x: 60,  y: 130, name: '自社LAN', kind: 'cloud', lines: [] },
      rta:  { x: 250, y: 60,  name: 'RT-A', kind: 'rt', lines: ['AS65001'], linesAbove: true },
      rtb:  { x: 250, y: 200, name: 'RT-B', kind: 'rt', lines: ['AS65001'] },
      ispa: { x: 480, y: 60,  name: 'ISP-A', kind: 'rt', lines: ['AS64500'], linesAbove: true },
      ispb: { x: 480, y: 200, name: 'ISP-B', kind: 'rt', lines: ['AS64510'] },
      net:  { x: 710, y: 130, name: 'インターネット', kind: 'cloud' },
    },
    links: [
      { a: 'lan', b: 'rta' },
      { a: 'lan', b: 'rtb' },
      { a: 'rta', b: 'rtb', net: 'iBGP', ldx: 26, ldy: 4 },
      { a: 'rta', b: 'ispa', net: 'eBGP', ldy: -8 },
      { a: 'rtb', b: 'ispb', net: 'eBGP', ldy: -8 },
      { a: 'ispa', b: 'net' },
      { a: 'ispb', b: 'net' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>自社（<b>AS65001</b>、アドレス ${OWN}）は、RT-A で ISP-A と、RT-B で ISP-B と接続している（<b>マルチホーム</b>）。</p>
          <ul>
            <li><b>eBGP</b>：異なる AS 間（RT-A ⇔ ISP-A など）</li>
            <li><b>iBGP</b>：同じ AS 内（RT-A ⇔ RT-B）</li>
          </ul>
          <p>BGP は <b>TCP 179番</b>でピアを張り、経路と<b>パス属性</b>をやり取りする<b>パスベクトル型</b>プロトコル。</p>`,
      },
      {
        title: '① eBGP で経路を受信',
        focus: ['rta', 'rtb'], pkt: 'ctl', label: 'UPDATE', noCompare: true,
        desc: `<p>インターネット上の ${DEST}（AS64999）への経路が、両方の ISP から届く。</p>
          <ul>
            <li>ISP-A 経由：AS_PATH = 64500 64999（AS 2つ）</li>
            <li>ISP-B 経由：AS_PATH = 64510 64520 64999（AS 3つ）</li>
          </ul>
          <p>AS_PATH は通ってきた AS の列。<b>自分の AS 番号が含まれていたら破棄</b>することで、AS 間のループを防ぐ。</p>`,
        phases: [[['net', 'ispa'], ['net', 'ispb']], [['ispa', 'rta'], ['ispb', 'rtb']]],
        frame: update(DEST, '64500 64999', '（ISP-A のアドレス）'),
      },
      {
        title: '② iBGP で共有',
        focus: ['rta', 'rtb'], pkt: 'ctl', label: 'UPDATE', noCompare: true,
        desc: `<p>RT-A と RT-B は、eBGP で受け取った経路を iBGP でお互いに伝える。これで両方のルータが<b>2つの経路</b>を知る。</p>
          <p>iBGP では AS_PATH に自 AS を追加しない。また、<b>iBGP で受け取った経路を別の iBGP ピアには広告しない</b>（ルータが3台以上ならフルメッシュかルートリフレクタが必要）。</p>`,
        phases: [[['rta', 'rtb'], ['rtb', 'rta']]],
        frame: update(DEST, '64500 64999', '（ISP-A のアドレス）', [['LOCAL_PREF', '100', 'AS 内だけで使う属性']]),
      },
      {
        title: '③ ベストパス選択',
        focus: 'rta', pkt: 'ip', label: 'DATA',
        desc: `<p>BGP は属性を<b>決まった順番</b>で比べ、最初に差がついた項目で経路を決める。</p>
          <p>LOCAL_PREF は同じ（100）。次の <b>AS_PATH の長さ</b>で ISP-A 経由（2）が短いので勝つ。RT-B も同じ判断をするので、自社から ${DEST} への通信は<b>ISP-A から出ていく</b>。</p>`,
        phases: [[['lan', 'rta']], [['rta', 'ispa']], [['ispa', 'net']]],
        links: { 'lan-rta': 'path', 'rta-ispa': 'path', 'ispa-net': 'path' },
        side: decide('RT-A の判定', [
          ['① LOCAL_PREF（大が優先）', '100', '100', '同じ'],
          ['② AS_PATH 長（短が優先）', '2', '3', '<b>ISP-A</b>'],
        ], 1),
      },
      {
        title: '④ 出口を ISP-B に',
        focus: 'rtb', pkt: 'ip', label: 'DATA',
        desc: `<p>要件：「ISP-A は従量課金なので、出ていく通信は <b>ISP-B を優先</b>したい」。</p>
          <p>RT-B で、ISP-B から受け取った経路の <b>LOCAL_PREF を 200</b> に上げる。LOCAL_PREF は iBGP で <b>AS 内の全ルータに伝わり</b>、AS_PATH より<b>先に</b>比較されるので、RT-A も RT-B 経由を選ぶ。</p>
          <p>覚え方：<b>出ていく（アウトバウンド）通信の制御 ＝ LOCAL_PREF</b>。</p>`,
        phases: [[['lan', 'rta']], [['rta', 'rtb']], [['rtb', 'ispb']], [['ispb', 'net']]],
        links: { 'lan-rta': 'path', 'rta-rtb': 'path', 'rtb-ispb': 'path', 'ispb-net': 'path' },
        side: decide('RT-A の判定（LOCAL_PREF 変更後）', [
          ['① LOCAL_PREF（大が優先）', '100', '200', '<b>ISP-B</b>'],
          ['② AS_PATH 長（短が優先）', '2', '3', '（比較されない）'],
        ], 0),
      },
      {
        title: '⑤ 入ってくる通信の制御',
        focus: 'rtb', pkt: 'ctl', label: 'UPDATE', noCompare: true,
        desc: `<p>要件：「インターネットから自社（${OWN}）への通信は <b>ISP-A 経由</b>で受けたい」。</p>
          <p>相手の AS の LOCAL_PREF は自社では操作できない。そこで、RT-B から ISP-B に広告する経路の AS_PATH に<b>自 AS 番号を余分に付ける</b>（<b>AS_PATH プリペンド</b>）。ISP-B 経由の経路が「遠く」見えるので、他の AS は ISP-A 経由を選ぶ。</p>
          <p>覚え方：<b>入ってくる（インバウンド）通信の制御 ＝ AS_PATH プリペンド</b>（隣接 AS が同じなら MED も使える）。</p>`,
        phases: [[['rta', 'ispa'], ['rtb', 'ispb']], [['ispa', 'net'], ['ispb', 'net']]],
        frame: update(OWN, '65001 65001 65001', '（RT-B のアドレス）'),
        side: {
          title: 'インターネットから見た自社への経路',
          head: ['経由', 'AS_PATH', '長さ', '選択'],
          rows: [['ISP-A', '64500 65001', '2', '<b>選ばれる</b>'], ['ISP-B', '64510 65001 65001 65001', '4', '']],
          hit: 0,
        },
      },
      {
        title: '⑥ ISP-B 回線の障害',
        focus: 'rta', pkt: 'ip', label: 'DATA',
        desc: `<p>RT-B と ISP-B の回線が切れた。eBGP セッションが切断され（キープアライブが届かず<b>ホールドタイマ</b>満了、または BFD で高速検知）、ISP-B 経由の経路が取り消される（WITHDRAW）。</p>
          <ul>
            <li>出ていく通信：LOCAL_PREF 200 の経路が消え、残った ISP-A 経由（100）が使われる</li>
            <li>入ってくる通信：もともと ISP-A 経由なので影響なし</li>
          </ul>
          <p>経路制御とは別に、BGP マルチホームは<b>回線冗長化</b>の手段にもなる。</p>`,
        phases: [[['lan', 'rta']], [['rta', 'ispa']], [['ispa', 'net']]],
        links: { 'rtb-ispb': 'down', 'lan-rta': 'path', 'rta-ispa': 'path', 'ispa-net': 'path' },
        side: decide('RT-A の判定（障害後）', [
          ['① LOCAL_PREF（大が優先）', '100', '（経路なし）', '<b>ISP-A</b>'],
        ], 0),
      },
      {
        title: 'まとめ',
        desc: `<p>属性の比較順（主なもの）を表にした。上から順に比べ、差がついた時点で決まる。</p>`,
        side: {
          title: 'BGP ベストパス選択の順番（抜粋）',
          head: ['順', '属性', '優先', '範囲・用途'],
          rows: [
            ['0', 'Weight（Cisco 独自）', '大', 'そのルータだけ'],
            ['1', 'LOCAL_PREF', '大', 'AS 内に伝わる。出ていく通信の制御'],
            ['2', '自ルータが生成した経路', '-', ''],
            ['3', 'AS_PATH の長さ', '短', 'プリペンドで入ってくる通信を制御'],
            ['4', 'ORIGIN', 'IGP > EGP > ?', ''],
            ['5', 'MED', '小', '隣接 AS に入口を希望する'],
            ['6', 'eBGP > iBGP', '-', ''],
            ['7', 'NEXT_HOP までの IGP コスト', '小', ''],
          ],
        },
      },
    ],
  });
})();
