// R5午後Ⅱ問1 マルチクラウド利用による可用性向上：プロキシの二重化、BGP と VRRP のマルチホーム、出口の切替え
(() => {
  const toWan = [[['pc', 'fw']], [['fw', 'sw']], [['sw', 'rt1']], [['rt1', 'pe1']], [['pe1', 'wan']]];
  const toWanB = [[['pc', 'fw']], [['fw', 'sw']], [['sw', 'rt2']], [['rt2', 'pe2']], [['pe2', 'wan']]];

  const dnsTable = (hit) => ({
    title: 'proxy の A レコードの持ち方',
    head: ['方式', '平常時', 'X の異常時'],
    rows: [
      ['待機型', 'X だけ', 'Y へ書き換える'],
      ['両用型', 'X と Y の2本', 'X の行を消す'],
    ],
    hit,
    foot: 'X＝10.81.1.50 / Y＝10.82.1.50',
  });

  SCENARIOS.push({
    id: 'r5_pm2_q1',
    title: 'マルチクラウドと回線の二重化',
    subtitle: 'プロキシ、本社の回線、インターネットの出口を順に冗長化し、落とし穴を追う',
    viewBox: '0 0 900 370',
    nodes: {
      proxya: { x: 60,  y: 150, name: '旧プロキシ', kind: 'sv', lines: ['10.80.0.50'], linesAbove: true },
      pc:     { x: 60,  y: 320, name: '社内PC', kind: 'pc', lines: ['監視サーバも同じ側'] },
      oldrt:  { x: 190, y: 100, name: '旧出口RT', kind: 'rt' },
      fw:     { x: 190, y: 235, name: '本社FW', kind: 'fw' },
      sw:     { x: 320, y: 235, name: 'L2SW', kind: 'sw' },
      rt1:    { x: 450, y: 170, name: 'RT1', kind: 'rt', lines: ['既設'], linesAbove: true },
      rt2:    { x: 450, y: 300, name: 'RT2', kind: 'rt', lines: ['増設'] },
      pe1:    { x: 590, y: 170, name: 'PE1', kind: 'rt' },
      pe2:    { x: 590, y: 300, name: 'PE2', kind: 'rt', lines: ['増設'] },
      wan:    { x: 720, y: 235, name: '閉域網', kind: 'cloud' },
      fwn:    { x: 720, y: 120, name: '網内FW', kind: 'fw' },
      net:    { x: 620, y: 40,  name: 'インターネット', kind: 'cloud' },
      saas:   { x: 810, y: 40,  name: 'SaaS', kind: 'sv' },
      prxx:   { x: 850, y: 170, name: 'プロキシX', kind: 'sv', lines: ['クラウド1社目'] },
      prxy:   { x: 850, y: 300, name: 'プロキシY', kind: 'sv', lines: ['クラウド2社目'] },
    },
    links: [
      { a: 'proxya', b: 'fw' },
      { a: 'pc', b: 'fw' },
      { a: 'oldrt', b: 'fw' },
      { a: 'oldrt', b: 'net' },
      { a: 'fw', b: 'sw' },
      { a: 'sw', b: 'rt1' },
      { a: 'sw', b: 'rt2' },
      { a: 'rt1', b: 'pe1' },
      { a: 'rt2', b: 'pe2' },
      { a: 'pe1', b: 'wan' },
      { a: 'pe2', b: 'wan' },
      { a: 'wan', b: 'fwn' },
      { a: 'fwn', b: 'net' },
      { a: 'net', b: 'saas' },
      { a: 'wan', b: 'prxx' },
      { a: 'wan', b: 'prxy' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>ある開発会社は、利用中のクラウドの大規模障害で業務が止まった。そこで次の3点をまとめて冗長化する。</p>
          <ol>
            <li>クラウドを<b>2社</b>にし、プロキシも両方に置く。</li>
            <li>本社と閉域網の間を<b>2回線</b>にする（マルチホーム）。</li>
            <li>インターネットの出口を<b>本社から閉域網の中へ</b>移す。</li>
          </ol>
          <p>答案で問われるのは、切替えの<b>順序と、切り替えた瞬間に何が起きるか</b>。</p>`,
        focus: ['prxx', 'prxy'],
        side: {
          title: '冗長化する場所',
          head: ['場所', '現在', '変更後'],
          rows: [
            ['クラウド', '1社', '2社'],
            ['本社の回線', '1本', '2本（BGP＋VRRP）'],
            ['インターネットの出口', '本社の FW', '網内 FW'],
          ],
        },
      },
      {
        title: '① プロキシを2台で使う',
        focus: 'wan',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>1つの名前 proxy に X と Y の A レコードを並べると、答えが入れ替わって接続先が分かれる。これが <b>DNS ラウンドロビン</b>。</p>
          <p>待機型より両用型を選ぶのは、<b>負荷を分けられ、予備を遊ばせずに済む</b>から。ただし DNS はサーバの生死を見ないので、落ちた機器のアドレスも返し続ける。</p>`,
        phases: [...toWan, [['wan', 'prxx'], ['wan', 'prxy']]],
        frame: [
          ['DNS の回答（例）', [
            ['proxy.corp.example', '10.81.1.50', 'プロキシX'],
            ['proxy.corp.example', '10.82.1.50', 'プロキシY'],
          ]],
        ],
        side: dnsTable(1),
      },
      {
        title: '② ping は通るのに使えない',
        focus: 'prxx',
        pkt: 'ip',
        label: 'ping',
        desc: `<p>プロキシのプログラムだけが止まった場面。OS は動いているので <b>ping には応答が返る</b>が、プロキシのポートへの TCP 接続は失敗する。</p>
          <p>ping だけの監視では、<b>アプリケーションプロセスの停止を検知できない</b>。そこで待受ポートへの TCP 接続を確かめる監視を加える。</p>`,
        phases: [...toWan, [['wan', 'prxx']], [['prxx', 'wan', { label: 'ping応答' }]], [['wan', 'prxx', { label: 'TCP接続', drop: true }]]],
        badges: { prxx: 'プロセス停止' },
        side: {
          title: '監視方式と検知',
          head: ['方式', 'OS 停止', 'プロセス停止'],
          rows: [
            ['ping', '検知', '検知できない'],
            ['TCP 接続', '検知', '検知'],
          ],
          hit: 1,
        },
      },
      {
        title: '③ 切替えを速くする',
        focus: 'prxy',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>異常を検知したら、ゾーンを書き換えて Y へ寄せる。待機型なら proxy を <b>Y のアドレスへ変更</b>する。</p>
          <p>書き換えても古い回答が残っていると移らない。そこで平常時から TTL を小さくし、<b>キャッシュ DNS サーバが保持する時間を短く</b>しておく。</p>
          <p>自動で切り替えるには<b>プロキシ自動設定（PAC）</b>も併用する。ただし<b>対応した PC やサーバでしか使えない</b>ので、DNS の切替えも残す。</p>`,
        phases: [...toWan, [['wan', 'prxy']]],
        nodes: { prxx: 'down' },
        links: { 'wan-prxx': 'down' },
        badges: { prxx: '異常', prxy: '利用中' },
        side: dnsTable(0),
      },
      {
        title: '④ 増設した機器を ping で試す',
        focus: 'rt2',
        pkt: 'ip',
        label: 'ping',
        desc: `<p>次は本社の回線。RT2、PE2、その間の回線を増設し、経路制御を入れる前に試験する。</p>
          <p>確かめるのは<b>パケットロスが発生しないこと</b>。組合せは増設した線の両側で、<b>RT2 と本社 FW（または RT1）</b>、<b>RT2 と PE2</b>。</p>`,
        phases: [[['rt2', 'sw'], ['rt2', 'pe2']], [['sw', 'fw']]],
        badges: { rt2: '試験中', pe2: '試験中' },
      },
      {
        title: '⑤ BGP で経路を受け取る',
        focus: ['rt1', 'rt2'],
        pkt: 'ctl',
        label: 'UPDATE',
        desc: `<p>BGP は <b>AS の間</b>で経路を交換し、相手は<b>ピア</b>と呼ぶ。経路の増減を運ぶのが <b>UPDATE</b>、接続の維持に定期的に交わすのが <b>KEEPALIVE</b>。KEEPALIVE が一定時間届かなければ、<b>接続を切り、その経路を消す</b>。</p>
          <p>RT1 と RT2 は L2SW 越しに iBGP を結ぶ。<b>next-hop-self</b> により、広告するネクストホップは<b>自身のアドレス</b>になる。</p>
          <p>平常時の回線は <b>LOCAL_PREF の大きい</b>経路として選ばれ、選ばれた1本が<b>ルーティングテーブル</b>へ入る。</p>`,
        phases: [[['pe1', 'rt1'], ['pe2', 'rt2']], [['rt1', 'sw']], [['sw', 'rt2']]],
        frame: [
          ['BGP UPDATE（RT1 から RT2 へ。値は例）', [
            ['TCP 宛先ポート', '179', 'BGP'],
            ['NEXT_HOP', '10.80.9.1', 'RT1 自身のアドレス'],
            ['LOCAL_PREF', '200', 'iBGP の中で伝わる優先度'],
          ]],
        ],
        side: {
          title: 'RT2 の BGP テーブル（値は例）',
          head: ['受け取り元', 'LOCAL_PREF', '選択'],
          rows: [
            ['RT1（iBGP）', '200', '○'],
            ['PE2（eBGP）', '100', '—'],
          ],
          hit: 0,
          foot: '候補はすべて持ち、最適な1本だけを転送に使う',
        },
      },
      {
        title: '⑥ 静的経路の削除と導入の順序',
        focus: 'rt2',
        pkt: 'ip',
        label: 'データ',
        desc: `<p>BGP が張れても、同じ宛先の静的経路があるうちは使われない。<b>静的経路の方が優先される</b>ため。確認の後に消すと、BGP の経路が有効になる。</p>
          <p>VRRP はその後に入れる。先に入れると、RT2 がマスタになったとき<b>経路情報を持たないので受け取ったパケットを転送できない</b>（図の破棄）。</p>`,
        phases: [[['fw', 'sw']], [['sw', 'rt2', { drop: true }]]],
        badges: { rt2: '経路なしでMaster' },
        side: {
          title: '正しい導入の順序',
          head: ['順', '作業'],
          rows: [
            ['1', '機器を増設して ping で試験'],
            ['2', 'BGP を確立して経路を確認'],
            ['3', '不要な静的経路を削除'],
            ['4', 'VRRP を構成'],
            ['5', 'FW の次の宛先を仮想 IP へ変更'],
          ],
          hit: 3,
        },
      },
      {
        title: '⑦ 障害試験',
        focus: 'rt2',
        pkt: 'ip',
        label: 'データ',
        desc: `<p>完成後に、冗長化した部分を1か所ずつ止めて確かめる。PE は事業者が試験済みなので対象外。</p>
          <p>想定箇所は<b>ルータ2台</b>、<b>外側の回線2本</b>、<b>L2SW 側の線2本</b>の計6か所。図は RT1 本体の障害で、VRRP のマスタが RT2 へ移り、通信が RT2 と PE2 を通る場面。</p>`,
        phases: [...toWanB, [['wan', 'prxx']]],
        nodes: { rt1: 'down' },
        links: { 'sw-rt1': 'down', 'rt1-pe1': 'down', 'sw-rt2': 'path', 'rt2-pe2': 'path', 'pe2-wan': 'path' },
        badges: { rt1: '障害', rt2: 'Master' },
        side: {
          title: '障害試験の6か所',
          head: ['箇所', '確かめること'],
          rows: [
            ['RT1 本体', 'RT2 と PE2 へ切り替わる'],
            ['RT2 本体', '平常の通信が続く'],
            ['RT1–PE1 の回線', '迂回して PE2 へ抜ける'],
            ['RT2–PE2 の回線', '平常の通信が続く'],
            ['RT1–L2SW の線', 'RT2 がマスタになる'],
            ['RT2–L2SW の線', '平常の通信が続く'],
          ],
          hit: 0,
        },
      },
      {
        title: '⑧ 出口の切替えとループ',
        focus: ['fw', 'wan'],
        pkt: 'ip',
        label: 'Web',
        desc: `<p>出口を網内 FW へ移す。閉域網のデフォルト経路がまだ本社を向いているのに、本社 FW の設定だけ先に変えると、互いに相手へ投げ合う<b>ルーティングのループ</b>が起きる。</p>
          <p>パケットは往復を続け、TTL が尽きて捨てられる。だから<b>両方の変更を同じタイミングで</b>行う。「つながらない」は症状で、書くべきは原因のループ。</p>`,
        phases: [[['fw', 'sw']], [['sw', 'rt1']], [['rt1', 'pe1']], [['pe1', 'wan']], [['wan', 'pe1']], [['pe1', 'rt1']], [['rt1', 'sw']], [['sw', 'fw', { drop: true, label: '往復' }]]],
        links: { 'fw-sw': 'hit', 'sw-rt1': 'hit', 'rt1-pe1': 'hit', 'pe1-wan': 'hit' },
        side: {
          title: 'デフォルト経路の向き',
          head: ['機器', '向き', '状態'],
          rows: [
            ['本社 FW', '閉域網へ', '変更済み'],
            ['閉域網', '本社へ', '変更前'],
          ],
          foot: '正しくは、閉域網は網内 FW へ向ける',
        },
      },
      {
        title: '⑨ 送信元 IP の問題と当面の対策',
        focus: ['fw', 'saas'],
        pkt: 'ip',
        label: '旧経路',
        desc: `<p>出口が変わると<b>送信元 IP アドレスが変わる</b>ので、IP で接続元を制限している SaaS は拒否する（図の2本目）。</p>
          <p>当面の対策は本社 FW の<b>ポリシーベースルーティング</b>。<b>送信元が旧プロキシ、宛先がインターネットならネクストホップを旧出口 RT</b> にする。</p>
          <p>恒久対策は、利用部門に<b>SaaS 側のアクセス制限の設定変更</b>を依頼すること。利用がなくなったのを確認して、旧プロキシを廃止する。</p>`,
        phases: [
          [['proxya', 'fw']], [['fw', 'oldrt']], [['oldrt', 'net']], [['net', 'saas', { label: '許可' }]],
          [['prxx', 'wan', { label: '新経路' }]], [['wan', 'fwn', { label: '新経路' }]], [['fwn', 'net', { label: '新経路' }]], [['net', 'saas', { label: '拒否', drop: true }]],
        ],
        frame: [
          ['SaaS から見た送信元（値は例）', [
            ['旧経路', '203.0.113.10', '本社 FW の NAPT。許可リストにある'],
            ['新経路', '198.51.100.20', '網内 FW の NAPT。許可リストにない'],
          ]],
        ],
        side: {
          title: '本社 FW のルール',
          head: ['条件', 'ネクストホップ'],
          rows: [
            ['送信元＝旧プロキシ、宛先＝インターネット', '旧出口 RT'],
            ['上記以外のインターネット宛て', 'RT1 と RT2 の仮想 IP'],
          ],
          hit: 0,
        },
      },
    ],
  });
})();
