// R4午後Ⅱ問1 テレワーク環境の導入：SSL-VPN で仮想 PC へつなぎ、WAN を ECMP と VRRP で冗長化する
// 機器名・アドレス・コストは問題と変え、L2 スイッチなどは省いて簡略化している。優先度の値は説明用の例。
(() => {
  const toVpn = [[['home', 'net']], [['net', 'fw']], [['fw', 'vpn']]];
  const toHome = [[['vpn', 'fw']], [['fw', 'net']], [['net', 'home']]];

  const methods = {
    title: 'SSL-VPN の3方式',
    head: ['方式', '通せるもの', '専用ソフト'],
    rows: [
      ['リバースプロキシ', 'Web アプリ', '不要'],
      ['ポートフォワーディング', '決まったポート', '必要'],
      ['L2 フォワーディング', '動的ポートのアプリも', '必要'],
    ],
    hit: 1,
    foot: 'RDP（TCP 3389）だけなので、ポートフォワーディングで足りる',
  };

  const userTable = hit => ({
    title: 'ユーザテーブル',
    head: ['利用者ID', '仮想PCのIP'],
    rows: [['E1024', '10.40.0.21'], ['E1031', '10.40.0.22']],
    hit,
    foot: '仮想 PC の起動時に登録される',
  });
  const natTable = {
    title: 'NAT テーブル',
    head: ['接続元（クライアントIP）', '変換前', '変換後'],
    rows: [['10.30.0.5', 'VIP 10.30.1.1', '10.40.0.21']],
    foot: '認証の処理中にエントリを作る',
  };

  const routes = hit => ({
    title: '拠点SW のサーバセグメント宛て経路',
    head: ['回線', '次の転送先', '合計コスト'],
    rows: [
      ['回線A', 'DC-SW1', '40＋15＝55'],
      ['回線A', 'DC-SW2', '40＋15＝55'],
      ['回線B', 'DC-SW1', '40＋15＝55'],
      ['回線B', 'DC-SW2', '40＋15＝55'],
    ],
    hit,
    foot: '出ていくインタフェースのコストだけを足す',
  });

  const vrrp = (sw1, sw2, master) => ({
    title: 'VRRP（優先度は例）',
    head: ['機器', '優先度', '役割'],
    rows: [
      ['DC-SW1', sw1, master === 0 ? 'マスタ' : 'バックアップ'],
      ['DC-SW2', sw2, master === 1 ? 'マスタ' : 'バックアップ'],
    ],
    hit: master,
  });

  const appFrame = (src, dst, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src],
      ['宛先IP', dst, note],
    ]],
  ];

  SCENARIOS.push({
    id: 'r4_pm2_q1',
    title: 'テレワークと WAN の冗長化',
    subtitle: '証明書で本人を確かめて仮想 PC へつなぎ、2回線を ECMP と VRRP で使い切る',
    viewBox: '0 0 900 400',
    nodes: {
      home: { x: 70,  y: 60,  name: '自宅PC', kind: 'pc', lines: ['VPNクライアント'] },
      net:  { x: 250, y: 60,  name: 'インターネット', kind: 'cloud' },
      fw:   { x: 440, y: 60,  name: 'FW', kind: 'fw' },
      vpn:  { x: 620, y: 60,  name: 'VPN装置', kind: 'sv', lines: ['VIP 10.30.1.1'] },
      vdi:  { x: 790, y: 140, name: 'VDIサーバ', kind: 'sv', lines: ['仮想PC 10.40.0.21'] },
      bpc:  { x: 60,  y: 250, name: '拠点PC', kind: 'pc' },
      hq:   { x: 170, y: 250, name: '拠点SW', kind: 'sw' },
      wanA: { x: 310, y: 170, name: '回線A', kind: 'cloud' },
      wanB: { x: 310, y: 330, name: '回線B', kind: 'cloud' },
      dc1:  { x: 480, y: 170, name: 'DC-SW1', kind: 'sw' },
      dc2:  { x: 480, y: 330, name: 'DC-SW2', kind: 'sw' },
      srv:  { x: 660, y: 250, name: '業務サーバ', kind: 'sv' },
    },
    links: [
      { a: 'home', b: 'net' },
      { a: 'net', b: 'fw' },
      { a: 'fw', b: 'vpn' },
      { a: 'fw', b: 'dc1' },
      { a: 'dc1', b: 'vdi' },
      { a: 'bpc', b: 'hq' },
      { a: 'hq', b: 'wanA', cost: '40' },
      { a: 'hq', b: 'wanB', cost: '40' },
      { a: 'wanA', b: 'dc1' },
      { a: 'wanA', b: 'dc2' },
      { a: 'wanB', b: 'dc1' },
      { a: 'wanB', b: 'dc2' },
      { a: 'dc1', b: 'srv', cost: '15' },
      { a: 'dc2', b: 'srv', cost: '15' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>社員が<b>自宅の私物 PC</b> から、DC の<b>自分専用の仮想 PC</b> を画面操作で使う。PC に業務データを残さないのが狙い。</p>
          <p>VPN 装置の用途は RDP（TCP 3389）だけなので、方式は<b>ポートフォワーディング</b>。PC のソフトは <b>localhost:3389</b> で RDP を受けて、トンネルへ中継する。</p>
          <p>あわせて WAN を2回線に増やし、<b>普段から両方を使う</b>構成にする。前半が VPN、後半が冗長化の話。</p>`,
        side: methods,
      },
      {
        title: '① サーバ証明書で接続先を確かめる',
        focus: 'vpn',
        pkt: 'ctl',
        label: 'TLS',
        desc: `<p>TCP 443 で接続し、TLS 1.3 のハンドシェイクを始める。TLS の機能は<b>暗号化・相手の認証・改ざん検知</b>。</p>
          <p>PC がサーバ証明書を検証することで、<b>偽の VPN 装置へつないでしまうリスク</b>を下げる。</p>
          <p>鍵交換は DHE / ECDHE / PSK のいずれか。接続ごとに使い捨ての鍵なら、秘密鍵が漏れても<b>漏れる前の通信</b>はさかのぼって解かれない。</p>`,
        phases: [
          [['home', 'net', { label: 'ClientHello' }]], [['net', 'fw', { label: 'ClientHello' }]], [['fw', 'vpn', { label: 'ClientHello' }]],
          [['vpn', 'fw', { label: 'サーバ証明書' }]], [['fw', 'net', { label: 'サーバ証明書' }]], [['net', 'home', { label: 'サーバ証明書' }]],
        ],
        frame: [
          ['VPN装置 → PC（TLS 1.3）', [
            ['ServerHello', '鍵交換の相手側の値'],
            ['CertificateRequest', 'クライアント証明書を要求'],
            ['Certificate', 'サーバ証明書', 'PC が検証する'],
            ['CertificateVerify', 'サーバの秘密鍵で署名'],
            ['Finished', 'ハンドシェイクの確認'],
          ]],
        ],
        badges: { vpn: '本物か？' },
      },
      {
        title: '② クライアント証明書で本人を確かめる',
        focus: 'home',
        pkt: 'ctl',
        label: '証明書',
        desc: `<p>PC が <b>Certificate</b> でクライアント証明書を送る。ここで初めて、利用者を示す ID（Subject に入れてある）が装置に届く。</p>
          <p>本人と言える根拠は証明書でなく、<b>対になる秘密鍵を本人しか持っていない</b>こと。CertificateVerify の署名がその証明。</p>
          <p>装置は、あらかじめ入れた <b>CA のルート証明書</b>で証明書を検証し、失効リストに<b>シリアル番号</b>がないことも確かめる。</p>`,
        phases: toVpn,
        frame: [
          ['PC → VPN装置（TLS 1.3）', [
            ['Certificate', 'クライアント証明書', 'Subject に利用者ID E1024'],
            ['CertificateVerify', '利用者の秘密鍵で署名'],
            ['Finished', 'ハンドシェイクの確認'],
          ]],
        ],
        badges: { vpn: '検証', home: '秘密鍵' },
      },
      {
        title: '③ 利用者 ID から仮想 PC を決める',
        focus: 'vpn',
        pkt: 'ctl',
        label: 'IP通知',
        desc: `<p>トンネルが確立すると、装置は IP アドレスプールから<b>クライアント IP</b> を配って PC へ通知する。</p>
          <p>行き先の決定に使うのは<b>ユーザテーブル</b>。中身は<b>利用者 ID と仮想 PC の IP アドレスの組</b>で、検索キーは<b>クライアント証明書の利用者 ID</b>。</p>
          <p>引いた結果で NAT テーブルにエントリを作る。これで「VIP 宛てが来たら、この人の仮想 PC へ」が決まる。</p>`,
        phases: toHome,
        links: { 'home-net': 'tunnel', 'net-fw': 'tunnel', 'fw-vpn': 'tunnel' },
        badges: { vpn: 'テーブル作成' },
        side: [userTable(0), natTable],
      },
      {
        title: '④ RDP を VIP 経由で仮想 PC へ',
        focus: ['vpn', 'vdi'],
        pkt: 'esp',
        label: 'RDP',
        desc: `<p>RDP のソフトは <b>localhost:3389</b> へ接続するだけ。VPN のソフトがそれを受けて、トンネル内で <b>VIP の 3389 番</b>へ接続を始める。</p>
          <p>装置は VIP 宛てを <b>DNAT</b> で仮想 PC の IP アドレスへ変換して送る。接続先の違いをアプリに意識させずに、1人1台へ振り分けられる。</p>`,
        phases: [...toVpn, [['vpn', 'fw', { label: 'DNAT後', kind: 'ip' }]], [['fw', 'dc1', { label: 'DNAT後', kind: 'ip' }]], [['dc1', 'vdi', { label: 'DNAT後', kind: 'ip' }]]],
        frame: [
          ['外側（インターネット）', [
            ['宛先IP', '203.0.113.10', 'VPN 装置'],
            ['宛先ポート', 'TCP 443'],
          ], 'plain'],
          ['TLS の中（トンネル内）', [
            ['送信元IP', '10.30.0.5', 'クライアント IP'],
            ['宛先', '10.30.1.1:3389', 'VIP'],
          ], 'enc'],
          ['DNAT の後（DC 内）', [
            ['送信元IP', '10.30.0.5'],
            ['宛先', '10.40.0.21:3389', 'その人の仮想 PC'],
          ]],
        ],
        links: { 'home-net': 'tunnel', 'net-fw': 'tunnel', 'fw-vpn': 'tunnel' },
        side: natTable,
      },
      {
        title: '⑤ コストをそろえて2回線を使う',
        focus: 'hq',
        pkt: 'ip',
        label: '業務通信',
        desc: `<p>後半は社内の通信。コストをそろえるのは、<b>2回線の両方を普段から使う</b>ため（ECMP）。差を付けると片方は待機になる。</p>
          <p>拠点SW から見ると「回線2本×DC-SW 2台」で<b>4経路</b>。コストは<b>出ていくインタフェースだけ</b>足すので 40＋15＝<b>55</b>。</p>
          <p>DC 側の WAN ポートは受信側なので足さない。ここが計算の落とし穴。</p>`,
        phases: [
          [['bpc', 'hq']],
          [['hq', 'wanA'], ['hq', 'wanB']],
          [['wanA', 'dc1'], ['wanA', 'dc2'], ['wanB', 'dc1'], ['wanB', 'dc2']],
          [['dc1', 'srv'], ['dc2', 'srv']],
        ],
        side: routes([0, 1, 2, 3]),
      },
      {
        title: '⑥ パケットごとに振り分けると',
        focus: 'hq',
        pkt: 'ip',
        desc: `<p>パケットごとにランダムに選ぶと、同じ通信のパケットが別々の経路を通る。</p>
          <p>経路の遅延が違えば、<b>到着順序が入れ替わる</b>。TCP では順序の乱れが再送のきっかけになり、通信品質が落ちる。</p>`,
        phases: [
          [['bpc', 'hq', { label: '1番' }]],
          [['hq', 'wanA', { label: '1番' }], ['hq', 'wanB', { label: '2番' }]],
          [['wanA', 'dc1', { label: '1番' }], ['wanB', 'dc2', { label: '2番' }]],
          [['dc1', 'srv', { label: '1番' }], ['dc2', 'srv', { label: '2番' }]],
        ],
        badges: { srv: '順序が乱れる' },
        side: {
          title: '振り分け単位の比較',
          head: ['単位', '順序', '回線の均等さ'],
          rows: [['パケット', '乱れやすい', '均等'], ['IP の組（ハッシュ）', '保たれる', '組が多ければ均等']],
          hit: 0,
        },
      },
      {
        title: '⑦ IP の組で振り分ける',
        focus: 'hq',
        pkt: 'ip',
        desc: `<p>送信元と宛先の IP からハッシュ値を計算して経路を決めると、同じ組は常に同じ経路を通り、<b>順序が入れ替わりにくい</b>。</p>
          <p>それでも均等と言えるのは、PC とサーバの組が多く、<b>ハッシュ値が偏らない</b>から。「仕様に照らして」と問われたら、ハッシュの入力に触れて書く。</p>`,
        phases: [
          [['bpc', 'hq', { label: '組X' }]],
          [['hq', 'wanA', { label: '組X' }], ['hq', 'wanB', { label: '組Y' }]],
          [['wanA', 'dc1', { label: '組X' }], ['wanB', 'dc2', { label: '組Y' }]],
          [['dc1', 'srv', { label: '組X' }], ['dc2', 'srv', { label: '組Y' }]],
        ],
        frame: appFrame('10.60.1.10', '10.50.0.20', 'この2つからハッシュ'),
        side: {
          title: '振り分け単位の比較',
          head: ['単位', '順序', '回線の均等さ'],
          rows: [['パケット', '乱れやすい', '均等'], ['IP の組（ハッシュ）', '保たれる', '組が多ければ均等']],
          hit: 1,
        },
      },
      {
        title: '⑧ 問題：マスタの WAN ポートが切れた',
        focus: 'dc1',
        pkt: 'ip',
        label: '戻り',
        desc: `<p>サーバのデフォルトゲートウェイは VRRP の仮想 IP で、普段は DC-SW1 がマスタ。</p>
          <p>DC-SW1 の回線A 側が切れても、LAN 側は生きていて VRRP の広告は届くので<b>マスタは交代しない</b>。</p>
          <p>サーバからの戻りはすべて DC-SW1 に入り、使えるのは<b>回線B だけ</b>。つながりはするが、<b>分散が失われる</b>。</p>`,
        phases: [[['srv', 'dc1']], [['dc1', 'wanB']], [['wanB', 'hq']], [['hq', 'bpc']]],
        links: { 'wanA-dc1': 'down', 'dc1-srv': 'path', 'wanB-dc1': 'path' },
        badges: { dc1: 'Master', dc2: 'Backup' },
        side: vrrp('120', '100', 0),
      },
      {
        title: '⑨ 対策：トラッキングで優先度を下げる',
        focus: ['dc1', 'dc2'],
        pkt: 'ip',
        label: '戻り',
        desc: `<p>DC-SW1 で WAN 側の2つのポートをトラッキングする。答案に書く動作は、<b>障害を検知したら DC-SW1 の VRRP の優先度を下げる</b>。</p>
          <p>優先度が DC-SW2 より低くなると、DC-SW2 がマスタに代わる（プリエンプトが有効な前提）。</p>
          <p>DC-SW2 は両方の回線につながっているので、<b>戻りの通信も再び2回線に分散</b>される。</p>`,
        phases: [
          [['srv', 'dc2']],
          [['dc2', 'wanA'], ['dc2', 'wanB']],
          [['wanA', 'hq'], ['wanB', 'hq']],
          [['hq', 'bpc']],
        ],
        links: { 'wanA-dc1': 'down', 'dc2-srv': 'path', 'wanA-dc2': 'path', 'wanB-dc2': 'path' },
        badges: { dc1: 'Backup', dc2: 'Master' },
        nodes: { dc2: 'done' },
        side: vrrp('120－30＝90', '100', 1),
      },
    ],
  });
})();
