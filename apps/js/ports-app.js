// ポート番号（データは flashcards/ports.js の PORTS / NUMBERS）
(() => {
  const $ = id => document.getElementById(id);
  const chTitle = no => BOOK.chapters.find(c => c.no === no).title;
  const kind = p => (p <= 1023 ? 'ウェルノウン' : '登録済み');
  const KEYS = ['A', 'B', 'C', 'D'];

  // ---- タブ ------------------------------------------------------------

  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('active', x === b));
    for (const t of ['list', 'numbers', 'quiz']) $(`tab-${t}`).hidden = t !== b.dataset.tab;
    if (b.dataset.tab === 'quiz' && !current) nextQuestion();
  }));

  // ---- 一覧 ------------------------------------------------------------

  const cats = ['すべて', ...new Set(PORTS.map(p => p.cat))];
  let cat = 'すべて';

  function renderCats() {
    $('cats').innerHTML = cats.map(c => {
      const n = c === 'すべて' ? PORTS.length : PORTS.filter(p => p.cat === c).length;
      return `<button data-cat="${c}" class="${c === cat ? 'active' : ''}">${c}<small>${n}</small></button>`;
    }).join('');
  }

  function renderList() {
    const q = $('search').value.trim().toLowerCase();
    const hide = $('hide').checked;
    const list = PORTS.filter(p => cat === 'すべて' || p.cat === cat)
      .filter(p => !q || `${p.port} ${p.name} ${p.desc} ${p.proto}`.toLowerCase().includes(q))
      .sort((a, b) => a.port - b.port);
    const portCell = p => (hide
      ? `<button class="reveal-cell" data-html="${encodeURIComponent(String(p.port))}">？</button>`
      : String(p.port));
    $('ports').innerHTML = `
      <thead><tr><th>ポート</th><th>TCP/UDP</th><th>サービス</th><th>用途</th><th>章</th></tr></thead>
      <tbody>${list.map(p => `
        <tr>
          <td class="port-no">${portCell(p)}<small>${kind(p.port)}</small></td>
          <td>${p.proto}</td>
          <td><b>${escapeHtml(p.name)}</b></td>
          <td>${escapeHtml(p.desc)}</td>
          <td class="muted" title="${escapeHtml(chTitle(p.ch))}">${p.ch}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="muted">該当なし</td></tr>'}
      </tbody>`;
  }

  $('cats').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    cat = b.dataset.cat;
    renderCats();
    renderList();
  });
  $('search').addEventListener('input', renderList);
  $('hide').addEventListener('change', renderList);
  $('ports').addEventListener('click', e => {
    const b = e.target.closest('.reveal-cell');
    if (b) b.outerHTML = decodeURIComponent(b.dataset.html);
  });

  // ---- その他の番号 ----------------------------------------------------

  $('numbers').innerHTML = NUMBERS.map(g => `
    <article class="cmp">
      <h3>${escapeHtml(g.group)}</h3>
      <p class="muted">${escapeHtml(g.note)}</p>
      <div class="cmp-scroll">
        <table class="tbl cmp-tbl">
          <thead><tr>${g.head.map(h => `<th>${escapeHtml(h)}</th>`).join('')}<th>章</th></tr></thead>
          <tbody>${g.items.map(([num, name, note, ch]) => `
            <tr><td class="port-no">${escapeHtml(num)}</td><td><b>${escapeHtml(name)}</b></td><td>${escapeHtml(note)}</td><td class="muted">${ch}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </article>`).join('');

  // ---- 暗記テスト ------------------------------------------------------

  const protoItems = NUMBERS.find(g => g.group === 'IPプロトコル番号').items;
  const score = { ok: 0, total: 0 };
  let current = null;

  function pickOthers(pool, answer, n = 3) {
    return shuffled([...new Set(pool.filter(v => v !== answer))]).slice(0, n);
  }

  function makeQuestion() {
    const useProto = $('q-proto').checked && Math.random() < 0.3;
    if (useProto) {
      const [num, name, note] = protoItems[Math.floor(Math.random() * protoItems.length)];
      return {
        text: `${name} の IP プロトコル番号は？`,
        answer: num,
        choices: [num, ...pickOthers(protoItems.map(i => i[0]), num)],
        explain: `${name} は IP プロトコル番号 ${num}。${note || ''}（ポート番号ではない）`,
      };
    }
    const p = PORTS[Math.floor(Math.random() * PORTS.length)];
    const explain = `${p.name}：${p.proto} ${p.port}。${p.desc}`;
    if (Math.random() < 0.5) {
      return {
        text: `${p.name} のポート番号は？`,
        answer: String(p.port),
        choices: [String(p.port), ...pickOthers(PORTS.map(x => String(x.port)), String(p.port))],
        explain,
      };
    }
    return {
      text: `${p.proto} ${p.port} 番を使うのは？`,
      answer: p.name,
      choices: [p.name, ...pickOthers(PORTS.map(x => x.name), p.name)],
      explain,
    };
  }

  function nextQuestion() {
    current = makeQuestion();
    current.answered = false;
    $('q-text').textContent = current.text;
    $('q-choices').innerHTML = shuffled(current.choices).map((c, i) => `
      <button class="choice" data-v="${escapeHtml(c)}"><span class="key">${KEYS[i]}</span><span>${escapeHtml(c)}</span></button>`).join('');
    $('q-explain').hidden = true;
    $('q-next').hidden = true;
    renderScore();
  }

  function renderScore() {
    const rate = score.total ? Math.round((score.ok / score.total) * 100) : 0;
    $('q-score').textContent = `正解 ${score.ok} / ${score.total}（${rate}%）`;
  }

  function answer(btn) {
    if (!current || current.answered) return;
    current.answered = true;
    const correct = btn.dataset.v === current.answer;
    score.total++;
    if (correct) score.ok++;
    $('q-choices').querySelectorAll('.choice').forEach(b => {
      b.disabled = true;
      if (b.dataset.v === current.answer) b.classList.add('correct');
    });
    if (!correct) btn.classList.add('wrong');
    $('q-explain').innerHTML = `<span class="verdict ${correct ? 'ok' : 'ng'}">${correct ? '正解！' : '不正解'}</span>　${escapeHtml(current.explain)}`;
    $('q-explain').hidden = false;
    $('q-next').hidden = false;
    $('q-next').focus({ preventScroll: true });
    renderScore();
  }

  $('q-choices').addEventListener('click', e => {
    const b = e.target.closest('.choice');
    if (b) answer(b);
  });
  $('q-next').addEventListener('click', nextQuestion);
  document.addEventListener('keydown', e => {
    if ($('tab-quiz').hidden || !current) return;
    const i = KEYS.indexOf(e.key.toUpperCase());
    if (!current.answered && i >= 0) answer($('q-choices').children[i]);
    else if (current.answered && e.key === 'Enter') { e.preventDefault(); nextQuestion(); }
  });

  renderCats();
  renderList();
})();
