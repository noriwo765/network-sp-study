// R4午後Ⅰ問2 セキュアゲートウェイサービスの導入：VRF で経路を分ける IPsec から、SGW への接続へ
(() => {
  const vrfTable = (title, rows, hit) => ({
    title,
    head: ['VRF', '宛先', '次の宛先', '方式'],
    rows,
    hit,
  });
  const honsha = hit => vrfTable('本社ルータの経路', [
    ['64512:10', '0.0.0.0/0', 'ISP', '静的'],
    ['64512:20', '0.0.0.0/0', 'L3SW', 'OSPF'],
    ['64512:20', '10.20.1.0/24', 'トンネルIF', '静的'],
  ], hit);
  const eigyo = hit => vrfTable('営業所ルータの経路', [
    ['64512:10', '0.0.0.0/0', 'ISP', '静的'],
    ['64512:20', '0.0.0.0/0', 'トンネルIF', '静的'],
  ], hit);

  const ipFrame = (src, dst, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src, note],
      ['宛先IP', dst],
    ]],
    ['TCP', [['宛先ポート', '443', 'HTTPS']]],
  ];
  const espFrame = (outerSrc, outerDst, spi) => [
    ['新しいIPヘッダ', [
      ['送信元IP', outerSrc],
      ['宛先IP', outerDst],
      ['プロトコル', '50', 'ESP'],
    ], 'plain'],
    ['ESPヘッダ', [
      ['SPI', spi, 'Child SA を識別'],
      ['シーケンス番号', '連番'],
    ], 'auth'],
    ['元のIPパケット', [
      ['送信元IP', '10.20.1.15'],
      ['宛先IP', '192.0.2.50', 'SaaS'],
    ], 'enc'],
    ['ESPトレーラ', [['パディング', '長さの調整']], 'enc'],
    ['ESP認証データ', [['ICV', '改ざんの検知']], 'plain'],
  ];

  const allow = (hit, added) => ({
    title: 'SaaS の許可リスト',
    head: ['送信元', '通す相手'],
    rows: added
      ? [['192.0.2.200', 'SGW の NAPT 用（自社専用か要確認）']]
      : [['203.0.113.10', '本社 FW の外側']],
    hit,
  });

  SCENARIOS.push({
    id: 'r4_pm1_q2',
    title: 'VRF の拠点間 VPN から SGW サービスへ',
    subtitle: '本社に集めていた通信を、IPsec で SGW へ向ける変化を経路とヘッダで追う',
    viewBox: '0 0 900 360',
    nodes: {
      pcb:  { x: 60,  y: 290, name: '営業所PC', kind: 'pc', lines: ['10.20.1.15'] },
      rtb:  { x: 200, y: 290, name: '営業所RT', kind: 'rt', lines: ['外側は動的IP'] },
      inet: { x: 430, y: 190, name: 'インターネット', kind: 'cloud' },
      rth:  { x: 600, y: 290, name: '本社RT', kind: 'rt', lines: ['203.0.113.20'] },
      l3:   { x: 730, y: 290, name: 'L3SW', kind: 'sw' },
      fw:   { x: 730, y: 170, name: 'FW', kind: 'fw', lines: ['203.0.113.10'], linesAbove: true },
      hpc:  { x: 855, y: 290, name: '本社PC', kind: 'pc' },
      saas: { x: 430, y: 60,  name: 'SaaS', kind: 'sv', lines: ['192.0.2.50'], linesAbove: true },
      sgw:  { x: 200, y: 90,  name: 'SGW', kind: 'fw', lines: ['POP・FW機能'], linesAbove: true },
      paas: { x: 60,  y: 90,  name: 'PaaS', kind: 'sv' },
      tpc:  { x: 60,  y: 195, name: '在宅PC', kind: 'pc' },
    },
    links: [
      { a: 'pcb', b: 'rtb' },
      { a: 'rtb', b: 'inet' },
      { a: 'inet', b: 'rth' },
      { a: 'rth', b: 'l3' },
      { a: 'l3', b: 'hpc' },
      { a: 'l3', b: 'fw' },
      { a: 'fw', b: 'inet' },
      { a: 'inet', b: 'saas' },
      { a: 'inet', b: 'sgw' },
      { a: 'sgw', b: 'paas' },
      { a: 'tpc', b: 'inet' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>本社と営業所を IPsec VPN で結び、営業所の PC も<b>本社の FW を通って</b> SaaS を使っている。</p>
          <p>各ルータは <b>VRF</b> で<b>ルーティングテーブルを2つ</b>持つ。1つの表には 0.0.0.0/0 を2本入れて使い分けられないので、外側と内側で表を分ける。</p>
          <p>この後、社員の在宅勤務に備えて SGW サービスへ移す。まず今の流れを押さえる。</p>`,
        badges: { rth: 'VRF×2', rtb: 'VRF×2' },
        side: [honsha(), eigyo()],
      },
      {
        title: '① 営業所からトンネルへ',
        focus: 'rtb',
        pkt: 'esp',
        label: 'ESP',
        desc: `<p>営業所の PC が SaaS へ送る。営業所ルータは LAN 側 VRF の表を引き、0.0.0.0/0 の<b>トンネル IF</b> へ出す。この経路は手で入れた<b>静的経路</b>。</p>
          <p>ESP で包んだ後の外側のパケットは、外側 VRF の表で ISP へ出る。1台の中で2回、別の表を引いている。</p>`,
        phases: [[['pcb', 'rtb', { kind: 'ip', label: 'IP' }]], [['rtb', 'inet']], [['inet', 'rth']]],
        links: { 'rtb-inet': 'tunnel', 'inet-rth': 'tunnel' },
        side: eigyo(1),
      },
      {
        title: '② 本社ルータで引く表',
        focus: 'rth',
        pkt: 'ip',
        label: 'IP',
        desc: `<p>復号したパケットは<b>トンネル IF が属する VRF 64512:20</b> の表で引く。宛先は SaaS なので <b>0.0.0.0/0</b> に一致する。</p>
          <p>次の宛先は <b>L3SW</b>。FW が OSPF に流したデフォルトルートを学習したもの。これで営業所の通信も本社の FW に集まる。</p>`,
        phases: [[['rth', 'l3']], [['l3', 'fw']]],
        links: { 'inet-rth': 'tunnel' },
        frame: ipFrame('10.20.1.15', '192.0.2.50', 'まだ変換前'),
        side: honsha(1),
      },
      {
        title: '③ NAPT と SaaS の制限',
        focus: ['fw', 'saas'],
        pkt: 'ip',
        label: 'IP',
        desc: `<p>FW は送信元を<b>外側のアドレス 203.0.113.10</b> に変換する。SaaS から見える送信元はこれだけなので、許可リストに<b>このアドレス</b>を登録している。</p>
          <p>本社 FW を通らない接続は、送信元が違うので SaaS に拒否される。</p>`,
        phases: [[['fw', 'inet']], [['inet', 'saas']]],
        frame: ipFrame('203.0.113.10', '192.0.2.50', 'NAPT 後'),
        badges: { saas: '許可IPのみ' },
        side: allow(0, false),
      },
      {
        title: '④ 外側 VRF のデフォルトルート',
        focus: 'rth',
        pkt: 'ctl',
        label: 'IKE',
        desc: `<p>本社ルータの外側 VRF には、ISP 向けの静的なデフォルトルートがある。必要な理由は<b>営業所ルータの外側アドレスが ISP から動的に割り当てられる</b>から。</p>
          <p>相手のアドレスが固定なら個別の経路で足りるが、変わるので事前に宛先を書けない。答案は「動的」という語が核心。</p>`,
        phases: [[['rth', 'inet']], [['inet', 'rtb']]],
        frame: [
          ['IPv4ヘッダ', [
            ['送信元IP', '203.0.113.20'],
            ['宛先IP', '198.51.100.77', 'いつ変わるか分からない'],
          ]],
          ['UDP', [['ポート', '500', 'IKE']]],
        ],
        side: honsha(0),
      },
      {
        title: '⑤ 戻りの道：再配布',
        focus: 'rth',
        pkt: 'ctl',
        label: 'OSPF',
        desc: `<p>行きだけなら今までの経路で届く。問題は<b>戻り</b>で、FW と L3SW は営業所 LAN を直接知らない。</p>
          <p>本社ルータは静的経路 <b>10.20.1.0/24（営業所 LAN）を OSPF に再配布</b>する。これで FW にも L3SW に向かう経路ができる。</p>`,
        phases: [[['rth', 'l3']], [['l3', 'fw']]],
        frame: [['OSPF', [['内容', '外部経路 10.20.1.0/24'], ['広告元', '本社RT']]]],
        side: {
          title: 'FW の経路',
          head: ['宛先', '次の宛先', '方式'],
          rows: [
            ['0.0.0.0/0', 'ISP', '静的'],
            ['10.20.1.0/24', 'L3SW', 'OSPF'],
          ],
          hit: 1,
        },
      },
      {
        title: '⑥ SGW へ IPsec を張る',
        focus: 'sgw',
        pkt: 'ctl',
        label: 'IKEv2',
        desc: `<p>新構成では、各ルータと在宅 PC が SGW の接続点 POP へ IPsec を張る。IKEv2 の順番は<b>まず IKE SA、次に認証と Child SA</b>。</p>
          <p>つながらないときは <b>IKE SA と Child SA の状態</b>を見れば、どちらの交渉で止まっているか分かる。</p>
          <p>DH グループは 2（1024 ビット）から 14（2048 ビット）へ。<b>鍵長</b>が長いほうが解読に強い。</p>`,
        phases: [[['rtb', 'inet'], ['rth', 'inet'], ['tpc', 'inet']], [['inet', 'sgw']]],
        links: { 'inet-sgw': 'tunnel' },
        badges: { sgw: 'POP' },
        side: {
          title: 'IKEv2 の段階',
          head: ['順', '作るもの', '決めること'],
          rows: [
            ['1', 'IKE SA', '暗号・PRF・完全性・DH'],
            ['2', 'Child SA', '認証とデータ用の鍵'],
          ],
        },
      },
      {
        title: '⑦ トンネルモードの ESP',
        focus: 'rtb',
        pkt: 'esp',
        label: 'ESP',
        desc: `<p>営業所ルータは元のパケットに<b>ESP トレーラ</b>を付けて<b>暗号化</b>し、<b>新しい IP ヘッダ</b>と <b>ESP ヘッダ</b>、認証データを付けて POP へ送る。</p>
          <p>ESP ヘッダの SPI が指すのは <b>Child SA</b>。IKE SA は制御用で、データは運ばない。</p>`,
        phases: [[['pcb', 'rtb', { kind: 'ip', label: 'IP' }]], [['rtb', 'inet']], [['inet', 'sgw']]],
        links: { 'rtb-inet': 'tunnel', 'inet-sgw': 'tunnel' },
        frame: espFrame('198.51.100.77', '192.0.2.1', '0x0000a1b2'),
      },
      {
        title: '⑧ 許可リストの変更',
        focus: ['sgw', 'saas'],
        pkt: 'ip',
        label: 'IP',
        desc: `<p>これからの送信元は SGW の FW 機能が NAPT した <b>192.0.2.200</b> になるので、SaaS の許可リストを書き換える。</p>
          <p>SGW は他社も使う。そのアドレスが他社と共用なら、他社の利用者もリストを通れてしまう。事業者に確認するのは<b>自社専用のアドレスであること</b>。</p>`,
        phases: [[['sgw', 'inet']], [['inet', 'saas']]],
        frame: ipFrame('192.0.2.200', '192.0.2.50', 'SGW で NAPT 後'),
        badges: { saas: 'リスト更新' },
        side: allow(0, true),
      },
      {
        title: '⑨ 応答時間を測る',
        focus: 'sgw',
        pkt: 'ip',
        label: 'IP',
        desc: `<p>接続テストでは SaaS の応答時間も確かめる。本社 FW の代わりに POP と FW 機能を通るようになるので、<b>SGW サービスの経由による遅延</b>が増える可能性がある。</p>
          <p>PaaS へは SGW からそのまま向かう。全社の通信が SGW に集まるので、性能の確認は導入前に行う。</p>`,
        phases: [[['pcb', 'rtb']], [['rtb', 'inet']], [['inet', 'sgw']], [['sgw', 'paas'], ['sgw', 'inet']], [['inet', 'saas']]],
        links: { 'rtb-inet': 'tunnel', 'inet-sgw': 'tunnel', 'sgw-paas': 'path' },
        side: {
          title: '営業所から SaaS への通り道',
          head: ['構成', '経由するところ'],
          rows: [
            ['今まで', '本社RT → L3SW → FW'],
            ['新構成', 'POP → FW 機能（SGW の中）'],
          ],
          hit: 1,
        },
      },
    ],
  });
})();
