// 各ドリルの定義（問題生成・正解・解説）

const DRILLS = [];

// ---- サブネット計算 ----------------------------------------------------
DRILLS.push({
  id: 'subnet',
  title: 'サブネット計算',
  desc: 'IPアドレス/プレフィックス長から、マスク・ネットワークアドレス・ブロードキャストアドレス・ホスト数を求める。【2-6】',
  newProblem() {
    const prefix = rand(17, 30);
    const [a, b] = randomPrivatePrefix();
    const ip = IP.toInt(`${a}.${b}.${rand(0, 255)}.${rand(1, 254)}`);
    const net = IP.network(ip, prefix);
    const bc = IP.broadcast(ip, prefix);
    const mask = IP.mask(prefix);
    const hosts = 2 ** (32 - prefix) - 2;

    // ブロックサイズを考える「注目オクテット」
    const idx = prefix % 8 === 0 ? prefix / 8 - 1 : Math.floor(prefix / 8);
    const maskOctet = (mask >>> (24 - idx * 8)) & 255;
    const ipOctet = (ip >>> (24 - idx * 8)) & 255;
    const block = 256 - maskOctet;
    const start = Math.floor(ipOctet / block) * block;

    return {
      question: `<p class="big">${IP.toStr(ip)}/${prefix}</p>`,
      fields: [
        { label: 'サブネットマスク', answer: IP.toStr(mask), type: 'ip', placeholder: '255.255.255.0' },
        { label: 'ネットワークアドレス', answer: IP.toStr(net), type: 'ip' },
        { label: 'ブロードキャストアドレス', answer: IP.toStr(bc), type: 'ip' },
        { label: '割り当て可能なホスト数', answer: hosts, type: 'num' },
      ],
      explain: `
        <ul>
          <li>/${prefix} → マスク <b>${IP.toStr(mask)}</b></li>
          <li>第${idx + 1}オクテットのブロックサイズ：256 − ${maskOctet} = <b>${block}</b></li>
          <li>${ipOctet} は <b>${start}〜${start + block - 1}</b> の範囲 → 先頭がネットワーク、末尾がブロードキャスト</li>
          <li>ホスト数：2<sup>${32 - prefix}</sup> − 2 = <b>${hosts}</b></li>
        </ul>`,
    };
  },
});

// ---- ロンゲストマッチ --------------------------------------------------
DRILLS.push({
  id: 'longest-match',
  title: 'ロンゲストマッチ',
  desc: 'ルーティングテーブルから、宛先IPアドレスの転送先（ネクストホップ）を選ぶ。【4-1】',
  newProblem() {
    const a = rand(1, 254);
    const b = rand(0, 254);
    const b2 = b + 1;
    const s = rand(0, 3) * 64;
    const routes = [
      { net: '0.0.0.0', prefix: 0 },
      { net: '10.0.0.0', prefix: 8 },
      { net: `10.${a}.0.0`, prefix: 16 },
      { net: `10.${a}.${b}.0`, prefix: 24 },
      { net: `10.${a}.${b2}.0`, prefix: 24 },
      { net: `10.${a}.${b}.${s}`, prefix: 26 },
    ];
    const hops = shuffle(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
    routes.forEach((r, i) => { r.nh = hops[i]; });

    // どの経路に当たる宛先かを先に決めてから生成する
    const outside = () => pick([...Array(256).keys()].filter(x => x < s || x > s + 63));
    const dstStr = pick([
      () => `10.${a}.${b}.${s + rand(1, 62)}`,
      () => `10.${a}.${b}.${outside()}`,
      () => `10.${a}.${b2}.${rand(1, 254)}`,
      () => `10.${a}.${pick([...Array(256).keys()].filter(x => x !== b && x !== b2))}.${rand(1, 254)}`,
      () => `10.${pick([...Array(256).keys()].filter(x => x !== a))}.${rand(0, 255)}.${rand(1, 254)}`,
      () => `${pick([172, 192, 8])}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`,
    ])();
    const dst = IP.toInt(dstStr);

    const matches = routes.filter(r => IP.network(dst, r.prefix) === IP.toInt(r.net));
    const best = matches.reduce((x, y) => (y.prefix > x.prefix ? y : x));
    const shown = shuffle(routes);

    return {
      question: `
        <table class="tbl">
          <thead><tr><th>宛先ネットワーク</th><th>ネクストホップ</th></tr></thead>
          <tbody>${shown.map(r => `<tr><td>${r.net}/${r.prefix}</td><td>${r.nh}</td></tr>`).join('')}</tbody>
        </table>
        <p>宛先 <b class="big">${dstStr}</b> のパケットはどこへ転送される？</p>`,
      fields: [{ label: 'ネクストホップ', answer: best.nh, type: 'text', placeholder: 'R1' }],
      explain: `
        <p>宛先に一致する経路：</p>
        <ul>${routes.filter(r => matches.includes(r))
          .map(r => `<li>${r.net}/${r.prefix} → ${r.nh}${r === best ? ' <b>← 最長一致</b>' : ''}</li>`).join('')}</ul>
        <p>一致する経路のうち<b>プレフィックス長が最も長いもの</b>を選ぶ。表の並び順やネクストホップの番号は関係ない。</p>`,
    };
  },
});

// ---- 経路集約 ----------------------------------------------------------
DRILLS.push({
  id: 'summarize',
  title: '経路集約',
  desc: '連続する /24 ネットワークを1つの経路に集約する。【4-3】',
  newProblem() {
    const k = rand(1, 3);
    const n = 2 ** k;
    const start = rand(0, 256 / n - 1) * n;
    const [a, b] = randomPrivatePrefix();
    const octets = [...Array(n).keys()].map(i => start + i);
    const answer = `${a}.${b}.${start}.0/${24 - k}`;

    return {
      question: `<p>次の経路を1つに集約せよ。</p>
        <ul class="mono">${octets.map(o => `<li>${a}.${b}.${o}.0/24</li>`).join('')}</ul>`,
      fields: [{ label: '集約経路', answer, type: 'ip', placeholder: '10.1.8.0/22' }],
      explain: `
        <p>第3オクテットを2進数で並べる：</p>
        <pre>${octets.map(o => `${String(o).padStart(3)} = ${bin8(o)}`).join('\n')}</pre>
        <p>上位 <b>${8 - k}</b> ビットが共通 → 16 + ${8 - k} = <b>/${24 - k}</b>、先頭は ${a}.${b}.${start}.0</p>
        <p>答え：<b>${answer}</b></p>`,
    };
  },
});

// ---- フラグメント計算 --------------------------------------------------
DRILLS.push({
  id: 'fragment',
  title: 'フラグメント計算',
  desc: 'MTU を超える IPv4 パケットの分割結果（データ長・オフセット値）を求める。【2-4】',
  newProblem() {
    const mtu = pick([1500, 1492, 1454, 1400, 1280, 1006, 576]);
    const max = Math.floor((mtu - 20) / 8) * 8;
    const data = rand(max + 1, max * 4);
    const count = Math.ceil(data / max);
    const lastLen = data - (count - 1) * max;
    const lastOffset = ((count - 1) * max) / 8;

    const rows = [...Array(count).keys()].map(i => {
      const len = i === count - 1 ? lastLen : max;
      return `<tr><td>${i + 1}</td><td>${len}</td><td>${(i * max) / 8}</td><td>${i === count - 1 ? 0 : 1}</td></tr>`;
    }).join('');

    return {
      question: `<p>MTU <b>${mtu}</b> バイトのリンクに、IPヘッダ20バイト（オプションなし）＋データ <b>${data}</b> バイトの IPv4 パケットを送出する（DF=0）。</p>`,
      fields: [
        { label: '1フラグメントに載る最大データ長', answer: max, type: 'num' },
        { label: 'フラグメント数', answer: count, type: 'num' },
        { label: '最後のフラグメントのデータ長', answer: lastLen, type: 'num' },
        { label: '最後のフラグメントのオフセット値', answer: lastOffset, type: 'num' },
      ],
      explain: `
        <ul>
          <li>MTU − IPヘッダ = ${mtu} − 20 = ${mtu - 20}${(mtu - 20) % 8
            ? ` → <b>8の倍数に切り下げて ${max}</b>（オフセットが8バイト単位のため）`
            : `（8の倍数なのでそのまま <b>${max}</b>）`}</li>
          <li>フラグメント数：${data} ÷ ${max} → 切り上げて <b>${count}</b></li>
          <li>オフセット値 = 先頭からのバイト位置 ÷ 8</li>
        </ul>
        <table class="tbl">
          <thead><tr><th>#</th><th>データ長</th><th>オフセット値</th><th>MF</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
    };
  },
});
