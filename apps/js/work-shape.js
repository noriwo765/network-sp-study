// ワーク演習：解答例（answer）の書式から解答欄の構造を復元する純粋関数群。
// work-app.js（画面）と apps/tools/work-check.js（検証ツール）の両方から同じコードを使う。
//
// 解答例は「ラベル：値　ラベル：値」(全角コロン＋全角スペース) か「・項目　・項目」で
// 統一されているので、そこから解答欄の構造を復元する（答えは出さず、欄とラベルだけ作る）。
//   labeled … a/b/c・認証/認可・大阪本社/東京支社・機器①② などラベル付きの複数ボックス
//   bullets … 「四つ答えよ」などの ・箇条書き（番号付きの複数ボックス）
//   single  … 1つの記述欄
(function (root) {
  const splitFW = s => String(s || '').split(/　+/).map(x => x.trim()).filter(Boolean);
  const isNote = s => /^[（(].*[）)]$/.test(s); // 「（順不同）」などの注記（解答欄ではない）
  const contentSegs = s => splitFW(s).filter(x => !isNote(x));
  const ENUM = /^([①-⑳])\s*(.*)$/; // ①〜⑳ で始まる連番項目か

  // 「ラベル：値」の並び。さらに「ラベル：①項目　②項目　③項目」のように丸数字で
  // 連番項目がぶら下がる場合は、ラベル①/ラベル②/… と1項目ずつの欄に分解する。
  function parseLabeled(str) {
    const segs = contentSegs(str);
    if (!segs.length) return null;
    const out = [];
    let group = null;
    for (const seg of segs) {
      const i = seg.indexOf('：');
      if (i > 0 && i <= 20 && !/[。、]/.test(seg.slice(0, i))) {
        const label = seg.slice(0, i).trim(), rest = seg.slice(i + 1).trim();
        const em = ENUM.exec(rest);
        if (em) out.push({ label: label + em[1], value: em[2].trim() }); // ラベル＋①
        else out.push({ label, value: rest });
        group = label;
      } else {
        const em = ENUM.exec(seg); // 直前ラベルに続く ②③… の連番項目
        if (em && group) out.push({ label: group + em[1], value: em[2].trim() });
        else return null; // 解釈できない → ラベル付き扱いにしない
      }
    }
    return out.length ? out : null;
  }

  // 設問文が「複数答えさせている」か（二つ/四つ/それぞれ/全て答えよ 等）。
  // これに当てはまらない箇条書き解答例は「別解の列挙」とみなし、1欄にする。
  function asksMultiple(q) {
    const t = q.prompt || '';
    return /([一二三四五六七八九十]|[0-9０-９]+)\s*つ/.test(t) || /それぞれ/.test(t) || /(全て|すべて).{0,6}(答え|挙げ|示せ|記)/.test(t);
  }

  function answerShape(q) {
    const labeled = parseLabeled(q.answer);
    if (labeled) return { mode: 'labeled', fields: labeled.map(b => b.label) };
    const segs = contentSegs(q.answer);
    // グループラベル無しの連番リスト（①X　②Y　③Z…）→ 丸数字ごとの欄
    // （「①，②，⑤，⑥」のようにスペース区切りでない＝1セグメントのものは選択解答なので対象外）
    if (segs.length >= 2 && segs.every(s => ENUM.test(s))) return { mode: 'labeled', fields: segs.map(s => ENUM.exec(s)[1]) };
    const bullets = segs.filter(s => s.startsWith('・'));
    if (bullets.length >= 2 && bullets.length === segs.length && asksMultiple(q)) return { mode: 'bullets', fields: bullets.map((_, i) => `${i + 1}`) };
    return { mode: 'single', fields: [] };
  }

  const labeledValue = (savedStr, label) => { const f = (parseLabeled(savedStr) || []).find(b => b.label === label); return f ? f.value : ''; };
  const bulletValues = savedStr => splitFW(savedStr).map(s => s.replace(/^・/, '').trim());
  const limitNum = q => { const m = /(\d+)/.exec(q.charLimit || ''); return m ? Number(m[1]) : 0; };

  root.WorkShape = { splitFW, isNote, contentSegs, ENUM, parseLabeled, asksMultiple, answerShape, labeledValue, bulletValues, limitNum };
})(typeof window !== 'undefined' ? window : globalThis);
