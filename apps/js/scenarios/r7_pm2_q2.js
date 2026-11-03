// R7午後Ⅱ問2 IoTシステムの設計：水道メーターの遠隔検針を題材に、CoAP の信頼性と UDP 上の攻撃対策を追う
(() => {
  const toServer = [['m1', 'lpwa'], ['lpwa', 'vpn1'], ['vpn1', 'inet'], ['inet', 'vpn2'], ['vpn2', 'srv']];
  const toMeter = [['srv', 'vpn2'], ['vpn2', 'inet'], ['inet', 'vpn1'], ['vpn1', 'lpwa'], ['lpwa', 'm1']];

  // インターネット区間だけ ESP として描く
  const hops = (list, label) => list.map(([a, b]) => {
    const tunnel = (a === 'vpn1' && b === 'inet') || (a === 'inet' && b === 'vpn2')
      || (a === 'vpn2' && b === 'inet') || (a === 'inet' && b === 'vpn1');
    return [[a, b, tunnel ? { kind: 'esp', label: 'ESP' } : { label }]];
  });
  const tunnelLinks = { 'vpn1-inet': 'tunnel', 'inet-vpn2': 'tunnel' };

  // CoAP メッセージ（固定長ヘッダ4バイト＋トークンなど）
  const coap = (src, dst, type, code, mid, ...rest) => [
    ['内側IPv4', [['送信元IP', src], ['宛先IP', dst], ['プロトコル', '17', 'UDP']]],
    ['UDP', [['ポート', '5683', 'CoAP の既定']]],
    ['CoAP', [['タイプ', type], ['コード', code], ['メッセージID', mid], ...rest]],
  ];
  const METER = '10.60.1.25';
  const SERVER = '10.80.0.20';

  const exchange = hit => ({
    title: '続けて GET したときのやり取り',
    head: ['向き', 'タイプ', 'メッセージID', 'トークン', '内容'],
    rows: [
      ['→', 'CON', '0x5a01', '0x31', 'GET /a'],
      ['→', 'CON', '0x5a02', '0x32', 'GET /b'],
      ['→', 'CON', '0x5a03', '0x33', 'GET /c'],
      ['←', 'ACK', '0x5a01', '—', '空（データはまだ）'],
      ['←', 'ACK', '0x5a02', '0x32', '2.05＋データ'],
      ['←', 'ACK', '0x5a03', '0x33', '2.05＋データ'],
      ['←', 'ACK', '0x5a03', '0x33', '網で複製された同じ ACK'],
      ['←', 'CON', '0x6b44', '0x31', '2.05＋データ（別送）'],
      ['→', 'ACK', '0x6b44', '—', '別送の受領確認'],
    ],
    hit,
  });

  SCENARIOS.push({
    id: 'r7_pm2_q2',
    title: 'IoT 遠隔検針と CoAP',
    subtitle: '電池で動く水道メーターが、閉域網の上で確実にデータを届ける仕組みを追う',
    viewBox: '0 0 900 360',
    nodes: {
      m1:   { x: 70,  y: 85,  name: 'メーター1', kind: 'pc', lines: [METER] },
      m2:   { x: 70,  y: 225, name: 'メーター2', kind: 'pc' },
      lpwa: { x: 210, y: 155, name: 'LPWA閉域', kind: 'cloud' },
      vpn1: { x: 365, y: 155, name: 'IPsec1', kind: 'rt', lines: ['事業者側'], linesAbove: true },
      inet: { x: 530, y: 155, name: 'インターネット', kind: 'cloud' },
      vpn2: { x: 695, y: 155, name: 'IPsec2', kind: 'rt', lines: ['自社側'], linesAbove: true },
      srv:  { x: 835, y: 155, name: '検針サーバ', kind: 'sv', lines: [SERVER] },
      cli:  { x: 300, y: 290, name: '正規端末', kind: 'pc' },
      atk:  { x: 450, y: 290, name: '攻撃者', kind: 'pc' },
      vic:  { x: 600, y: 300, name: '攻撃対象', kind: 'pc', lines: ['192.0.2.50'] },
      dtls: { x: 760, y: 290, name: 'DTLSサーバ', kind: 'sv', lines: ['攻撃の説明用'] },
    },
    links: [
      { a: 'm1', b: 'lpwa', net: 'LTE-M', ldx: -8, ldy: -8 },
      { a: 'm2', b: 'lpwa', net: 'LTE-M', ldx: -8, ldy: 18 },
      { a: 'lpwa', b: 'vpn1', net: '専用線', ldy: 18 },
      { a: 'vpn1', b: 'inet' },
      { a: 'inet', b: 'vpn2' },
      { a: 'vpn2', b: 'srv' },
      { a: 'inet', b: 'cli' },
      { a: 'inet', b: 'atk' },
      { a: 'inet', b: 'vic' },
      { a: 'inet', b: 'dtls' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>電池で動く水道メーターの<b>遠隔検針</b>を全国で提供する。要件は全国規模の IoT 向け回線と、<b>電池で長く動くこと</b>。</p>
          <p>そこで<b>低消費電力</b>の無線 LPWA のうち、携帯網を基にするセルラー系の <b>LTE-M</b> を選ぶ。仕様は <b>3GPP</b> が作り、通信事業者の網で全国に使える。メーターには契約者を示す <b>SIM</b> を挿す。</p>
          <p>上位のプロトコルは、Web の <b>RESTful</b> な形で扱える <b>CoAP</b> にする。</p>`,
        badges: { m1: '電池', m2: '電池' },
        side: {
          title: 'LPWA の分類',
          head: ['系統', '例', '使う帯域'],
          rows: [
            ['非セルラー', 'LoRaWAN・Sigfox', '920MHz 帯（ISM バンド。2.4GHz 帯より電波干渉が少ない）'],
            ['セルラー', 'LTE-M・NB-IoT', '事業者の LTE 網'],
          ],
          hit: 1,
        },
      },
      {
        title: '① IPsec で閉域網をつくる',
        focus: ['vpn1', 'vpn2'],
        pkt: 'ctl',
        label: 'IKE_SA_INIT',
        desc: `<p>LPWA 閉域接続と専用線に、インターネット区間の <b>IPsec VPN</b> をつなぎ、自社専用の閉域網にする。これでプライベートアドレスのまま通信できる。</p>
          <p>IKEv2 は <b>IKE_SA_INIT と IKE_AUTH の2往復</b>、計4メッセージで SA を作る。</p>
          <p>IPsec1 の SPD には「<b>検針サーバ宛て</b>なら IPsec で処理する」と書く。指定するのは対向ルータではなく、奥にいる通信相手。</p>`,
        phases: [
          [['vpn1', 'inet']], [['inet', 'vpn2']],
          [['vpn2', 'inet']], [['inet', 'vpn1']],
          [['vpn1', 'inet', { label: 'IKE_AUTH' }]], [['inet', 'vpn2', { label: 'IKE_AUTH' }]],
          [['vpn2', 'inet', { label: 'IKE_AUTH' }]], [['inet', 'vpn1', { label: 'IKE_AUTH' }]],
        ],
        frameGroup: 'ike',
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '203.0.113.10', 'IPsec1'], ['宛先IP', '198.51.100.20', 'IPsec2']]],
          ['UDP', [['ポート', '500', 'IKE']]],
          ['IKEv2', [['交換', 'IKE_SA_INIT → IKE_AUTH'], ['結果', 'SAD ができる']]],
        ],
        links: tunnelLinks,
        side: {
          title: 'IPsec1 の SPD（要点）',
          head: ['セレクター（宛先）', '処理'],
          rows: [[`${SERVER}（検針サーバ）`, 'IPsec（SAD を参照）']],
          hit: 0,
        },
      },
      {
        title: '② 検針データを CON で送る',
        focus: 'm1',
        pkt: 'ip',
        label: 'CON POST',
        desc: `<p>メーターは <b>CON（確認が必要なメッセージ）</b>を POST で送り、サーバは 2.01 Created の ACK で答える。</p>
          <p>CoAP は <b>トランスポート層の UDP</b> の上で動くので、順序が入れ替わることも重複することもある。その弱点を補うのが<b>メッセージ ID</b> と再送。</p>
          <p>メッセージ量の試算：1回150バイトを2時間ごとに30日で 54,000 バイト。1,000 バイト1円で54円、基本料250円を足して<b>304円</b>。</p>`,
        phases: [...hops(toServer, 'CON POST'), ...hops(toMeter, 'ACK 2.01')],
        frameGroup: 'coap',
        frame: coap(METER, SERVER, 'CON', '0.02（POST）', '0x4a10', ['トークン長', '0', 'この例では使わない']),
        links: tunnelLinks,
        side: {
          title: '通信のタイプ',
          head: ['タイプ', '意味'],
          rows: [['CON', '確認が必要'], ['NON', '確認が不要'], ['ACK', '確認応答'], ['RST', 'リセット']],
          hit: 0,
        },
      },
      {
        title: '③ ACK が消えたら再送する',
        focus: 'm1',
        pkt: 'ip',
        label: 'ACK',
        desc: `<p>サーバの ACK が途中で消えた場面。メーターは規定の時間 ACK を待ち、届かなければ<b>同じメッセージ ID</b> で CON を再送する。</p>
          <p>再送の間隔は<b>指数バックオフ</b>で長くする。混雑している網へ同じ間隔で送り続けないため。</p>
          <p>CoAP は ACK を待たずに次の CON も送れる。これが<b>非同期</b>通信。</p>`,
        phases: [
          [['srv', 'vpn2']],
          [['vpn2', 'inet', { kind: 'esp', label: 'ESP', drop: true }]],
          ...hops(toServer, '再送 CON'),
          ...hops(toMeter, 'ACK'),
        ],
        frameGroup: 'coap',
        frame: coap(METER, SERVER, 'CON（再送）', '0.02（POST）', '0x4a10', ['トークン長', '0', 'この例では使わない']),
        links: tunnelLinks,
        badges: { m1: '指数バックオフ' },
      },
      {
        title: '④ 別送の応答とトークン',
        focus: 'm1',
        pkt: 'ip',
        label: 'CON 2.05',
        desc: `<p>右の表はメーターが GET を3つ続けて送ったときの流れ。すぐ答えられる2つは <b>ACK にデータを載せる（ピギーバック）</b>。要求と同じメッセージ ID の ACK がそれにあたる。</p>
          <p>1つ目だけは準備が間に合わず、まず<b>空の ACK</b> を返す。後でデータを<b>新しいメッセージ ID の CON</b> で別に送る。</p>
          <p>別送が1つ目の答えだと分かるのは<b>トークン値が一致する</b>から。メッセージ ID は1通ごとの確認の組で、要求と答えを結ぶのがトークン。</p>`,
        phases: [...hops(toMeter, 'CON 2.05'), ...hops(toServer, 'ACK')],
        frameGroup: 'coap',
        frame: coap(SERVER, METER, 'CON', '2.05（Content）', '0x6b44', ['トークン', '0x31', '/a の要求と同じ値']),
        links: tunnelLinks,
        side: exchange([3, 7]),
      },
      {
        title: '⑤ 重複した ACK を無視する',
        focus: 'm1',
        pkt: 'ip',
        label: 'ACK',
        desc: `<p>表で強調した2行のうち、下の行は網の途中で複製された ACK。メーターには同じものが2つ届く。</p>
          <p>重複と判断する根拠は<b>メッセージ ID が同じ</b>こと。先の ACK はもう処理済みなので、<b>後の ACK は無視する</b>。</p>
          <p>理由と処理を別々に書く設問。再送を頼むなど余計な動作は書かない。</p>`,
        phases: [
          ...hops(toMeter, 'ACK'),
          [['lpwa', 'm1', { label: '複製', drop: true }]],
        ],
        frameGroup: 'coap',
        frame: coap(SERVER, METER, 'ACK', '2.05（Content）', '0x5a03', ['トークン', '0x33']),
        links: tunnelLinks,
        side: exchange([5, 6]),
      },
      {
        title: '⑥ UDP のハンドシェークの弱点',
        focus: ['atk', 'dtls'],
        pkt: 'ctl',
        label: 'ClientHello',
        desc: `<p>データ保護には DTLS を使える。ここでは一般の公開サーバで弱点を見る。TLS 1.2 の手順をそのまま UDP で動かすと、攻撃者は ClientHello の<b>送信元 IP アドレスを攻撃対象のものに偽装</b>できる。</p>
          <p>UDP には接続確立がないので、サーバは確かめずに<b>大きな ServerHello を攻撃対象へ返す</b>。サーバが加害者にされる。これが<b>リフレクション攻撃</b>。</p>`,
        phases: [
          [['atk', 'inet']],
          [['inet', 'dtls']],
          [['dtls', 'inet', { label: 'ServerHello（大）' }]],
          [['inet', 'vic', { label: 'ServerHello（大）' }]],
        ],
        frameGroup: 'dtls',
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '192.0.2.50', '攻撃対象に偽装'], ['宛先IP', '203.0.113.80', 'サーバ']]],
          ['UDP上のハンドシェーク', [['メッセージ', 'ClientHello']]],
        ],
        nodes: { vic: 'down' },
        badges: { vic: '大量の応答' },
      },
      {
        title: '⑦ cookie で送信元を確かめる',
        focus: 'dtls',
        pkt: 'ctl',
        label: 'ClientHello',
        desc: `<p>DTLS 1.3 のサーバは、最初の ClientHello にすぐ ServerHello を返さず、<b>cookie を付けた HelloRetryRequest</b> を返す。</p>
          <p>cookie は送信元アドレスへ届くので、次の ClientHello に正しい cookie があれば<b>送信元が偽装でない</b>と判断できる。偽装した攻撃者には cookie が届かない。</p>
          <p>cookie が不正なら <b>ServerHello を返さず、ハンドシェークを終える</b>。</p>`,
        phases: [
          [['atk', 'inet', { label: '偽装 Hello' }]],
          [['inet', 'dtls', { label: '偽装 Hello' }]],
          [['dtls', 'inet', { label: 'HRR＋cookie' }]],
          [['inet', 'vic', { label: 'HRR＋cookie' }]],
          [['cli', 'inet']],
          [['inet', 'dtls']],
          [['dtls', 'inet', { label: 'HRR＋cookie' }]],
          [['inet', 'cli', { label: 'HRR＋cookie' }]],
          [['cli', 'inet', { label: 'Hello＋cookie' }]],
          [['inet', 'dtls', { label: 'Hello＋cookie' }]],
          [['dtls', 'inet', { label: 'ServerHello' }]],
          [['inet', 'cli', { label: 'ServerHello' }]],
        ],
        frameGroup: 'dtls',
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '203.0.113.200', '正規端末'], ['宛先IP', '203.0.113.80', 'サーバ']]],
          ['UDP上のハンドシェーク', [['メッセージ', 'ClientHello（cookie 付き）']]],
        ],
        nodes: { dtls: 'done' },
        badges: { atk: 'cookie が届かない', cli: '送信元を証明' },
        side: {
          title: 'サーバの判断',
          head: ['2回目の ClientHello', 'サーバの対応'],
          rows: [['正しい cookie あり', 'ServerHello を返す'], ['不正な cookie', '返さず終了']],
          hit: 0,
        },
      },
      {
        title: '⑧ 検針の設計',
        focus: ['m1', 'm2'],
        pkt: 'ip',
        label: 'CON POST',
        desc: `<p>メーターは2時間ごとに測って記録し、毎日午前3時の測定後に1日分をまとめて送る。送る前に<b>乱数の時間だけ待つ</b>のは、<b>サーバと網への負荷の集中を避ける</b>ため。測定と送信の合間はスリープして<b>消費電力を抑える</b>。</p>
          <p>HTTP/1.1 より CoAP がパケット数で勝つのは、<b>TCP のコネクション確立と切断がいらない</b>から。</p>
          <p>処理の負荷を考えて DTLS は使わない。<b>通信が閉域網の中だけで行われる</b>ので安全性が保てると判断した。</p>`,
        phases: [
          [['m1', 'lpwa']],
          [['lpwa', 'vpn1']],
          [['m2', 'lpwa', { label: '少し後に送る' }]],
          [['lpwa', 'vpn1', { label: '少し後に送る' }]],
        ],
        frameGroup: 'coap',
        frame: coap(METER, SERVER, 'CON', '0.02（POST）', '0x4b02', ['トークン長', '0', 'この例では使わない']),
        badges: { m1: '乱数の待ち時間', m2: 'スリープ後' },
        side: {
          title: '1件を送るときの比較',
          head: ['段階', 'CoAP（UDP）', 'HTTP/1.1（TCP）'],
          rows: [
            ['接続の確立', 'なし', '3ウェイハンドシェイク'],
            ['データ', 'CON と ACK', 'リクエストとレスポンス'],
            ['切断', 'なし', 'FIN のやり取り'],
          ],
          hit: [0, 2],
        },
      },
      {
        title: '⑨ 時計のずれを直す',
        focus: ['m1', 'srv'],
        pkt: 'ip',
        label: 'GET /time',
        desc: `<p>高精度の時計を載せても、長く動かせばずれる。ずれると<b>測定と送信が誤った時刻に行われる</b>。データの意味が変わり、送信の分散も崩れる。</p>
          <p>そこで CoAP を使い、<b>検針サーバから現在時刻を取得してメーターの時刻を更新</b>する。検針サーバ自身は NTP サーバと時刻を合わせる。</p>
          <p>設問の条件は「CoAP 通信を利用する」こと。NTP をメーターに載せる案ではない。</p>`,
        phases: [...hops(toServer, 'GET /time'), ...hops(toMeter, 'ACK 2.05')],
        frameGroup: 'coap',
        frame: coap(METER, SERVER, 'CON', '0.01（GET）', '0x7c21', ['トークン', '0x42', '応答と結び付ける']),
        links: tunnelLinks,
        nodes: { m1: 'done' },
        badges: { m1: '時刻を更新' },
      },
    ],
  });
})();
