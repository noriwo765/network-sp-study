// VXLAN：L3 ネットワーク上に L2 を延伸するカプセル化【2-2(1) ネットワーク仮想化】
(() => {
  const inner = [
    ['内側Ethernetヘッダ', [
      ['宛先MAC', '02:00:00:00:00:14', 'VM-B'],
      ['送信元MAC', '02:00:00:00:00:0a', 'VM-A'],
    ]],
    ['内側IPヘッダ', [
      ['送信元IP', '10.1.1.10', 'VM-A'],
      ['宛先IP', '10.1.1.20', 'VM-B（同じサブネット）'],
    ]],
  ];

  const encap = [
    ['外側Ethernetヘッダ', [
      ['宛先MAC', '（次ホップのルータ）'],
      ['送信元MAC', '（VTEP1）'],
    ], 'plain'],
    ['外側IPヘッダ', [
      ['送信元IP', '192.0.2.1', 'VTEP1'],
      ['宛先IP', '198.51.100.2', 'VTEP2'],
      ['プロトコル', '17', 'UDP'],
    ], 'plain'],
    ['外側UDPヘッダ', [
      ['送信元ポート', '52814', '内側フレームのハッシュ値'],
      ['宛先ポート', '4789', 'VXLAN'],
    ], 'plain'],
    ['VXLANヘッダ（8バイト）', [
      ['フラグ', 'I=1', 'VNI 有効'],
      ['VNI', '5001', 'セグメント識別子（24ビット）'],
    ], 'plain'],
    ...inner,
  ];

  SCENARIOS.push({
    id: 'vxlan',
    chapter: 16,
    title: 'VXLAN',
    subtitle: '離れたデータセンターの VM 同士を、IP ネットワーク越しに同じ L2 セグメントでつなぐ',
    nodes: {
      vma:   { x: 60,  y: 125, name: 'VM-A', kind: 'pc', lines: ['10.1.1.10'] },
      vtep1: { x: 230, y: 125, name: 'VTEP1', kind: 'sw', lines: ['192.0.2.1'] },
      ul:    { x: 405, y: 125, name: 'IP網', kind: 'cloud', lines: ['アンダーレイ'] },
      vtep2: { x: 580, y: 125, name: 'VTEP2', kind: 'sw', lines: ['198.51.100.2'] },
      vmb:   { x: 750, y: 125, name: 'VM-B', kind: 'pc', lines: ['10.1.1.20'] },
    },
    links: [
      { a: 'vma', b: 'vtep1', net: 'DC1' },
      { a: 'vtep1', b: 'ul' },
      { a: 'ul', b: 'vtep2' },
      { a: 'vtep2', b: 'vmb', net: 'DC2' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>VM-A（DC1）と VM-B（DC2）は<b>同じサブネット 10.1.1.0/24</b>。間は L3 の IP ネットワークなので、そのままでは L2 で通信できない。</p>
          <p><b>VXLAN</b> は、L2 フレームを<b>UDP で包んで</b> IP ネットワーク越しに運ぶ。包む・外す役割の機器を <b>VTEP</b> と呼ぶ。</p>
          <ul>
            <li><b>オーバーレイ</b>：VXLAN で作る論理的な L2 ネットワーク</li>
            <li><b>アンダーレイ</b>：実際にパケットを運ぶ IP ネットワーク</li>
          </ul>`,
      },
      {
        title: '① VM-A → VTEP1',
        focus: 'vma', pkt: 'ip', frameGroup: 'inner',
        desc: `<p>VM-A は VM-B が同じサブネットにいると思っているので、<b>VM-B の MAC アドレス宛て</b>に普通の Ethernet フレームを送る。</p>`,
        phases: [[['vma', 'vtep1']]],
        frame: inner,
      },
      {
        title: '② VTEP1 でカプセル化',
        focus: 'vtep1', pkt: 'esp', label: 'VXLAN', noCompare: true,
        desc: `<p>VTEP1 は宛先MAC から「VM-B は VTEP2 の先にいる」と判断し、元のフレームの前に4つのヘッダを付ける。</p>
          <ol>
            <li><b>VXLAN ヘッダ</b>：VNI（どの L2 セグメントか）</li>
            <li><b>外側 UDP</b>：宛先ポート 4789</li>
            <li><b>外側 IP</b>：VTEP1 → VTEP2</li>
            <li><b>外側 Ethernet</b></li>
          </ol>
          <p>増えるのは <b>50 バイト</b>（14 + 20 + 8 + 8）。内側が 1500 バイトなら、アンダーレイの MTU は <b>1550 以上</b>必要（ジャンボフレームを使うのが一般的）。</p>`,
        phases: [[['vtep1', 'ul']]],
        frame: encap,
      },
      {
        title: '③ アンダーレイの転送',
        focus: 'ul', pkt: 'esp', label: 'VXLAN', noCompare: true,
        desc: `<p>アンダーレイのルータは<b>外側 IP ヘッダだけ</b>を見て普通にルーティングする。中に L2 フレームが入っていることは気にしない。</p>
          <p>外側 UDP の送信元ポートは内側フレームのハッシュ値なので、フローごとに値が変わる。これでアンダーレイの <b>ECMP（等コストマルチパス）</b>で負荷分散しやすくなる。</p>
          <p>IPsec と違い、VXLAN 自体には<b>暗号化の機能はない</b>。</p>`,
        phases: [[['ul', 'vtep2']]],
        frame: encap,
      },
      {
        title: '④ VTEP2 で取り出す',
        focus: 'vtep2', pkt: 'ip', frameGroup: 'inner',
        desc: `<p>VTEP2 は外側のヘッダを外し、VNI 5001 のセグメントに元のフレームを流す。VM-B に届くフレームは<b>①と全く同じ</b>（「変化」が出ない）。</p>
          <p>VM 同士から見ると、間に IP ネットワークがあることは分からない。これで VM を別の DC に移動（ライブマイグレーション）しても<b>IP アドレスを変えずに</b>済む。</p>`,
        phases: [[['vtep2', 'vmb']]],
        frame: inner,
      },
      {
        title: '⑤ ブロードキャストは？',
        focus: ['vtep1', 'vtep2'],
        desc: `<p>ARP のようなブロードキャスト・宛先不明・マルチキャスト（<b>BUM トラフィック</b>）は、同じ VNI の全 VTEP に届ける必要がある。方法は主に3つ。</p>
          <ul>
            <li>アンダーレイの <b>IP マルチキャスト</b>で配る</li>
            <li>VTEP が各 VTEP へ<b>ユニキャストで複製</b>して送る（ヘッドエンドレプリケーション）</li>
            <li><b>EVPN</b>（BGP）で MAC / IP の対応を事前に配り、ARP を減らす</li>
          </ul>`,
        links: { 'vtep1-ul': 'tunnel', 'ul-vtep2': 'tunnel' },
      },
      {
        title: 'まとめ',
        desc: `<p>SDN や NFV と組み合わせて、データセンターやクラウドの<b>ネットワーク仮想化</b>の基盤として使われる。</p>`,
        side: {
          title: 'VLAN と VXLAN',
          head: ['', 'VLAN（802.1Q）', 'VXLAN'],
          rows: [
            ['識別子', 'VID 12ビット（約4千）', 'VNI 24ビット（約1600万）'],
            ['範囲', '同じ L2 ネットワーク内', 'IP で届く範囲ならどこでも'],
            ['方式', 'フレームにタグを挿入', 'フレームを UDP でカプセル化'],
            ['オーバーヘッド', '4 バイト', '50 バイト'],
          ],
        },
      },
    ],
  });
})();
