// R7午後Ⅱ問1 社内ネットワークのIPv6対応：SLAAC・DNS・経路制御・セキュリティを1本の通信で追う
(() => {
  const PC_LLA = 'fe80::1a2b:3c4d:5e6f:7081';
  const PC_GUA = '2001:db8:4b00:c:1a2b:3c4d:5e6f:7081';
  const SAAS = '2001:db8:77:1::a';

  const v6 = (src, dst, nh, note) => ['IPv6ヘッダ', [
    ['送信元', src],
    ['宛先', dst, note],
    ['次ヘッダ', nh],
  ]];
  const icmp6 = (type, ...rest) => ['ICMPv6', [['タイプ', type], ...rest]];

  const routes = hit => ({
    title: 'IPv6 の経路（抜粋）',
    head: ['機器', '宛先', 'ネクストホップ', '出口'],
    rows: [
      ['境界RT', '::/0', 'fe80::a1', 'b1'],
      ['境界RT', '2001:db8:4b00::/48', 'なし', 'Null'],
      ['境界RT', '…:c::/64', 'fe80::f1', 'b2'],
      ['FW', '::/0', 'fe80::b2', 'f1'],
      ['FW', '…:c::/64', 'fe80::c1', 'f2'],
      ['L3SW', '::/0', 'fe80::f2', 'l1'],
    ],
    hit,
    foot: 'ネクストホップは隣の機器のリンクローカル、出口は自分のインタフェース。Null は廃棄用。',
  });

  const pathOut = { 'acc-l3': 'path', 'l3-wan': 'path', 'wan-fw': 'path', 'fw-br': 'path', 'br-isp': 'path', 'isp-saas': 'path' };

  SCENARIOS.push({
    id: 'r7_pm2_q1',
    title: '社内ネットワークの IPv6 対応',
    subtitle: 'PC がアドレスを得て SaaS へ通信するまでと、IPv6 ならではの設計上の注意点を追う',
    viewBox: '0 0 900 360',
    nodes: {
      pc1:  { x: 60,  y: 90,  name: 'PC1', kind: 'pc' },
      pc2:  { x: 60,  y: 240, name: 'PC2', kind: 'pc' },
      acc:  { x: 165, y: 165, name: 'L2SW', kind: 'sw' },
      l3:   { x: 275, y: 165, name: 'L3SW', kind: 'sw' },
      wan:  { x: 400, y: 165, name: '広域イーサ', kind: 'cloud' },
      fw:   { x: 525, y: 165, name: 'FW', kind: 'fw' },
      br:   { x: 660, y: 165, name: '境界RT', kind: 'rt' },
      isp:  { x: 795, y: 165, name: 'ISP-RT', kind: 'rt' },
      saas: { x: 795, y: 55,  name: 'SaaS', kind: 'sv', lines: ['インターネット側'] },
      dcsw: { x: 525, y: 265, name: 'DC-SW', kind: 'sw' },
      dns:  { x: 400, y: 295, name: 'DNS', kind: 'sv', lines: ['キャッシュ', 'IPv4のみ'] },
      mon:  { x: 660, y: 295, name: '監視サーバ', kind: 'sv' },
    },
    links: [
      { a: 'pc1', b: 'acc' },
      { a: 'pc2', b: 'acc' },
      { a: 'acc', b: 'l3', pb: 'l2' },
      { a: 'l3', b: 'wan', pa: 'l1' },
      { a: 'wan', b: 'fw', pb: 'f2' },
      { a: 'fw', b: 'br', pa: 'f1', pb: 'b2' },
      { a: 'br', b: 'isp', pa: 'b1', pb: 'w1' },
      { a: 'isp', b: 'saas' },
      { a: 'fw', b: 'dcsw' },
      { a: 'dcsw', b: 'dns' },
      { a: 'dcsw', b: 'mon' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>この会社は IPv4 だけの社内網を <b>IPv4 と IPv6 のデュアルスタック</b>へ広げる。SaaS やサイトの一部がまだ IPv6 に未対応なので、IPv4 の接続も残す。</p>
          <p>ISP から <b>2001:db8:4b00::/48</b> を受け、/64 に分けて使う。IPv6 アドレスは 128 ビットで、<b>16 ビット</b>ずつコロンで区切る。</p>
          <p>右の表のとおり、ISP-RT から FW までの4つのインタフェースには GUA を付けない。<b>インターネットからこれらの機器へアクセスさせない</b>ためで、理由はセキュリティ。</p>`,
        badges: { br: 'NAPT は IPv4 のみ' },
        side: {
          title: 'インタフェースのアドレス',
          head: ['IF', '機器', 'リンクローカル', 'GUA'],
          rows: [
            ['w1', 'ISP-RT', 'fe80::a1', 'なし'],
            ['b1', '境界RT', 'fe80::b1', 'なし'],
            ['b2', '境界RT', 'fe80::b2', 'なし'],
            ['f1', 'FW', 'fe80::f1', 'なし'],
            ['f2', 'FW', 'fe80::f2', '…:b::1/64'],
            ['l1', 'L3SW', 'fe80::c1', '…:b::2/64'],
            ['l2', 'L3SW', 'fe80::c2', '…:c::1/64'],
          ],
          foot: '「…」は 2001:db8:4b00 の略。',
        },
      },
      {
        title: '① 重複の確認（DAD）',
        focus: 'pc1',
        pkt: 'ctl',
        label: 'NS',
        desc: `<p>PC1 は起動すると、乱数の識別子で<b>リンクローカルアドレス</b>を作る。これが有効なのは<b>データリンク層で届く範囲</b>で、ルータは越えない。</p>
          <p>まだ仮の状態なので、NS を要請ノードマルチキャスト宛てに送り、NA が返らないことを見る。目的は<b>同じリンクに同じアドレスの機器がいないことの確認</b>。</p>
          <p>宛先は下位24ビットで決まり、値が合わない PC2 と L3SW は捨てる。返事がなければ正式なアドレスとし、全ノード宛ての NA で知らせる。</p>
          <p>IPv4 では ARP が<b>ブロードキャスト</b>で全員へ尋ねていた。IPv6 はマルチキャストで対象を絞っている。</p>`,
        phases: [[['pc1', 'acc']], [['acc', 'pc2', { drop: true }], ['acc', 'l3', { drop: true }]]],
        frameGroup: 'nd',
        frame: [
          v6('::', 'ff02::1:ff6f:7081', '58（ICMPv6）', '要請ノードマルチキャスト'),
          icmp6('135（NS）', ['ターゲット', PC_LLA, '確かめたい仮のアドレス']),
        ],
        badges: { pc1: '仮のLLA' },
      },
      {
        title: '② RS と RA でアドレスを作る',
        focus: ['pc1', 'l3'],
        pkt: 'ctl',
        label: 'RS',
        desc: `<p>PC1 が全ルータ宛てに RS を送ると、L3SW は <b>RS に RA で応答</b>する。RA にはプレフィックスと、デフォルトルータを決める情報が入っている。</p>
          <p>PC1 は <b>RA のプレフィックス（上位64ビット）＋自分の識別子（下位64ビット）</b>で仮の GUA を作り、同じ確認をしてから確定する。RA の送信元である L3SW のリンクローカルは<b>デフォルトルータ</b>になる。</p>
          <p>乱数の識別子は追跡されにくいが、裏返すと<b>管理者にとっても PC を特定しにくくなる</b>。</p>`,
        phases: [
          [['pc1', 'acc']],
          [['acc', 'l3'], ['acc', 'pc2', { drop: true }]],
          [['l3', 'acc', { label: 'RA' }]],
          [['acc', 'pc1', { label: 'RA' }]],
        ],
        frameGroup: 'nd',
        frame: [
          v6('fe80::c2', PC_LLA, '58（ICMPv6）', 'RA。PC1 のリンクローカル宛て'),
          icmp6('134（RA）', ['プレフィックス', '2001:db8:4b00:c::/64'], ['送信元の意味', 'この L3SW が出口になる']),
        ],
        side: {
          title: 'PC1 が設定したもの',
          head: ['項目', '値'],
          rows: [
            ['リンクローカル', PC_LLA],
            ['GUA', `${PC_GUA}/64`],
            ['デフォルトルータ', 'fe80::c2（RA の送信元）'],
          ],
        },
        badges: { pc1: 'GUA 確定' },
      },
      {
        title: '③ 名前解決は IPv4 のままでよい',
        focus: ['pc1', 'dns'],
        pkt: 'ip',
        label: 'AAAA・A',
        desc: `<p>PC1 は AAAA と A の両方を尋ねる。DNS サーバ側を IPv6 に対応させなくても、<b>IPv4 のまま AAAA の答えを運べる</b>。両方そろえば PC は IPv6 を優先する。</p>
          <p>応答が大きくても EDNS で調整した上限までは UDP で返す。上限を超えるか、相手が EDNS 非対応で512バイトを超えるときは <b>TCP</b> を使う。</p>
          <p>応答の読み方が要点。CNAME の先の AAAA が<b>接続先</b>で、AUTHORITY の NS の右側が<b>権威 DNS</b>。ADDITIONAL の A は権威 DNS 自身の住所なので接続先と混同しない。</p>`,
        phases: [
          [['pc1', 'acc']], [['acc', 'l3']], [['l3', 'wan']], [['wan', 'fw']], [['fw', 'dcsw']], [['dcsw', 'dns']],
        ],
        frameGroup: 'dns',
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '10.20.1.10'], ['宛先IP', '10.30.0.53', 'キャッシュ DNS']]],
          ['UDP', [['宛先ポート', '53']]],
          ['DNS', [['質問', 'portal.example.org. の AAAA'], ['追加', 'OPT（EDNS のサイズ通知）']]],
        ],
        side: {
          title: 'AAAA の応答（例）',
          head: ['欄', '名前', '種類', '値'],
          rows: [
            ['ANSWER', 'portal.example.org.', 'CNAME', 'edge6.example.net.'],
            ['ANSWER', 'edge6.example.net.', 'AAAA', '2001:db8:77:1::a'],
            ['ANSWER', 'edge6.example.net.', 'AAAA', '2001:db8:77:1::b'],
            ['AUTHORITY', 'example.net.', 'NS', 'dns-a.example.net.'],
            ['AUTHORITY', 'example.net.', 'NS', 'dns-b.example.net.'],
            ['ADDITIONAL', 'dns-a.example.net.', 'A', '192.0.2.81'],
            ['ADDITIONAL', 'dns-b.example.net.', 'A', '192.0.2.82'],
          ],
          hit: [1, 2, 3, 4],
        },
      },
      {
        title: '④ 経路表をたどって SaaS へ',
        focus: 'pc1',
        pkt: 'ip',
        label: 'IPv6',
        desc: `<p>FW・境界RT・L3SW は <b>OSPFv3</b> で経路を交換し、境界RTは既定経路を配っている。表の見方は機械的でよい。</p>
          <p><b>ネクストホップ＝次の機器のリンクローカル、出口＝自分のインタフェース</b>。たとえば FW の拠点 LAN 宛ては、相手 L3SW の fe80::c1 へ、自分の f2 から出す。</p>
          <p>L3SW の既定経路は、相手の FW の f2 側 fe80::f2 を指す。同じ区間の両端を取り違えやすい。</p>`,
        phases: [
          [['pc1', 'acc']], [['acc', 'l3']], [['l3', 'wan']], [['wan', 'fw']], [['fw', 'br']], [['br', 'isp']], [['isp', 'saas']],
        ],
        frameGroup: 'data',
        frame: [v6(PC_GUA, SAAS, '6（TCP）', 'SaaS の AAAA')],
        links: pathOut,
        side: routes([0, 3, 5]),
      },
      {
        title: '⑤ IPv6 だけが落ちると気付けない',
        focus: ['br', 'pc1'],
        pkt: 'ip',
        label: 'IPv6',
        desc: `<p>IPv6 側だけが不通になった場面。PC1 の IPv6 通信は届かないが、ブラウザや OS によっては <b>IPv4 に切り替わり（フォールバック）、同じページがそのまま開く</b>。</p>
          <p>使えてしまうので<b>利用者は異常に気付かず、連絡も来ない</b>。答案は「IPv4 で同じページが見えるから」まで書く。</p>`,
        phases: [
          [['fw', 'br']],
          [['br', 'isp', { drop: true }]],
          [['fw', 'br', { label: 'IPv4' }]],
          [['br', 'isp', { label: 'NAPT 後' }]],
          [['isp', 'saas', { label: 'IPv4' }]],
        ],
        frameGroup: 'data',
        frame: [
          ['IPv4ヘッダ', [['送信元IP', '192.0.2.40', '境界RT の NAPT で変換後'], ['宛先IP', '198.51.100.70', 'SaaS の A レコード']]],
        ],
        badges: { br: 'IPv6 不通', pc1: 'IPv4 で表示' },
      },
      {
        title: '⑥ 監視と traceroute6',
        focus: 'mon',
        pkt: 'ip',
        label: 'ping6',
        desc: `<p>人の連絡に頼れないので、DC の監視サーバから<b>インターネット</b>と<b>各拠点 L3SW の GUA</b> へ ping6 を送って監視する。</p>
          <p>FW と L3SW の間には PC もサーバもなく、OSPFv3 はリンクローカルで動くので、GUA は本来なくてもよい。それでも固定で付けるのは、<b>traceroute6 で調べたときに各機器を見分けやすくなる</b>から。</p>`,
        phases: [
          [['mon', 'dcsw']],
          [['dcsw', 'fw']],
          [['fw', 'wan'], ['fw', 'br']],
          [['wan', 'l3'], ['br', 'isp']],
          [['isp', 'saas']],
        ],
        frameGroup: 'data',
        frame: [
          v6('2001:db8:4b00:a::50', '2001:db8:4b00:b::2', '58（ICMPv6）', 'L3SW の固定 GUA'),
          icmp6('128（エコー要求）'),
        ],
        badges: { mon: '定期監視' },
      },
      {
        title: '⑦ Null 経路がないとループする',
        focus: ['isp', 'br'],
        pkt: 'ip',
        label: 'HL=4',
        desc: `<p>/48 のうち<b>使っていないアドレス</b>宛てのパケットが外から届いた場面。ISP-RT は /48 全体を境界RTへ送る。</p>
          <p>境界RTに当てはまるのは既定経路だけなので ISP-RT へ戻す。ISP-RT はまた境界RTへ返す。<b>2台で相互に転送し合い、ホップリミットが0になると廃棄</b>される。</p>
          <p>回線の帯域をその間ずっと無駄に使う。図のホップリミットは説明のため小さな値にしている。</p>`,
        phases: [
          [['saas', 'isp']],
          [['isp', 'br', { label: 'HL=3' }]],
          [['br', 'isp', { label: 'HL=2' }]],
          [['isp', 'br', { label: 'HL=1→0', drop: true }]],
        ],
        frameGroup: 'loop',
        frame: [v6('外部のホスト', '2001:db8:4b00:f0::1', '6（TCP）', '割り当てていないサブネット')],
        links: { 'br-isp': 'hit' },
        badges: { br: 'Null 経路なし' },
        side: {
          title: '境界RTの判断',
          head: ['宛先', '一致', '結果'],
          rows: [['::/0', '○', 'ISP-RT へ戻す'], ['…:c::/64', '×', '—']],
          hit: 0,
        },
      },
      {
        title: '⑧ Null 経路とロンゲストマッチ',
        focus: 'br',
        pkt: 'ip',
        label: '未使用宛て',
        desc: `<p>境界RTに <b>/48 宛ての Null 経路</b>を足すと、未使用アドレス宛ては境界RTで捨てて終わる。</p>
          <p>既定経路 /0 にも一致するのに Null が選ばれるのは<b>ロンゲストマッチ</b>で、プレフィックスの長い /48 が勝つから。</p>
          <p>使用中のサブネットは /64 の経路がさらに長く一致するので、正規の通信が Null に落ちることはない。</p>`,
        phases: [
          [['saas', 'isp']],
          [['isp', 'br', { drop: true }]],
        ],
        frameGroup: 'loop',
        frame: [v6('外部のホスト', '2001:db8:4b00:f0::1', '6（TCP）', '割り当てていないサブネット')],
        nodes: { br: 'done' },
        badges: { br: 'Null で廃棄' },
        side: {
          title: '境界RTの判断（宛先ごと）',
          head: ['宛先', '最長一致', '結果'],
          rows: [
            ['…:f0::1（未使用）', '/48', 'Null で廃棄'],
            ['…:c:: 配下（拠点 LAN）', '/64', 'FW へ転送'],
            ['インターネット', '/0', 'ISP-RT へ'],
          ],
          hit: 0,
        },
      },
      {
        title: '⑨ FW と ICMPv6',
        focus: ['fw', 'pc1'],
        pkt: 'ip',
        label: '大きなパケット',
        desc: `<p>IPv4 では <b>NAPT</b> と FW が内部を守っていた。IPv6 では NAPT を使わないので <b>FW のアクセス制御を慎重に設計</b>する。外側の機器に GUA を付けないのも同じ狙い。</p>
          <p>ただし外からの通信を全部止めるのは誤り。経路の途中でパケットが大きすぎると、その機器は発信元へ ICMPv6 タイプ2（Packet Too Big）を返す。IPv6 では途中でフラグメント化しないためで、これを繰り返す <b>PMTUD</b> で発信元は<b>通信経路で最小の MTU</b> を知る。</p>
          <p>FW でこれを拒否すると、小さなパケットだけ通って大きなものが止まる障害になる。</p>`,
        phases: [
          [['fw', 'br']], [['br', 'isp', { drop: true }]],
          [['isp', 'br', { label: 'タイプ2', kind: 'ctl' }]],
          [['br', 'fw', { label: 'タイプ2', kind: 'ctl' }]],
          [['fw', 'wan', { label: 'FW を通す', kind: 'ctl' }]],
          [['wan', 'l3', { label: 'タイプ2', kind: 'ctl' }]],
          [['l3', 'acc', { label: 'タイプ2', kind: 'ctl' }]],
          [['acc', 'pc1', { label: 'タイプ2', kind: 'ctl' }]],
        ],
        frameGroup: 'ptb',
        frame: [
          v6('ISP-RT の外側の GUA', PC_GUA, '58（ICMPv6）', '発信元の PC1 へ返す'),
          icmp6('2（Packet Too Big）', ['通知内容', '次のリンクの MTU']),
        ],
        badges: { isp: 'MTU 超過', fw: 'タイプ2 許可' },
      },
    ],
  });
})();
