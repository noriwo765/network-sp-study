// パケットの旅：ARP からルータ2台を経由して Server に届くまで【2-5】
(() => {
  const MAC = {
    pca:   ['02:00:00:00:00:0a', 'PC-A'],
    rt1g0: ['02:00:00:01:00:01', 'RT1 G0'],
    rt1g1: ['02:00:00:01:00:02', 'RT1 G1'],
    rt2g0: ['02:00:00:02:00:01', 'RT2 G0'],
    rt2g1: ['02:00:00:02:00:02', 'RT2 G1'],
    sv:    ['02:00:00:00:00:64', 'Server'],
    bc:    ['ff:ff:ff:ff:ff:ff', 'ブロードキャスト'],
    zero:  ['00:00:00:00:00:00', '不明'],
  };

  const cks = ttl => ipChecksum({ src: '192.168.1.10', dst: '172.16.0.10', ttl });

  function ethHeader(dst, src, type) {
    return ['Ethernetヘッダ', [
      ['宛先MAC', ...dst],
      ['送信元MAC', ...src],
      ['タイプ', ...type],
    ]];
  }

  function arpFrame(isReply, ethDst, ethSrc, sender, senderIp, target, targetIp) {
    return [
      ethHeader(ethDst, ethSrc, ['0x0806', 'ARP']),
      ['ARP', [
        ['オペレーション', isReply ? '2' : '1', isReply ? '応答' : '要求'],
        ['送信元MAC', ...sender],
        ['送信元IP', senderIp],
        ['目標MAC', ...target],
        ['目標IP', targetIp],
      ]],
    ];
  }

  function ipFrame(ethDst, ethSrc, ttl) {
    return [
      ethHeader(ethDst, ethSrc, ['0x0800', 'IPv4']),
      ['IPv4ヘッダ', [
        ['バージョン / IHL', '4 / 5', '20バイト'],
        ['全長', '60'],
        ['識別子', '0x1c46'],
        ['フラグ', 'DF=1'],
        ['TTL', String(ttl)],
        ['プロトコル', '6', 'TCP'],
        ['ヘッダチェックサム', cks(ttl)],
        ['送信元IP', '192.168.1.10', 'PC-A'],
        ['宛先IP', '172.16.0.10', 'Server'],
      ]],
      ['TCPヘッダ', [
        ['送信元ポート', '50000'],
        ['宛先ポート', '80', 'HTTP'],
        ['フラグ', 'SYN'],
      ]],
    ];
  }

  const routeTable = (title, rows, hit) => ({ title, head: ['宛先', 'ネクストホップ', '出力IF'], rows, hit });
  const swTable = (rows, hit) => ({ title: 'SW1 MACアドレステーブル', head: ['MACアドレス', 'ポート'], rows, hit });
  const SW_A = ['02:00:00:00:00:0a', 'p1'];
  const SW_R = ['02:00:00:01:00:01', 'p3'];

  SCENARIOS.push({
    id: 'basic',
    chapter: 3,
    title: 'パケットの旅',
    subtitle: 'フレームはホップごとにどう書き換わる？【2-5】ルータ転送時のヘッダ変化',
    nodes: {
      pca: { x: 70,  y: 60,  name: 'PC-A',   kind: 'pc', lines: ['192.168.1.10'] },
      pcb: { x: 70,  y: 190, name: 'PC-B',   kind: 'pc', lines: ['192.168.1.20'] },
      sw:  { x: 205, y: 125, name: 'SW1',    kind: 'sw', lines: ['L2スイッチ'] },
      rt1: { x: 380, y: 125, name: 'RT1',    kind: 'rt', lines: ['G0: 192.168.1.1', 'G1: 10.0.0.1'] },
      rt2: { x: 555, y: 125, name: 'RT2',    kind: 'rt', lines: ['G0: 10.0.0.2', 'G1: 172.16.0.1'] },
      sv:  { x: 740, y: 125, name: 'Server', kind: 'sv', lines: ['172.16.0.10'] },
    },
    links: [
      { a: 'pca', b: 'sw', pb: 'p1' },
      { a: 'pcb', b: 'sw', pb: 'p2' },
      { a: 'sw', b: 'rt1', pa: 'p3', pb: 'G0', net: '192.168.1.0/24' },
      { a: 'rt1', b: 'rt2', pa: 'G1', pb: 'G0', net: '10.0.0.0/30' },
      { a: 'rt2', b: 'sv', pa: 'G1', net: '172.16.0.0/24' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>PC-A がブラウザで Server（172.16.0.10）に Web アクセスする。最初に送る TCP の SYN パケットが届くまでを追いかける。</p>
          <p>注目点：<b>どのフィールドがホップごとに変わり、どれが変わらないか</b>。</p>
          <p>図の右下にある「予想モード」をオンにすると、フレームの中身を自分で予想してからクリックで答え合わせできる。</p>`,
      },
      {
        title: '① ARP要求',
        focus: 'pca',
        pkt: 'arp',
        desc: `<p><b>PC-A の判断</b>：自分のネットワーク 192.168.1.0/24 と宛先 172.16.0.10 をサブネットマスクで比べる → <b>別のネットワーク</b>なので、デフォルトゲートウェイ <b>192.168.1.1</b> に渡す。</p>
          <p>ゲートウェイの MAC アドレスが ARP キャッシュにないため、<b>ARP要求をブロードキャスト</b>で送る。</p>
          <p><b>SW1</b>：宛先がブロードキャストなので、受信ポート以外の全ポートへ<b>フラッディング</b>。同時に送信元 MAC（PC-A）を p1 として学習する。PC-B は目標IPが自分ではないので破棄する。</p>`,
        phases: [[['pca', 'sw']], [['sw', 'pcb'], ['sw', 'rt1']]],
        frame: arpFrame(false, MAC.bc, MAC.pca, MAC.pca, '192.168.1.10', MAC.zero, '192.168.1.1'),
        side: swTable([SW_A], 0),
      },
      {
        title: '② ARP応答',
        focus: 'rt1',
        pkt: 'arp',
        desc: `<p><b>RT1</b>：目標IP 192.168.1.1 が自分の G0 なので、PC-A に<b>ユニキャストで ARP応答</b>を返す。</p>
          <p><b>SW1</b>：宛先 MAC（PC-A）は学習済み → <b>p1 にだけ転送</b>（フラッディングしない）。送信元 MAC（RT1 G0）を p3 として学習する。</p>
          <p>PC-A は 192.168.1.1 ⇔ 02:00:00:01:00:01 を ARP キャッシュに登録する。</p>`,
        phases: [[['rt1', 'sw']], [['sw', 'pca']]],
        frame: arpFrame(true, MAC.pca, MAC.rt1g0, MAC.rt1g0, '192.168.1.1', MAC.pca, '192.168.1.10'),
        side: swTable([SW_A, SW_R], 1),
      },
      {
        title: '③ PC-A → RT1',
        focus: 'pca',
        pkt: 'ip',
        desc: `<p>PC-A が TCP SYN を送る。</p>
          <p><b>宛先IP は最終目的地の Server</b>、<b>宛先MAC は次に渡す相手の RT1 G0</b>。ここが一番大事なポイント。</p>
          <p>SW1 は宛先 MAC を学習済みなので p3 にだけ転送する。</p>`,
        phases: [[['pca', 'sw']], [['sw', 'rt1']]],
        frame: ipFrame(MAC.rt1g0, MAC.pca, 64),
        side: swTable([SW_A, SW_R], 1),
      },
      {
        title: '④ RT1 の転送',
        focus: 'rt1',
        pkt: 'ip',
        desc: `<p><b>RT1</b>：宛先 MAC が自分なので受信し、IP ヘッダを見る。宛先 172.16.0.10 で<b>ルーティングテーブルをロンゲストマッチ</b> → 172.16.0.0/24、ネクストホップ 10.0.0.2（G1）。</p>
          <p><b>TTL を 64 → 63</b> に減らし、<b>ヘッダチェックサムを再計算</b>。</p>
          <p>Ethernet ヘッダは<b>付け替え</b>：送信元は自分の G1、宛先はネクストホップ 10.0.0.2 の MAC（ARP 解決済みとする）。</p>`,
        phases: [[['rt1', 'rt2']]],
        frame: ipFrame(MAC.rt2g0, MAC.rt1g1, 63),
        side: routeTable('RT1 ルーティングテーブル', [
          ['192.168.1.0/24', '直接接続', 'G0'],
          ['10.0.0.0/30', '直接接続', 'G1'],
          ['172.16.0.0/24', '10.0.0.2', 'G1'],
        ], 2),
      },
      {
        title: '⑤ RT2 の転送',
        focus: 'rt2',
        pkt: 'ip',
        desc: `<p><b>RT2</b>：宛先 172.16.0.10 は<b>直接接続</b>のネットワーク 172.16.0.0/24 にある → ネクストホップではなく<b>宛先ホスト自身の MAC</b> を宛先にする（ARP 解決済みとする）。</p>
          <p>TTL を 63 → 62 に減らし、チェックサムを再計算。送信元・宛先 IP は<b>最後まで変わらない</b>。</p>`,
        phases: [[['rt2', 'sv']]],
        frame: ipFrame(MAC.sv, MAC.rt2g1, 62),
        side: routeTable('RT2 ルーティングテーブル', [
          ['10.0.0.0/30', '直接接続', 'G0'],
          ['172.16.0.0/24', '直接接続', 'G1'],
          ['192.168.1.0/24', '10.0.0.1', 'G0'],
        ], 1),
      },
      {
        title: '⑥ Server 受信',
        focus: 'sv',
        pkt: 'ip',
        desc: `<p><b>Server</b> は下の層から順にヘッダを確認して取り外す（非カプセル化）。</p>
          <ol>
            <li>宛先 MAC が自分 → タイプ 0x0800 なので IP へ</li>
            <li>宛先 IP が自分、チェックサム OK → プロトコル 6 なので TCP へ</li>
            <li>宛先ポート 80 → Web サーバのプロセスへ</li>
          </ol>
          <p>Server は SYN+ACK を返す。帰りも同じように、MAC アドレスはホップごとに付け替えられる。</p>`,
        frame: ipFrame(MAC.sv, MAC.rt2g1, 62),
      },
      {
        title: 'まとめ',
        desc: `<p>区間ごとの比較。<b>MAC はホップごとに変わり、IP は端から端まで変わらない</b>。TTL とチェックサムはルータを通るたびに変わる。</p>`,
        side: {
          title: '区間ごとのヘッダ',
          head: ['区間', '宛先MAC', '送信元MAC', 'TTL', 'チェックサム'],
          rows: [
            ['PC-A → RT1', 'RT1 G0', 'PC-A', '64', cks(64)],
            ['RT1 → RT2', 'RT2 G0', 'RT1 G1', '63', cks(63)],
            ['RT2 → Server', 'Server', 'RT2 G1', '62', cks(62)],
          ],
          foot: '送信元IP 192.168.1.10 ／ 宛先IP 172.16.0.10 は全区間で同じ',
        },
      },
    ],
  });
})();
