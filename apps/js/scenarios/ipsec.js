// IPsec VPN：IKE、ESP トンネルモードのカプセル化、NAT トラバーサル【6-4】
(() => {
  const RTA = '203.0.113.1';
  const RTB = '198.51.100.1';
  const TUNNEL = { 'rta-net': 'tunnel', 'net-rtb': 'tunnel' };

  const innerIp = ttl => ['元のIPヘッダ', [
    ['TTL', String(ttl)],
    ['プロトコル', '6', 'TCP'],
    ['送信元IP', '192.168.1.10', 'PC-A'],
    ['宛先IP', '192.168.2.10', 'Server'],
  ]];
  const innerTcp = ['TCPヘッダ＋データ', [
    ['送信元ポート', '50000'],
    ['宛先ポート', '80', 'HTTP'],
    ['データ', 'GET /index.html ...'],
  ]];

  const outerIp = proto => ['新IPヘッダ', [
    ['TTL', '64'],
    ['プロトコル', ...proto],
    ['送信元IP', RTA, 'RT-A 外側'],
    ['宛先IP', RTB, 'RT-B 外側'],
  ], 'plain'];
  const espHeader = ['ESPヘッダ', [
    ['SPI', '0x00002001', 'どの SA かを示す'],
    ['シーケンス番号', '1', 'リプレイ攻撃対策'],
  ], 'auth'];
  const espTrailer = ['ESPトレーラ', [
    ['パディング', '0〜255 バイト'],
    ['次ヘッダ', '4', 'IPv4（中身はIPパケット）'],
  ], 'enc'];
  const espAuth = ['ESP認証データ', [
    ['ICV', 'HMAC 値', 'ESPヘッダ〜トレーラの改ざん検知'],
  ], 'plain'];

  const encFrame = [
    outerIp(['50', 'ESP']),
    espHeader,
    [...innerIp(63), 'enc'],
    [...innerTcp, 'enc'],
    espTrailer,
    espAuth,
  ];

  // 盗聴者から見える姿：暗号化部分は読めない
  const hidden = sec => [sec[0], sec[1].map(([k]) => [k, '？？？（暗号化されて読めない）']), sec[2]];
  const sniffFrame = encFrame.map(sec => (sec[2] === 'enc' ? hidden(sec) : sec));

  const saTable = {
    title: 'RT-A の IPsec SA（片方向ずつ）',
    head: ['方向', 'SPI', '暗号', '認証'],
    rows: [
      ['送信（RT-A → RT-B）', '0x00002001', 'AES-256', 'HMAC-SHA-256'],
      ['受信（RT-B → RT-A）', '0x00001001', 'AES-256', 'HMAC-SHA-256'],
    ],
  };

  SCENARIOS.push({
    id: 'ipsec',
    chapter: 15,
    title: 'IPsec VPN',
    subtitle: 'ESP トンネルモードで、元のパケットがどう包まれ、どこが暗号化されるか',
    nodes: {
      pca: { x: 60,  y: 125, name: 'PC-A', kind: 'pc', lines: ['192.168.1.10'] },
      rta: { x: 240, y: 125, name: 'RT-A', kind: 'rt', lines: ['内: 192.168.1.1', `外: ${RTA}`] },
      net: { x: 408, y: 125, name: 'インターネット', kind: 'cloud' },
      rtb: { x: 575, y: 125, name: 'RT-B', kind: 'rt', lines: [`外: ${RTB}`, '内: 192.168.2.1'] },
      sv:  { x: 762, y: 125, name: 'Server', kind: 'sv', lines: ['192.168.2.10'] },
    },
    links: [
      { a: 'pca', b: 'rta', net: '192.168.1.0/24' },
      { a: 'rta', b: 'net' },
      { a: 'net', b: 'rtb' },
      { a: 'rtb', b: 'sv', net: '192.168.2.0/24' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>拠点A（192.168.1.0/24）と拠点B（192.168.2.0/24）を、インターネット経由の <b>IPsec VPN</b> でつなぐ。暗号化と復号は RT-A・RT-B が行う（拠点間 VPN）。</p>
          <p>注目点：</p>
          <ul>
            <li><b>新しい IP ヘッダ</b>がどこに付くか</li>
            <li><b>暗号化される範囲</b>と<b>認証（改ざん検知）される範囲</b>の違い</li>
            <li>インターネット上の第三者から<b>何が見えるか</b></li>
          </ul>`,
      },
      {
        title: '① IKE でSAを確立',
        focus: ['rta', 'rtb'],
        pkt: 'ctl',
        label: 'IKE',
        noCompare: true,
        desc: `<p>暗号化通信の前に、RT-A と RT-B が <b>IKE（UDP 500）</b>で交渉する。</p>
          <ol>
            <li><b>IKE SA</b>：暗号方式の合意、<b>DH 鍵交換</b>、相互認証（事前共有鍵や証明書）。以降の交渉を守る</li>
            <li><b>IPsec SA</b>：実際のデータを守る鍵と方式を決める</li>
          </ol>
          <p>IPsec SA は<b>片方向</b>なので、送信用と受信用の2つができる。それぞれを <b>SPI</b> で区別する。</p>`,
        phases: [[['rta', 'net']], [['net', 'rtb']], [['rtb', 'net']], [['net', 'rta']]],
        frame: [
          ['IPv4ヘッダ', [
            ['プロトコル', '17', 'UDP'],
            ['送信元IP', RTA, 'RT-A 外側'],
            ['宛先IP', RTB, 'RT-B 外側'],
          ]],
          ['UDPヘッダ', [
            ['送信元ポート', '500'],
            ['宛先ポート', '500', 'IKE'],
          ]],
          ['IKE', [
            ['内容', '暗号方式の提案・DH公開値・認証情報'],
          ]],
        ],
        links: TUNNEL,
        side: saTable,
      },
      {
        title: '② PC-A → RT-A',
        focus: 'pca',
        pkt: 'ip',
        frameGroup: 'inner',
        desc: `<p>PC-A は Server（192.168.2.10）宛てに<b>普通のパケット</b>を送る。PC-A は VPN を意識しない。</p>
          <p>宛先は<b>プライベートアドレス</b>なので、このままではインターネットに出せない。</p>`,
        phases: [[['pca', 'rta']]],
        frame: [innerIp(64), innerTcp],
        links: TUNNEL,
      },
      {
        title: '③ RT-A でカプセル化',
        focus: 'rta',
        pkt: 'esp',
        noCompare: true,
        desc: `<p>RT-A は宛先 192.168.2.0/24 が VPN の対象（セキュリティポリシーに一致）と判断し、<b>トンネルモード</b>で処理する。</p>
          <ol>
            <li>元のIPパケット<b>全体</b>（IPヘッダ含む）の後ろに ESP トレーラを付けて<b>暗号化</b></li>
            <li>前に <b>ESP ヘッダ</b>（SPI・シーケンス番号）を付ける</li>
            <li>ESP ヘッダ〜トレーラの <b>ICV</b> を計算して末尾に付ける</li>
            <li>先頭に<b>新しい IP ヘッダ</b>（RT-A → RT-B のグローバルアドレス、プロトコル 50）を付ける</li>
          </ol>
          <p>右のフレームの見出しにある「暗号化＋認証」「認証のみ」「保護対象外」で範囲を確認しよう。</p>`,
        phases: [[['rta', 'net']]],
        frame: encFrame,
        links: TUNNEL,
        side: saTable,
      },
      {
        title: '④ インターネット上',
        focus: 'net',
        pkt: 'esp',
        noCompare: true,
        desc: `<p>インターネット上の第三者がこのパケットを盗聴しても、見えるのは<b>新IPヘッダ（RT-A と RT-B のアドレス）と ESP ヘッダ</b>だけ。</p>
          <p>本当の通信相手（192.168.1.10 → 192.168.2.10）や、ポート番号・データの中身は<b>暗号化されていて読めない</b>。</p>
          <p>途中で書き換えられた場合は、RT-B で ICV の検証に失敗するので破棄される。</p>`,
        phases: [[['net', 'rtb']]],
        frame: sniffFrame,
        links: TUNNEL,
      },
      {
        title: '⑤ RT-B で復号',
        focus: 'rtb',
        pkt: 'ip',
        frameGroup: 'inner',
        desc: `<p><b>RT-B</b>：SPI で SA を特定 → <b>ICV を検証</b>（改ざんチェック）→ シーケンス番号を確認（リプレイ対策）→ <b>復号</b>。</p>
          <p>中から元の IP パケットを取り出し、通常どおりルーティングして Server へ転送する。</p>
          <p>右のフレームは②と比べて <b>TTL 以外は同じ</b>。RT-A と RT-B でそれぞれ 1 ずつ減った（インターネット上のルータは中の TTL に触れない）。</p>`,
        phases: [[['rtb', 'sv']]],
        frame: [innerIp(62), innerTcp],
        links: TUNNEL,
      },
      {
        title: '⑥ NATトラバーサル',
        focus: 'rta',
        pkt: 'esp',
        label: 'UDP+ESP',
        noCompare: true,
        desc: `<p>RT-A が<b>NAPT ルータの内側</b>にある場合、問題が起きる。ESP には<b>ポート番号がない</b>ので、NAPT は変換できない。</p>
          <p><b>NAT トラバーサル（NAT-T）</b>：IKE の交渉中に経路上の NAT を検出すると、ESP パケットを <b>UDP 4500 番</b>で包んで送る。NAPT は UDP のポート番号を変換できるので通過できる。IKE 自体も 4500 番に切り替わる。</p>
          <p>AH は<b>外側の IP ヘッダまで認証</b>するので、アドレスを書き換える NAT とは根本的に両立しない。</p>`,
        phases: [[['rta', 'net']], [['net', 'rtb']]],
        frame: [
          outerIp(['17', 'UDP']),
          ['UDPヘッダ', [
            ['送信元ポート', '4500'],
            ['宛先ポート', '4500', 'NAT-T'],
          ], 'plain'],
          espHeader,
          [...innerIp(63), 'enc'],
          [...innerTcp, 'enc'],
          espTrailer,
          espAuth,
        ],
        links: TUNNEL,
      },
      {
        title: 'まとめ',
        desc: `<p>午後で問われるポイントを表にまとめた。</p>
          <p>FW で IPsec を通すときに許可するもの：<b>UDP 500（IKE）</b>、<b>プロトコル番号 50（ESP）</b>、NAT-T を使うなら <b>UDP 4500</b>。</p>`,
        side: [
          {
            title: 'AH と ESP',
            head: ['', 'AH（51）', 'ESP（50）'],
            rows: [
              ['暗号化', 'しない', 'する'],
              ['認証の範囲', '外側IPヘッダの不変部分も含む', 'ESPヘッダ〜トレーラ'],
              ['NAT との相性', '使えない', 'NAT-T で通過可能'],
            ],
          },
          {
            title: 'トンネルモードとトランスポートモード',
            head: ['', 'トンネル', 'トランスポート'],
            rows: [
              ['新IPヘッダ', '付ける', '付けない（元のIPヘッダを使う）'],
              ['暗号化の範囲', '元のIPヘッダ＋データ', 'データ部分のみ'],
              ['主な用途', '拠点間 VPN（ルータ間）', '端末間の通信'],
            ],
          },
        ],
      },
    ],
  });
})();
