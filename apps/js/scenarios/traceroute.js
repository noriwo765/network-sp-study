// traceroute：TTL と ICMP による経路調査と障害切り分け【2-2】【5-2 障害の分析と復旧】
(() => {
  const probe = ttl => [
    ['IPv4ヘッダ', [
      ['TTL', String(ttl)],
      ['プロトコル', '17', 'UDP'],
      ['送信元IP', '192.168.1.10', 'PC'],
      ['宛先IP', '172.16.0.10', 'Server'],
    ]],
    ['UDPヘッダ', [['宛先ポート', String(33433 + ttl), '使われていないポート']]],
  ];
  const icmp = (src, type, code, name) => [
    ['IPv4ヘッダ', [
      ['送信元IP', src],
      ['宛先IP', '192.168.1.10', 'PC'],
      ['プロトコル', '1', 'ICMP'],
    ]],
    ['ICMP', [
      ['タイプ', type, name],
      ['コード', code],
      ['データ', '元のパケットの IP ヘッダ＋先頭 8 バイト'],
    ]],
  ];
  const result = (rows, hit, foot) => ({ title: 'traceroute 172.16.0.10 の結果', head: ['ホップ', '応答した IP', 'RTT'], rows, hit, foot });
  const R1 = ['1', '192.168.1.1', '1 ms  1 ms  1 ms'];
  const R2 = ['2', '10.0.12.2', '5 ms  4 ms  5 ms'];
  const R3 = ['3', '10.0.23.2', '9 ms  9 ms  10 ms'];
  const R4 = ['4', '172.16.0.10', '11 ms  10 ms  11 ms'];
  const back = (path, label) => path.slice(0, -1).map((n, i) => [[n, path[i + 1], { label, kind: 'ctl' }]]);

  SCENARIOS.push({
    id: 'traceroute',
    chapter: 11,
    title: 'traceroute',
    subtitle: 'TTL をわざと小さくして、経路上のルータを1台ずつ見つけていく',
    nodes: {
      pc: { x: 60,  y: 125, name: 'PC', kind: 'pc', lines: ['192.168.1.10'] },
      r1: { x: 230, y: 125, name: 'R1', kind: 'rt', lines: ['192.168.1.1'] },
      r2: { x: 400, y: 125, name: 'R2', kind: 'rt', lines: ['10.0.12.2'] },
      r3: { x: 570, y: 125, name: 'R3', kind: 'rt', lines: ['10.0.23.2'] },
      sv: { x: 745, y: 125, name: 'Server', kind: 'sv', lines: ['172.16.0.10'] },
    },
    links: [
      { a: 'pc', b: 'r1' },
      { a: 'r1', b: 'r2' },
      { a: 'r2', b: 'r3' },
      { a: 'r3', b: 'sv' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>traceroute（Windows では tracert）は、宛先までに通過するルータを調べるコマンド。仕組みは IP ヘッダの <b>TTL</b> と <b>ICMP</b> の組み合わせ。</p>
          <ul>
            <li>ルータは転送のたびに TTL を 1 減らし、<b>0 になったら破棄</b>して送信元に <b>ICMP Time Exceeded（タイプ11）</b>を返す</li>
            <li>TTL を 1, 2, 3… と増やしながら送れば、各ホップのルータが順に名乗り出てくれる</li>
          </ul>
          <p>Linux の traceroute は UDP、Windows の tracert は ICMP エコー要求を送る。ここでは UDP 版で説明する。ルータに表示されているのは、PC 側から受信したインタフェースのアドレス。</p>`,
      },
      {
        title: '① TTL=1',
        focus: 'r1', pkt: 'ip', label: 'TTL=1', frameGroup: 'probe',
        desc: `<p>TTL=1 で送ると、R1 で TTL が 0 になって破棄される。R1 は <b>Time Exceeded</b> を返すので、1ホップ目が R1（192.168.1.1）だと分かる。</p>
          <p>実際には同じ TTL で <b>3回</b>ずつ送り、それぞれの往復時間（RTT）を表示する。</p>`,
        phases: [[['pc', 'r1']], ...back(['r1', 'pc'], 'ICMP 11')],
        frame: probe(1),
        side: result([R1], 0),
      },
      {
        title: '② TTL=2',
        focus: 'r2', pkt: 'ip', label: 'TTL=2', frameGroup: 'probe',
        desc: `<p>TTL=2 なら R1 を通過（TTL 2→1）し、R2 で 0 になる。R2 から Time Exceeded が返る。</p>`,
        phases: [[['pc', 'r1']], [['r1', 'r2', { label: 'TTL=1' }]], ...back(['r2', 'r1', 'pc'], 'ICMP 11')],
        frame: probe(2),
        side: result([R1, R2], 1),
      },
      {
        title: '③ TTL=3',
        focus: 'r3', pkt: 'ip', label: 'TTL=3', frameGroup: 'probe',
        desc: `<p>同様に R3 が見つかる。右のフレームでは TTL と宛先ポート番号だけが毎回変わっている（ポート番号で、どのプローブへの応答かを区別する）。</p>`,
        phases: [[['pc', 'r1']], [['r1', 'r2', { label: 'TTL=2' }]], [['r2', 'r3', { label: 'TTL=1' }]], ...back(['r3', 'r2', 'r1', 'pc'], 'ICMP 11')],
        frame: probe(3),
        side: result([R1, R2, R3], 2),
      },
      {
        title: '④ 宛先に到達',
        focus: 'sv', pkt: 'ip', label: 'TTL=4', noCompare: true,
        desc: `<p>TTL=4 でついに Server に届く。Server では TTL は減らないので Time Exceeded は返らない。代わりに、使われていない UDP ポート宛てなので <b>ICMP Destination Unreachable（タイプ3 コード3：Port Unreachable）</b>が返る。</p>
          <p>これを受け取ったら traceroute は終了する。</p>`,
        phases: [[['pc', 'r1']], [['r1', 'r2']], [['r2', 'r3']], [['r3', 'sv']], ...back(['sv', 'r3', 'r2', 'r1', 'pc'], 'ICMP 3')],
        frame: icmp('172.16.0.10', '3', '3', 'Port Unreachable'),
        side: result([R1, R2, R3, R4], 3),
      },
      {
        title: '⑤ 障害の切り分け',
        focus: 'r3', pkt: 'ip', label: 'TTL=4', noCompare: true,
        desc: `<p>「Server に接続できない」という申告があった。traceroute を実行すると、<b>3ホップ目（R3）までは応答があり、その先が「* * *」</b>（応答なし）になった。</p>
          <p>→ <b>R3 と Server の間</b>（R3 の先の回線、R3 の経路設定、Server 自体）に問題がありそうだと絞り込める。</p>
          <p>ただし注意：ICMP をフィルタしていたり応答を制限していたりするルータも「* * *」になる。<b>その後のホップが応答していれば</b>、そのルータは正常に転送している。</p>`,
        phases: [[['pc', 'r1']], [['r1', 'r2']], [['r2', 'r3']], [['r3', 'sv', { drop: true }]]],
        links: { 'r3-sv': 'down' },
        side: result([R1, R2, R3, ['4', '*', '*  *  *'], ['5', '*', '*  *  *']], [3, 4], '最大ホップ数（既定 30）まで「*」が続く'),
      },
      {
        title: 'まとめ',
        desc: `<p>障害切り分けの基本は、<b>近いところから順に</b>確認すること。</p>
          <ol>
            <li>自分の設定（ipconfig / ip addr）</li>
            <li>デフォルトゲートウェイへの ping</li>
            <li>宛先への ping → 失敗したら traceroute で止まる場所を探す</li>
            <li>名前で失敗して IP で成功するなら DNS を疑う（nslookup）</li>
          </ol>
          <p>MTU の問題は「DF ビット付き・サイズ指定の ping」（Windows：ping -f -l 1472）で確認できる。</p>`,
        side: {
          title: 'traceroute / ping に関わる ICMP',
          head: ['タイプ', 'コード', '名前', '使われる場面'],
          rows: [
            ['0', '0', 'Echo Reply', 'ping の応答'],
            ['8', '0', 'Echo Request', 'ping、Windows の tracert'],
            ['11', '0', 'Time Exceeded', 'TTL 切れ（traceroute の途中経路）'],
            ['3', '3', 'Port Unreachable', 'UDP の traceroute が宛先に到達'],
            ['3', '4', 'Fragmentation Needed', 'DF=1 で MTU 超過（PMTUD）'],
          ],
        },
      },
    ],
  });
})();
