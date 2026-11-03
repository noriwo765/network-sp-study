// R5午後Ⅰ問1 Webシステムの更改：ALPN で HTTP/2 を決め、L7 の LB が HTTP/1.1 へ変換して振り分ける
(() => {
  const routeTable = hit => ({
    title: '静的経路',
    head: ['機器', '宛先', '次の転送先'],
    rows: [
      ['L3SW', '10.40.5.0/24', '10.40.6.10'],
      ['クラウドRT', '0.0.0.0/0', '10.40.6.9'],
    ],
    hit,
    foot: '次の転送先は専用線の向こう側のアドレス',
  });
  const orderTable = (rows, foot) => ({
    title: '応答の順序',
    head: ['要求', '結果ができる順', '返す順'],
    rows,
    foot,
  });

  SCENARIOS.push({
    id: 'r5_pm1_q1',
    title: 'HTTP/2 とクラウド LB',
    subtitle: '通信の開始で HTTP/2 を決め、LB で HTTP/1.1 に変換して振り分けるまでを追う',
    viewBox: '0 0 900 340',
    nodes: {
      browser: { x: 70,  y: 170, name: 'ブラウザ', kind: 'pc' },
      inet:    { x: 215, y: 170, name: 'インターネット', kind: 'cloud' },
      lb:      { x: 360, y: 170, name: 'クラウドLB', kind: 'sv' },
      web:     { x: 500, y: 70,  name: 'Webサーバ', kind: 'sv', lines: ['静的（複数台）'], linesAbove: true },
      vrt:     { x: 500, y: 270, name: 'クラウドRT', kind: 'rt', lines: ['10.40.6.10'] },
      l3:      { x: 650, y: 270, name: 'L3SW', kind: 'sw', lines: ['10.40.6.9'] },
      ap:      { x: 800, y: 270, name: 'APサーバ', kind: 'sv', lines: ['動的'] },
      fw:      { x: 650, y: 150, name: 'FW', kind: 'fw' },
      dns:     { x: 800, y: 150, name: 'DNS', kind: 'sv', lines: ['権威＋キャッシュ'] },
    },
    links: [
      { a: 'browser', b: 'inet' },
      { a: 'inet', b: 'lb' },
      { a: 'lb', b: 'web' },
      { a: 'lb', b: 'vrt' },
      { a: 'web', b: 'vrt' },
      { a: 'vrt', b: 'l3', net: '専用線' },
      { a: 'l3', b: 'ap' },
      { a: 'l3', b: 'fw' },
      { a: 'fw', b: 'dns' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>通販サイトの更改の話。これまでは自社の DC にある Web サーバが静的な画面を配り、動的な画面は奥の AP サーバへ取り次いでいた。この取り次ぎが<b>リバースプロキシ</b>。</p>
          <p>更改後は静的コンテンツをクラウドへ移し、入口に<b>クラウド LB</b> を置く。AP サーバは重要なデータがあるので DC に残し、クラウドとは<b>専用線</b>で結ぶ。</p>
          <p>ブラウザと LB の間は <b>HTTP/2</b>、LB と各サーバの間は <b>HTTP/1.1</b>。この違いが最後の判断につながる。</p>`,
        focus: 'lb',
        badges: { lb: '入口' },
        side: {
          title: '更改の前後',
          head: ['', '前', '後'],
          rows: [
            ['入口', 'Web サーバ', 'クラウド LB'],
            ['静的', 'DC の Web', 'クラウドの Web'],
            ['動的', 'Web 経由で AP', 'LB から AP'],
            ['ブラウザ側', 'HTTP/1.1', 'HTTP/2'],
          ],
        },
      },
      {
        title: '① DNS の2つの役割',
        focus: 'dns',
        pkt: 'ip',
        label: 'DNS',
        desc: `<p>クラウドへ移した Web サーバも、名前解決は引き続き DC の DNS を使う。問合せは専用線を通る。</p>
          <p>この DNS は1台で2役。自社ドメインについて外部に答えるのは<b>権威 DNS サーバ</b>、社内サーバの代わりに外の名前を調べるのは<b>キャッシュ DNS サーバ</b>。</p>`,
        phases: [[['web', 'vrt']], [['vrt', 'l3']], [['l3', 'fw']], [['fw', 'dns']]],
        frame: [
          ['IPv4ヘッダ', [
            ['送信元IP', '10.40.5.21', 'クラウドの Web サーバ'],
            ['宛先IP', '192.168.70.53', 'DC の DNS'],
          ]],
          ['UDP', [['宛先ポート', '53', 'DNS']]],
        ],
        side: {
          title: 'DNS の役割',
          head: ['誰からの問合せか', '役割'],
          rows: [
            ['外部から：自社ドメイン', '権威'],
            ['社内から：外の名前', 'キャッシュ'],
          ],
        },
      },
      {
        title: '② まず TCP をつなぐ',
        focus: 'browser',
        pkt: 'ctl',
        label: 'SYN',
        desc: `<p>ブラウザが LB へ TCP の3ウェイハンドシェイクを行う。宛先は 443 番で、これは HTTP/1.1 でも HTTP/2 でも同じ。</p>
          <p>つまり<b>ポート番号を見ても、この上で何を話すのかは分からない</b>。ここではまだ HTTP/2 かどうかは決まっていない。</p>`,
        phases: [
          [['browser', 'inet', { label: 'SYN' }]],
          [['inet', 'lb', { label: 'SYN' }]],
          [['lb', 'inet', { label: 'SYN/ACK' }]],
          [['inet', 'browser', { label: 'SYN/ACK' }]],
          [['browser', 'inet', { label: 'ACK' }]],
          [['inet', 'lb', { label: 'ACK' }]],
        ],
        frame: [
          ['TCP', [
            ['宛先ポート', '443', 'どちらの HTTP でも同じ'],
            ['フラグ', 'SYN'],
          ]],
        ],
      },
      {
        title: '③ ClientHello で候補を伝える',
        focus: 'browser',
        pkt: 'ctl',
        label: 'ClientHello',
        desc: `<p>TLS の握手の最初で、ブラウザは <b>ALPN</b> という TLS の拡張を使い、<b>自分が使えるアプリケーション層プロトコルの一覧</b>を伝える。</p>
          <p>ALPN の目的は <b>TCP の上位で動かすプロトコルを、通信の開始時に決める</b>こと。暗号の方式を決める仕組みではない。ここを混同しないように書く。</p>`,
        phases: [[['browser', 'inet']], [['inet', 'lb']]],
        frame: [
          ['TLS ClientHello', [
            ['ALPN 拡張', 'h2, http/1.1', '使える候補の一覧'],
          ]],
        ],
        badges: { browser: '候補を提示' },
      },
      {
        title: '④ ServerHello で1つに決まる',
        focus: 'lb',
        pkt: 'ctl',
        label: 'ServerHello',
        desc: `<p>LB は候補から <b>h2</b> を選んで返す。これで、この TLS の上で HTTP/2 を話すことが決まる。交渉が載っているのは <b>ClientHello と ServerHello</b>。</p>
          <p>h2 には <b>TLS 1.2 以上</b>が必要。なお TLS 1.3 では、選んだ結果は ServerHello の直後の EncryptedExtensions で暗号化して返す。</p>`,
        phases: [[['lb', 'inet']], [['inet', 'browser']]],
        frame: [
          ['TLS ServerHello', [
            ['ALPN 拡張', 'h2', '選んだ1つ（TLS 1.2 の場合）'],
          ]],
        ],
        badges: { lb: 'h2 を選択', browser: 'h2 に決定' },
      },
      {
        title: '⑤ もし HTTP/1.1 のパイプラインなら',
        focus: 'lb',
        pkt: 'ip',
        desc: `<p>比較のために、HTTP/1.1 のパイプラインを見る。要求 A・B・C を続けて送ると、サーバは<b>要求を受けたのと同じ順序で応答を返さなければならない</b>。</p>
          <p>応答に「どの要求の答えか」を示す番号がないため。B が先に出来上がっても、時間のかかる A を待つことになる。</p>`,
        phases: [
          [['browser', 'inet', { label: '要求A' }]],
          [['browser', 'inet', { label: '要求B' }], ['inet', 'lb', { label: '要求A' }]],
          [['lb', 'inet', { label: '応答A' }]],
          [['lb', 'inet', { label: '応答B' }], ['inet', 'browser', { label: '応答A' }]],
        ],
        side: orderTable([
          ['A', '2番目（遅い）', '1番目'],
          ['B', '1番目（速い）', '2番目（A を待つ）'],
        ], '速い B も、遅い A の後ろに並ばされる'),
      },
      {
        title: '⑥ HTTP/2 はストリームで多重化',
        focus: 'browser',
        pkt: 'ip',
        desc: `<p>HTTP/2 では1本の TCP コネクションの中に<b>ストリーム</b>という仮想的な通信路を作る。クライアントが開始するものは奇数の ID（1, 3, 5…）。</p>
          <p>フレームに ID が付くので<b>応答の順序に制約がなく</b>、速いものから返せる。流量の調整もストリームごとに行う。</p>
          <p>ヘッダは HPACK で圧縮され、<b>:method</b>・:scheme・:path が必須の擬似ヘッダになる。</p>`,
        phases: [
          [['browser', 'inet', { label: 'ID 1' }]],
          [['browser', 'inet', { label: 'ID 3' }], ['inet', 'lb', { label: 'ID 1' }]],
          [['lb', 'inet', { label: '応答 ID 3' }]],
          [['lb', 'inet', { label: '応答 ID 1' }], ['inet', 'browser', { label: '応答 ID 3' }]],
        ],
        frame: [
          ['HTTP/2 HEADERS フレーム', [
            ['ストリーム ID', '3', 'クライアント開始なので奇数'],
            [':method', 'GET'],
            [':scheme', 'https'],
            [':path', '/img/top.png'],
          ]],
        ],
        side: orderTable([
          ['ID 1', '2番目（遅い）', '2番目'],
          ['ID 3', '1番目（速い）', '1番目'],
        ], 'ID で対応が取れるので、順序を守らなくてよい'),
        badges: { browser: 'h2', lb: 'h2' },
      },
      {
        title: '⑦ LB を L4 モードにすると',
        focus: 'lb',
        pkt: 'ip',
        label: 'HTTP/2',
        desc: `<p>L4 モードの LB は TCP までしか見ず、中身をそのまま流す。すると URL で振り分けられず、<b>HTTP/2 を HTTP/1.1 へ直すこともできない</b>。</p>
          <p>背後のサーバは HTTP/1.1 で動かす方針なので、この構成では通信が成り立たない（図の✕はそれを表す）。</p>
          <p>だから答えは L7 で動くモード。理由は、LB で <b>HTTP/2 を HTTP/1.1 へ変換してから振り分ける</b>必要があるから。</p>`,
        phases: [[['browser', 'inet']], [['inet', 'lb']], [['lb', 'web', { drop: true }]]],
        badges: { lb: 'L4 モード', web: 'HTTP/1.1 のみ' },
      },
      {
        title: '⑧ L7 モード：静的コンテンツ',
        focus: 'lb',
        pkt: 'ip',
        desc: `<p>L7 モードの LB は TLS を終端して HTTP の中身を読む。<b>URL を見て振り分け先を決め</b>、HTTP/1.1 に変換して転送する。</p>
          <p>画像などの静的コンテンツは、クラウドの Web サーバのどれかへ送る。ブラウザから見れば相手は LB だけ。</p>`,
        phases: [
          [['browser', 'inet', { label: 'HTTP/2' }]],
          [['inet', 'lb', { label: 'HTTP/2' }]],
          [['lb', 'web', { label: 'HTTP/1.1' }]],
        ],
        frame: [
          ['ブラウザ → LB', [[':method', 'GET'], [':path', '/img/top.png'], ['形式', 'HTTP/2（バイナリ）']]],
          ['LB → Web サーバ', [['要求の行', 'GET /img/top.png HTTP/1.1'], ['形式', 'HTTP/1.1（テキスト）']]],
        ],
        links: { 'lb-web': 'hit' },
        badges: { lb: 'L7 モード', web: '静的' },
      },
      {
        title: '⑨ L7 モード：動的コンテンツ',
        focus: ['vrt', 'l3'],
        pkt: 'ip',
        desc: `<p>動的な画面は DC の AP サーバへ送るので、専用線を越える。両端の静的経路が必要になる。</p>
          <ul>
            <li>L3SW は<b>クラウドのセグメント宛て</b>を、<b>クラウドRTのアドレス</b>へ。</li>
            <li>クラウドRTは DC 内の複数のセグメントへ行くので、<b>デフォルト経路</b>を <b>L3SW のアドレス</b>へ。</li>
          </ul>
          <p>次の転送先に自分のアドレスを書く誤りに注意する。</p>`,
        phases: [
          [['browser', 'inet', { label: 'HTTP/2' }]],
          [['inet', 'lb', { label: 'HTTP/2' }]],
          [['lb', 'vrt', { label: 'HTTP/1.1' }]],
          [['vrt', 'l3', { label: 'HTTP/1.1' }]],
          [['l3', 'ap', { label: 'HTTP/1.1' }]],
        ],
        links: { 'lb-vrt': 'path', 'vrt-l3': 'path', 'l3-ap': 'path' },
        badges: { lb: 'L7 モード', ap: '動的' },
        side: routeTable([0, 1]),
      },
    ],
  });
})();
