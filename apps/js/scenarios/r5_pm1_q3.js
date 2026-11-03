// R5午後Ⅰ問3 高速無線LANの導入：Wi-Fi 6 の帯と DFS、通信量の見積もり、スタックと LAG、保守時のループ
(() => {
  // 本来はつながっていない、誤接続の説明用のリンク
  const off = { 'floor-floor2': 'down' };

  const bandTable = hit => ({
    title: '周波数帯の使い分け',
    head: ['帯', 'レーダー', '使い方の例'],
    rows: [
      ['W52/W53', 'W53 は注意', 'ノート PC（半数）'],
      ['W56', '注意', 'ノート PC（半数）'],
      ['2.4GHz', 'なし', '予備・IoT 機器'],
    ],
    hit,
  });
  const trafficTable = (rows, hit, foot) => ({
    title: '通信量の見積もり',
    head: ['区間・範囲', '計算', '結果'],
    rows,
    hit,
    foot,
  });

  SCENARIOS.push({
    id: 'r5_pm1_q3',
    title: '高速無線 LAN の設計',
    subtitle: 'Wi-Fi 6 の帯域とレーダー、通信量の見積もりから基幹の冗長化、保守時のループまでを追う',
    viewBox: '0 0 900 340',
    nodes: {
      video:  { x: 70,  y: 60,  name: '動画サーバ', kind: 'sv' },
      dhcp:   { x: 70,  y: 180, name: 'DHCP', kind: 'sv' },
      srv1:   { x: 230, y: 60,  name: 'サーバSW1', kind: 'sw' },
      srv2:   { x: 230, y: 180, name: 'サーバSW2', kind: 'sw' },
      wlc:    { x: 230, y: 290, name: 'WLC', kind: 'sv', lines: ['AP の監視'] },
      core1:  { x: 400, y: 60,  name: '基幹L3 1', kind: 'sw' },
      core2:  { x: 400, y: 180, name: '基幹L3 2', kind: 'sw' },
      floor:  { x: 590, y: 90,  name: 'フロアSW', kind: 'sw' },
      floor2: { x: 590, y: 230, name: 'フロアSW', kind: 'sw', lines: ['別の階'] },
      ap1:    { x: 730, y: 50,  name: 'AP 1', kind: 'rt' },
      ap2:    { x: 730, y: 130, name: 'AP 2', kind: 'rt' },
      pc1:    { x: 860, y: 50,  name: '教室1 PC', kind: 'pc' },
      pc2:    { x: 860, y: 130, name: '教室2 PC', kind: 'pc' },
    },
    links: [
      { a: 'video', b: 'srv1' },
      { a: 'video', b: 'srv2' },
      { a: 'dhcp', b: 'srv1' },
      { a: 'srv2', b: 'wlc' },
      { a: 'srv1', b: 'core1' },
      { a: 'srv1', b: 'core2' },
      { a: 'srv2', b: 'core1' },
      { a: 'srv2', b: 'core2' },
      { a: 'core1', b: 'core2' },
      { a: 'core1', b: 'floor' },
      { a: 'core2', b: 'floor' },
      { a: 'core1', b: 'floor2' },
      { a: 'core2', b: 'floor2' },
      { a: 'floor', b: 'floor2', net: '普段は未接続', ldx: 55, ldy: 4 },
      { a: 'floor', b: 'ap1' },
      { a: 'floor', b: 'ap2' },
      { a: 'ap1', b: 'pc1' },
      { a: 'ap2', b: 'pc2' },
      { a: 'ap2', b: 'pc1' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>新しい校舎の LAN を提案する。<b>4 階建て、各階 4 教室で計 16 教室</b>。各教室に AP を1台置き、1教室 <b>60 台</b>のノート PC で 4K 動画を同時に再生できることが条件。</p>
          <p>Wi-Fi 4・5・6 の端末が混在し、AP には同じ階のフロアスイッチから PoE で給電する。図はその一部で、動画はマシン室の動画サーバから配る。</p>`,
        links: off,
        focus: ['ap1', 'ap2'],
        badges: { video: '動画の発信元', pc1: '60 台', pc2: '60 台' },
      },
      {
        title: '① Wi-Fi 6 で端末を分散',
        focus: 'ap1',
        pkt: 'ip',
        label: 'Wi-Fi 6',
        desc: `<p>AP は 5GHz 帯を <b>W52/W53</b> と <b>W56</b> に分け、2.4GHz 帯と合わせて3帯を同時に使う<b>トライバンド</b>。利点は<b>より多くの端末が安定して通信できる</b>こと。</p>
          <p>速度を上げるには、20MHz 幅を束ねる<b>チャネルボンディング</b>、複数の<b>アンテナ</b>で空間的に分ける MU-MIMO を使う。安全面では、WPA3 の SAE が<b>パスワード</b>への辞書攻撃に強い。</p>`,
        phases: [[['ap1', 'pc1']]],
        links: off,
        badges: { ap1: 'トライバンド' },
        side: bandTable(),
      },
      {
        title: '② レーダーを検知すると',
        focus: 'ap1',
        desc: `<p><b>W53 と W56</b> はレーダーと干渉する可能性がある。AP がレーダーを検知すると DFS が働き、<b>そのチャネルの電波を止め、別のチャネルへ移って再開</b>する。</p>
          <p>端末側の影響は、<b>接続断や通信断が不定期に起きる</b>こと。いつ検知するかは予測できないので「不定期」と書く。</p>`,
        links: { ...off, 'ap1-pc1': 'down' },
        badges: { ap1: 'チャネル移動中', pc1: '通信断' },
        side: bandTable([0, 1]),
      },
      {
        title: '③ 1教室の通信量を見積もる',
        focus: 'floor',
        pkt: 'ip',
        label: '動画',
        desc: `<p>動画は 1 時間 5.4G バイト。<b>×8 でビット、÷3600 で秒</b>に直すと 1台 12 Mbps。60 台で <b>720 Mbps</b>。1Gbps の接続に収まる。</p>
          <p>WLC は認証や監視を担当し、認証後の通信は <b>WLC を通らない</b>モードなので、動画はサーバからフロアスイッチへ直接流れる。</p>`,
        phases: [[['video', 'srv1']], [['srv1', 'core1']], [['core1', 'floor']], [['floor', 'ap1']], [['ap1', 'pc1']]],
        links: { ...off, 'video-srv1': 'path', 'srv1-core1': 'path', 'core1-floor': 'path', 'floor-ap1': 'hit', 'ap1-pc1': 'path' },
        side: trafficTable([
          ['PC 1 台', '5.4G×8÷3600', '12 Mbps'],
          ['AP 1 台（60 台）', '12 × 60', '720 Mbps'],
        ], 1, 'オーバーヘッドは考えない'),
      },
      {
        title: '④ AP が故障すると',
        focus: 'ap2',
        pkt: 'ip',
        label: '動画',
        desc: `<p>AP 1 が壊れると、教室 1 の PC は隣の AP 2 へつながることがある。AP 2 の接続には <b>720 × 2 ＝ 1440 Mbps</b> が流れ、1Gbps を超える。</p>
          <p>そこで <b>マルチギガビットイーサネット</b>（2.5G または 5G の BASE-T）を考える。将来に備えるなら 10GBASE-T。給電は 802.3at では足りない恐れがあり、<b>PoE++</b>（802.3bt）を選ぶ。</p>`,
        phases: [[['core1', 'floor']], [['floor', 'ap2']], [['ap2', 'pc1'], ['ap2', 'pc2']]],
        links: { ...off, 'floor-ap1': 'down', 'ap1-pc1': 'down', 'floor-ap2': 'hit' },
        nodes: { ap1: 'down' },
        badges: { ap1: '故障', ap2: '1440 Mbps' },
        side: trafficTable([
          ['AP 1 台（通常）', '12 × 60', '720 Mbps'],
          ['AP 1 台（故障時）', '12 × 120', '1440 Mbps'],
        ], 1, '1Gbps の接続ではあふれる'),
      },
      {
        title: '⑤ STP と VRRP の懸念',
        focus: ['srv1', 'core1'],
        pkt: 'ip',
        label: '動画',
        desc: `<p>最初の案は、L2 が STP、L3 が VRRP。STP は冗長なリンクを<b>止めて待機</b>させ、VRRP も片方の機器に通信を寄せる。</p>
          <p>全教室の動画が集まる<b>基幹とサーバ用スイッチの間</b>で 720 Mbps × 16 教室 ＝ <b>11.52 Gbps</b>。使えるリンクが偏ると 10GbE を超えかねない。平準化しようとすると設計も複雑になる。</p>`,
        phases: [[['video', 'srv1']], [['srv1', 'core1']], [['core1', 'floor']]],
        links: { ...off, 'srv1-core1': 'hit', 'srv1-core2': 'blocked', 'srv2-core2': 'blocked', 'core2-floor': 'blocked', 'core2-floor2': 'blocked' },
        badges: { core1: 'VRRP マスタ', core2: 'バックアップ' },
        side: trafficTable([
          ['基幹〜サーバ間', '720 × 16', '11.52 Gbps'],
          ['フロアの上り', '720 × 4', '2.88 Gbps'],
        ], 0, '10GbE の1本で足りないのは基幹〜サーバ間'),
      },
      {
        title: '⑥ スタックと LAG で全部使う',
        focus: ['srv1', 'srv2', 'core1', 'core2'],
        pkt: 'ip',
        label: '動画',
        desc: `<p>2 台ずつを<b>スタック接続</b>して論理的に 1 台にまとめ、機器をまたいでリンクアグリゲーションを張る。</p>
          <p>解決する理由は、<b>平常時にリンク本数分の帯域を同時に使える</b>から。STP の止まるリンクがなくなる。1 台が壊れても残りのリンクで通信を続けられる。</p>`,
        phases: [
          [['video', 'srv1'], ['video', 'srv2']],
          [['srv1', 'core1'], ['srv1', 'core2'], ['srv2', 'core1'], ['srv2', 'core2']],
          [['core1', 'floor'], ['core2', 'floor']],
        ],
        links: { ...off, 'srv1-core1': 'path', 'srv1-core2': 'path', 'srv2-core1': 'path', 'srv2-core2': 'path', 'core1-floor': 'path', 'core2-floor': 'path' },
        badges: { core1: 'スタック', core2: 'スタック', srv1: 'スタック', srv2: 'スタック' },
        side: {
          title: '基幹〜サーバ間で同時に使える帯域',
          head: ['案', '同時に使えるリンク', '帯域'],
          rows: [
            ['STP＋VRRP', '止まるリンクがある', '全部は使えない'],
            ['スタック＋LAG', '4 本すべて', '40 Gbps'],
          ],
          hit: 1,
          foot: '図の 4 本がすべて 10GbE の場合',
        },
      },
      {
        title: '⑦ DHCP はリレーで届ける',
        focus: 'core1',
        pkt: 'ctl',
        label: 'DISCOVER',
        desc: `<p>DHCP サーバはマシン室の別セグメントにある。端末の最初の DISCOVER はブロードキャストなので、ルータを越えられない。</p>
          <p>そこで基幹 L3 スイッチに <b>DHCP リレーエージェント</b>を設定する。受け取った要求をサーバ宛てのユニキャストに直し、端末側のセグメントを示す giaddr を入れて転送する。</p>`,
        phases: [
          [['pc1', 'ap1']],
          [['ap1', 'floor']],
          [['floor', 'core1']],
          [['core1', 'srv1', { label: 'リレー' }]],
          [['srv1', 'dhcp', { label: 'リレー' }]],
        ],
        links: off,
        frame: [
          ['端末 → 基幹 L3（中継前）', [
            ['送信元IP', '0.0.0.0', 'まだアドレスがない'],
            ['宛先IP', '255.255.255.255', 'ブロードキャスト'],
          ]],
          ['基幹 L3 → DHCP サーバ（中継後）', [
            ['送信元IP', '10.80.10.1', '基幹 L3 のアドレス'],
            ['宛先IP', '10.80.200.10', 'DHCP サーバ'],
            ['giaddr', '10.80.10.1', '端末側のセグメントを示す'],
          ]],
        ],
        badges: { core1: 'リレー' },
      },
      {
        title: '⑧ 職員の保守でループが起きると',
        focus: ['floor', 'floor2'],
        pkt: 'arp',
        label: 'ブロードキャスト',
        desc: `<p>基幹・サーバ用スイッチや FW などの保守は業者の担当だが、<b>AP・フロアスイッチ・動画サーバ</b>は学校の職員が交換や設定の復旧を行う。</p>
          <p>職員が<b>ループになる誤った接続や設定</b>をすると、ブロードキャストが回り続けて止まらない。この案は STP でリンクを止める設計ではないので、対策を別に用意する必要がある。</p>`,
        phases: [
          [['floor', 'floor2']],
          [['floor2', 'core1']],
          [['core1', 'floor']],
          [['floor', 'floor2']],
          [['floor2', 'core1']],
          [['core1', 'floor']],
        ],
        links: { 'floor-floor2': 'hit', 'core1-floor2': 'hit', 'core1-floor': 'hit' },
        badges: { floor: '誤接続', floor2: '誤接続', core1: '負荷が急増' },
        side: {
          title: '保守の担当',
          head: ['機器', '担当'],
          rows: [
            ['基幹・サーバ用 SW', '業者'],
            ['DHCP・認証・FW', '業者'],
            ['AP・フロア SW', '職員'],
            ['動画サーバ', '職員'],
          ],
          hit: [2, 3],
        },
      },
      {
        title: '⑨ ループ検知で止める',
        focus: ['floor', 'floor2'],
        pkt: 'ctl',
        label: '検知',
        desc: `<p>全スイッチで<b>ループ検知機能</b>を使うよう検討する。一般的には、検査用のフレームを送り、それが自分へ戻ってきたらループと判断して、該当するポートを止める。</p>
          <p>誤接続があっても広がる前に止まる。職員が自分で保守する前提なので、予備機や手順書とあわせて、<b>ミスが起きたときの備え</b>を設計に入れておく。</p>`,
        phases: [[['floor', 'floor2']], [['floor2', 'core1']], [['core1', 'floor']]],
        links: { 'floor-floor2': 'blocked' },
        badges: { floor: 'ポート停止' },
      },
    ],
  });
})();
