// 学習計画（plan.html）— ローカル専用
//
// - 計画（予定・チェック・メモ）は中継サーバの /plan（server/plan.json）に保存する。
//   書き込みは読んだ時点の版（version＝ファイル更新時刻）を添えて送り、食い違えばサーバが拒否する
//   （Claude Code やもう一方のマシンが書き換えた新しい計画を、開きっぱなしのタブで潰さない）。
// - 「解いたか」はワーク演習の履歴から自動判定する。履歴・配点は読むだけで書き込まない。
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PROBLEMS = window.WORK_PROBLEMS || [];
  const probOf = id => PROBLEMS.find(p => p.id === id);

  let plan = null, version = 0, hist = {}, haiten = {};
  let stale = false;

  // ---- 読み込み ------------------------------------------------------
  const getJson = async url => { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
  const local = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };

  // 履歴：サーバのファイルとこの端末（localStorage）の新しい方を使う（ワーク演習と同じ判定）
  async function loadHistory() {
    let file = null; try { file = await getJson('/history'); } catch (_) {}
    const loc = local('nespe-work-v1') || {};
    const locAt = Number(localStorage.getItem('nespe-work-at')) || 0;
    const fileAt = file && file.savedAt ? Date.parse(file.savedAt) || 0 : 0;
    const fileData = (file && file.data) || {};
    return Object.keys(fileData).length && (!Object.keys(loc).length || fileAt > locAt) ? fileData : loc;
  }
  // 配点：rev の新しい方を採用し、もう一方にしか無いキーは足す
  async function loadHaiten() {
    let file = null; try { file = await getJson('/haiten'); } catch (_) {}
    const fileMap = (file && file.haiten) || {}, fileRev = Number(file && file.rev) || 0;
    const locMap = local('nespe-work-haiten-v1') || {}, locRev = Number(localStorage.getItem('nespe-work-haiten-rev')) || 0;
    const [a, b] = fileRev > locRev ? [fileMap, locMap] : [locMap, fileMap];
    return { ...b, ...a };
  }

  // ---- 集計 ----------------------------------------------------------
  const attempts = (pid, qid) => (hist[`${pid}:${qid}`] || {}).attempts || [];
  const maxOf = (pid, qid, r) => {
    const h = haiten[`${pid}:${qid}`];
    if (typeof h === 'number' && h > 0) return h;
    if (h && typeof h === 'object') { const s = Object.values(h).reduce((x, v) => x + (Number(v) > 0 ? Number(v) : 0), 0); if (s > 0) return s; }
    return typeof r.scoreMax === 'number' ? r.scoreMax : 10;
  };
  function stats(p) {
    let graded = 0, score = 0, max = 0;
    for (const q of p.questions) {
      const at = attempts(p.id, q.id);
      if (!at.length) continue;
      graded++;
      const r = at[at.length - 1].result || {};
      score += typeof r.score === 'number' ? r.score : 0;
      max += maxOf(p.id, q.id, r);
    }
    return { graded, total: p.questions.length, score, max, pct: max ? Math.round(score / max * 100) : null };
  }

  // タスクの状態：auto＝履歴から自動判定、done＝済（自動または手動チェック）
  // solve は計画の作成（createdAt）以降の採点だけを数え、全設問が need 回（既定1）採点されたら済。
  // 2周目のタスクは need: 2 にする（1周目の採点で2周目まで済にならないように）。
  function taskState(t) {
    const manual = !!(plan.checks || {})[t.id];
    const since = Date.parse(plan.createdAt) || 0;
    if (t.type === 'solve') {
      const p = probOf(t.pid);
      if (!p) return { manual, auto: false, done: manual, info: '' };
      const need = t.need || 1;
      let graded = 0, score = 0, max = 0;
      for (const q of p.questions) {
        const at = attempts(p.id, q.id).filter(a => (a.at || 0) >= since);
        if (at.length < need) continue;
        graded++;
        const r = at[at.length - 1].result || {};
        score += typeof r.score === 'number' ? r.score : 0;
        max += maxOf(p.id, q.id, r);
      }
      const total = p.questions.length, auto = graded === total;
      const pct = max ? Math.round(score / max * 100) : 0;
      const info = graded === 0 ? '' : auto ? `完答 ${score}/${max}点（${pct}%）` : `着手 ${graded}/${total}設問`;
      return { manual, auto, done: auto || manual, info, pct: auto ? pct : null };
    }
    if (t.type === 'redo') {
      const n = (t.qids || []).filter(q => attempts(t.pid, q).some(a => (a.at || 0) >= since)).length;
      const auto = n === (t.qids || []).length && n > 0;
      return { manual, auto, done: auto || manual, info: n ? `解き直し ${n}/${t.qids.length}` : '' };
    }
    return { manual, auto: false, done: manual, info: '' };
  }

  // ---- 日付 ----------------------------------------------------------
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const label = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };

  // ---- 予定の切り替え（例：休日出勤になったとき） --------------------------
  // day.toggle = { flag, label, hours } で日ごとにスイッチを出す。flag が立つと、
  // タスクの when: flag は表示、unless: flag は非表示になる（日をまたいだ振り替えもこれで書く）。
  const flags = () => plan.flags || {};
  const shown = t => (!t.when || !!flags()[t.when]) && (!t.unless || !flags()[t.unless]);
  const tasksOf = d => (d.tasks || []).filter(shown);
  const hoursOf = d => (d.toggle && flags()[d.toggle.flag] && d.toggle.hours) || d.hours;

  // ---- 表示 ----------------------------------------------------------
  const probName = pid => { const p = probOf(pid); return p ? `${p.yearLabel} ${p.sectionLabel} 問${p.no}　${p.title}` : pid; };
  function taskHtml(t) {
    const s = taskState(t);
    let title;
    if (t.type === 'solve') title = `<a href="work.html?p=${encodeURIComponent(t.pid)}">${esc(probName(t.pid))}</a>`;
    else if (t.type === 'redo') title = `<a href="work.html?p=${encodeURIComponent(t.pid)}">${esc(probName(t.pid))}</a> の解き直し：${esc((t.qids || []).join('・'))}`;
    else title = esc(t.text);
    const kind = t.round ? `${t.round}周目` : ({ solve: '解く', redo: '解き直し', text: 'やること' }[t.type] || '');
    const pctCls = s.pct == null ? '' : s.pct >= 60 ? ' good' : ' low';
    return `<li class="task${s.done ? ' done' : ''}">
      <label class="tk-check" title="${s.auto ? '履歴から自動で済' : '手動でチェック'}">
        <input type="checkbox" data-id="${esc(t.id)}" ${s.done ? 'checked' : ''} ${s.auto ? 'disabled' : ''}>
      </label>
      <div class="tk-main">
        <div class="tk-title"><span class="tk-kind">${kind}</span>${title}</div>
        ${t.note ? `<div class="tk-note">${esc(t.note)}</div>` : ''}
        ${s.info ? `<div class="tk-info${pctCls}">${s.auto ? '✓ ' : ''}${esc(s.info)}</div>` : ''}
      </div>
    </li>`;
  }

  function render() {
    const today = ymd(new Date());
    const exam = parse(plan.examDate);
    const left = Math.round((exam - parse(today)) / 864e5);

    const all = plan.days.flatMap(d => tasksOf(d).map(t => ({ t, date: d.date })));
    const st = new Map(all.map(x => [x.t.id, taskState(x.t)]));
    const done = all.filter(x => st.get(x.t.id).done).length;
    // 遅れ＝前日までの予定で未完了のもの（今日の分は「今日の残り」として別に数える）
    const behind = all.filter(x => x.date < today && !st.get(x.t.id).done).length;
    const todayLeft = all.filter(x => x.date === today && !st.get(x.t.id).done).length;
    const ahead = all.filter(x => x.date > today && st.get(x.t.id).done).length;

    const pstats = PROBLEMS.map(stats);
    const touched = pstats.filter(s => s.graded > 0).length;
    const sumS = pstats.reduce((a, s) => a + s.score, 0), sumM = pstats.reduce((a, s) => a + s.max, 0);
    const avg = sumM ? Math.round(sumS / sumM * 100) : 0;

    const pace = behind > 0 ? `前日までの予定のうち ${behind} 件が未完了です。「方針・目標・遅れたとき」を参考に組み替えましょう。`
      : ahead > 0 ? `予定より ${ahead} 件先行しています。すばらしい！`
      : todayLeft > 0 ? `予定どおり。今日の残りはあと ${todayLeft} 件です。`
      : '今日の予定は全部達成！この調子です。';

    const todayDay = plan.days.find(d => d.date === today);
    const todayHtml = left < 0 ? '<p>本番は終わりました。おつかれさまでした！</p>'
      : left === 0 ? '<p class="today-exam">今日は本番です。いってらっしゃい！</p>'
      : todayDay ? `<p class="today-hours">${esc(hoursOf(todayDay))}</p><ul class="tasks">${tasksOf(todayDay).map(taskHtml).join('')}</ul>`
      : '<p>今日の予定はありません。</p>';

    const dayHtml = d => {
      const tasks = tasksOf(d).map(t => st.get(t.id));
      const allDone = tasks.length > 0 && tasks.every(s => s.done);
      const tg = d.toggle ? `<label class="day-toggle"><input type="checkbox" data-flag="${esc(d.toggle.flag)}" ${flags()[d.toggle.flag] ? 'checked' : ''}> ${esc(d.toggle.label)}</label>` : '';
      const cls = d.date === today ? 'today' : d.date < today ? 'past' : 'future';
      return `<section class="day ${cls}${allDone ? ' all-done' : ''}">
        <div class="day-head"><span class="day-date">${label(d.date)}</span><span class="day-hours">${esc(hoursOf(d))}</span>${allDone ? '<span class="pstate done">達成</span>' : d.date < today ? '<span class="pstate part">残りあり</span>' : ''}${tg}</div>
        ${d.toggle && flags()[d.toggle.flag] && d.toggle.note ? `<p class="day-alt">${esc(d.toggle.note)}</p>` : ''}
        <ul class="tasks">${tasksOf(d).map(taskHtml).join('')}</ul>
        <textarea class="memo" data-date="${d.date}" rows="1" placeholder="メモ（振り返り・気づき）">${esc((plan.memo || {})[d.date] || '')}</textarea>
      </section>`;
    };

    $('#plan-body').innerHTML = `
      <div class="prog-cards">
        <div class="prog-card"><div class="pc-num">${Math.max(0, left)}<span class="pc-den"> 日</span></div><div class="pc-lbl">本番（${label(plan.examDate)}）まで</div></div>
        <div class="prog-card"><div class="pc-num">${done}<span class="pc-den"> / ${all.length}</span></div><div class="pc-lbl">計画の達成</div></div>
        <div class="prog-card"><div class="pc-num">${touched}<span class="pc-den"> / ${PROBLEMS.length}</span></div><div class="pc-lbl">挑戦した問題</div></div>
        <div class="prog-card"><div class="pc-num">${avg}<span class="pc-den">%</span></div><div class="pc-lbl">平均得点率</div></div>
      </div>
      <p class="pace${behind ? ' behind' : ''}">${pace}</p>

      <section class="today-card"><h2>今日やること</h2>${todayHtml}</section>

      <details class="plan-tips"><summary>方針・目標・遅れたとき</summary>
        <ul>${(plan.goals || []).map(g => `<li>目標：${esc(g)}</li>`).join('')}${(plan.tips || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul>
      </details>

      <h2>予定</h2>
      ${plan.days.map(dayHtml).join('')}
      ${(plan.extra || []).filter(shown).length ? `<section class="day extra"><div class="day-head"><span class="day-date">余裕があれば</span></div><ul class="tasks">${plan.extra.filter(shown).map(taskHtml).join('')}</ul></section>` : ''}
    `;
  }

  // ---- 保存 ----------------------------------------------------------
  let putTimer = null;
  function save() {
    if (stale) return;
    clearTimeout(putTimer);
    putTimer = setTimeout(async () => {
      try {
        const r = await fetch('/plan', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseVersion: version, plan }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 409) { stale = true; banner(`${j.error || '計画ファイルが更新されています。'} <button class="btn small" onclick="location.reload()">再読み込み</button>`); return; }
        if (!r.ok) throw new Error(j.error || r.status);
        version = j.version;
        banner('');
      } catch (e) { banner(`保存できませんでした（${esc(e.message || e)}）。サーバが起動しているか確認してください。`); }
    }, 500);
  }
  const banner = html => { $('#plan-banner').innerHTML = html ? `<p class="plan-banner">${html}</p>` : ''; };

  $('#plan-body').addEventListener('change', e => {
    const fl = e.target.closest('input[type=checkbox][data-flag]');
    if (fl) {
      plan.flags = plan.flags || {};
      if (fl.checked) plan.flags[fl.dataset.flag] = true; else delete plan.flags[fl.dataset.flag];
      save(); render(); return;
    }
    const cb = e.target.closest('input[type=checkbox][data-id]');
    if (!cb) return;
    plan.checks = plan.checks || {};
    if (cb.checked) plan.checks[cb.dataset.id] = true; else delete plan.checks[cb.dataset.id];
    save(); render();
  });
  $('#plan-body').addEventListener('input', e => {
    const m = e.target.closest('textarea.memo');
    if (!m) return;
    plan.memo = plan.memo || {};
    if (m.value.trim()) plan.memo[m.dataset.date] = m.value; else delete plan.memo[m.dataset.date];
    save();
  });

  // ---- 起動 ----------------------------------------------------------
  (async () => {
    let j;
    try { j = await getJson('/plan'); }
    catch (_) { banner('計画を読み込めません。<code>node server/relay.js</code> を起動（すでに起動中なら再起動）してから開き直してください。'); return; }
    if (!j.plan) { banner('計画がまだありません（<code>server/plan.json</code>）。Claude Code に「学習計画を作って」と頼んでください。'); return; }
    plan = j.plan; version = j.version;
    [hist, haiten] = await Promise.all([loadHistory(), loadHaiten()]);
    render();
  })();
})();
