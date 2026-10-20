// 理解度チェック（データは quizzes/check.js の CHECKS）
(() => {
  const $ = id => document.getElementById(id);
  const chTitle = no => BOOK.chapters.find(c => c.no === no).title;
  const KEYS = ['A', 'B', 'C', 'D'];

  let ch = 'all';
  let queue = [];
  let pos = 0;
  let wrong = [];
  let answered = false;

  const scope = () => CHECKS.filter(q => inChapter(ch, q));
  const lastOk = list => list.filter(q => Progress.check(q.id).last === true).length;
  const wrongOnes = list => list.filter(q => Progress.check(q.id).last === false);

  const chips = chapterChips($('chapters'), {
    label: no => {
      const list = CHECKS.filter(q => inChapter(no, q));
      return `${lastOk(list)}/${list.length}`;
    },
    onSelect: no => { ch = no; renderStart(); },
  });

  function show(id) {
    for (const s of ['start', 'quiz', 'result']) $(s).hidden = s !== id;
    window.scrollTo(0, 0);
  }

  // ---- 開始画面 --------------------------------------------------------

  function renderStart() {
    chips.refresh();
    const list = scope();
    const w = wrongOnes(list).length;
    $('mode-info').textContent = `${ch === 'all' ? '全章' : `Ch.${ch} ${chTitle(ch)}`}：${list.length} 問（直近で間違えた問題 ${w} 問）`;
    document.querySelector('[data-mode="wrong"]').disabled = w === 0;

    const rows = BOOK.chapters.map(c => {
      const qs = CHECKS.filter(q => q.ch === c.no);
      const done = qs.filter(q => Progress.check(q.id).last !== null).length;
      const ok = lastOk(qs);
      return { c, n: qs.length, done, ok };
    });
    const total = rows.reduce((a, r) => ({ n: a.n + r.n, done: a.done + r.done, ok: a.ok + r.ok }), { n: 0, done: 0, ok: 0 });
    const rate = r => (r.done ? `${Math.round((r.ok / r.done) * 100)}%` : '-');
    $('stats').innerHTML = `
      <thead><tr><th>章</th><th>問題</th><th>解答済</th><th>正答率</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td>${r.c.no} ${r.c.title}</td><td>${r.n}</td><td>${r.done}</td><td>${rate(r)}</td></tr>`).join('')}
        <tr><th>合計</th><th>${total.n}</th><th>${total.done}</th><th>${rate(total)}</th></tr>
      </tbody>`;
  }

  function start(list) {
    if (!list.length) return;
    queue = list;
    pos = 0;
    wrong = [];
    show('quiz');
    renderQuestion();
  }

  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    const list = scope();
    if (b.dataset.mode === 'all') start(list);
    if (b.dataset.mode === 'random') start(shuffled(list).slice(0, 10));
    if (b.dataset.mode === 'wrong') start(shuffled(wrongOnes(list)));
  }));

  $('reset').addEventListener('click', () => {
    if (!confirm('理解度チェックの成績をすべて消去しますか？')) return;
    Progress.reset('checks');
    renderStart();
  });

  // ---- 出題 ------------------------------------------------------------

  function renderQuestion() {
    const q = queue[pos];
    answered = false;
    $('q-pos').textContent = `${pos + 1} / ${queue.length}`;
    $('q-bar').style.width = `${(pos / queue.length) * 100}%`;
    $('q-ch').textContent = `Ch.${q.ch} ${chTitle(q.ch)}`;
    $('q-text').textContent = q.q;
    // 選択肢を並べ替え、元の添字を持たせる
    const order = shuffled(q.choices.map((_, i) => i));
    $('choices').innerHTML = order.map((orig, i) => `
      <button class="choice" data-orig="${orig}"><span class="key">${KEYS[i]}</span><span>${escapeHtml(q.choices[orig])}</span></button>`).join('');
    $('q-explain').hidden = true;
    $('q-next').hidden = true;
  }

  function answer(btn) {
    if (answered) return;
    answered = true;
    const q = queue[pos];
    const correct = Number(btn.dataset.orig) === q.answer;
    Progress.recordCheck(q.id, correct);
    if (!correct) wrong.push(q);
    $('choices').querySelectorAll('.choice').forEach(b => {
      b.disabled = true;
      if (Number(b.dataset.orig) === q.answer) b.classList.add('correct');
    });
    if (!correct) btn.classList.add('wrong');
    $('q-explain').innerHTML = `<span class="verdict ${correct ? 'ok' : 'ng'}">${correct ? '正解！' : '不正解'}</span>　${escapeHtml(q.explain)}`;
    $('q-explain').hidden = false;
    $('q-next').hidden = false;
    $('q-next').textContent = pos === queue.length - 1 ? '結果を見る' : '次へ';
    $('q-next').focus({ preventScroll: true });
  }

  function next() {
    pos++;
    if (pos < queue.length) renderQuestion();
    else showResult();
  }

  $('choices').addEventListener('click', e => {
    const b = e.target.closest('.choice');
    if (b) answer(b);
  });
  $('q-next').addEventListener('click', next);
  $('quit').addEventListener('click', () => { show('start'); renderStart(); });

  document.addEventListener('keydown', e => {
    if ($('quiz').hidden) return;
    const i = KEYS.indexOf(e.key.toUpperCase());
    if (!answered && i >= 0) answer($('choices').children[i]);
    else if (answered && e.key === 'Enter') { e.preventDefault(); next(); }
  });

  // ---- 結果 ------------------------------------------------------------

  function showResult() {
    const ok = queue.length - wrong.length;
    $('r-score').textContent = `${ok} / ${queue.length} 問正解`;
    $('r-retry').hidden = wrong.length === 0;
    $('r-wrong').innerHTML = wrong.map(q => `
      <div class="item">
        <p class="muted">Ch.${q.ch} ${escapeHtml(chTitle(q.ch))}</p>
        <p><b>${escapeHtml(q.q)}</b></p>
        <p>正解：${escapeHtml(q.choices[q.answer])}</p>
        <p class="muted">${escapeHtml(q.explain)}</p>
      </div>`).join('');
    show('result');
  }

  $('r-retry').addEventListener('click', () => start(shuffled(wrong)));
  $('r-back').addEventListener('click', () => { show('start'); renderStart(); });

  renderStart();
})();
