// Original Dragon Sums clans (from v2)
(function (root) {
  const CLANS = {
    tidecrest: { name: 'Tidecrest', home: 'the Coral Shallows', body: '#14b8c4', belly: '#a5f3fc', wing: '#0e7490', accent: '#fef08a', power: 'addition', powerName: 'Wave Gather (addition)' },
    frostmere: { name: 'Frostmere', home: 'the Glimmer Glaciers', body: '#60c3f5', belly: '#f0f9ff', wing: '#2563eb', accent: '#e0f2fe', power: 'subtraction', powerName: 'Ice Chip (subtraction)' },
    emberhorn: { name: 'Emberhorn', home: 'the Cinder Peaks', body: '#ef4444', belly: '#fde68a', wing: '#b91c1c', accent: '#fb923c', power: 'times', powerName: 'Flame Multiply (times tables)' },
    mossback: { name: 'Mossback', home: 'the Whispering Ferns', body: '#22c55e', belly: '#d9f99d', wing: '#15803d', accent: '#a3e635', power: 'division', powerName: 'Seed Share (division)' },
    stormquill: { name: 'Stormquill', home: 'the Thunder Cliffs', body: '#8b5cf6', belly: '#ddd6fe', wing: '#5b21b6', accent: '#facc15', power: 'mixed', powerName: 'Lightning Mix (mixed)' },
    dawnpetal: { name: 'Dawnpetal', home: 'the Honey Meadows', body: '#f59e0b', belly: '#fef3c7', wing: '#ea580c', accent: '#f9a8d4', power: 'fractions', powerName: 'Sunslice (fractions)' },
  };
  if (typeof module !== 'undefined') module.exports = { CLANS }; else root.CLANS = CLANS;
})(this);
