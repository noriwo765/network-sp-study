// プロキシサーバ：プロキシ経由の HTTP / HTTPS（CONNECT）、名前解決は誰がするか【本書 Ch.18】
(() => {
  const PC = '192.168.1.10';
  const PX = '192.168.1.80';
  const GIP = '203.0.113.1';
  const WEB = '198.51.100.10';

  const http = (src, dst, dport, lines) => [
    ['IPv4ヘッダ', [['送信元IP', ...src], ['宛先IP', ...dst]]],
    ['TCPヘッダ', [['宛先ポート', ...dport]]],
    ['HTTP', lines],
  ];
  const policy = (hit) => ({
    title: 'FW のポリシー（内→外）',
    head: ['送信元', '宛先', 'サービス', '動作'],
    rows: [['プロキシ', '任意', 'HTTP / HTTPS', '許可'], ['プロキシ', 'DNS サーバ', 'DNS', '許可'], ['任意', '任意', '任意', '拒否']],
    hit,
  });

  SCENARIOS.push({
    id: 'proxy',
    chapter: 18,
    title: 'プロキシサーバ',
    subtitle: 'PC の代わりに Web へアクセスするプロキシ。パケットの宛先は誰になるか',
    viewBox: '0 0 810 275',
    nodes: {
      pc:  { x: 60,  y: 140, name: 'PC', kind: 'pc', lines: [PC] },
      px:  { x: 240, y: 55,  name: 'プロキシ', kind: 'sv', lines: [`${PX}:8080`], linesAbove: true },
      dns: { x: 240, y: 225, name: 'DNS', kind: 'sv', lines: ['社内DNS'] },
      fw:  { x: 430, y: 140, name: 'FW', kind: 'fw', lines: [`外: ${GIP}`] },
      net: { x: 600, y: 140, name: 'インターネット', kind: 'cloud' },
      web: { x: 760, y: 140, name: 'Web', kind: 'sv', lines: [WEB] },
    },
    links: [
      { a: 'pc', b: 'px' },
      { a: 'pc', b: 'fw' },
      { a: 'px', b: 'dns' },
      { a: 'px', b: 'fw' },
      { a: 'fw', b: 'net' },
      { a: 'net', b: 'web' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>社内の PC は、ブラウザに<b>プロキシサーバ（${PX}:8080）</b>を設定して Web にアクセスする（フォワードプロキシ）。</p>
          <p>プロキシを置く目的：</p>
          <ul>
            <li><b>URL フィルタリング</b>（業務に不要なサイトを禁止）、<b>ログ</b>の記録</li>
            <li><b>キャッシュ</b>による応答の高速化・回線の節約</li>
            <li>PC を直接インターネットに出さない（<b>FW で外向きを許可するのはプロキシだけ</b>にできる）</li>
          </ul>`,
        side: policy(),
      },
      {
        title: '① PC → プロキシ',
        focus: 'pc', pkt: 'ip', label: 'GET', noCompare: true,
        desc: `<p>PC は Web サーバではなく<b>プロキシに TCP 接続</b>し、HTTP リクエストを送る。宛先 IP はプロキシ、宛先ポートは 8080。</p>
          <p>リクエスト行には<b>URL 全体（絶対 URI）</b>を書く。プロキシはこれを見て、どこに取りに行けばよいかを知る。</p>
          <p>重要：<b>PC は www.example.jp の名前解決をしない</b>。名前解決するのはプロキシ。PC に必要なのはプロキシのアドレスだけ。</p>`,
        phases: [[['pc', 'px']]],
        frame: http([PC, 'PC'], [PX, 'プロキシ'], ['8080', 'プロキシ'], [
          ['リクエスト行', 'GET http://www.example.jp/index.html HTTP/1.1', '絶対 URI'],
          ['Host', 'www.example.jp'],
        ]),
      },
      {
        title: '② プロキシ → Web',
        focus: 'px', pkt: 'ip', label: 'GET', noCompare: true,
        desc: `<p>プロキシは www.example.jp を<b>DNS で名前解決</b>し、Web サーバに<b>自分から新しい TCP 接続</b>を張ってリクエストを送る。PC とプロキシ、プロキシと Web の<b>2本の TCP コネクション</b>に分かれる。</p>
          <p>FW で NAPT されるので、Web サーバから見える送信元は FW のグローバルアドレス。Web サーバは PC の存在を知らない。</p>`,
        phases: [
          [['px', 'dns', { label: 'DNS', kind: 'ctl' }]], [['dns', 'px', { label: 'DNS', kind: 'ctl' }]],
          [['px', 'fw']], [['fw', 'net']], [['net', 'web']],
        ],
        frame: http([GIP, 'FW（NAPT 後）'], [WEB, 'Web'], ['80', 'HTTP'], [
          ['リクエスト行', 'GET /index.html HTTP/1.1', '通常の形式に戻す'],
          ['Host', 'www.example.jp'],
          ['Via', '1.1 proxy', 'プロキシを経由した印（付けない設定も可）'],
        ]),
        side: policy(0),
      },
      {
        title: '③ 応答とキャッシュ',
        focus: 'px', pkt: 'ip', label: '200 OK', noCompare: true,
        desc: `<p>Web サーバの応答はプロキシに返り、プロキシが PC に渡す。キャッシュしてよい内容なら保存しておき、別の PC が同じ URL を要求したときは<b>Web サーバに行かずに返す</b>。</p>`,
        phases: [[['web', 'net']], [['net', 'fw']], [['fw', 'px']], [['px', 'pc']]],
        side: {
          title: 'プロキシのキャッシュ',
          head: ['URL', '有効期限'],
          rows: [['http://www.example.jp/index.html', 'Cache-Control: max-age=600']],
          hit: 0,
        },
      },
      {
        title: '④ HTTPS は CONNECT',
        focus: 'px', pkt: 'esp', noCompare: true,
        desc: `<p>HTTPS の場合、PC はまずプロキシに <b>CONNECT メソッド</b>で「www.example.jp の 443 番につないで」と頼む。プロキシは Web サーバと TCP 接続し、<b>200 Connection established</b> を返す。</p>
          <p>その後 PC は、プロキシを<b>トンネル</b>として Web サーバと直接 TLS で通信する。プロキシは暗号化された中身を<b>見られない</b>（分かるのは接続先のホスト名だけ）。中身まで検査したい場合は、プロキシで復号する <b>SSL/TLS インスペクション</b>が必要。</p>`,
        phases: [
          [['pc', 'px', { label: 'CONNECT', kind: 'ip' }]],
          [['px', 'fw', { label: 'TCP 443', kind: 'ip' }]], [['fw', 'net', { label: 'TCP 443', kind: 'ip' }]], [['net', 'web', { label: 'TCP 443', kind: 'ip' }]],
          [['px', 'pc', { label: '200 established', kind: 'ip' }]],
          [['pc', 'px', { label: 'TLS' }]], [['px', 'fw', { label: 'TLS' }]], [['fw', 'net', { label: 'TLS' }]], [['net', 'web', { label: 'TLS' }]],
        ],
        frame: http([PC, 'PC'], [PX, 'プロキシ'], ['8080', 'プロキシ'], [
          ['リクエスト行', 'CONNECT www.example.jp:443 HTTP/1.1'],
          ['以降', 'TLS で暗号化（プロキシは中継するだけ）'],
        ]),
      },
      {
        title: '⑤ プロキシを通らない通信',
        focus: 'fw', pkt: 'ip', label: 'HTTP', noCompare: true,
        desc: `<p>プロキシ設定をしていない PC（やマルウェア）が直接 Web サーバに接続しようとしても、FW のポリシーで<b>拒否</b>される。外に出られるのはプロキシだけ。</p>
          <p>多数の PC にプロキシを設定するには、<b>PAC ファイル</b>（URL ごとにプロキシを使うか決めるスクリプト）や、それを自動で見つける <b>WPAD</b> を使う。</p>`,
        phases: [[['pc', 'fw', { drop: true }]]],
        frame: http([PC, 'PC'], [WEB, 'Web'], ['80', 'HTTP'], [['リクエスト行', 'GET /index.html HTTP/1.1']]),
        side: policy(2),
      },
      {
        title: 'まとめ',
        desc: `<p>プロキシで利用者認証をすることもある。認証が必要なとき、プロキシは <b>407 Proxy Authentication Required</b> を返す（Web サーバの認証は 401）。</p>`,
        side: {
          title: 'フォワードプロキシとリバースプロキシ',
          head: ['', 'フォワードプロキシ', 'リバースプロキシ'],
          rows: [
            ['置き場所', '利用者側（社内）', 'サーバ側（DMZ など）'],
            ['誰の代理', 'クライアント', 'Web サーバ'],
            ['主な目的', 'フィルタリング・ログ・キャッシュ', '負荷分散・SSL 終端・サーバの隠蔽・キャッシュ'],
          ],
        },
      },
    ],
  });
})();
