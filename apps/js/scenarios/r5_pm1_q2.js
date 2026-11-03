// R5午後Ⅰ問2 IPマルチキャストによる映像配信：IGMPv3 と PIM で (S,G) の配信ツリーを作る
(() => {
  const CAM_A = '10.60.1.11';
  const CAM_B = '10.60.2.21';
  const GROUP = '232.10.20.30';

  const videoFrame = (src, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src, 'カメラごとに別'],
      ['宛先IP', GROUP, note || 'グループアドレス（全カメラ共通）'],
    ]],
    ['データ', [['内容', '映像データ（6 Mbps）']]],
  ];
  const sgTable = (rows, hit) => ({
    title: 'マルチキャスト経路（(S,G) エントリ）',
    head: ['機器', '(S,G)', '出力先'],
    rows,
    hit,
    foot: `S＝カメラ A（${CAM_A}）、G＝${GROUP}`,
  });
  const snoopTable = (rows, hit) => ({
    title: '受信 SW のスヌーピング表',
    head: ['グループ', 'ポートの先'],
    rows,
    hit,
    foot: '覚えるのはグループアドレスとインタフェース',
  });

  SCENARIOS.push({
    id: 'r5_pm1_q2',
    title: 'IPマルチキャストの映像配信',
    subtitle: '受け手の要求から配信ツリーができ、映像が必要な所へだけ複製されるまでを追う',
    viewBox: '0 0 900 330',
    nodes: {
      cama: { x: 60,  y: 90,  name: 'カメラA', kind: 'sv', lines: [CAM_A] },
      camb: { x: 60,  y: 250, name: 'カメラB', kind: 'sv', lines: [CAM_B] },
      rsw:  { x: 200, y: 170, name: '沿岸SW', kind: 'sw' },
      fw:   { x: 340, y: 170, name: 'FW', kind: 'fw' },
      mgmt: { x: 340, y: 50,  name: '管理サーバ', kind: 'sv' },
      l3a:  { x: 490, y: 130, name: 'L3SW 1', kind: 'sw' },
      l3b:  { x: 490, y: 280, name: 'L3SW 2', kind: 'sw' },
      l2r:  { x: 640, y: 80,  name: '受信SW', kind: 'sw' },
      l2p:  { x: 640, y: 200, name: 'PC用SW', kind: 'sw' },
      rcv1: { x: 790, y: 40,  name: 'レシーバ1', kind: 'pc' },
      rcv2: { x: 790, y: 120, name: 'レシーバ2', kind: 'pc' },
      pc:   { x: 790, y: 200, name: 'PC', kind: 'pc' },
      rcv3: { x: 790, y: 280, name: 'レシーバ3', kind: 'pc' },
    },
    links: [
      { a: 'cama', b: 'rsw' },
      { a: 'camb', b: 'rsw' },
      { a: 'rsw', b: 'fw' },
      { a: 'fw', b: 'mgmt' },
      { a: 'fw', b: 'l3a' },
      { a: 'fw', b: 'l3b' },
      { a: 'l3a', b: 'l2r' },
      { a: 'l3a', b: 'l2p' },
      { a: 'l2r', b: 'rcv1' },
      { a: 'l2r', b: 'rcv2' },
      { a: 'l2p', b: 'pc' },
      { a: 'l3b', b: 'rcv3' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>河川や沿岸に置いたカメラ <b>14 台</b>の映像を、庁舎の<b>レシーバ 5 台</b>でリアルタイムに表示したい。カメラは1台 <b>6 Mbps</b>、レシーバは最大 4 映像を同時に受ける。</p>
          <p>図はその一部を抜き出したもの。カメラ（ソース）は個別の IP アドレスを持ち、宛先は全カメラ<b>共通のグループアドレス</b>にする。</p>`,
        focus: ['cama', 'camb'],
        badges: { cama: 'ソース', camb: 'ソース', rcv1: '受信側', rcv3: '受信側' },
        side: {
          title: '使う仕組み',
          head: ['場所', 'プロトコル'],
          rows: [
            ['受け手とスイッチ', 'IGMPv3'],
            ['機器の間', 'PIM-SM と SSM'],
            ['L2 スイッチ', 'IGMP スヌーピング'],
          ],
        },
      },
      {
        title: '① ユニキャストだったら',
        focus: 'cama',
        pkt: 'ip',
        desc: `<p>もしユニキャストで配ると、カメラは受け手の数だけ別々にパケットを送る。</p>
          <p>答案に書くことは<b>レシーバの数に応じて、ソースの通信量が増える</b>。何の数で、どこが増えるのかまで書く。</p>
          <p>カメラが接続された回線も無駄に混む。これがマルチキャストを使う理由。</p>`,
        phases: [
          [['cama', 'rsw', { label: '宛先1' }]],
          [['cama', 'rsw', { label: '宛先2' }], ['rsw', 'fw', { label: '宛先1' }]],
          [['rsw', 'fw', { label: '宛先2' }], ['fw', 'l3a', { label: '宛先1' }]],
        ],
        links: { 'cama-rsw': 'hit', 'rsw-fw': 'hit' },
        badges: { cama: '受け手の数だけ送信' },
        side: {
          title: 'カメラ1台が送る量（ユニキャスト）',
          head: ['受け手の数', '通信量'],
          rows: [['1 台', '6 Mbps'], ['2 台', '12 Mbps'], ['5 台', '30 Mbps']],
          hit: 2,
        },
      },
      {
        title: '② カメラは常に送っている',
        focus: 'rsw',
        pkt: 'ip',
        label: '映像',
        desc: `<p>マルチキャストではカメラは受け手の有無に関係なく、グループアドレス宛てに<b>常時送信</b>する。</p>
          <p>カメラ側のスイッチから FW へ流れ込む最大は <b>14 台 × 6 Mbps ＝ 84 Mbps</b>。レシーバの数は掛けない。</p>
          <p>まだ要求がないので FW の転送先はなく、ここで止まる。</p>`,
        phases: [[['cama', 'rsw'], ['camb', 'rsw']], [['rsw', 'fw', { drop: true }]]],
        frame: videoFrame(CAM_A),
        links: { 'rsw-fw': 'hit' },
        side: {
          title: 'FW へ流れ込む通信量',
          head: ['項目', '値'],
          rows: [
            ['カメラ', '14 台'],
            ['1台の通信量', '6 Mbps'],
            ['最大', '84 Mbps'],
            ['受信の枠', '5×4＝20（≧14）'],
          ],
          hit: 2,
          foot: '枠が足りるので全カメラが選ばれ得る',
        },
      },
      {
        title: '③ PIM hello で隣を見つける',
        focus: 'fw',
        pkt: 'ctl',
        label: 'hello',
        desc: `<p>マルチキャストルーティングを有効にした機器は、<b>全インタフェースで PIM-SM</b> を動かす。定期的に hello を送り合い、PIM の隣接相手を見つける。</p>
          <p>L3 スイッチではさらに<b>SSM</b> を有効にする。送信元が初めから分かるので、共有の待ち合わせ場所（RP）を使わない。</p>`,
        phases: [[['fw', 'l3a'], ['fw', 'l3b'], ['l3a', 'fw'], ['l3b', 'fw']]],
        frame: [
          ['IPv4ヘッダ', [
            ['宛先IP', '224.0.0.13', '全 PIM ルータ宛て'],
            ['プロトコル', '103', 'PIM'],
          ]],
          ['PIM', [['種類', 'Hello']]],
        ],
        badges: { fw: 'PIM-SM', l3a: 'PIM-SM＋SSM', l3b: 'PIM-SM＋SSM' },
      },
      {
        title: '④ レシーバが (S,G) を要求',
        focus: 'rcv1',
        pkt: 'ctl',
        label: 'IGMPv3 Join',
        desc: `<p>レシーバ1 がカメラ A の映像を要求する。IGMPv3 では<b>送信元とグループの組 (S,G)</b> を指定できる。宛先はユニキャストではなく、IGMPv3 用の<b>マルチキャストアドレス</b>。</p>
          <p>途中の受信 SW は <b>IGMP スヌーピング</b>でこれをのぞき見て、<b>グループアドレスとインタフェース</b>を覚える。これがないと映像を<b>フラッディング</b>してしまう。</p>`,
        phases: [[['rcv1', 'l2r']], [['l2r', 'l3a']]],
        frame: [
          ['IPv4ヘッダ', [
            ['送信元IP', '10.70.1.31', 'レシーバ1'],
            ['宛先IP', '224.0.0.22', 'IGMPv3 レポート用'],
            ['プロトコル', '2', 'IGMP'],
          ]],
          ['IGMPv3 メンバーシップレポート', [
            ['グループ', GROUP, 'G'],
            ['送信元', CAM_A, 'S'],
          ]],
        ],
        badges: { l2r: 'のぞき見', rcv1: 'カメラA を要求' },
        side: snoopTable([[GROUP, 'レシーバ1']], 0),
      },
      {
        title: '⑤ PIM Join で木を伸ばす',
        focus: 'l3a',
        pkt: 'ctl',
        label: 'PIM Join',
        desc: `<p>L3SW は (S,G) エントリを作り、<b>ユニキャストの経路表</b>でカメラの方向を調べて、そちらの隣接機器へ PIM の (S,G) Join を送る。PIM が「プロトコルに依存しない」というのは、この既存の経路表を使うという意味。</p>
          <p>こうして送信元を根にした配信経路、<b>ディストリビューションツリー</b>ができる。</p>`,
        phases: [[['l3a', 'fw']]],
        frame: [
          ['IPv4ヘッダ', [
            ['送信元IP', '10.70.0.1', 'L3SW 1'],
            ['宛先IP', '224.0.0.13', '全 PIM ルータ宛て'],
            ['プロトコル', '103', 'PIM'],
          ]],
          ['PIM Join/Prune', [
            ['上流の隣接機器', 'FW'],
            ['Join', `(${CAM_A}, ${GROUP})`],
          ]],
        ],
        side: sgTable([['FW', '(S,G)', 'L3SW 1'], ['L3SW 1', '(S,G)', '受信 SW']], [0, 1]),
      },
      {
        title: '⑥ 要求した所へだけ届く',
        focus: 'fw',
        pkt: 'ip',
        label: '映像',
        desc: `<p>FW は受け取った映像を (S,G) エントリの出力先へ転送する。L3SW も同じで、映像はレシーバ1 まで届く。</p>
          <p><b>スヌーピングの効果</b>で、受信 SW はレシーバ1 のポートにだけ出す。要求していないレシーバ2 には流れない。</p>`,
        phases: [[['cama', 'rsw']], [['rsw', 'fw']], [['fw', 'l3a']], [['l3a', 'l2r']], [['l2r', 'rcv1']]],
        frame: videoFrame(CAM_A),
        links: { 'cama-rsw': 'path', 'rsw-fw': 'path', 'fw-l3a': 'path', 'l3a-l2r': 'path', 'l2r-rcv1': 'path', 'l2r-rcv2': 'blocked' },
        badges: { rcv1: '受信中', rcv2: '流れない' },
        side: snoopTable([[GROUP, 'レシーバ1']], 0),
      },
      {
        title: '⑦ 増えても上流は1本',
        focus: 'fw',
        pkt: 'ip',
        label: '映像',
        desc: `<p>別の階のレシーバ3 も同じ映像を要求すると、<b>枝分かれする FW で複製</b>される。</p>
          <p>カメラから FW までは1本のままで、ソースの通信量は増えない。①のユニキャストとの違いを数字で比べると、カメラ1台で 5 台へ配っても 6 Mbps のまま。</p>`,
        phases: [
          [['cama', 'rsw']],
          [['rsw', 'fw']],
          [['fw', 'l3a'], ['fw', 'l3b']],
          [['l3a', 'l2r'], ['l3b', 'rcv3']],
          [['l2r', 'rcv1']],
        ],
        frame: videoFrame(CAM_A),
        links: { 'cama-rsw': 'path', 'rsw-fw': 'path', 'fw-l3a': 'path', 'fw-l3b': 'path', 'l3a-l2r': 'path', 'l3b-rcv3': 'path', 'l2r-rcv1': 'path' },
        badges: { fw: 'ここで複製', rcv1: '受信中', rcv3: '受信中' },
        side: sgTable([['FW', '(S,G)', 'L3SW 1, L3SW 2'], ['L3SW 1', '(S,G)', '受信 SW'], ['L3SW 2', '(S,G)', 'レシーバ3']], 0),
      },
      {
        title: '⑧ IGMPv2 ならどう設計するか',
        focus: ['cama', 'camb'],
        pkt: 'ctl',
        label: 'IGMPv2 Join',
        desc: `<p>IGMPv2 の要求で指定できるのは<b>グループだけ</b>。全カメラで同じグループを使うと、どのカメラの映像かを選べない。</p>
          <p>だから v2 では、<b>カメラごとに個別の IP アドレスと個別のグループアドレス</b>が必要になる。</p>
          <p>逆に言えば IGMPv3 の利点は<b>グループアドレスの設計が簡単になる</b>こと。S で区別できるので G を使い回せる。</p>`,
        phases: [[['rcv1', 'l2r']], [['l2r', 'l3a']]],
        badges: { rcv1: 'G だけ指定' },
        side: {
          title: 'カメラのアドレス設計',
          head: ['カメラ', 'IGMPv3 の G', 'IGMPv2 の G'],
          rows: [
            ['A', GROUP, '239.10.1.11'],
            ['B', GROUP, '239.10.2.21'],
            ['選び方', '(S,G)', 'G のみ'],
          ],
          foot: 'IP アドレスはどちらも個別。v2 では G も個別にする',
        },
      },
      {
        title: '⑨ PC でも見られるようにする',
        focus: ['pc', 'l3a'],
        pkt: 'ip',
        desc: `<p>PC でも映像を見るには、ネットワーク側では <b>L3SW の、PC 用 SW 向けのインタフェースで IGMPv3 を有効にする</b>（各階の該当機器すべて）。機器の間の PIM-SM は全インタフェースで動いているので追加不要。PC のソフトには映像を<b>復号</b>する機能を入れる。</p>
          <p>選択には管理サーバの Web ページを使う。PC からは <b>TCP/443</b> で接続し、カメラが増えても <b>Web ページを直すだけで対応できる</b>。</p>`,
        phases: [
          [['pc', 'l2p', { label: 'HTTPS' }]],
          [['l2p', 'l3a', { label: 'HTTPS' }]],
          [['l3a', 'fw', { label: 'HTTPS' }]],
          [['fw', 'mgmt', { label: 'HTTPS' }]],
          [['pc', 'l2p', { label: 'IGMPv3', kind: 'ctl' }]],
          [['l2p', 'l3a', { label: 'IGMPv3', kind: 'ctl' }]],
          [['fw', 'l3a', { label: '映像' }]],
          [['l3a', 'l2p', { label: '映像' }]],
          [['l2p', 'pc', { label: '映像' }]],
        ],
        links: { 'l3a-l2p': 'hit' },
        badges: { l3a: 'IGMPv3 を追加', pc: '映像を復号', mgmt: 'Web ページ' },
        side: {
          title: 'FW のユニキャスト許可ルール',
          head: ['送信元', '宛先', 'ポート'],
          rows: [
            ['管理サーバ', 'カメラ', '独自'],
            ['PC', '管理サーバ', 'TCP/443'],
          ],
          hit: 1,
          foot: 'ステートフルなので戻りのルールは要らない',
        },
      },
    ],
  });
})();
