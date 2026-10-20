// DoS 攻撃：SYN フラッドと SYN Cookie、DNS リフレクション攻撃【本書 Ch.6】【6-8】
(() => {
  const backlog = (rows, hit, foot) => ({
    title: 'Web サーバのハーフオープン接続（バックログ：最大 4 件の例）',
    head: ['送信元', '状態'],
    rows,
    hit,
    foot,
  });
  const FULL = [
    ['203.0.113.11:1111（偽装）', 'SYN+ACK 送信済み・ACK 待ち'],
    ['198.51.100.22:2222（偽装）', 'SYN+ACK 送信済み・ACK 待ち'],
    ['192.0.2.33:3333（偽装）', 'SYN+ACK 送信済み・ACK 待ち'],
    ['203.0.113.44:4444（偽装）', 'SYN+ACK 送信済み・ACK 待ち'],
  ];

  SCENARIOS.push({
    id: 'dos',
    chapter: 6,
    title: 'DoS攻撃',
    subtitle: 'SYN フラッドでサーバが応答できなくなる仕組みと、SYN Cookie・リフレクション攻撃',
    viewBox: '0 0 810 275',
    nodes: {
      atk:  { x: 70,  y: 60,  name: '攻撃者', kind: 'pc', lines: ['送信元を偽装'], linesAbove: true },
      user: { x: 70,  y: 210, name: '利用者', kind: 'pc', lines: ['198.51.100.50'] },
      net:  { x: 300, y: 135, name: 'インターネット', kind: 'cloud' },
      dns:  { x: 520, y: 40,  name: 'DNS', kind: 'sv', lines: ['オープンリゾルバ'] },
      web:  { x: 560, y: 210, name: 'Web', kind: 'sv', lines: ['203.0.113.80'] },
      vic:  { x: 750, y: 135, name: '被害者', kind: 'sv', lines: ['192.0.2.200'] },
    },
    links: [
      { a: 'atk', b: 'net' },
      { a: 'user', b: 'net' },
      { a: 'net', b: 'dns' },
      { a: 'net', b: 'web' },
      { a: 'net', b: 'vic' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p><b>DoS 攻撃</b>は、大量の通信や処理要求でサーバや回線の資源を使い果たさせ、正規の利用者がサービスを使えないようにする攻撃。多数の機器（ボットネット）から行うものを <b>DDoS</b> という。</p>
          <p>ここでは TCP の仕組みを悪用する <b>SYN フラッド</b>と、UDP を悪用する <b>リフレクション（反射）攻撃</b>を見る。</p>`,
      },
      {
        title: '① SYN フラッド',
        focus: 'web', pkt: 'ip', label: 'SYN', noCompare: true,
        desc: `<p>攻撃者は<b>送信元 IP を偽装した SYN</b> を大量に送る。Web サーバは SYN+ACK を返し、<b>ACK を待つハーフオープン状態</b>の接続情報を保持する。</p>
          <p>SYN+ACK は偽装された（存在しない、または無関係な）アドレスに送られるので、ACK は永遠に返ってこない。タイムアウトするまで、接続情報が<b>バックログ（接続待ちキュー）</b>を占有し続ける。</p>`,
        phases: [
          [['atk', 'net', { label: 'SYN×大量' }]],
          [['net', 'web', { label: 'SYN×大量' }]],
          [['web', 'net', { label: 'SYN+ACK', kind: 'ctl' }]],
        ],
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '203.0.113.11', '偽装（攻撃者のアドレスではない）'], ['宛先IP', '203.0.113.80', 'Web']]],
          ['TCPヘッダ', [['宛先ポート', '443'], ['フラグ', 'SYN']]],
        ],
        side: backlog(FULL, [0, 1, 2, 3], 'バックログが満杯'),
      },
      {
        title: '② 正規の利用者が接続できない',
        focus: 'user', pkt: 'ip', label: 'SYN', noCompare: true,
        desc: `<p>正規の利用者が接続しようとしても、バックログが満杯なので Web サーバは新しい SYN を受け付けられず<b>破棄</b>する。</p>
          <p>サーバの CPU や回線にはまだ余裕があっても、<b>TCP の接続待ちキュー</b>という限られた資源を使い切られたことでサービスが止まる。</p>`,
        phases: [[['user', 'net']], [['net', 'web', { drop: true }]]],
        side: backlog(FULL, [], '新しい SYN を受け付けられない'),
      },
      {
        title: '③ 対策：SYN Cookie',
        focus: 'web', pkt: 'ip', noCompare: true,
        desc: `<p><b>SYN Cookie</b>：SYN を受け取っても<b>接続情報を保持しない</b>。代わりに、送信元・宛先の IP とポート、時刻、秘密値から計算した値を <b>SYN+ACK のシーケンス番号</b>に埋め込んで返す。</p>
          <p>正規の利用者から ACK が返ってきたら、確認応答番号 − 1 が自分の埋め込んだ値と一致するかを検証し、そこで初めて接続を確立する。偽装 SYN には ACK が返らないので、何も消費しない。</p>`,
        phases: [
          [['user', 'net', { label: 'SYN' }]], [['net', 'web', { label: 'SYN' }]],
          [['web', 'net', { label: 'SYN+ACK(Cookie)' }]], [['net', 'user', { label: 'SYN+ACK(Cookie)' }]],
          [['user', 'net', { label: 'ACK' }]], [['net', 'web', { label: 'ACK' }]],
        ],
        frame: [['TCPヘッダ（SYN+ACK）', [
          ['シーケンス番号', '0x5f3a91c2', 'Cookie（IP・ポート・時刻・秘密値のハッシュ）'],
          ['フラグ', 'SYN, ACK'],
        ]]],
        side: backlog([['（保持しない）', '-']]),
      },
      {
        title: '④ リフレクション攻撃',
        focus: 'vic', pkt: 'ctl', noCompare: true,
        desc: `<p>攻撃者は<b>送信元 IP を被害者のアドレスに偽装</b>して、オープンリゾルバ（誰からの再帰問い合わせにも答える DNS サーバ）に問い合わせる。</p>
          <p>DNS サーバは応答を<b>被害者に</b>返す。小さな問い合わせ（数十バイト）で大きな応答（数千バイト）を返させられるので、攻撃者の送信量の何十倍もの通信が被害者に集中する（<b>増幅攻撃</b>）。</p>
          <p>UDP が使われる理由：①ハンドシェイクがないので<b>送信元を偽装しやすい</b>、②<b>応答が要求より大きい</b>。NTP や memcached も悪用される。</p>`,
        phases: [
          [['atk', 'net', { label: '小さな問い合わせ' }]],
          [['net', 'dns', { label: '小さな問い合わせ' }]],
          [['dns', 'net', { label: '大きな応答' }]],
          [['net', 'vic', { label: '大きな応答×大量' }]],
        ],
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '192.0.2.200', '<b>被害者に偽装</b>'], ['宛先IP', '（オープンリゾルバ）']]],
          ['UDPヘッダ', [['宛先ポート', '53', 'DNS']]],
          ['DNS', [['質問', 'example.com ANY（応答が大きくなる種類）']]],
        ],
        links: { 'net-vic': 'hit' },
      },
      {
        title: 'まとめ',
        desc: `<p>送信元 IP の偽装を防ぐには、ISP や組織の出口で<b>自分のネットワークのアドレス以外を送信元とするパケットを破棄</b>する（イングレスフィルタリング / 送信元検証）。全員がこれをすれば、偽装を使う攻撃は成り立たない。</p>
          <p>大規模な DDoS は自社の回線容量を超えるので、ISP や CDN が提供する <b>DDoS 対策サービス</b>（上流で攻撃通信を除去する）を使う。</p>`,
        side: {
          title: '攻撃と対策',
          head: ['攻撃', '悪用するもの', '主な対策'],
          rows: [
            ['SYN フラッド', 'TCP のハーフオープン状態', 'SYN Cookie、FW / IPS のしきい値制御、タイムアウト短縮'],
            ['UDP フラッド', '回線帯域', '上流での遮断、DDoS 対策サービス'],
            ['DNS リフレクション', 'オープンリゾルバ、UDP の偽装しやすさ', 'オープンリゾルバの停止、イングレスフィルタリング'],
            ['HTTP フラッド', 'Web アプリの処理負荷', 'WAF、CDN、レート制限'],
          ],
        },
      },
    ],
  });
})();
