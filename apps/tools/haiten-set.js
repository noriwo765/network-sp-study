// 配点予想を server/haiten.json に一括で書き込む（node apps/tools/haiten-set.js <配点.json> [--dry-run]）
//
// 配点画像などから読み取った値を、画面で1つずつ入力せずに登録するためのツール。
// 入力ファイルの形（問題id → 設問id → 点数 または {欄ラベル: 点数}）：
//   {
//     "r5_pm1_q3": {
//       "設問1":    { "a": 2, "b": 2, "c": 2, "d": 2, "e": 2, "f": 2, "g": 2, "h": 2 },
//       "設問3(1)": 4,
//       "設問3(3)": { "機器①": 2, "機器②": 2, "機器③": 2, "作業ミス": 4 }
//     }
//   }
// - 欄の単位は解答欄と同じ（node apps/tools/work-check.js --fields <問題id> で確認できる）。
//   1欄の設問は数値、複数欄の設問は {欄ラベル: 点数}。合わない場合は書き込まずにエラーにする。
// - 指定した設問だけを置き換え、それ以外の配点はそのまま残す。
// - rev（最終編集時刻）を進めるので、次にブラウザでワーク演習を開く（再読み込みする）と
//   ファイル側の値が採用される。書き込んだ後は、開いているワーク演習のページを必ず再読み込みすること。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const input = args.find(a => !a.startsWith('--'));
if (!input) { console.log('使い方: node apps/tools/haiten-set.js <配点.json> [--dry-run]'); process.exit(2); }

const ctx = { window: { WORK_PROBLEMS: [] } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps', 'js', 'work-shape.js'), 'utf8'), ctx);
const WORK = path.join(ROOT, 'apps', 'work');
for (const f of fs.readdirSync(WORK).filter(f => /^r\d+_pm\d_q\d+\.js$/.test(f))) vm.runInContext(fs.readFileSync(path.join(WORK, f), 'utf8'), ctx, { filename: f });
const byId = new Map(ctx.window.WORK_PROBLEMS.map(p => [p.id, p]));
const { answerShape } = ctx.window.WorkShape;

const spec = JSON.parse(fs.readFileSync(input, 'utf8'));
const updates = {};
let errors = 0;
const ng = msg => { errors++; console.log('NG', msg); };
for (const [pid, qs] of Object.entries(spec)) {
  const p = byId.get(pid);
  if (!p) { ng(`存在しない問題 ${pid}`); continue; }
  for (const [qid, v] of Object.entries(qs)) {
    const q = p.questions.find(x => x.id === qid);
    if (!q) { ng(`${pid}: 存在しない設問 ${qid}（設問: ${p.questions.map(x => x.id).join(' ')}）`); continue; }
    const s = answerShape(q);
    if (s.mode === 'single') {
      if (typeof v !== 'number' || !(v > 0)) { ng(`${pid} ${qid}: 1欄の設問なので正の数値で指定する（指定値 ${JSON.stringify(v)}）`); continue; }
    } else {
      if (!v || typeof v !== 'object') { ng(`${pid} ${qid}: 複数欄（${s.fields.join('/')}）なので {欄ラベル: 点数} で指定する`); continue; }
      const bad = Object.keys(v).filter(l => !s.fields.includes(l));
      if (bad.length) { ng(`${pid} ${qid}: 存在しない欄 ${bad.join(',')}（欄: ${s.fields.join('/')}）`); continue; }
      if (Object.values(v).some(n => typeof n !== 'number' || !(n > 0))) { ng(`${pid} ${qid}: 点数は正の数値で指定する`); continue; }
      const miss = s.fields.filter(l => !(l in v));
      if (miss.length) console.log(`注意 ${pid} ${qid}: 未指定の欄 ${miss.join(',')}（その欄は配点なし扱い）`);
    }
    updates[`${pid}:${qid}`] = v;
  }
}
if (errors) { console.log(`\nNG ${errors}件のため書き込みませんでした。`); process.exit(1); }

const file = path.join(ROOT, 'server', 'haiten.json');
let cur = { app: 'nespe-work', rev: 0, haiten: {} };
try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* 無ければ新規 */ }
const next = { app: cur.app || 'nespe-work', rev: Math.max(Date.now(), (Number(cur.rev) || 0) + 1), haiten: { ...(cur.haiten || {}), ...updates } };

// 確認用：問題ごとの合計
const total = v => typeof v === 'number' ? v : Object.values(v).reduce((a, n) => a + n, 0);
const sums = {};
for (const [k, v] of Object.entries(updates)) { const pid = k.split(':')[0]; sums[pid] = (sums[pid] || 0) + total(v); }
for (const [k, v] of Object.entries(updates)) console.log(`${k}  ${typeof v === 'number' ? v + '点' : Object.entries(v).map(([l, n]) => `${l}=${n}`).join(' ') + `（計${total(v)}点）`}`);
for (const [pid, s] of Object.entries(sums)) {
  const all = byId.get(pid).questions.reduce((a, q) => a + (next.haiten[`${pid}:${q.id}`] ? total(next.haiten[`${pid}:${q.id}`]) : 0), 0);
  console.log(`→ ${pid}: 今回 ${s}点 ／ この問題の配点合計 ${all}点`);
}
if (dry) { console.log('\n--dry-run のため書き込みませんでした。'); process.exit(0); }
fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
console.log(`\nserver/haiten.json に ${Object.keys(updates).length}設問ぶん書き込みました。ワーク演習のページを再読み込みすると反映されます。`);
