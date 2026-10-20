// DNS：再帰問い合わせと反復問い合わせ、キャッシュ【ジャンル5】【6-7】
(() => {
  const PC = '192.168.1.10';
  const RES = '192.168.1.53';

  function dnsFrame(src, dst, sport, dport, dns) {
    return [
      ['IPv4ヘッダ', [['送信元IP', src], ['宛先IP', dst], ['プロトコル', '17', 'UDP']]],
      ['UDPヘッダ', [['送信元ポート', String(sport)], ['宛先ポート', String(dport)]]],
      ['DNSメッセージ', dns],
    ];
  }
  const cache = (rows, hit) => ({
    title: 'リゾルバのキャッシュ',
    head: ['名前', 'タイプ', '値', 'TTL'],
    rows: rows.length ? rows : [['（空）', '', '', '']],
    hit,
  });
  const C_JP = ['jp.', 'NS', 'a.dns.jp.', '172800'];
  const C_EX = ['example.co.jp.', 'NS', 'ns1.example.co.jp.', '86400'];
  const C_WWW = ['www.example.co.jp.', 'A', '203.0.113.80', '3600'];

  SCENARIOS.push({
    id: 'dns',
    chapter: 5,
    title: 'DNS',
    subtitle: 'キャッシュDNSサーバが権威DNSサーバを順にたどって名前を解決するまで',
    viewBox: '0 0 810 275',
    nodes: {
      pc:   { x: 80,  y: 150, name: 'PC', kind: 'pc', lines: [PC] },
      res:  { x: 290, y: 60,  name: 'リゾルバ', kind: 'sv', lines: ['キャッシュDNS', RES], linesAbove: true },
      www:  { x: 290, y: 220, name: 'www', kind: 'sv', lines: ['203.0.113.80'] },
      root: { x: 590, y: 40,  name: 'ルート', kind: 'sv', lines: ['権威DNS（.）'] },
      jp:   { x: 590, y: 130, name: 'jp', kind: 'sv', lines: ['権威DNS（jp.）'] },
      auth: { x: 590, y: 220, name: 'example', kind: 'sv', lines: ['権威DNS（example.co.jp.）'] },
    },
    links: [
      { a: 'pc', b: 'res' },
      { a: 'pc', b: 'www' },
      { a: 'res', b: 'root' },
      { a: 'res', b: 'jp' },
      { a: 'res', b: 'auth' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>PC が <b>www.example.co.jp</b> にアクセスするために、IP アドレスを調べる。</p>
          <ul>
            <li><b>キャッシュDNSサーバ（フルリゾルバ）</b>：PC から依頼を受けて、代わりに名前を調べ、結果を覚えておく</li>
            <li><b>権威DNSサーバ</b>：自分の担当範囲（ゾーン）の正解を持っている</li>
          </ul>
          <p>PC → リゾルバは<b>再帰問い合わせ</b>（最終的な答えをちょうだい）、リゾルバ → 権威DNS は<b>反復（非再帰）問い合わせ</b>（知っている範囲で教えて）。</p>`,
      },
      {
        title: '① PC → リゾルバ',
        focus: 'pc', pkt: 'ctl', label: 'Query', noCompare: true,
        desc: `<p>PC（スタブリゾルバ）が、設定されたキャッシュDNSサーバに問い合わせる。<b>RD=1</b>（再帰を要求）。</p>
          <p>DNS は通常 <b>UDP 53番</b>。応答が大きい場合やゾーン転送では TCP 53番も使う。</p>`,
        phases: [[['pc', 'res']]],
        frame: dnsFrame(PC, RES, 51000, 53, [
          ['ID', '0x1a2b'], ['QR', '0', '問い合わせ'], ['RD', '1', '再帰を要求'],
          ['質問', 'www.example.co.jp. A'],
        ]),
        side: cache([]),
      },
      {
        title: '② ルートへ',
        focus: 'root', pkt: 'ctl', noCompare: true,
        desc: `<p>キャッシュが空なので、リゾルバは<b>ルートDNSサーバ</b>に問い合わせる（ルートサーバのアドレスはヒント情報として最初から持っている）。</p>
          <p>ルートは www.example.co.jp の答えは知らないが、「<b>jp. は a.dns.jp などが担当</b>」と<b>委任先（NS レコード）</b>を返す（リファラル）。</p>
          <p>ID と送信元ポートは問い合わせごとに<b>ランダム</b>にする（キャッシュポイズニング対策）。</p>`,
        phases: [[['res', 'root', { label: 'Query' }]], [['root', 'res', { label: '委任 jp.' }]]],
        frame: dnsFrame('（ルートDNS）', RES, 53, 40123, [
          ['ID', '0x7c11'], ['QR', '1', '応答'], ['AA', '0', '権威ある回答ではない'],
          ['回答', '（なし）'],
          ['権威', 'jp. NS a.dns.jp.'],
          ['追加', 'a.dns.jp. A （グルーレコード）'],
        ]),
        side: cache([C_JP], 0),
      },
      {
        title: '③ jp へ',
        focus: 'jp', pkt: 'ctl', noCompare: true,
        desc: `<p>リゾルバは jp の権威DNSサーバに同じ質問をする。返ってくるのは「<b>example.co.jp. は ns1.example.co.jp が担当</b>」という委任。</p>
          <p>委任先のサーバ名が委任されるゾーンの中にある（ns1.<b>example.co.jp</b>）ので、そのアドレスも<b>グルーレコード</b>として一緒に返す。そうしないと ns1 のアドレスを調べられない。</p>`,
        phases: [[['res', 'jp', { label: 'Query' }]], [['jp', 'res', { label: '委任 example' }]]],
        frame: dnsFrame('（jp DNS）', RES, 53, 40124, [
          ['ID', '0x2f90'], ['QR', '1', '応答'], ['AA', '0'],
          ['回答', '（なし）'],
          ['権威', 'example.co.jp. NS ns1.example.co.jp.'],
          ['追加', 'ns1.example.co.jp. A 203.0.113.53'],
        ]),
        side: cache([C_JP, C_EX], 1),
      },
      {
        title: '④ example へ',
        focus: 'auth', pkt: 'ctl', noCompare: true,
        desc: `<p>example.co.jp の権威DNSサーバが <b>A レコード</b>を返す。<b>AA=1</b>（権威ある回答）。</p>
          <p><b>TTL 3600</b> は「この情報を 3600 秒キャッシュしてよい」という意味。</p>`,
        phases: [[['res', 'auth', { label: 'Query' }]], [['auth', 'res', { label: 'A 応答' }]]],
        frame: dnsFrame('203.0.113.53', RES, 53, 40125, [
          ['ID', '0x55e1'], ['QR', '1', '応答'], ['AA', '1', '権威ある回答'],
          ['回答', 'www.example.co.jp. 3600 A 203.0.113.80'],
        ]),
        side: cache([C_JP, C_EX, C_WWW], 2),
      },
      {
        title: '⑤ リゾルバ → PC',
        focus: 'res', pkt: 'ctl', label: 'Answer', noCompare: true,
        desc: `<p>リゾルバが PC に答えを返す。<b>RA=1</b>（再帰に対応している）、AA=0（リゾルバ自身は権威を持たない）。</p>
          <p>PC もこの結果を OS のキャッシュに保存する。</p>`,
        phases: [[['res', 'pc']]],
        frame: dnsFrame(RES, PC, 53, 51000, [
          ['ID', '0x1a2b', '①と同じID'], ['QR', '1', '応答'], ['RD', '1'], ['RA', '1', '再帰に対応'], ['AA', '0'],
          ['回答', 'www.example.co.jp. 3600 A 203.0.113.80'],
        ]),
        side: cache([C_JP, C_EX, C_WWW], 2),
      },
      {
        title: '⑥ Web アクセス',
        focus: 'pc', pkt: 'ip', label: 'HTTP',
        desc: `<p>やっと IP アドレスが分かったので、PC は 203.0.113.80 に接続できる。</p>`,
        phases: [[['pc', 'www']]],
        side: cache([C_JP, C_EX, C_WWW]),
      },
      {
        title: '⑦ 2回目はキャッシュ',
        focus: 'res', pkt: 'ctl', noCompare: true,
        desc: `<p>TTL が切れる前に、別の端末が同じ名前を問い合わせた。リゾルバは<b>キャッシュから即答</b>し、権威DNSサーバには問い合わせない。</p>
          <p>別のサブドメイン（mail.example.co.jp など）を聞かれた場合も、キャッシュ済みの NS を使って <b>example の権威DNSサーバにいきなり</b>問い合わせられる。</p>`,
        phases: [[['pc', 'res', { label: 'Query' }]], [['res', 'pc', { label: 'Answer' }]]],
        side: cache([C_JP, C_EX, C_WWW], 2),
      },
      {
        title: 'まとめ',
        desc: `<p>午後で問われるセキュリティ対策：</p>
          <ul>
            <li><b>キャッシュポイズニング</b>：偽の応答を先に送り込まれる → 送信元ポートのランダム化、<b>DNSSEC</b></li>
            <li><b>オープンリゾルバ</b>：外部からの再帰問い合わせに答えると DNS リフレクション攻撃に悪用される → 内部からのみ許可</li>
            <li>権威DNSサーバとキャッシュDNSサーバは<b>分離</b>する</li>
          </ul>`,
        side: {
          title: '主なリソースレコード',
          head: ['タイプ', '内容'],
          rows: [
            ['A / AAAA', 'IPv4 / IPv6 アドレス'],
            ['NS', 'ゾーンを担当する権威DNSサーバ'],
            ['MX', 'メールの配送先サーバ（優先度付き）'],
            ['CNAME', '別名（正式名への参照）'],
            ['PTR', 'IP アドレス → 名前（逆引き）'],
            ['TXT', '任意の文字列（SPF、DMARC などで利用）'],
            ['SOA', 'ゾーンの管理情報（シリアル番号、リフレッシュ間隔など）'],
          ],
        },
      },
    ],
  });
})();
