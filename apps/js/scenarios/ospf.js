// OSPF：LSA のフラッディングと SPF（ダイクストラ法）による最短経路計算【4-5】
(() => {
  const ROOT = 'A';
  const nodes = {
    A: { x: 60,  y: 130, name: 'A', kind: 'rt' },
    B: { x: 250, y: 50,  name: 'B', kind: 'rt' },
    C: { x: 250, y: 210, name: 'C', kind: 'rt', badgeBelow: true },
    D: { x: 470, y: 50,  name: 'D', kind: 'rt' },
    E: { x: 470, y: 210, name: 'E', kind: 'rt', badgeBelow: true },
    F: { x: 690, y: 130, name: 'F', kind: 'rt' },
  };
  const links = [
    { a: 'A', b: 'B', cost: 10 },
    { a: 'A', b: 'C', cost: 5 },
    { a: 'B', b: 'C', cost: 3 },
    { a: 'B', b: 'D', cost: 1 },
    { a: 'C', b: 'E', cost: 2 },
    { a: 'D', b: 'E', cost: 4 },
    { a: 'D', b: 'F', cost: 6 },
    { a: 'E', b: 'F', cost: 9 },
  ];

  const ids = Object.keys(nodes);
  const adj = Object.fromEntries(ids.map(i => [i, []]));
  links.forEach(({ a, b, cost }) => {
    adj[a].push({ to: b, cost });
    adj[b].push({ to: a, cost });
  });

  const fmt = d => (d === Infinity ? '∞' : String(d));
  const lsdb = {
    title: 'LSDB（全ルータで共通）',
    head: ['ルータ', '隣接ルータ:コスト'],
    rows: ids.map(i => [i, adj[i].map(n => `${n.to}:${n.cost}`).join('　')]),
  };

  // ---- ダイクストラ法を実行しながらステップを生成する --------------------

  const dist = Object.fromEntries(ids.map(i => [i, Infinity]));
  const prev = {};
  const done = new Set();
  dist[ROOT] = 0;

  const spfTable = hits => ({
    title: 'SPF 計算表',
    head: ['ルータ', '状態', '最短コスト', '直前のルータ'],
    rows: ids.map(i => [i, done.has(i) ? '確定' : '未確定', fmt(dist[i]), prev[i] || '-']),
    hit: hits.map(h => ids.indexOf(h)),
  });
  const badges = () => Object.fromEntries(ids.map(i => [i, `d=${fmt(dist[i])}`]));
  const treeLinks = () => Object.fromEntries([...done].filter(i => prev[i]).map(i => [`${prev[i]}-${i}`, 'path']));
  const doneNodes = () => Object.fromEntries([...done].map(i => [i, 'done']));

  const spfSteps = [{
    title: 'SPF 準備',
    focus: ROOT,
    desc: `<p>LSDB をもとに、<b>${ROOT} 自身を根（ルート）</b>とした最短経路ツリーを作る。</p>
      <p>初期状態：${ROOT} のコストは 0、他はまだ分からないので ∞。図の d= が現時点の最短コスト。</p>
      <p>手順：「<b>未確定の中でコストが最小のルータを確定</b> → その隣のコストを見直す」を全ルータが確定するまで繰り返す。</p>`,
    badges: badges(),
    side: spfTable([ROOT]),
  }];

  while (done.size < ids.length) {
    const u = ids.filter(i => !done.has(i)).reduce((a, b) => (dist[b] < dist[a] ? b : a));
    done.add(u);
    const msgs = [];
    const hits = [u];
    const relaxed = {};
    for (const { to, cost } of adj[u]) {
      if (done.has(to)) continue;
      relaxed[`${u}-${to}`] = 'hit';
      const nd = dist[u] + cost;
      if (nd < dist[to]) {
        msgs.push(`<li>${to}：${fmt(dist[to])} → <b>${nd}</b> に更新（${u} 経由 ${dist[u]}+${cost}）</li>`);
        dist[to] = nd;
        prev[to] = u;
        hits.push(to);
      } else {
        msgs.push(`<li>${to}：${u} 経由だと ${dist[u]}+${cost}=${nd}。今の ${dist[to]} 以上なので<b>更新しない</b></li>`);
      }
    }
    spfSteps.push({
      title: `${u} を確定`,
      focus: u,
      desc: `<p>未確定のうちコストが最小の <b>${u}（${dist[u]}）</b> を確定する${prev[u] ? `（直前のルータは ${prev[u]}）` : ''}。</p>
        ${msgs.length
          ? `<p>${u} に隣接する未確定ルータのコストを見直す（図の青い線）：</p><ul>${msgs.join('')}</ul>`
          : '<p>未確定の隣接ルータはないので、見直しはなし。</p>'}
        <p>緑の線が確定した最短経路ツリー。</p>`,
      links: { ...treeLinks(), ...relaxed },
      nodes: doneNodes(),
      badges: badges(),
      side: spfTable(hits),
    });
  }

  // 根から見たネクストホップ（経路の最初の1ホップ）
  const nextHop = dest => {
    let n = dest;
    while (prev[n] !== ROOT) n = prev[n];
    return n;
  };
  const pathOf = dest => {
    const p = [dest];
    while (p[0] !== ROOT) p.unshift(prev[p[0]]);
    return p.join('→');
  };
  const dests = ids.filter(i => i !== ROOT);

  SCENARIOS.push({
    id: 'ospf',
    chapter: 11,
    title: 'OSPF',
    subtitle: 'LSA のフラッディングと、ダイクストラ法（SPF）で最短経路が決まるまで',
    nodes,
    links,
    steps: [
      {
        title: 'はじめに',
        desc: `<p>OSPF は<b>リンクステート型</b>のルーティングプロトコル。各ルータは次の順で経路を決める。</p>
          <ol>
            <li>自分のリンク情報（隣接ルータとコスト）を <b>LSA</b> として全ルータに配る</li>
            <li>全ルータが同じ <b>LSDB</b>（ネットワークの地図）を持つ</li>
            <li>各ルータが自分を根として <b>SPF（ダイクストラ法）</b>で最短経路を計算する</li>
          </ol>
          <p>線の上の数字がコスト（基準帯域 ÷ IF 帯域）。ここでは <b>ルータ ${ROOT}</b> の視点で計算する。</p>`,
      },
      {
        title: '① LSA のフラッディング',
        focus: ROOT,
        pkt: 'ctl',
        label: 'LSA',
        desc: `<p>${ROOT} が自分のリンク情報を載せた <b>Router LSA（Type1）</b>を隣接ルータに送り、受け取ったルータはさらに隣へ転送する（<b>フラッディング</b>）。</p>
          <p>実際には全ルータが同じことをするので、最終的に全ルータの LSDB が同じ内容になる。宛先は 224.0.0.5（AllSPFRouters）、IP のプロトコル番号は 89。</p>`,
        phases: [
          [['A', 'B'], ['A', 'C']],
          [['B', 'D'], ['C', 'E']],
          [['D', 'F'], ['E', 'F']],
        ],
        side: lsdb,
      },
      ...spfSteps,
      {
        title: '結果：ルーティングテーブル',
        focus: ROOT,
        desc: `<p>最短経路ツリーが完成した。${ROOT} のルーティングテーブルには、宛先ごとに<b>経路の最初の1ホップ</b>がネクストホップとして載る。</p>
          <p>注目：B とは直結（コスト10）なのに、<b>C 経由（5+3=8）のほうが安い</b>ので、B 宛ても C に送る。直結 = 最短とは限らない。</p>
          <p>コストが同じ経路が複数あれば、OSPF は<b>等コストマルチパス（ECMP）</b>で負荷分散できる。</p>`,
        links: treeLinks(),
        nodes: doneNodes(),
        badges: badges(),
        side: {
          title: `ルータ ${ROOT} のルーティングテーブル`,
          head: ['宛先', 'コスト', 'ネクストホップ', '経路'],
          rows: dests.map(d => [d, dist[d], nextHop(d), pathOf(d)]),
        },
      },
    ],
  });
})();
