// R6午後Ⅰ問3 ローカルブレイクアウト：IP-IP over IPsec の VPN、PAC による出口の振分け、WPAD の危険
(() => {
  const pac = hit => ({
    title: 'PAC の判定（上から順に見る）',
    head: ['条件', '戻り値'],
    rows: [
      ['社内ドメイン、またはプライベートIP', 'DIRECT'],
      ['SaaS のドメイン', 'PROXY 支社の UTM'],
      ['それ以外', 'PROXY 本社'],
    ],
    hit,
  });
  const ipFrame = (dst, note) => [['IPv4ヘッダ', [['送信元IP', '10.70.1.15', '支社PC'], ['宛先IP', dst, note]]]];

  SCENARIOS.push({
    id: 'r6_pm1_q3',
    title: 'ローカルブレイクアウト',
    subtitle: 'VPN の仕組みから、SaaS 宛てだけを支社から直接出すまでを追う',
    viewBox: '0 0 900 360',
    nodes: {
      px:    { x: 70,  y: 90,  name: 'プロキシ', kind: 'sv', lines: ['本社 172.20.0.5'] },
      web:   { x: 70,  y: 250, name: '社内Web', kind: 'sv', lines: ['172.20.0.10'] },
      uh:    { x: 240, y: 170, name: '本社UTM', kind: 'fw', lines: ['198.51.100.10'] },
      site:  { x: 250, y: 45,  name: '一般サイト', kind: 'sv' },
      inet:  { x: 450, y: 70,  name: 'インターネット', kind: 'cloud' },
      saas:  { x: 650, y: 45,  name: 'SaaS', kind: 'sv' },
      ub:    { x: 610, y: 210, name: '支社UTM', kind: 'fw', lines: ['198.51.100.20'] },
      sw:    { x: 730, y: 210, name: 'L2SW', kind: 'sw' },
      pc:    { x: 850, y: 130, name: '支社PC', kind: 'pc', lines: ['10.70.1.15'] },
      rogue: { x: 850, y: 300, name: '偽サーバ', kind: 'sv' },
    },
    links: [
      { a: 'px', b: 'uh' },
      { a: 'web', b: 'uh' },
      { a: 'uh', b: 'inet' },
      { a: 'uh', b: 'ub', net: 'IPsec トンネル', ldy: 22 },
      { a: 'site', b: 'inet' },
      { a: 'saas', b: 'inet' },
      { a: 'ub', b: 'inet' },
      { a: 'ub', b: 'sw' },
      { a: 'sw', b: 'pc' },
      { a: 'sw', b: 'rogue' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>出版社の本社と4つの支社を IPsec VPN で結び、Web の通信はすべて本社のプロキシに集めてログを取っている。</p>
          <p>SaaS の利用が増えて本社の負荷が重いため、<b>SaaS 宛てだけを支社から直接インターネットへ出す</b>（ローカルブレイクアウト）を考える。</p>
          <p>追う順番は <b>VPN の仕組み → 問題 → PAC で出口を分ける → 自動検出の危険</b>。図では支社を1つに絞る。</p>`,
        links: { 'uh-ub': 'tunnel' },
        badges: { uh: 'ハブ', ub: 'スポーク' },
      },
      {
        title: '① VPN の形と鍵',
        focus: ['uh', 'ub'],
        pkt: 'esp',
        label: 'ESP',
        desc: `<p>本社を中心に支社が1本ずつつながる<b>ハブアンドスポーク型</b>。両端の UTM はあらかじめ<b>事前共有鍵</b>を持ち合う。</p>
          <p>鍵はペアごとに別の値にする。効果は、<b>鍵が漏れたときの影響範囲を小さくできる</b>こと。</p>
          <p>パケットは IP-IP で包んでから、<b>トランスポートモード</b>の ESP で暗号化している。</p>`,
        phases: [[['pc', 'sw', { label: 'IP', kind: 'ip' }]], [['sw', 'ub', { label: 'IP', kind: 'ip' }]], [['ub', 'uh']], [['uh', 'px', { label: 'IP', kind: 'ip' }]]],
        frame: [
          ['IP-IP のヘッダ', [['送信元IP', '198.51.100.20', '支社UTM'], ['宛先IP', '198.51.100.10', '本社UTM'], ['プロトコル', '50', 'ESP']], 'plain'],
          ['ESP ヘッダ', [['SPI', '相手が SA を見分ける値']], 'auth'],
          ['元のIPパケット', [['送信元IP', '10.70.1.15'], ['宛先IP', '172.20.0.5', '本社プロキシ']], 'enc'],
          ['ESP トレーラ', [['次ヘッダ', '4', 'IP-IP']], 'enc'],
        ],
        links: { 'uh-ub': 'tunnel' },
        badges: { uh: 'ハブ', ub: 'スポーク' },
      },
      {
        title: '② トンネルモードなら範囲はどこまで',
        focus: ['uh', 'ub'],
        pkt: 'esp',
        label: 'ESP',
        desc: `<p>同じパケットをトンネルモードにすると、ESP の前に<b>新しい外側ヘッダ</b>が付き、IP-IP で包んだパケット全体が中身になる。</p>
          <p>暗号化の範囲は <b>IP-IP のヘッダ、元のIPパケット、ESP トレーラ</b>。<b>ESP ヘッダは暗号化されない</b>。相手が SPI を読んで SA を見分けるのに使うから。認証データも範囲外。</p>`,
        phases: [[['ub', 'uh']]],
        frame: [
          ['新しい外側ヘッダ', [['プロトコル', '50', 'ESP']], 'plain'],
          ['ESP ヘッダ', [['SPI', '相手が SA を見分ける値']], 'auth'],
          ['IP-IP のヘッダ', [['プロトコル', '4', 'IP-IP']], 'enc'],
          ['元のIPパケット', [['宛先IP', '172.20.0.5']], 'enc'],
          ['ESP トレーラ', [['次ヘッダ', '4', 'IP-IP']], 'enc'],
        ],
        links: { 'uh-ub': 'tunnel' },
        side: {
          title: '暗号化の範囲',
          head: ['部分', 'トランスポート', 'トンネル'],
          rows: [
            ['外側に新しく付くヘッダ', '—', '範囲外'],
            ['IP-IP のヘッダ', '範囲外', '暗号化'],
            ['ESP ヘッダ', '範囲外', '範囲外'],
            ['元のIPパケット', '暗号化', '暗号化'],
            ['ESP トレーラ', '暗号化', '暗号化'],
            ['ESP 認証データ', '範囲外', '範囲外'],
          ],
          hit: 1,
        },
      },
      {
        title: '③ トンネルの設定：アドレスと分割',
        focus: 'ub',
        pkt: 'esp',
        label: '分割',
        desc: `<p><b>IP Unnumbered</b> は、トンネルのインタフェースには <b>IP アドレスを割り当てずに動かす</b>設定。</p>
          <p>トンネルでヘッダが増えるぶん、大きいパケットは UTM で分割することになり、<b>転送の負荷が増える</b>。そこで、例えば TCP の MSS を調整し、はじめから分割の要らない大きさで送らせる。</p>`,
        phases: [[['sw', 'ub', { label: '大きいTCP', kind: 'ip' }]], [['ub', 'uh']]],
        links: { 'uh-ub': 'tunnel' },
        badges: { ub: '分割で負荷増' },
        side: {
          title: 'トンネルの2つの設定',
          head: ['設定', '内容'],
          rows: [
            ['IP Unnumbered', 'インタフェースのアドレスなしで動かす'],
            ['分割の防止', 'UTM の転送負荷の増大を避ける'],
          ],
        },
      },
      {
        title: '④ 問題：SaaS も全部本社を通る',
        focus: 'px',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>今は SaaS 宛ても、VPN で本社へ運び、プロキシを通してから外へ出す。</p>
          <p>VPN の回線、本社 UTM、プロキシの全部に負荷がかかる。SaaS の通信は HTTPS で相手も決まっているので、<b>ここだけ本社を通さない</b>ことを考える。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'ub']], [['ub', 'uh', { kind: 'esp', label: 'ESP' }]], [['uh', 'px']], [['px', 'uh']], [['uh', 'inet']], [['inet', 'saas']]],
        frame: ipFrame('172.20.0.5', '本社プロキシ宛て'),
        links: { 'uh-ub': 'tunnel', 'uh-px': 'hit' },
        badges: { px: '負荷大', uh: '負荷大' },
      },
      {
        title: '⑤ SaaS 宛てだけ支社の UTM から出す',
        focus: 'ub',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>支社の UTM にプロキシ機能を追加する。SaaS 宛てだけ、PC に<b>支社の UTM をプロキシとして指定</b>させ、直接インターネットへ出す。</p>
          <p>どの通信をどのプロキシへ送るかは <b>PAC ファイル</b>で PC に判断させる。</p>`,
        phases: [[['pc', 'sw', { label: 'CONNECT' }]], [['sw', 'ub', { label: 'CONNECT' }]], [['ub', 'inet']], [['inet', 'saas']]],
        frame: [['PC から UTM へ', [
          ['メソッド', 'CONNECT', 'HTTPS をプロキシ越しに通す'],
          ['接続先', 'files.docs-saas.example:443'],
          ['プロキシ', 'gw.kobe.ed-corp.example:3128', '神戸支社の UTM'],
        ]]],
        links: { 'ub-sw': 'path', 'ub-inet': 'path', 'saas-inet': 'path' },
        badges: { ub: '出口' },
        side: pac(1),
      },
      {
        title: '⑥ その他のサイトは本社プロキシへ',
        focus: 'px',
        pkt: 'ip',
        label: 'HTTPS',
        desc: `<p>一般のサイトは相手を特定できないので、ログを取るため<b>これまでどおり本社のプロキシ</b>を使う。</p>
          <p>PAC は上から順に見て、社内宛てでも SaaS でもなければ最後の行に落ちる。判定に URL のパスは関係ない。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'ub']], [['ub', 'uh', { kind: 'esp', label: 'ESP' }]], [['uh', 'px']], [['px', 'uh']], [['uh', 'inet']], [['inet', 'site']]],
        frame: ipFrame('172.20.0.5', '本社プロキシ宛て'),
        links: { 'uh-ub': 'tunnel' },
        badges: { px: 'ログ取得' },
        side: pac(2),
      },
      {
        title: '⑦ 社内宛ては DIRECT',
        focus: 'web',
        pkt: 'ip',
        label: 'HTTP',
        desc: `<p>DMZ の社内 Web はプライベートアドレスなので <b>DIRECT</b>。<b>プロキシは利用しない</b>。VPN で直接届く。</p>
          <p>効果は<b>本社のプロキシサーバの負荷軽減</b>。</p>
          <p>172.16.0.0 とマスク 255.240.0.0 の範囲は <b>172.16.0.0 〜 172.31.255.255</b>。/12 なので第2オクテットは 16〜31。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'ub']], [['ub', 'uh', { kind: 'esp', label: 'ESP' }]], [['uh', 'web']]],
        frame: ipFrame('172.20.0.10', 'プロキシを通さず直接'),
        links: { 'uh-ub': 'tunnel', 'uh-web': 'path' },
        side: pac(0),
      },
      {
        title: '⑧ PAC は支社ごとに作る',
        focus: 'ub',
        desc: `<p>本社プロキシの指定は共通だが、SaaS 宛ては<b>自分の支社の UTM</b> を指定する必要がある。</p>
          <p>そのため <b>UTM プロキシの FQDN が支社ごとに異なる</b>ことが、PAC を支社ごとに用意する理由になる。</p>`,
        badges: { ub: 'FQDN は支社別' },
        side: {
          title: 'SaaS 宛てに指定するプロキシ',
          head: ['支社', 'UTM プロキシの FQDN'],
          rows: [
            ['神戸', 'gw.kobe.ed-corp.example'],
            ['金沢', 'gw.kanazawa.ed-corp.example'],
            ['広島', 'gw.hiroshima.ed-corp.example'],
          ],
          hit: 0,
        },
      },
      {
        title: '⑨ WPAD の危険と URL の直接設定',
        focus: ['pc', 'rogue'],
        pkt: 'arp',
        label: '探索',
        desc: `<p><b>WPAD</b> は <b>DHCP や DNS</b> で PAC の場所を教わり、<b>HTTP</b> で取得する。有効にするだけなので手軽。</p>
          <p>しかし偽の DHCP や DNS がいると偽の PAC を読まされ、<b>PC の通信が不正なプロキシサーバに中継される</b>。</p>
          <p>そのため自動検出は無効にし、PC には <b>PAC の URL</b> を直接設定する。</p>`,
        phases: [
          [['pc', 'sw']],
          [['sw', 'rogue']],
          [['rogue', 'sw', { label: '偽のPAC' }]],
          [['sw', 'pc', { label: '偽のPAC' }]],
          [['pc', 'sw', { label: 'Web通信', kind: 'ip' }]],
          [['sw', 'rogue', { label: 'Web通信', kind: 'ip' }]],
        ],
        links: { 'sw-rogue': 'hit' },
        badges: { rogue: '不正プロキシ' },
        side: {
          title: 'WPAD の手順',
          head: ['段階', '使うもの'],
          rows: [
            ['PAC の場所を知る', 'DHCP・DNS'],
            ['PAC を取得する', 'HTTP'],
            ['対策：自動検出を無効にして設定', 'PAC の URL'],
          ],
          hit: 2,
        },
      },
    ],
  });
})();
