// 負荷分散装置：VIP への振り分け、宛先 NAT、セッション維持、ヘルスチェック【本書 Ch.14】
(() => {
  const VIP = '203.0.113.10';
  const C1 = '198.51.100.11';
  const C2 = '198.51.100.22';

  const frame = (src, dst) => [
    ['IPv4ヘッダ', [['送信元IP', ...src], ['宛先IP', ...dst]]],
    ['TCPヘッダ', [['宛先ポート', dst[0] === C1 || dst[0] === C2 ? '50000' : '443']]],
  ];
  const sessions = (rows, hit) => ({
    title: 'LB のセッションテーブル',
    head: ['クライアント', 'VIP', '振り分け先'],
    rows: rows.length ? rows : [['（なし）', '', '']],
    hit,
  });
  const S1 = [`${C1}:50000`, `${VIP}:443`, 'Web1'];
  const S2 = [`${C2}:50000`, `${VIP}:443`, 'Web2'];

  SCENARIOS.push({
    id: 'lb',
    chapter: 14,
    title: '負荷分散装置',
    subtitle: '1つの VIP で受けた通信を複数のサーバに振り分ける。戻りの経路とヘルスチェックが要',
    viewBox: '0 0 810 275',
    nodes: {
      c1:   { x: 60,  y: 60,  name: '客A', kind: 'pc', lines: [C1], linesAbove: true },
      c2:   { x: 60,  y: 210, name: '客B', kind: 'pc', lines: [C2] },
      net:  { x: 240, y: 135, name: 'インターネット', kind: 'cloud' },
      lb:   { x: 440, y: 135, name: 'LB', kind: 'sw', lines: [`VIP ${VIP}`, '内側 10.0.0.1'] },
      web1: { x: 680, y: 60,  name: 'Web1', kind: 'sv', lines: ['10.0.0.11'], linesAbove: true },
      web2: { x: 680, y: 210, name: 'Web2', kind: 'sv', lines: ['10.0.0.12'] },
    },
    links: [
      { a: 'c1', b: 'net' },
      { a: 'c2', b: 'net' },
      { a: 'net', b: 'lb' },
      { a: 'lb', b: 'web1' },
      { a: 'lb', b: 'web2' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p><b>負荷分散装置（LB、ロードバランサ）</b>は、利用者からは1台に見える<b>仮想 IP アドレス（VIP）</b>で通信を受け、背後の複数の Web サーバに振り分ける。</p>
          <ul>
            <li><b>負荷分散</b>：処理能力（スループット）を台数分に増やす</li>
            <li><b>冗長化</b>：1台が故障しても、残りのサーバでサービスを続ける</li>
          </ul>
          <p>Web サーバのデフォルトゲートウェイは LB（10.0.0.1）にしてある。</p>`,
      },
      {
        title: '① 客A → VIP',
        focus: 'c1', pkt: 'ip', frameGroup: 'c2s',
        desc: `<p>客A は www.example.jp（DNS で VIP ${VIP} に解決される）に接続する。</p>`,
        phases: [[['c1', 'net']], [['net', 'lb']]],
        frame: frame([C1, '客A'], [VIP, 'VIP']),
        side: sessions([]),
      },
      {
        title: '② LB が振り分け',
        focus: 'lb', pkt: 'ip', frameGroup: 'c2s',
        desc: `<p>LB は振り分け方式（ここでは<b>ラウンドロビン</b>）で Web1 を選び、<b>宛先 IP を VIP から Web1 のアドレスに書き換えて</b>転送する（宛先 NAT）。対応はセッションテーブルに記録する。</p>
          <p>送信元は客A のまま。だから Web1 のアクセスログには客A の本当のアドレスが残る。</p>`,
        phases: [[['lb', 'web1']]],
        frame: frame([C1, '客A'], ['10.0.0.11', 'Web1']),
        side: sessions([S1], 0),
      },
      {
        title: '③ 応答は LB 経由で',
        focus: 'web1', pkt: 'ip', frameGroup: 's2c',
        desc: `<p>Web1 は客A へ応答する。デフォルトゲートウェイが LB なので、応答は<b>必ず LB を通る</b>。LB は送信元を <b>Web1 → VIP に戻して</b>客A に返す。</p>
          <p>もし応答が LB を通らずに直接返ると、客A には「接続した覚えのない 10.0.0.11 から応答が来た」ことになり、通信が成立しない。サーバのゲートウェイを LB にできない構成では、LB で<b>送信元 NAT</b> も行う（そのかわり、サーバから客の IP が見えなくなるので <b>X-Forwarded-For</b> ヘッダで伝える）。</p>`,
        phases: [[['web1', 'lb']], [['lb', 'net']], [['net', 'c1']]],
        frame: frame([VIP, 'VIP（LB が書き戻した）'], [C1, '客A']),
        side: sessions([S1], 0),
      },
      {
        title: '④ 客B は Web2 へ',
        focus: 'lb', pkt: 'ip', frameGroup: 'c2s',
        desc: `<p>次の客B は、ラウンドロビンで <b>Web2</b> に振り分けられる。こうしてアクセスが2台に分散する。</p>`,
        phases: [[['c2', 'net']], [['net', 'lb']], [['lb', 'web2']]],
        frame: frame([C2, '客B'], ['10.0.0.12', 'Web2']),
        side: sessions([S1, S2], 1),
      },
      {
        title: '⑤ セッション維持',
        focus: 'lb', pkt: 'ip', frameGroup: 'c2s',
        desc: `<p>客A がショッピングカートに商品を入れた後、次のアクセスが Web2 に振り分けられると、<b>カートの中身（Web1 のメモリ上にある）が消えてしまう</b>。</p>
          <p><b>セッション維持（パーシステンス）</b>：同じ客を同じサーバに振り分け続ける。</p>
          <ul>
            <li><b>送信元 IP</b> で判断：簡単だが、NAPT で多くの客が同じ IP に見えると偏る</li>
            <li><b>Cookie</b> で判断：LB が Cookie を挿入・参照する。HTTPS では LB で復号（<b>SSL オフロード</b>）が必要</li>
          </ul>`,
        phases: [[['c1', 'net']], [['net', 'lb']], [['lb', 'web1']]],
        frame: frame([C1, '客A'], ['10.0.0.11', 'Web1（同じサーバ）']),
        side: sessions([S1, S2], 0),
      },
      {
        title: '⑥ ヘルスチェック',
        focus: 'lb', pkt: 'ctl', label: 'ヘルスチェック', noCompare: true,
        desc: `<p>LB は各サーバが正常かを定期的に確認する（<b>ヘルスチェック</b>）。Web2 が応答しなくなったので、Web2 を<b>振り分け対象から外す</b>。以降の通信はすべて Web1 へ。</p>
          <ul>
            <li>L3：ping に応答するか（サーバの OS は動いているか）</li>
            <li>L4：TCP 443 に接続できるか（Web サーバのプロセスは動いているか）</li>
            <li>L7：HTTP で特定ページを要求し、<b>200 OK と期待した内容</b>が返るか（アプリケーションまで正常か）</li>
          </ul>
          <p>L3 だけだと「OS は動いているが Web サービスが止まっている」ことを検知できない。</p>`,
        phases: [[['lb', 'web1'], ['lb', 'web2', { drop: true }]], [['web1', 'lb', { label: '200 OK' }]]],
        links: { 'lb-web2': 'down' },
        nodes: { web2: 'down' },
        side: {
          title: 'LB の振り分け対象',
          head: ['サーバ', 'ヘルスチェック', '状態'],
          rows: [['Web1', 'HTTP GET /health → 200', '有効'], ['Web2', '応答なし（3回連続）', '<b>除外</b>']],
          hit: 1,
        },
      },
      {
        title: 'まとめ',
        desc: `<p>LB 自体が単一障害点にならないよう、LB も2台で冗長化する（アクティブ/スタンバイ、VRRP 相当の仕組み＋セッション情報の同期）。</p>`,
        side: {
          title: '主な振り分け方式',
          head: ['方式', '内容'],
          rows: [
            ['ラウンドロビン', '順番に振り分ける'],
            ['重み付けラウンドロビン', '性能に応じて比率を変える（例 2:1）'],
            ['最小コネクション', '接続数が最も少ないサーバへ'],
            ['最短応答時間', '応答が最も速いサーバへ'],
          ],
        },
      },
    ],
  });
})();
