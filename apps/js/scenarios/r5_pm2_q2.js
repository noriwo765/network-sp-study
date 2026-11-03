// R5午後Ⅱ問2 ECサーバの増強：LB の導入、送信元変換、セッション維持、SAML による SSO
(() => {
  const inbound = (opts) => [[['pc', 'inet', opts]], [['inet', 'fwz', opts]], [['fwz', 'sw', opts]]];
  const outbound = (opts) => [[['sw', 'fwz', opts]], [['fwz', 'inet', opts]], [['inet', 'pc', opts]]];

  const ipFrame = (src, dst, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src],
      ['宛先IP', dst, note],
    ]],
  ];

  const pathTable = (title, toEc, fromEc, foot) => ({
    title,
    head: ['区間', '送信元', '宛先'],
    rows: [
      ['PC → FW', '198.51.100.50', '203.0.113.12'],
      ['FW → LB', '198.51.100.50', '10.50.1.12'],
      ['LB → EC1', toEc, '10.50.1.15'],
      ['EC1 → LB', '10.50.1.15', fromEc],
      ['LB → FW', '10.50.1.12', '198.51.100.50'],
      ['FW → PC', '203.0.113.12', '198.51.100.50'],
    ],
    hit: [2, 3],
    foot,
  });

  SCENARIOS.push({
    id: 'r5_pm2_q2',
    title: 'EC サーバの増強と SSO',
    subtitle: 'LB を入れて3台に増やし、送信元変換の落とし穴から SAML まで追う',
    viewBox: '0 0 900 440',
    nodes: {
      idp:  { x: 60,  y: 120, name: 'IdP', kind: 'sv', lines: ['認証連携'], linesAbove: true },
      kdc:  { x: 60,  y: 270, name: 'KDC', kind: 'sv', lines: ['社内のDSが兼務'] },
      pc:   { x: 190, y: 195, name: '会員PC', kind: 'pc', lines: ['198.51.100.50'] },
      inet: { x: 330, y: 195, name: 'インターネット', kind: 'cloud' },
      fwz:  { x: 470, y: 195, name: 'DC-FW', kind: 'fw', lines: ['203.0.113.12'], linesAbove: true },
      sw:   { x: 610, y: 195, name: 'L2SW', kind: 'sw' },
      lb:   { x: 610, y: 75,  name: 'LB', kind: 'sw', lines: ['仮想 10.50.1.12', '実 10.50.1.14'], linesAbove: true },
      ec1:  { x: 800, y: 85,  name: 'EC1', kind: 'sv', lines: ['10.50.1.15'] },
      ec2:  { x: 800, y: 195, name: 'EC2', kind: 'sv', lines: ['10.50.1.16'] },
      ec3:  { x: 800, y: 305, name: 'EC3', kind: 'sv', lines: ['10.50.1.17'] },
      wan:  { x: 470, y: 300, name: '広域イーサ', kind: 'cloud' },
      l3:   { x: 470, y: 395, name: 'L3SW', kind: 'sw' },
      ops:  { x: 300, y: 395, name: '運用PC', kind: 'pc', lines: ['10.60.0.20'] },
    },
    links: [
      { a: 'idp', b: 'pc' },
      { a: 'kdc', b: 'pc' },
      { a: 'pc', b: 'inet' },
      { a: 'inet', b: 'fwz' },
      { a: 'fwz', b: 'sw' },
      { a: 'sw', b: 'lb' },
      { a: 'sw', b: 'ec1' },
      { a: 'sw', b: 'ec2' },
      { a: 'sw', b: 'ec3' },
      { a: 'fwz', b: 'wan' },
      { a: 'wan', b: 'l3' },
      { a: 'l3', b: 'ops' },
    ],
    steps: [
      {
        title: 'はじめに：サーバ1台の構成',
        focus: 'ec1',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>事務用品の EC サイトを、データセンタの1台のサーバで動かしている（この段階では LB と増設サーバはない）。</p>
          <p>DNS サーバは2つのゾーンを持つ。<b>外向きの値は NAT 前のグローバルアドレス、内向きの値は実アドレス</b>。ゾーンには <b>NS</b>（権威サーバ）と <b>MX</b>（メール）も登録する。</p>`,
        phases: [...inbound(), [['sw', 'ec1']]],
        frame: ipFrame('198.51.100.50', '10.50.1.12', 'FW の NAT の後（現在のサーバ）'),
        badges: { ec1: '現在は .12', lb: '未導入', ec2: '未導入', ec3: '未導入' },
        side: {
          title: '2つのゾーンの A レコード',
          head: ['名前', '外向き', '内向き'],
          rows: [
            ['ns', '203.0.113.11', '10.50.1.11'],
            ['web', '203.0.113.12', '10.50.1.12'],
            ['mail', '203.0.113.13', '10.50.1.13'],
          ],
          foot: '外向きの値を FW が内向きの値へ静的 NAT する',
        },
      },
      {
        title: '① 遅さの原因を調べる',
        focus: 'ops',
        pkt: 'ip',
        label: 'SSH',
        desc: `<p>利用者から「遅い」と苦情が来た。運用 PC から内向きの名前でサーバへ SSH する。経由する機器は <b>L3SW → DC-FW → L2SW</b>。</p>
          <p>ちなみに内向きの名前の URL で HTTPS を開くと、<b>証明書のコモン名と URL のドメイン名が異なる</b>ので警告が出る。</p>`,
        phases: [[['ops', 'l3']], [['l3', 'wan']], [['wan', 'fwz']], [['fwz', 'sw']], [['sw', 'ec1']]],
        frame: ipFrame('10.60.0.20', '10.50.1.12', '内向きの名前を解決した値'),
        links: { 'l3-ops': 'path', 'wan-l3': 'path', 'fwz-wan': 'path', 'fwz-sw': 'path', 'sw-ec1': 'path' },
        badges: { ec1: 'CPU 高負荷' },
        side: {
          title: '調査の結果',
          head: ['調べたこと', '結果'],
          rows: [
            ['外向き・内向きへの ping', '大差なし'],
            ['FW のログ', '攻撃の兆候なし'],
            ['サーバの CPU 使用率', '設計値を大きく超える'],
          ],
          hit: 2,
          foot: 'サーバの処理能力の不足と判断',
        },
      },
      {
        title: '② LB を入れて3台にする',
        focus: 'lb',
        desc: `<p>サイトを止めずに済む<b>スケールアウト</b>を選ぶ。2台で足りる計算だが3台にするのは、<b>1台が故障しても応答速度を落とさないため</b>。</p>
          <p>DNS の web の値は変えない。そのアドレスは <b>LB の仮想 IP アドレス</b>になる。既設サーバはホスト名に加えて<b>自身の IP アドレス</b>を .15 へ移す。</p>`,
        nodes: { ec2: 'done', ec3: 'done', lb: 'done' },
        badges: { lb: '.12 を継ぐ', ec1: '.12 から .15 へ', ec2: '増設', ec3: '増設' },
        side: {
          title: '増強の方式',
          head: ['方式', '内容', '停止'],
          rows: [
            ['スケールアップ', '1台の性能を上げる', '必要'],
            ['スケールアウト', '台数を増やす', '不要'],
          ],
          hit: 1,
        },
      },
      {
        title: '③ 送信元を変換しない場合の流れ',
        focus: 'lb',
        pkt: 'ip',
        label: 'HTTP',
        desc: `<p>FW の NAT は変えないので、<b>FW→LB の宛先は仮想 IP の 10.50.1.12</b>。LB が宛先をサーバの実アドレスへ変える。</p>
          <p>送信元を変換しないと、サーバからは利用者のアドレスが見える。応答を LB へ戻すため、<b>サーバのデフォルトゲートウェイを DC-FW から LB へ変更</b>する。</p>`,
        phases: [...inbound(), [['sw', 'lb']], [['lb', 'sw']], [['sw', 'ec1']], [['ec1', 'sw', { label: '応答' }]], [['sw', 'lb', { label: '応答' }]], [['lb', 'sw', { label: '応答' }]], ...outbound({ label: '応答' })],
        frame: ipFrame('198.51.100.50', '10.50.1.15', 'LB→EC1。送信元はそのまま'),
        badges: { ec1: 'GW＝LB' },
        side: pathTable('送信元変換なしの IP アドレス', '198.51.100.50', '198.51.100.50', 'FW の NAT の表は変わらない'),
      },
      {
        title: '④ 問題：運用 PC に戻りが届かない',
        focus: 'lb',
        pkt: 'ip',
        label: 'SSH',
        desc: `<p>メンテナンスのため運用 PC からサーバへ直接つなぐ。行きは届くが、戻りはデフォルトゲートウェイの LB へ渡される。</p>
          <p>LB は<b>ルータとして動作しない</b>ので、自分宛てでないパケットを転送できず、<b>通信が成立しない</b>。</p>`,
        phases: [[['ops', 'l3']], [['l3', 'wan']], [['wan', 'fwz']], [['fwz', 'sw']], [['sw', 'ec1']], [['ec1', 'sw', { label: '戻り' }]], [['sw', 'lb', { label: '戻り', drop: true }]]],
        frame: ipFrame('10.50.1.15', '10.60.0.20', '戻りのパケット'),
        badges: { ec1: 'GW＝LB', lb: 'ルータではない' },
      },
      {
        title: '⑤ 対策：送信元変換と TLS の終端',
        focus: 'lb',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>サーバのゲートウェイは <b>DC-FW のまま</b>にし、LB で送信元を<b>実アドレスの 10.50.1.14 へ変換</b>する。応答は必ず LB へ戻り、運用 PC の通信も直接返せる。</p>
          <p>サーバのログから接続元が消えるので、<b>X-Forwarded-For で接続元 PC の IP アドレスを通知</b>する。</p>
          <p>証明書は増設サーバに入れず、既設サーバの<b>証明書と秘密鍵のペアを LB へ移す</b>。秘密鍵がなければ TLS を終端できない。</p>`,
        phases: [...inbound(), [['sw', 'lb']], [['lb', 'sw', { label: 'HTTP' }]], [['sw', 'ec1', { label: 'HTTP' }]]],
        frame: [
          ['IPv4ヘッダ（LB→EC1）', [
            ['送信元IP', '10.50.1.14', 'LB の実アドレス'],
            ['宛先IP', '10.50.1.15'],
          ]],
          ['HTTP ヘッダ', [
            ['X-Forwarded-For', '198.51.100.50', '本来の接続元'],
          ]],
        ],
        badges: { lb: '証明書＋秘密鍵' },
        side: pathTable('送信元変換ありの IP アドレス', '10.50.1.14', '10.50.1.14', 'FW より外側の区間は変わらない'),
      },
      {
        title: '⑥ 同じサーバへ送り続ける',
        focus: 'lb',
        pkt: 'ip',
        label: '応答',
        desc: `<p>セッション ID はサーバが作り、最初の応答で Cookie に入れる。LB は<b>応答の Cookie の ID が表に存在しないとき</b>、そのサーバと組にして表へ追加する。</p>
          <p>2回目からは要求の Cookie を見て、同じサーバへ送る。ポート番号で見分けないのは、<b>再接続のたびにポート番号が変わる可能性がある</b>から。</p>
          <p>振分け先はエージェントが集めた負荷の情報で動的に決めるので、処理の重さの差があっても偏りを抑えられる。</p>`,
        phases: [[['ec2', 'sw']], [['sw', 'lb', { label: 'Cookie発行' }]], [['lb', 'sw', { label: '要求' }]], [['sw', 'ec2', { label: '要求' }]]],
        badges: { ec2: 'ID を発行', lb: '表に追加' },
        side: [
          {
            title: 'アクセス元の見分け方',
            head: ['方式', '問題'],
            rows: [
              ['IP アドレス', '同じ出口の会社は1台へ偏る'],
              ['IP＋ポート番号', '再接続で維持できない'],
              ['Cookie の ID', 'なし（採用）'],
            ],
            hit: 2,
          },
          {
            title: 'LB のセッション表（ID は例）',
            head: ['セッション ID', '振分け先'],
            rows: [
              ['a81f', 'EC1'],
              ['c27d', 'EC2'],
            ],
            hit: 1,
          },
        ],
      },
      {
        title: '⑦ ヘルスチェック',
        focus: 'ec3',
        pkt: 'ctl',
        label: 'HTTP',
        desc: `<p>EC3 のアプリだけが異常を起こした場面。OS は動いていて ping に応答し、ポートにつなげることもある。</p>
          <p>L3 と L4 は<b>サービスが稼働しているかどうかを検査しない</b>ので、正常と判定してしまう。L7 で実際に HTTP の応答を確かめ、異常なサーバを振分けから外す。</p>`,
        phases: [[['lb', 'sw']], [['sw', 'ec1'], ['sw', 'ec2'], ['sw', 'ec3', { drop: true }]]],
        nodes: { ec3: 'down' },
        badges: { ec3: 'アプリ異常', lb: '振分けから外す' },
        side: {
          title: '方式ごとの判定（EC3）',
          head: ['方式', '見るもの', '判定'],
          rows: [
            ['L3', 'ping の応答', '正常（誤り）'],
            ['L4', 'TCP 接続', '正常になりうる'],
            ['L7', 'HTTP の応答', '異常を検知'],
          ],
          hit: 2,
        },
      },
      {
        title: '⑧ SSO：IdP へ回って ST を得る',
        focus: 'pc',
        pkt: 'ip',
        label: 'ログイン',
        desc: `<p>会員企業の社内アカウントでログインできるよう、EC サーバを SAML の SP にする（図は LB を省略）。</p>
          <p>SP は IdP へリダイレクトさせるが、IdP は企業ごとに違うので、<b>所属する会員企業の情報</b>が要る。PC は KDC に TGT を見せて、IdP 向けの ST を受け取る。</p>
          <p>ST は <b>IdP の鍵で暗号化</b>されている。PC はその鍵を<b>持っていないので改ざんできない</b>。</p>`,
        phases: [
          ...inbound(), [['sw', 'ec1']],
          [['ec1', 'sw', { label: 'IdPへ転送' }]], ...outbound({ label: 'IdPへ転送' }),
          [['pc', 'idp', { label: 'SAML要求' }]],
          [['idp', 'pc', { label: '401' }]],
          [['pc', 'kdc', { label: 'TGT' }]],
          [['kdc', 'pc', { label: 'ST' }]],
        ],
        badges: { ec1: 'SP', idp: 'IdP', kdc: 'ST を発行' },
        side: {
          title: 'KDC が渡す情報',
          head: ['部分', '暗号化の鍵', 'PC が開けるか'],
          rows: [
            ['全体の包み', 'PC の鍵', '開ける'],
            ['中の ST', 'IdP の鍵', '開けない'],
          ],
          hit: 1,
        },
      },
      {
        title: '⑨ SSO：署名付きの証明を SP へ',
        focus: 'ec1',
        pkt: 'ip',
        label: 'ST',
        desc: `<p>PC が ST を IdP へ示すと、IdP は本人を確認して、署名を付けた SAML アサーションを、PC 経由で SP へ送らせる。</p>
          <p>SP にはあらかじめ <b>IdP の公開鍵証明書</b>を登録しておく。署名の検証で分かるのは、<b>信頼する IdP が生成したこと</b>と<b>改ざんされていないこと</b>の2つ。</p>
          <p>問題がなければ、本人の確認と利用権限の付与を行う。PC を経由しても、署名があるから安全に受け取れる。</p>`,
        phases: [
          [['pc', 'idp']],
          [['idp', 'pc', { label: 'SAML応答' }]],
          ...inbound({ label: 'SAML応答' }), [['sw', 'ec1', { label: 'SAML応答' }]],
        ],
        frame: [
          ['SAML Response（概略）', [
            ['アサーション', '認証の時刻や方式、利用者の属性、権限'],
            ['デジタル署名', 'IdP の秘密鍵で作成', 'SP が公開鍵で検証'],
          ]],
        ],
        badges: { ec1: '署名を検証', idp: '署名を作成' },
        nodes: { ec1: 'done' },
      },
    ],
  });
})();
