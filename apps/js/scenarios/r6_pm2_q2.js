// R6午後Ⅱ問2 電子メールのなりすまし対策：SPF・DKIM で守り、委託で残る穴を S/MIME で塞ぐ
(() => {
  const smtpFrame = (src, dst, mailFrom, note) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src, '受信側が観測する接続元'],
      ['宛先IP', dst],
    ]],
    ['SMTP', [
      ['MAIL FROM', mailFrom, 'SPF が見るドメイン'],
      ['補足', note],
    ]],
  ];

  const spfTable = (withC, hit) => ({
    title: 'm-corp.example の SPF レコード（TXT）',
    head: ['機構', '値', '意味'],
    rows: [
      ['+ip4', '203.0.113.11', 'mx1 の外向きアドレス'],
      ['+ip4', '203.0.113.12', 'mx2 の外向きアドレス'],
      ...(withC ? [['+ip4', '198.51.100.21', '委託先の中継サーバ（追加）']] : []),
      ['-all', '—', '上に無いものは不合格'],
    ],
    hit,
  });
  const check = (title, spf, dkim, foot) => ({
    title,
    head: ['検査', '結果'],
    rows: [['SPF', spf], ['DKIM', dkim]],
    foot,
  });

  SCENARIOS.push({
    id: 'r6_pm2_q2',
    title: '送信ドメイン認証と業務委託',
    subtitle: 'SPF と DKIM はサーバの証明。委託で残る穴を S/MIME で塞ぐ',
    viewBox: '0 0 900 420',
    nodes: {
      mx1:    { x: 70,  y: 60,  name: '中継MX1', kind: 'sv', lines: ['10.20.0.11'], linesAbove: true },
      mx2:    { x: 190, y: 60,  name: '中継MX2', kind: 'sv', lines: ['10.20.0.12'], linesAbove: true },
      nsx:    { x: 310, y: 60,  name: '外部DNS', kind: 'sv' },
      fw:     { x: 190, y: 190, name: 'FW', kind: 'fw' },
      pcm:    { x: 60,  y: 320, name: '担当PC', kind: 'pc' },
      mbox:   { x: 170, y: 320, name: '社内メール', kind: 'sv' },
      nsi:    { x: 290, y: 320, name: '内部DNS', kind: 'sv' },
      net:    { x: 450, y: 190, name: 'ネット', kind: 'cloud' },
      atk:    { x: 450, y: 60,  name: '攻撃者', kind: 'pc', lines: ['192.0.2.66'], linesAbove: true },
      cust:   { x: 640, y: 70,  name: '顧客メール', kind: 'sv' },
      custpc: { x: 800, y: 70,  name: '顧客PC', kind: 'pc' },
      cmx:    { x: 600, y: 320, name: 'C社中継', kind: 'sv', lines: ['198.51.100.21'] },
      cmbox:  { x: 730, y: 320, name: 'C社メール', kind: 'sv' },
      pcy:    { x: 850, y: 250, name: 'C社担当', kind: 'pc', lines: ['委託チーム'] },
      pcx:    { x: 850, y: 370, name: '別チーム', kind: 'pc' },
    },
    links: [
      { a: 'fw', b: 'mx1' }, { a: 'fw', b: 'mx2' }, { a: 'fw', b: 'nsx' },
      { a: 'pcm', b: 'mbox' }, { a: 'mbox', b: 'nsi' }, { a: 'mbox', b: 'fw' },
      { a: 'fw', b: 'net' }, { a: 'net', b: 'atk' }, { a: 'net', b: 'cust' }, { a: 'cust', b: 'custpc' },
      { a: 'net', b: 'cmx' }, { a: 'cmx', b: 'cmbox' }, { a: 'cmbox', b: 'pcy' }, { a: 'cmbox', b: 'pcx' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>M 社は製品サポートを窓口アドレス <b>support@m-corp.example</b> で行う。メールは社内メールサーバから DMZ の中継サーバを通って社外へ出る。</p>
          <p>サポートの一部を C 社へ委託する。C 社の担当者も<b>同じ窓口アドレスで</b>顧客へ送ることが条件。</p>
          <p>なりすましを防ぐ仕組みを順に重ね、それぞれ<b>何を証明し、何を証明しないか</b>を追う。</p>`,
        badges: { pcy: '委託先' },
        side: {
          title: '登場する DNS の情報',
          head: ['サーバ', 'レコード', '値'],
          rows: [
            ['外部DNS', 'MX', '30 mx1 ／ 5 mx2'],
            ['外部DNS', 'A', 'mx1 203.0.113.11 ／ mx2 203.0.113.12'],
            ['内部DNS', 'A', 'mx1 10.20.0.11 ／ mx2 10.20.0.12'],
            ['内部DNS', 'A（TTL 短）', 'relay 10.20.0.11 と 10.20.0.12'],
          ],
        },
      },
      {
        title: '① 社内から中継サーバへ振り分け',
        focus: 'mbox',
        pkt: 'ctl',
        label: 'DNS',
        desc: `<p>社内メールサーバの転送先は、A レコードが2本ある <b>relay.m-corp.internal</b>。これが DNS ラウンドロビン。</p>
          <p>問い合わせ元は社内メールサーバ1台だけなので、キャッシュが残ると同じ先へ送り続ける。そこで<b>TTL を短くして</b>名前解決を増やし、偏りを小さくする。</p>
          <p>応答がなければもう一方へ転送する機能もある。</p>`,
        phases: [
          [['mbox', 'nsi']],
          [['nsi', 'mbox']],
          [['mbox', 'fw', { kind: 'ip', label: 'SMTP' }]],
          [['fw', 'mx1', { kind: 'ip', label: 'SMTP' }]],
        ],
        links: { 'mbox-fw': 'path', 'fw-mx1': 'path' },
        side: {
          title: '内部DNS の relay の回答',
          head: ['名前', 'TTL', 'A'],
          rows: [
            ['relay.m-corp.internal', '短い', '10.20.0.11'],
            ['relay.m-corp.internal', '短い', '10.20.0.12'],
          ],
          foot: '同じ名前で2行あるのがラウンドロビン',
        },
      },
      {
        title: '② 社外からの受信は MX で決まる',
        focus: 'mx2',
        pkt: 'ip',
        label: 'SMTP',
        desc: `<p>顧客が送るメールは MX の <b>Preference 値が小さい mx2</b> へ向かう。こちらは分散ではなく、mx1 を予備にする主副の関係。</p>
          <p>FW は<b>静的 NAT</b> で宛先を変換する。外部 DNS の 203.0.113.12 を、DMZ での実アドレス 10.20.0.12 へ変える。mx1 なら 203.0.113.11 を 10.20.0.11 へ。</p>`,
        phases: [[['cust', 'net']], [['net', 'fw']], [['fw', 'mx2']], [['mx2', 'fw']], [['fw', 'mbox']]],
        links: { 'cust-net': 'path', 'net-fw': 'path', 'fw-mx2': 'path', 'fw-mbox': 'path' },
        badges: { mx2: '優先' },
        side: {
          title: 'FW の静的 NAT',
          head: ['ホスト', '宛先IP（変換前）', '変換後'],
          rows: [
            ['mx1', '203.0.113.11', '10.20.0.11'],
            ['mx2', '203.0.113.12', '10.20.0.12'],
          ],
          hit: 1,
        },
      },
      {
        title: '③ 逆引きではすり抜ける',
        focus: 'atk',
        pkt: 'ip',
        label: '偽メール',
        desc: `<p>接続元の IP を<b>逆引き</b>して FQDN を求め、差出人のドメインと比べる案を考える。</p>
          <p>しかし、攻撃者は自分の管理する DNS の PTR レコードの <b>FQDN の欄に、詐称したいドメイン名を登録</b>できる。比べると一致するので見抜けない。PTR は IP の持ち主の自己申告にすぎない。</p>
          <p>そこで、詐称される側のドメインの持ち主が情報を公開する<b>送信ドメイン認証</b>へ進む。</p>`,
        phases: [[['atk', 'net']], [['net', 'cust']]],
        frame: smtpFrame('192.0.2.66', '顧客のメールサーバ', 'support@m-corp.example', '差出人を詐称'),
        badges: { atk: '偽PTR' },
        side: {
          title: '攻撃者の DNS の PTR',
          head: ['IP', 'タイプ', 'FQDN'],
          rows: [['192.0.2.66', 'PTR', 'mx9.m-corp.example']],
          foot: 'ドメインが一致してしまい、検査は素通り',
        },
      },
      {
        title: '④ SPF：接続元 IP を照合する',
        focus: 'cust',
        pkt: 'ip',
        label: 'SMTP',
        desc: `<p>顧客のサーバは <b>SMTP の MAIL FROM</b> で示されたドメイン m-corp.example の TXT レコードを、M 社の外部 DNS から取得する。</p>
          <p>判定は<b>接続元メールサーバの IP が SPF レコードに登録されているか</b>。登録するのは社外から見える 203.0.113.11 と .12 で、DMZ の 10.20.0.x ではない。</p>
          <p>攻撃者の 192.0.2.66 はレコードに無いので不合格。</p>`,
        phases: [
          [['net', 'cust']],
          [['cust', 'net', { kind: 'ctl', label: 'TXT?' }]],
          [['net', 'fw', { kind: 'ctl', label: 'TXT?' }]],
          [['fw', 'nsx', { kind: 'ctl', label: 'TXT?' }]],
        ],
        frame: smtpFrame('203.0.113.12', '顧客のメールサーバ', 'support@m-corp.example', '正規の中継サーバから'),
        badges: { cust: 'SPF合格' },
        nodes: { cust: 'done' },
        side: spfTable(false, 1),
      },
      {
        title: '⑤ DKIM：サーバが署名する',
        focus: 'mx2',
        pkt: 'ip',
        label: 'SMTP',
        desc: `<p>中継サーバがメールの<b>ヘッダと本文</b>から署名を作り、DKIM-Signature ヘッダを付ける。秘密鍵は中継サーバの中、<b>公開鍵は DNS の TXT</b>（Base64）。CA の証明書は要らない。</p>
          <p>顧客は d タグと s タグから <b>mcorp1._domainkey.m-corp.example</b> を引く。UDP の DNS は上限 <b>512 バイト</b>なので、鍵は一般に2,048ビット程度。</p>
          <p>検証に成功すれば、<b>正規のメールサーバから送られたと分かる</b>。</p>`,
        phases: [
          [['mx2', 'fw']],
          [['fw', 'net']],
          [['net', 'cust']],
          [['cust', 'net', { kind: 'ctl', label: 'TXT?' }]],
          [['net', 'fw', { kind: 'ctl', label: 'TXT?' }]],
          [['fw', 'nsx', { kind: 'ctl', label: 'TXT?' }]],
        ],
        frame: [
          ['DKIM-Signature ヘッダ', [
            ['d', 'm-corp.example', '署名したドメイン'],
            ['s', 'mcorp1', 'セレクター（鍵を選ぶ）'],
            ['b', '（Base64 の署名）'],
          ]],
          ['DNS の TXT', [
            ['k', 'rsa', 'RSA を使う'],
            ['p', '（Base64 の公開鍵）'],
          ]],
        ],
        badges: { mx2: '署名', cust: 'DKIM合格' },
        nodes: { cust: 'done' },
      },
      {
        title: '⑥ 委託を始めると不合格に',
        focus: 'cmx',
        pkt: 'ip',
        label: 'SMTP',
        desc: `<p>C 社の担当者が、差出人を窓口アドレスにして <b>C 社の社内メール → C 社の中継サーバ</b>経由で顧客へ送る。</p>
          <p>MAIL FROM は m-corp.example のまま。顧客が引く SPF レコードに<b>198.51.100.21 が無い</b>ので不合格になる。DKIM の署名も、まだ無い。</p>
          <p>このままでは、本物のサポートメールがなりすまし扱いされる。</p>`,
        phases: [[['pcy', 'cmbox']], [['cmbox', 'cmx']], [['cmx', 'net']], [['net', 'cust']]],
        frame: smtpFrame('198.51.100.21', '顧客のメールサーバ', 'support@m-corp.example', 'C 社の中継サーバから'),
        badges: { cust: '不合格' },
        side: [spfTable(false), check('顧客の判定', '不合格', '署名なし')],
      },
      {
        title: '⑦ 対策：M 社の DNS に登録する',
        focus: 'nsx',
        pkt: 'ip',
        label: 'SMTP',
        desc: `<p><b>M 社の外部 DNS に、C 社の中継サーバの IP を追加</b>する。顧客が引くのは差出人側のゾーンで、C 社の DNS は見られない。</p>
          <p>DKIM は C 社の中継サーバで署名する。<b>d タグは m-corp.example</b> のまま、s タグは C 社用の <b>csup1</b> とし、その公開鍵も M 社の外部 DNS に登録する。</p>
          <p>鍵を分ける利点は、<b>C 社から鍵が漏れても M 社の DKIM は影響を受けない</b>こと。</p>`,
        phases: [[['cmx', 'net']], [['net', 'cust']]],
        frame: [
          ['DKIM-Signature ヘッダ', [
            ['d', 'm-corp.example', '顧客が M 社の DNS を引く'],
            ['s', 'csup1', 'C 社専用の鍵'],
          ]],
        ],
        links: { 'cmx-net': 'path', 'net-cust': 'path' },
        badges: { nsx: '追加登録', cust: '合格' },
        nodes: { cust: 'done' },
        side: [spfTable(true, 2), check('顧客の判定', '合格', '合格')],
      },
      {
        title: '⑧ 残る穴：同じ出口の別チーム',
        focus: 'pcx',
        pkt: 'ip',
        label: '偽メール',
        desc: `<p>C 社の<b>別チームの社員</b>が差出人を窓口アドレスにして送る。経路は委託チームと同じ。</p>
          <p>なりすましメールも<b>同じ C 社の中継サーバから送られる</b>ので、接続元 IP も署名も正規のものになり、SPF も DKIM も合格する。</p>
          <p>どちらも<b>サーバの単位</b>の確認で、誰が書いたかは見ていない。</p>`,
        phases: [[['pcx', 'cmbox']], [['cmbox', 'cmx']], [['cmx', 'net']], [['net', 'cust']]],
        frame: smtpFrame('198.51.100.21', '顧客のメールサーバ', 'support@m-corp.example', '別チームが詐称'),
        links: { 'pcx-cmbox': 'path', 'cmbox-cmx': 'path', 'cmx-net': 'path', 'net-cust': 'path' },
        badges: { pcx: 'なりすまし', cust: '検知できず' },
        side: check('顧客の判定', '合格', '合格', '正規のサーバを通っているので見分けられない'),
      },
      {
        title: '⑨ S/MIME：メールソフトの署名',
        focus: ['pcy', 'custpc'],
        pkt: 'esp',
        label: '署名付き',
        desc: `<p>S/MIME は<b>メールソフトの間</b>で署名と検証をする。窓口アドレスの電子証明書と秘密鍵は、担当者の PC にだけ入れる。</p>
          <p>別チームは秘密鍵を持たないので、正しい署名を付けられない。これで中継サーバが同じでも見分けられる。</p>
          <p>設問5(1)〜(3)は不備により公式解答例がない。右の表は RSA 署名の標準的な流れで、顧客への周知も併せて必要になる。</p>`,
        phases: [[['pcy', 'cmbox']], [['cmbox', 'cmx']], [['cmx', 'net']], [['net', 'cust']], [['cust', 'custpc']]],
        badges: { pcy: '秘密鍵', custpc: '検証' },
        nodes: { custpc: 'done' },
        side: {
          title: '署名と検証の流れ（RSA の例）',
          head: ['担当', '処理'],
          rows: [
            ['送信側', '本文のハッシュ値を計算'],
            ['送信側', '秘密鍵で処理して署名を作成'],
            ['送信側', '証明書と署名を付けて送信'],
            ['受信側', '証明書の公開鍵で署名を処理'],
            ['受信側', '本文のハッシュ値を再計算'],
            ['受信側', '2つが一致すれば改ざんなし'],
          ],
        },
      },
    ],
  });
})();
