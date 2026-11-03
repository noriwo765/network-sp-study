// R4午後Ⅰ問3 シングルサインオンの導入：PC の起動から SRV レコード・Kerberos の手順までを追う
(() => {
  const srvTable = hit => ({
    title: 'SRV レコード（_kerberos._tcp.corp.example.jp.　TTL 5400）',
    head: ['Priority', 'Weight', 'Port', 'Target'],
    rows: [
      ['10', '3', '88', 'kdc1.corp.example.jp.'],
      ['10', '1', '88', 'kdc2.corp.example.jp.'],
    ],
    hit,
  });
  const fwRules = hit => ({
    title: 'FW の許可ルール（戻りはステートフルで通る）',
    head: ['送信元', '宛先', 'ポート'],
    rows: [
      ['any', '公開DNS', 'TCP/53, UDP/53'],
      ['any', '自社サイト', 'TCP/443'],
      ['公開DNS', 'any', 'TCP/53, UDP/53'],
      ['プロキシ', 'any', 'TCP/80, TCP/443'],
      ['社内DNS', '公開DNS', 'TCP/53, UDP/53'],
      ['PC・サーバ', 'プロキシ', 'TCP/8080'],
    ],
    hit,
  });
  const krb = (dst, msg, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', '10.30.1.25', 'PC'],
      ['宛先IP', dst],
    ]],
    ['TCP', [['宛先ポート', '88', 'Kerberos']]],
    ['Kerberos', [['内容', msg, note]]],
  ];
  const web = msg => [
    ['TCP', [['宛先ポート', '443', 'HTTP over TLS（88 ではない）']]],
    ['HTTP', msg],
  ];

  SCENARIOS.push({
    id: 'r4_pm1_q3',
    title: 'Kerberos でシングルサインオン',
    subtitle: 'PC の起動から業務サーバへ入るまでを、DNS・チケットの順で追う',
    viewBox: '0 0 900 420',
    nodes: {
      inet:  { x: 62,  y: 110, name: 'インターネット', kind: 'cloud' },
      fw:    { x: 210, y: 110, name: 'FW', kind: 'fw' },
      site:  { x: 420, y: 40,  name: '自社サイト', kind: 'sv' },
      dnsx:  { x: 420, y: 110, name: '公開DNS', kind: 'sv' },
      proxy: { x: 420, y: 180, name: 'プロキシ', kind: 'sv' },
      pc:    { x: 60,  y: 270, name: 'PC', kind: 'pc', lines: ['10.30.1.25'] },
      l3:    { x: 210, y: 270, name: 'L3SW', kind: 'sw', lines: ['DHCPサーバ'] },
      l2s:   { x: 460, y: 290, name: 'L2SW', kind: 'sw' },
      dns:   { x: 460, y: 380, name: '社内DNS', kind: 'sv' },
      kdc1:  { x: 680, y: 210, name: 'KDC1', kind: 'sv', lines: ['10.30.9.11'] },
      kdc2:  { x: 680, y: 290, name: 'KDC2', kind: 'sv', lines: ['10.30.9.12'] },
      crm:   { x: 680, y: 380, name: '顧客管理', kind: 'sv' },
    },
    links: [
      { a: 'inet', b: 'fw' },
      { a: 'fw', b: 'site' },
      { a: 'fw', b: 'dnsx' },
      { a: 'fw', b: 'proxy' },
      { a: 'fw', b: 'l3' },
      { a: 'pc', b: 'l3' },
      { a: 'l3', b: 'l2s' },
      { a: 'l2s', b: 'dns' },
      { a: 'l2s', b: 'kdc1' },
      { a: 'l2s', b: 'kdc2' },
      { a: 'l2s', b: 'crm' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>社内のシステムが増えてパスワードの使い回しが広がった。アカウントを一元管理し、<b>1回のログインで各サーバへ入れる</b>ようにしたい。</p>
          <p>そこでディレクトリサービスとともに <b>KDC</b> を2台置き、Kerberos 認証を導入する。今の社内の通信を確認してから、手順を追う。</p>`,
        badges: { kdc1: '新設', kdc2: '新設' },
        side: fwRules(),
      },
      {
        title: '① PC の起動と DHCP',
        focus: ['pc', 'l3'],
        pkt: 'ctl',
        label: 'DHCP',
        desc: `<p>PC は L3SW の DHCP サーバから設定を受け取る。アドレスとマスクのほかに必要なのは<b>社内 DNS サーバのアドレス</b>と<b>デフォルトゲートウェイのアドレス</b>。</p>
          <p>プロキシは FQDN で書いてあるので DNS が要り、プロキシも社内サーバも別のセグメントなのでゲートウェイが要る。</p>`,
        phases: [[['l3', 'pc']]],
        frame: [['DHCP の応答', [
          ['アドレス', '10.30.1.25'],
          ['マスク', '255.255.255.0'],
          ['ルータ', '10.30.1.1', 'デフォルトゲートウェイ'],
          ['DNS', '10.30.9.53', '社内DNS'],
        ]]],
      },
      {
        title: '② 社外の名前解決と FW',
        focus: ['dns', 'dnsx'],
        pkt: 'ip',
        label: 'DNS',
        desc: `<p>社内 DNS は社外の名前を公開 DNS へ<b>転送</b>する。公開 DNS は各地の権威サーバへ再帰問合せをするので、ルールの宛先は <b>any</b>。</p>
          <p>DNS は普段 <b>UDP/53</b>、大きな応答では TCP/53 を使うので両方を許可する。送信元は通信を始める側で考える。</p>`,
        phases: [[['dns', 'l2s']], [['l2s', 'l3']], [['l3', 'fw']], [['fw', 'dnsx']], [['dnsx', 'fw', { label: '再帰問合せ' }]], [['fw', 'inet', { label: '再帰問合せ' }]]],
        side: fwRules([2, 4]),
      },
      {
        title: '③ プロキシの例外',
        focus: 'pc',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>社外の Web はプロキシを通すが、社内の受注サーバと顧客管理サーバへは<b>直接</b>向かわせる。</p>
          <p>そのために、ブラウザの<b>プロキシ例外リストにサーバの FQDN を登録</b>する。登録しないと、社内向けの通信までプロキシに向かう。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'crm']]],
        links: { 'pc-l3': 'path', 'l3-l2s': 'path', 'l2s-crm': 'path' },
        side: {
          title: 'ブラウザの判断',
          head: ['接続先', 'プロキシ'],
          rows: [
            ['社外のサイト', '通す'],
            ['受注・顧客管理（例外リスト）', '通さない'],
          ],
          hit: 1,
        },
      },
      {
        title: '④ SRV レコードで KDC を探す',
        focus: ['pc', 'dns'],
        pkt: 'ip',
        label: 'DNS',
        desc: `<p>PC は社内 DNS に <b>SRV レコード</b>を問い合わせ、KDC のホスト名とポートを得る。SRV を使わないなら、<b>Kerberos サーバの FQDN を PC ごとに設定</b>することになる。</p>
          <p>Priority が同じなので Weight の比で分け、KDC1 と KDC2 を <b>3対1</b> で使う。TTL は秒なので 5400 秒は <b>90 分</b>。</p>
          <p>SRV を kdc 1本にまとめて同じ比率をラウンドロビンで作るなら、<b>kdc の A レコードを add1 に3つ、add2 に1つ</b>書く。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'dns']]],
        frame: [['DNS 問合せ', [['名前', '_kerberos._tcp.corp.example.jp.'], ['タイプ', 'SRV']]]],
        side: srvTable([0, 1]),
      },
      {
        title: '⑤ 認証を受けて TGT を得る',
        focus: ['pc', 'kdc1'],
        pkt: 'ip',
        label: 'AS',
        desc: `<p>利用者の ID とパスワードをもとに KDC で認証を受け、身分証にあたる <b>TGT</b> を受け取る。ここが<b>ポート 88</b>。</p>
          <p>応答は PC の鍵で暗号化されている。盗聴されても、鍵がなければ<b>中身を使えず ST を取り出せない</b>。</p>
          <p>実際の Kerberos はパスワードをそのまま流さず、そこから作った鍵で事前認証する。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'kdc1']], [['kdc1', 'l2s', { label: 'TGT' }]], [['l2s', 'l3', { label: 'TGT' }]], [['l3', 'pc', { label: 'TGT' }]]],
        frame: krb('10.30.9.11', '認証の要求', 'KDC1'),
        badges: { pc: 'TGT 保管' },
      },
      {
        title: '⑥ サーバから 401 が返る',
        focus: ['pc', 'crm'],
        pkt: 'ip',
        label: 'HTTP',
        desc: `<p>ブラウザが顧客管理サーバへアクセスすると、まだチケットがないので <b>401</b> が返る。ヘッダの <b>WWW-Authenticate: Negotiate</b> が「Kerberos などで認証して」という合図。</p>
          <p>この通信は普通の HTTPS で、ポートは 443。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'crm']], [['crm', 'l2s', { label: '401' }]], [['l2s', 'l3', { label: '401' }]], [['l3', 'pc', { label: '401' }]]],
        frame: web([['応答', '401'], ['ヘッダ', 'WWW-Authenticate: Negotiate']]),
        badges: { pc: 'TGT 保管' },
      },
      {
        title: '⑦ TGT を見せて ST を得る',
        focus: ['pc', 'kdc1'],
        pkt: 'ip',
        label: 'TGS',
        desc: `<p>PC は <b>TGT を提示</b>して、顧客管理サーバ用の <b>ST</b> を要求する。パスワードの再入力は要らない。これが SSO の仕組み。</p>
          <p>ST はサーバの鍵で暗号化され、さらに全体が PC だけに開ける形で包まれて届く。相手が KDC なので<b>ここもポート 88</b>。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'kdc1']], [['kdc1', 'l2s', { label: 'ST' }]], [['l2s', 'l3', { label: 'ST' }]], [['l3', 'pc', { label: 'ST' }]]],
        frame: krb('10.30.9.11', 'ST の要求（TGT を提示）', '相手は KDC'),
        badges: { pc: 'ST 入手' },
        side: {
          title: 'ポート 88 を使う通信',
          head: ['通信', '相手', '88か'],
          rows: [
            ['認証の要求・応答', 'KDC', '○'],
            ['最初の HTTP・401', 'サーバ', '—'],
            ['ST の要求・応答', 'KDC', '○'],
            ['ST 提示の HTTP・200', 'サーバ', '—'],
          ],
          hit: [0, 2],
        },
      },
      {
        title: '⑧ ST を提示して入る',
        focus: ['pc', 'crm'],
        pkt: 'ip',
        label: 'HTTP',
        desc: `<p>PC は ST を HTTP の要求に載せてサーバへ提示する。サーバは自分の鍵で ST を開いて PC を確かめ、権限を与えて <b>200 OK</b> を返す。</p>
          <p>サーバはパスワードを受け取らない。同じ手順で他のサーバにも、再入力なしで入れる。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'crm']], [['crm', 'l2s', { label: '200' }]], [['l2s', 'l3', { label: '200' }]], [['l3', 'pc', { label: '200' }]]],
        frame: web([['要求', 'Authorization: Negotiate（ST を含む）'], ['応答', '200 OK']]),
        nodes: { crm: 'done' },
        badges: { pc: 'ログイン不要' },
      },
      {
        title: '⑨ 時計がずれると失敗する',
        focus: ['pc', 'crm'],
        pkt: 'ip',
        label: 'ST',
        desc: `<p>チケットには有効期限がある。PC とサーバの時計がずれていると、有効期限内の ST でも<b>サーバが使用不可と判断</b>することがある。</p>
          <p>対策は <b>PC とサーバの間で時刻を同期する</b>こと。NTP で揃えるのが定番。</p>`,
        phases: [[['pc', 'l3']], [['l3', 'l2s']], [['l2s', 'crm', { label: '期限切れ扱い', drop: true }]]],
        badges: { pc: '10:00', crm: '12:30' },
        side: {
          title: '時計のずれの例',
          head: ['項目', '時刻'],
          rows: [
            ['ST の有効期限', '12:00 まで'],
            ['PC の時計', '10:00（期限内）'],
            ['サーバの時計', '12:30（期限切れ）'],
          ],
          hit: 2,
        },
      },
    ],
  });
})();
