// 共通ユーティリティとドリルの画面組み立て

const IP = {
  toInt(s) {
    const parts = s.trim().split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const x of parts) {
      if (!/^\d{1,3}$/.test(x) || +x > 255) return null;
      n = n * 256 + +x;
    }
    return n >>> 0;
  },
  toStr(n) {
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  },
  // 0xFFFFFFFF << 32 は JS ではシフト量 0 扱いになるため /0 を別扱い
  mask(prefix) {
    return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
  },
  network(ip, prefix) {
    return (ip & IP.mask(prefix)) >>> 0;
  },
  broadcast(ip, prefix) {
    return (IP.network(ip, prefix) | (~IP.mask(prefix) >>> 0)) >>> 0;
  },
};

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bin8(v) {
  const s = v.toString(2).padStart(8, '0');
  return s.slice(0, 4) + ' ' + s.slice(4);
}

function toHalfWidth(s) {
  return s.replace(/[０-９．／Ａ-Ｚａ-ｚ，]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

const NORMALIZE = {
  num: s => toHalfWidth(s).replace(/[^0-9]/g, ''),
  ip: s => toHalfWidth(s).replace(/\s/g, ''),
  text: s => toHalfWidth(s).replace(/\s/g, '').toLowerCase(),
};

// ランダムなプライベートアドレスの先頭2オクテット
function randomPrivatePrefix() {
  return pick([
    () => [10, rand(0, 255)],
    () => [172, rand(16, 31)],
    () => [192, 168],
  ])();
}

/*
 * ドリル定義の形:
 * {
 *   id, title, desc,
 *   newProblem() => {
 *     question: HTML文字列,
 *     fields: [{ label, answer, type: 'num'|'ip'|'text', placeholder? }],
 *     explain: HTML文字列,
 *   }
 * }
 */
function mountDrill(drill, panel) {
  const score = { ok: 0, total: 0 };
  let problem = null;
  let judged = false;

  panel.innerHTML = `
    <p class="desc">${drill.desc}</p>
    <div class="card">
      <div class="score"></div>
      <div class="question"></div>
      <form class="fields" autocomplete="off"></form>
      <div class="actions">
        <button type="button" class="primary judge">判定する</button>
        <button type="button" class="next">次の問題</button>
      </div>
      <div class="result" hidden></div>
      <div class="explain" hidden></div>
    </div>`;

  const $ = sel => panel.querySelector(sel);
  const form = $('.fields');

  function renderScore() {
    const rate = score.total ? Math.round((score.ok / score.total) * 100) : 0;
    $('.score').textContent = `正解 ${score.ok} / ${score.total}（${rate}%）`;
  }

  function next() {
    problem = drill.newProblem();
    judged = false;
    $('.question').innerHTML = problem.question;
    form.innerHTML = problem.fields.map((f, i) => `
      <label class="field">
        <span>${f.label}</span>
        <input name="f${i}" inputmode="${f.type === 'text' ? 'text' : 'decimal'}" placeholder="${f.placeholder || ''}">
        <span class="mark"></span>
      </label>`).join('');
    $('.result').hidden = true;
    $('.explain').hidden = true;
    $('.judge').disabled = false;
    form.querySelector('input').focus();
  }

  function judge() {
    if (judged) return;
    judged = true;
    let allOk = true;
    problem.fields.forEach((f, i) => {
      const input = form.elements[`f${i}`];
      const norm = NORMALIZE[f.type];
      const ok = norm(input.value) === norm(String(f.answer));
      if (!ok) allOk = false;
      const label = input.closest('.field');
      label.classList.toggle('ok', ok);
      label.classList.toggle('ng', !ok);
      label.querySelector('.mark').textContent = ok ? '〇' : `× 正解: ${f.answer}`;
    });
    score.total++;
    if (allOk) score.ok++;
    renderScore();
    const result = $('.result');
    result.hidden = false;
    result.className = 'result ' + (allOk ? 'ok' : 'ng');
    result.textContent = allOk ? '正解！' : '不正解';
    $('.explain').hidden = false;
    $('.explain').innerHTML = `<h4>解説</h4>${problem.explain}`;
    $('.judge').disabled = true;
    $('.next').focus();
  }

  form.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      judged ? next() : judge();
    }
  });
  $('.judge').addEventListener('click', judge);
  $('.next').addEventListener('click', next);

  renderScore();
  next();
}
