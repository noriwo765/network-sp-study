// VLAN：アクセスポートとトランクポート、802.1Q タグ、VLAN 間ルーティング【ジャンル1】
(() => {
  const MAC = {
    a: ['02:00:00:00:10:0b', 'PC-A'],
    b: ['02:00:00:00:20:15', 'PC-B'],
    l3: ['02:00:00:00:fe:01', 'L3SW'],
    bc: ['ff:ff:ff:ff:ff:ff', 'ブロードキャスト'],
  };

  function frame(dst, src, vid, type, ip) {
    return [
      ['Ethernetヘッダ', [['宛先MAC', ...dst], ['送信元MAC', ...src]]],
      ...(vid ? [['802.1Q タグ（4バイト）', [
        ['TPID', '0x8100', 'タグ付きの目印'],
        ['PCP', '0', '優先度（3ビット）'],
        ['VID', String(vid), 'VLAN ID（12ビット）'],
      ]]] : []),
      ['タイプ', [['タイプ', ...type]]],
      ...(ip ? [['IPv4ヘッダ', ip]] : []),
    ];
  }
  const portTable = {
    title: 'SW1 のポート設定',
    head: ['ポート', '種類', 'VLAN'],
    rows: [['p1（PC-A）', 'アクセス', '10'], ['p2（PC-B）', 'アクセス', '20'], ['p3（SW2）', 'トランク', '10, 20'], ['p4（L3SW）', 'トランク', '10, 20']],
  };

  SCENARIOS.push({
    id: 'vlan',
    chapter: 1,
    title: 'VLAN',
    subtitle: '802.1Q タグがどこで付き、どこで外れるか。VLAN をまたぐ通信はどう流れるか',
    viewBox: '0 0 810 275',
    nodes: {
      pca: { x: 60,  y: 60,  name: 'PC-A', kind: 'pc', lines: ['VLAN10', '192.168.10.11'] },
      pcb: { x: 60,  y: 205, name: 'PC-B', kind: 'pc', lines: ['VLAN20', '192.168.20.21'] },
      sw1: { x: 250, y: 130, name: 'SW1', kind: 'sw' },
      l3:  { x: 410, y: 40,  name: 'L3SW', kind: 'rt', lines: ['VLAN10: .10.1', 'VLAN20: .20.1'] },
      sw2: { x: 540, y: 130, name: 'SW2', kind: 'sw' },
      pcc: { x: 745, y: 60,  name: 'PC-C', kind: 'pc', lines: ['VLAN10', '192.168.10.12'] },
      pcd: { x: 745, y: 205, name: 'PC-D', kind: 'pc', lines: ['VLAN20', '192.168.20.22'] },
    },
    links: [
      { a: 'pca', b: 'sw1', pb: 'p1' },
      { a: 'pcb', b: 'sw1', pb: 'p2' },
      { a: 'sw1', b: 'sw2', pa: 'p3', net: 'トランク' },
      { a: 'sw1', b: 'l3', pa: 'p4', net: 'トランク', ldx: -58, ldy: -10 },
      { a: 'sw2', b: 'pcc' },
      { a: 'sw2', b: 'pcd' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>VLAN は1台のスイッチを<b>論理的に複数のスイッチに分ける</b>技術。VLAN が違えば、同じスイッチにつながっていても<b>別のブロードキャストドメイン</b>になる。</p>
          <ul>
            <li><b>アクセスポート</b>：1つの VLAN に所属。端末をつなぐ。タグなし</li>
            <li><b>トランクポート</b>：複数の VLAN を通す。スイッチ間をつなぐ。<b>802.1Q タグ</b>で VLAN を区別</li>
          </ul>`,
        side: portTable,
      },
      {
        title: '① ブロードキャスト',
        focus: 'pca', pkt: 'arp', label: 'ARP', frameGroup: 'bc',
        desc: `<p>PC-A（VLAN10）が PC-C を探して ARP をブロードキャストする。</p>
          <p>SW1 は<b>VLAN10 のポートにだけ</b>フラッディングする。PC-B（VLAN20）には届かない。</p>
          <p>トランクに出すときに <b>VID=10 のタグを挿入</b>する。右はトランク上のフレーム。タグは<b>送信元MAC とタイプの間</b>に入る4バイト。</p>`,
        phases: [[['pca', 'sw1']], [['sw1', 'sw2', { label: 'ARP 10' }], ['sw1', 'l3', { label: 'ARP 10' }]], [['sw2', 'pcc']]],
        frame: frame(MAC.bc, MAC.a, 10, ['0x0806', 'ARP']),
        side: portTable,
      },
      {
        title: '② SW2 でタグを外す',
        focus: 'sw2', pkt: 'arp', label: 'ARP', frameGroup: 'bc',
        desc: `<p>SW2 はタグの VID=10 を見て、VLAN10 のアクセスポート（PC-C）にだけ転送する。アクセスポートから出すときは<b>タグを外す</b>。</p>
          <p>端末はタグを意識しない。タグの挿入・削除でフレームが変わるので、<b>FCS は再計算</b>される。</p>`,
        phases: [[['sw2', 'pcc']]],
        frame: frame(MAC.bc, MAC.a, 0, ['0x0806', 'ARP']),
      },
      {
        title: '③ VLAN 間の通信',
        focus: 'l3', pkt: 'ip', noCompare: true,
        desc: `<p>PC-A（VLAN10）から PC-B（VLAN20）へは、<b>L2 では届かない</b>（別のブロードキャストドメイン）。PC-A は宛先が別ネットワークなので、デフォルトゲートウェイの L3SW に送る。</p>
          <ol>
            <li>PC-A → SW1：タグなし</li>
            <li>SW1 → L3SW：VID=10 のタグ付き</li>
            <li>L3SW がルーティング（TTL−1）し、VID=20 のタグを付けて送り返す</li>
            <li>SW1 → PC-B：タグを外す</li>
          </ol>
          <p>右は L3SW → SW1 の区間。<b>VID・MAC・TTL</b> が変わっている。</p>`,
        phases: [
          [['pca', 'sw1', { label: 'IP' }]],
          [['sw1', 'l3', { label: 'IP 10' }]],
          [['l3', 'sw1', { label: 'IP 20' }]],
          [['sw1', 'pcb', { label: 'IP' }]],
        ],
        frame: frame(MAC.b, MAC.l3, 20, ['0x0800', 'IPv4'], [
          ['TTL', '63', 'L3SW で −1'],
          ['送信元IP', '192.168.10.11', 'PC-A'],
          ['宛先IP', '192.168.20.21', 'PC-B'],
        ]),
      },
      {
        title: '④ ネイティブ VLAN',
        focus: ['sw1', 'sw2'],
        desc: `<p>トランク上で<b>タグなし</b>で流れるフレームは、<b>ネイティブ VLAN</b>（既定は VLAN1）に属するものとして扱われる。</p>
          <ul>
            <li>両端のスイッチでネイティブ VLAN が<b>食い違う</b>と、VLAN をまたいでフレームが漏れる</li>
            <li>タグを二重に付けて別 VLAN に侵入する <b>VLAN ホッピング</b>攻撃の原因になる → ネイティブ VLAN を未使用の VLAN にする、トランクで許可する VLAN を絞る</li>
          </ul>`,
        links: { 'sw1-sw2': 'hit' },
      },
      {
        title: 'まとめ',
        desc: `<p>VID は12ビットなので VLAN は最大 <b>4094 個</b>（0 と 4095 は予約）。それ以上の分割が必要なデータセンターなどでは VXLAN を使う。</p>
          <p>タグで4バイト増えるので、Ethernet フレームの最大長は 1518 → <b>1522 バイト</b>になる。</p>`,
        side: {
          title: 'ポートの種類',
          head: ['', 'アクセスポート', 'トランクポート'],
          rows: [
            ['所属 VLAN', '1つ', '複数'],
            ['タグ', 'なし（出るときに外す）', 'あり（ネイティブ VLAN はなし）'],
            ['接続先', '端末', 'スイッチ・ルータ・サーバ（仮想化ホスト）'],
          ],
        },
      },
    ],
  });
})();
