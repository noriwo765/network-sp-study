// SDN（OpenFlow）：コントローラがフローテーブルを書き込み、スイッチはそれに従って転送する【本書 Ch.16】
(() => {
  const flowTable = (rows, hit) => ({
    title: 'OFS1 のフローテーブル',
    head: ['優先度', 'マッチ条件', 'アクション', 'カウンタ'],
    rows: rows.length ? rows : [['0', 'すべて（テーブルミス）', 'コントローラへ送る', '-']],
    hit,
  });
  const MISS = ['0', 'すべて（テーブルミス）', 'コントローラへ送る', '1'];
  const FWD = ['100', '宛先IP 10.0.0.20', 'ポート2へ出力', '1'];
  const FWD2 = ['100', '宛先IP 10.0.0.20', 'ポート2へ出力', '15'];
  const DENY = ['200', '送信元 10.0.0.10 / 宛先 10.0.0.20 / TCP 23', '破棄', '0'];

  SCENARIOS.push({
    id: 'openflow',
    chapter: 16,
    title: 'SDN（OpenFlow）',
    subtitle: '経路を決める頭脳（コントロールプレーン）をスイッチから切り離し、コントローラに集める',
    viewBox: '0 0 810 275',
    nodes: {
      ctrl: { x: 405, y: 45,  name: 'コントローラ', kind: 'sv', lines: [] },
      pca:  { x: 70,  y: 200, name: 'PC-A', kind: 'pc', lines: ['10.0.0.10'] },
      ofs1: { x: 270, y: 200, name: 'OFS1', kind: 'sw', lines: ['OpenFlow スイッチ'] },
      ofs2: { x: 540, y: 200, name: 'OFS2', kind: 'sw', lines: ['OpenFlow スイッチ'] },
      pcb:  { x: 740, y: 200, name: 'PC-B', kind: 'pc', lines: ['10.0.0.20'] },
    },
    links: [
      { a: 'ctrl', b: 'ofs1', net: 'OpenFlow', ldx: -40, ldy: 0 },
      { a: 'ctrl', b: 'ofs2' },
      { a: 'pca', b: 'ofs1', pb: 'p1' },
      { a: 'ofs1', b: 'ofs2', pa: 'p2', pb: 'p1' },
      { a: 'ofs2', b: 'pcb', pa: 'p2' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>従来のスイッチやルータは、1台ごとに「経路を決める（コントロールプレーン）」と「パケットを転送する（データプレーン）」の両方を持っている。</p>
          <p><b>SDN</b> はこれを分離し、<b>コントローラ</b>がネットワーク全体を見て経路やポリシーを決め、スイッチは<b>指示（フローテーブル）どおりに転送するだけ</b>にする。その代表的なプロトコルが <b>OpenFlow</b>。</p>
          <p>はじめ、OFS1 のフローテーブルには「一致するものがなければコントローラに聞け」という<b>テーブルミス</b>のエントリしかない。</p>`,
        side: flowTable([]),
      },
      {
        title: '① Packet-In',
        focus: 'ofs1', pkt: 'ip', noCompare: true,
        desc: `<p>PC-A から PC-B 宛てのパケットが OFS1 に届く。フローテーブルに一致するエントリがない（テーブルミス）ので、OFS1 はパケットを <b>Packet-In</b> メッセージに入れて<b>コントローラに問い合わせる</b>。</p>
          <p>スイッチとコントローラの間は <b>OpenFlow チャネル</b>（TCP 6653、通常 TLS で保護）。</p>`,
        phases: [[['pca', 'ofs1']], [['ofs1', 'ctrl', { label: 'Packet-In', kind: 'ctl' }]]],
        frame: [['OpenFlow', [['メッセージ', 'Packet-In'], ['理由', 'テーブルミス'], ['受信ポート', 'p1'], ['データ', 'PC-A → PC-B のパケット']]]],
        side: flowTable([MISS], 0),
      },
      {
        title: '② Flow-Mod',
        focus: 'ctrl', pkt: 'ctl', label: 'Flow-Mod', noCompare: true,
        desc: `<p>コントローラは全体のトポロジを知っているので、PC-B までの経路（OFS1 → OFS2）を計算し、<b>経路上のすべてのスイッチ</b>に <b>Flow-Mod</b> でフローエントリを書き込む。</p>
          <p>続けて <b>Packet-Out</b> で、待たせていた最初のパケットを送り出させる。</p>`,
        phases: [[['ctrl', 'ofs1'], ['ctrl', 'ofs2']], [['ofs1', 'ofs2', { label: 'IP', kind: 'ip' }]], [['ofs2', 'pcb', { label: 'IP', kind: 'ip' }]]],
        frame: [['OpenFlow', [
          ['メッセージ', 'Flow-Mod（追加）'],
          ['マッチ条件', '宛先IP = 10.0.0.20'],
          ['アクション', 'ポート2へ出力'],
          ['優先度', '100'],
          ['アイドルタイムアウト', '60 秒', '使われなければ自動で削除'],
        ]]],
        side: flowTable([FWD, MISS], 0),
      },
      {
        title: '③ 2つ目以降のパケット',
        focus: ['ofs1', 'ofs2'], pkt: 'ip',
        desc: `<p>以降のパケットはフローテーブルに一致するので、スイッチが<b>コントローラに聞かずに</b>高速に転送する。カウンタが増えていく（コントローラはこれを集めて通信量を把握できる）。</p>
          <p>フローテーブルは MAC アドレス、VLAN、IP アドレス、ポート番号など<b>L2〜L4 の項目を組み合わせて</b>マッチできるので、宛先だけでなく送信元やアプリケーションごとに経路を変えることもできる。</p>`,
        phases: [[['pca', 'ofs1']], [['ofs1', 'ofs2']], [['ofs2', 'pcb']]],
        links: { 'pca-ofs1': 'path', 'ofs1-ofs2': 'path', 'ofs2-pcb': 'path' },
        side: flowTable([FWD2, MISS], 0),
      },
      {
        title: '④ ポリシーの一括変更',
        focus: 'ctrl', pkt: 'ip', label: 'Telnet', noCompare: true,
        desc: `<p>管理者が「PC-A から PC-B への Telnet（TCP 23）を禁止」とコントローラに設定すると、コントローラが該当スイッチに<b>より優先度の高い破棄エントリ</b>を書き込む。</p>
          <p>従来なら1台ずつ ACL を設定していた変更を、<b>コントローラから一括で</b>反映できる。これが SDN の大きな利点。</p>`,
        phases: [[['ctrl', 'ofs1', { label: 'Flow-Mod', kind: 'ctl' }]], [['pca', 'ofs1', { drop: true }]]],
        side: flowTable([DENY, FWD2, MISS], 0),
      },
      {
        title: 'まとめ',
        desc: `<p>コントローラが止まると、新しい通信のフローを作れなくなる（既存のエントリは残る）。コントローラの<b>冗長化</b>が重要。</p>
          <p>データセンターでは、SDN コントローラが <b>VXLAN</b>（Ch.16 の VXLAN シナリオ）などのオーバーレイを自動で設定する使い方も一般的。</p>`,
        side: {
          title: '従来のネットワークと SDN',
          head: ['', '従来', 'SDN（OpenFlow）'],
          rows: [
            ['経路の決定', '各機器が自律的に（OSPF など）', 'コントローラが集中して'],
            ['設定変更', '1台ずつ', 'コントローラから一括'],
            ['転送の判断', 'ルーティングテーブル・MAC テーブル', 'フローテーブル（L2〜L4 の組合せ）'],
            ['単一障害点', 'なし（分散）', 'コントローラ（冗長化が必要）'],
          ],
        },
      },
    ],
  });
})();
