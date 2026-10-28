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
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {} syncToServer(); };
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
      // バックアップ／復元用：保存データ全体の読み書き
      raw() { return data; },
      replaceAll(obj) { data = obj || {}; save(); },
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
      return `<button data-id="${p.id}">
        <span class="tag">${esc(p.yearLabel)}　${esc(p.sectionLabel)}　問${p.no}</span>
        <div class="ttl">${esc(p.title)}${done ? `<span class="done">解答済 ${done}/${total}</span>` : ''}</div>
      </button>`;
    }).join('') : `<p class="muted">該当する問題がありません。</p>`;
    $('#prob-list').onclick = e => { const b = e.target.closest('button'); if (b) openProblem(b.dataset.id); };
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

  function renderQuestion(p, q) {
    const key = `${p.id}:${q.id}`;
    const saved = Store.q(key);
    return `<div class="setq" data-qid="${esc(q.id)}">
      ${q.group ? `<p class="group">${esc(q.group)}</p>` : ''}
      <p class="prompt"><span class="qid">${esc(q.id)}</span>${esc(q.prompt)}${q.charLimit ? `<span class="limit">（${esc(q.charLimit)}）</span>` : ''}</p>
      <textarea placeholder="ここに解答を入力">${esc(saved.answer || '')}</textarea>
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
      const ta = card.querySelector('textarea');
      const count = card.querySelector('.count');
      const updateCount = () => { count.textContent = `${[...ta.value.trim()].length} 字`; };
      updateCount();
      ta.addEventListener('input', () => { updateCount(); Store.setDraft(key, ta.value); });
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
      const r = await fetch('/grade', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `${p.yearLabel} ${p.sectionLabel} 問${p.no}「${p.title}」\n${p.overview || ''}\n\n${bodyToText(p.body)}`,
          questionNo: q.id, questionText: q.prompt, charLimit: q.charLimit || '',
          officialAnswer: q.answer || '', commentary: p.commentary || '', studentAnswer: answer,
        }),
      });
      const j = await r.json();
      if (!r.ok) { out.innerHTML = `<p class="err">採点エラー：${esc(j.error || r.status)}${j.detail ? '<br>' + esc(j.detail) : ''}</p>`; return null; }
      Store.addAttempt(key, { at: Date.now(), elapsed: Timer.sec, answer, result: j });
      showResult(card, key);
      saveRecord(p); // 採点のたび、解答記録(Markdown)を 解答記録/ に自動保存
      return j;
    } catch (e) {
      out.innerHTML = `<p class="err">通信に失敗しました：${esc(e.message)}</p>`;
      return null;
    }
  }

  async function gradeOne(p, q, card, key) {
    const answer = card.querySelector('textarea').value.trim();
    const out = card.querySelector('.grade-result');
    if (!answer) { out.innerHTML = `<p class="err">解答を入力してください。</p>`; return; }
    if (!serverOk) { out.innerHTML = `<p class="err">中継サーバが利用できません。<code>node server/relay.js</code> を起動してください。</p>`; return; }
    const btn = card.querySelector('.grade'); btn.disabled = true;
    await runGrade(p, q, card, key, answer);
    btn.disabled = false;
  }

  // まとめて採点（提出）：入力済みの設問を一括採点し、合計点を表示（本番に近い流れ）
  async function gradeAll() {
    const p = current; if (!p) return;
    if (!serverOk) { $('#grade-summary').innerHTML = `<div class="banner warn">中継サーバが利用できません。<code>node server/relay.js</code> を起動してください。</div>`; return; }
    const cards = {};
    $('#s-questions').querySelectorAll('.setq').forEach(c => { cards[c.dataset.qid] = c; });
    const items = p.questions.map(q => {
      const card = cards[q.id];
      return { q, card, key: `${p.id}:${q.id}`, answer: card.querySelector('textarea').value.trim() };
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
  function currentPayload() {
    let swap = '0'; try { swap = localStorage.getItem('nespe-work-swap') || '0'; } catch (_) {}
    return { app: BACKUP_TAG, version: 1, savedAt: new Date().toISOString(), swap, data: Store.raw() };
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
  // 起動時：サーバのファイルを読み、中身があればこの端末を丸ごと上書きする
  async function startupSync() {
    let payload = null;
    try { const r = await fetch('/history', { cache: 'no-store' }); if (!r.ok) return; payload = await r.json(); }
    catch (_) { return; } // サーバ無し（GitHub Pages 等）→ localStorage だけで動く
    serverHist = true;
    if (payload && payload.data && Object.keys(payload.data).length) {
      Store.replaceAll(payload.data); // ファイルが正＝完全上書き
      try { if (payload.swap != null) localStorage.setItem('nespe-work-swap', payload.swap); } catch (_) {}
      swapped = payload.swap === '1';
      note(`サーバの履歴を読み込みました（${new Date(payload.savedAt || Date.now()).toLocaleString()} 時点・項目 ${Object.keys(payload.data).length} 件）。`);
    } else {
      // ファイルが空なら、今この端末にある履歴でファイルを作る（初回の取りこぼし防止）
      fetch('/history', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(currentPayload()) }).catch(() => {});
      note('この端末の履歴をサーバ(server/history.json)に保存しました。別端末へはこのファイルをコピーしてください。');
    }
    renderPicker();
  }
  // 手動：現在の履歴をファイルに書き出す（バックアップ／持ち運び用）
  function exportHistory() {
    const blob = new Blob([JSON.stringify(currentPayload(), null, 2)], { type: 'application/json' });
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
  // 「今この瞬間」の問題全体のスナップショット（各設問は最新の採点回を載せる）
  function buildSnapshotMd(p) {
    const L = [`# ${p.yearLabel} ${p.sectionLabel} 問${p.no}　${p.title}`, ''];
    L.push(`- 記録日時：${stamp(Date.now())}`);
    const tsec = Store.timer(p.id); if (tsec) L.push(`- 所要時間：${fmt(tsec)}`);
    if (p.overview) L.push(`- 出題趣旨：${p.overview}`);
    if (p.source) L.push(`- 出典：${p.source}`);
    L.push('');
    for (const q of p.questions) {
      const attempts = Store.q(`${p.id}:${q.id}`).attempts || [];
      L.push(`## 設問 ${q.id}${q.group ? `（${q.group}）` : ''}`, '');
      L.push(`**問題**：${q.prompt}${q.charLimit ? `（${q.charLimit}）` : ''}`, '');
      if (q.answer) L.push(`**公式解答例**：${q.answer}`, '');
      if (!attempts.length) { L.push('_この時点では未採点_', ''); continue; }
      const a = attempts[attempts.length - 1];
      L.push(`**この時点：第${attempts.length}回（${stamp(a.at)}・経過 ${fmt(a.elapsed || 0)}）**`, '');
      L.push('**あなたの解答**：', '', quote(a.answer), '');
      L.push(...resultMd(a.result));
    }
    return L.join('\n');
  }
  let recTimer = null;
  function saveRecord(p) {
    if (!serverHist || !p) return;
    clearTimeout(recTimer); // まとめて採点など連続採点は 1 ファイルにまとめる
    const snapshot = buildSnapshotMd(p);
    const name = `${recordDir(p)}/${tsStamp()}.md`;
    recTimer = setTimeout(() => {
      fetch('/record', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, markdown: snapshot }),
      }).catch(() => {});
    }, 500);
  }

  // ---- 起動 ----------------------------------------------------------
  renderPicker();
  checkServer();
  startupSync();
})();
