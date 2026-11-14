// 過去問ベースの教材の検査（node apps/tools/past-check.js [問題id]）
//
// 公開するファイル（アニメ・一問一答）に IPA の問題文・解答例の写しが混ざっていないかを調べる。
// 問題データ（apps/work/r*_pm*_q*.js）の本文・設問・解答例・講評と、20字以上連続して同じ部分があれば NG。
// 問題データは Git 管理外なので、この検査はローカルでだけ動く。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../..');
const MIN = 20;
// プロトコルの正式名など、問題文と一致しても写しではない語句
const ALLOW = ['PMTUDPathMTUDiscovery', 'ESIEthernetSegmentIdentifier', 'SSMSource-SpecificMulticast'];
const only = process.argv[2];
let errors = 0;

const box = { window: {} };
vm.createContext(box);
const workDir = path.join(ROOT, 'apps/work');
for (const f of fs.readdirSync(workDir).filter(f => /^r\d_pm\d_q\d\.js$/.test(f))) {
  vm.runInContext(fs.readFileSync(path.join(workDir, f), 'utf8'), box);
}

// 表記ゆれを除いて比べる（空白・句読点・括弧の全角半角で検査をすり抜けないように）
const norm = s => s.normalize('NFKC').replace(/[\s,.、。，．・:;：；()（）「」『』［］\[\]]/g, '');
const texts = v => {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(texts);
  if (v && typeof v === 'object') return Object.values(v).flatMap(texts);
  return [];
};

function longestCommon(text, grams) {
  const a = ALLOW.reduce((t, w) => t.split(w).join(' '), text);
  let best = '';
  for (let i = 0; i + MIN <= a.length; i++) {
    if (!grams.has(a.slice(i, i + MIN))) continue;
    let n = MIN;
    while (i + n < a.length && grams.has(a.slice(i + n - MIN + 1, i + n + 1))) n++;
    if (n > best.length) best = a.slice(i, i + n);
  }
  return best;
}

const files = id => [`flashcards/qa_${id}.js`, `apps/js/scenarios/${id}.js`];
for (const p of box.window.WORK_PROBLEMS) {
  if (only && p.id !== only) continue;
  const source = norm(texts([p.overview, p.body, p.questions, p.commentary]).join('\n'));
  const grams = new Set();
  for (let i = 0; i + MIN <= source.length; i++) grams.add(source.slice(i, i + MIN));
  for (const f of files(p.id)) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) { if (only) { errors++; console.log('NG なし', f); } continue; }
    const hit = longestCommon(norm(fs.readFileSync(full, 'utf8')), grams);
    if (hit) { errors++; console.log(`NG 写しの疑い ${f}: ${hit}`); }
  }
}
// 苦手カード・本番前の定番の答え・単語集・本番前チェックのページは全問題と比べる（node apps/tools/past-check.js で全件検査するとき）
if (!only) {
  const source = norm(box.window.WORK_PROBLEMS.flatMap(p => texts([p.overview, p.body, p.questions, p.commentary])).join('\n'));
  const grams = new Set();
  for (let i = 0; i + MIN <= source.length; i++) grams.add(source.slice(i, i + MIN));
  for (const f of ['flashcards/qa_weak.js', 'flashcards/qa_final.js', 'flashcards/terms.js', 'apps/final-check.html', 'apps/nigate.html']) {
    const hit = longestCommon(norm(fs.readFileSync(path.join(ROOT, f), 'utf8')), grams);
    if (hit) { errors++; console.log(`NG 写しの疑い ${f}: ${hit}`); }
  }
}
console.log(errors ? `NG ${errors} 件` : 'OK（問題文との一致なし）');
process.exit(errors ? 1 : 0);
