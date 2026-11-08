// ワーク演習の CBT ツール（本番の試験アプリの「電卓」「メモ」を再現）
// - 電卓：四則演算とかっこ。「＝ 確定」で答えを出す。小・中・大、タイトルバーで移動
// - メモ：半透明、検索（∧∨・件数）、マーカー（赤・青・黄、白で消す）、カット・コピー・ペースト、10,000字まで
// 保存は work-app.js の Notes（問題×周ごと）。ここは画面と、Node でも試せる純粋関数だけを持つ。
(function (root) {
  'use strict';

  // ================= 純粋関数（node でも使える） =================
  const OPS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/' };

  function tokenize(src) {
    const out = [];
    const s = String(src).replace(/,/g, '');
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (c === '(' || c === ')') { out.push(c); i++; continue; }
      if (OPS[c]) { out.push(OPS[c]); i++; continue; }
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/);
      if (!m) return null;
      out.push(Number(m[0])); i += m[0].length;
    }
    return out;
  }

  // 式を計算する。閉じていないかっこは最後に自動で閉じる。eval は使わない。
  function evaluate(src) {
    const toks = tokenize(src);
    if (!toks) return { ok: false, error: '式が正しくありません' };
    if (!toks.length) return { ok: false, error: '' };
    let depth = 0;
    for (const t of toks) { if (t === '(') depth++; else if (t === ')' && --depth < 0) return { ok: false, error: 'かっこが正しくありません' }; }
    while (depth-- > 0) toks.push(')');
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    const bad = msg => { throw new Error(msg || '式が正しくありません'); };
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = next(), r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function term() {
      let v = factor();
      for (;;) {
        const t = peek();
        if (t === '*' || t === '/') {
          next(); const r = factor();
          if (t === '/') { if (r === 0) bad('0 で割ることはできません'); v /= r; } else v *= r;
        } else if (t === '(') v *= factor(); // 2(3+4) のような省略した掛け算
        else break;
      }
      return v;
    }
    function factor() {
      const t = next();
      if (t === '-') return -factor();
      if (t === '+') return factor();
      if (t === '(') { const v = expr(); if (next() !== ')') bad(); return v; }
      if (typeof t === 'number') return t;
      return bad();
    }
    try {
      const v = expr();
      if (i !== toks.length) bad();
      if (!isFinite(v)) bad('計算できない値です');
      return { ok: true, value: tidy(v) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  // 0.1+0.2 のような浮動小数の誤差を丸める（有効数字12桁）
  function tidy(v) { const n = Number(v.toPrecision(12)); return Object.is(n, -0) ? 0 : n; }
  // 式に戻すための数値（カンマなし・マイナスは −）
  function rawNum(v) {
    const a = Math.abs(v);
    let s = (a !== 0 && a < 1e-6) ? v.toFixed(15).replace(/\.?0+$/, '') : String(v);
    return s.replace('-', '−');
  }
  // 表示用（3桁カンマ）
  function formatNum(v) {
    const a = Math.abs(v);
    if (a >= 1e15) return v.toExponential(8).replace(/\.?0+e/, 'e').replace('-', '−');
    const [i, f] = rawNum(v).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
  }
  // ± ：末尾の数の符号を切り替える
  function toggleSign(expr) {
    const m = expr.match(/(\d[\d.]*(?:e[+-]?\d+)?|\.\d*)$/);
    if (!m) {
      if (expr === '' || expr.endsWith('(')) return expr + '−';
      if (/(^|\()−$/.test(expr)) return expr.slice(0, -1);
      return expr + '(−';
    }
    const before = expr.slice(0, expr.length - m[0].length);
    if (/(^|\()−$/.test(before)) return before.slice(0, -1) + m[0]; // 「(」は残す（自分で入れたかっこを消さない）
    if (before === '' || before.endsWith('(')) return before + '−' + m[0];
    return before + '(−' + m[0];
  }

  // ---- メモのマーカー：marks = [[開始, 終了, 'r'|'b'|'y'], ...]（重ならない・開始順） ----
  const COLORS = { r: '赤', b: '青', y: '黄' };
  // [s, e) に色を塗る（color が空なら消す）。重なる部分は塗り替え、隣り合う同じ色はまとめる
  function paintMarks(marks, s, e, color) {
    const out = [];
    for (const [a, b, c] of marks) {
      if (b <= s || a >= e) out.push([a, b, c]);
      else { if (a < s) out.push([a, s, c]); if (b > e) out.push([e, b, c]); }
    }
    if (color && e > s) out.push([s, e, color]);
    out.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const m of out) {
      const p = merged[merged.length - 1];
      if (p && p[2] === m[2] && p[1] >= m[0]) p[1] = Math.max(p[1], m[1]); else merged.push(m.slice());
    }
    return merged;
  }
  // 保存データを信用しすぎない：範囲外・不正な色を落とし、重なりを解く
  function normalizeMarks(marks, len) {
    let out = [];
    for (const m of Array.isArray(marks) ? marks : []) {
      if (!Array.isArray(m) || !COLORS[m[2]]) continue;
      const a = Math.max(0, Math.min(len, Math.floor(m[0]))), b = Math.max(0, Math.min(len, Math.floor(m[1])));
      if (b > a) out = paintMarks(out, a, b, m[2]);
    }
    return out;
  }
  // 文字を入力・削除したとき、マーカーの位置を文字に合わせてずらす
  function shiftMarks(marks, oldText, newText) {
    if (oldText === newText) return marks;
    const ol = oldText.length, nl = newText.length, min = Math.min(ol, nl);
    let p = 0; while (p < min && oldText[p] === newText[p]) p++;
    let s = 0; while (s < min - p && oldText[ol - 1 - s] === newText[nl - 1 - s]) s++;
    const oldEnd = ol - s, ins = nl - s - p, delta = nl - ol;
    // 開始位置：変更箇所の直前ちょうどから始まるマーカーは、挿入した文字を含めない
    const fa = x => x < p ? x : x >= oldEnd ? x + delta : p + ins;
    // 終了位置：マーカーの末尾に続けて打った文字は含めない
    const fb = x => x <= p ? x : x >= oldEnd ? x + delta : p;
    return marks.map(([a, b, c]) => [fa(a), fb(b), c]).filter(m => m[1] > m[0]);
  }
  function findHits(text, q) {
    if (!q) return [];
    const T = text.toLowerCase(), Q = q.toLowerCase();
    const [t, k] = (T.length === text.length && Q.length === q.length) ? [T, Q] : [text, q];
    const out = [];
    for (let i = t.indexOf(k); i !== -1; i = t.indexOf(k, i + k.length)) out.push([i, i + k.length]);
    return out;
  }
  const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // マーカー（と検索の一致）を付けた HTML。履歴画面とメモの下敷きで共用
  function renderMarked(text, marks, hits, cur) {
    hits = hits || [];
    const cuts = new Set([0, text.length]);
    for (const [a, b] of marks) { cuts.add(a); cuts.add(b); }
    for (const [a, b] of hits) { cuts.add(a); cuts.add(b); }
    const xs = [...cuts].filter(x => x >= 0 && x <= text.length).sort((a, b) => a - b);
    let html = '';
    for (let k = 0; k + 1 < xs.length; k++) {
      const s = xs[k], e = xs[k + 1], seg = escHtml(text.slice(s, e));
      const m = marks.find(([a, b]) => a <= s && s < b);
      const h = hits.findIndex(([a, b]) => a <= s && s < b);
      const cls = [m ? 'mk-' + m[2] : '', h >= 0 ? 'hit' : '', h >= 0 && h === cur ? 'cur' : ''].filter(Boolean).join(' ');
      html += cls ? `<span class="${cls}"${h === cur && h >= 0 ? ' data-cur="1"' : ''}>${seg}</span>` : seg;
    }
    return html;
  }

  const Pure = { evaluate, formatNum, rawNum, toggleSign, paintMarks, normalizeMarks, shiftMarks, findHits, renderMarked, COLORS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = Pure; return; }
  root.WorkToolsPure = Pure;
  if (typeof document === 'undefined') return;

  // ================= 画面 =================
  const MEMO_MAX = 10000;
  const UI_KEY = 'nespe-work-tools'; // 位置・大きさ・半透明（この端末の表示の好みだけ。学習記録ではない）
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (_) {}
  const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (_) {} };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let zTop = 1000;
  const buttons = {};

  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function front(win) { win.style.zIndex = ++zTop; }
  function place(win, x, y) {
    const w = win.offsetWidth, h = win.offsetHeight;
    win.style.left = clamp(x, 0, Math.max(0, innerWidth - w)) + 'px';
    win.style.top = clamp(y, 0, Math.max(0, innerHeight - h)) + 'px';
  }
  // タイトルバーをつかんで移動
  function draggable(win, handle, onEnd) {
    handle.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, input, label')) return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = ev => place(win, ev.clientX - dx, ev.clientY - dy);
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
        onEnd();
      };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
      e.preventDefault();
    });
    win.addEventListener('pointerdown', () => front(win), true);
  }
  function setBtn(name, on) { if (buttons[name]) buttons[name].classList.toggle('on', on); }

  // ---------------- 電卓 ----------------
  const Calc = (() => {
    const KEYS = [
      ['(', '('], [')', ')'], ['AC', 'ac'], ['BS', 'bs'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷'],
      ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×'],
      ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−'],
      ['0', '0'], ['00', '00'], ['.', '.'], ['+', '+'],
      ['±', 'pm'], ['＝ 確定', '='],
    ];
    const win = el(`<div class="tw tw-calc" role="dialog" aria-label="電卓" tabindex="-1" hidden>
      <div class="tw-title"><span class="tw-name">電卓</span>
        <span class="calc-size">${['小', '中', '大'].map((s, i) => `<button data-size="${i}">${s}</button>`).join('')}</span>
        <button class="tw-x" data-r="close" aria-label="電卓を閉じる">×</button></div>
      <div class="calc-disp"><div class="calc-expr"></div><div class="calc-val"></div></div>
      <div class="calc-keys">${KEYS.map(([l, k]) => `<button data-k="${k}" class="${k === '=' ? 'eq' : /^[\d.]+$|^00$/.test(k) ? 'num' : 'fn'}">${l}</button>`).join('')}</div>
      <div class="calc-hist"></div>
    </div>`);
    let expr = '', done = false, line = '', result = null, err = '', hist = [];
    const $e = win.querySelector('.calc-expr'), $v = win.querySelector('.calc-val'), $h = win.querySelector('.calc-hist');
    const open = () => (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;

    function paint() {
      $e.textContent = done ? line : (expr ? expr + ')'.repeat(Math.max(0, open())) : '');
      $v.classList.toggle('err', !!err);
      $v.classList.toggle('preview', !done && !err);
      if (err) $v.textContent = err;
      else if (done) $v.textContent = formatNum(result);
      else { const r = evaluate(expr); $v.textContent = r.ok ? formatNum(r.value) : (expr ? $v.textContent : '0'); }
      $e.scrollLeft = $e.scrollWidth; $v.scrollLeft = $v.scrollWidth; // 長い式は末尾（いま打っている所）を見せる
      $h.innerHTML = hist.map((h, i) => `<button data-h="${i}" title="この答えを式に入れる">${escHtml(h.expr)} = <b>${escHtml(formatNum(h.value))}</b></button>`).join('');
    }
    function startFresh() { if (done) { expr = ''; done = false; } }
    function press(k) {
      err = '';
      if (expr.length > 200 && !['ac', 'bs', '=', 'pm'].includes(k)) return;
      if (/^\d$/.test(k) || k === '00') {
        startFresh();
        const cur = (expr.match(/[\d.]+$/) || [''])[0];
        if (expr.endsWith(')')) expr += '×';
        if (cur === '0') expr = expr.slice(0, -1) + (k === '00' ? '0' : k);
        else if (k === '00' && !cur) expr += '0';
        else expr += k;
      } else if (k === '.') {
        startFresh();
        const cur = (expr.match(/[\d.]+$/) || [''])[0];
        if (cur.includes('.')) return paint();
        if (!cur) { if (expr.endsWith(')')) expr += '×'; expr += '0'; }
        expr += '.';
      } else if ('+−×÷'.includes(k)) {
        if (done) { expr = rawNum(result); done = false; }
        const last = expr.slice(-1);
        if (expr === '' || last === '(') { if (k === '−') expr += '−'; else if (expr === '') expr = '0' + k; }
        else if ('+−×÷'.includes(last)) { const prev = expr.slice(0, -1); if (prev !== '' && !prev.endsWith('(')) expr = prev + k; }
        else expr += k;
      } else if (k === '(') {
        startFresh();
        if (/[\d.)]$/.test(expr)) expr += '×';
        expr += '(';
      } else if (k === ')') {
        if (!done && open() > 0 && /[\d.)]$/.test(expr)) expr += ')';
      } else if (k === 'pm') {
        if (done) { result = -result || 0; line = ''; expr = rawNum(result); done = false; }
        else expr = toggleSign(expr);
      } else if (k === 'ac') { expr = ''; done = false; line = ''; result = null; }
      else if (k === 'bs') { if (done) { done = false; } expr = expr.slice(0, -1); }
      else if (k === '=') {
        if (done || !expr) return paint();
        const r = evaluate(expr);
        if (!r.ok) { err = r.error || '式が正しくありません'; return paint(); }
        line = expr + ')'.repeat(Math.max(0, open())) + ' =';
        result = r.value; done = true; expr = rawNum(result);
        hist.unshift({ expr: line.slice(0, -2), value: result }); hist = hist.slice(0, 5);
      }
      paint();
    }
    function useHist(i) {
      const h = hist[i]; if (!h) return;
      err = '';
      if (done || expr === '' || /[(+−×÷]$/.test(expr)) { if (done) { expr = ''; done = false; } expr += rawNum(h.value); }
      else { expr += '×' + rawNum(h.value); }
      paint();
    }
    function setSize(i) {
      ui.calcSize = i; saveUi();
      win.dataset.size = i;
      win.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('on', Number(b.dataset.size) === i));
      requestAnimationFrame(() => place(win, win.offsetLeft, win.offsetTop));
    }
    win.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.k) press(b.dataset.k);
      else if (b.dataset.h) useHist(Number(b.dataset.h));
      else if (b.dataset.size) setSize(Number(b.dataset.size));
      else if (b.dataset.r === 'close') hide();
      win.focus({ preventScroll: true }); // キーボード入力を電卓で受け続ける
    });
    // キーボード：電卓をクリックしているときだけ（解答欄・メモの入力を邪魔しない）
    win.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const map = { '*': '×', '/': '÷', '-': '−', '+': '+', Enter: '=', '=': '=', Backspace: 'bs', Escape: 'ac', Delete: 'ac', '(': '(', ')': ')', '.': '.' };
      const k = /^\d$/.test(e.key) ? e.key : map[e.key];
      if (!k) return;
      e.preventDefault(); press(k);
      const btn = win.querySelector(`[data-k="${CSS.escape(k)}"]`);
      if (btn) { btn.classList.add('press'); setTimeout(() => btn.classList.remove('press'), 120); }
    });
    draggable(win, win.querySelector('.tw-title'), () => { ui.calcX = win.offsetLeft; ui.calcY = win.offsetTop; saveUi(); });

    function show() {
      if (!win.isConnected) document.body.appendChild(win);
      win.hidden = false; front(win);
      setSize(ui.calcSize == null ? 1 : ui.calcSize);
      place(win, ui.calcX == null ? innerWidth - win.offsetWidth - 24 : ui.calcX, ui.calcY == null ? 80 : ui.calcY);
      paint(); win.focus({ preventScroll: true });
      setBtn('calc', true);
    }
    function hide() { win.hidden = true; setBtn('calc', false); }
    return { toggle() { if (win.hidden || !win.isConnected) show(); else hide(); }, hide };
  })();

  // ---------------- メモ ----------------
  const Memo = (() => {
    const SEARCH_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 10l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const win = el(`<div class="tw tw-memo" role="dialog" aria-label="メモ" hidden>
      <div class="tw-title">
        <label class="tw-check"><input type="checkbox" data-r="trans"> 半透明</label>
        <span class="tw-name memo-name">メモ</span>
        <button class="tw-x" data-r="close" aria-label="メモを閉じる">×</button>
      </div>
      <div class="memo-tools">
        <button data-r="search" title="メモの中を検索">${SEARCH_ICON} 検索</button>
        <span class="memo-sw">
          <button class="sw sw-r" data-color="r" title="赤のマーカー（文字を選んでから押す）" aria-label="赤のマーカー"></button>
          <button class="sw sw-b" data-color="b" title="青のマーカー（文字を選んでから押す）" aria-label="青のマーカー"></button>
          <button class="sw sw-y" data-color="y" title="黄のマーカー（文字を選んでから押す）" aria-label="黄のマーカー"></button>
          <button class="sw sw-w" data-color="" title="白：マーカーを消す（文字を選んでから押す）" aria-label="マーカーを消す"></button>
        </span>
        <button data-r="cut" title="選んだ文字を切り取る">✂ カット</button>
        <button data-r="copy" title="選んだ文字をコピー">⧉ コピー</button>
        <button data-r="paste" title="貼り付け">📋 ペースト</button>
      </div>
      <div class="memo-search" hidden>
        <input type="text" placeholder="検索する文字" aria-label="検索する文字">
        <span class="ms-count">0 / 0</span>
        <button data-r="prev" title="前の一致" aria-label="前の一致">∧</button>
        <button data-r="next" title="次の一致" aria-label="次の一致">∨</button>
      </div>
      <div class="memo-edit">
        <div class="memo-back" aria-hidden="true"><div class="memo-back-in"></div></div>
        <textarea class="memo-ta" maxlength="${MEMO_MAX}" spellcheck="false" placeholder="ここにメモ（問題・周ごとに自動保存）"></textarea>
      </div>
      <div class="memo-foot">
        <span class="memo-hint"></span>
        <button class="btn small primary" data-r="close">閉じる</button>
        <span class="memo-count">0 / 10,000 文字</span>
      </div>
    </div>`);
    const ta = win.querySelector('.memo-ta'), back = win.querySelector('.memo-back'), backIn = win.querySelector('.memo-back-in');
    const sBox = win.querySelector('.memo-search'), sIn = sBox.querySelector('input'), sCount = sBox.querySelector('.ms-count');
    const hint = win.querySelector('.memo-hint'), count = win.querySelector('.memo-count'), trans = win.querySelector('[data-r="trans"]');
    let ctx = null, text = '', marks = [], hits = [], cur = -1, clip = '', hintTimer = null;

    function say(msg) { hint.textContent = msg; clearTimeout(hintTimer); hintTimer = setTimeout(() => { hint.textContent = ''; }, 2500); }
    function render() {
      // 末尾の改行の高さも下敷きに反映させるため、最後に1文字足す
      backIn.innerHTML = renderMarked(text, marks, hits, cur) + '​';
      back.style.setProperty('--sb', (ta.offsetWidth - ta.clientWidth) + 'px');
      back.scrollTop = ta.scrollTop;
      count.textContent = `${text.length.toLocaleString()} / ${MEMO_MAX.toLocaleString()} 文字`;
      sCount.textContent = hits.length ? `${cur + 1} / ${hits.length}` : '0 / 0';
    }
    function emit() { if (ctx && ctx.onChange) ctx.onChange({ text, marks: marks.map(m => m.slice()) }); }
    function update(newText) {
      marks = shiftMarks(marks, text, newText); text = newText;
      if (!sBox.hidden) { hits = findHits(text, sIn.value); cur = hits.length ? clamp(cur, 0, hits.length - 1) : -1; }
      render(); emit();
    }
    function load() {
      const n = ctx && ctx.load ? ctx.load() : null;
      text = (n && typeof n.text === 'string') ? n.text.slice(0, MEMO_MAX) : '';
      marks = normalizeMarks(n && n.marks, text.length);
      ta.value = text; ta.disabled = !ctx;
      win.querySelector('.memo-name').textContent = ctx ? `メモ：${ctx.title}` : 'メモ';
      hits = findHits(text, sBox.hidden ? '' : sIn.value); cur = hits.length ? 0 : -1;
      render();
    }
    function sel() { return [ta.selectionStart, ta.selectionEnd]; }
    function insert(str) {
      const [s, e] = sel();
      const room = MEMO_MAX - (text.length - (e - s));
      if (str.length > room) { str = str.slice(0, Math.max(0, room)); say('10,000 文字までです'); }
      ta.setRangeText(str, s, e, 'end'); update(ta.value); ta.focus();
    }
    async function act(r) {
      const [s, e] = sel();
      if (r === 'copy' || r === 'cut') {
        if (s === e) return say('文字を選んでから押してください');
        clip = text.slice(s, e);
        try { await navigator.clipboard.writeText(clip); } catch (_) { /* 使えなければメモ内だけで貼り付け */ }
        if (r === 'cut') { ta.setRangeText('', s, e, 'end'); update(ta.value); }
        ta.focus();
      } else if (r === 'paste') {
        let t = clip;
        try { const c = await navigator.clipboard.readText(); if (c) t = c; } catch (_) {}
        if (!t) return say('貼り付ける文字がありません');
        ta.setSelectionRange(s, e); insert(t);
      } else if (r === 'search') {
        sBox.hidden = !sBox.hidden;
        if (sBox.hidden) { hits = []; cur = -1; render(); ta.focus(); } else { sIn.focus(); sIn.select(); doSearch(); }
      } else if (r === 'prev' || r === 'next') {
        if (!hits.length) return;
        cur = (cur + (r === 'next' ? 1 : -1) + hits.length) % hits.length;
        render(); reveal();
      } else if (r === 'close') hide();
    }
    function doSearch() { hits = findHits(text, sIn.value); cur = hits.length ? 0 : -1; render(); reveal(); }
    function reveal() {
      const c = backIn.querySelector('[data-cur]'); if (!c) return;
      const top = c.offsetTop;
      if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 30) { ta.scrollTop = Math.max(0, top - ta.clientHeight / 3); back.scrollTop = ta.scrollTop; }
    }
    function paint(color) {
      const [s, e] = sel();
      if (s === e) return say('文字を選んでから色を押してください');
      marks = paintMarks(marks, s, e, color); render(); emit();
      ta.focus(); ta.setSelectionRange(e, e);
    }

    // ツールバーのボタンを押しても、メモの選択範囲が消えないようにする
    win.querySelector('.memo-tools').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    win.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if ('color' in b.dataset) return paint(b.dataset.color);
      if (b.dataset.r) act(b.dataset.r);
    });
    ta.addEventListener('input', () => update(ta.value));
    ta.addEventListener('scroll', () => { back.scrollTop = ta.scrollTop; });
    sIn.addEventListener('input', doSearch);
    sIn.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); act(e.shiftKey ? 'prev' : 'next'); } if (e.key === 'Escape') act('search'); });
    trans.addEventListener('change', () => { win.classList.toggle('trans', trans.checked); ui.memoTrans = trans.checked; saveUi(); });
    draggable(win, win.querySelector('.tw-title'), () => { ui.memoX = win.offsetLeft; ui.memoY = win.offsetTop; saveUi(); });
    // 外枠のドラッグで大きさを変えたら覚える
    let rsT = null;
    new ResizeObserver(() => {
      if (win.hidden) return;
      render();
      clearTimeout(rsT); rsT = setTimeout(() => { ui.memoW = win.offsetWidth; ui.memoH = win.offsetHeight; saveUi(); }, 300);
    }).observe(win);

    function show() {
      if (!win.isConnected) document.body.appendChild(win);
      win.hidden = false; front(win);
      win.style.width = clamp(ui.memoW || 560, 300, innerWidth - 8) + 'px';
      win.style.height = clamp(ui.memoH || 420, 240, innerHeight - 8) + 'px';
      trans.checked = !!ui.memoTrans; win.classList.toggle('trans', trans.checked);
      place(win, ui.memoX == null ? (innerWidth - win.offsetWidth) / 2 : ui.memoX, ui.memoY == null ? 90 : ui.memoY);
      load(); ta.focus();
      setBtn('memo', true);
    }
    function hide() { win.hidden = true; setBtn('memo', false); }
    return {
      toggle() { if (win.hidden || !win.isConnected) show(); else hide(); },
      hide,
      setContext(c) { ctx = c; if (!win.hidden && win.isConnected) load(); },
    };
  })();

  root.WorkTools = {
    attachButtons(b) { Object.assign(buttons, b); },
    toggleCalc: () => Calc.toggle(),
    toggleMemo: () => Memo.toggle(),
    // ctx = { key, title, load(): { text, marks } | null, onChange({ text, marks }) }
    setContext: c => Memo.setContext(c),
    hideAll() { Calc.hide(); Memo.hide(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
