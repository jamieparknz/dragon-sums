// Question generator shared by server (and served to client for solo mode)
(function (root) {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  // level 1..10; year 1..6 sets base level
  function gen(skill, level) {
    level = Math.max(1, Math.min(10, level));
    if (skill === 'mixed') skill = ['addition', 'subtraction', 'times', 'division'][r(0, 3)];
    let q, a;
    if (skill === 'addition') {
      const m = [5, 10, 10, 20, 20, 50, 100, 100, 500, 1000][level - 1];
      const x = r(0, m), y = r(0, m); q = `${x} + ${y}`; a = x + y;
    } else if (skill === 'subtraction') {
      const m = [5, 10, 10, 20, 20, 50, 100, 100, 500, 1000][level - 1];
      const x = r(0, m), y = r(0, x); q = `${x} − ${y}`; a = x - y;
    } else if (skill === 'times') {
      const tables = [[2, 10], [2, 5, 10], [2, 3, 5, 10], [2, 3, 4, 5, 10], [2, 3, 4, 5, 6, 10], [2, 3, 4, 5, 6, 7, 8, 9, 10], [3, 4, 6, 7, 8, 9], [6, 7, 8, 9, 11, 12], [6, 7, 8, 9, 11, 12], [7, 8, 9, 11, 12]][level - 1];
      const x = tables[r(0, tables.length - 1)], y = r(1, level > 7 ? 12 : 10); q = `${x} × ${y}`; a = x * y;
    } else if (skill === 'division') {
      const x = r(2, level > 5 ? 12 : Math.min(10, level + 3)), y = r(1, 10); q = `${x * y} ÷ ${x}`; a = y;
    } else { // fractions basics: fraction of a quantity
      const dens = level <= 3 ? [2, 4] : level <= 6 ? [2, 3, 4, 5, 10] : [3, 4, 5, 6, 8, 10];
      const d = dens[r(0, dens.length - 1)], n = level <= 3 ? 1 : r(1, d - 1), k = r(1, level <= 3 ? 5 : 10);
      q = `${n}/${d} of ${d * k}`; a = n * k;
    }
    // 4 multiple-choice options
    const opts = new Set([a]);
    while (opts.size < 4) { const o = a + r(-5, 5) * (a > 50 ? r(1, 3) : 1); if (o >= 0 && o !== a) opts.add(o); }
    return { q, a, options: [...opts].sort(() => Math.random() - 0.5) };
  }
  const yearLevel = y => [1, 2, 4, 5, 7, 8][Math.max(0, Math.min(5, y - 1))];
  const api = { gen, yearLevel };
  if (typeof module !== 'undefined') module.exports = api; else root.Q = api;
})(this);
