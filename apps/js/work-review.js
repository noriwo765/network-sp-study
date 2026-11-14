// ワーク演習：苦手ジャンル復習の対象設問と克服の判定。純粋関数（画面と検証ツールで共用）。
//
// - 対象：演習（server/history.json）での最新の採点が満点でない設問（部分正解・不正解・満点未満の正解）。
//   復習で一度でも採点した設問は、あとで演習の点が上がっても対象に残す（克服の数を減らさないため）。
// - 克服：復習（server/review.json）での最新の採点が満点（正解かつ満点）。
// - 復習の記録は演習の履歴とは別に持つ。演習の得点率・想定合格率・_学習状況.md には混ぜない。
(function (root) {
  // 採点結果が満点か。score が無い古い採点は判定（正解）だけで見る
  function isFull(r) {
    if (!r || r.verdict !== '正解') return false;
    if (typeof r.score !== 'number') return true;
    const max = typeof r.scoreMax === 'number' && r.scoreMax > 0 ? r.scoreMax : 10;
    return r.score >= max - 1e-9;
  }
  const lastResult = attempts => {
    const a = (attempts || []).filter(x => x && x.result);
    return a.length ? a[a.length - 1] : null;
  };

  // problems: WORK_PROBLEMS（並び順はそのまま使う）、genreMap: WORK_GENRE
  // mainAttempts(pid, qid) / reviewAttempts(pid, qid)：その設問の採点の配列（古い順）
  // 戻り値：対象設問の配列 { pid, qid, genre, main, review, reviewCount, cleared }
  //   main / review … 最新の採点 { at, answer, result }（無ければ null）
  function reviewTargets(problems, genreMap, mainAttempts, reviewAttempts) {
    const out = [];
    for (const p of problems || []) for (const q of p.questions || []) {
      const genre = ((genreMap || {})[p.id] || {})[q.id];
      if (!genre) continue;
      const main = lastResult(mainAttempts(p.id, q.id));
      const ra = (reviewAttempts(p.id, q.id) || []).filter(x => x && x.result);
      const review = lastResult(ra);
      if (!ra.length && !(main && !isFull(main.result))) continue; // 未採点・満点の設問は対象外
      out.push({ pid: p.id, qid: q.id, genre, main, review, reviewCount: ra.length, cleared: !!(review && isFull(review.result)) });
    }
    return out;
  }

  // 分野ごとにまとめる（並びは genres の順）。{ genre, items, total, cleared }
  function byGenre(targets, genres) {
    const m = new Map((genres || []).map(g => [g, { genre: g, items: [], total: 0, cleared: 0 }]));
    for (const t of targets) {
      if (!m.has(t.genre)) m.set(t.genre, { genre: t.genre, items: [], total: 0, cleared: 0 });
      const g = m.get(t.genre);
      g.items.push(t); g.total++; if (t.cleared) g.cleared++;
    }
    return [...m.values()].filter(g => g.total);
  }

  // 問題ごとに分ける（1回の復習で開く単位）。items の並び（＝問題の並び）を保つ
  function groupByProblem(items) {
    const groups = [];
    for (const t of items) {
      let g = groups.find(x => x.pid === t.pid);
      if (!g) groups.push(g = { pid: t.pid, qids: [] });
      g.qids.push(t.qid);
    }
    return groups;
  }

  root.WorkReview = { isFull, reviewTargets, byGenre, groupByProblem };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WorkReview;
})(typeof window !== 'undefined' ? window : globalThis);
