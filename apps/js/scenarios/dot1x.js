// IEEE 802.1X：EAP-TLS による認証とダイナミック VLAN【6-6】
(() => {
  const eapol = (code, type) => [
    ['Ethernetヘッダ', [
      ['宛先MAC', '01:80:c2:00:00:03', 'PAE グループアドレス'],
      ['タイプ', '0x888e', 'EAPOL'],
    ]],
    ['EAP', [['コード', code], ['タイプ', type]]],
  ];
  const radius = (code, attrs) => [
    ['UDPヘッダ', [['宛先ポート', '1812', 'RADIUS 認証']]],
    ['RADIUS', [['コード', code], ...attrs]],
  ];
  const port = (state, vlan, hit) => ({
    title: 'L2SW のポート状態',
    head: ['ポート', '状態', '通せるもの', 'VLAN'],
    rows: [['p1（PC）', state, state === '認証済み' ? 'すべて' : 'EAPOL のみ', vlan]],
    hit,
  });

  SCENARIOS.push({
    id: 'dot1x',
    chapter: 9,
    title: '802.1X',
    subtitle: '認証に成功した端末だけを LAN につなぐ。EAP-TLS とダイナミック VLAN',
    nodes: {
      pc:  { x: 80,  y: 125, name: 'PC', kind: 'pc', lines: ['サプリカント'] },
      sw:  { x: 330, y: 125, name: 'L2SW', kind: 'sw', lines: ['オーセンティケータ'] },
      rad: { x: 600, y: 45,  name: 'RADIUS', kind: 'sv', lines: ['認証サーバ'] },
      lan: { x: 600, y: 205, name: '業務LAN', kind: 'cloud', lines: [] },
    },
    links: [
      { a: 'pc', b: 'sw', net: 'EAPOL' },
      { a: 'sw', b: 'rad', net: 'RADIUS', ldx: 30, ldy: 0 },
      { a: 'sw', b: 'lan', net: 'VLAN10', ldx: 30, ldy: 0 },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>802.1X は、LAN の<b>ポートにつないだだけでは通信させず</b>、認証に成功した端末だけを通す仕組み。登場人物は3つ。</p>
          <ul>
            <li><b>サプリカント</b>：認証を受ける端末（のソフトウェア）</li>
            <li><b>オーセンティケータ</b>：L2SW や無線 AP。認証を仲介し、結果に従ってポートを開閉する</li>
            <li><b>認証サーバ</b>：RADIUS サーバ。認証の可否を判断する</li>
          </ul>
          <p>認証方式（EAP の種類）はオーセンティケータを素通りし、<b>サプリカントと認証サーバの間</b>で決まる。</p>`,
        side: port('未認証', '-'),
      },
      {
        title: '① 認証の開始',
        focus: 'pc', pkt: 'ctl', noCompare: true,
        desc: `<p>PC をポートにつなぐと、PC が <b>EAPOL-Start</b> を送り、L2SW が <b>EAP-Request/Identity</b>（あなたは誰？）で応じる。</p>
          <p>サプリカントとオーセンティケータの間は、EAP を Ethernet に直接載せた <b>EAPOL</b>（タイプ 0x888E）。この時点ではポートは未認証なので、<b>EAPOL 以外は破棄</b>される。</p>`,
        phases: [[['pc', 'sw', { label: 'EAPOL-Start' }]], [['sw', 'pc', { label: 'EAP-Req/ID' }]]],
        frame: eapol('1（Request）', '1（Identity）'),
        side: port('未認証', '-', 0),
      },
      {
        title: '② ID を RADIUS へ',
        focus: 'sw', pkt: 'ctl', noCompare: true,
        desc: `<p>PC が ID（ユーザ名）を返す。L2SW は EAP メッセージを <b>RADIUS の Access-Request</b> に入れて認証サーバに転送する（EAP-Message 属性）。</p>
          <p>オーセンティケータと認証サーバの間は <b>RADIUS（UDP 1812）</b>。両者は<b>共有シークレット</b>で互いを確認する。</p>`,
        phases: [[['pc', 'sw', { label: 'EAP-Res/ID' }]], [['sw', 'rad', { label: 'Access-Request' }]]],
        frame: radius('1（Access-Request）', [
          ['User-Name', 'user01'],
          ['EAP-Message', 'EAP-Response/Identity'],
          ['NAS-Port', 'p1'],
        ]),
        side: port('未認証', '-', 0),
      },
      {
        title: '③ EAP-TLS で相互認証',
        focus: ['pc', 'rad'], pkt: 'ctl', label: 'TLS', noCompare: true,
        desc: `<p>PC と RADIUS サーバの間で <b>TLS ハンドシェイク</b>を行う。L2SW は EAPOL ⇔ RADIUS（Access-Challenge / Access-Request）の詰め替えをするだけ。</p>
          <ul>
            <li>PC は RADIUS の<b>サーバ証明書</b>を検証する（偽の認証サーバ対策）</li>
            <li>RADIUS は PC の<b>クライアント証明書</b>を検証する</li>
          </ul>
          <p>双方が証明書で確認し合う<b>相互認証</b>。パスワードを使わないので安全だが、全端末へのクライアント証明書の配布・管理が必要。</p>`,
        phases: [
          [['rad', 'sw', { label: 'サーバ証明書' }]], [['sw', 'pc', { label: 'サーバ証明書' }]],
          [['pc', 'sw', { label: 'クライアント証明書' }]], [['sw', 'rad', { label: 'クライアント証明書' }]],
        ],
        frame: radius('11（Access-Challenge）', [['EAP-Message', 'EAP-Request/TLS（サーバ証明書）']]),
        side: port('未認証', '-', 0),
      },
      {
        title: '④ 認証成功・VLAN 割当',
        focus: 'sw', pkt: 'ctl', noCompare: true,
        desc: `<p>RADIUS サーバが <b>Access-Accept</b> を返し、L2SW は PC に EAP-Success を送ってポートを<b>認証済み</b>にする。</p>
          <p>Access-Accept に <b>VLAN の指定</b>を入れると、L2SW はポートをその VLAN に所属させる（<b>ダイナミック VLAN</b>）。部署やユーザごとに、どのポートにつないでも同じ VLAN に入れられる。</p>`,
        phases: [[['rad', 'sw', { label: 'Access-Accept' }]], [['sw', 'pc', { label: 'EAP-Success' }]]],
        frame: radius('2（Access-Accept）', [
          ['EAP-Message', 'EAP-Success'],
          ['Tunnel-Type', '13', 'VLAN'],
          ['Tunnel-Medium-Type', '6', '802'],
          ['Tunnel-Private-Group-ID', '10', 'VLAN ID'],
        ]),
        side: port('認証済み', '10', 0),
      },
      {
        title: '⑤ 通信開始',
        focus: 'pc', pkt: 'ip',
        desc: `<p>ポートが開いたので、PC は業務 LAN（VLAN10）と通信できる。通常はここから DHCP でアドレスを取得する。</p>
          <p>無線 LAN（WPA2/WPA3 エンタープライズ）でも同じ流れで、認証成功後に暗号鍵を作る（4ウェイハンドシェイク）。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'lan']]],
        links: { 'pc-sw': 'path', 'sw-lan': 'path' },
        side: port('認証済み', '10'),
      },
      {
        title: '⑥ 認証失敗の場合',
        focus: 'sw', pkt: 'ip', noCompare: true,
        desc: `<p>証明書がない（または失効している）私物 PC をつないだ場合、RADIUS サーバは <b>Access-Reject</b> を返す。</p>
          <p>ポートは未認証のままなので、PC が送る通常のフレームは L2SW で<b>破棄</b>される。認証に失敗した端末をインターネット接続だけの<b>ゲスト VLAN</b> や検疫用 VLAN に入れる設計もある。</p>`,
        phases: [
          [['rad', 'sw', { label: 'Access-Reject', kind: 'ctl' }]],
          [['sw', 'pc', { label: 'EAP-Failure', kind: 'ctl' }]],
          [['pc', 'sw', { label: 'IP', drop: true }]],
        ],
        frame: radius('3（Access-Reject）', [['EAP-Message', 'EAP-Failure']]),
        side: port('未認証', '-', 0),
      },
      {
        title: 'まとめ',
        desc: `<p>午後では「どの機器にどんな証明書を入れるか」「RADIUS サーバに登録するのは何か（オーセンティケータの IP と共有シークレット）」がよく問われる。</p>`,
        side: {
          title: '主な EAP の種類',
          head: ['方式', 'サーバ認証', 'クライアント認証', '特徴'],
          rows: [
            ['EAP-TLS', 'サーバ証明書', 'クライアント証明書', '最も安全。証明書の配布が必要'],
            ['PEAP', 'サーバ証明書', 'ID / パスワード（TLS トンネル内）', 'クライアント証明書が不要'],
            ['EAP-TTLS', 'サーバ証明書', 'ID / パスワードなど（TLS トンネル内）', 'PEAP と同様の考え方'],
          ],
        },
      },
    ],
  });
})();
