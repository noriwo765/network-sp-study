// ARP スプーフィング：偽の ARP 応答による中間者攻撃と、その対策【本書 Ch.3】
(() => {
  const MAC = {
    pc:  ['02:00:00:00:00:0a', 'PC'],
    rt:  ['02:00:00:00:00:01', 'RT'],
    atk: ['02:00:00:00:00:66', '攻撃者'],
  };
  const arpTable = (mac, who, hit) => ({
    title: 'PC の ARP テーブル（arp -a）',
    head: ['IP アドレス', 'MAC アドレス', '実際の機器'],
    rows: [['192.168.1.1', mac, who]],
    hit,
  });

  SCENARIOS.push({
    id: 'arp-spoof',
    chapter: 3,
    title: 'ARPスプーフィング',
    subtitle: '偽の ARP 応答で通信を横取りする攻撃。なぜ成立し、どう防ぐか',
    viewBox: '0 0 810 275',
    nodes: {
      pc:  { x: 70,  y: 70,  name: 'PC', kind: 'pc', lines: ['192.168.1.10', '…:00:0a'] },
      atk: { x: 70,  y: 210, name: '攻撃者', kind: 'pc', lines: ['192.168.1.66', '…:00:66'] },
      sw:  { x: 280, y: 140, name: 'SW', kind: 'sw' },
      rt:  { x: 500, y: 140, name: 'RT', kind: 'rt', lines: ['192.168.1.1', '…:00:01'] },
      net: { x: 710, y: 140, name: 'インターネット', kind: 'cloud' },
    },
    links: [
      { a: 'pc', b: 'sw' },
      { a: 'atk', b: 'sw' },
      { a: 'sw', b: 'rt' },
      { a: 'rt', b: 'net' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>ARP は「この IP アドレスの MAC アドレスは何？」を調べるプロトコル。ただし<b>応答が本物かどうかを確認する仕組みがない</b>。</p>
          <p>同じ LAN にいる攻撃者は、偽の ARP 応答を送るだけで、PC の通信を自分に向けさせられる（<b>ARP スプーフィング</b>、ARP ポイズニング）。</p>`,
        side: arpTable(MAC.rt[0], 'RT'),
      },
      {
        title: '① 正常な状態',
        focus: 'pc', pkt: 'ip', frameGroup: 'data',
        desc: `<p>PC の ARP テーブルには、デフォルトゲートウェイ 192.168.1.1 = <b>RT の MAC</b> が正しく登録されている。</p>
          <p>インターネット宛ての通信は、宛先 MAC = RT で送られる。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'rt']], [['rt', 'net']]],
        frame: [
          ['Ethernetヘッダ', [['宛先MAC', ...MAC.rt], ['送信元MAC', ...MAC.pc]]],
          ['IPv4ヘッダ', [['送信元IP', '192.168.1.10'], ['宛先IP', '198.51.100.10', 'インターネット上のサーバ']]],
        ],
        side: arpTable(MAC.rt[0], 'RT'),
      },
      {
        title: '② 偽の ARP 応答',
        focus: 'atk', pkt: 'arp', label: '偽ARP応答', noCompare: true,
        desc: `<p>攻撃者は「<b>192.168.1.1 の MAC は 02:00:00:00:00:66（自分）</b>」という ARP 応答を PC に送りつける。PC は要求していないが、ARP は<b>届いた応答で自分のテーブルを上書きしてしまう</b>実装が多い。</p>
          <p>キャッシュが元に戻らないよう、攻撃者は数秒おきに送り続ける。RT にも「192.168.1.10 の MAC は自分」と送れば、戻りの通信も横取りできる。</p>`,
        phases: [[['atk', 'sw']], [['sw', 'pc']]],
        frame: [
          ['Ethernetヘッダ', [['宛先MAC', ...MAC.pc], ['送信元MAC', ...MAC.atk], ['タイプ', '0x0806', 'ARP']]],
          ['ARP', [
            ['オペレーション', '2', '応答'],
            ['送信元MAC', ...MAC.atk],
            ['送信元IP', '192.168.1.1', '<b>RT になりすまし</b>'],
            ['目標MAC', ...MAC.pc],
            ['目標IP', '192.168.1.10'],
          ]],
        ],
        side: arpTable(MAC.atk[0], '<b>攻撃者</b>（上書きされた）', 0),
      },
      {
        title: '③ 通信の横取り',
        focus: 'atk', pkt: 'ip', frameGroup: 'data',
        desc: `<p>PC はいつもどおりインターネットに通信しているつもりだが、宛先 MAC が攻撃者になっているので、SW はフレームを<b>攻撃者のポートへ</b>転送する。</p>
          <p>攻撃者は中身を見たり書き換えたりしてから RT に転送する（<b>中間者攻撃</b>、MITM）。通信は正常に続くので、利用者は気づきにくい。</p>
          <p>右のフレームは①と比べて<b>宛先 MAC だけ</b>が変わっている。IP アドレスは同じ。</p>`,
        phases: [[['pc', 'sw']], [['sw', 'atk']], [['atk', 'sw']], [['sw', 'rt']], [['rt', 'net']]],
        frame: [
          ['Ethernetヘッダ', [['宛先MAC', ...MAC.atk], ['送信元MAC', ...MAC.pc]]],
          ['IPv4ヘッダ', [['送信元IP', '192.168.1.10'], ['宛先IP', '198.51.100.10', 'インターネット上のサーバ']]],
        ],
        links: { 'pc-sw': 'hit', 'atk-sw': 'hit' },
        side: arpTable(MAC.atk[0], '<b>攻撃者</b>', 0),
      },
      {
        title: '④ 対策：DAI',
        focus: 'sw', pkt: 'arp', label: '偽ARP応答', noCompare: true,
        desc: `<p><b>DAI（Dynamic ARP Inspection）</b>：スイッチが ARP パケットの中身を検査し、正しい対応表と合わない ARP を<b>破棄</b>する。</p>
          <p>正しい対応表は <b>DHCP スヌーピング</b>で作る。DHCP で割り当てたときの「ポート・MAC・IP」の組を記録しておき、それと矛盾する ARP（攻撃者のポートから送信元 IP = 192.168.1.1）を偽物と判断する。</p>`,
        phases: [[['atk', 'sw', { drop: true }]]],
        side: [
          {
            title: 'SW の DHCP スヌーピングバインディング',
            head: ['ポート', 'MAC', 'IP'],
            rows: [['p1', '…:00:0a', '192.168.1.10'], ['p2', '…:00:66', '192.168.1.66'], ['p3（RT）', '信頼ポート', '-']],
            hit: 1,
          },
          arpTable(MAC.rt[0], 'RT（守られた）'),
        ],
      },
      {
        title: 'まとめ',
        desc: `<p>ARP スプーフィングは<b>同じセグメント（ブロードキャストドメイン）の中</b>でしか成立しない。外部からの攻撃ではなく、内部の不正端末やマルウェア感染端末が脅威になる。</p>
          <p>暗号化（HTTPS、VPN）していれば、通信を横取りされても<b>中身は読まれない</b>。ただし証明書の警告を無視すると偽サーバに誘導される。</p>`,
        side: {
          title: '主な対策',
          head: ['対策', '内容'],
          rows: [
            ['DAI + DHCP スヌーピング', 'スイッチで偽 ARP を破棄する'],
            ['静的 ARP エントリ', '重要な機器（ゲートウェイ）の MAC を固定登録。運用負荷が高い'],
            ['ARP 監視（arpwatch など）', 'IP と MAC の対応の変化を検知して通知'],
            ['802.1X / ポートセキュリティ', '不正な端末をそもそも LAN につながせない'],
            ['通信の暗号化', '横取りされても内容を守る'],
          ],
        },
      },
    ],
  });
})();
