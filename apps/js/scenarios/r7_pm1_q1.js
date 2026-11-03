// R7午後Ⅰ問1 ルータの更改：OSPF コストで迂回させ、止めずにルータを交換する
(() => {
  const ospfFrame = (router, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', router, '更新を出したルータ'],
      ['宛先IP', '224.0.0.5', '全 OSPF ルータ宛て'],
      ['プロトコル', '89', 'OSPF'],
    ]],
    ['OSPF LSU', [
      ['LSA', 'ルータLSA'],
      ['内容', note],
    ]],
  ];
  const pingFrame = (src, dst, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src],
      ['宛先IP', dst, note],
      ['プロトコル', '1', 'ICMP'],
    ]],
    ['ICMP', [['タイプ', '8', 'エコー要求']]],
  ];

  // 本社の L3SW から見た、支社 LAN までの経路の合計コスト
  const costTable = (viaRt1, viaRt2, hit) => ({
    title: 'L3SW から支社 LAN へのコスト',
    head: ['経路', '合計', '選ばれるか'],
    rows: [
      ['RT1 → 広域イーサ', viaRt1, hit === 0 ? '○' : '—'],
      ['RT2 → IPsec VPN', viaRt2, hit === 1 ? '○' : '—'],
    ],
    hit,
    foot: 'LAN 側 10＋WAN 側 150 または 1500＋支社 LAN 側 10',
  });

  const down = { 'l3-rt1': 'down', 'rt1-rt2': 'down', 'rt1-ether': 'down' };

  SCENARIOS.push({
    id: 'r7_pm1_q1',
    title: 'ルータの無停止更改',
    subtitle: '通信を止めずにルータを交換する手順を、経路の動きで追う',
    viewBox: '0 0 900 320',
    nodes: {
      pc:    { x: 70,  y: 185, name: '本社PC', kind: 'pc', lines: ['10.1.1.10'] },
      l3:    { x: 210, y: 185, name: 'L3SW', kind: 'sw' },
      rt1:   { x: 370, y: 120, name: 'RT1', kind: 'rt', lines: ['交換対象'], linesAbove: true },
      rt2:   { x: 370, y: 250, name: 'RT2', kind: 'rt' },
      ether: { x: 540, y: 120, name: '広域イーサ', kind: 'cloud' },
      vpn:   { x: 540, y: 250, name: 'IPsec VPN', kind: 'cloud' },
      dc:    { x: 720, y: 35,  name: 'DC-RT', kind: 'rt', lines: ['SaaS 接続'] },
      rt3:   { x: 720, y: 120, name: 'RT3', kind: 'rt' },
      rt4:   { x: 720, y: 250, name: 'RT4', kind: 'rt' },
      pcb:   { x: 840, y: 185, name: '支社PC', kind: 'pc', lines: ['10.2.1.10'] },
    },
    links: [
      { a: 'pc', b: 'l3' },
      { a: 'l3', b: 'rt1', cost: '10' },
      { a: 'l3', b: 'rt2', cost: '10' },
      { a: 'rt1', b: 'rt2' },
      { a: 'rt1', b: 'ether', cost: '150' },
      { a: 'rt2', b: 'vpn', cost: '1500' },
      { a: 'ether', b: 'dc' },
      { a: 'ether', b: 'rt3' },
      { a: 'vpn', b: 'rt4' },
      { a: 'rt3', b: 'rt4' },
      { a: 'rt3', b: 'pcb' },
      { a: 'rt4', b: 'pcb' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>本社と支社を<b>広域イーサ（主）</b>と<b>IPsec VPN（副）</b>の2本で結び、全体を <b>OSPF のバックボーンエリア（エリア0）</b>で動かしている。</p>
          <p>WAN 側のコストを 150 と 1500 にすることで、普段は広域イーサを使い、障害時だけ VPN へ切り替わる。</p>
          <p>今回の作業は <b>RT1 を新しい機種へ交換</b>すること。通信を止めないのが条件。</p>`,
        badges: { rt1: '交換対象' },
        side: costTable('170', '1520', 0),
      },
      {
        title: '① 普段の通信',
        focus: 'pc',
        pkt: 'ip',
        label: 'ping',
        desc: `<p>更改中の影響を見るため、PC から ping を流し続ける。</p>
          <p>宛先に選ぶのは、<b>交換するルータを実際に経由している相手</b>。本社 PC から見れば支社や DC 側が該当し、本社内のサーバでは RT1 を通らないので確認にならない。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'rt1']], [['rt1', 'ether']], [['ether', 'rt3']], [['rt3', 'pcb']]],
        frame: pingFrame('10.1.1.10', '10.2.1.10', 'RT1 を経由する相手'),
        links: { 'l3-rt1': 'path', 'rt1-ether': 'path', 'ether-rt3': 'path' },
        side: costTable('170', '1520', 0),
      },
      {
        title: '② コストを最大にする',
        focus: 'rt1',
        pkt: 'ctl',
        label: 'LSU',
        desc: `<p>RT1 の<b>全インタフェース</b>のコストを <b>65535（最大値）のような十分大きな値</b>にする。</p>
          <p>「1500 より大きい値」のように下限だけで考えると、合計コストの比較で確実に迂回するとは言えない。答案では<b>十分大きな値</b>と書く。</p>
          <p>全インタフェースに設定するのは、<b>RT1 へ入ってくる方向の通信も避けさせる</b>ため。変更は LSA で全ルータに伝わり、各自が最短経路を計算し直す。</p>`,
        phases: [[['rt1', 'l3'], ['rt1', 'rt2'], ['rt1', 'ether']], [['ether', 'rt3'], ['ether', 'dc']]],
        frame: ospfFrame('10.0.0.1', 'RT1 の全リンクのコスト＝65535'),
        badges: { rt1: 'コスト最大' },
        side: costTable('65555', '1520', 1),
      },
      {
        title: '③ 迂回を確認',
        focus: 'pc',
        pkt: 'ip',
        label: 'ping',
        desc: `<p>ping が <b>RT2 → VPN</b> の経路に移った。パケットロスがなければ業務影響はない。</p>
          <p>この時点で RT1 は通信を中継していないが、ルータとしてはまだ動いており、隣接関係も保っている。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'rt2']], [['rt2', 'vpn']], [['vpn', 'rt4']], [['rt4', 'pcb']]],
        frame: pingFrame('10.1.1.10', '10.2.1.10', '経路だけが変わる'),
        links: { 'l3-rt2': 'path', 'rt2-vpn': 'path', 'vpn-rt4': 'path' },
        badges: { rt1: 'コスト最大' },
        side: costTable('65555', '1520', 1),
      },
      {
        title: '④ インタフェースを閉塞',
        focus: 'rt1',
        desc: `<p>電源を切る前に、<b>全物理インタフェースを閉塞</b>して切り離す。</p>
          <p>理由は<b>切り戻しの速さ</b>。もし予想外の影響が出ても、閉塞を解除するだけで元に戻せる。いきなり電源を切ると、戻すのに再起動を待つことになる。</p>`,
        links: down,
        badges: { rt1: '閉塞' },
        side: costTable('—', '1520', 1),
      },
      {
        title: '⑤ 機器を交換',
        focus: 'rt1',
        desc: `<p>次の順で交換する。</p>
          <ol>
            <li>設定を保存し、コピーを手元に取って電源を切る。</li>
            <li><b>ケーブルにラベルを付けてから</b>抜く（挿し間違いを防ぐ）。</li>
            <li>設定を入れた新しい機器に載せ替えて起動し、保存した設定と差分がないか確かめる。</li>
            <li>ケーブルを接続する。</li>
          </ol>`,
        links: down,
        nodes: { rt1: 'done' },
        badges: { rt1: '新RT1' },
      },
      {
        title: '⑥ 閉塞を解除して隣接を確認',
        focus: 'rt1',
        pkt: 'ip',
        label: 'ping',
        desc: `<p>閉塞を解除し、<b>新 RT1 から隣の機器それぞれへ ping</b> する。宛先は <b>L3SW・RT2・RT3・DC-RT</b> の4台。</p>
          <p>コストは大きいままなので、業務の通信はまだ VPN 経由。<b>業務に影響させずに、新しい機器の接続だけを試せる</b>のがこの順番のよさ。</p>`,
        phases: [[['rt1', 'l3'], ['rt1', 'rt2'], ['rt1', 'ether']], [['ether', 'rt3'], ['ether', 'dc']]],
        frame: pingFrame('10.0.0.1', '隣の機器', '新機器の接続確認'),
        badges: { rt1: '新RT1' },
        nodes: { rt1: 'done' },
        side: costTable('65555', '1520', 1),
      },
      {
        title: '⑦ コストを戻す',
        focus: 'pc',
        pkt: 'ip',
        label: 'ping',
        desc: `<p>コストを元の値へ戻すと、LSA が再び広がり、通信は広域イーサへ戻る。経路を確認して作業は完了。</p>
          <p>手順全体の型は<b>「迂回 → 切り離し → 交換 → 接続確認 → 迂回の解除」</b>。問題が起きたらどこまで戻すかを、各段階で言える状態にする。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'rt1']], [['rt1', 'ether']], [['ether', 'rt3']], [['rt3', 'pcb']]],
        frame: pingFrame('10.1.1.10', '10.2.1.10', '元の経路に戻る'),
        links: { 'l3-rt1': 'path', 'rt1-ether': 'path', 'ether-rt3': 'path' },
        side: costTable('170', '1520', 0),
      },
      {
        title: '⑧ 支社側：VRRP の待ち時間',
        focus: 'rt3',
        pkt: 'ctl',
        label: 'VRRP',
        desc: `<p>支社の RT3 と RT4 は VRRP で<b>デフォルトゲートウェイ</b>を冗長化している。RT3 を交換して再起動すると、優先度が高い RT3 がマスタへ戻ろうとする。</p>
          <p><b>プリエンプトディレイ</b>があると、すぐには戻らない。待つのは <b>OSPF の経路情報が収束した状態</b>になるまで。</p>
          <p>待たないと、経路が揃っていない RT3 が PC の通信を受け取り、<b>宛先が分からず廃棄</b>してしまう。</p>`,
        phases: [[['rt3', 'pcb'], ['rt3', 'rt4']]],
        badges: { rt3: '収束待ち', rt4: 'Master' },
      },
    ],
  });
})();
