// ワーク演習（AI採点・CBT形式）
// - 左ペイン：実際の試験ページ画像（WORK_PAGES）／文字版（body）
// - 右ペイン：設問ごとの解答欄 → 中継サーバ /grade で Claude 採点
// - タイマー（経過・目安）、やり直し、採点履歴をこの端末（localStorage）に保存
// ※ ローカル専用（中継サーバから配信して使う）。公開PWAには含めない。

(() => {
  const PROBLEMS = (window.WORK_PROBLEMS || []).slice().sort(
    (a, b) => (b.year.localeCompare(a.year)) || a.section.localeCompare(b.section) || a.no - b.no);
  const PAGES = window.WORK_PAGES || {};

  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const limitSec = p => (p.section === 'pm2' ? 120 : 45) * 60; // 目安：午後Ⅱ=120分 / 午後Ⅰ=1問45分
  const fmt = s => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`;
  };

  // ---- 保存（localStorage ＋ ローカルサーバのファイル） --------------
  const BACKUP_TAG = 'nespe-work';
  let serverHist = false; // ローカルサーバの履歴保存(/history)が使えるか（起動時に判定）
  const Store = (() => {
    const KEY = 'nespe-work-v1';
    let data = {};
    try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem('nespe-work-at', String(Date.now())); } catch (_) {} syncToServer(); };
    return {
      q(key) { return data[key] || { answer: '', attempts: [] }; },
      setDraft(key, answer) { const q = this.q(key); q.answer = answer; data[key] = q; save(); },
      addAttempt(key, attempt) { const q = this.q(key); q.attempts = q.attempts || []; q.attempts.push(attempt); data[key] = q; save(); },
      timer(pid) { return (data[`${pid}:__timer`] || { sec: 0 }).sec; },
      setTimer(pid, sec) { data[`${pid}:__timer`] = { sec }; save(); },
      // やり直し：下書きとタイマーを消す（採点履歴は残す）
      retry(prob) {
        for (const qq of prob.questions) { const q = this.q(`${prob.id}:${qq.id}`); q.answer = ''; data[`${prob.id}:${qq.id}`] = q; }
        data[`${prob.id}:__timer`] = { sec: 0 };
        save();
      },
      doneCount(prob) { return prob.questions.filter(q => (this.q(`${prob.id}:${q.id}`).attempts || []).length).length; },
      // 旧仕様で履歴に相乗りしていた配点(__haiten)を取り出して履歴からは消す（Haitenへ移行）
      takeLegacyHaiten() { const h = data.__haiten; if (h) { delete data.__haiten; save(); } return (h && typeof h === 'object') ? h : null; },
      // バックアップ／復元用：保存データ全体の読み書き
      raw() { return data; },
      replaceAll(obj) { data = obj || {}; save(); },
    };
  })();

  // ---- 配点予想（履歴とは完全に別保存：別キー・別ファイル。履歴の上書きに巻き込まれない） ----
  // localStorage キー 'nespe-work-haiten-v1' と サーバの /haiten（server/haiten.json）に保存。
  // 読み込みは「マージ（既存を消さない）」なので、同期で配点が消える事故が起きない。
  const Haiten = (() => {
    const KEY = 'nespe-work-haiten-v1';
    let map = {};
    try { map = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) {}
    let putTimer = null;
    // savedAt は入れない（中身が変わらない限りファイルも変わらない＝Git差分が出ない）
    const payload = () => ({ app: BACKUP_TAG, haiten: map });
    const persist = () => {
      try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (_) {}
      if (serverHist) { clearTimeout(putTimer); putTimer = setTimeout(() => { fetch('/haiten', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) }).catch(() => {}); }, 600); }
    };
    const sum = h => Object.values(h).reduce((a, v) => a + (Number(v) > 0 ? Number(v) : 0), 0);
    return {
      haiten(pid, qid) { const h = map[`${pid}:${qid}`]; if (typeof h === 'number') return h > 0 ? h : null; if (h && typeof h === 'object') { const s = sum(h); return s > 0 ? s : null; } return null; },
      map(pid, qid) { const h = map[`${pid}:${qid}`]; return (h && typeof h === 'object') ? h : null; },
      field(pid, qid, label) { const h = this.map(pid, qid); const v = h ? Number(h[label]) : NaN; return v > 0 ? v : null; },
      setSingle(pid, qid, val) { const k = `${pid}:${qid}`, n = Number(val); if (n > 0) map[k] = n; else delete map[k]; persist(); },
      setField(pid, qid, label, val) { const k = `${pid}:${qid}`; const h = (map[k] && typeof map[k] === 'object') ? map[k] : {}; const n = Number(val); if (n > 0) h[label] = n; else delete h[label]; if (Object.keys(h).length) map[k] = h; else delete map[k]; persist(); },
      problemMax(prob) { return prob.questions.reduce((s, q) => s + (this.haiten(prob.id, q.id) || 0), 0); },
      // マージ取り込み（既存キーは残す＝ローカル優先。無いキーだけ足す）。消えない。
      mergeIn(obj) { let ch = false; for (const [k, v] of Object.entries(obj || {})) { if (!(k in map) && v != null) { map[k] = v; ch = true; } } if (ch) persist(); return ch; },
      raw() { return map; },
      flush() { if (!serverHist) return Promise.resolve(false); clearTimeout(putTimer); return fetch('/haiten', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) }).then(r => r.ok).catch(() => false); },
      pushUp() { if (serverHist && Object.keys(map).length) persist(); },
    };
  })();

  // ---- サーバ状態 ----------------------------------------------------
  let serverOk = false;
  async function checkServer() {
    const banner = $('#server-banner');
    try {
      const r = await fetch('/health', { cache: 'no-store' });
      const j = await r.json();
      if (!j.hasKey) {
        serverOk = false;
        banner.innerHTML = `<div class="banner warn">中継サーバは起動していますが <b>APIキーが未設定</b>です。<code>server/.env</code> に <code>ANTHROPIC_API_KEY</code> を設定して再起動してください。</div>`;
      } else {
        serverOk = true;
        banner.innerHTML = `<div class="banner">AI採点 利用可能（モデル：<code>${esc(j.model)}</code>）。</div>`;
      }
    } catch (_) {
      serverOk = false;
      banner.innerHTML = `<div class="banner warn">AI採点を使うには中継サーバが必要です。<code>node server/relay.js</code> を実行し <code>http://localhost:8787/apps/work.html</code> を開いてください（このアプリはローカル専用です）。</div>`;
    }
  }

  // ---- 問題選択 ------------------------------------------------------
  let fYear = 'all', fSec = 'all';
  function chips(container, items, active, onPick) {
    container.innerHTML = items.map(i => `<button data-v="${i.v}" class="${i.v === active ? 'active' : ''}">${esc(i.label)}</button>`).join('');
    container.onclick = e => { const b = e.target.closest('button'); if (!b) return; onPick(b.dataset.v); };
  }
  function years() {
    const ys = [...new Set(PROBLEMS.map(p => p.year))];
    const label = y => (PROBLEMS.find(p => p.year === y) || {}).yearLabel || y;
    return [{ v: 'all', label: 'すべて' }, ...ys.map(y => ({ v: y, label: label(y) }))];
  }
  function sections() { return [{ v: 'all', label: 'すべて' }, { v: 'pm1', label: '午後Ⅰ' }, { v: 'pm2', label: '午後Ⅱ' }]; }

  function renderPicker() {
    chips($('#year-chips'), years(), fYear, v => { fYear = v; renderPicker(); });
    chips($('#section-chips'), sections(), fSec, v => { fSec = v; renderPicker(); });
    const list = PROBLEMS.filter(p => (fYear === 'all' || p.year === fYear) && (fSec === 'all' || p.section === fSec));
    $('#prob-list').innerHTML = list.length ? list.map(p => {
      const done = Store.doneCount(p), total = p.questions.length;
      const hasData = p.questions.some(q => { const s = Store.q(`${p.id}:${q.id}`); return (s.attempts && s.attempts.length) || (s.answer && s.answer.trim()); });
      return `<div class="prob-item">
        <button class="prob-open" data-id="${p.id}">
          <span class="tag">${esc(p.yearLabel)}　${esc(p.sectionLabel)}　問${p.no}</span>
          <div class="ttl">${esc(p.title)}${done ? `<span class="done">解答済 ${done}/${total}</span>` : ''}</div>
        </button>
        ${hasData ? `<button class="hist-btn" data-id="${p.id}" title="過去の解答・採点を見る">履歴</button>` : ''}
      </div>`;
    }).join('') : `<p class="muted">該当する問題がありません。</p>`;
    $('#prob-list').onclick = e => {
      const hb = e.target.closest('.hist-btn'); if (hb) return void openHistory(hb.dataset.id);
      const ob = e.target.closest('.prob-open'); if (ob) openProblem(ob.dataset.id);
    };
  }

  // ---- 本文（文字版）描画 --------------------------------------------
  function renderBody(blocks) {
    return `<div class="passage">` + blocks.map(b => {
      switch (b.t) {
        case 'p': return `<p>${esc(b.text)}</p>`;
        case 'h': return `<h4>${esc(b.text)}</h4>`;
        case 'note': return `<p class="note">${esc(b.text)}</p>`;
        case 'ul': return `<ul>${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
        case 'fig': return `<figure><img src="${esc(b.src)}" alt="${esc(b.cap || '図')}" loading="lazy"><figcaption>${esc(b.cap || '')}</figcaption></figure>`;
        case 'table': return `<table>${b.cap ? `<caption>${esc(b.cap)}</caption>` : ''}
          <thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        default: return '';
      }
    }).join('') + `</div>`;
  }
  function bodyToText(blocks) {
    return blocks.map(b => {
      if (b.t === 'p' || b.t === 'h' || b.t === 'note') return b.text;
      if (b.t === 'ul') return b.items.map(i => '・' + i).join('\n');
      if (b.t === 'fig') return `［${b.cap || '図'}（図は別途表示）］`;
      if (b.t === 'table') return `${b.cap || '表'}\n` + [b.head, ...b.rows].map(r => r.join(' | ')).join('\n');
      return '';
    }).filter(Boolean).join('\n');
  }

  // ---- タイマー ------------------------------------------------------
  const Timer = (() => {
    let pid = null, sec = 0, limit = 0, running = false, iv = null;
    function paint() {
      $('#t-clock').textContent = fmt(sec);
      const t = $('#timer');
      t.classList.toggle('over', limit && sec >= limit);
      t.classList.toggle('paused', !running);
      $('#t-toggle').textContent = running ? '一時停止' : '再開';
    }
    function tick() { sec++; if (sec % 5 === 0) Store.setTimer(pid, sec); paint(); }
    return {
      start(p) { this.stop(); pid = p.id; limit = limitSec(p); sec = Store.timer(pid); running = true;
        $('#t-limit').textContent = `/ 目安 ${fmt(limit)}`; paint(); iv = setInterval(tick, 1000); },
      toggle() { running = !running; if (running) iv = setInterval(tick, 1000); else { clearInterval(iv); Store.setTimer(pid, sec); } paint(); },
      pause() { if (running) { running = false; clearInterval(iv); Store.setTimer(pid, sec); paint(); } },
      reset() { sec = 0; Store.setTimer(pid, sec); paint(); },
      stop() { if (iv) clearInterval(iv); iv = null; if (pid) Store.setTimer(pid, sec); },
      get sec() { return sec; },
    };
  })();

  // ---- 左右入れ替え（端末に保存） ------------------------------------
  let swapped = false;
  try { swapped = localStorage.getItem('nespe-work-swap') === '1'; } catch (_) {}
  function applySwap() {
    const c = $('#cbt'); if (c) c.classList.toggle('swap', swapped);
    const b = $('#swap'); if (b) b.classList.toggle('active', swapped);
  }

  // ---- 演習表示 ------------------------------------------------------
  let current = null, view = 'image', zoom = 100;

  function openProblem(id) {
    const p = PROBLEMS.find(x => x.id === id);
    if (!p) return;
    current = p;
    document.body.classList.add('solving');
    $('#pick').hidden = true;
    const solve = $('#solve'); solve.hidden = false; solve.classList.add('on');
    $('#s-title').textContent = `${p.yearLabel} ${p.sectionLabel} 問${p.no}　${p.title}`;
    $('#s-overview').textContent = p.overview ? `出題趣旨：${p.overview}` : '';
    $('#s-source').innerHTML = p.source ? `出典：<a href="${esc(p.source)}" target="_blank" rel="noopener">IPA 公開問題</a>` : '';
    view = (PAGES[p.id] && PAGES[p.id].length) ? 'image' : 'text';
    zoom = 100;
    renderExam();
    renderViewSeg();
    $('#s-questions').innerHTML = p.questions.map(q => renderQuestion(p, q)).join('');
    bindQuestions(p);
    $('#grade-summary').innerHTML = '';
    $('#grade-all-note').textContent = `全${p.questions.length}問。書けた分だけでも提出できます`;
    Timer.start(p);
    applySwap();
    $('#exam-body').scrollTop = 0; $('#answer-pane').scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function renderExam() {
    const p = current, body = $('#exam-body');
    const hasImg = PAGES[p.id] && PAGES[p.id].length;
    $('#zoom-ctl').style.visibility = (view === 'image' && hasImg) ? 'visible' : 'hidden';
    if (view === 'image' && hasImg) {
      body.innerHTML = `<div class="exam-pages" style="--zoom:${zoom}%">` +
        PAGES[p.id].map((src, i) => `<img src="${esc(src)}" alt="${esc(p.title)} ページ${i + 1}" loading="lazy">`).join('') + `</div>`;
    } else {
      body.innerHTML = renderBody(p.body);
    }
  }
  function renderViewSeg() {
    const hasImg = PAGES[current.id] && PAGES[current.id].length;
    $('#view-seg').innerHTML =
      `<button data-view="image" class="${view === 'image' ? 'active' : ''}"${hasImg ? '' : ' disabled'}>実問題</button>` +
      `<button data-view="text" class="${view === 'text' ? 'active' : ''}">文字版</button>`;
  }

  // ---- 解答欄を解答例から自動生成（答案用紙を参考にした構造） -----------
  // 解答例は「ラベル：値　ラベル：値」(全角コロン＋全角スペース) か「・項目　・項目」で
  // 統一されているので、そこから解答欄の構造を復元する（答えは出さず、欄とラベルだけ作る）。
  //   labeled … a/b/c・認証/認可・大阪本社/東京支社 などラベル付きの複数ボックス
  //   bullets … 「四つ答えよ」などの ・箇条書き（番号付きの複数ボックス）
  //   single  … 1つの記述欄
  const splitFW = s => String(s || '').split(/　+/).map(x => x.trim()).filter(Boolean);
  const isNote = s => /^[（(].*[）)]$/.test(s); // 「（順不同）」などの注記（解答欄ではない）
  const contentSegs = s => splitFW(s).filter(x => !isNote(x));
  const ENUM = /^([①-⑳])\s*(.*)$/; // ①〜⑳ で始まる連番項目か
  // 「ラベル：値」の並び。さらに「ラベル：①項目　②項目　③項目」のように丸数字で
  // 連番項目がぶら下がる場合は、ラベル①/ラベル②/… と1項目ずつの欄に分解する。
  function parseLabeled(str) {
    const segs = contentSegs(str);
    if (!segs.length) return null;
    const out = [];
    let group = null;
    for (const seg of segs) {
      const i = seg.indexOf('：');
      if (i > 0 && i <= 20 && !/[。、]/.test(seg.slice(0, i))) {
        const label = seg.slice(0, i).trim(), rest = seg.slice(i + 1).trim();
        const em = ENUM.exec(rest);
        if (em) out.push({ label: label + em[1], value: em[2].trim() }); // ラベル＋①
        else out.push({ label, value: rest });
        group = label;
      } else {
        const em = ENUM.exec(seg); // 直前ラベルに続く ②③… の連番項目
        if (em && group) out.push({ label: group + em[1], value: em[2].trim() });
        else return null; // 解釈できない → ラベル付き扱いにしない
      }
    }
    return out.length ? out : null;
  }
  // 設問文が「複数答えさせている」か（二つ/四つ/それぞれ/全て答えよ 等）。
  // これに当てはまらない箇条書き解答例は「別解の列挙」とみなし、1欄にする。
  function asksMultiple(q) {
    const t = q.prompt || '';
    return /([一二三四五六七八九十]|[0-9０-９]+)\s*つ/.test(t) || /それぞれ/.test(t) || /(全て|すべて).{0,6}(答え|挙げ|示せ|記)/.test(t);
  }
  function answerShape(q) {
    const labeled = parseLabeled(q.answer);
    if (labeled) return { mode: 'labeled', fields: labeled.map(b => b.label) };
    const segs = contentSegs(q.answer);
    // グループラベル無しの連番リスト（①X　②Y　③Z…）→ 丸数字ごとの欄
    // （「①，②，⑤，⑥」のようにスペース区切りでない＝1セグメントのものは選択解答なので対象外）
    if (segs.length >= 2 && segs.every(s => ENUM.test(s))) return { mode: 'labeled', fields: segs.map(s => ENUM.exec(s)[1]) };
    const bullets = segs.filter(s => s.startsWith('・'));
    if (bullets.length >= 2 && bullets.length === segs.length && asksMultiple(q)) return { mode: 'bullets', fields: bullets.map((_, i) => `${i + 1}`) };
    return { mode: 'single', fields: [] };
  }
  const labeledValue = (savedStr, label) => { const f = (parseLabeled(savedStr) || []).find(b => b.label === label); return f ? f.value : ''; };
  const bulletValues = savedStr => splitFW(savedStr).map(s => s.replace(/^・/, '').trim());
  const limitNum = q => { const m = /(\d+)/.exec(q.charLimit || ''); return m ? Number(m[1]) : 0; };
  // 1枚のカードから現在の解答文字列を組み立てる（空欄は除くので未入力判定は trim() で効く）
  function cardAnswer(card) {
    const mode = card.dataset.mode;
    if (mode === 'labeled') return [...card.querySelectorAll('[data-label]')].map(el => ({ l: el.dataset.label, v: el.value.trim() })).filter(x => x.v).map(x => `${x.l}：${x.v}`).join('　');
    if (mode === 'bullets') return [...card.querySelectorAll('[data-bullet]')].map(el => el.value.trim()).filter(Boolean).map(v => `・${v}`).join('　');
    const ta = card.querySelector('textarea'); return (ta ? ta.value : '').trim();
  }
  function cardMatchesSaved(shape, savedStr) {
    if (shape.mode === 'labeled') return (parseLabeled(savedStr) || []).some(b => shape.fields.includes(b.label));
    if (shape.mode === 'bullets') return splitFW(savedStr).some(s => s.startsWith('・'));
    return true;
  }

  function renderQuestion(p, q) {
    const key = `${p.id}:${q.id}`;
    const saved = Store.q(key);
    const shape = answerShape(q);
    const inp = (attr, val) => `<input type="text" class="fld-input" ${attr} value="${esc(val)}" placeholder="解答">`;
    let inputArea = '';
    if (shape.mode === 'labeled') {
      inputArea = `<div class="fields">` + shape.fields.map(lb => {
        const v = labeledValue(saved.answer, lb);
        const field = (q.type === 'fill')
          ? inp(`data-label="${esc(lb)}"`, v)
          : `<textarea class="fld-input" data-label="${esc(lb)}" rows="2" placeholder="解答">${esc(v)}</textarea>`;
        return `<label class="field"><span class="field-label">${esc(lb)}</span>${field}</label>`;
      }).join('') + `</div>`;
    } else if (shape.mode === 'bullets') {
      const vals = bulletValues(saved.answer);
      inputArea = `<div class="fields">` + shape.fields.map((n, i) =>
        `<label class="field"><span class="field-label">${esc(n)}</span>${inp(`data-bullet="${i}"`, vals[i] || '')}</label>`
      ).join('') + `</div>`;
    } else {
      inputArea = `<textarea placeholder="ここに解答を入力">${esc(saved.answer || '')}</textarea>`;
    }
    // 旧・自由記述の下書きが新しい欄に移せない場合は、消さずに注記で残す
    let legacy = '';
    if (shape.mode !== 'single' && (saved.answer || '').trim() && !cardMatchesSaved(shape, saved.answer)) {
      legacy = `<p class="legacy-draft">以前の下書き：${esc(saved.answer)}<br>（新しい欄に未変換。必要なら上の欄に入れ直してください）</p>`;
    }
    return `<div class="setq" data-qid="${esc(q.id)}" data-mode="${shape.mode}" data-limit="${limitNum(q)}">
      ${q.group ? `<p class="group">${esc(q.group)}</p>` : ''}
      <p class="prompt"><span class="qid">${esc(q.id)}</span>${esc(q.prompt)}${q.charLimit ? `<span class="limit">（${esc(q.charLimit)}）</span>` : ''}${Haiten.haiten(p.id, q.id) ? `<span class="haiten-tag">配点 ${Haiten.haiten(p.id, q.id)}点</span>` : ''}</p>
      ${inputArea}${legacy}
      <div class="count"></div>
      <div class="row">
        <button class="btn primary grade">AIに採点してもらう</button>
        <button class="btn small toggle-model">模範解答を見る</button>
      </div>
      <div class="model result" hidden><h5>公式解答例</h5><div class="model-box"></div></div>
      <div class="grade-result"></div>
    </div>`;
  }

  function bindQuestions(p) {
    $('#s-questions').querySelectorAll('.setq').forEach(card => {
      const qid = card.dataset.qid;
      const q = p.questions.find(x => x.id === qid);
      const key = `${p.id}:${qid}`;
      const mode = card.dataset.mode;
      const limit = Number(card.dataset.limit) || 0;
      const count = card.querySelector('.count');
      const inputs = [...card.querySelectorAll('.fld-input, textarea')];
      const updateCount = () => {
        const ans = cardAnswer(card);
        if (mode === 'labeled' || mode === 'bullets') {
          const total = card.querySelectorAll('[data-label],[data-bullet]').length;
          const filled = (mode === 'labeled') ? (parseLabeled(ans) || []).length : splitFW(ans).length;
          count.textContent = `${filled} / ${total} 欄 入力`;
          count.classList.remove('over');
        } else {
          const n = [...ans].length;
          count.textContent = limit ? `${n} / ${limit} 字` : `${n} 字`;
          count.classList.toggle('over', !!limit && n > limit);
        }
      };
      updateCount();
      const onInput = () => { updateCount(); Store.setDraft(key, cardAnswer(card)); };
      inputs.forEach(el => el && el.addEventListener('input', onInput));
      card.querySelector('.toggle-model').addEventListener('click', () => {
        const box = card.querySelector('.model'); box.hidden = !box.hidden;
        box.querySelector('.model-box').textContent = q.answer || '(なし)';
      });
      const saved = Store.q(key);
      if (saved.attempts && saved.attempts.length) showResult(card, key);
      card.querySelector('.grade').addEventListener('click', () => gradeOne(p, q, card, key));
    });
  }

  // ---- 採点 ----------------------------------------------------------
  async function runGrade(p, q, card, key, answer) {
    const out = card.querySelector('.grade-result');
    out.innerHTML = `<p class="spinner">Claude が採点中…</p>`;
    try {
      const scoreMax = Haiten.haiten(p.id, q.id); // 配点予想（設問の満点）。未設定なら null
      const hMap = Haiten.map(p.id, q.id);        // 空欄別配点 {ラベル:点数}（あれば）
      const scoreBreakdown = hMap ? Object.entries(hMap).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}=${v}点`).join('、') : '';
      const r = await fetch('/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `${p.yearLabel} ${p.sectionLabel} 問${p.no}「${p.title}」\n${p.overview || ''}\n\n${bodyToText(p.body)}`,
          questionNo: q.id, questionText: q.prompt, charLimit: q.charLimit || '',
          officialAnswer: q.answer || '', commentary: p.commentary || '', studentAnswer: answer,
          scoreMax: scoreMax || undefined, scoreBreakdown: scoreBreakdown || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) { out.innerHTML = `<p class="err">採点エラー：${esc(j.error || r.status)}${j.detail ? '<br>' + esc(j.detail) : ''}</p>`; return null; }
      // 配点予想があれば満点を固定し、点数をその範囲に収める
      if (scoreMax) { j.scoreMax = scoreMax; if (typeof j.score === 'number') j.score = Math.max(0, Math.min(scoreMax, j.score)); }
      Store.addAttempt(key, { at: Date.now(), elapsed: Timer.sec, answer, result: j });
      showResult(card, key);
      return j; // 記録ファイルの保存は呼び出し側（1採点＝1ファイル）で行う
    } catch (e) {
      out.innerHTML = `<p class="err">通信に失敗しました：${esc(e.message)}</p>`;
      return null;
    }
  }

  async function gradeOne(p, q, card, key) {
    const answer = cardAnswer(card);
    const out = card.querySelector('.grade-result');
    if (!answer) { out.innerHTML = `<p class="err">解答を入力してください。</p>`; return; }
    if (!serverOk) { out.innerHTML = `<p class="err">中継サーバが利用できません。<code>node server/relay.js</code> を起動してください。</p>`; return; }
    const btn = card.querySelector('.grade'); btn.disabled = true;
    const j = await runGrade(p, q, card, key, answer);
    btn.disabled = false;
    if (j) saveRecord(p); // 単問採点：成功したら記録を1ファイル保存
  }

  // まとめて採点（提出）：入力済みの設問を一括採点し、合計点を表示（本番に近い流れ）
  async function gradeAll() {
    const p = current; if (!p) return;
    if (!serverOk) { $('#grade-summary').innerHTML = `<div class="banner warn">中継サーバが利用できません。<code>node server/relay.js</code> を起動してください。</div>`; return; }
    const cards = {};
    $('#s-questions').querySelectorAll('.setq').forEach(c => { cards[c.dataset.qid] = c; });
    const items = p.questions.map(q => {
      const card = cards[q.id];
      return { q, card, key: `${p.id}:${q.id}`, answer: cardAnswer(card) };
    });
    const answered = items.filter(x => x.answer);
    const empties = items.length - answered.length;
    if (!answered.length) { $('#grade-summary').innerHTML = `<p class="err">解答がまだ入力されていません。</p>`; return; }
    if (!confirm(`入力済みの ${answered.length} 問をまとめて採点します。${empties ? `（未入力 ${empties} 問は採点されません）` : ''}\nよろしいですか？`)) return;
    Timer.pause();
    const btn = $('#grade-all'); btn.disabled = true;
    const sum = $('#grade-summary');
    let done = 0;
    const prog = () => { sum.innerHTML = `<div class="batch-sum"><span class="spinner">採点中… ${done} / ${answered.length}</span></div>`; };
    prog();
    const results = [];
    const queue = answered.slice();
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        results.push(await runGrade(p, it.q, it.card, it.key, it.answer));
        done++; prog();
      }
    };
    await Promise.all([worker(), worker(), worker()]); // 最大3並列
    renderBatchSummary(results, empties);
    btn.disabled = false;
    if (results.some(Boolean)) saveRecord(p); // まとめて採点：全問終わってから記録を1ファイルだけ保存
  }
  function renderBatchSummary(results, empties) {
    const ok = results.filter(r => r && r.verdict === '正解').length;
    const part = results.filter(r => r && r.verdict === '部分正解').length;
    const ng = results.filter(r => r && r.verdict === '不正解').length;
    const failed = results.filter(r => !r).length;
    const score = results.reduce((a, r) => a + (r && typeof r.score === 'number' ? r.score : 0), 0);
    const max = results.reduce((a, r) => a + (r && typeof r.scoreMax === 'number' ? r.scoreMax : (r ? 10 : 0)), 0);
    $('#grade-summary').innerHTML = `<div class="batch-sum">
      <div class="batch-score">採点結果　得点 ${score} / ${max}</div>
      <div class="batch-breakdown">
        <span class="verdict ok">正解 ${ok}</span>
        <span class="verdict part">部分正解 ${part}</span>
        <span class="verdict ng">不正解 ${ng}</span>
        ${failed ? `<span class="muted">採点失敗 ${failed}</span>` : ''}
        ${empties ? `<span class="muted">未入力 ${empties}</span>` : ''}
        <span class="muted">所要 ${fmt(Timer.sec)}</span>
      </div>
      <p class="muted">各設問の詳細は下の採点結果へ。もう一度解くなら「やり直す」。</p>
    </div>`;
    $('#grade-summary').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function resultHtml(j) {
    const vClass = j.verdict === '正解' ? 'ok' : j.verdict === '部分正解' ? 'part' : j.verdict === '不正解' ? 'ng' : '';
    const list = (arr, cls) => (arr && arr.length) ? `<ul class="${cls}">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    if (j.raw) return `<p class="err">採点結果を解釈できませんでした。</p><pre>${esc(j.raw)}</pre>`;
    return `
      <span class="verdict ${vClass}">${esc(j.verdict || '判定')}</span>
      ${j.score != null ? `<span class="score">${esc(j.score)} / ${esc(j.scoreMax ?? 10)} 点</span>` : ''}
      ${j.good && j.good.length ? `<h5>加点できる点</h5>${list(j.good, 'good')}` : ''}
      ${j.missing && j.missing.length ? `<h5>不足・誤り</h5>${list(j.missing, 'miss')}` : ''}
      ${j.diff ? `<h5>解答例との差分</h5><p>${esc(j.diff)}</p>` : ''}
      ${j.advice ? `<h5>アドバイス</h5><p>${esc(j.advice)}</p>` : ''}
      ${j.modelAnswer ? `<h5>模範解答</h5><div class="model">${esc(j.modelAnswer)}</div>` : ''}`;
  }

  const verdictClass = v => v === '正解' ? 'ok' : v === '部分正解' ? 'part' : v === '不正解' ? 'ng' : '';
  const stamp = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  // 採点のたびに「回」として別々に保存し、各回の全内容を見返せる
  function showResult(card, key) {
    const attempts = (Store.q(key).attempts || []);
    if (!attempts.length) return;
    const out = card.querySelector('.grade-result');
    const n = attempts.length;
    const latest = attempts[n - 1];
    const meta = a => `<span class="hist-meta">${stamp(a.at)}・経過 ${fmt(a.elapsed || 0)}</span>`;
    const head = (a, no) => { const v = a.result || {}; return `${no}回目　<span class="verdict ${verdictClass(v.verdict)}">${esc(v.verdict || '-')}</span>${v.score != null ? ` <span class="score">${esc(v.score)} / ${esc(v.scoreMax ?? 10)}点</span>` : ''}　${meta(a)}`; };
    const full = a => `<div class="attempt-answer"><b>この回の解答：</b>${esc(a.answer)}</div><div class="result">${resultHtml(a.result)}</div>`;
    const past = attempts.slice(0, -1); // 0..n-2 が過去回（1回目..n-1回目）
    const history = past.length ? `
      <details class="history"><summary>これまでの採点（${past.length}回）を見返す</summary>
        ${past.map((a, i) => `<details class="attempt"><summary>${head(a, i + 1)}</summary>${full(a)}</details>`).reverse().join('')}
      </details>` : '';
    out.innerHTML = `<div class="result">
      <div class="attempt-head latest">最新（${n}回目）　${meta(latest)}</div>
      ${resultHtml(latest.result)}
      <div class="attempt-answer"><b>この回の解答：</b>${esc(latest.answer)}</div>
      ${history}</div>`;
  }

  // ---- 過去の解答・採点（読み取り専用ビュー） ------------------------
  let historyPid = null;
  const attemptBadge = j => { j = j || {}; return `<span class="verdict ${verdictClass(j.verdict)}">${esc(j.verdict || '-')}</span>${j.score != null ? ` <span class="score">${esc(j.score)} / ${esc(j.scoreMax ?? 10)}点</span>` : ''}`; };
  function openHistory(id) {
    const p = PROBLEMS.find(x => x.id === id); if (!p) return;
    historyPid = p.id;
    $('#pick').hidden = true;
    const h = $('#history'); h.hidden = false;
    $('#h-title').textContent = `${p.yearLabel} ${p.sectionLabel} 問${p.no}　${p.title}`;
    renderHistory(p);
    window.scrollTo(0, 0);
  }
  function renderHistory(p) {
    $('#history-body').innerHTML = p.questions.map(q => {
      const saved = Store.q(`${p.id}:${q.id}`);
      const attempts = saved.attempts || [];
      const draft = (saved.answer || '').trim();
      let inner;
      if (!attempts.length) {
        inner = draft
          ? `<div class="hist-attempt"><div class="attempt-head">未採点の下書き</div><div class="attempt-answer">${esc(draft)}</div></div>`
          : `<p class="muted">まだ解答していません。</p>`;
      } else {
        inner = attempts.map((a, i) => ({ a, no: i + 1 })).reverse().map(({ a, no }) =>
          `<details class="attempt"${no === attempts.length ? ' open' : ''}>
            <summary>第${no}回　${attemptBadge(a.result)}　<span class="hist-meta">${stamp(a.at)}・経過 ${fmt(a.elapsed || 0)}</span></summary>
            <div class="attempt-answer"><b>解答：</b>${esc(a.answer)}</div>
            <div class="result">${resultHtml(a.result || {})}</div>
          </details>`).join('');
        if (draft && draft !== (attempts[attempts.length - 1].answer || '').trim())
          inner += `<div class="hist-attempt"><div class="attempt-head">現在の下書き（未採点）</div><div class="attempt-answer">${esc(draft)}</div></div>`;
      }
      return `<div class="hist-q">
        <p class="prompt"><span class="qid">${esc(q.id)}</span>${esc(q.prompt)}${q.charLimit ? `<span class="limit">（${esc(q.charLimit)}）</span>` : ''}</p>
        ${inner}
        <details class="hist-model"><summary>公式解答例を見る</summary><div class="model-box">${esc(q.answer || '(なし)')}</div></details>
      </div>`;
    }).join('');
  }
  $('#hist-to-list').addEventListener('click', e => {
    e.preventDefault();
    $('#history').hidden = true; $('#pick').hidden = false;
    renderPicker(); window.scrollTo(0, 0);
  });
  $('#h-open').addEventListener('click', () => { $('#history').hidden = true; if (historyPid) openProblem(historyPid); });

  // ---- 配点設定（設問ごとの満点＝配点予想） --------------------------
  function openHaiten(selId) {
    $('#pick').hidden = true; $('#haiten').hidden = false;
    const sel = $('#haiten-select');
    sel.innerHTML = PROBLEMS.map(p => `<option value="${p.id}">${esc(p.yearLabel)} ${esc(p.sectionLabel)} 問${p.no}　${esc(p.title)}</option>`).join('');
    if (selId) sel.value = selId;
    renderHaiten(sel.value);
    window.scrollTo(0, 0);
  }
  function renderHaiten(pid) {
    const p = PROBLEMS.find(x => x.id === pid); if (!p) return;
    const numInput = attr => `<input type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="—" ${attr}>`;
    const rows = p.questions.map(q => {
      const shape = answerShape(q);
      let fields;
      if (shape.mode === 'single') {
        const v = Haiten.haiten(p.id, q.id);
        fields = `<div class="haiten-field">${numInput(`data-single="1" value="${v == null ? '' : v}"`)} 点</div>`;
      } else {
        fields = shape.fields.map(lb => {
          const v = Haiten.field(p.id, q.id, lb);
          return `<div class="haiten-field"><span class="hf-label">${esc(lb)}</span>${numInput(`data-label="${esc(lb)}" value="${v == null ? '' : v}"`)} 点</div>`;
        }).join('') + `<div class="haiten-subtotal">小計 <b>${Haiten.haiten(p.id, q.id) || 0}</b> 点</div>`;
      }
      return `<div class="haiten-q" data-qid="${esc(q.id)}">
        <p class="prompt"><span class="qid">${esc(q.id)}</span>${esc(q.prompt)}</p>
        <div class="haiten-fields">${fields}</div>
      </div>`;
    }).join('');
    $('#haiten-body').innerHTML = rows + `<p class="haiten-total">問題の合計：<b id="haiten-sum">${Haiten.problemMax(p)}</b> 点</p>`;
    $('#haiten-body').querySelectorAll('.haiten-q').forEach(qEl => {
      const qid = qEl.dataset.qid;
      const subEl = qEl.querySelector('.haiten-subtotal b');
      qEl.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
        if (inp.dataset.single) Haiten.setSingle(p.id, qid, inp.value);
        else Haiten.setField(p.id, qid, inp.dataset.label, inp.value);
        if (subEl) subEl.textContent = Haiten.haiten(p.id, qid) || 0;
        $('#haiten-sum').textContent = Haiten.problemMax(p);
      }));
    });
  }
  $('#open-haiten').addEventListener('click', () => openHaiten());
  $('#haiten-select').addEventListener('change', e => renderHaiten(e.target.value));
  $('#haiten-save').addEventListener('click', async () => {
    const btn = $('#haiten-save'), label = btn.textContent;
    btn.disabled = true; btn.textContent = '保存中…';
    const ok = await Haiten.flush();
    btn.textContent = ok ? '保存しました ✓' : '保存（この端末に）✓';
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2000);
  });
  $('#haiten-to-list').addEventListener('click', e => { e.preventDefault(); $('#haiten').hidden = true; $('#pick').hidden = false; renderPicker(); window.scrollTo(0, 0); });

  // ---- 学習状況（達成度ダッシュボード） ------------------------------
  function problemStats(p) {
    let graded = 0, score = 0, max = 0, rounds = 0, lastAt = 0;
    for (const q of p.questions) {
      const at = Store.q(`${p.id}:${q.id}`).attempts || [];
      if (!at.length) continue;
      graded++; rounds = Math.max(rounds, at.length);
      const latest = at[at.length - 1], r = latest.result || {};
      score += (typeof r.score === 'number' ? r.score : 0);
      max += (Haiten.haiten(p.id, q.id) || (typeof r.scoreMax === 'number' ? r.scoreMax : 10));
      lastAt = Math.max(lastAt, latest.at || 0);
    }
    return { graded, total: p.questions.length, score, max, rounds, lastAt, time: Store.timer(p.id) || 0 };
  }
  const hhmm = sec => { sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}時間${m}分` : `${m}分`; };
  const dayStamp = ts => { if (!ts) return '—'; const d = new Date(ts), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}/${z(d.getMonth() + 1)}/${z(d.getDate())}`; };
  const bar = pct => `<span class="pbar"><span class="pbar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></span></span>`;

  function openProgress() {
    $('#pick').hidden = true; $('#progress').hidden = false;
    renderProgress(); window.scrollTo(0, 0);
  }
  function renderProgress() {
    const rows = PROBLEMS.map(p => ({ p, s: problemStats(p) }));
    const touched = rows.filter(x => x.s.graded > 0).length;
    const completed = rows.filter(x => x.s.graded === x.s.total).length;
    const totalTime = rows.reduce((a, x) => a + x.s.time, 0);
    const gradedQ = rows.reduce((a, x) => a + x.s.graded, 0);
    const totScore = rows.reduce((a, x) => a + x.s.score, 0), totMax = rows.reduce((a, x) => a + x.s.max, 0);
    const pct = totMax ? Math.round(totScore / totMax * 100) : 0;
    const secPct = sec => { const g = rows.filter(x => x.p.section === sec); const t = g.filter(x => x.s.graded > 0).length; return { t, n: g.length, pct: g.length ? Math.round(t / g.length * 100) : 0 }; };
    const pm1 = secPct('pm1'), pm2 = secPct('pm2');
    const left = PROBLEMS.length - touched;
    const cheer = completed === PROBLEMS.length ? '🎉 全問制覇！おみごとです。'
      : touched === 0 ? 'まずは1問、挑戦してみましょう。'
      : `あと ${left} 問で全問に挑戦達成。いいペースです！`;

    const cards = `
      <div class="prog-cards">
        <div class="prog-card"><div class="pc-num">${touched}<span class="pc-den"> / ${PROBLEMS.length}</span></div><div class="pc-lbl">挑戦した問題</div></div>
        <div class="prog-card"><div class="pc-num">${completed}<span class="pc-den"> / ${PROBLEMS.length}</span></div><div class="pc-lbl">完答した問題</div></div>
        <div class="prog-card"><div class="pc-num">${gradedQ}</div><div class="pc-lbl">採点した設問</div></div>
        <div class="prog-card"><div class="pc-num">${hhmm(totalTime)}</div><div class="pc-lbl">学習時間</div></div>
        <div class="prog-card"><div class="pc-num">${pct}<span class="pc-den">%</span></div><div class="pc-lbl">平均得点率</div></div>
      </div>`;

    const sections = `
      <div class="prog-sec">
        <div class="ps-row"><span class="ps-name">午後Ⅰ</span>${bar(pm1.pct)}<span class="ps-val">${pm1.t} / ${pm1.n} 問</span></div>
        <div class="ps-row"><span class="ps-name">午後Ⅱ</span>${bar(pm2.pct)}<span class="ps-val">${pm2.t} / ${pm2.n} 問</span></div>
      </div>`;

    const table = `<div class="prog-list">` + rows.map(({ p, s }) => {
      const donePct = Math.round(s.graded / s.total * 100);
      const scorePct = s.max ? Math.round(s.score / s.max * 100) : 0;
      const state = s.graded === 0 ? 'none' : s.graded === s.total ? 'done' : 'part';
      const badge = state === 'done' ? '<span class="pstate done">完答</span>' : state === 'part' ? '<span class="pstate part">着手</span>' : '<span class="pstate none">未</span>';
      return `<button class="prog-item" data-id="${p.id}">
        <div class="pi-head"><span class="pi-tag">${esc(p.yearLabel)} ${esc(p.sectionLabel)} 問${p.no}</span>${badge}</div>
        <div class="pi-ttl">${esc(p.title)}</div>
        <div class="pi-metrics">
          <span class="pi-m">完答 ${s.graded}/${s.total} ${bar(donePct)}</span>
          <span class="pi-m">${s.graded ? `得点 ${s.score}/${s.max}（${scorePct}%）` : '—'}</span>
          <span class="pi-m">${s.rounds ? `${s.rounds}周` : ''}</span>
          <span class="pi-m muted">${s.time ? hhmm(s.time) : ''}${s.lastAt ? '・' + dayStamp(s.lastAt) : ''}</span>
        </div>
      </button>`;
    }).join('') + `</div>`;

    $('#progress-body').innerHTML = `<p class="prog-cheer">${cheer}</p>${cards}${sections}
      <p class="prog-overall">全体の得点率 ${bar(pct)} <b>${pct}%</b>（採点済み設問の最新得点ベース）</p>
      <h4 class="prog-h">問題ごとの状況</h4>${table}
      <p class="muted" style="font-size:.8rem">各行をタップするとその問題を開きます。得点率は配点設定があればそれを満点に、無ければAI採点の満点（目安10点）で計算します。</p>`;
    $('#progress-body .prog-list').onclick = e => { const b = e.target.closest('.prog-item'); if (b) { $('#progress').hidden = true; openProblem(b.dataset.id); } };
  }
  $('#open-progress').addEventListener('click', openProgress);
  $('#progress-to-list').addEventListener('click', e => { e.preventDefault(); $('#progress').hidden = true; $('#pick').hidden = false; renderPicker(); window.scrollTo(0, 0); });

  // ---- 操作（ビュー切替・ズーム・タイマー・やり直し・一覧へ） ----------
  $('#view-seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    view = b.dataset.view; renderExam(); renderViewSeg();
  });
  $('#z-in').addEventListener('click', () => { zoom = Math.min(250, zoom + 25); applyZoom(); });
  $('#z-out').addEventListener('click', () => { zoom = Math.max(50, zoom - 25); applyZoom(); });
  function applyZoom() {
    $('#z-val').textContent = zoom + '%';
    const pages = $('#exam-body .exam-pages'); if (pages) pages.style.setProperty('--zoom', zoom + '%');
  }
  $('#swap').addEventListener('click', () => {
    swapped = !swapped;
    try { localStorage.setItem('nespe-work-swap', swapped ? '1' : '0'); } catch (_) {}
    applySwap();
    syncToServer();
  });
  $('#grade-all').addEventListener('click', gradeAll);
  // 保存して中断：採点せず、今の下書き・経過時間を保存（下書きは常に、記録はサーバ経由なら出力）
  $('#save-pause').addEventListener('click', async () => {
    if (!current) return;
    Timer.pause(); // 経過時間を確定して保存
    const btn = $('#save-pause'), label = btn.textContent;
    btn.disabled = true; btn.textContent = '保存中…';
    const ok = await saveRecord(current, { kind: '中断保存' });
    btn.textContent = ok ? '保存しました ✓' : '下書きを保存 ✓';
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2000);
  });
  $('#t-toggle').addEventListener('click', () => Timer.toggle());
  $('#t-reset').addEventListener('click', () => { if (confirm('時間を 0 に戻しますか？')) Timer.reset(); });
  $('#retry').addEventListener('click', () => {
    if (!current) return;
    if (!confirm('この問題の入力中の解答と時間を消して、やり直しますか？\n（これまでの採点履歴は残ります）')) return;
    Store.retry(current);
    $('#s-questions').innerHTML = current.questions.map(q => renderQuestion(current, q)).join('');
    bindQuestions(current);
    $('#grade-summary').innerHTML = '';
    Timer.start(current);
  });
  $('#to-list').addEventListener('click', e => {
    e.preventDefault();
    Timer.stop();
    document.body.classList.remove('solving');
    const solve = $('#solve'); solve.hidden = true; solve.classList.remove('on');
    $('#pick').hidden = false;
    renderPicker();
    window.scrollTo(0, 0);
  });
  window.addEventListener('beforeunload', () => Timer.stop());

  // ---- 学習履歴の持ち運び（完全上書き方式） --------------------------
  // 履歴はブラウザ(localStorage)に保存されるが、それだけだと端末ごとに別管理になる。
  // ローカルサーバ経由のときは server/history.json にも自動保存し、起動時に自動で
  // 読み込む（＝起動時インポート）。ファイルが正で、この端末の履歴を丸ごと上書きする。
  // Windows ⇄ Mac で引き継ぐには、この history.json（または書き出したバックアップ）を
  // もう一方へコピーするだけ。手動の書き出し／復元も「完全上書き」で用意する。
  const localSavedAt = () => { try { return Number(localStorage.getItem('nespe-work-at')) || 0; } catch (_) { return 0; } };
  function currentPayload() {
    let swap = '0'; try { swap = localStorage.getItem('nespe-work-swap') || '0'; } catch (_) {}
    // savedAt はこの端末のデータの「最終保存時刻」。PUT時の now ではなく実際の保存時刻を載せる
    const at = localSavedAt() || Date.now();
    return { app: BACKUP_TAG, version: 1, savedAt: new Date(at).toISOString(), swap, data: Store.raw() };
  }
  // 使用中：save() から呼ばれ、少し待ってからサーバのファイルへ書き戻す（まとめ書き）
  let putTimer = null;
  function syncToServer() {
    if (!serverHist) return;
    clearTimeout(putTimer);
    putTimer = setTimeout(() => {
      fetch('/history', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(currentPayload()) }).catch(() => {});
    }, 800);
  }
  // 明示保存：デバウンスを待たず、いますぐサーバのファイルへ確定保存する
  function flushToServer() {
    if (!serverHist) return Promise.resolve(false);
    clearTimeout(putTimer);
    return fetch('/history', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(currentPayload()) }).then(r => r.ok).catch(() => false);
  }
  // 起動時：サーバのファイルとこの端末を照合し、「新しい方」を残す（更新時刻で判定）。
  // こうすることで、ローカルの方が新しい（例：直前に入れた配点）のにファイルで上書き
  // して消す、という事故を防ぐ。端末間の持ち運びも「新しいファイルが勝つ」で成立する。
  async function startupSync() {
    let payload = null;
    try { const r = await fetch('/history', { cache: 'no-store' }); if (!r.ok) return; payload = await r.json(); }
    catch (_) { return; } // サーバ無し（GitHub Pages 等）→ localStorage だけで動く
    serverHist = true;
    const fileKeys = (payload && payload.data) ? Object.keys(payload.data).length : 0;
    const localKeys = Object.keys(Store.raw()).length;
    const fileAt = (payload && payload.savedAt) ? Date.parse(payload.savedAt) || 0 : 0;
    const localAt = localSavedAt();
    const fileWins = fileKeys && (localKeys === 0 || fileAt > localAt);
    if (fileWins) {
      Store.replaceAll(payload.data); // ファイルの方が新しい（または端末が空）→ファイルを採用
      try { if (payload.swap != null) localStorage.setItem('nespe-work-swap', payload.swap); } catch (_) {}
      swapped = payload.swap === '1';
      note(`サーバの履歴を読み込みました（${new Date(fileAt || Date.now()).toLocaleString()} 時点・項目 ${fileKeys} 件）。`);
    } else if (localKeys) {
      // この端末の方が新しい（または同点）→ 端末を残し、ファイルへ反映（ローカルの取りこぼし防止）
      fetch('/history', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(currentPayload()) }).catch(() => {});
      if (fileKeys) note('この端末の方が新しいため、端末の内容を保持してサーバへ反映しました。');
    }
    await loadHaiten(); // 配点は履歴とは別に、サーバの別ファイルからマージ読み込み
    renderPicker();
  }
  // 配点の読み込み：旧仕様で履歴に相乗りしていた分を移行し、サーバの配点ファイルをマージ。
  // マージ（既存を消さない）なので、ここで配点が消えることはない。
  async function loadHaiten() {
    let changed = false;
    const legacy = Store.takeLegacyHaiten(); // 履歴に残っていた旧 __haiten を回収（あれば）
    if (legacy && Haiten.mergeIn(legacy)) changed = true;
    if (!serverHist) return;
    try {
      const r = await fetch('/haiten', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (Haiten.mergeIn((j && j.haiten) ? j.haiten : {})) changed = true; }
    } catch (_) { /* 取得失敗時はローカルのみ */ }
    if (changed) Haiten.flush(); // 新たに取り込んだ分があるときだけファイルへ反映（無駄な書き込み＝Git差分を出さない）
  }
  // 手動：現在の履歴をファイルに書き出す（バックアップ／持ち運び用）
  function exportHistory() {
    const blob = new Blob([JSON.stringify({ ...currentPayload(), haiten: Haiten.raw() }, null, 2)], { type: 'application/json' });
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `nespe-work-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    note(`「${name}」を書き出しました。`);
  }
  // 手動：ファイルを読み込み、この端末の履歴を丸ごと置き換える（完全上書き）
  function importHistory(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try { payload = JSON.parse(reader.result); } catch (_) { return note('ファイルを読めませんでした（JSON ではありません）。', true); }
      if (!payload || payload.app !== BACKUP_TAG || !payload.data) return note('このアプリのバックアップファイルではありません。', true);
      const n = Object.keys(payload.data).length;
      if (!confirm(`復元します。\n\nこの端末の今の履歴は、ファイルの内容で完全に置き換えられます（上書き）。\n読み込む項目：${n} 件\n\nよろしいですか？`)) return;
      Store.replaceAll(payload.data); // これで syncToServer も走り、サーバのファイルも更新される
      try { if (payload.swap != null) localStorage.setItem('nespe-work-swap', payload.swap); } catch (_) {}
      if (payload.haiten) { Haiten.mergeIn(payload.haiten); Haiten.flush(); } // 配点も復元（マージ）
      note('復元しました。画面を更新します…');
      setTimeout(() => location.reload(), 900);
    };
    reader.onerror = () => note('ファイルの読み込みに失敗しました。', true);
    reader.readAsText(file);
  }
  function note(msg, warn) {
    const el = $('#backup-note'); if (!el) return;
    el.textContent = msg; el.classList.toggle('warn', !!warn);
  }
  $('#hist-export').addEventListener('click', exportHistory);
  $('#hist-import').addEventListener('click', () => $('#hist-file').click());
  $('#hist-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) importHistory(f); e.target.value = ''; });
  // 閉じる直前に、まだ送っていない変更を確実にサーバのファイルへ流す（直近の入力の取りこぼし防止）
  window.addEventListener('beforeunload', () => {
    if (!serverHist) return;
    try { navigator.sendBeacon('/history', new Blob([JSON.stringify(currentPayload())], { type: 'application/json' })); } catch (_) {}
  });

  // ---- 解答記録（Markdown）の自動書き出し：回ごとに別ファイル ---------
  // 採点のたびに、その時点の問題スナップショット（全設問・解答・AI採点・模範解答）を
  // 「問題ごとのフォルダ」に「日時つきの新規ファイル」として保存する（上書きしない）。
  //   解答記録/令和6年_午後Ⅰ_問1_○○/2026-11-02_143500.md
  // ローカルサーバ経由のときだけ保存（静的配信では何もしない）。
  const safeSeg = s => String(s).replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80);
  function recordDir(p) { return safeSeg(`${p.yearLabel}_${p.sectionLabel}_問${p.no}_${p.title}`); }
  function tsStamp() {
    const d = new Date(), z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  }
  function quote(s) { return '> ' + String(s == null ? '' : s).replace(/\r?\n/g, '\n> '); }
  function resultMd(j) {
    if (!j) return ['_採点結果なし_', ''];
    if (j.raw) return ['採点結果を解釈できませんでした：', '', '```', String(j.raw), '```', ''];
    const out = [`**判定**：${j.verdict || '-'}${j.score != null ? `　${j.score} / ${j.scoreMax ?? 10} 点` : ''}`, ''];
    const list = (title, arr) => { if (arr && arr.length) { out.push(`**${title}**`, ''); arr.forEach(x => out.push(`- ${x}`)); out.push(''); } };
    list('加点できる点', j.good);
    list('不足・誤り', j.missing);
    if (j.diff) out.push(`**解答例との差分**：${j.diff}`, '');
    if (j.advice) out.push(`**アドバイス**：${j.advice}`, '');
    if (j.modelAnswer) out.push(`**模範解答**：${j.modelAnswer}`, '');
    return out;
  }
  // 「今この瞬間」の問題全体のスナップショット（下書き・最新の採点回の両方を載せる）
  function buildSnapshotMd(p, opts) {
    const kind = (opts && opts.kind) || '採点';
    const L = [`# ${p.yearLabel} ${p.sectionLabel} 問${p.no}　${p.title}`, ''];
    L.push(`- 記録日時：${stamp(Date.now())}`);
    L.push(`- 種別：${kind === '中断保存' ? '中断保存（採点なし）' : '採点'}`);
    const tsec = Store.timer(p.id); if (tsec) L.push(`- 所要時間：${fmt(tsec)}`);
    if (p.overview) L.push(`- 出題趣旨：${p.overview}`);
    if (p.source) L.push(`- 出典：${p.source}`);
    L.push('');
    for (const q of p.questions) {
      const saved = Store.q(`${p.id}:${q.id}`);
      const attempts = saved.attempts || [];
      const draft = (saved.answer || '').trim();
      L.push(`## 設問 ${q.id}${q.group ? `（${q.group}）` : ''}`, '');
      L.push(`**問題**：${q.prompt}${q.charLimit ? `（${q.charLimit}）` : ''}`, '');
      if (q.answer) L.push(`**公式解答例**：${q.answer}`, '');
      if (attempts.length) {
        const a = attempts[attempts.length - 1];
        L.push(`**第${attempts.length}回の採点（${stamp(a.at)}・経過 ${fmt(a.elapsed || 0)}）**`, '');
        L.push('**あなたの解答**：', '', quote(a.answer), '');
        L.push(...resultMd(a.result));
        if (draft && draft !== (a.answer || '').trim()) L.push('**現在の下書き（未採点）**：', '', quote(draft), '');
      } else if (draft) {
        L.push('**下書き（未採点）**：', '', quote(draft), '');
      } else {
        L.push('_未入力・未採点_', '');
      }
    }
    return L.join('\n');
  }
  // 1アクション（単問採点／まとめて採点／中断保存）につき 1 ファイルだけ保存する。
  // runGrade からは呼ばず、採点や保存が終わった呼び出し側で1回だけ呼ぶこと（多重生成の防止）。
  function saveRecord(p, opts) {
    if (!serverHist || !p) return Promise.resolve(false);
    return fetch('/record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `${recordDir(p)}/${tsStamp()}.md`, markdown: buildSnapshotMd(p, opts) }),
    }).then(r => r.ok).catch(() => false);
  }

  // ---- 起動 ----------------------------------------------------------
  renderPicker();
  checkServer();
  startupSync();
})();
