// 紛らわしい用語の比較（データは flashcards/compare.js の COMPARES）
(() => {
  const $ = id => document.getElementById(id);
  const chTitle = no => BOOK.chapters.find(c => c.no === no).title;
  let ch = 'all';

  chapterChips($('chapters'), {
    label: no => String(COMPARES.filter(c => inChapter(no, c)).length),
    onSelect: no => { ch = no; render(); },
  });

  function cell(v, hide) {
    const html = escapeHtml(v);
    return hide ? `<button class="reveal-cell" data-html="${encodeURIComponent(html)}">？</button>` : html;
  }

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const hide = $('hide').checked;
    const list = COMPARES.filter(c => inChapter(ch, c))
      .filter(c => !q || `${c.title} ${c.point} ${c.head.join(' ')} ${c.rows.flat().join(' ')}`.toLowerCase().includes(q));
    $('count').textContent = `${list.length} 件`;
    $('list').innerHTML = list.map(c => `
      <article class="cmp">
        <h3>${escapeHtml(c.title)} <span class="muted">Ch.${c.ch} ${escapeHtml(chTitle(c.ch))}</span></h3>
        <p class="cmp-point">${hide ? cell(c.point, true) : `💡 ${escapeHtml(c.point)}`}</p>
        <div class="cmp-scroll">
          <table class="tbl cmp-tbl">
            <thead><tr>${c.head.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
            <tbody>${c.rows.map(r => `<tr><th>${escapeHtml(r[0])}</th>${r.slice(1).map(v => `<td>${cell(v, hide)}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </article>`).join('') || '<p class="muted">該当する比較がありません。</p>';
  }

  $('list').addEventListener('click', e => {
    const b = e.target.closest('.reveal-cell');
    if (b) b.outerHTML = decodeURIComponent(b.dataset.html);
  });
  $('search').addEventListener('input', render);
  $('hide').addEventListener('change', render);

  render();
})();
