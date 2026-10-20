// 単語カード・理解度チェック共通
// - Progress：学習記録。この端末のブラウザ（localStorage）に保存する。使えない環境でも動作は続ける
// - chapterChips：「すべて」＋本の章ボタン

const Progress = (() => {
  const KEY = 'nespe-progress-v1';
  let data = { terms: {}, checks: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) data = { terms: saved.terms || {}, checks: saved.checks || {} };
  } catch (e) { /* 保存領域が使えなくても続行 */ }

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 同上 */ }
  };

  return {
    termId: t => `${t.ch}:${t.term}`,
    isKnown: t => !!(data.terms[`${t.ch}:${t.term}`] || {}).known,
    setKnown(t, known) {
      data.terms[`${t.ch}:${t.term}`] = { known, at: Date.now() };
      save();
    },
    // { ok: 正解回数, ng: 不正解回数, last: 直近の正誤（未解答は null） }
    check: id => data.checks[id] || { ok: 0, ng: 0, last: null },
    recordCheck(id, correct) {
      const c = { ...this.check(id) };
      c[correct ? 'ok' : 'ng']++;
      c.last = correct;
      c.at = Date.now();
      data.checks[id] = c;
      save();
    },
    reset(kind) {
      data[kind] = {};
      save();
    },
  };
})();

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// container に章ボタンを並べる。label(no) は各ボタンに添える小さな文字（進捗など）を返す
function chapterChips(container, { label, onSelect }) {
  let active = 'all';
  const items = [{ no: 'all', title: 'すべて' }, ...BOOK.chapters];

  function render() {
    container.innerHTML = items.map(c => `
      <button data-no="${c.no}" class="${c.no === active ? 'active' : ''}">
        ${c.no === 'all' ? '' : `<span class="ch-no">${c.no}</span>`}${c.title}
        <small>${label(c.no)}</small>
      </button>`).join('');
    const btn = container.querySelector('button.active');
    if (btn && container.scrollWidth > container.clientWidth) {
      container.scrollLeft = btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2;
    }
  }

  container.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    active = b.dataset.no === 'all' ? 'all' : Number(b.dataset.no);
    render();
    onSelect(active);
  });

  render();
  return { refresh: render, get active() { return active; } };
}

const inChapter = (ch, item) => ch === 'all' || item.ch === ch;
