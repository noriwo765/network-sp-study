// TCP：3ウェイハンドシェイク、シーケンス番号と確認応答、再送、コネクション終了【ジャンル3】
(() => {
  function seg(dir, seq, ack, flags, len, opt) {
    const c2s = dir === 'c2s';
    return [['TCPヘッダ', [
      ['送信元ポート', c2s ? '50000' : '80'],
      ['宛先ポート', c2s ? '80' : '50000'],
      ['シーケンス番号', String(seq)],
      ['確認応答番号', String(ack)],
      ['フラグ', flags],
      ['ウィンドウサイズ', '65535'],
      ['データ長（参考）', `${len} バイト`],
      ...(opt ? [['オプション', opt]] : []),
    ]]];
  }
  const state = (pc, sv, hit) => ({ title: 'コネクションの状態', head: ['端末', '状態'], rows: [['PC', pc], ['Server', sv]], hit });
  const C2S = [['pc', 'net']], C2S2 = [['net', 'sv']];
  const S2C = [['sv', 'net']], S2C2 = [['net', 'pc']];
  const via = (from, to, label, extra = {}) => [[[from, 'net', { label, ...extra }]], [['net', to, { label, ...extra }]]];

  SCENARIOS.push({
    id: 'tcp',
    chapter: 6,
    title: 'TCP',
    subtitle: 'シーケンス番号と確認応答番号の動き、再送、コネクションの開始と終了',
    nodes: {
      pc:  { x: 110, y: 125, name: 'PC', kind: 'pc', lines: ['192.168.1.10:50000'] },
      net: { x: 405, y: 125, name: 'ネットワーク', kind: 'cloud' },
      sv:  { x: 700, y: 125, name: 'Server', kind: 'sv', lines: ['172.16.0.10:80'] },
    },
    links: [{ a: 'pc', b: 'net' }, { a: 'net', b: 'sv' }],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>TCP は<b>コネクション型</b>で、データを確実に順番どおり届ける。その仕組みの中心が<b>シーケンス番号</b>と<b>確認応答番号</b>。</p>
          <ul>
            <li>シーケンス番号：送るデータの先頭が、全体の何バイト目か</li>
            <li>確認応答番号：<b>次に受け取りたい</b>バイト番号（＝ここまでは受け取った）</li>
          </ul>
          <p>右のフレームは方向ごとに前回と比べて「変化」を表示する。番号の増え方を追いかけよう。</p>`,
      },
      {
        title: '① SYN',
        focus: 'pc', pkt: 'ip', label: 'SYN', frameGroup: 'c2s',
        desc: `<p>PC が接続を要求する。初期シーケンス番号（ISN）は推測されないようランダムに決める（ここでは 1000）。</p>
          <p>オプションで <b>MSS</b>（受け取れる最大セグメント長）を相手に伝える。Ethernet なら 1500 − 20 − 20 = 1460。</p>`,
        phases: [C2S, C2S2],
        frame: seg('c2s', 1000, 0, 'SYN', 0, 'MSS=1460'),
        side: state('SYN_SENT', 'LISTEN → SYN_RCVD', 0),
      },
      {
        title: '② SYN+ACK',
        focus: 'sv', pkt: 'ip', label: 'SYN+ACK', frameGroup: 's2c',
        desc: `<p>Server は自分の ISN（5000）を決め、PC の SYN に応答する。</p>
          <p>確認応答番号は <b>1001</b>。SYN はデータを持たないが、<b>シーケンス番号を1つ消費する</b>決まりなので 1000 + 1。</p>`,
        phases: [S2C, S2C2],
        frame: seg('s2c', 5000, 1001, 'SYN, ACK', 0, 'MSS=1460'),
        side: state('SYN_SENT → ESTABLISHED', 'SYN_RCVD', 0),
      },
      {
        title: '③ ACK',
        focus: 'pc', pkt: 'ip', label: 'ACK', frameGroup: 'c2s',
        desc: `<p>PC が ACK を返し、<b>3ウェイハンドシェイク</b>が完了。両方向のシーケンス番号の初期値をお互いが確認できた。</p>`,
        phases: [C2S, C2S2],
        frame: seg('c2s', 1001, 5001, 'ACK', 0),
        side: state('ESTABLISHED', 'ESTABLISHED', [0, 1]),
      },
      {
        title: '④ リクエスト送信',
        focus: 'pc', pkt: 'ip', label: 'GET 500B', frameGroup: 'c2s',
        desc: `<p>PC が HTTP リクエスト（500 バイト）を送る。シーケンス番号 1001 から 1500 バイト目までのデータ。</p>
          <p>次に PC が送るデータのシーケンス番号は <b>1501</b> になる。</p>`,
        phases: [C2S, C2S2],
        frame: seg('c2s', 1001, 5001, 'PSH, ACK', 500),
        side: state('ESTABLISHED', 'ESTABLISHED'),
      },
      {
        title: '⑤ 連続送信',
        focus: 'sv', pkt: 'ip', frameGroup: 's2c',
        desc: `<p>Server は応答データを MSS（1460 バイト）ごとに分けて送る。<b>ウィンドウサイズ</b>の範囲内なら、ACK を待たずに<b>連続して送れる</b>（ウィンドウ制御）。</p>
          <p>確認応答番号 1501 で「リクエストの 500 バイトを受け取った」ことも同時に伝えている。右は2つ目のセグメント。</p>`,
        phases: [
          [['sv', 'net', { label: 'Seq 5001' }]],
          [['net', 'pc', { label: 'Seq 5001' }], ['sv', 'net', { label: 'Seq 6461' }]],
          [['net', 'pc', { label: 'Seq 6461' }]],
        ],
        frame: seg('s2c', 6461, 1501, 'ACK', 1460),
        side: {
          title: 'Server が送ったセグメント',
          head: ['シーケンス番号', '範囲', '長さ'],
          rows: [['5001', '5001〜6460', '1460'], ['6461', '6461〜7920', '1460']],
          hit: 1,
        },
      },
      {
        title: '⑥ 累積ACK',
        focus: 'pc', pkt: 'ip', label: 'ACK 7921', frameGroup: 'c2s',
        desc: `<p>PC は2つ分をまとめて確認応答する（<b>累積確認応答</b>）。確認応答番号 <b>7921</b> ＝「7920 バイト目まで受け取った、次は 7921 から」。</p>
          <p>受信側は ACK をすぐ返さず、少し待ってまとめて返すこともある（遅延 ACK）。</p>`,
        phases: [C2S, C2S2],
        frame: seg('c2s', 1501, 7921, 'ACK', 0),
      },
      {
        title: '⑦ パケットロス',
        focus: 'net', pkt: 'ip', frameGroup: 's2c',
        desc: `<p>Server は続きを送るが、<b>Seq 7921 のセグメントが途中で失われた</b>。後続の Seq 9381 は届く。</p>
          <p>PC は 7921 からのデータを受け取っていないので、Seq 9381 を受け取っても確認応答番号は <b>7921 のまま</b>。</p>`,
        phases: [
          [['sv', 'net', { label: 'Seq 7921', drop: true }]],
          [['sv', 'net', { label: 'Seq 9381' }]],
          [['net', 'pc', { label: 'Seq 9381' }]],
        ],
        frame: seg('s2c', 7921, 1501, 'ACK', 1460),
      },
      {
        title: '⑧ 重複ACK と高速再送',
        focus: 'sv', pkt: 'ip', frameGroup: 's2c',
        desc: `<p>PC は後続セグメントを受け取るたびに<b>同じ確認応答番号 7921 の ACK</b>（重複 ACK）を返す。</p>
          <p>Server は<b>重複 ACK を3回</b>受け取った時点で、タイムアウトを待たずに 7921 を再送する（<b>高速再送</b>）。ACK が全く返らない場合は再送タイマ（RTO）切れで再送する。</p>
          <p>ロスは混雑のサインなので、送信側は<b>輻輳ウィンドウを縮めて</b>送信ペースを落とす（輻輳制御）。</p>`,
        phases: [
          ...via('pc', 'sv', '重複ACK×3'),
          ...via('sv', 'pc', 'Seq 7921 再送'),
        ],
        frame: seg('s2c', 7921, 1501, 'ACK', 1460),
        side: {
          title: 'PC の受信状況',
          head: ['範囲', '状態'],
          rows: [['5001〜7920', '受信済み'], ['7921〜9380', '欠落 → 再送で受信'], ['9381〜10840', '受信済み（バッファで待機）']],
          hit: 1,
        },
      },
      {
        title: '⑨ コネクション終了',
        focus: 'pc', pkt: 'ip', frameGroup: 'c2s',
        desc: `<p>通信が終わったら <b>FIN</b> で終了する。片方向ずつ閉じるので、FIN と ACK が2往復（4回）やり取りされる。</p>
          <p>最後に ACK を送った PC は <b>TIME_WAIT</b> 状態でしばらく待つ（遅れて届くパケットに備える）。</p>
          <p>右は PC の最初の FIN。確認応答番号 10841 は、Server のデータを最後まで受け取ったことを示す。</p>`,
        phases: [
          ...via('pc', 'sv', 'FIN'),
          ...via('sv', 'pc', 'ACK'),
          ...via('sv', 'pc', 'FIN'),
          ...via('pc', 'sv', 'ACK'),
        ],
        frame: seg('c2s', 1501, 10841, 'FIN, ACK', 0),
        side: state('FIN_WAIT_1 → FIN_WAIT_2 → TIME_WAIT', 'CLOSE_WAIT → LAST_ACK → CLOSED'),
      },
      {
        title: 'まとめ',
        desc: `<p>番号の計算ルール：</p>
          <ul>
            <li>次のシーケンス番号 = 今のシーケンス番号 + データ長</li>
            <li>SYN と FIN はデータがなくても<b>1つ消費</b>する</li>
            <li>確認応答番号 = 受け取った最後のバイト + 1</li>
          </ul>
          <p>UDP にはこれらの仕組みが一切なく、その分軽い（DNS、音声・動画のストリーミングなど）。</p>`,
        side: {
          title: '主な制御',
          head: ['仕組み', '目的'],
          rows: [
            ['3ウェイハンドシェイク', 'コネクション確立・ISN と MSS の交換'],
            ['ウィンドウ制御', '受信側が処理できる量まで、ACK を待たずに連続送信'],
            ['再送制御', 'タイムアウト（RTO）または重複 ACK×3 で再送'],
            ['輻輳制御', 'スロースタート・輻輳回避でネットワークの混雑に合わせて送信量を調整'],
          ],
        },
      },
    ],
  });
})();
