// ネットワーク・アニメーションの共通エンジン
//
// シナリオ定義（js/scenarios/*.js で SCENARIOS.push する）:
// {
//   id, title, subtitle, chapter（BOOK.chapters の no）, viewBox?,
//   nodes: { id: { x, y, name, kind: 'pc'|'sw'|'rt'|'sv'|'fw'|'cloud', lines: [], linesAbove?, badgeBelow? } },
//   links: [{ a, b, pa?, pb?, net?, ldx?, ldy?, cost? }],
//   steps: [{
//     title, desc,
//     focus?: id | [id],
//     pkt?: 'ip'|'arp'|'ctl'|'esp', label?,          … パケットの色と表示名
//     phases?: [[ [from, to, { label, kind, drop }?] ]], … フェーズ内の区間は同時に動く
//     frame?: [[セクション名, [[項目, 値, 補足?]], cls?]],
//     diagram?: [{ title, kind: 'ipv4'|'tcp'|'udp', values, note? }],  … ヘッダ図（HEADER_LAYOUTS）
//     frameGroup?, noCompare?,                       … 「変化」判定の比較対象
//     side?: 表 | [表],  表 = { title, head, rows, hit?: n | [n], foot? }
//     links?: { 'a-b': 'down'|'blocked'|'hit'|'path'|'tunnel' },
//     nodes?: { id: 'down'|'done' },
//     badges?: { id: 文字列 },
//   }]
// }

const SVG_NS = 'http://www.w3.org/2000/svg';
const SCENARIOS = [];

// シナリオ一覧の並び（縦軸）は js/book.js の BOOK（本の章立て）

// ヘッダ図のレイアウト（1行 = 32ビット）。step.diagram = [{ title, kind, values: { k: 値 }, note? }]
// def は values で省略したときの既定値
const HEADER_LAYOUTS = {
  ipv4: {
    rows: [
      [{ k: 'ver', label: 'Ver', bits: 4, def: '4' }, { k: 'ihl', label: 'IHL', bits: 4, def: '5' }, { k: 'dscp', label: 'DSCP', bits: 6, def: '0' }, { k: 'ecn', label: 'ECN', bits: 2, def: '0' }, { k: 'len', label: '全長', bits: 16 }],
      [{ k: 'id', label: '識別子', bits: 16 }, { k: 'flags', label: 'フラグ', bits: 3 }, { k: 'off', label: 'フラグメントオフセット', bits: 13, def: '0' }],
      [{ k: 'ttl', label: 'TTL', bits: 8 }, { k: 'proto', label: 'プロトコル', bits: 8 }, { k: 'sum', label: 'ヘッダチェックサム', bits: 16 }],
      [{ k: 'src', label: '送信元IPアドレス', bits: 32 }],
      [{ k: 'dst', label: '宛先IPアドレス', bits: 32 }],
    ],
  },
  tcp: {
    flags: ['CWR', 'ECE', 'URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'],
    rows: [
      [{ k: 'sport', label: '送信元ポート', bits: 16 }, { k: 'dport', label: '宛先ポート', bits: 16 }],
      [{ k: 'seq', label: 'シーケンス番号', bits: 32 }],
      [{ k: 'ack', label: '確認応答番号', bits: 32 }],
      [{ k: 'off', label: 'Off', bits: 4, def: '5' }, { k: 'rsv', label: '予約', bits: 4, def: '0' }, { k: 'flags', label: 'フラグ', bits: 8, type: 'flags' }, { k: 'win', label: 'ウィンドウ', bits: 16 }],
      [{ k: 'sum', label: 'チェックサム', bits: 16 }, { k: 'urg', label: '緊急ポインタ', bits: 16, def: '0' }],
      [{ k: 'opts', label: 'オプション', bits: 32, def: '（なし）' }],
    ],
  },
  udp: {
    rows: [
      [{ k: 'sport', label: '送信元ポート', bits: 16 }, { k: 'dport', label: '宛先ポート', bits: 16 }],
      [{ k: 'len', label: '長さ', bits: 16 }, { k: 'sum', label: 'チェックサム', bits: 16 }],
    ],
  },
};

// 実際の IPv4 ヘッダチェックサムを計算する
function ipChecksum({ src, dst, ttl, proto = 6, len = 60, id = 0x1c46, flags = 0x4000 }) {
  const words = ip => {
    const o = ip.split('.').map(Number);
    return [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
  };
  const all = [0x4500, len, id, flags, (ttl << 8) | proto, 0, ...words(src), ...words(dst)];
  let sum = all.reduce((a, b) => a + b, 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return '0x' + (~sum & 0xffff).toString(16).padStart(4, '0');
}

const FlowApp = (() => {
  const PKT_LABEL = { ip: 'IP', arp: 'ARP', ctl: 'CTL', esp: 'ESP' };
  const SECTION_TAG = { enc: '暗号化＋認証', auth: '認証のみ', plain: '保護対象外' };

  const $ = id => document.getElementById(id);
  let svg, pktLayer;
  let scn = null;
  let current = 0;
  let playing = false;
  let speed = 1;
  let animToken = 0;

  function el(tag, attrs, text) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // a から b へ向かって dist だけ進んだ点
  function toward(a, b, dist) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    return { x: a.x + (dx / len) * dist, y: a.y + (dy / len) * dist };
  }

  function linkState(step, a, b) {
    const m = step.links || {};
    return m[`${a}-${b}`] || m[`${b}-${a}`] || '';
  }

  // ---- 構成図 ----------------------------------------------------------

  function drawTopology() {
    svg.replaceChildren();
    svg.setAttribute('viewBox', scn.viewBox || '0 0 810 260');
    svg.setAttribute('aria-label', `${scn.title} のネットワーク構成図`);

    for (const l of scn.links) {
      const A = scn.nodes[l.a], B = scn.nodes[l.b];
      svg.appendChild(el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'link', 'data-a': l.a, 'data-b': l.b }));
    }
    for (const l of scn.links) {
      const A = scn.nodes[l.a], B = scn.nodes[l.b];
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      if (l.pa) { const p = toward(A, B, 56); svg.appendChild(el('text', { x: p.x, y: p.y - 6, class: 'port' }, l.pa)); }
      if (l.pb) { const p = toward(B, A, 56); svg.appendChild(el('text', { x: p.x, y: p.y - 6, class: 'port' }, l.pb)); }
      if (l.net) svg.appendChild(el('text', { x: mx + (l.ldx || 0), y: my + (l.ldy ?? 20), class: 'net' }, l.net));
      if (l.cost !== undefined) {
        svg.appendChild(el('circle', { cx: mx, cy: my, r: 12, class: 'cost-bg' }));
        svg.appendChild(el('text', { x: mx, y: my + 4, class: 'cost' }, l.cost));
      }
      svg.appendChild(el('text', { x: mx, y: my + 6, class: 'xmark', 'data-a': l.a, 'data-b': l.b }, '✕'));
    }
    for (const [id, n] of Object.entries(scn.nodes)) {
      const g = el('g', { class: `node ${n.kind}`, 'data-id': id });
      if (n.kind === 'cloud') {
        g.appendChild(el('ellipse', { cx: n.x, cy: n.y, rx: 58, ry: 26 }));
      } else {
        g.appendChild(el('rect', { x: n.x - 40, y: n.y - 20, width: 80, height: 40, rx: n.kind === 'rt' ? 20 : 6 }));
      }
      g.appendChild(el('text', { x: n.x, y: n.y + 5, class: 'name' }, n.name));
      const lines = n.lines || [];
      // linesAbove: 下側の線と重なる場合はアドレス表記をノードの上に置く
      lines.forEach((t, i) => g.appendChild(el('text', {
        x: n.x, y: n.linesAbove ? n.y - 28 - (lines.length - 1 - i) * 14 : n.y + 36 + i * 14, class: 'addr',
      }, t)));
      const badgeY = n.badgeBelow ? n.y + 40 : n.y - 27 - (n.linesAbove ? lines.length * 14 : 0);
      g.appendChild(el('text', { x: n.x, y: badgeY, class: 'badge' }));
      svg.appendChild(g);
    }
    pktLayer = el('g', {});
    svg.appendChild(pktLayer);
  }

  function applyVisuals(step) {
    svg.querySelectorAll('line.link').forEach(line => {
      line.setAttribute('class', `link ${linkState(step, line.dataset.a, line.dataset.b)}`);
    });
    svg.querySelectorAll('.xmark').forEach(x => {
      x.classList.toggle('show', ['down', 'blocked'].includes(linkState(step, x.dataset.a, x.dataset.b)));
    });
    const focus = [].concat(step.focus || []);
    svg.querySelectorAll('.node').forEach(g => {
      const id = g.dataset.id;
      g.setAttribute('class', `node ${scn.nodes[id].kind} ${focus.includes(id) ? 'active' : ''} ${(step.nodes || {})[id] || ''}`);
      g.querySelector('.badge').textContent = (step.badges || {})[id] || '';
    });
    scrollToFocus(focus);
  }

  // スマホで図が横スクロールになっているとき、注目ノードを画面中央に寄せる
  function scrollToFocus(focus) {
    const box = $('topo-scroll');
    if (box.scrollWidth <= box.clientWidth) return;
    const xs = focus.map(id => scn.nodes[id].x);
    const vbWidth = svg.viewBox.baseVal.width;
    const x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : vbWidth / 2;
    box.scrollTo({ left: (x / vbWidth) * box.scrollWidth - box.clientWidth / 2, behavior: 'smooth' });
  }

  // 横一列に並べたボタン列で、選択中のボタンを見える位置に寄せる（縦方向には動かさない）
  function centerActive(container) {
    const btn = container.querySelector('button.active');
    if (!btn || container.scrollWidth <= container.clientWidth) return;
    container.scrollTo({ left: btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
  }

  // ---- アニメーション --------------------------------------------------

  function animatePhase(phase, step, token) {
    const pkts = phase.map(([, , opts = {}]) => {
      const kind = opts.kind || step.pkt || 'ip';
      const label = opts.label || step.label || PKT_LABEL[kind];
      // 全角文字は半角の約1.6倍の幅で見積もる
      const w = Math.max(40, [...label].reduce((sum, c) => sum + (c.charCodeAt(0) > 0xff ? 13 : 8), 0) + 14);
      const g = el('g', { class: `pkt ${kind}` });
      g.appendChild(el('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 4 }));
      g.appendChild(el('text', { x: 0, y: 4 }, label));
      g.drop = !!opts.drop;
      pktLayer.appendChild(g);
      return g;
    });
    const duration = 900 / speed;
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {
        if (token !== animToken) return resolve(null);
        const t = Math.min((now - start) / duration, 1);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        phase.forEach(([from, to], i) => {
          const A = scn.nodes[from], B = scn.nodes[to];
          pkts[i].setAttribute('transform', `translate(${A.x + (B.x - A.x) * e},${A.y + (B.y - A.y) * e})`);
        });
        if (t < 1) return requestAnimationFrame(frame);
        pkts.filter(p => p.drop).forEach(p => {
          p.classList.add('dropped');
          p.appendChild(el('text', { x: 0, y: -16, class: 'drop-label' }, '✕ 破棄'));
        });
        resolve(pkts);
      }
      requestAnimationFrame(frame);
    });
  }

  async function playAnimation(step) {
    const token = ++animToken;
    pktLayer.replaceChildren();
    const phases = step.phases || [];
    for (let i = 0; i < phases.length; i++) {
      const pkts = await animatePhase(phases[i], step, token);
      if (!pkts) return false;
      // 中継点に着いたパケットは消す（最後のフェーズと破棄されたものは残す）
      if (i < phases.length - 1) pkts.filter(p => !p.drop).forEach(p => p.remove());
    }
    return token === animToken;
  }

  // ---- パネル ----------------------------------------------------------

  // 比較対象：同じ frameGroup（なければ pkt）で、key（'frame' / 'diagram'）を持つ直前のステップ
  function prevOf(i, key) {
    const step = scn.steps[i];
    if (step.noCompare) return null;
    const group = step.frameGroup || step.pkt;
    for (let j = i - 1; j >= 0; j--) {
      const s = scn.steps[j];
      if (s[key] && (s.frameGroup || s.pkt) === group) return s[key];
    }
    return null;
  }

  // ---- ヘッダ図（RFC 風の 32 ビット幅レイアウト） -------------------------

  function flagsHtml(layout, value) {
    const on = String(value || '').split(/[,\s]+/).filter(Boolean);
    const strip = layout.flags.map(f => `<i class="${on.includes(f) ? 'on' : ''}">${f[0]}</i>`).join('');
    return `<span class="hdr-flags">${strip}</span><span class="hdr-val">${on.join(' ') || '0'}</span>`;
  }

  function renderDiagram(d, prevDiagrams, predict, flashOrder) {
    const layout = HEADER_LAYOUTS[d.kind];
    const prevD = (prevDiagrams || []).find(p => p.title === d.title);
    const cells = layout.rows.flat().map(f => {
      const v = d.values[f.k] ?? f.def ?? '';
      const old = prevD ? (prevD.values[f.k] ?? f.def ?? '') : undefined;
      const changed = old !== undefined && String(old) !== String(v);
      const inner = f.type === 'flags'
        ? flagsHtml(layout, v)
        : `<span class="hdr-val">${v === '' ? '-' : v}</span>`;
      const oldHtml = changed ? `<span class="hdr-old">← ${f.type === 'flags' ? (String(old).split(/[,\s]+/).filter(Boolean).join(' ') || '0') : old}</span>` : '';
      const body = `${inner}${oldHtml}`;
      const delay = changed ? `animation-delay:${(flashOrder.n++ * 0.18).toFixed(2)}s;` : '';
      const cls = `hdr-cell${changed && !predict ? ' changed flash' : ''}`;
      return `<div class="${cls}" style="grid-column:span ${f.bits};${delay}"${changed ? ' data-changed="1"' : ''}>
        <span class="hdr-label">${f.label}</span>
        ${predict ? `<button class="reveal" data-html="${encodeURIComponent(body)}">？</button>` : body}
      </div>`;
    }).join('');
    return `<div class="hdr">
      <h4>${d.title}${d.note ? ` <span class="muted">${d.note}</span>` : ''}</h4>
      <div class="hdr-ruler"><span>0</span><span>8</span><span>16</span><span>24</span><span>31</span></div>
      <div class="hdr-grid">${cells}</div>
    </div>`;
  }

  function renderFrame(i) {
    const step = scn.steps[i];
    const box = $('frame');
    if (!step.frame && !step.diagram) {
      box.innerHTML = '<p class="muted">このステップではフレームは流れない。</p>';
      return;
    }
    const predict = $('predict').checked;
    const flashOrder = { n: 0 };
    const diagrams = (step.diagram || []).map(d => renderDiagram(d, prevOf(i, 'diagram'), predict, flashOrder)).join('');
    if (!step.frame) {
      box.innerHTML = diagrams;
      return;
    }
    const prev = new Map();
    (prevOf(i, 'frame') || []).forEach(([sec, fields]) => fields.forEach(([k, v]) => prev.set(`${sec}.${k}`, v)));

    box.innerHTML = diagrams + step.frame.map(([sec, fields, cls = '']) => `
      <h4 class="${cls}">${sec}${SECTION_TAG[cls] ? ` <span class="sec-tag">${SECTION_TAG[cls]}</span>` : ''}</h4>
      <table class="tbl frame-tbl ${cls}"><tbody>
        ${fields.map(([k, v, note]) => {
          const old = prev.get(`${sec}.${k}`);
          const changed = old !== undefined && old !== v;
          const val = `<span class="val">${v}</span>${note ? ` <span class="note">(${note})</span>` : ''}${changed ? ` <span class="badge">変化 ← ${old}</span>` : ''}`;
          return `<tr class="${changed ? 'changed' : ''}">
            <th>${k}</th>
            <td>${predict ? `<button class="reveal" data-html="${encodeURIComponent(val)}">？</button>` : val}</td>
          </tr>`;
        }).join('')}
      </tbody></table>`).join('');
  }

  function renderSide(step) {
    const tables = [].concat(step.side || []);
    $('side').innerHTML = tables.map(s => {
      const hits = [].concat(s.hit ?? []);
      return `
        <h4>${s.title}</h4>
        <table class="tbl">
          <thead><tr>${s.head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${s.rows.map((r, i) => `<tr class="${hits.includes(i) ? 'hit' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
        ${s.foot ? `<p class="muted">${s.foot}</p>` : ''}`;
    }).join('');
  }

  // ---- ステップ移動 ----------------------------------------------------

  async function go(i) {
    const steps = scn.steps;
    current = Math.max(0, Math.min(i, steps.length - 1));
    const step = steps[current];
    try { history.replaceState(null, '', `#${scn.id}/${current}`); } catch (e) {}

    $('step-title').textContent = step.title;
    $('step-count').textContent = `${current + 1} / ${steps.length}`;
    $('desc').innerHTML = step.desc;
    renderSide(step);
    renderFrame(current);
    applyVisuals(step);
    document.querySelectorAll('#timeline button').forEach((b, j) => b.classList.toggle('active', j === current));
    centerActive($('timeline'));
    $('prev').disabled = current === 0;
    $('next').disabled = current === steps.length - 1;

    const finished = await playAnimation(step);
    if (finished && playing) {
      const token = animToken;
      setTimeout(() => {
        if (!playing || token !== animToken) return;
        if (current < steps.length - 1) go(current + 1);
        else setPlaying(false);
      }, 1800 / speed);
    }
  }

  function setPlaying(on) {
    playing = on;
    $('play').textContent = on ? '⏸ 一時停止' : '▶ 自動再生';
    if (on) go(current >= scn.steps.length - 1 ? 0 : current);
  }

  function loadScenario(id, step = 0) {
    scn = SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
    playing = false;
    $('play').textContent = '▶ 自動再生';
    $('scn-title').textContent = scn.title;
    $('scn-sub').textContent = scn.subtitle;
    const ch = BOOK.chapters.find(c => c.no === scn.chapter);
    $('scn-syl').textContent = ch ? `本書 Chapter ${ch.no}　${ch.title}` : '';
    document.title = `${scn.title} | ネットワーク・アニメーション`;
    renderChapter(scn.chapter);

    const tl = $('timeline');
    tl.replaceChildren();
    scn.steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.textContent = s.title;
      b.addEventListener('click', () => { setPlaying(false); go(i); });
      tl.appendChild(b);
    });
    drawTopology();
    go(step);
  }

  // 「#napt/3」形式。旧形式「#4」はパケットの旅のステップとして扱う
  function parseHash() {
    const h = location.hash.slice(1);
    if (/^\d+$/.test(h)) return ['basic', +h];
    const [id, step] = h.split('/');
    return [id, parseInt(step, 10) || 0];
  }

  // 章ボタンの強調と、その章のシナリオボタンを表示する
  function renderChapter(no) {
    document.querySelectorAll('#chapters button').forEach(b => b.classList.toggle('active', +b.dataset.no === no));
    const box = $('scenarios');
    box.replaceChildren();
    SCENARIOS.filter(s => s.chapter === no).forEach(s => {
      const b = document.createElement('button');
      b.textContent = s.title;
      b.classList.toggle('active', s === scn);
      b.addEventListener('click', () => loadScenario(s.id));
      box.appendChild(b);
    });
    centerActive($('chapters'));
  }

  function start() {
    svg = $('topo');
    for (const ch of BOOK.chapters) {
      const first = SCENARIOS.find(s => s.chapter === ch.no);
      const b = document.createElement('button');
      b.dataset.no = ch.no;
      b.innerHTML = `<span class="ch-no">${ch.no}</span>${ch.title}`;
      b.disabled = !first;
      if (first) b.addEventListener('click', () => loadScenario(first.id));
      $('chapters').appendChild(b);
    }

    $('prev').addEventListener('click', () => { setPlaying(false); go(current - 1); });
    $('next').addEventListener('click', () => { setPlaying(false); go(current + 1); });
    $('replay').addEventListener('click', () => playAnimation(scn.steps[current]));
    $('play').addEventListener('click', () => setPlaying(!playing));
    $('speed').addEventListener('change', e => { speed = Number(e.target.value); });
    $('predict').addEventListener('change', () => renderFrame(current));
    // 予想モードの答え合わせ。ヘッダ図では、変化したセルを開いたときに強調する
    const reveal = btn => {
      const cell = btn.closest('.hdr-cell');
      btn.outerHTML = decodeURIComponent(btn.dataset.html);
      if (cell && cell.dataset.changed) cell.classList.add('changed', 'flash');
    };
    $('frame').addEventListener('click', e => {
      const btn = e.target.closest('.reveal');
      if (btn) reveal(btn);
    });
    $('reveal-all').addEventListener('click', () => {
      document.querySelectorAll('#frame .reveal').forEach(reveal);
    });
    // 説明・フレーム欄を左右にスワイプしてステップ移動（縦スクロールとは区別する）
    let touch = null;
    const swipeArea = document.querySelector('.grid');
    swipeArea.addEventListener('touchstart', e => {
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    swipeArea.addEventListener('touchend', e => {
      if (!touch) return;
      const dx = e.changedTouches[0].clientX - touch.x;
      const dy = e.changedTouches[0].clientY - touch.y;
      touch = null;
      if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
      setPlaying(false);
      go(current + (dx < 0 ? 1 : -1));
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if (['SELECT', 'INPUT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') { setPlaying(false); go(current + 1); }
      if (e.key === 'ArrowLeft') { setPlaying(false); go(current - 1); }
    });

    loadScenario(...parseHash());
  }

  return { start };
})();
