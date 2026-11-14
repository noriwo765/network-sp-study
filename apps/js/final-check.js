// 本番前チェック：過去問の解説を確認したかのチェック（この端末の localStorage だけに保存）
(function () {
  'use strict';
  const KEY = 'nespe-final-check-v1';
  const boxes = Array.from(document.querySelectorAll('#review input[type=checkbox]'));
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { state = {}; }
  boxes.forEach(b => { if (state[b.id]) b.checked = true; });

  function update() {
    const done = boxes.filter(b => b.checked).length;
    document.getElementById('fc-count').textContent = `${done} / ${boxes.length}`;
    document.getElementById('fc-fill').style.width = (boxes.length ? done / boxes.length * 100 : 0) + '%';
  }
  function save() {
    const s = {};
    boxes.forEach(b => { if (b.checked) s[b.id] = true; });
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
  }
  boxes.forEach(b => b.addEventListener('change', () => { save(); update(); }));
  document.getElementById('fc-reset').addEventListener('click', () => {
    boxes.forEach(b => { b.checked = false; });
    save(); update();
  });
  update();
})();
