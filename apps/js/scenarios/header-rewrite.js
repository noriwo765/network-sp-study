// ヘッダの書き換え：ルータの TTL・チェックサム、経路MTU探索（DF と ICMP）、NAPT による IP・TCP の変換【本書 Ch.6】
(() => {
  const PC = '192.168.1.10';
  const SV = '198.51.100.10';
  const GIP = '203.0.113.1';
  const RT2 = '10.0.12.2';

  // IPv4 ヘッダ図（チェックサムは実際に計算する）
  function ip({ src, dst, len, id, ttl, proto = 6, df = true }) {
    return {
      title: 'IPv4ヘッダ',
      kind: 'ipv4',
      values: {
        len: String(len),
        id: `0x${id.toString(16).padStart(4, '0')}`,
        flags: df ? 'DF' : '0',
        ttl: String(ttl),
        proto: proto === 6 ? '6 (TCP)' : '1 (ICMP)',
        sum: ipChecksum({ src, dst, ttl, proto, len, id, flags: df ? 0x4000 : 0 }),
        src,
        dst,
      },
    };
  }
  const tcp = values => ({ title: 'TCPヘッダ', kind: 'tcp', values: { flags: 'ACK PSH', win: '502', ...values } });

  const OUT_TCP = { sport: '50000', dport: '443', seq: '1001', ack: '5001' };

  const who = (rows, hit) => ({ title: 'このステップで書き換えた機器と項目', head: ['機器', '書き換えた項目'], rows, hit });

  SCENARIOS.push({
    id: 'header-rewrite',
    chapter: 6,
    title: 'ヘッダの書き換え',
    subtitle: 'ルータ・MTU の小さい区間・NAPT を通るたびに、IP ヘッダと TCP ヘッダのどこが変わるか',
    nodes: {
      pc:  { x: 60,  y: 125, name: 'PC', kind: 'pc', lines: [PC] },
      rt1: { x: 230, y: 125, name: 'RT1', kind: 'rt', lines: ['192.168.1.1'] },
      rt2: { x: 400, y: 125, name: 'RT2', kind: 'rt', lines: [RT2] },
      fw:  { x: 570, y: 125, name: 'FW', kind: 'fw', lines: ['NAPT', `外 ${GIP}`] },
      sv:  { x: 745, y: 125, name: 'Server', kind: 'sv', lines: [SV] },
    },
    links: [
      { a: 'pc', b: 'rt1', net: 'MTU 1500' },
      { a: 'rt1', b: 'rt2', net: 'MTU 1500' },
      { a: 'rt2', b: 'fw', net: 'MTU 1400' },
      { a: 'fw', b: 'sv', net: 'インターネット' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>PC が Server（HTTPS）に、1460 バイトのデータを載せた TCP セグメントを送る。途中には次のものがある。</p>
          <ul>
            <li>普通のルータ RT1・RT2</li>
            <li>RT2 と FW の間だけ <b>MTU が 1400</b> の区間（トンネルなどでよくある）</li>
            <li>NAPT を行う FW</li>
          </ul>
          <p>右のヘッダ図で、<b>どの機器がどのフィールドを書き換えるか</b>を追いかける。変わったフィールドは点滅して黄色で残り、赤字が前の値。IP ヘッダチェックサムは実際に計算した値、TCP チェックサムは例。</p>`,
      },
      {
        title: '① PC → RT1',
        focus: 'pc', pkt: 'ip', label: '1500B', frameGroup: 'out',
        desc: `<p>PC が送るパケット。TCP は MSS（1460）いっぱいのデータを載せ、IP の全長は 20 ＋ 20 ＋ 1460 = <b>1500</b>。</p>
          <p>TCP は通常 <b>DF（Don't Fragment）ビットを立てて</b>送る。途中で分割させず、経路の MTU に合わせて自分でサイズを調整する（経路MTU探索）ため。</p>`,
        phases: [[['pc', 'rt1']]],
        diagram: [ip({ src: PC, dst: SV, len: 1500, id: 0x2a10, ttl: 64 }), tcp({ ...OUT_TCP, sum: '0x8c21' })],
      },
      {
        title: '② RT1 の転送',
        focus: 'rt1', pkt: 'ip', label: '1500B', frameGroup: 'out',
        desc: `<p>普通のルータが書き換えるのは <b>TTL（−1）</b>と、それに伴う <b>IP ヘッダチェックサム</b>だけ。</p>
          <p>送信元・宛先の IP アドレスも、<b>TCP ヘッダは一切変わらない</b>（ルータは L3 までしか見ない）。L2 では MAC アドレスがホップごとに付け替えられている（Ch.3 パケットの旅）。</p>`,
        phases: [[['rt1', 'rt2']]],
        diagram: [ip({ src: PC, dst: SV, len: 1500, id: 0x2a10, ttl: 63 }), tcp({ ...OUT_TCP, sum: '0x8c21' })],
        side: who([['RT1', 'TTL、IP ヘッダチェックサム']], 0),
      },
      {
        title: '③ MTU を超えた（DF=1）',
        focus: 'rt2', pkt: 'ip', noCompare: true,
        desc: `<p>RT2 の先は MTU 1400。1500 バイトのパケットは入らないが、<b>DF=1 なので分割できない</b>。RT2 はパケットを<b>破棄</b>し、送信元の PC に <b>ICMP Destination Unreachable（タイプ3 コード4：Fragmentation Needed）</b>を返す。</p>
          <p>この ICMP には<b>次ホップの MTU（1400）</b>が入っている。右は ICMP パケットの IP ヘッダ。送信元は RT2、プロトコルは 1（ICMP）。</p>
          <p>FW で ICMP を全部止めていると、この通知が PC に届かず、大きいパケットだけが延々と捨てられる（<b>PMTUD ブラックホール</b>）。</p>`,
        phases: [
          [['rt2', 'fw', { label: '1500B', drop: true }]],
          [['rt2', 'rt1', { label: 'ICMP 3/4', kind: 'ctl' }]],
          [['rt1', 'pc', { label: 'ICMP 3/4', kind: 'ctl' }]],
        ],
        diagram: [ip({ src: RT2, dst: PC, len: 56, id: 0x0b7e, ttl: 255, proto: 1, df: false })],
        frame: [['ICMP', [
          ['タイプ / コード', '3 / 4', 'Fragmentation Needed and DF set'],
          ['次ホップMTU', '1400'],
          ['データ', '捨てたパケットの IP ヘッダ＋先頭 8 バイト', 'PC がどの通信のことか分かるように'],
        ]]],
      },
      {
        title: '④ 小さくして再送',
        focus: 'rt2', pkt: 'ip', label: '1400B', frameGroup: 'out',
        desc: `<p>PC は「この宛先までの MTU は 1400」と覚え、データを <b>1360 バイト</b>に減らして送り直す（全長 1400）。今度は MTU 1400 の区間を通れる。右は RT2 → FW の区間のパケット。</p>
          <p>②と比べて変わったのは<b>全長・識別子・TTL・チェックサム</b>。識別子は新しいパケットなので別の値、TTL は RT1・RT2 を通って 62。</p>
          <p>シーケンス番号は 1001 のまま（同じ位置のデータを、小さく分けて送り直しているため）。</p>`,
        phases: [[['pc', 'rt1']], [['rt1', 'rt2']], [['rt2', 'fw']]],
        diagram: [ip({ src: PC, dst: SV, len: 1400, id: 0x2a11, ttl: 62 }), tcp({ ...OUT_TCP, sum: '0x4e7a' })],
        side: who([['PC', '全長、識別子（新しいパケット）'], ['RT1・RT2', 'TTL、IP ヘッダチェックサム']], [0, 1]),
      },
      {
        title: '⑤ FW の NAPT',
        focus: 'fw', pkt: 'ip', label: '1400B', frameGroup: 'out',
        desc: `<p>FW が NAPT で<b>送信元 IP アドレス</b>をグローバルアドレスに、<b>送信元ポート</b>を空き番号（61001）に書き換える。TTL も −1。</p>
          <p><b>TCP チェックサムも変わる</b>点に注意。TCP チェックサムは TCP ヘッダとデータだけでなく、<b>IP アドレスを含む疑似ヘッダ</b>も計算対象なので、IP アドレスを変えたら再計算が必要。</p>`,
        phases: [[['fw', 'sv']]],
        diagram: [ip({ src: GIP, dst: SV, len: 1400, id: 0x2a11, ttl: 61 }), tcp({ ...OUT_TCP, sport: '61001', sum: '0x1d93' })],
        side: who([['FW', '送信元IP、送信元ポート、TTL、IP・TCP 両方のチェックサム']], 0),
      },
      {
        title: '⑥ 応答が FW に届く',
        focus: 'fw', pkt: 'ip', label: 'ACK', frameGroup: 'in',
        desc: `<p>Server が ACK を返す。宛先は Server から見えている <b>${GIP}:61001</b>。確認応答番号は 1001 ＋ 1360 = <b>2361</b>。</p>
          <p>Server は TTL 64 で送り出し、インターネット上の 10 台のルータを通って 54 になって FW に届いた。</p>`,
        phases: [[['sv', 'fw']]],
        diagram: [
          ip({ src: SV, dst: GIP, len: 40, id: 0x0000, ttl: 54 }),
          tcp({ sport: '443', dport: '61001', seq: '5001', ack: '2361', flags: 'ACK', win: '501', sum: '0x7b05' }),
        ],
      },
      {
        title: '⑦ FW の逆変換',
        focus: 'fw', pkt: 'ip', label: 'ACK', frameGroup: 'in',
        desc: `<p>FW は NAPT テーブルを引いて、<b>宛先 IP アドレスと宛先ポート</b>を PC の 192.168.1.10:50000 に戻す。行きは<b>送信元</b>、帰りは<b>宛先</b>が書き換わる。</p>
          <p>ここでも TTL −1 と、IP・TCP 両方のチェックサムの再計算。この後 RT2・RT1 でも TTL とチェックサムが変わって PC に届く。</p>`,
        phases: [[['fw', 'rt2']], [['rt2', 'rt1']], [['rt1', 'pc']]],
        diagram: [
          ip({ src: SV, dst: PC, len: 40, id: 0x0000, ttl: 53 }),
          tcp({ sport: '443', dport: '50000', seq: '5001', ack: '2361', flags: 'ACK', win: '501', sum: '0x2c6e' }),
        ],
        side: who([['FW', '宛先IP、宛先ポート、TTL、IP・TCP 両方のチェックサム']], 0),
      },
      {
        title: 'まとめ',
        desc: `<p>「この機器はどのフィールドを書き換えるか」は午後の定番。特に<b>NAPT で TCP / UDP チェックサムも変わる</b>こと、<b>DF=1 で MTU を超えると ICMP が返る</b>ことはよく問われる。</p>
          <p>トンネル（IPsec、GRE、PPPoE）でヘッダが増える区間では、ルータで TCP の <b>MSS を書き換えて</b>（MSS クランプ）最初から小さく送らせる対策も一般的。</p>`,
        side: {
          title: '機器ごとに書き換えるフィールド',
          head: ['機器', 'IP ヘッダ', 'TCP ヘッダ'],
          rows: [
            ['ルータ', 'TTL、ヘッダチェックサム', '変えない'],
            ['NAPT（行き）', '送信元IP、TTL、チェックサム', '送信元ポート、チェックサム'],
            ['NAPT（帰り）', '宛先IP、TTL、チェックサム', '宛先ポート、チェックサム'],
            ['MTU 超過・DF=1', '破棄して ICMP 3/4 を返す', '-'],
            ['MTU 超過・DF=0', '分割（全長・フラグ・オフセット）', '先頭の断片にだけ入る'],
            ['MSS クランプ', '変えない', 'SYN の MSS オプション'],
          ],
        },
      },
    ],
  });
})();
