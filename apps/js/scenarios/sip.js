// VoIP：SIP による呼制御と RTP による音声転送、必要帯域の計算【本書 Ch.10】
(() => {
  const A = '192.168.1.21';
  const B = '192.168.2.22';
  const SIPSV = '192.168.0.5';

  const sip = (src, dst, line, extra = []) => [
    ['IPv4ヘッダ', [['送信元IP', ...src], ['宛先IP', ...dst]]],
    ['UDPヘッダ', [['宛先ポート', '5060', 'SIP']]],
    ['SIP', [['開始行', line], ...extra]],
  ];
  const callState = (a, b, hit) => ({ title: '電話機の状態', head: ['電話機', '状態'], rows: [['A（内線1001）', a], ['B（内線1002）', b]], hit });

  SCENARIOS.push({
    id: 'sip',
    chapter: 10,
    title: 'VoIP（SIP/RTP）',
    subtitle: '内線電話がつながるまでの SIP のやり取りと、音声を運ぶ RTP。必要な帯域はどれくらいか',
    viewBox: '0 0 810 275',
    nodes: {
      a:   { x: 90,  y: 185, name: 'IP電話A', kind: 'pc', lines: ['内線1001', A] },
      sv:  { x: 405, y: 55,  name: 'SIPサーバ', kind: 'sv', lines: [SIPSV], linesAbove: true },
      net: { x: 405, y: 185, name: '社内網', kind: 'cloud' },
      b:   { x: 720, y: 185, name: 'IP電話B', kind: 'pc', lines: ['内線1002', B] },
    },
    links: [
      { a: 'a', b: 'net' },
      { a: 'net', b: 'b' },
      { a: 'net', b: 'sv' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>IP 電話は、役割の違う2つのプロトコルを使う。</p>
          <ul>
            <li><b>SIP</b>（呼制御）：電話をかける・呼び出す・応答する・切る。SIP サーバを経由する</li>
            <li><b>RTP</b>（音声転送）：会話の音声データそのもの。<b>電話機同士が直接</b>やり取りする</li>
          </ul>
          <p>SIP は HTTP に似たテキスト形式のプロトコルで、通常 <b>UDP 5060番</b>を使う。</p>`,
      },
      {
        title: '① REGISTER',
        focus: ['a', 'b'], pkt: 'ctl', label: 'REGISTER', noCompare: true,
        desc: `<p>電話機は起動すると SIP サーバ（<b>レジストラ</b>）に「内線1001 は今 ${A} にいます」と登録する。SIP サーバは<b>内線番号（SIP URI）と IP アドレスの対応</b>を覚える。</p>`,
        phases: [
          [['a', 'net'], ['b', 'net']],
          [['net', 'sv'], ['net', 'sv']],
          [['sv', 'net', { label: '200 OK' }]],
          [['net', 'a', { label: '200 OK' }], ['net', 'b', { label: '200 OK' }]],
        ],
        frame: sip([A, '電話機A'], [SIPSV, 'SIP サーバ'], 'REGISTER sip:example.jp SIP/2.0', [['Contact', `<sip:1001@${A}>`]]),
        side: {
          title: 'SIP サーバの登録情報',
          head: ['SIP URI', 'IP アドレス'],
          rows: [['sip:1001@example.jp', A], ['sip:1002@example.jp', B]],
          hit: [0, 1],
        },
      },
      {
        title: '② INVITE',
        focus: 'a', pkt: 'ctl', label: 'INVITE', noCompare: true,
        desc: `<p>A が内線1002 に発信する。INVITE は SIP サーバ（<b>プロキシ</b>）に送られ、SIP サーバは登録情報を見て B に転送する。</p>
          <p>本文の <b>SDP</b> に「音声は <b>${A} の UDP 10000番</b>で、コーデック <b>G.711</b> で受けたい」と書く。</p>`,
        phases: [[['a', 'net']], [['net', 'sv']], [['sv', 'net']], [['net', 'b']]],
        frame: sip([A, '電話機A'], [SIPSV, 'SIP サーバ'], 'INVITE sip:1002@example.jp SIP/2.0', [
          ['SDP（c=）', A, '音声の受信アドレス'],
          ['SDP（m=）', 'audio 10000 RTP/AVP 0', 'UDP 10000番、ペイロードタイプ0 = G.711 μ-law'],
        ]),
        side: callState('発信中', '-'),
      },
      {
        title: '③ 呼び出し',
        focus: 'b', pkt: 'ctl', label: '180 Ringing', noCompare: true,
        desc: `<p>B の電話機が鳴り始め、<b>180 Ringing</b> を返す。A は呼び出し音（リングバックトーン）を鳴らす。</p>
          <p>SIP の応答は HTTP と同じく<b>3桁のステータスコード</b>：1xx = 処理中、2xx = 成功、4xx = クライアントエラー（486 Busy Here など）。</p>`,
        phases: [[['b', 'net']], [['net', 'sv']], [['sv', 'net']], [['net', 'a']]],
        frame: sip([B, '電話機B'], [SIPSV, 'SIP サーバ'], 'SIP/2.0 180 Ringing'),
        side: callState('呼び出し音', '着信（鳴動中）'),
      },
      {
        title: '④ 応答・ACK',
        focus: 'b', pkt: 'ctl', noCompare: true,
        desc: `<p>B が受話器を取ると <b>200 OK</b> を返す。SDP には「B は <b>${B} の UDP 20000番</b>で受ける」と書かれている。</p>
          <p>A が <b>ACK</b> を返して通話が確立する。これで両者は<b>相手の IP アドレスとポート番号</b>を知った。</p>`,
        phases: [
          [['b', 'net', { label: '200 OK' }]], [['net', 'sv', { label: '200 OK' }]], [['sv', 'net', { label: '200 OK' }]], [['net', 'a', { label: '200 OK' }]],
          [['a', 'net', { label: 'ACK' }]], [['net', 'sv', { label: 'ACK' }]], [['sv', 'net', { label: 'ACK' }]], [['net', 'b', { label: 'ACK' }]],
        ],
        frame: sip([B, '電話機B'], [SIPSV, 'SIP サーバ'], 'SIP/2.0 200 OK', [
          ['SDP（c=）', B],
          ['SDP（m=）', 'audio 20000 RTP/AVP 0'],
        ]),
        side: callState('通話中', '通話中', [0, 1]),
      },
      {
        title: '⑤ RTP で音声',
        focus: ['a', 'b'], pkt: 'esp', noCompare: true,
        desc: `<p>音声は SIP サーバを通らず、<b>電話機同士が直接</b> RTP で送り合う。20ミリ秒ごとに音声を区切って1パケットにする。</p>
          <p><b>必要帯域の計算</b>（G.711：64 kbit/s、20ms ごと）：</p>
          <ul>
            <li>音声データ = 64,000 × 0.02 ÷ 8 = <b>160 バイト</b></li>
            <li>＋ RTP 12 ＋ UDP 8 ＋ IP 20 = <b>200 バイト</b>（IP パケット）</li>
            <li>1秒に 50 パケット → 200 × 8 × 50 = <b>80 kbit/s</b>（片方向）</li>
            <li>Ethernet（ヘッダ14 ＋ FCS4）も含めると 218 × 8 × 50 = <b>87.2 kbit/s</b></li>
          </ul>`,
        phases: [[['a', 'net', { label: 'RTP' }], ['b', 'net', { label: 'RTP' }]], [['net', 'b', { label: 'RTP' }], ['net', 'a', { label: 'RTP' }]]],
        links: { 'a-net': 'path', 'net-b': 'path' },
        frame: [
          ['IPv4ヘッダ', [['送信元IP', A], ['宛先IP', B], ['DSCP', '46', 'EF（音声を最優先）']]],
          ['UDPヘッダ', [['送信元ポート', '10000'], ['宛先ポート', '20000', 'SDP で通知された番号']]],
          ['RTPヘッダ（12バイト）', [
            ['ペイロードタイプ', '0', 'G.711 μ-law'],
            ['シーケンス番号', '1234', '欠落・順序の検出'],
            ['タイムスタンプ', '160 ずつ増加', '再生タイミングの調整（ジッタ吸収）'],
          ]],
          ['音声データ', [['長さ', '160 バイト', '20ms 分']]],
        ],
        side: callState('通話中', '通話中'),
      },
      {
        title: '⑥ BYE',
        focus: 'a', pkt: 'ctl', label: 'BYE', noCompare: true,
        desc: `<p>A が受話器を置くと <b>BYE</b> を送り、B が 200 OK を返して通話が終わる。RTP の送信も止まる。</p>`,
        phases: [[['a', 'net']], [['net', 'sv']], [['sv', 'net']], [['net', 'b']], [['b', 'net', { label: '200 OK' }]], [['net', 'a', { label: '200 OK' }]]],
        frame: sip([A, '電話機A'], [SIPSV, 'SIP サーバ'], 'BYE sip:1002@example.jp SIP/2.0'),
        side: callState('待機', '待機'),
      },
      {
        title: 'まとめ',
        desc: `<p>午後で問われるポイント：</p>
          <ul>
            <li>音声品質は<b>遅延・ジッタ（揺らぎ）・パケットロス</b>に弱い → QoS（DSCP EF による優先制御）で守る</li>
            <li>SDP に IP アドレスが書かれているので、<b>NAPT を越えると音声が届かない</b> → SIP-ALG や SBC（セッションボーダコントローラ）が必要</li>
            <li>同時通話数 × 1通話の帯域 で回線容量を見積もる</li>
          </ul>`,
        side: {
          title: '主な SIP メソッド',
          head: ['メソッド', '用途'],
          rows: [
            ['REGISTER', '電話機の位置（IP アドレス）を登録'],
            ['INVITE', '通話の開始（SDP で音声の条件を提示）'],
            ['ACK', '200 OK の受信を確認'],
            ['BYE', '通話の終了'],
            ['CANCEL', '応答前の発信を取り消す'],
          ],
        },
      },
    ],
  });
})();
