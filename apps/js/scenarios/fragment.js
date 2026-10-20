// IP フラグメント：1つのデータグラムが分割されるとき、識別子・フラグ・オフセット・全長はどうなるか【本書 Ch.6】【2-4】
(() => {
  const A = '10.0.1.10';
  const B = '10.0.2.20';
  const ID = 0x4d2e;

  // flagsField は IP ヘッダの「フラグ＋フラグメントオフセット」16 ビットそのもの（チェックサム計算用）
  function ip({ len, ttl, mf, off }) {
    const flagsField = (mf ? 0x2000 : 0) | off;
    return {
      title: 'IPv4ヘッダ',
      kind: 'ipv4',
      values: {
        len: String(len),
        id: `0x${ID.toString(16)}`,
        flags: mf ? 'MF' : '0',
        off: off ? `${off}（${off * 8}B目）` : '0',
        ttl: String(ttl),
        proto: '17 (UDP)',
        sum: ipChecksum({ src: A, dst: B, ttl, proto: 17, len, id: ID, flags: flagsField }),
        src: A,
        dst: B,
      },
    };
  }
  const UDP = { title: 'UDPヘッダ', kind: 'udp', values: { sport: '40000', dport: '4000', len: '3008', sum: '0x6d3a' } };

  const frags = (hit) => ({
    title: 'Server B が受け取った断片（識別子 0x4d2e）',
    head: ['断片', '全長', 'データの範囲', 'MF'],
    rows: [
      ['1', '1500', '0〜1479', '1'],
      ['2', '1500', '1480〜2959', '1'],
      ['3', '68', '2960〜3007', '0'],
    ],
    hit,
  });

  SCENARIOS.push({
    id: 'fragment',
    chapter: 6,
    title: 'IPフラグメント',
    subtitle: 'MTU の大きい区間から小さい区間へ。ルータが1つのパケットを3つに分けるとき IP ヘッダはどうなるか',
    nodes: {
      a:  { x: 100, y: 125, name: 'Server A', kind: 'sv', lines: [A] },
      rt: { x: 405, y: 125, name: 'RT', kind: 'rt' },
      b:  { x: 710, y: 125, name: 'Server B', kind: 'sv', lines: [B] },
    },
    links: [
      { a: 'a', b: 'rt', net: 'MTU 9000（ジャンボフレーム）' },
      { a: 'rt', b: 'b', net: 'MTU 1500' },
    ],
    steps: [
      {
        title: 'はじめに',
        desc: `<p>Server A は MTU 9000 のネットワークにいて、UDP で 3000 バイトのデータを Server B に送る。RT の先は MTU 1500 なので、そのままでは通れない。</p>
          <p>このパケットは <b>DF=0</b>（分割してよい）なので、RT が<b>フラグメント（分割）</b>する。分割に使う IP ヘッダのフィールドは4つ。</p>
          <ul>
            <li><b>識別子</b>：同じデータグラムの断片には同じ値を付ける</li>
            <li><b>フラグ</b>：MF（More Fragments）＝後ろにまだ断片がある</li>
            <li><b>フラグメントオフセット</b>：元のデータの何バイト目からか（<b>8 バイト単位</b>）</li>
            <li><b>全長</b>：その断片の長さ</li>
          </ul>`,
      },
      {
        title: '① 元のパケット',
        focus: 'a', pkt: 'ip', label: '3028B', frameGroup: 'frag',
        desc: `<p>Server A が送るパケット。全長 = IP 20 ＋ UDP 8 ＋ データ 3000 = <b>3028</b>。MTU 9000 の区間なのでそのまま送れる。</p>
          <p>フラグは DF も MF も 0、オフセットも 0（分割されていない）。</p>`,
        phases: [[['a', 'rt']]],
        diagram: [ip({ len: 3028, ttl: 64, mf: false, off: 0 }), UDP],
      },
      {
        title: '② 断片1',
        focus: 'rt', pkt: 'ip', label: '断片1', frameGroup: 'frag',
        desc: `<p>RT は IP ヘッダより後ろ（UDP ヘッダ＋データ ＝ 3008 バイト）を分ける。1つに載せられるのは 1500 − 20 = <b>1480 バイト</b>（8 の倍数なのでそのまま使える）。</p>
          <p>断片1：全長 1500、<b>MF=1</b>（続きがある）、オフセット 0。UDP ヘッダは<b>この最初の断片にだけ</b>入っている。</p>
          <p><b>識別子は元のパケットと同じ</b>。TTL は RT で −1、チェックサムは断片ごとに計算し直す。</p>`,
        phases: [[['rt', 'b']]],
        diagram: [ip({ len: 1500, ttl: 63, mf: true, off: 0 }), UDP],
        side: frags(0),
      },
      {
        title: '③ 断片2',
        focus: 'rt', pkt: 'ip', label: '断片2', frameGroup: 'frag',
        desc: `<p>断片2：全長 1500、MF=1、オフセット <b>185</b>（1480 ÷ 8）。元のデータの 1480 バイト目からの続き。</p>
          <p>この断片には <b>UDP ヘッダがない</b>（データの途中なので）。だから FW が「ポート番号で」フィルタしようとしても、2つ目以降の断片では判断できない。</p>
          <p>①②と比べて、<b>識別子は変わらない</b>ことを確認しよう。</p>`,
        phases: [[['rt', 'b']]],
        diagram: [ip({ len: 1500, ttl: 63, mf: true, off: 185 })],
        side: frags(1),
      },
      {
        title: '④ 断片3',
        focus: 'rt', pkt: 'ip', label: '断片3', frameGroup: 'frag',
        desc: `<p>断片3（最後）：残りは 3008 − 1480 − 1480 = 48 バイト。全長 = 20 ＋ 48 = <b>68</b>、オフセット <b>370</b>（2960 ÷ 8）、<b>MF=0</b>（これで最後）。</p>
          <p>最後の断片だけは 8 の倍数でなくてよい。最後以外の断片のデータ長は、オフセットが 8 バイト単位なので<b>必ず 8 の倍数</b>にする。</p>`,
        phases: [[['rt', 'b']]],
        diagram: [ip({ len: 68, ttl: 63, mf: false, off: 370 })],
        side: frags(2),
      },
      {
        title: '⑤ 再組立て',
        focus: 'b',
        desc: `<p>Server B は、<b>送信元・宛先・プロトコル・識別子</b>が同じ断片を集め、オフセットの順に並べて元のデータグラムに戻す。MF=0 の断片で終わりが分かる。</p>
          <ul>
            <li>再組立ては<b>最終的な宛先</b>だけが行う（途中のルータは組み立てない）</li>
            <li><b>1つでも断片が失われると全体が破棄</b>される（一定時間待ってタイムアウト）。UDP では再送もされない</li>
          </ul>`,
        side: frags([0, 1, 2]),
      },
      {
        title: 'まとめ',
        desc: `<p>フラグメントは性能・信頼性・セキュリティの面で不利なので、できるだけ避ける設計が基本。</p>
          <ul>
            <li>TCP は DF=1 と経路MTU探索、MSS の調整で、最初から分割の要らない大きさで送る</li>
            <li><b>IPv6 では途中のルータは分割しない</b>（送信元だけが拡張ヘッダで分割する）</li>
          </ul>
          <p>計算練習は「計算ドリル」のフラグメント計算で。</p>`,
        side: {
          title: '分割に使うフィールド',
          head: ['フィールド', '断片1', '断片2', '断片3'],
          rows: [
            ['全長', '1500', '1500', '68'],
            ['識別子', '0x4d2e', '0x4d2e', '0x4d2e'],
            ['MF', '1', '1', '0'],
            ['オフセット（×8）', '0（0）', '185（1480）', '370（2960）'],
            ['UDP ヘッダ', 'あり', 'なし', 'なし'],
          ],
        },
      },
    ],
  });
})();
