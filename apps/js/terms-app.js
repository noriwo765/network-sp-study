// 単語カード（データは flashcards/terms.js の TERMS）
(() => {
  const $ = id => document.getElementById(id);
  const chTitle = no => BOOK.chapters.find(c => c.no === no).title;

  let ch = 'all';
  let view = 'card';
  let deck = [];
  let idx = 0;
  let flipped = false;

  const inScope = () => TERMS.filter(t => inChapter(ch, t));
  const knownCount = list => list.filter(t => Progress.isKnown(t)).length;

  const chips = chapterChips($('chapters'), {
    label: no => {
      const list = TERMS.filter(t => inChapter(no, t));
      return `${knownCount(list)}/${list.length}`;
    },
    onSelect: no => { ch = no; buildDeck(); },
  });

  // ---- カード ----------------------------------------------------------

  function buildDeck(onlyUnknown = $('only-unknown').checked) {
    let list = inScope();
    if (onlyUnknown) list = list.filter(t => !Progress.isKnown(t));
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

    const finished = idx >= deck.length;
    $('flash').hidden = finished;
    $('judge-row').hidden = finished;
    $('done').hidden = !finished;
    if (finished) {
      $('pos').textContent = deck.length ? `${deck.length} / ${deck.length}` : '対象の用語がありません';
      $('done-score').textContent = `覚えた ${known} / ${scope.length}`;
      return;
    }
    const t = deck[idx];
    flipped = false;
    $('pos').textContent = `${idx + 1} / ${deck.length}`;
    $('flash-ch').textContent = `Ch.${t.ch} ${chTitle(t.ch)}${Progress.isKnown(t) ? '　✓ 覚えた' : ''}`;
    $('flash-term').textContent = t.term;
    $('flash-desc').textContent = t.desc;
    $('flash-note').textContent = t.note || '';
    $('flash-note').hidden = !t.note;
    $('flash-back').hidden = true;
    $('flash-hint').hidden = false;
    $('flash').classList.toggle('known', Progress.isKnown(t));
  }

  function flip() {
    if (idx >= deck.length) return;
    flipped = !flipped;
    $('flash-back').hidden = !flipped;
    $('flash-hint').hidden = flipped;
  }

  function judge(known) {
    if (idx >= deck.length) return;
    Progress.setKnown(deck[idx], known);
    idx++;
    render();
  }

  $('flash').addEventListener('click', flip);
  $('btn-known').addEventListener('click', () => judge(true));
  $('btn-unknown').addEventListener('click', () => judge(false));
  $('again-all').addEventListener('click', () => buildDeck(false));
  $('again-unknown').addEventListener('click', () => buildDeck(true));
  $('only-unknown').addEventListener('change', () => buildDeck());
  $('shuffle').addEventListener('change', () => buildDeck());

  // カードの左右スワイプ：右 = 覚えた、左 = まだ
  let touch = null;
  $('flash').addEventListener('touchstart', e => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $('flash').addEventListener('touchend', e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return;
    e.preventDefault(); // スワイプ後のタップ（裏返し）を起こさない
    judge(dx > 0);
  });

  document.addEventListener('keydown', e => {
    if (view !== 'card' || e.target.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    if (e.key === 'ArrowRight') judge(true);
    if (e.key === 'ArrowLeft') judge(false);
  });

  // ---- 一覧 ------------------------------------------------------------

  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    let list = inScope();
    if ($('only-unknown').checked) list = list.filter(t => !Progress.isKnown(t));
    if (q) list = list.filter(t => `${t.term} ${t.desc} ${t.note || ''}`.toLowerCase().includes(q));
    $('pos').textContent = `${list.length} 件`;
    $('list').innerHTML = list.map(t => {
      const known = Progress.isKnown(t);
      return `<div class="term-item ${known ? 'known' : ''}">
        <h4>${escapeHtml(t.term)}
          <button class="btn small" data-id="${escapeHtml(Progress.termId(t))}">${known ? '✓ 覚えた' : 'まだ'}</button>
        </h4>
        <p>${escapeHtml(t.desc)}</p>
        ${t.note ? `<p class="note">${escapeHtml(t.note)}</p>` : ''}
        <p class="muted">Ch.${t.ch} ${escapeHtml(chTitle(t.ch))}</p>
      </div>`;
    }).join('') || '<p class="muted">該当する用語がありません。</p>';
  }

  $('list').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const t = TERMS.find(x => Progress.termId(x) === b.dataset.id);
    Progress.setKnown(t, !Progress.isKnown(t));
    render();
  });
  $('search').addEventListener('input', renderList);

  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    view = b.dataset.view;
    document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('active', x === b));
    $('card-view').hidden = view !== 'card';
    $('list-view').hidden = view !== 'list';
    $('shuffle').closest('label').hidden = view !== 'card';
    view === 'card' ? buildDeck() : render();
  }));

  buildDeck();
})();
