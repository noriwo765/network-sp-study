// WAN：IP-VPN（MPLS）のラベルスイッチングと VRF、WAN サービスの比較【本書 Ch.13】
(() => {
  const ip = [['IPv4ヘッダ', [
    ['送信元IP', '10.1.1.10', '本社の PC'],
    ['宛先IP', '10.2.1.20', '支社のサーバ'],
  ]]];
  const label = (name, value, note, s) => [name, [
    ['ラベル値', String(value), note],
    ['TC', '0', '優先度（3ビット）'],
    ['S', String(s), s ? 'ラベルスタックの最後' : '下にまだラベルがある'],
  ]];

  SCENARIOS.push({
    id: 'wan',
    chapter: 13,
    title: 'IP-VPN（MPLS）',
    subtitle: '通信事業者の網の中で、パケットは IP アドレスではなく「ラベル」で運ばれる',
    nodes: {
      hq:  { x: 48,  y: 125, name: '本社', kind: 'pc', lines: ['10.1.0.0/16'] },
      ce1: { x: 170, y: 125, name: 'CE1', kind: 'rt' },
      pe1: { x: 295, y: 125, name: 'PE1', kind: 'rt' },
      p:   { x: 420, y: 125, name: 'P', kind: 'rt' },
      pe2: { x: 545, y: 125, name: 'PE2', kind: 'rt' },
      ce2: { x: 670, y: 125, name: 'CE2', kind: 'rt' },
      br:  { x: 762, y: 125, name: '支社', kind: 'pc', lines: ['10.2.0.0/16'] },
    },
    links: [
      { a: 'hq', b: 'ce1' },
      { a: 'ce1', b: 'pe1' },
      { a: 'pe1', b: 'p', net: '事業者の MPLS 網', ldx: 62, ldy: -32 },
      { a: 'p', b: 'pe2' },
      { a: 'pe2', b: 'ce2' },
      { a: 'ce2', b: 'br' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>本社と支社を、通信事業者の <b>IP-VPN サービス</b>でつなぐ。</p>
          <ul>
            <li><b>CE</b>（Customer Edge）：利用者側のルータ</li>
            <li><b>PE</b>（Provider Edge）：事業者網の入口・出口のルータ</li>
            <li><b>P</b>（Provider）：事業者網の中継ルータ</li>
          </ul>
          <p>事業者網の中は <b>MPLS</b> で、パケットに付けた<b>ラベル</b>を見て転送する。同じ網を多数の企業が共有しても、ラベルと VRF で通信が混ざらない。</p>`,
        links: { 'pe1-p': 'tunnel', 'p-pe2': 'tunnel' },
      },
      {
        title: '① CE1 → PE1',
        focus: 'ce1', pkt: 'ip', noCompare: true,
        desc: `<p>本社の CE1 は、普通の IP パケットを PE1 に送る。CE は MPLS を意識しない。</p>
          <p>CE と PE の間では、<b>BGP やスタティックルート</b>で拠点の経路をやり取りする（事業者が各拠点の経路を他拠点に配る）。</p>`,
        phases: [[['hq', 'ce1']], [['ce1', 'pe1']]],
        frame: ip,
        links: { 'pe1-p': 'tunnel', 'p-pe2': 'tunnel' },
      },
      {
        title: '② PE1 でラベルを付ける',
        focus: 'pe1', pkt: 'esp', label: 'ラベル+IP', frameGroup: 'mpls',
        desc: `<p>PE1 は、どの顧客（VRF）のパケットかを判断し、<b>ラベルを2枚</b>付ける（ラベルスタック）。</p>
          <ul>
            <li><b>内側ラベル（VPN ラベル）</b>：出口の PE2 で「どの顧客の VRF に渡すか」を示す</li>
            <li><b>外側ラベル（転送ラベル）</b>：網の中で PE2 まで運ぶための道しるべ</li>
          </ul>
          <p>MPLS ヘッダ（1枚 4 バイト）は L2 ヘッダと IP ヘッダの<b>間</b>に挟まる（シムヘッダ）。</p>`,
        phases: [[['pe1', 'p']]],
        frame: [
          label('外側ラベル（転送用）', 1001, 'PE2 までの経路', 0),
          label('内側ラベル（VPN用）', 500, '顧客 A の VRF', 1),
          ...ip,
        ],
        links: { 'pe1-p': 'tunnel', 'p-pe2': 'tunnel' },
      },
      {
        title: '③ P でラベルを付け替え',
        focus: 'p', pkt: 'esp', label: 'ラベル+IP', frameGroup: 'mpls',
        desc: `<p>P ルータは<b>外側ラベルだけを見て</b>、ラベル表に従って付け替え（スワップ）て転送する。IP ヘッダは見ない。</p>
          <p>右のフレームでは外側ラベルの値だけが変わっている。ラベルは<b>隣のルータとの間だけで有効</b>な番号なので、区間ごとに値が変わる。</p>
          <p>実際の網では、PE2 の1つ手前で外側ラベルを外してしまう（<b>PHP</b>：ペナルティメイトホップポッピング）ことが多い。</p>`,
        phases: [[['p', 'pe2']]],
        frame: [
          label('外側ラベル（転送用）', 2002, '付け替え後', 0),
          label('内側ラベル（VPN用）', 500, '顧客 A の VRF', 1),
          ...ip,
        ],
        links: { 'pe1-p': 'tunnel', 'p-pe2': 'tunnel' },
        side: {
          title: 'P のラベル転送表',
          head: ['受信ラベル', '送信ラベル', '出力先'],
          rows: [['1001', '2002', 'PE2'], ['1003', '2004', 'PE3']],
          hit: 0,
        },
      },
      {
        title: '④ PE2 → CE2',
        focus: 'pe2', pkt: 'ip', noCompare: true,
        desc: `<p>PE2 はラベルを外し、<b>内側ラベル 500</b> から「顧客 A の VRF」と判断する。顧客 A のルーティングテーブルで 10.2.1.20 を引き、CE2 へ普通の IP パケットとして渡す。</p>`,
        phases: [[['pe2', 'ce2']], [['ce2', 'br']]],
        frame: ip,
        links: { 'pe1-p': 'tunnel', 'p-pe2': 'tunnel' },
      },
      {
        title: '⑤ VRF でアドレス重複OK',
        focus: 'pe2',
        desc: `<p>PE は顧客ごとに独立したルーティングテーブル（<b>VRF</b>）を持つ。顧客 B が顧客 A と<b>同じプライベートアドレス</b>を使っていても、VRF が別なので混ざらない。</p>
          <p>だから利用者は、IP-VPN を使ってもアドレス設計を変える必要がない（インターネットを通らないので、プライベートアドレスのまま拠点間通信できる）。</p>`,
        links: { 'pe1-p': 'tunnel', 'p-pe2': 'tunnel' },
        side: [
          {
            title: 'PE2 の VRF（顧客 A）',
            head: ['宛先', '出力先'],
            rows: [['10.2.0.0/16', 'CE2（顧客 A 支社）'], ['10.1.0.0/16', 'PE1 経由（顧客 A 本社）']],
            hit: 0,
          },
          {
            title: 'PE2 の VRF（顧客 B）',
            head: ['宛先', '出力先'],
            rows: [['10.2.0.0/16', 'CE5（顧客 B 支社）'], ['10.1.0.0/16', 'PE3 経由（顧客 B 本社）']],
          },
        ],
      },
      {
        title: 'まとめ',
        desc: `<p>広域イーサネットは L2 のサービスなので、拠点間のルーティング（OSPF など）を<b>利用者が自由に設計</b>できる。IP-VPN は事業者がルーティングを担うので、利用者の設計は簡単だが自由度は低い。</p>`,
        side: {
          title: 'WAN サービスの比較',
          head: ['', '広域イーサネット', 'IP-VPN', 'インターネット VPN'],
          rows: [
            ['提供する層', 'L2', 'L3', 'L3（インターネット＋IPsec など）'],
            ['拠点間のルーティング', '利用者が設計（OSPF など）', '事業者と BGP / スタティック', '利用者が設計'],
            ['使えるプロトコル', 'IP 以外も可', 'IP のみ', 'IP のみ'],
            ['品質・帯域保証', 'あり', 'あり', 'ベストエフォート'],
            ['コスト', '高い', '中', '安い'],
          ],
        },
      },
    ],
  });
})();
