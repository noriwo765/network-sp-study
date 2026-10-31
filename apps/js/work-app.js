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
      // 周回：<問題id>:__round = { n: 第何周, at: その周を始めた時刻 }。無ければ第1周（最初から）。
      round(pid) { const r = data[`${pid}:__round`]; return { n: (r && r.n) || 1, at: (r && r.at) || 0 }; },
      // この周の採点だけ（画面に出す分）。採点履歴そのものは全周ぶん残っている
      roundAttempts(pid, qid) { const since = this.round(pid).at; return (this.q(`${pid}:${qid}`).attempts || []).filter(a => (a.at || 0) >= since); },
      // この周で採点したか（していなければリセットしても周は進めない＝最初からやり直し）
      roundGraded(prob) { return prob.questions.some(q => this.roundAttempts(prob.id, q.id).length); },
      // 新しい周を始める：画面（下書き・タイマー）をリセットし、周の開始時刻を記録する。採点履歴は消さない
      newRound(prob) {
        const n = this.round(prob.id).n + (this.roundGraded(prob) ? 1 : 0);
        for (const qq of prob.questions) { const q = this.q(`${prob.id}:${qq.id}`); q.answer = ''; data[`${prob.id}:${qq.id}`] = q; }
        data[`${prob.id}:__timer`] = { sec: 0 };
        data[`${prob.id}:__round`] = { n, at: Date.now() };
        save();
        return n;
      },
      doneCount(prob) { return prob.questions.filter(q => this.roundAttempts(prob.id, q.id).length).length; },
      // 旧仕様で履歴に相乗りしていた配点(__haiten)を取り出して履歴からは消す（Haitenへ移行）
      takeLegacyHaiten() { const h = data.__haiten; if (h) { delete data.__haiten; save(); } return (h && typeof h === 'object') ? h : null; },
      // バックアップ／復元用：保存データ全体の読み書き
      raw() { return data; },
      replaceAll(obj) { data = obj || {}; save(); },
    };
  })();

  // ---- 配点予想（履歴とは完全に別保存：別キー・別ファイル。履歴の上書きに巻き込まれない） ----
  // localStorage キー 'nespe-work-haiten-v1' と サーバの /haiten（server/haiten.json）に保存。
  // rev（最終編集時刻）を持ち、起動時はファイルの rev が新しければファイルの値を採用、そうでなければ
  // 足りないキーだけ取り込む（どちらの場合もローカルにしか無い値は消さない）。
  // サーバは古い rev での上書きを拒否するので、開きっぱなしのブラウザが新しいファイル
  // （もう一方のマシンや Claude Code が書いたもの）を潰すことはない。
  const Haiten = (() => {
    const KEY = 'nespe-work-haiten-v1', REV_KEY = 'nespe-work-haiten-rev';
    let map = {}, rev = 0;
    try { map = JSON.parse(localStorage.getItem(KEY)) || {}; rev = Number(localStorage.getItem(REV_KEY)) || 0; } catch (_) {}
    let putTimer = null;
    // savedAt は入れない（rev は編集時だけ変わる＝読み込むだけではファイルも Git 差分も変わらない）
    const payload = () => ({ app: BACKUP_TAG, rev, haiten: map });
    // 戻り値：true=保存 / 'stale'=ファイル側が新しく拒否された / false=失敗
    const put = () => fetch('/haiten', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) }).then(r => r.status === 409 ? 'stale' : r.ok).catch(() => false);
    const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); localStorage.setItem(REV_KEY, String(rev)); } catch (_) {} };
    const persist = () => { // 編集：rev を進めてローカル保存＋サーバへ（まとめ書き）
      rev = Date.now(); keep();
      if (serverHist) { clearTimeout(putTimer); putTimer = setTimeout(put, 600); }
    };
    const sum = h => Object.values(h).reduce((a, v) => a + (Number(v) > 0 ? Number(v) : 0), 0);
    return {
      haiten(pid, qid) { const h = map[`${pid}:${qid}`]; if (typeof h === 'number') return h > 0 ? h : null; if (h && typeof h === 'object') { const s = sum(h); return s > 0 ? s : null; } return null; },
      map(pid, qid) { const h = map[`${pid}:${qid}`]; return (h && typeof h === 'object') ? h : null; },
      field(pid, qid, label) { const h = this.map(pid, qid); const v = h ? Number(h[label]) : NaN; return v > 0 ? v : null; },
      setSingle(pid, qid, val) { const k = `${pid}:${qid}`, n = Number(val); if (n > 0) map[k] = n; else delete map[k]; persist(); },
      setField(pid, qid, label, val) { const k = `${pid}:${qid}`; const h = (map[k] && typeof map[k] === 'object') ? map[k] : {}; const n = Number(val); if (n > 0) h[label] = n; else delete h[label]; if (Object.keys(h).length) map[k] = h; else delete map[k]; persist(); },
      problemMax(prob) { return prob.questions.reduce((s, q) => s + (this.haiten(prob.id, q.id) || 0), 0); },
      // 取り込み（バックアップ復元・旧データ移行用）：無いキーだけ足す。消えない。
      mergeIn(obj) { let ch = false; for (const [k, v] of Object.entries(obj || {})) { if (!(k in map) && v != null) { map[k] = v; ch = true; } } if (ch) persist(); return ch; },
      // 起動時：サーバのファイルと照合する。戻り値 needPush はファイルへ書き戻す必要があるか。
      applyFile(fileMap, fileRev) {
        fileMap = fileMap || {}; fileRev = Number(fileRev) || 0;
        if (fileRev > rev) { // ファイルの方が新しい → ファイルの値を採用（ローカルにしか無いキーは残す）
          for (const [k, v] of Object.entries(fileMap)) map[k] = v;
          rev = fileRev;
        } else {
          for (const [k, v] of Object.entries(fileMap)) if (!(k in map) && v != null) map[k] = v;
        }
        keep();
        return { needPush: rev > fileRev || Object.keys(map).some(k => !(k in fileMap)) };
      },
      raw() { return map; },
      flush() { if (!serverHist) return Promise.resolve(false); clearTimeout(putTimer); return put(); },
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
          <div class="ttl">${esc(p.title)}${Store.round(p.id).n > 1 ? `<span class="round-tag">第${Store.round(p.id).n}周</span>` : ''}${done ? `<span class="done">解答済 ${done}/${total}</span>` : ''}</div>
        </button>
        ${hasProgress(p) ? `<span class="pick-acts">
          <button class="btn small primary" data-act="continue" data-id="${p.id}" title="前回の続きから解く">続きから</button>
          <button class="btn small" data-act="reset" data-id="${p.id}" title="画面の解答・採点結果・時間をリセットして解く（採点結果は履歴に残る）">最初から${Store.roundGraded(p) ? `（第${Store.round(p.id).n + 1}周）` : ''}</button>
        </span>` : ''}
        ${hasData ? `<button class="hist-btn" data-id="${p.id}" title="過去の解答・採点を見る">履歴</button>` : ''}
      </div>`;
    }).join('') : `<p class="muted">該当する問題がありません。</p>`;
    $('#prob-list').onclick = e => {
      const hb = e.target.closest('.hist-btn'); if (hb) return void openHistory(hb.dataset.id);
      const ab = e.target.closest('[data-act]'); if (ab) return void openProblem(ab.dataset.id, ab.dataset.act);
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
      stop() { if (iv) clearInterval(iv); iv = null; if (pid) Store.setTimer(pid, sec); pid = null; }, // 止めたら問題を手放す（後で古い時間を書き戻さない）
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

  // mode：省略＝途中なら「続きから／リセット」を聞く、'continue'＝続きから、'reset'＝リセットして解く
  function openProblem(id, mode) {
    const p = PROBLEMS.find(x => x.id === id);
    if (!p) return;
    if (mode === 'reset') {
      const drafts = p.questions.filter(q => !Store.roundAttempts(p.id, q.id).length && (Store.q(`${p.id}:${q.id}`).answer || '').trim()).length;
      if (drafts && !confirm(`未採点の下書きが ${drafts} 設問あります。リセットすると下書きは消えます（採点結果は履歴に残ります）。\nよろしいですか？`)) return;
    }
    current = p;
    document.body.classList.add('solving');
    $('#pick').hidden = true;
    const solve = $('#solve'); solve.hidden = false; solve.classList.add('on');
    setSolveTitle(p);
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
    applySwap();
    $('#exam-body').scrollTop = 0; $('#answer-pane').scrollTop = 0;
    window.scrollTo(0, 0);
    if (mode === 'reset') startNewRound(p);
    else if (mode !== 'continue' && hasProgress(p)) askRound(p); // 解答済み・途中の問題は「続きから／リセット」を選んでから始める
    else Timer.start(p);
  }
  function setSolveTitle(p) {
    const n = Store.round(p.id).n;
    $('#s-title').textContent = `${p.yearLabel} ${p.sectionLabel} 問${p.no}　${p.title}${n > 1 ? `（第${n}周）` : ''}`;
  }
  // この周で何か進んでいるか（採点・下書き・経過時間のどれか）
  function hasProgress(p) {
    return Store.timer(p.id) > 0 || p.questions.some(q => Store.roundAttempts(p.id, q.id).length || (Store.q(`${p.id}:${q.id}`).answer || '').trim());
  }

  // ---- 周回モード ----------------------------------------------------
  // リセット＝画面（解答欄の下書き・時間）と、画面に出す採点結果を新しい周に切り替える。
  // 採点結果そのものは履歴に残し（「履歴」画面・学習状況・解答記録で見られる）、消さない。
  function askRound(p) {
    const r = Store.round(p.id);
    const graded = p.questions.filter(q => Store.roundAttempts(p.id, q.id).length).length;
    const drafts = p.questions.filter(q => !Store.roundAttempts(p.id, q.id).length && (Store.q(`${p.id}:${q.id}`).answer || '').trim()).length;
    const last = Math.max(0, ...p.questions.flatMap(q => Store.roundAttempts(p.id, q.id).map(a => a.at || 0)));
    $('#t-clock').textContent = fmt(Store.timer(p.id));
    const next = Store.roundGraded(p) ? r.n + 1 : r.n;
    $('#rd-title').textContent = graded ? `第${r.n}周の続きがあります` : '途中まで解いた記録があります';
    $('#rd-info').innerHTML = [
      `採点済み <b>${graded} / ${p.questions.length}</b> 設問`,
      drafts ? `未採点の下書き ${drafts} 設問` : '',
      `経過 ${fmt(Store.timer(p.id))}`,
      last ? `最終採点 ${stamp(last)}` : '',
    ].filter(Boolean).join('　・　');
    $('#rd-reset').textContent = next > r.n ? `リセットして第${next}周を始める` : 'リセットして最初から解く';
    $('#round-dialog').hidden = false;
  }
  function startNewRound(p) {
    Timer.stop(); // 先に止める（後から止めると、リセット前の経過時間が書き戻される）
    Store.newRound(p);
    setSolveTitle(p);
    $('#s-questions').innerHTML = p.questions.map(q => renderQuestion(p, q)).join('');
    bindQuestions(p);
    $('#grade-summary').innerHTML = '';
    $('#answer-pane').scrollTop = 0;
    Timer.start(p);
  }
  $('#rd-continue').addEventListener('click', () => { $('#round-dialog').hidden = true; if (current) Timer.start(current); });
  $('#rd-reset').addEventListener('click', () => { $('#round-dialog').hidden = true; if (current) startNewRound(current); });
  $('#rd-back').addEventListener('click', e => { e.preventDefault(); $('#round-dialog').hidden = true; $('#to-list').click(); });

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
  // 判定ロジックは js/work-shape.js（検証ツール apps/tools/work-check.js と共用）。
  const { splitFW, parseLabeled, answerShape, labeledValue, bulletValues, limitNum, fieldLimits } = window.WorkShape;
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
    const lims = fieldLimits(q, shape.fields); // 欄ごとの字数上限（0＝なし）
    const fcount = `<span class="fld-count"></span>`;
    let inputArea = '';
    if (shape.mode === 'labeled') {
      inputArea = `<div class="fields">` + shape.fields.map((lb, i) => {
        const v = labeledValue(saved.answer, lb);
        const field = (q.type === 'fill')
          ? inp(`data-label="${esc(lb)}" data-limit="${lims[i]}"`, v)
          : `<textarea class="fld-input" data-label="${esc(lb)}" data-limit="${lims[i]}" rows="2" placeholder="解答">${esc(v)}</textarea>`;
        return `<label class="field"><span class="field-label">${esc(lb)}</span>${field}${fcount}</label>`;
      }).join('') + `</div>`;
    } else if (shape.mode === 'bullets') {
      const vals = bulletValues(saved.answer);
      inputArea = `<div class="fields">` + shape.fields.map((n, i) =>
        `<label class="field"><span class="field-label">${esc(n)}</span>${inp(`data-bullet="${i}" data-limit="${lims[i]}"`, vals[i] || '')}${fcount}</label>`
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
          // 欄ごとの文字数（上限があれば n / 上限 字、超えたら赤）
          let over = 0;
          card.querySelectorAll('[data-label],[data-bullet]').forEach(el => {
            const n = [...el.value.trim()].length, lim = Number(el.dataset.limit) || 0;
            const c = el.parentNode.querySelector('.fld-count');
            if (c) { c.textContent = lim ? `${n} / ${lim} 字` : `${n} 字`; c.classList.toggle('over', !!lim && n > lim); }
            if (lim && n > lim) over++;
          });
          count.textContent = `${filled} / ${total} 欄 入力${over ? `　字数オーバー ${over} 欄` : ''}`;
          count.classList.toggle('over', over > 0);
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
      if (Store.roundAttempts(p.id, q.id).length) showResult(card, key);
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
    if (!confirm(`解答を終了して、入力済みの ${answered.length} 問をまとめて採点します。${empties ? `（未入力 ${empties} 問は採点されません）` : ''}\nよろしいですか？`)) return;
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
    renderBatchSummary(results, empties, p);
    btn.disabled = false;
    if (results.some(Boolean)) saveRecord(p); // まとめて採点：全問終わってから記録を1ファイルだけ保存
  }
  // 解答終了（まとめて採点）後の結果まとめ：この周の合計点・前回比・内訳
  function renderBatchSummary(results, empties, p) {
    const ok = results.filter(r => r && r.verdict === '正解').length;
    const part = results.filter(r => r && r.verdict === '部分正解').length;
    const ng = results.filter(r => r && r.verdict === '不正解').length;
    const failed = results.filter(r => !r).length;
    // この周の合計（各設問のこの周の最新の採点。未採点は0点）。満点は配点予想（無い設問は採点時の満点か10点）
    let score = 0, max = 0;
    for (const q of p.questions) {
      const at = Store.roundAttempts(p.id, q.id), r = at.length ? at[at.length - 1].result || {} : null;
      const hm = Haiten.haiten(p.id, q.id), m0 = r && typeof r.scoreMax === 'number' && r.scoreMax > 0 ? r.scoreMax : 10;
      max += hm || m0;
      if (r && typeof r.score === 'number') score += hm ? r.score / m0 * hm : r.score;
    }
    const n1 = v => (Math.round(v * 10) / 10).toString();
    const pct = max ? Math.round(score / max * 100) : 0;
    const rs = scoreRounds(p), prev = rs.length >= 2 ? rs[rs.length - 2] : null;
    const d = prev ? score - prev.score : null;
    const diff = d == null ? '<span class="muted">初めての採点です</span>'
      : Math.abs(d) < 0.05 ? `<span class="trend-same">前回（${stamp(prev.end)}）と同点</span>`
      : d > 0 ? `<span class="trend-up">前回（${stamp(prev.end)}）から +${n1(d)}点</span>`
      : `<span class="trend-down">前回（${stamp(prev.end)}）から ${n1(d)}点</span>`;
    const rn = Store.round(p.id).n;
    $('#grade-summary').innerHTML = `<div class="batch-sum">
      <div class="batch-title">採点結果${rn > 1 ? `（第${rn}周）` : ''}</div>
      <div class="batch-score"><b>${n1(score)}</b> / ${n1(max)}点　${bar(pct)} ${pct}%</div>
      <div class="batch-diff">${diff}</div>
      <div class="batch-breakdown">
        <span class="verdict ok">正解 ${ok}</span>
        <span class="verdict part">部分正解 ${part}</span>
        <span class="verdict ng">不正解 ${ng}</span>
        ${failed ? `<span class="muted">採点失敗 ${failed}</span>` : ''}
        ${empties ? `<span class="muted">未入力 ${empties}（0点）</span>` : ''}
        <span class="muted">所要 ${fmt(Timer.sec)}</span>
      </div>
      <p class="muted">各設問の採点は下に表示しています。<button class="btn small" id="bs-history">履歴で推移を見る</button></p>
    </div>`;
    $('#bs-history').onclick = () => { $('#solve').hidden = true; $('#solve').classList.remove('on'); document.body.classList.remove('solving'); Timer.stop(); openHistory(p.id); };
    $('#grade-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const i = key.indexOf(':');
    const attempts = Store.roundAttempts(key.slice(0, i), key.slice(i + 1)); // この周の採点だけを出す
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
  // 合計点の推移（読み取り専用。履歴は書き換えない）
  // - 回：採点の間が30分以上あいたら別の回とみなす（1問ずつ採点した日も1回にまとまる）
  // - 合計：その回の終わり時点での各設問の最新の点。その回に採点していない設問は前回までの点
  // - 換算：配点予想がある設問は「点/その時の満点 × 今の配点」にそろえる（配点前の10点満点の採点も比較できる）
  const ROUND_GAP = 30 * 60 * 1000;
  function scoreRounds(p) {
    const qmax = q => Haiten.haiten(p.id, q.id);
    const events = p.questions.flatMap(q => (Store.q(`${p.id}:${q.id}`).attempts || []).map(a => ({ q, a })))
      .filter(x => x.a.result && typeof x.a.result.score === 'number').sort((x, y) => (x.a.at || 0) - (y.a.at || 0));
    const rounds = [];
    for (const ev of events) {
      const last = rounds[rounds.length - 1];
      if (last && (ev.a.at || 0) - last.end <= ROUND_GAP) { last.items.push(ev); last.end = ev.a.at || 0; }
      else rounds.push({ start: ev.a.at || 0, end: ev.a.at || 0, items: [ev] });
    }
    const state = {};
    return rounds.map(r => {
      for (const { q, a } of r.items) {
        const r0 = a.result, m0 = typeof r0.scoreMax === 'number' && r0.scoreMax > 0 ? r0.scoreMax : 10, hm = qmax(q);
        state[q.id] = hm ? { s: r0.score / m0 * hm, m: hm } : { s: r0.score, m: m0 };
      }
      const s = Object.values(state);
      const score = s.reduce((x, v) => x + v.s, 0);
      const max = p.questions.reduce((x, q) => x + (qmax(q) || (state[q.id] ? state[q.id].m : 10)), 0);
      return { start: r.start, end: r.end, qs: new Set(r.items.map(x => x.q.id)), graded: s.length, score, max, per: Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.s])) };
    });
  }
  function scoreTrendHtml(p) {
    const rs = scoreRounds(p);
    if (!rs.length) return '';
    const n1 = v => (Math.round(v * 10) / 10).toString();
    const total = p.questions.length;
    const rows = rs.map((r, i) => {
      const pct = r.max ? Math.round(r.score / r.max * 100) : 0;
      const prev = i ? r.score - rs[i - 1].score : null;
      const diff = prev == null ? '' : Math.abs(prev) < 0.05 ? '<span class="trend-same">±0</span>' : prev > 0 ? `<span class="trend-up">+${n1(prev)}</span>` : `<span class="trend-down">${n1(prev)}</span>`;
      return `<tr${i === rs.length - 1 ? ' class="latest"' : ''}>
        <td>第${i + 1}回</td><td class="hist-meta">${stamp(r.end)}</td>
        <td class="trend-score"><b>${n1(r.score)}</b> / ${n1(r.max)}点</td>
        <td>${bar(pct)} ${pct}%</td><td>${diff}</td>
        <td class="hist-meta">${r.qs.size}設問を採点${r.graded < total ? `（採点済み ${r.graded}/${total}）` : ''}</td></tr>`;
    }).join('');
    const best = rs.reduce((b, r) => (r.max && r.score / r.max > b.score / b.max ? r : b), rs[0]);
    const first = rs[0], last = rs[rs.length - 1];
    const gain = last.score - first.score;
    const cheer = rs.length < 2 ? '2回目を解くと、ここに伸びが表示されます。'
      : gain > 0 ? `第1回から <b>+${n1(gain)}点</b> 伸びています。最高は第${rs.indexOf(best) + 1}回の ${n1(best.score)}点。`
      : `最高は第${rs.indexOf(best) + 1}回の ${n1(best.score)}点。`;
    const grid = `<div class="trend-grid-wrap"><table class="trend-grid">
      <tr><th>設問</th>${rs.map((_, i) => `<th>第${i + 1}回</th>`).join('')}<th>配点</th></tr>
      ${p.questions.map(q => `<tr><td>${esc(q.id)}</td>${rs.map(r => {
        const v = r.per[q.id];
        return `<td class="${r.qs.has(q.id) ? 'graded' : 'carried'}">${v == null ? '—' : n1(v)}</td>`;
      }).join('')}<td>${Haiten.haiten(p.id, q.id) ?? '—'}</td></tr>`).join('')}
    </table></div>`;
    return `<div class="hist-trend">
      <div class="attempt-head">合計点の推移</div>
      <p class="trend-cheer">${cheer}</p>
      <table class="trend-table">${rows}</table>
      <details class="trend-detail"><summary>設問ごとの点数の推移</summary>${grid}
        <p class="muted">太字＝その回に採点した設問、薄字＝前回までの点を引き継いだもの。</p></details>
      <p class="muted trend-note">採点の間が30分以上あいたら別の回として集計。点数は今の配点予想に換算（配点を入れる前の10点満点の採点も比率で換算）。</p>
    </div>`;
  }
  function renderHistory(p) {
    $('#history-body').innerHTML = scoreTrendHtml(p) + p.questions.map(q => {
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
    const numInput = attr => `<input type="number" min="0" max="100" step="0.5" inputmode="decimal" placeholder="—" ${attr}>`;
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
    if (ok === 'stale') { btn.textContent = label; btn.disabled = false; alert('ファイル側の配点の方が新しいため、上書きしませんでした。\nページを再読み込みしてから入力し直してください。'); return; }
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

    $('#progress-body').innerHTML = `<p class="prog-cheer">${cheer}</p><div class="estimate" id="estimate-box"></div>${cards}${sections}
      <p class="prog-overall">全体の得点率 ${bar(pct)} <b>${pct}%</b>（採点済み設問の最新得点ベース）</p>
      <h4 class="prog-h">問題ごとの状況</h4>${table}
      <p class="muted" style="font-size:.8rem">各行をタップするとその問題を開きます。得点率は配点設定があればそれを満点に、無ければAI採点の満点（目安10点）で計算します。</p>`;
    $('#progress-body .prog-list').onclick = e => { const b = e.target.closest('.prog-item'); if (b) { $('#progress').hidden = true; openProblem(b.dataset.id); } };
    renderEstimate();
  }
  $('#open-progress').addEventListener('click', openProgress);

  // ---- 想定合格率（AI 判定・厳しめ） ----------------------------------
  // 判定材料は各設問の「最終の採点結果」（周回に関係なく最新）。未回答の設問・問題は0点として数える。
  // 結果はサーバの estimate.json（履歴・配点とは別ファイル）に保存され、学習状況サマリーにも載る。
  let estimate = null, estimating = false;
  const totalAttempts = () => PROBLEMS.reduce((a, p) => a + p.questions.reduce((b, q) => b + (Store.q(`${p.id}:${q.id}`).attempts || []).length, 0), 0);
  function finalStats() {
    const r1 = v => Math.round(v * 10) / 10;
    const problems = PROBLEMS.map(p => {
      let score = 0, max = 0, graded = 0;
      const weak = [];
      for (const q of p.questions) {
        const at = Store.q(`${p.id}:${q.id}`).attempts || [];
        const r = at.length ? at[at.length - 1].result || {} : null;
        const hm = Haiten.haiten(p.id, q.id), m0 = r && typeof r.scoreMax === 'number' && r.scoreMax > 0 ? r.scoreMax : 10;
        const qmax = hm || m0;
        max += qmax;
        if (r && typeof r.score === 'number') {
          graded++;
          const v = hm ? r.score / m0 * hm : r.score;
          score += v;
          if (v / qmax < 0.5) weak.push(`${q.id}（${r1(v)}/${qmax}点）`);
        }
      }
      const rs = scoreRounds(p);
      const pctOf = r => r && r.max ? Math.round(r.score / r.max * 100) : null;
      return {
        name: `${p.yearLabel} ${p.sectionLabel} 問${p.no} ${p.title}`, section: p.section, year: p.year,
        graded: `${graded}/${p.questions.length}設問`, score: r1(score), max: r1(max), pct: max ? Math.round(score / max * 100) : 0,
        rounds: rs.length, firstPct: rs.length > 1 ? pctOf(rs[0]) : null, weak,
      };
    });
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    const sec = s => problems.filter(x => x.section === s);
    // 本番形式の目安：年度ごとに午後Ⅰは得点率の高い2問の平均、午後Ⅱは高い方の1問
    const examLike = (s, k) => avg([...new Set(PROBLEMS.map(p => p.year))].map(y => avg(sec(s).filter(x => x.year === y).map(x => x.pct).sort((a, b) => b - a).slice(0, k))));
    const basis = {
      pm1Avg: avg(sec('pm1').map(x => x.pct)), pm2Avg: avg(sec('pm2').map(x => x.pct)),
      pm1Exam: examLike('pm1', 2), pm2Exam: examLike('pm2', 1),
      attempted: problems.filter(x => !x.graded.startsWith('0/')).length, total: problems.length, attempts: totalAttempts(),
    };
    return { basis, problems };
  }
  async function loadEstimate() {
    try { const r = await fetch('/estimate', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && typeof j.rate === 'number') estimate = j; } } catch (_) {}
  }
  async function runEstimate() {
    if (estimating) return;
    if (!serverOk) { alert('中継サーバが利用できません。node server/relay.js を起動してください。'); return; }
    estimating = true; renderEstimate();
    try {
      const { basis, problems } = finalStats();
      let examDate = null; try { const r = await fetch('/plan', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); examDate = j.plan && j.plan.examDate; } } catch (_) {}
      const today = new Date(), daysLeft = examDate ? Math.round((new Date(examDate + 'T00:00:00') - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5) : null;
      const stats = { today: dayStamp(Date.now()), examDate, daysLeft, note: '得点は各設問の最終の採点結果。未回答の設問・問題は0点。pct は問題ごとの得点率（%）', basis, problems };
      const r = await fetch('/estimate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stats, basis }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      estimate = j;
      saveSummary();
    } catch (e) { alert(`判定できませんでした：${e.message || e}`); }
    estimating = false; renderEstimate();
  }
  function renderEstimate() {
    const box = $('#estimate-box'); if (!box) return;
    const now = finalStats().basis;
    const btn = `<button class="btn small primary" id="est-run" ${estimating ? 'disabled' : ''}>${estimating ? 'AI が判定中…' : estimate ? '最新の採点結果で判定し直す' : 'AI で判定する'}</button>`;
    const basisLine = b => `午後Ⅰ 得点率 ${b.pm1Avg}%（本番形式の目安 ${b.pm1Exam}%）・午後Ⅱ ${b.pm2Avg}%（同 ${b.pm2Exam}%）・挑戦 ${b.attempted}/${b.total} 問`;
    if (!estimate) {
      box.innerHTML = `<div class="est-head">想定合格率（厳しめ・AI判定）</div>
        <p class="muted">各設問の最終の採点結果をもとに、AI が厳しめに判定します。まだ解いていない問題は0点として数えます。</p>
        <p class="est-basis">いまの数字：${basisLine(now)}</p>${btn}`;
    } else {
      const e = estimate, cls = e.rate >= 60 ? 'good' : e.rate >= 30 ? 'mid' : 'low';
      const stale = e.basis && typeof e.basis.attempts === 'number' && now.attempts > e.basis.attempts ? `<span class="est-stale">判定のあと採点が ${now.attempts - e.basis.attempts} 回増えています</span>` : '';
      const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
      box.innerHTML = `<div class="est-head">想定合格率（厳しめ・AI判定）<span class="muted">　${stamp(e.at)} 判定</span></div>
        <div class="est-main"><span class="est-rate ${cls}">${esc(e.rate)}<small>%</small></span>
          <span class="est-pts">本番想定　午後Ⅰ <b>${esc(e.pm1 ?? '—')}</b>点・午後Ⅱ <b>${esc(e.pm2 ?? '—')}</b>点<br><span class="muted">（合格は両方 60点以上）</span></span></div>
        <p class="est-summary">${esc(e.summary || '')}</p>
        <div class="est-cols"><div><h5>根拠</h5><ul>${li(e.reasons)}</ul></div><div><h5>次にやること</h5><ul>${li(e.actions)}</ul></div></div>
        <p class="est-basis">判定に使った数字：${e.basis ? basisLine(e.basis) : '—'}</p>
        <p class="muted" style="font-size:.8rem">各設問の最終の採点結果（未回答は0点）をもとに AI が判定。AI 採点の甘さ・周回による慣れは割り引いています。</p>
        <div class="est-actions">${btn}${stale}</div>`;
    }
    $('#est-run').onclick = runEstimate;
  }
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
    const n = Store.round(current.id).n + 1;
    const msg = Store.roundGraded(current) ? `画面の解答と採点結果をリセットして、第${n}周を始めますか？` : '画面の解答と時間をリセットして、最初から解き直しますか？';
    if (!confirm(`${msg}\n（これまでの採点結果は履歴に残ります）`)) return;
    startNewRound(current);
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
    await loadEstimate(); // 想定合格率（前回の AI 判定）
    saveSummary();      // 起動時にも学習状況サマリーを最新化（もう一方のマシンの Claude Code 用）
    renderPicker();
  }
  // 配点の読み込み：旧仕様で履歴に相乗りしていた分を移行し、サーバの配点ファイルをマージ。
  // マージ（既存を消さない）なので、ここで配点が消えることはない。
  async function loadHaiten() {
    const legacy = Store.takeLegacyHaiten(); // 履歴に残っていた旧 __haiten を回収（あれば）
    if (legacy) Haiten.mergeIn(legacy);
    if (!serverHist) return;
    let j = null;
    try { const r = await fetch('/haiten', { cache: 'no-store' }); if (r.ok) j = await r.json(); }
    catch (_) { return; } // 取得失敗時はローカルのみ
    const { needPush } = Haiten.applyFile(j && j.haiten, j && j.rev);
    if (needPush) Haiten.flush(); // 書き戻しが必要なときだけ（読み込むだけではファイル＝Git差分を変えない）
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
    const rn = Store.round(p.id).n; if (rn > 1) L.push(`- 周回：第${rn}周`);
    const tsec = Store.timer(p.id); if (tsec) L.push(`- 所要時間：${fmt(tsec)}`);
    if (p.overview) L.push(`- 出題趣旨：${p.overview}`);
    if (p.source) L.push(`- 出典：${p.source}`);
    L.push('');
    for (const q of p.questions) {
      const saved = Store.q(`${p.id}:${q.id}`);
      const all = saved.attempts || [];
      const attempts = Store.roundAttempts(p.id, q.id); // この周の採点（画面と同じ）
      const draft = (saved.answer || '').trim();
      L.push(`## 設問 ${q.id}${q.group ? `（${q.group}）` : ''}`, '');
      L.push(`**問題**：${q.prompt}${q.charLimit ? `（${q.charLimit}）` : ''}`, '');
      if (q.answer) L.push(`**公式解答例**：${q.answer}`, '');
      if (attempts.length) {
        const a = attempts[attempts.length - 1];
        L.push(`**第${all.indexOf(a) + 1}回の採点（${stamp(a.at)}・経過 ${fmt(a.elapsed || 0)}）**`, '');
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
    }).then(r => { saveSummary(); return r.ok; }).catch(() => false);
  }

  // ---- 学習状況サマリー（解答記録/_学習状況.md） ----------------------
  // Claude Code のメモリはマシンごとで SSD に乗らないため、Mac/Windows どちらの Claude Code でも
  // このファイル1つを読めば学習状況が分かるようにする（中身は学習状況ページと同じ集計＋要復習一覧）。
  function buildSummaryMd() {
    const rows = PROBLEMS.map(p => ({ p, s: problemStats(p) }));
    const N = PROBLEMS.length;
    const touched = rows.filter(x => x.s.graded > 0).length;
    const completed = rows.filter(x => x.s.graded === x.s.total).length;
    const gradedQ = rows.reduce((a, x) => a + x.s.graded, 0);
    const totalTime = rows.reduce((a, x) => a + x.s.time, 0);
    const totScore = rows.reduce((a, x) => a + x.s.score, 0), totMax = rows.reduce((a, x) => a + x.s.max, 0);
    const pct = totMax ? Math.round(totScore / totMax * 100) : 0;
    const L = ['# 午後問題 学習状況（自動生成・編集しない）', '',
      `- 更新：${stamp(Date.now())}`,
      `- 挑戦 ${touched}/${N} 問・完答 ${completed}/${N} 問・採点した設問 ${gradedQ}・学習時間 ${hhmm(totalTime)}・平均得点率 ${pct}%`,
      '- 詳細：各回の解答・採点は `解答記録/<問題>/<日時>.md`、生データは `server/history.json`、配点は `server/haiten.json`', '',
      '## 問題ごと', '', '| 問題 | 完答 | 得点（最新） | 周回 | 最終学習日 |', '|---|---|---|---|---|'];
    for (const { p, s } of rows) {
      const score = s.graded ? `${s.score}/${s.max}（${s.max ? Math.round(s.score / s.max * 100) : 0}%）` : '—';
      L.push(`| ${p.yearLabel} ${p.sectionLabel} 問${p.no} ${p.title} | ${s.graded}/${s.total} | ${score} | ${s.rounds || '—'} | ${dayStamp(s.lastAt)} |`);
    }
    if (estimate) {
      const e = estimate;
      L.push('', '## 想定合格率（AI判定・厳しめ）', '',
        `- **${e.rate}%**（${stamp(e.at)} 判定）　本番想定：午後Ⅰ ${e.pm1 ?? '—'}点・午後Ⅱ ${e.pm2 ?? '—'}点（合格は両方60点以上）`,
        `- ${e.summary || ''}`, ...(e.reasons || []).map(x => `  - 根拠：${x}`), ...(e.actions || []).map(x => `  - 次にやること：${x}`));
    }
    L.push('', '## 要復習（最新の判定が正解以外の設問）', '');
    let n = 0;
    for (const p of PROBLEMS) for (const q of p.questions) {
      const at = Store.q(`${p.id}:${q.id}`).attempts || [];
      if (!at.length) continue;
      const last = at[at.length - 1], r = last.result || {};
      if (r.verdict === '正解') continue;
      n++;
      L.push(`- ${p.yearLabel} ${p.sectionLabel} 問${p.no} ${q.id}：${r.verdict || '判定不能'}${typeof r.score === 'number' ? ` ${r.score}/${r.scoreMax ?? 10}点` : ''}（${dayStamp(last.at)}・${at.length}回目）`);
    }
    if (!n) L.push('- なし');
    return L.join('\n') + '\n';
  }
  function saveSummary() {
    if (!serverHist) return;
    fetch('/record', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '_学習状況.md', markdown: buildSummaryMd() }),
    }).catch(() => {});
  }

  // ---- 起動 ----------------------------------------------------------
  renderPicker();
  checkServer();
  // work.html?p=<問題id> で開かれたら（学習計画ページからのリンク）、履歴の同期後にその問題を開く
  startupSync().then(() => { const id = new URLSearchParams(location.search).get('p'); if (id) openProblem(id); });
})();
