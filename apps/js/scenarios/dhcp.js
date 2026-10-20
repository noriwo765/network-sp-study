// DHCP：DORA とリレーエージェント【ジャンル5】【2-2(1) アドレス設計】
(() => {
  const PCMAC = ['02:00:00:00:00:0a', 'PC'];
  const GW = '192.168.10.1';
  const SRV = '10.0.0.5';
  const YI = '192.168.10.100';

  // 同じ項目名で並べ、リレー前後の違いが「変化」として出るようにする
  function frame({ src, dst, sport, dport, msg, yiaddr = '0.0.0.0', giaddr = '0.0.0.0', opts }) {
    return [
      ['IPv4ヘッダ', [['送信元IP', ...src], ['宛先IP', ...dst]]],
      ['UDPヘッダ', [['送信元ポート', sport], ['宛先ポート', dport]]],
      ['DHCP', [
        ['メッセージ', msg],
        ['xid', '0x3903f326', 'トランザクションID'],
        ['chaddr', ...PCMAC],
        ['yiaddr', yiaddr, '割り当てるIP'],
        ['giaddr', giaddr, 'リレーエージェント'],
        ...(opts || []),
      ]],
    ];
  }
  const OFFER_OPTS = [
    ['オプション', `マスク 255.255.255.0 / ルータ ${GW} / DNS 192.168.10.53 / リース 86400秒`],
  ];

  SCENARIOS.push({
    id: 'dhcp',
    chapter: 4,
    title: 'DHCP',
    subtitle: 'IP アドレスが自動で割り当てられるまで（DORA）と、ルータを越えるリレーエージェント',
    nodes: {
      pc:   { x: 90,  y: 125, name: 'PC', kind: 'pc', lines: ['IP 未設定', '02:00:00:00:00:0a'] },
      l3:   { x: 390, y: 125, name: 'L3SW', kind: 'rt', lines: [`${GW}（VLAN10）`, 'DHCP リレー'] },
      srv:  { x: 690, y: 125, name: 'DHCP', kind: 'sv', lines: [SRV] },
    },
    links: [
      { a: 'pc', b: 'l3', net: '192.168.10.0/24' },
      { a: 'l3', b: 'srv', net: '10.0.0.0/24' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>PC はまだ IP アドレスを持っていない。DHCP サーバは<b>別のネットワーク</b>（10.0.0.0/24）にある。</p>
          <p>DHCP は次の4つのメッセージでアドレスを決める（<b>DORA</b>）。</p>
          <ol><li>Discover</li><li>Offer</li><li>Request</li><li>Ack</li></ol>
          <p>PC は最初<b>ブロードキャスト</b>しか使えないが、ブロードキャストは<b>ルータを越えられない</b>。そこで L3SW が<b>DHCP リレーエージェント</b>として中継する。</p>`,
      },
      {
        title: '① Discover',
        focus: 'pc', pkt: 'ctl', label: 'Discover', frameGroup: 'dr',
        desc: `<p>PC が DHCP サーバを探す。自分のアドレスがないので<b>送信元は 0.0.0.0</b>、宛先は<b>255.255.255.255</b>（ブロードキャスト）。</p>
          <p>ポートはクライアントが <b>68</b>、サーバが <b>67</b>（UDP）。</p>`,
        phases: [[['pc', 'l3']]],
        frame: frame({ src: ['0.0.0.0', 'アドレスなし'], dst: ['255.255.255.255', 'ブロードキャスト'], sport: '68', dport: '67', msg: 'DHCPDISCOVER' }),
      },
      {
        title: '② リレー',
        focus: 'l3', pkt: 'ctl', label: 'Discover', frameGroup: 'dr',
        desc: `<p><b>L3SW（リレーエージェント）</b>は、受け取ったブロードキャストを DHCP サーバ宛ての<b>ユニキャスト</b>に変えて転送する。</p>
          <p><b>giaddr</b> に受信したインタフェースのアドレス（${GW}）を入れるのがポイント。DHCP サーバは giaddr を見て、<b>どのネットワーク用のアドレスプール（スコープ）</b>から割り当てるかを決める。</p>`,
        phases: [[['l3', 'srv']]],
        frame: frame({ src: [GW, 'L3SW'], dst: [SRV, 'DHCP サーバ'], sport: '67', dport: '67', msg: 'DHCPDISCOVER', giaddr: GW }),
        side: {
          title: 'DHCP サーバのスコープ',
          head: ['スコープ', '範囲', '選択'],
          rows: [['192.168.10.0/24', '.100〜.199', 'giaddr が一致'], ['192.168.20.0/24', '.100〜.199', '']],
          hit: 0,
        },
      },
      {
        title: '③ Offer',
        focus: 'srv', pkt: 'ctl', label: 'Offer', frameGroup: 'oa',
        desc: `<p>DHCP サーバが<b>割り当て候補</b>（yiaddr = ${YI}）とネットワーク設定（マスク、デフォルトゲートウェイ、DNS、リース期間）を提示する。</p>
          <p>リレーエージェント経由で PC に届く。右は L3SW から PC への区間のフレーム。</p>`,
        phases: [[['srv', 'l3']], [['l3', 'pc']]],
        frame: frame({ src: [GW, 'L3SW'], dst: ['255.255.255.255', 'ブロードキャスト'], sport: '67', dport: '68', msg: 'DHCPOFFER', yiaddr: YI, giaddr: GW, opts: OFFER_OPTS }),
      },
      {
        title: '④ Request',
        focus: 'pc', pkt: 'ctl', label: 'Request', frameGroup: 'dr',
        desc: `<p>PC が「このアドレスを使います」と申し込む。まだアドレスが確定していないので<b>ブロードキャスト</b>。</p>
          <p>ブロードキャストにする理由：DHCP サーバが複数あって複数の Offer を受け取った場合に、<b>選ばなかったサーバにも結果を知らせる</b>ため（サーバ識別子オプションでどのサーバを選んだかを示す）。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'srv']]],
        frame: frame({ src: ['0.0.0.0', 'アドレスなし'], dst: ['255.255.255.255', 'ブロードキャスト'], sport: '68', dport: '67', msg: 'DHCPREQUEST', opts: [['オプション', `要求IP ${YI} / サーバ識別子 ${SRV}`]] }),
      },
      {
        title: '⑤ Ack',
        focus: 'pc', pkt: 'ctl', label: 'Ack', frameGroup: 'oa',
        desc: `<p>DHCP サーバが割り当てを確定する。PC はアドレスを設定する前に、<b>ARP でそのアドレスを使っている端末がいないか</b>確認することが多い（重複検出）。</p>`,
        phases: [[['srv', 'l3']], [['l3', 'pc']]],
        frame: frame({ src: [GW, 'L3SW'], dst: ['255.255.255.255', 'ブロードキャスト'], sport: '67', dport: '68', msg: 'DHCPACK', yiaddr: YI, giaddr: GW, opts: OFFER_OPTS }),
        side: {
          title: 'PC に設定された内容',
          head: ['項目', '値'],
          rows: [['IP アドレス', YI], ['サブネットマスク', '255.255.255.0'], ['デフォルトゲートウェイ', GW], ['DNS サーバ', '192.168.10.53'], ['リース期間', '86400 秒（24時間）']],
        },
      },
      {
        title: '⑥ リース更新',
        focus: 'pc', pkt: 'ctl', label: 'Request', noCompare: true,
        desc: `<p>リース期間の <b>50%（T1）</b>が経つと、PC は DHCP サーバに<b>ユニキャスト</b>で直接 Request を送って延長する。今は自分のアドレスがあるので、リレーではなく<b>普通にルーティング</b>されて届く。</p>
          <p>応答がないまま <b>87.5%（T2）</b>になると、ブロードキャストで任意のサーバに延長を求める（リバインド）。期限が切れるとアドレスを手放す。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'srv']], [['srv', 'l3', { label: 'Ack' }]], [['l3', 'pc', { label: 'Ack' }]]],
        frame: [
          ['IPv4ヘッダ', [['送信元IP', YI, 'PC'], ['宛先IP', SRV, 'DHCP サーバ']]],
          ['DHCP', [['メッセージ', 'DHCPREQUEST', '更新'], ['ciaddr', YI, '使用中のアドレス']]],
        ],
      },
      {
        title: 'まとめ',
        desc: `<p>午後で問われるポイント：</p>
          <ul>
            <li>DHCP サーバを別セグメントに置くなら、各 VLAN の L3SW / ルータに<b>リレーエージェント</b>（ヘルパーアドレス）の設定が必要</li>
            <li>サーバは <b>giaddr</b> でスコープを選ぶ</li>
            <li>不正な DHCP サーバ対策に <b>DHCP スヌーピング</b>（信頼ポート以外からの Offer / Ack を遮断）</li>
            <li>DHCP サーバを冗長化するときは、アドレスが重複しないようにスコープを分ける</li>
          </ul>`,
        side: {
          title: 'DORA のアドレスとポート（PC 側の区間）',
          head: ['メッセージ', '送信元 → 宛先', 'ポート'],
          rows: [
            ['Discover', '0.0.0.0 → 255.255.255.255', '68 → 67'],
            ['Offer', 'サーバ（リレー）→ PC', '67 → 68'],
            ['Request', '0.0.0.0 → 255.255.255.255', '68 → 67'],
            ['Ack', 'サーバ（リレー）→ PC', '67 → 68'],
          ],
          foot: 'Offer / Ack はクライアントの指定によりユニキャストで届く場合もある',
        },
      },
    ],
  });
})();
