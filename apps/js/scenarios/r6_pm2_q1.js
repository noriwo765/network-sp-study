// R6午後Ⅱ問1 データセンターのネットワーク：VXLAN の洪水と学習を、EVPN の事前学習に置き換える
(() => {
  // VXLAN パケットの層（外側 → 内側）
  const vxlanFrame = (src, dst, dstNote, vni, inner) => [
    ['外側 IPv4 ヘッダ', [
      ['送信元IP', src, '送信側 VTEP'],
      ['宛先IP', dst, dstNote],
    ]],
    ['UDP ヘッダ', [['宛先ポート', '4789', 'VXLAN']]],
    ['VXLAN ヘッダ', [['VNI', vni, '24ビット']]],
    ['イーサネットフレーム（元のまま）', inner],
  ];
  const arpReq = [
    ['宛先MAC', 'FF-FF-FF-FF-FF-FF', 'ブロードキャスト'],
    ['送信元MAC', '02-00-5E-00-00-0A', 'VM-A'],
    ['内容', 'ARP 要求（VM-B の MAC は？）'],
  ];
  const arpRep = [
    ['宛先MAC', '02-00-5E-00-00-0A', 'VM-A'],
    ['送信元MAC', '02-00-5E-00-00-0B', 'VM-B'],
    ['内容', 'ARP 応答'],
  ];

  const vniTable = hit => ({
    title: 'リーフの対応表',
    head: ['リーフ', 'VLAN', 'VNI', 'グループ'],
    rows: [
      ['Leaf1・2', '11', '5010', '239.20.0.1'],
      ['Leaf1・2', '12', '5020', '239.20.0.2'],
      ['Leaf3', '21', '5010', '239.20.0.1'],
      ['Leaf3', '22', '5030', '239.20.0.3'],
      ['Leaf4', '31', '5020', '239.20.0.2'],
      ['Leaf4', '32', '5030', '239.20.0.3'],
    ],
    hit,
    foot: 'VLAN 番号はリーフごとの値。同じ L2 かどうかは VNI で決まる',
  });
  const learned = (title, rows, hit) => ({
    title,
    head: ['VM の MAC', 'VNI', 'リモート VTEP'],
    rows,
    hit,
    foot: '学習するのは3つの組。IP は VM ではなく VTEP のもの',
  });
  const macA = ['VM-A の MAC', '5010', '172.16.0.11（Leaf1）'];
  const macB = ['VM-B の MAC', '5010', '172.16.0.13（Leaf3）'];

  SCENARIOS.push({
    id: 'r6_pm2_q1',
    title: 'VXLAN と EVPN',
    subtitle: '洪水で覚える VXLAN から、MP-BGP で先に知る EVPN へ',
    viewBox: '0 0 900 380',
    nodes: {
      sp1:  { x: 300, y: 60,  name: 'Spine1', kind: 'rt', lines: ['172.16.0.1'], linesAbove: true },
      sp2:  { x: 600, y: 60,  name: 'Spine2', kind: 'rt', lines: ['172.16.0.2'], linesAbove: true },
      lf1:  { x: 110, y: 190, name: 'Leaf1', kind: 'sw', lines: ['172.16.0.11'] },
      lf2:  { x: 290, y: 190, name: 'Leaf2', kind: 'sw', lines: ['172.16.0.12'] },
      lf3:  { x: 550, y: 190, name: 'Leaf3', kind: 'sw', lines: ['172.16.0.13'] },
      lf4:  { x: 770, y: 190, name: 'Leaf4', kind: 'sw', lines: ['172.16.0.14'] },
      srvA: { x: 200, y: 310, name: 'サーバA', kind: 'sv', lines: ['VM-A（VLAN 11）'] },
      srvB: { x: 550, y: 310, name: 'サーバB', kind: 'sv', lines: ['VM-B（VLAN 21）'] },
      srvC: { x: 770, y: 310, name: 'サーバC', kind: 'sv', lines: ['VM-C（VLAN 32）'] },
    },
    links: [
      { a: 'sp1', b: 'lf1' }, { a: 'sp1', b: 'lf2' }, { a: 'sp1', b: 'lf3' }, { a: 'sp1', b: 'lf4' },
      { a: 'sp2', b: 'lf1' }, { a: 'sp2', b: 'lf2' }, { a: 'sp2', b: 'lf3' }, { a: 'sp2', b: 'lf4' },
      { a: 'lf1', b: 'srvA' }, { a: 'lf2', b: 'srvA' },
      { a: 'lf3', b: 'srvB' },
      { a: 'lf4', b: 'srvC' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>スパイン2台とリーフ4台の DC 網。リーフの <b>VTEP</b> がサーバのフレームを VXLAN で包み、IP 網の上に L2 網（オーバーレイ）を作る。</p>
          <p>VM-A と VM-B は <b>VLAN 番号は違う（11 と 21）が VNI が同じ（5010）</b>なので L2 で通信できる。VM-C は VNI 5030 なので、どちらとも L2 で通信できない。</p>
          <p>VNI は<b>24ビット</b>で、約1,677万の L2 網を作れる。</p>`,
        badges: { lf1: 'VTEP', lf2: 'VTEP', lf3: 'VTEP', lf4: 'VTEP' },
        side: vniTable([0, 2]),
      },
      {
        title: '① 土台の IP 網（OSPF と ECMP）',
        focus: ['lf1', 'lf3'],
        pkt: 'ip',
        label: 'IP',
        desc: `<p>OSPF は LSA から <b>LSDB</b> を作り、自分を根とする<b>最短経路ツリー</b>を計算する。ルータ ID は<b>OSPF が動く L3 スイッチ1台ごと</b>の識別子。</p>
          <p>ECMP で分散するには、<b>複数の経路それぞれの合計コストを同じにする</b>。</p>
          <p>VTEP のアドレスはループバック。図のように Leaf1 と Spine1 の線が切れても Spine2 経由で届くので、<b>物理インタフェースが1つ故障しても VTEP を続けられる</b>。</p>`,
        phases: [[['lf1', 'sp2']], [['sp2', 'lf3']]],
        links: { 'lf1-sp1': 'down', 'lf1-sp2': 'path', 'sp2-lf3': 'path' },
        side: {
          title: 'Leaf1 から Leaf3 へのコスト（各リンク10とした例）',
          head: ['経路', '合計', '状態'],
          rows: [
            ['Spine1 経由', '10＋10＝20', '等コスト（故障時は外れる）'],
            ['Spine2 経由', '10＋10＝20', '等コスト'],
          ],
          hit: 1,
        },
      },
      {
        title: '② ARP 要求を包む',
        focus: 'lf1',
        pkt: 'ip',
        label: 'ARP',
        desc: `<p>VM-A が VM-B の MAC を ARP で問い合わせる。Leaf1 は相手の居場所を知らないので、対応表を <b>VLAN → VNI → グループ</b>とたどり、外側の宛先を <b>239.20.0.1</b> にする。</p>
          <p>重ねる順は<b>外から IPv4 → UDP → VXLAN → 元のフレーム</b>。TCP ではなく UDP と書く。</p>`,
        phases: [[['srvA', 'lf1']]],
        frame: vxlanFrame('172.16.0.11', '239.20.0.1', 'VNI 5010 のグループ', '5010', arpReq),
        side: vniTable(0),
      },
      {
        title: '③ 同じ VNI の VTEP 全員へ',
        focus: ['lf2', 'lf3'],
        pkt: 'ip',
        label: 'VXLAN',
        desc: `<p>グループ宛てにするのは、<b>同じ L2 網をもつリモート VTEP すべてに届ける</b>ため。ここでは PIM-SM のランデブーポイント Spine1 を通って Leaf2・Leaf3 へ届く。VNI 5010 を持たない Leaf4 には届かない。</p>
          <p>受けた Leaf3 は包みを解き、VLAN 21 へブロードキャストする。同時に<b>VM-A の MAC（内側のフレーム）、VNI（VXLAN ヘッダ）、Leaf1 の IP（外側の IPv4 ヘッダ）</b>の組を覚える。</p>`,
        phases: [[['lf1', 'sp1']], [['sp1', 'lf2'], ['sp1', 'lf3']], [['lf3', 'srvB']]],
        frame: vxlanFrame('172.16.0.11', '239.20.0.1', 'VNI 5010 のグループ', '5010', arpReq),
        links: { 'lf1-sp1': 'tunnel', 'sp1-lf2': 'tunnel', 'sp1-lf3': 'tunnel' },
        badges: { sp1: 'RP', lf3: '学習' },
        side: learned('Leaf3 の学習表', [macA], 0),
      },
      {
        title: '④ ARP 応答はユニキャスト',
        focus: ['lf3', 'lf1'],
        pkt: 'ip',
        label: 'VXLAN',
        desc: `<p>Leaf3 は先ほど学習しているので、応答を <b>Leaf1 の VTEP だけ</b>に送れる。外側の宛先は 172.16.0.11。</p>
          <p>受けた Leaf1 も VM-B の組を覚える。学習表の<b>リモート VTEP は、その VM がいる側</b>の VTEP。Leaf1 の表の VM-B には 172.16.0.13 が付き、自分の値や VM の IP は書かない。</p>`,
        phases: [[['srvB', 'lf3']], [['lf3', 'sp2']], [['sp2', 'lf1']], [['lf1', 'srvA']]],
        frame: vxlanFrame('172.16.0.13', '172.16.0.11', 'Leaf1 の VTEP', '5010', arpRep),
        links: { 'lf3-sp2': 'tunnel', 'sp2-lf1': 'tunnel' },
        badges: { lf1: '学習', lf3: '学習済み' },
        side: [learned('Leaf1 の学習表', [macB], 0), learned('Leaf3 の学習表', [macA])],
      },
      {
        title: '⑤ この方式の弱点',
        focus: 'lf1',
        pkt: 'ip',
        label: 'VXLAN',
        desc: `<p>データを流して初めて覚える方式なので、学習表に無い宛先のフレームは <b>Unknown Unicast</b> として、同じ VNI の全 VTEP へ洪水になる。</p>
          <p>さらに、BUM の転送のために<b>土台の網に IP マルチキャストルーティング（PIM-SM）が必須</b>になる。</p>
          <p>サーバの NIC も片方は待機で、回線を遊ばせている。</p>`,
        phases: [[['lf1', 'sp1']], [['sp1', 'lf2'], ['sp1', 'lf3']]],
        frame: vxlanFrame('172.16.0.11', '239.20.0.1', '宛先不明なのでグループ宛て', '5010', [
          ['宛先MAC', '02-00-5E-00-00-0B', '学習表に無い'],
          ['送信元MAC', '02-00-5E-00-00-0A', 'VM-A'],
        ]),
        links: { 'lf1-sp1': 'tunnel', 'sp1-lf2': 'tunnel', 'sp1-lf3': 'tunnel' },
        badges: { lf1: '宛先不明' },
        side: learned('Leaf1 の学習表（エントリが消えた後）', [['（なし）', '—', '—']]),
      },
      {
        title: '⑥ 対策：MP-BGP と RR',
        focus: ['sp1', 'sp2'],
        pkt: 'ctl',
        label: 'iBGP',
        desc: `<p>EVPN は MP-BGP で制御情報を交換する。全台を同じ AS の iBGP で結ぶが、スパイン2台を<b>ルートリフレクタ（RR）</b>にして、リーフは RR とだけピアを張る。</p>
          <p>利点は <b>iBGP のピアの数を減らせる</b>こと。6台なら15本が9本になる。</p>
          <p>RR を2台で冗長化するときは同じ<b>クラスタ ID</b> を設定し、RR 間で経路がループしないようにする。</p>`,
        phases: [[['lf3', 'sp1'], ['lf3', 'sp2']]],
        badges: { sp1: 'RR', sp2: 'RR' },
        nodes: { sp1: 'done', sp2: 'done' },
        side: {
          title: 'iBGP ピア数（6台の場合）',
          head: ['方式', '計算', 'ピア数'],
          rows: [
            ['フルメッシュ', '6×5÷2', '15'],
            ['RR 2台', 'RR間1＋2×4', '9'],
          ],
          hit: 1,
        },
      },
      {
        title: '⑦ EVPN：先に広告して覚える',
        focus: 'lf3',
        pkt: 'ctl',
        label: 'EVPN',
        desc: `<p>Leaf3 は自分の情報を広告し、RR がクライアントへ反射する。各 VTEP は<b>データを流す前に</b>覚える。</p>
          <ul>
            <li>機能1：<b>リモート VTEP の IP と VNI</b>（タイプ3経路）</li>
            <li>機能2：<b>VM の MAC・VNI・リモート VTEP の IP</b>（タイプ2経路）</li>
          </ul>
          <p>宛先を先に知っているので、BUM のうち <b>Unknown Unicast のフラッディングが減る</b>。データの転送そのものは今までどおり VXLAN。</p>`,
        phases: [[['lf3', 'sp1']], [['sp1', 'lf1'], ['sp1', 'lf2'], ['sp1', 'lf4']]],
        frame: [
          ['BGP UPDATE（EVPN）', [
            ['タイプ2', 'VM-B の MAC ＋ VNI 5010', 'MAC/IP 広告'],
            ['タイプ3', 'VNI 5010 の VTEP', '包含マルチキャスト'],
            ['ネクストホップ', '172.16.0.13', 'Leaf3 の VTEP'],
          ]],
        ],
        badges: { sp1: 'RR', sp2: 'RR', lf1: '事前学習', lf2: '事前学習', lf4: '事前学習' },
        side: learned('Leaf1 の学習表（BGP で受信）', [macB], 0),
      },
      {
        title: '⑧ BUM はユニキャストで複製',
        focus: 'lf1',
        pkt: 'ip',
        label: 'VXLAN',
        desc: `<p>マルチキャストをやめても BUM は運べる。Leaf1 は <b>VNI 5010 を持つリモート VTEP の全部</b>へ、宛先を変えた複製を<b>IP ユニキャスト</b>で送る。VNI 5010 が無い Leaf4 には送らない。</p>
          <p>宛先の IP は <b>MP-BGP で学習したもの</b>。PIM-SM を動かせない網でも拡張できる。</p>
          <p>確認は、ARP 要求を包んだパケットをキャプチャして、宛先が 172.16.0.12 と 172.16.0.13 になっていることを見る。</p>`,
        phases: [[['srvA', 'lf1']], [['lf1', 'sp1'], ['lf1', 'sp2']], [['sp1', 'lf2'], ['sp2', 'lf3']]],
        frame: [
          ['外側 IPv4 ヘッダ（複製1）', [['宛先IP', '172.16.0.12', 'Leaf2']]],
          ['外側 IPv4 ヘッダ（複製2）', [['宛先IP', '172.16.0.13', 'Leaf3']]],
          ['VXLAN ヘッダ', [['VNI', '5010', '複製の間で共通']]],
          ['イーサネットフレーム（元のまま）', arpReq],
        ],
        links: { 'lf1-sp1': 'tunnel', 'lf1-sp2': 'tunnel', 'sp1-lf2': 'tunnel', 'sp2-lf3': 'tunnel' },
        side: {
          title: 'Leaf1 が BGP で知った VNI 5010 の VTEP',
          head: ['リモート VTEP', 'IP', '複製を送るか'],
          rows: [
            ['Leaf2', '172.16.0.12', '○'],
            ['Leaf3', '172.16.0.13', '○'],
            ['Leaf4', '172.16.0.14', '×（VNI なし）'],
          ],
          hit: [0, 1],
        },
      },
      {
        title: '⑨ 2台のリーフにまたがる LAG',
        focus: 'srvA',
        pkt: 'ip',
        label: 'データ',
        desc: `<p>Leaf1 と Leaf2 の論理インタフェースに<b>同じ ESI</b> を設定し、MP-BGP で交換する。これで2台のリーフは、同じサーバにつながっていると判断できる。</p>
          <p>サーバの2枚の NIC はアクティブ／アクティブの LAG になる。前の構成と比べた利点は<b>2本の回線の帯域を有効に使える</b>こと。冗長化は前からできていたので、利点としては書かない。</p>`,
        phases: [[['srvA', 'lf1'], ['srvA', 'lf2']]],
        links: { 'lf1-srvA': 'path', 'lf2-srvA': 'path' },
        badges: { lf1: 'ESI-A', lf2: 'ESI-A' },
        nodes: { srvA: 'done' },
        side: {
          title: '現行と EVPN の比較',
          head: ['観点', '現行', 'EVPN'],
          rows: [
            ['MAC の学習', '受信パケットから', 'MP-BGP で事前に'],
            ['BUM の宛先', 'グループアドレス', '各 VTEP へユニキャスト'],
            ['サーバ接続', '片方の NIC は待機', '両方の NIC を使う LAG'],
          ],
        },
      },
    ],
  });
})();
