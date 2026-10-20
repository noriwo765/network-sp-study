// 3ウェイハンドシェイク：SYN / SYN+ACK / ACK / データ送信で、IP・TCP ヘッダのどこが変わるか【本書 Ch.6】
(() => {
  const C = '198.51.100.10';
  const S = '203.0.113.80';

  const ip = (src, dst, len, id) => ({
    title: 'IPv4ヘッダ',
    kind: 'ipv4',
    values: {
      len: String(len),
      id: `0x${id.toString(16).padStart(4, '0')}`,
      flags: 'DF',
      ttl: '64',
      proto: '6 (TCP)',
      sum: ipChecksum({ src, dst, ttl: 64, len, id }),
      src,
      dst,
    },
  });
  const tcp = values => ({ title: 'TCPヘッダ', kind: 'tcp', values });
  const state = (c, s, hit) => ({ title: 'コネクションの状態', head: ['', '状態'], rows: [['クライアント', c], ['サーバ', s]], hit });
  const via = (from, to, label) => [[[from, 'net', { label }]], [['net', to, { label }]]];

  SCENARIOS.push({
    id: 'handshake',
    chapter: 6,
    title: '3ウェイハンドシェイク',
    subtitle: 'SYN → SYN+ACK → ACK → データ送信で、TCP ヘッダのどのフィールドがどう変わるか',
    nodes: {
      cl:  { x: 110, y: 125, name: 'クライアント', kind: 'pc', lines: [`${C}:50000`] },
      net: { x: 405, y: 125, name: 'インターネット', kind: 'cloud' },
      sv:  { x: 700, y: 125, name: 'Web', kind: 'sv', lines: [`${S}:443`] },
    },
    links: [{ a: 'cl', b: 'net' }, { a: 'net', b: 'sv' }],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>クライアントが Web サーバ（HTTPS）に TCP で接続する。右の<b>ヘッダ図</b>は RFC と同じ 32 ビット幅のレイアウトで、<b>前のパケットから変わったフィールドが順に点滅</b>し、黄色で残る（赤字が前の値）。</p>
          <p>注目するフィールド：</p>
          <ul>
            <li><b>ポート番号</b>：方向によって送信元と宛先が入れ替わる</li>
            <li><b>シーケンス番号・確認応答番号</b>：どう増えるか</li>
            <li><b>フラグ</b>：SYN・ACK・PSH のビットの立ち方（図の C E U A P R S F の点灯）</li>
            <li><b>Off（データオフセット）とオプション</b>：オプションがあるのは SYN のときだけ</li>
          </ul>
          <p>図の右下の「予想モード」で値を隠し、予想してから開くのがおすすめ。チェックサムの値は例。</p>`,
      },
      {
        title: '① SYN',
        focus: 'cl', pkt: 'ip', label: 'SYN', frameGroup: 'hs',
        desc: `<p>クライアントが接続を申し込む。</p>
          <ul>
            <li><b>シーケンス番号</b>：初期シーケンス番号（ISN）。推測されないよう毎回ランダムに決める（ここでは 1000）</li>
            <li><b>確認応答番号</b>：まだ相手から何も受け取っていないので 0（ACK フラグも立っていないので無効）</li>
            <li><b>フラグ</b>：SYN だけ</li>
            <li><b>オプション</b>：MSS（受け取れる最大セグメント長）、SACK 許可、ウィンドウスケール（WS）。<b>SYN のときしか送れない</b>ものが多い</li>
            <li><b>Off = 8</b>：TCP ヘッダ長は 8 × 4 = 32 バイト（基本 20 ＋ オプション 12）。だから IP の全長は 20 ＋ 32 = 52</li>
          </ul>`,
        phases: via('cl', 'sv', 'SYN'),
        diagram: [
          ip(C, S, 52, 0x5a01),
          tcp({ sport: '50000', dport: '443', seq: '1000', ack: '0', off: '8', flags: 'SYN', win: '64240', sum: '0x3c1e', opts: 'MSS=1460, SACK許可, WS=7' }),
        ],
        side: state('SYN_SENT', 'LISTEN', 0),
      },
      {
        title: '② SYN+ACK',
        focus: 'sv', pkt: 'ip', label: 'SYN+ACK', frameGroup: 'hs',
        desc: `<p>サーバが応じる。①と比べて変わった所：</p>
          <ul>
            <li><b>IP アドレスとポート番号</b>：送信元と宛先が<b>入れ替わる</b></li>
            <li><b>シーケンス番号</b>：サーバ自身の ISN（7000）。クライアントとは無関係に決める</li>
            <li><b>確認応答番号 = 1001</b>：SYN はデータを持たないが<b>シーケンス番号を1つ消費する</b>ので 1000 + 1</li>
            <li><b>フラグ</b>：SYN に加えて <b>ACK</b> が立つ（以降、最後まで ACK は立ちっぱなし）</li>
            <li><b>オプション</b>：サーバ側の MSS と WS を伝える</li>
          </ul>`,
        phases: via('sv', 'cl', 'SYN+ACK'),
        diagram: [
          ip(S, C, 52, 0x0000),
          tcp({ sport: '443', dport: '50000', seq: '7000', ack: '1001', off: '8', flags: 'ACK SYN', win: '65160', sum: '0x9a42', opts: 'MSS=1460, SACK許可, WS=8' }),
        ],
        side: state('SYN_SENT', 'SYN_RCVD', 1),
      },
      {
        title: '③ ACK',
        focus: 'cl', pkt: 'ip', label: 'ACK', frameGroup: 'hs',
        desc: `<p>クライアントが確認応答して、接続が確立する。②と比べて：</p>
          <ul>
            <li><b>シーケンス番号 = 1001</b>：自分の SYN で1つ進んだ</li>
            <li><b>確認応答番号 = 7001</b>：サーバの SYN（7000）を受け取ったので + 1</li>
            <li><b>フラグ</b>：SYN が消えて <b>ACK だけ</b></li>
            <li><b>オプションなし → Off = 5</b>（20 バイト）、IP の全長も 40 に減る</li>
            <li><b>ウィンドウ = 502</b>：ここから<b>ウィンドウスケールが効く</b>。クライアントは WS=7 を宣言したので、実際の値は 502 × 2<sup>7</sup> = 64,256 バイト（SYN のウィンドウには適用されない）</li>
          </ul>`,
        phases: via('cl', 'sv', 'ACK'),
        diagram: [
          ip(C, S, 40, 0x5a02),
          tcp({ sport: '50000', dport: '443', seq: '1001', ack: '7001', off: '5', flags: 'ACK', win: '502', sum: '0x5b10' }),
        ],
        side: state('ESTABLISHED', 'SYN_RCVD → ESTABLISHED', [0, 1]),
      },
      {
        title: '④ データ送信',
        focus: 'cl', pkt: 'ip', label: 'ClientHello', frameGroup: 'hs',
        desc: `<p>クライアントが最初のデータ（TLS の ClientHello、517 バイト）を送る。③と比べて：</p>
          <ul>
            <li><b>シーケンス番号は 1001 のまま</b>：③の ACK はデータを持たないので番号を消費しない。データの1バイト目が 1001</li>
            <li><b>確認応答番号も 7001 のまま</b>：サーバからまだ何も受け取っていない</li>
            <li><b>フラグ</b>：<b>PSH</b> が立つ（受け取ったらすぐアプリケーションに渡してほしい）</li>
            <li><b>IP の全長</b>：40 ＋ 517 = 557</li>
            <li><b>識別子</b>：パケットごとに変わる。<b>チェックサム</b>も中身が変わるので変わる</li>
          </ul>`,
        phases: via('cl', 'sv', 'ClientHello'),
        diagram: [
          ip(C, S, 557, 0x5a03),
          tcp({ sport: '50000', dport: '443', seq: '1001', ack: '7001', off: '5', flags: 'ACK PSH', win: '502', sum: '0xd2e7' }),
        ],
        side: state('ESTABLISHED', 'ESTABLISHED'),
      },
      {
        title: '⑤ サーバの応答',
        focus: 'sv', pkt: 'ip', label: 'ServerHello', frameGroup: 'hs',
        desc: `<p>サーバが応答データ（1200 バイト）を送る。④と比べて：</p>
          <ul>
            <li><b>シーケンス番号 = 7001</b>：サーバのデータの1バイト目</li>
            <li><b>確認応答番号 = 1518</b>：ClientHello の 517 バイトを受け取ったので 1001 ＋ 517</li>
            <li><b>ウィンドウ = 501</b>：サーバは WS=8 なので 501 × 2<sup>8</sup> = 128,256 バイト</li>
          </ul>
          <p>以降はこの繰り返し：<b>次のシーケンス番号 = 今の番号 ＋ データ長</b>、<b>確認応答番号 = 相手から受け取った最後のバイト ＋ 1</b>。</p>`,
        phases: via('sv', 'cl', 'ServerHello'),
        diagram: [
          ip(S, C, 1240, 0x0001),
          tcp({ sport: '443', dport: '50000', seq: '7001', ack: '1518', off: '5', flags: 'ACK PSH', win: '501', sum: '0x1f88' }),
        ],
        side: state('ESTABLISHED', 'ESTABLISHED'),
      },
      {
        title: 'まとめ',
        desc: `<p>午後で問われやすいのは「SYN と FIN は番号を1つ消費する」「ACK だけのセグメントは消費しない」「オプション（MSS など）は SYN でやり取りする」の3点。</p>
          <p>FW のログやパケットキャプチャで <b>SYN だけが繰り返し送られている</b>なら、SYN+ACK が返ってきていない（経路・FW・サーバの問題）と判断できる。</p>`,
        side: {
          title: '各パケットの主な値',
          head: ['', '方向', 'Seq', 'Ack', 'フラグ', 'データ'],
          rows: [
            ['① SYN', 'C→S', '1000', '0', 'SYN', '0'],
            ['② SYN+ACK', 'S→C', '7000', '1001', 'SYN, ACK', '0'],
            ['③ ACK', 'C→S', '1001', '7001', 'ACK', '0'],
            ['④ データ', 'C→S', '1001', '7001', 'PSH, ACK', '517'],
            ['⑤ データ', 'S→C', '7001', '1518', 'PSH, ACK', '1200'],
          ],
        },
      },
    ],
  });
})();
