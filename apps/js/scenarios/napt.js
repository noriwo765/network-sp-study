// NAPT：送信元/宛先の IP アドレスとポート番号の書き換え【2-1】【6-5】
(() => {
  const GIP = '203.0.113.1';
  const WEB = '198.51.100.10';

  function frame(src, sport, dst, dport, ttl, flags, srcNote, dstNote) {
    return [
      ['IPv4ヘッダ', [
        ['TTL', String(ttl)],
        ['プロトコル', '6', 'TCP'],
        ['ヘッダチェックサム', ipChecksum({ src, dst, ttl })],
        ['送信元IP', src, srcNote],
        ['宛先IP', dst, dstNote],
      ]],
      ['TCPヘッダ', [
        ['送信元ポート', String(sport)],
        ['宛先ポート', String(dport)],
        ['フラグ', flags],
      ]],
    ];
  }

  const ROW_A = ['192.168.1.10:50000', `${GIP}:60001`, `${WEB}:80`];
  const ROW_B = ['192.168.1.20:50000', `${GIP}:60002`, `${WEB}:80`];
  const naptTable = (rows, hit) => ({ title: 'RT の NAPT テーブル', head: ['内部 IP:ポート', '変換後 IP:ポート', '通信相手'], rows, hit });

  SCENARIOS.push({
    id: 'napt',
    chapter: 8,
    title: 'NAPT',
    subtitle: '1つのグローバルIPを複数端末で共有する仕組み。何がどう書き換わる？',
    nodes: {
      pca: { x: 70,  y: 60,  name: 'PC-A', kind: 'pc', lines: ['192.168.1.10'] },
      pcb: { x: 70,  y: 190, name: 'PC-B', kind: 'pc', lines: ['192.168.1.20'] },
      sw:  { x: 205, y: 125, name: 'SW', kind: 'sw' },
      rt:  { x: 380, y: 125, name: 'RT', kind: 'rt', lines: ['内: 192.168.1.1', `外: ${GIP}`] },
      net: { x: 570, y: 125, name: 'インターネット', kind: 'cloud' },
      web: { x: 745, y: 125, name: 'Web', kind: 'sv', lines: [WEB] },
    },
    links: [
      { a: 'pca', b: 'sw' },
      { a: 'pcb', b: 'sw' },
      { a: 'sw', b: 'rt', net: '192.168.1.0/24' },
      { a: 'rt', b: 'net' },
      { a: 'net', b: 'web' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>プライベートアドレスの PC-A・PC-B が、RT のグローバルアドレス <b>${GIP}</b> を共有してインターネット上の Web サーバにアクセスする。</p>
          <p>注目点：</p>
          <ul>
            <li>行きと帰りで<b>どのフィールドが書き換わるか</b></li>
            <li>なぜ IP アドレスだけでなく<b>ポート番号まで</b>変換するのか</li>
            <li>なぜ<b>外から始まる通信は届かない</b>のか</li>
          </ul>`,
      },
      {
        title: '① PC-A → RT',
        focus: 'pca',
        pkt: 'ip',
        label: 'SYN',
        frameGroup: 'out',
        desc: `<p>PC-A が Web サーバへ TCP SYN を送る。送信元はプライベートアドレス 192.168.1.10、送信元ポートは OS が選んだ 50000。</p>
          <p>このまま送り出すと、Web サーバはプライベートアドレス宛てに返信できない（インターネットでは経路がない）。</p>`,
        phases: [[['pca', 'sw']], [['sw', 'rt']]],
        frame: frame('192.168.1.10', 50000, WEB, 80, 64, 'SYN', 'PC-A', 'Web'),
        side: naptTable([['（空）', '', '']]),
      },
      {
        title: '② RT が変換',
        focus: 'rt',
        pkt: 'ip',
        label: 'SYN',
        frameGroup: 'out',
        desc: `<p><b>RT</b>：<b>送信元 IP</b> を自分のグローバルアドレスに、<b>送信元ポート</b>を空いている番号（60001）に書き換え、対応を NAPT テーブルに記録する。</p>
          <p>IP アドレスが変わるので IP ヘッダチェックサムを再計算する。さらに <b>TCP チェックサムも再計算</b>が必要（TCP チェックサムは IP アドレスを含む疑似ヘッダも計算対象のため）。</p>
          <p>ルータとして転送するので TTL も 1 減る。</p>`,
        phases: [[['rt', 'net']], [['net', 'web']]],
        frame: frame(GIP, 60001, WEB, 80, 63, 'SYN', 'RT 外側', 'Web'),
        side: naptTable([ROW_A], 0),
      },
      {
        title: '③ PC-B も同じポートで',
        focus: 'pcb',
        pkt: 'ip',
        label: 'SYN',
        frameGroup: 'out',
        desc: `<p>PC-B も同じ Web サーバへアクセスした。たまたま<b>送信元ポートも PC-A と同じ 50000</b>。</p>
          <p>IP アドレスだけを変換する NAT だと、変換後はどちらも「${GIP}:50000」になり、<b>返ってきたパケットをどちらに戻すか区別できない</b>。</p>
          <p>NAPT は送信元ポートも別の番号（60002）に変えるので、<b>1つのグローバルアドレスで複数端末を同時に通信</b>させられる。右のフレームは RT で変換した後のもの。</p>`,
        phases: [[['pcb', 'sw']], [['sw', 'rt']], [['rt', 'net']], [['net', 'web']]],
        frame: frame(GIP, 60002, WEB, 80, 63, 'SYN', 'RT 外側', 'Web'),
        side: naptTable([ROW_A, ROW_B], 1),
      },
      {
        title: '④ Web → RT 応答',
        focus: 'web',
        pkt: 'ip',
        label: 'SYN+ACK',
        frameGroup: 'in',
        desc: `<p>Web サーバは PC-A への応答（SYN+ACK）を返す。Web サーバから見える相手は <b>${GIP}:60001</b> だけで、PC-A の存在は分からない。</p>`,
        phases: [[['web', 'net']], [['net', 'rt']]],
        frame: frame(WEB, 80, GIP, 60001, 50, 'SYN+ACK', 'Web', 'RT 外側'),
        side: naptTable([ROW_A, ROW_B], 0),
      },
      {
        title: '⑤ RT が逆変換',
        focus: 'rt',
        pkt: 'ip',
        label: 'SYN+ACK',
        frameGroup: 'in',
        desc: `<p><b>RT</b>：宛先「${GIP}:60001」で NAPT テーブルを検索し、<b>宛先 IP とポート</b>を 192.168.1.10:50000 に戻して PC-A に転送する。</p>
          <p>行きは<b>送信元</b>、帰りは<b>宛先</b>が書き換わる。チェックサムもまた再計算される。</p>`,
        phases: [[['rt', 'sw']], [['sw', 'pca']]],
        frame: frame(WEB, 80, '192.168.1.10', 50000, 49, 'SYN+ACK', 'Web', 'PC-A'),
        side: naptTable([ROW_A, ROW_B], 0),
      },
      {
        title: '⑥ 外から始まる通信',
        focus: 'rt',
        pkt: 'ip',
        label: 'SYN',
        noCompare: true,
        desc: `<p>インターネット上の端末が、${GIP} の 443 番ポートに<b>新しく接続を試みた</b>。</p>
          <p>NAPT テーブルには該当するエントリがないので、RT は<b>どの内部端末に渡せばよいか分からず破棄</b>する。</p>
          <p>内部のサーバを公開したいときは、<b>静的 NAPT（ポートフォワーディング）</b>で「${GIP}:443 → 192.168.1.100:443」のような変換を事前に登録する。</p>`,
        phases: [[['net', 'rt', { drop: true }]]],
        frame: frame('198.51.100.99', 40000, GIP, 443, 52, 'SYN', '外部の端末', 'RT 外側'),
        side: naptTable([ROW_A, ROW_B], []),
      },
      {
        title: 'まとめ',
        desc: `<p>NAPT が書き換えるフィールドは下の表のとおり。</p>
          <p>午後でよく問われる注意点：</p>
          <ul>
            <li>ESP にはポート番号がないので、IPsec は NAPT を越えられない → <b>NAT トラバーサル</b>（UDP 4500 でカプセル化）</li>
            <li>FTP（アクティブモード）や SIP のように、<b>データ部に IP アドレスを書き込む</b>プロトコルはそのままでは動かない → ALG が必要</li>
            <li>NAPT テーブルのエントリは一定時間通信がないと消える（長時間無通信のセッションが切れる原因）</li>
          </ul>`,
        side: {
          title: 'NAPT による書き換え',
          head: ['方向', 'IP アドレス', 'ポート番号', 'チェックサム'],
          rows: [
            ['内 → 外', '送信元を変換', '送信元を変換', 'IP・TCP/UDP とも再計算'],
            ['外 → 内', '宛先を逆変換', '宛先を逆変換', 'IP・TCP/UDP とも再計算'],
          ],
        },
      },
    ],
  });
})();
