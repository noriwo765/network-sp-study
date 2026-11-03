// 過去問 一問一答（データは flashcards/qa_*.js の QA_CARDS）
// 3つの使い方：カード（表=問い/裏=答え＋理由＋覚え方＋アニメ）／4択（選んで回答）／一覧・検索
(() => {
  const $ = id => document.getElementById(id);
  const examOf = c => EXAMS.find(e => e.id === c.exam) || {};
  const heading = c => `${c.src || examOf(c).short || ''} ${examOf(c).title || ''}　${c.theme || ''}`;
  const CARDS = window.QA_CARDS || [];
  const KEYS = ['ア', 'イ', 'ウ', 'エ'];

  // 覚えた記録（この端末・localStorage）。カード id をキー
  const QA = (() => {
    const KEY = 'nespe-qa-v1';
    let d = {};
    try { d = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {} if (window.ProgressSync) ProgressSync.changed(); };
    return { isKnown: c => !!d[c.id], setKnown(c, k) { if (k) d[c.id] = 1; else delete d[c.id]; save(); } };
  })();

  let scope = 'all', view = 'card', deck = [], idx = 0;

  // 苦手（weak: ワーク演習で失点した論点。flashcards/qa_weak.js）だけに絞る。qa.html?weak=1 で最初から絞る
  if (new URLSearchParams(location.search).has('weak')) $('only-weak').checked = true;
  const weakMode = () => $('only-weak').checked;
  const pool = () => CARDS.filter(c => !!c.weak === weakMode());
  // 絞り込みの軸：通常は過去問ごと、苦手はジャンル（theme）ごと
  const keyOf = c => weakMode() ? c.theme : c.exam;
  const inKey = (key, c) => key === 'all' || keyOf(c) === key;
  const inScope = () => pool().filter(c => inKey(scope, c));
  const knownCount = list => list.filter(c => QA.isKnown(c)).length;
  const sceneLink = c => c.scene
    ? `<a class="anime-link" href="packet-flow.html#${encodeURI(c.scene)}" target="_blank" rel="noopener">▶ 関連アニメを見る</a>` : '';

  const chips = keyChips($('chapters'), {
    items: () => weakMode()
      ? [...new Set(pool().map(c => c.theme))].map(t => ({ key: t, title: t }))
      : EXAMS.map(e => ({ key: e.id, tag: e.short, title: e.title })),
    label: key => { const l = pool().filter(c => inKey(key, c)); return `${knownCount(l)}/${l.length}`; },
    onSelect: key => { scope = key; view === 'quiz' ? buildQuiz() : buildDeck(); },
  });

  // ---- カード --------------------------------------------------------
  function buildDeck(onlyUnknown = $('only-unknown').checked) {
    let list = inScope();
    if (onlyUnknown) list = list.filter(c => !QA.isKnown(c));
    deck = $('shuffle').checked ? shuffled(list) : list;
    idx = 0;
    render();
  }

  function render() {
    const scope = inScope();
    const known = knownCount(scope);
    $('known-count').textContent = `覚えた ${known} / ${scope.length}`;
    $('bar').style.width = scope.length ? `${(known / scope.length) * 100}%` : '0';
    chips.refresh();
    if (view === 'list') return renderList();
    if (view === 'quiz') return;

    const finished = idx >= deck.length;
    $('flash').hidden = finished;
    $('judge-row').hidden = finished;
    $('done').hidden = !finished;
    if (finished) {
      $('pos').textContent = deck.length ? `${deck.length} / ${deck.length}` : '対象のカードがありません';
      $('done-score').textContent = `覚えた ${known} / ${scope.length}`;
      return;
    }
    const c = deck[idx];
    $('pos').textContent = `${idx + 1} / ${deck.length}`;
    $('flash-ch').textContent = `${heading(c)}${c.weak ? '　★苦手' : ''}${QA.isKnown(c) ? '　✓ 覚えた' : ''}`;
    $('flash-q').textContent = c.q;
    $('flash-a').textContent = c.a;
    $('flash-miss').textContent = c.miss ? `前回のつまずき：${c.miss}` : '';
    $('flash-miss').hidden = !c.miss;
    $('flash-kaisetsu').textContent = c.kaisetsu || '';
    $('flash-kaisetsu').hidden = !c.kaisetsu;
    $('flash-oboe').textContent = c.oboe ? `覚え方：${c.oboe}` : '';
    $('flash-oboe').hidden = !c.oboe;
    $('flash-scene').innerHTML = sceneLink(c);
    $('flash-back').hidden = true;
    $('flash-hint').hidden = false;
    $('flash').classList.toggle('known', QA.isKnown(c));
  }

  function flip() {
    if (idx >= deck.length) return;
    const show = $('flash-back').hidden;
    $('flash-back').hidden = !show;
    $('flash-hint').hidden = show;
  }
  function judge(known) {
    if (idx >= deck.length) return;
    QA.setKnown(deck[idx], known);
    idx++;
    render();
  }

  $('flash').addEventListener('click', e => { if (e.target.closest('a')) return; flip(); });
  $('btn-known').addEventListener('click', () => judge(true));
  $('btn-unknown').addEventListener('click', () => judge(false));
  $('again-all').addEventListener('click', () => buildDeck(false));
  $('again-unknown').addEventListener('click', () => buildDeck(true));
  $('only-unknown').addEventListener('change', () => view === 'quiz' ? buildQuiz() : buildDeck());
  $('only-weak').addEventListener('change', () => { scope = 'all'; chips.refresh(); if (view === 'quiz') buildQuiz(); else if (view === 'list') render(); else buildDeck(); });
  $('shuffle').addEventListener('change', () => buildDeck());

  let touch = null;
  $('flash').addEventListener('touchstart', e => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $('flash').addEventListener('touchend', e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return;
    e.preventDefault();
    judge(dx > 0);
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (view === 'card') {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      if (e.key === 'ArrowRight') judge(true);
      if (e.key === 'ArrowLeft') judge(false);
    }
  });

  // ---- 4択 ----------------------------------------------------------
  let qDeck = [], qIdx = 0, qScore = 0, qWrong = [], qAnswered = false, qOrder = [];

  function buildQuiz(list) {
    let base = list || inScope();
    if (!list && $('only-unknown').checked) base = base.filter(c => !QA.isKnown(c));
    qDeck = shuffled(base);
    qIdx = 0; qScore = 0; qWrong = [];
    renderQuiz();
  }

  function renderQuiz() {
    chips.refresh();
    const finished = qIdx >= qDeck.length;
    $('q-card').hidden = finished;
    $('q-done').hidden = !finished;
    $('q-score').textContent = qDeck.length ? `正解 ${qScore} / ${qDeck.length}` : '';
    $('q-bar').style.width = qDeck.length ? `${(qIdx / qDeck.length) * 100}%` : '0';
    if (finished) {
      $('q-pos').textContent = qDeck.length ? `${qDeck.length} / ${qDeck.length}` : '対象のカードがありません';
      $('q-done-score').textContent = qDeck.length ? `正解 ${qScore} / ${qDeck.length}（間違い ${qWrong.length}）` : 'この条件のカードがありません';
      $('q-again-wrong').hidden = !qWrong.length;
      return;
    }
    const c = qDeck[qIdx];
    qAnswered = false;
    $('q-pos').textContent = `${qIdx + 1} / ${qDeck.length}`;
    $('q-ch').textContent = heading(c);
    $('q-q').textContent = c.q;
    // 選択肢をシャッフルして表示（正解の表示位置を記録）
    qOrder = shuffled(c.choices.map((t, i) => ({ t, i })));
    $('q-choices').innerHTML = qOrder.map((o, pos) =>
      `<button class="choice" data-pos="${pos}"><span class="key">${KEYS[pos]}</span><span>${escapeHtml(o.t)}</span></button>`).join('');
    $('q-explain').hidden = true;
    $('q-next').hidden = true;
  }

  $('q-choices').addEventListener('click', e => {
    const b = e.target.closest('.choice');
    if (!b || qAnswered) return;
    qAnswered = true;
    const c = qDeck[qIdx];
    const pos = Number(b.dataset.pos);
    const correctPos = qOrder.findIndex(o => o.i === c.answer);
    const btns = [...$('q-choices').querySelectorAll('.choice')];
    btns.forEach((x, i) => { if (i === correctPos) x.classList.add('correct'); });
    if (pos === correctPos) { qScore++; QA.setKnown(c, true); }
    else { btns[pos].classList.add('wrong'); qWrong.push(c); }
    $('q-explain').hidden = false;
    $('q-explain').innerHTML = `
      <p class="verdict ${pos === correctPos ? 'ok' : 'ng'}">${pos === correctPos ? '正解' : '不正解'}</p>
      <p><strong>${escapeHtml(c.a)}</strong></p>
      ${c.miss ? `<p class="miss">前回のつまずき：${escapeHtml(c.miss)}</p>` : ''}
      ${c.kaisetsu ? `<p class="kaisetsu">${escapeHtml(c.kaisetsu)}</p>` : ''}
      ${c.oboe ? `<p class="oboe">覚え方：${escapeHtml(c.oboe)}</p>` : ''}
      ${c.scene ? `<p class="scene-link">${sceneLink(c)}</p>` : ''}`;
    $('q-score').textContent = `正解 ${qScore} / ${qDeck.length}`;
    $('q-next').hidden = false;
    $('q-next').focus();
  });
  $('q-next').addEventListener('click', () => { qIdx++; renderQuiz(); });
  $('q-again-all').addEventListener('click', () => buildQuiz());
  $('q-again-wrong').addEventListener('click', () => buildQuiz(qWrong.slice()));

  // ---- 一覧・検索 ----------------------------------------------------
  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    let list = inScope();
    if ($('only-unknown').checked) list = list.filter(c => !QA.isKnown(c));
    if (q) list = list.filter(c => `${c.q} ${c.a} ${c.miss || ''} ${c.src || ''} ${c.kaisetsu || ''} ${c.oboe || ''} ${c.theme || ''}`.toLowerCase().includes(q));
    $('pos').textContent = `${list.length} 件`;
    $('list').innerHTML = list.map(c => {
      const known = QA.isKnown(c);
      return `<div class="term-item ${known ? 'known' : ''}">
        <h4>${escapeHtml(c.q)}
          <button class="btn small" data-id="${escapeHtml(c.id)}">${known ? '✓ 覚えた' : 'まだ'}</button>
        </h4>
        <p><strong>${escapeHtml(c.a)}</strong></p>
        ${c.miss ? `<p class="note">前回のつまずき：${escapeHtml(c.miss)}</p>` : ''}
        ${c.kaisetsu ? `<p class="note">${escapeHtml(c.kaisetsu)}</p>` : ''}
        ${c.oboe ? `<p class="note">覚え方：${escapeHtml(c.oboe)}</p>` : ''}
        <p class="muted">${escapeHtml(heading(c))}${c.scene ? `　<a class="anime-link" href="packet-flow.html#${encodeURI(c.scene)}">▶ アニメ</a>` : ''}</p>
      </div>`;
    }).join('') || '<p class="muted">該当するカードがありません。</p>';
  }
  $('list').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    const c = CARDS.find(x => x.id === b.dataset.id);
    QA.setKnown(c, !QA.isKnown(c));
    renderList(); render();
  });
  $('search').addEventListener('input', renderList);

  // ---- ビュー切替 ----------------------------------------------------
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('active', x === b));
    $('card-view').hidden = view !== 'card';
    $('quiz-view').hidden = view !== 'quiz';
    $('list-view').hidden = view !== 'list';
    $('shuffle').closest('label').hidden = view !== 'card';
    if (view === 'card') buildDeck();
    else if (view === 'quiz') buildQuiz();
    else render();
  }));

  buildDeck();
})();
