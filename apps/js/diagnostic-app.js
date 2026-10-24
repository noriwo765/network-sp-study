// 重点3ジャンル診断テスト
// - window.DIAGNOSTIC（quizzes/diagnostic.js）を一覧表示
// - 各問「解答・解説を見る」で確認し 〇／△／× で自己採点
// - 結果はこの端末（localStorage）に保存。弱点サブトピックを自動抽出

(() => {
  const DATA = window.DIAGNOSTIC || [];
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PARTS = [{ v: 'A', name: 'IPヘッダ' }, { v: 'B', name: 'ルーティング' }, { v: 'C', name: 'セキュリティ' }];

  const Store = (() => {
    const KEY = 'nespe-diagnostic-v1';
    let data = {};
    try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {} };
    return {
      get: id => data[id] || null,
      set(id, v) { if (v) data[id] = v; else delete data[id]; save(); },
      clear() { data = {}; save(); },
    };
  })();

  let filter = 'all';

  // ---- 集計・弱点 ----------------------------------------------------
  function counts(list) {
    const c = { '〇': 0, '△': 0, '×': 0, '未': 0 };
    for (const q of list) { const r = Store.get(q.id); c[r || '未']++; }
    return c;
  }
  function renderSummary() {
    const all = counts(DATA);
    const per = PARTS.map(p => {
      const c = counts(DATA.filter(q => q.part === p.v));
      return `<div class="sum-part"><span class="sum-name">${esc(p.name)}</span>
        <span class="g ok">〇${c['〇']}</span><span class="g mid">△${c['△']}</span><span class="g ng">×${c['×']}</span><span class="g non">未${c['未']}</span></div>`;
    }).join('');
    $('#summary').innerHTML = `
      <div class="sum-total">解答済 ${DATA.length - all['未']} / ${DATA.length}
        <span class="g ok">〇${all['〇']}</span><span class="g mid">△${all['△']}</span><span class="g ng">×${all['×']}</span></div>
      ${per}`;
  }
  function renderWeak() {
    // ×・△ を優先順で（× 優先、同結果なら難易度が低い=基礎ほど優先）
    const weak = DATA.filter(q => { const r = Store.get(q.id); return r === '×' || r === '△'; })
      .sort((a, b) => {
        const w = r => (Store.get(r.id) === '×' ? 0 : 1);
        return (w(a) - w(b)) || (a.level - b.level) || a.id.localeCompare(b.id);
      });
    const sec = $('#weak');
    if (!weak.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#weak-note').textContent = '上ほど優先。★（基礎）で×は最優先、★★★だけ×なら基礎はOKで午後演習の段階。';
    $('#weak-list').innerHTML = weak.map(q => {
      const r = Store.get(q.id);
      return `<div class="weak-item">
        <span class="res ${r === '×' ? 'ng' : 'mid'}">${r}</span>
        <span class="lv">${'★'.repeat(q.level)}</span>
        <a href="#q-${q.id}" class="weak-sub">${esc(q.id)}　${esc(q.sub)}</a>
      </div>`;
    }).join('');
  }

  // ---- フィルタ・一覧 ------------------------------------------------
  function filters() {
    return [{ v: 'all', label: `すべて` }, ...PARTS.map(p => ({ v: p.v, label: p.name })),
      { v: 'todo', label: '未解答' }, { v: 'review', label: '要復習（×・△）' }];
  }
  function matches(q) {
    if (filter === 'all') return true;
    if (filter === 'todo') return !Store.get(q.id);
    if (filter === 'review') { const r = Store.get(q.id); return r === '×' || r === '△'; }
    return q.part === filter;
  }
  function renderFilter() {
    $('#filter').innerHTML = filters().map(f =>
      `<button data-v="${f.v}" class="${f.v === filter ? 'active' : ''}">${esc(f.label)}</button>`).join('');
  }

  function renderList() {
    const list = DATA.filter(matches);
    $('#list').innerHTML = list.length ? list.map(cardHtml).join('')
      : `<p class="muted">該当する問題がありません。</p>`;
  }
  function cardHtml(q) {
    const r = Store.get(q.id);
    const g = (v, cls) => `<button class="grade-btn ${cls} ${r === v ? 'on' : ''}" data-id="${q.id}" data-g="${v}">${v}</button>`;
    return `<div class="diag-card" id="q-${esc(q.id)}">
      <div class="diag-head">
        <span class="diag-id">${esc(q.id)}</span>
        <span class="diag-lv" title="難易度">${'★'.repeat(q.level)}</span>
        <span class="diag-sub">${esc(q.sub)}</span>
        ${r ? `<span class="diag-res ${r === '〇' ? 'ok' : r === '△' ? 'mid' : 'ng'}">${r}</span>` : ''}
      </div>
      <div class="diag-q">${q.q}</div>
      <details class="diag-ans"><summary>解答・解説を見る</summary><div class="diag-a">${q.a}</div></details>
      <div class="diag-grade">
        <span class="grade-label">自己採点：</span>
        ${g('〇', 'ok')}${g('△', 'mid')}${g('×', 'ng')}
      </div>
    </div>`;
  }

  // ---- イベント ------------------------------------------------------
  $('#filter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filter = b.dataset.v; renderFilter(); renderList();
  });
  $('#list').addEventListener('click', e => {
    const b = e.target.closest('.grade-btn'); if (!b) return;
    const id = b.dataset.id, g = b.dataset.g;
    Store.set(id, Store.get(id) === g ? null : g); // 同じボタン再タップで解除
    renderList(); renderSummary(); renderWeak();
  });
  $('#reset').addEventListener('click', () => {
    if (confirm('診断結果をすべて消去しますか？')) { Store.clear(); renderFilter(); renderList(); renderSummary(); renderWeak(); }
  });

  // ---- 起動 ----------------------------------------------------------
  renderFilter(); renderSummary(); renderList(); renderWeak();
})();
