// Dragon Sums v5 — classic-JRPG inspired presentation layer (original art, code-drawn).
// Windows, pointing-hand cursor, typewriter text, dialog with portraits, title screen, main menu and the crystal battle.
export const X = {}; // context injected by app.js: { G, SHEETS, CLANS, sfx, socket, snapshot(), setBattleCam(), endBattleCam(), onResult() }
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SLOW = new URLSearchParams(location.search).has('test') ? 3 : 1; // test mode: slow-mo so headless screenshots can catch each beat
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bsleep = ms => sleep(ms * SLOW);
const ease = { outBack: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2), inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, out: t => 1 - Math.pow(1 - t, 3) };
export const settings = Object.assign({ textSpeed: 'normal', theme: 'blue' }, (() => { try { return JSON.parse(localStorage.getItem('ds_settings') || '{}'); } catch { return {}; } })());
const saveSettings = () => { try { localStorage.setItem('ds_settings', JSON.stringify(settings)); } catch { } applyTheme(); };
export function applyTheme() { document.body.dataset.theme = settings.theme; }

// ---------- original pixel pointing hand (white glove) ----------
const HAND = [
  '.....oooo.........',
  '....owwwwo........',
  '...owwwwwwooooooo.',
  '..owwwwwwwwwwwwwwo',
  '.owwwwwwwwoooooooo',
  'owwwwwwwwwwwwwo...',
  'owwwwwwwwwoooo....',
  'owwwwwwwwwwwwo....',
  'owgwwwwwwooooo....',
  'owggwwwwwwwwo.....',
  '.oggggwwwoooo.....',
  '..ooooooo.........'];
export const HAND_URL = (() => { const c = document.createElement('canvas'); c.width = HAND[0].length; c.height = HAND.length; const g = c.getContext('2d');
  const col = { o: '#10142a', w: '#ffffff', g: '#a9b6d6' }; HAND.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); } })); return c.toDataURL(); })();

// ---------- typewriter with soft blip ----------
const SPEED = { slow: 45, normal: 26, fast: 10 };
export function typeText(el, text, { speed } = {}) {
  const tok = (el._tok = (el._tok || 0) + 1); el.textContent = ''; el.classList.add('typing');
  const ms = speed ?? SPEED[settings.textSpeed]; let skip = false; const sk = () => skip = true; el.addEventListener('pointerdown', sk, { once: true });
  const kd = e => { if (['Enter', 'Space', 'KeyZ', 'KeyE'].includes(e.code) && el.closest('#dialog')) { skip = true; e.stopImmediatePropagation(); } }; addEventListener('keydown', kd, true);
  return new Promise(async res => { for (let i = 1; i <= text.length; i++) { if (el._tok !== tok) break;
      if (skip) { el.textContent = text; break; } el.textContent = text.slice(0, i); if (i % 2 && text[i - 1] !== ' ') X.sfx?.('blip'); await sleep(ms); }
    removeEventListener('keydown', kd, true); el.classList.remove('typing'); res(el._tok === tok); });
}

// ---------- menus: list of .mi buttons with a bobbing hand, keyboard + pointer ----------
const stack = [];
export function menu(el, items, onPick, { cols = 1, onCancel, cls = '' } = {}) {
  el.innerHTML = `<img class="hand" src="${HAND_URL}" alt="">` + `<div class="mlist ${cls}" style="grid-template-columns:repeat(${cols},1fr)">` +
    items.map((it, i) => `<button class="mi" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${esc(it.label)}</button>`).join('') + '</div>';
  const m = { el, items, onPick, onCancel, cols, sel: Math.max(0, items.findIndex(i => !i.disabled)), btns: [...el.querySelectorAll('.mi')], hand: el.querySelector('.hand') };
  m.place = () => { const b = m.btns[m.sel]; if (!b) return; const r = b.getBoundingClientRect(), p = el.getBoundingClientRect();
    m.hand.style.left = (r.left - p.left - 30) + 'px'; m.hand.style.top = (r.top - p.top + r.height / 2 - 12) + 'px'; m.btns.forEach(x => x.classList.toggle('on', x === b)); };
  m.move = d => { let s = m.sel; for (let k = 0; k < items.length; k++) { s = (s + d + items.length) % items.length; if (!items[s].disabled) break; } if (s !== m.sel) { m.sel = s; X.sfx?.('cursor'); m.place(); } };
  m.pick = () => { const it = items[m.sel]; if (!it || it.disabled) return X.sfx?.('buzz'); X.sfx?.('select'); onPick(it, m.sel); };
  m.btns.forEach((b, i) => { b.onpointerenter = () => { if (m.sel !== i && !items[i].disabled) { m.sel = i; X.sfx?.('cursor'); m.place(); } }; b.onclick = () => { m.sel = i; m.place(); m.pick(); }; });
  const prev = stack.findIndex(s => s.el === el); if (prev >= 0) stack.splice(prev, 1); stack.push(m);
  requestAnimationFrame(m.place); setTimeout(m.place, 120); return m;
}
export function closeMenu(el) { const i = stack.findIndex(s => s.el === el); if (i >= 0) stack.splice(i, 1); el.innerHTML = ''; }
const visible = el => el && el.isConnected && el.offsetParent !== null;
addEventListener('keydown', e => {
  const m = [...stack].reverse().find(s => visible(s.el)); if (!m || e.target.tagName === 'INPUT') return;
  const k = e.code; let used = true;
  if (k === 'ArrowDown') m.move(m.cols); else if (k === 'ArrowUp') m.move(-m.cols);
  else if (k === 'ArrowRight' && m.cols > 1) m.move(1); else if (k === 'ArrowLeft' && m.cols > 1) m.move(-1);
  else if (k === 'Enter' || k === 'Space' || k === 'KeyZ') m.pick();
  else if ((k === 'Escape' || k === 'KeyX' || k === 'Backspace') && m.onCancel) { X.sfx?.('cancel'); m.onCancel(); } else used = false;
  if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
addEventListener('resize', () => stack.forEach(m => m.place()));

// ---------- screen transitions ----------
export async function fade(fn, ms = 320) { const f = $('fade'); f.classList.add('on'); await sleep(ms); await fn?.(); await sleep(60); f.classList.remove('on'); await sleep(ms); }

// ---------- AI-generated art (assets/gen; see assets/gen/ART-MANIFEST.md) ----------
export const HEROES = ['sunny', 'river', 'fern', 'star'];
const IMG = {};
export function art(path) { if (!IMG[path]) { const i = new Image(); i.decoding = 'async'; i.src = 'assets/gen/' + path; IMG[path] = i; } return IMG[path]; }
const ok = i => i && i.complete && i.naturalWidth > 0;
export function preloadArt() { HEROES.forEach(h => { art(`heroes/${h}_battle.png`); art(`heroes/${h}_portrait.png`); });
  ['tidecrest', 'frostmere', 'emberhorn', 'mossback', 'stormquill', 'dawnpetal'].forEach(d => { art(`dragons/${d}_battle.png`); art(`dragons/${d}_portrait.png`); });
  MONS.forEach(m => art(`monsters/${m}.png`)); ['forest', 'river', 'village', 'sky'].forEach(b => art(`backgrounds/${b}.jpg`)); art('title/title.jpg'); }
const MONS = ['addition', 'subtraction', 'times', 'division', 'fractions', 'mixed', 'doubling', 'bonds'];
// white silhouette for hit flashes
const WHITE = new Map();
function white(img) { if (WHITE.has(img)) return WHITE.get(img); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d');
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); WHITE.set(img, c); return c; }
export function artPortrait(path, size = 80) { const i = art(path).cloneNode(); i.className = 'portrait art'; i.width = i.height = size; i.alt = ''; return i; }
export const heroPortrait = me => artPortrait(`heroes/${HEROES[(me.look | 0) % 4]}_portrait.png`);
export const dragonPortrait = clan => artPortrait(`dragons/${clan}_portrait.png`);

// ---------- portraits (cropped from the sprite sheets, framed) ----------
export function portrait(sheet, col, row, flip = false, size = 72) {
  const sh = X.SHEETS[sheet], c = document.createElement('canvas'); c.width = c.height = size; c.className = 'portrait'; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const crop = Math.min(sh.fw, sh.fh) * 0.62, sx = col * sh.fw + (sh.fw - crop) / 2, sy = row * sh.fh + 1;
  if (flip) { g.translate(size, 0); g.scale(-1, 1); } g.drawImage(sh.img, sx, sy, crop, crop, 0, 0, size, size); return c;
}

// ---------- dialog box with portrait frame + name plate ----------
let dlgBusy = false;
export async function dialog(lines, { name, sheet, col = 0, row = 0, img } = {}) {
  if (dlgBusy) return; dlgBusy = true; X.G.uiLock = (X.G.uiLock || 0) + 1;
  const d = $('dialog'), pf = d.querySelector('.pframe'); pf.innerHTML = ''; if (img) pf.append(img); else if (sheet) pf.append(portrait(sheet, col, row)); pf.classList.toggle('hidden', !sheet && !img);
  d.querySelector('.nameplate').textContent = name || ''; d.querySelector('.nameplate').classList.toggle('hidden', !name);
  d.classList.remove('hidden'); d.classList.add('pop'); const txt = d.querySelector('.dtext'), more = d.querySelector('.more');
  for (const l of lines) { more.classList.add('hidden'); await typeText(txt, l); more.classList.remove('hidden');
    await new Promise(r => { const go = e => { if (e.type === 'keydown' && !['Enter', 'Space', 'KeyZ', 'KeyE'].includes(e.code)) return; removeEventListener('keydown', go, true); d.removeEventListener('click', go); X.sfx?.('select'); e.stopPropagation(); r(); };
      setTimeout(() => { addEventListener('keydown', go, true); d.addEventListener('click', go); }, 120); }); }
  d.classList.add('hidden'); d.classList.remove('pop'); X.G.uiLock--; dlgBusy = false;
}

// ---------- title screen: drifting crystals + light shafts ----------
let titleRaf;
export function showTitle({ onNew, onContinue, onCode, hasSave }) {
  const t = $('title'); t.style.setProperty('--tart', `url(${art('title/title.jpg').src})`); t.classList.add('art'); t.classList.remove('hidden'); const cv = $('tcv'), g = cv.getContext('2d');
  const cr = Array.from({ length: 26 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 6 + Math.random() * 18, v: 0.01 + Math.random() * 0.03, h: [190, 210, 270, 160, 320][i % 5], r: Math.random() * 6, ph: Math.random() * 6 }));
  const draw = now => { titleRaf = requestAnimationFrame(draw); const W = cv.width = innerWidth, H = cv.height = innerHeight, tt = now / 1000; g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const x = W * (0.1 + i * 0.17) + Math.sin(tt * 0.3 + i) * 40, a = 0.05 + 0.04 * Math.sin(tt * 0.7 + i * 2);
      const gr = g.createLinearGradient(x, 0, x - H * 0.5, H); gr.addColorStop(0, `rgba(255,240,200,${a})`); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 30 - i * 6, 0); g.lineTo(x + 40 + i * 4, 0); g.lineTo(x - H * 0.55 + 90, H); g.lineTo(x - H * 0.55 - 40, H); g.fill(); }
    for (const c of cr) { c.y -= c.v / 60; if (c.y < -0.05) { c.y = 1.05; c.x = Math.random(); } const x = c.x * W + Math.sin(tt * 0.5 + c.ph) * 20, y = c.y * H, s = c.s, rot = tt * 0.4 + c.r;
      g.save(); g.translate(x, y); g.scale(Math.cos(rot), 1); g.globalAlpha = 0.55 + 0.35 * Math.sin(tt * 2 + c.ph);
      g.fillStyle = `hsla(${c.h},90%,70%,.85)`; g.beginPath(); g.moveTo(0, -s * 1.5); g.lineTo(s * 0.6, 0); g.lineTo(0, s * 1.5); g.lineTo(-s * 0.6, 0); g.fill();
      g.fillStyle = `hsla(${c.h},100%,92%,.9)`; g.beginPath(); g.moveTo(0, -s * 1.5); g.lineTo(s * 0.2, 0); g.lineTo(0, s * 1.5); g.lineTo(-s * 0.15, 0); g.fill(); g.restore(); }
    g.globalCompositeOperation = 'source-over'; };
  titleRaf = requestAnimationFrame(draw);
  const items = [{ label: 'New Game', v: 'new' }, { label: 'Continue', v: 'cont', disabled: !hasSave }, { label: 'Class Code', v: 'code' }, { label: 'Settings', v: 'set' }];
  const pick = it => { if (it.v === 'set') return settingsWindow($('titleMenu'), () => showTitle({ onNew, onContinue, onCode, hasSave }));
    hideTitle(); ({ new: onNew, cont: onContinue, code: onCode })[it.v](); };
  menu($('titleMenu'), items, pick);
}
export function hideTitle() { cancelAnimationFrame(titleRaf); $('title').classList.add('hidden'); closeMenu($('titleMenu')); }

function settingsWindow(host, back) {
  const opts = () => [{ label: `Text speed: ${settings.textSpeed}`, v: 'speed' }, { label: `Window: ${settings.theme}`, v: 'theme' }, { label: `Sound: ${X.isMuted() ? 'off' : 'on'}`, v: 'mute' }, { label: 'Back', v: 'back' }];
  const go = () => menu(host, opts(), it => {
    if (it.v === 'speed') settings.textSpeed = { slow: 'normal', normal: 'fast', fast: 'slow' }[settings.textSpeed];
    else if (it.v === 'theme') settings.theme = { blue: 'indigo', indigo: 'teal', teal: 'blue' }[settings.theme];
    else if (it.v === 'mute') X.toggleMute(); else return back();
    saveSettings(); go(); }, { onCancel: back });
  go();
}

// ---------- main menu (party status, items, clan, settings) ----------
export const lvl = xp => 1 + Math.floor((xp || 0) / 30);
export function openMainMenu() {
  const G = X.G, me = G.me; if (!me || G.uiLock) return; G.uiLock = (G.uiLock || 0) + 1; G.menuOpen = true; X.sfx('open');
  const mm = $('mainMenu'); mm.classList.remove('hidden'); mm.classList.add('pop');
  const close = () => { mm.classList.add('hidden'); closeMenu($('mmCmd')); G.uiLock--; G.menuOpen = false; };
  const pane = $('mmPane');
  const status = () => { const c = X.CLANS[me.clan], xp = G.xp || 0, L = lvl(xp), into = xp % 30;
    pane.innerHTML = `<div class="prow"><div class="pf"></div><div class="pinfo"><div class="pname">${esc(me.nick)}</div><div>Lv <b>${L}</b> &nbsp; Explorer</div>
      <div class="bar"><i style="width:${into / 30 * 100}%"></i></div><small>XP ${xp} &middot; next Lv in ${30 - into}</small></div></div>
      <div class="prow"><div class="pf pfd"></div><div class="pinfo"><div class="pname">${esc(c.name)}</div><div>Lv <b>${L}</b> &nbsp; Dragon</div>
      <div class="bar mp"><i style="width:${Math.min(100, (G.gems || 0) * 10)}%"></i></div><small>Power: ${esc(c.powerName)}</small></div></div>`;
    pane.querySelector('.pf').append(heroPortrait(me)); pane.querySelector('.pfd').append(dragonPortrait(me.clan)); };
  const items = () => { pane.innerHTML = `<h3>Items</h3><ul class="ilist"><li><span>Crystal Gems</span><b>${G.gems || 0}</b></li><li><span>Focus Herb</span><b>1</b></li><li><span>Sky Arena Pass</span><b>${(G.gems || 0) >= (X.room()?.arenaGems || 3) ? 1 : 0}</b></li></ul>
    <p class="note">Focus Herb: use in battle to clear away two wrong answers.</p>`; };
  const clan = () => { const c = X.CLANS[me.clan], mates = Object.values(G.players).filter(p => p.clan === me.clan);
    pane.innerHTML = `<h3>${esc(c.name)} Clan</h3><p>Home: ${esc(c.home)}</p><p>Power: ${esc(c.powerName)}</p><h3>Clanmates here</h3><ul class="ilist">${mates.map(p => `<li><span>${esc(p.nick)}</span><b>${p.gems || 0}&#x1F48E;</b></li>`).join('')}</ul>`; };
  const cmds = [{ label: 'Status', f: status }, { label: 'Items', f: items }, { label: 'Clan', f: clan }, { label: 'Settings', f: () => { pane.innerHTML = '<h3>Settings</h3><div id="mmSet" class="mwin"></div>'; settingsWindow($('mmSet'), () => { status(); main(); }); } }, { label: 'Close', f: close }];
  const main = () => menu($('mmCmd'), cmds, it => it.f(), { onCancel: close });
  $('mmGems').textContent = G.gems || 0; $('mmLoc').textContent = me.grp.position.x > 30 ? 'Sky Arena' : 'Crystal Village';
  status(); main();
}

// ======================= CRYSTAL BATTLE =======================
const B = { on: false };
X.battle = B;
const OPS = { '+': 'add', '−': 'sub', '-': 'sub', '×': 'mul', '÷': 'div' };
function hintFor(q) {
  const f = q.match(/^(\d+)\/(\d+) of (\d+)$/); if (f) return `Split ${f[3]} into ${f[2]} equal groups, then take ${f[1]} of them.`;
  const m = q.match(/^(\d+)\s*([+−\-×÷])\s*(\d+)$/); if (!m) return 'Read it slowly and picture the numbers as gems.';
  const [a, op, b] = [+m[1], m[2], +m[3]];
  return { add: `Start at ${Math.max(a, b)} and count on ${Math.min(a, b)} more.`, sub: `Start at ${b} and count up to ${a}. How many steps?`,
    mul: `${a} groups of ${b}. Try ${b} + ${b} + … ${a} times, or a fact you know.`, div: `How many ${b}s fit into ${a}? Think: ${b} × ? = ${a}` }[OPS[op]];
}
// procedural crystal monster drawn into a small canvas and scaled up for a pixel look
function monsterCanvas(hue, t, hit) {
  const c = B.mc || (B.mc = document.createElement('canvas')); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64);
  const col = (l, a = 1) => hit ? `rgba(255,255,255,${a})` : `hsla(${hue},85%,${l}%,${a})`; const bob = Math.round(Math.sin(t * 2.2) * 2);
  const poly = (pts, f) => { g.fillStyle = f; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y + bob) : g.moveTo(x, y + bob)); g.closePath(); g.fill(); };
  poly([[14, 30], [6, 40], [12, 50], [20, 40]], col(38)); poly([[50, 30], [58, 40], [52, 50], [44, 40]], col(38)); // arms (shards)
  poly([[32, 6], [46, 24], [42, 52], [22, 52], [18, 24]], col(48)); poly([[32, 6], [36, 24], [32, 52], [22, 52], [18, 24]], col(64)); poly([[32, 6], [26, 22], [18, 24]], col(85));
  poly([[24, 4], [28, 14], [22, 14]], col(70)); poly([[40, 4], [42, 14], [36, 14]], col(70)); // horns
  g.fillStyle = hit ? '#fff' : '#111a'; g.fillRect(25, 26 + bob, 4, 3); g.fillRect(35, 26 + bob, 4, 3); g.fillStyle = '#fff'; g.fillRect(26, 26 + bob, 1, 1); g.fillRect(36, 26 + bob, 1, 1);
  g.fillStyle = col(30, 0.6); g.fillRect(28, 36 + bob, 8, 2);
  return c;
}
function bctx() { const cv = $('bcv'); if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; } const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; return [cv, g]; }
function layout() { const W = innerWidth, H = innerHeight, s = Math.max(3, Math.round(H / 170));
  return { W, H, s, mon: { x: W * 0.27, y: H * 0.44 }, kid: { x: W * 0.70, y: H * 0.36 }, dra: { x: W * 0.83, y: H * 0.52 } }; }
function spark(x, y, n, o = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (o.v || 6) * (0.3 + Math.random());
  B.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), life: 1, decay: 0.012 + Math.random() * 0.02, s: (o.s || 4) * (0.5 + Math.random()), h: o.h ?? (20 + Math.random() * 40), g: o.g ?? 0.12, tx: o.tx, ty: o.ty }); } }
function dmgNumber(x, y, val, cls = '') { const d = document.createElement('div'); d.className = 'dmg ' + cls; d.textContent = val; d.style.left = x + 'px'; d.style.top = y + 'px';
  $('battle').append(d); d.style.animationDuration = 2.4 * SLOW + 's'; setTimeout(() => d.remove(), 2600 * SLOW); }
function shake(px, ms) { B.shake = { px, until: performance.now() + ms, ms }; }
function flash(a = 1, col = '255,255,255') { B.flash = { a, col }; }

function drawBattle(now) {
  if (!B.on) return; B.raf = requestAnimationFrame(drawBattle);
  const [cv, g] = bctx(), L = layout(), t = now / 1000, dt = Math.min(0.25, (now - (B.last || now)) / 1000); B.last = now;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.W, L.H);
  let sx = 0, sy = 0; if (B.shake && now < B.shake.until) { const k = (B.shake.until - now) / B.shake.ms * B.shake.px; sx = (Math.random() - 0.5) * 2 * k; sy = (Math.random() - 0.5) * 2 * k; }
  $('bshake').style.transform = `translate(${sx}px,${sy}px)`; g.translate(sx, sy);
  // painted battle backdrop (fades in after the shatter intro)
  const bg = B.bg; if (ok(bg)) { const k = Math.min(1, (now - B.t0) / 900), sc = Math.max(L.W / bg.naturalWidth, L.H / bg.naturalHeight); g.globalAlpha = k; g.imageSmoothingEnabled = true;
    g.drawImage(bg, (L.W - bg.naturalWidth * sc) / 2, (L.H - bg.naturalHeight * sc) / 2 + Math.sin(t * 0.2) * 3, bg.naturalWidth * sc, bg.naturalHeight * sc + 6); g.imageSmoothingEnabled = false; g.globalAlpha = 1; }
  // stage: darkened floor band + soft vignette so the blurred area reads as a backdrop
  const fl = g.createLinearGradient(0, L.H * 0.45, 0, L.H); fl.addColorStop(0, 'rgba(10,14,40,0)'); fl.addColorStop(1, 'rgba(8,10,30,.55)'); g.fillStyle = fl; g.fillRect(0, L.H * 0.45, L.W, L.H);
  if (B.dim) { g.fillStyle = `rgba(4,6,20,${B.dim})`; g.fillRect(-20, -20, L.W + 40, L.H + 40); }
  const shadow = (x, y, w) => { g.fillStyle = 'rgba(0,0,20,.35)'; g.beginPath(); g.ellipse(x, y, w, w * 0.22, 0, 0, 7); g.fill(); };
  // monster
  if (B.mon.alpha > 0) { const m = L.mon, sc = L.s * 1.3, hit = now < B.mon.hitUntil; shadow(m.x, m.y + 30 * sc, 22 * sc);
    g.save(); g.globalAlpha = B.mon.alpha; const lunge = B.mon.lunge || 0; g.translate(m.x + lunge * L.W * 0.3, m.y);
    if (B.mon.dying) { g.globalCompositeOperation = 'lighter'; }
    const mi = B.monImg; if (ok(mi)) { let h = L.H * 0.32, w = h * mi.naturalWidth / mi.naturalHeight; if (w > L.W * 0.24) { h *= L.W * 0.24 / w; w = L.W * 0.24; } const br = 1 + Math.sin(t * 2.2) * 0.025, bob = Math.sin(t * 1.6) * 4;
      g.translate(0, 30 * sc + bob); g.scale(1 / br, br); g.drawImage(mi, -w / 2, -h, w, h);
      if (hit || B.mon.dying) { g.globalAlpha = B.mon.alpha * (hit ? 0.9 : 0.4); g.drawImage(white(mi), -w / 2, -h, w, h); } }
    else g.drawImage(monsterCanvas(B.hue, t, hit), -32 * sc, -32 * sc, 64 * sc, 64 * sc); g.restore(); }
  // party: kid (faces left), dragon (sheet faces right -> flip)
  const kS = X.SHEETS[B.kidSheet], dS = X.SHEETS[B.dragonSheet], ks = L.s * 1.0;
  const breathe = 1 + Math.sin(t * 2.4) * 0.02, kx = L.kid.x + (B.kidStep || 0) * -40, ky = L.kid.y;
  shadow(kx, ky + 22 * ks, 13 * ks);
  const kcol = B.cheer ? 2 + (Math.floor(t * 6) % 2) : 2 + (Math.floor(t * 1.6) % 2), krow = 3;
  g.save(); g.translate(kx, ky + 25 * ks); g.scale(1 / breathe, breathe); const hi = B.heroImg;
  if (ok(hi)) { const h = L.H * 0.27, w = h * hi.naturalWidth / hi.naturalHeight, hop = B.cheer ? -Math.abs(Math.sin(t * 9)) * 10 : 0; g.drawImage(hi, -w / 2, -h + hop, w, h);
    if (now < (B.kidHit || 0)) { g.globalAlpha = 0.8; g.drawImage(white(hi), -w / 2, -h + hop, w, h); } }
  else g.drawImage(kS.img, kcol * 50, krow * 50, 50, 50, -25 * ks, -50 * ks, 50 * ks, 50 * ks); g.restore();
  const D = B.dra; const flap = Math.floor(t * (D.fast ? 14 : 8)) % 4; const hov = Math.sin(t * 3) * 6;
  if (!D.away) shadow(L.dra.x, L.dra.y + 22 * ks, 11 * ks * (1 - Math.min(0.6, (D.lift || 0))));
  const dx = D.x ?? L.dra.x, dy = (D.y ?? L.dra.y) + hov, dsc = ks * (D.scale || 1);
  g.save(); g.translate(dx, dy); g.scale(-1, 1); if (D.glow) { g.shadowColor = `hsl(${B.dhue},100%,70%)`; g.shadowBlur = 30 * D.glow; }
  const di = B.dragonImg; if (ok(di)) { g.scale(-1, 1); const h = L.H * 0.2 * (D.scale || 1), w = h * di.naturalWidth / di.naturalHeight, fl = 1 + Math.sin(t * (D.fast ? 14 : 5)) * 0.03; g.scale(fl, 1 / fl); g.drawImage(di, -w / 2, -h * 0.6, w, h); }
  else g.drawImage(dS.img, flap * 50, 0, 50, 50, -25 * dsc, -25 * dsc, 50 * dsc, 50 * dsc); g.restore();
  // particles (additive glow)
  g.globalCompositeOperation = 'lighter';
  for (const p of B.parts) { if (p.tx != null) { p.vx += (p.tx - p.x) * 0.02; p.vy += (p.ty - p.y) * 0.02; p.vx *= 0.9; p.vy *= 0.9; } else p.vy += p.g;
    p.x += p.vx; p.y += p.vy; p.life -= p.decay; const s = p.s * (0.5 + p.life);
    g.fillStyle = `hsla(${p.h},100%,${60 + p.life * 30}%,${Math.max(0, p.life)})`; g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s)); }
  B.parts = B.parts.filter(p => p.life > 0);
  if (B.beam) { const b = B.beam, a = b.a; const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.4, `hsla(${B.dhue},100%,65%,${a * 0.8})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  // bloom flash
  if (B.flash && B.flash.a > 0.01) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(${B.flash.col},${B.flash.a})`; g.fillRect(0, 0, L.W, L.H); B.flash.a *= 0.88; }
  // shatter-swirl intro: shards of the snapshot spin away from the centre
  if (B.shards && B.snap) { const k = Math.min(1, (now - B.t0) / 950); if (k >= 1) B.shards = null; else { g.setTransform(1, 0, 0, 1, 0, 0); const e = ease.inOut(k), cx = L.W / 2, cy = L.H / 2;
    for (const s of B.shards) { g.save(); const ang = e * s.spin, dist = e * s.out; g.translate(cx, cy); g.rotate(ang * 0.6); g.translate(s.cx * (1 + dist) - cx + s.dx * e * L.W * 0.3, s.cy * (1 + dist) - cy + s.dy * e * L.H * 0.3);
      g.rotate(ang); g.scale(1 - e * 0.6, 1 - e * 0.6); g.globalAlpha = 1 - e * e; g.beginPath(); s.pts.forEach(([x, y], i) => i ? g.lineTo(x - s.cx, y - s.cy) : g.moveTo(x - s.cx, y - s.cy)); g.closePath(); g.clip();
      g.drawImage(B.snap, -s.cx, -s.cy, L.W, L.H); g.strokeStyle = `rgba(255,255,255,${0.8 * (1 - e)})`; g.lineWidth = 2; g.stroke(); g.restore(); } } }
  // ATB gauges
  if (B.atbRun) { B.atb = Math.min(1, B.atb + dt / 1.3); B.matb = (B.matb + dt / 7) % 1; }
  $('atbP').style.width = (B.atb * 100) + '%'; $('atbP').parentNode.classList.toggle('full', B.atb >= 1); $('atbM').style.width = (B.matb * 100) + '%';
  if (B.atb >= 1 && B.waitCmd) { B.waitCmd = false; commandMenu(); }
}
function makeShards(W, H) { const cols = 6, rows = 4, pts = []; for (let y = 0; y <= rows; y++) { pts.push([]); for (let x = 0; x <= cols; x++) { const j = x > 0 && x < cols && y > 0 && y < rows; pts[y].push([x / cols * W + (j ? (Math.random() - 0.5) * W / cols * 0.6 : 0), y / rows * H + (j ? (Math.random() - 0.5) * H / rows * 0.6 : 0)]); } }
  const out = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const a = pts[y][x], b = pts[y][x + 1], c = pts[y + 1][x + 1], d = pts[y + 1][x];
    for (const tri of [[a, b, c], [a, c, d]]) { const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      out.push({ pts: tri, cx, cy, spin: (Math.random() - 0.5) * 6, out: 0.4 + Math.random() * 0.8, dx: (cx / W - 0.5) * 2, dy: (cy / H - 0.5) * 2 }); } } return out; }

function say(text) { const m = $('bmsg'); m.classList.remove('hidden'); return typeText(m.querySelector('span'), text); }
function setQuestion(q) { $('bqtag').textContent = q.skill; $('bqtext').textContent = q.q + ' = ?'; }
function commandMenu() {
  const cmds = [{ label: 'Answer', v: 'answer' }, { label: 'Hint', v: 'hint', disabled: B.hinted }, { label: 'Item', v: 'item', disabled: B.herbUsed }, { label: 'Flee', v: 'flee' }];
  $('bcmdTitle').textContent = 'Command'; menu($('bcmd'), cmds, it => act(it.v));
}
function answerMenu() {
  $('bcmdTitle').textContent = 'Answer'; const opts = B.q.options.map(o => ({ label: String(o), v: o, disabled: B.removed.includes(o) }));
  menu($('bcmd'), opts, it => doAnswer(it.v), { cols: 2, onCancel: commandMenu });
}
async function act(v) {
  if (B.busy) return;
  if (v === 'answer') return answerMenu();
  if (v === 'flee') { B.busy = true; closeMenu($('bcmd')); await say('You slip away safely. The crystal will wait for you!'); await bsleep(700); return endBattle(); }
  B.busy = true; closeMenu($('bcmd')); B.atb = 0;
  if (v === 'hint') { B.hinted = true; X.sfx('hint'); await say('Elder\u2019s Hint: ' + hintFor(B.q.q)); }
  if (v === 'item') { B.herbUsed = true; X.sfx('heal'); const r = await new Promise(r => X.socket.emit('herb', {}, r)); B.removed = r?.remove || [];
    const L = layout(); spark(L.kid.x, L.kid.y, 40, { h: 120, up: 3, g: -0.05 }); await say('Used a Focus Herb! Two wrong answers fade away.'); }
  B.busy = false; B.waitCmd = true;
}
async function doAnswer(val) {
  if (B.busy) return; B.busy = true; closeMenu($('bcmd')); $('bcmdTitle').textContent = '';
  const res = await new Promise(r => X.socket.emit('answer', { answer: val }, r)); B.result = res; const L = layout();
  if (res.ok) {
    say(`${X.CLANS[B.clan].name} unleashes ${X.CLANS[B.clan].powerName}!`); X.sfx('summon');
    // summon: dim, dragon rises and grows, particles converge, burst on monster
    B.cheer = true; B.dra.fast = true; const D = B.dra, x0 = L.dra.x, y0 = L.dra.y, t0 = performance.now();
    await anim(900, k => { const e = ease.inOut(k); B.dim = 0.55 * e; D.x = x0 + (L.W * 0.55 - x0) * e; D.y = y0 + (L.H * 0.3 - y0) * e - Math.sin(k * Math.PI) * 40; D.scale = 1 + e * 0.7; D.glow = e; D.lift = e;
      if (Math.random() < 0.6) spark(D.x + (Math.random() - 0.5) * 300, D.y + (Math.random() - 0.5) * 300, 2, { tx: D.x, ty: D.y, h: B.dhue, s: 5 }); });
    X.sfx('charge'); await anim(500, k => { B.beam = { x: D.x, y: D.y, r: 30 + k * 90, a: k * 0.9 }; });
    // projectile to monster
    await anim(320, k => { const e = ease.out(k); B.beam = { x: D.x + (L.mon.x - D.x) * e, y: D.y + (L.mon.y - D.y) * e, r: 120 - e * 40, a: 0.9 }; spark(B.beam.x, B.beam.y, 4, { h: B.dhue, v: 3, s: 6, g: 0 }); });
    B.beam = null; flash(0.65); shake(18, 650); X.sfx('boom'); B.mon.hitUntil = performance.now() + 260;
    spark(L.mon.x, L.mon.y, 160, { h: B.dhue, v: 11, s: 7 }); spark(L.mon.x, L.mon.y, 60, { h: 50, v: 7, s: 5 });
    const dmg = 900 + Math.round(res.gained * 7 + Math.random() * 99); dmgNumber(L.mon.x, L.mon.y - L.H * 0.12, dmg); dmgNumber(L.mon.x + 60, L.mon.y - L.H * 0.04, 'Correct!', 'small');
    await bsleep(700); B.mon.dying = true; X.sfx('shatter'); for (let i = 0; i < 6; i++) spark(L.mon.x, L.mon.y, 20, { h: B.hue, v: 5, s: 8, up: 2 });
    anim(600, k => { B.mon.alpha = 1 - k; }); await anim(700, k => { const e = ease.inOut(k); D.x = L.W * 0.55 + (x0 - L.W * 0.55) * e; D.y = L.H * 0.3 + (y0 - L.H * 0.3) * e; D.scale = 1.7 - 0.7 * e; D.glow = 1 - e; B.dim = 0.55 * (1 - e); });
    D.x = D.y = null; D.fast = false; await victory(res);
  } else {
    await say('The crystal monster sparks with energy\u2026'); X.sfx('mattack');
    await anim(260, k => B.mon.lunge = ease.out(k)); flash(0.6, '255,60,60'); shake(10, 400); dmgNumber(L.kid.x, L.kid.y - 40, 'Miss', 'small'); B.kidStep = 0.5; B.kidHit = performance.now() + 220;
    await anim(400, k => { B.mon.lunge = 1 - ease.inOut(k); B.kidStep = 0.5 * (1 - k); });
    await say(`Nice try! The answer was ${res.correct}. The crystal monster floats away to rest.`); X.sfx('shatter');
    await anim(600, k => B.mon.alpha = 1 - k); await bsleep(500); X.onResult?.(res); await results(res, false);
  }
}
function anim(ms, f) { ms *= SLOW; return new Promise(r => { const t0 = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); f(k); if (k < 1) setTimeout(step, 16); else r(); }; step(); }); } // timers, not rAF: keeps sequencing alive in throttled/background tabs
async function victory(res) {
  X.sfx('fanfare'); const v = $('bvictory'); $('bmsg').classList.add('hidden'); v.classList.remove('hidden'); B.cheer = true; X.onResult?.(res);
  const L = layout(); for (let i = 0; i < 4; i++) setTimeout(() => spark(L.kid.x, L.kid.y - 40, 25, { h: 45, up: 4, g: 0.08 }), i * 250);
  await bsleep(1400); v.classList.add('up'); await results(res, true);
}
async function results(res, won) {
  const w = $('bresult'), prevL = lvl(B.xp0), nowL = lvl(res.xp), gxp = (res.xp ?? B.xp0) - B.xp0, ggem = (res.gems ?? B.gems0) - B.gems0;
  w.innerHTML = `<div class="rtitle">${won ? 'Victory!' : 'Battle over'}</div><table><tr><td>EXP</td><td class="num" id="rxp">0</td></tr><tr><td>Gems</td><td class="num" id="rgem">0</td></tr><tr><td>Level</td><td class="num">${nowL}</td></tr></table><div id="rlv" class="lvup hidden">LEVEL UP! Lv ${prevL} \u2192 ${nowL}</div><div id="rok" class="mwin"></div>`;
  w.classList.remove('hidden'); w.classList.add('pop');
  await anim(700, k => { $('rxp').textContent = Math.round(gxp * k); $('rgem').textContent = Math.round(ggem * k); if (k < 1 && Math.random() < 0.3) X.sfx('tick'); });
  if (nowL > prevL) { $('rlv').classList.remove('hidden'); X.sfx('levelup'); const L = layout(); spark(L.W / 2, L.H / 2, 80, { h: 50, v: 8 }); }
  if (res.arenaOpen && !X.G.arenaToasted) { X.G.arenaToasted = true; w.insertAdjacentHTML('beforeend', '<p class="note">The Sky Arena portal is now open!</p>'); }
  menu($('rok'), [{ label: 'Continue', v: 1 }], () => endBattle());
}
export async function startBattle(q, crystal, me) {
  if (B.on) return; Object.assign(B, { on: true, q, busy: false, parts: [], atb: 0, matb: 0.2, atbRun: false, waitCmd: false, hinted: false, herbUsed: false, removed: [], dim: 0, cheer: false, kidStep: 0,
    mon: { alpha: 1, hitUntil: 0, lunge: 0 }, dra: {}, hue: (crystal.id * 0.13 % 1) * 360, clan: me.clan, dhue: { emberhorn: 15, tidecrest: 200, mossback: 110, stormquill: 270, frostmere: 190, dawnpetal: 330 }[me.clan] ?? 40,
    kidSheet: 'kid_' + ((me.look | 0) % 4), dragonSheet: 'dragon_' + me.clan,
    heroImg: art(`heroes/${HEROES[(me.look | 0) % 4]}_battle.png`), dragonImg: art(`dragons/${me.clan}_battle.png`),
    monImg: art(`monsters/${MONS.includes((q.skill || '').toLowerCase()) ? q.skill.toLowerCase() : MONS[crystal.id % MONS.length]}.png`),
    bg: art(`backgrounds/${['forest', 'river', 'village'][crystal.id % 3]}.jpg`), xp0: X.G.xp || 0, gems0: X.G.gems || 0 });
  X.G.uiLock = (X.G.uiLock || 0) + 1; X.G.inBattle = true;
  B.snap = await X.snapshot(); B.shards = makeShards(innerWidth, innerHeight); B.t0 = performance.now(); X.sfx('shatter'); X.sfx('swirl');
  X.setBattleCam(crystal); const el = $('battle'); el.classList.remove('hidden'); document.body.classList.add('inbattle');
  $('bresult').classList.add('hidden'); $('bmsg').classList.add('hidden'); $('bvictory').classList.add('hidden'); $('bvictory').classList.remove('up'); $('bcmd').innerHTML = ''; $('bcmdTitle').textContent = '';
  $('bpName').textContent = me.nick; $('bpDragon').textContent = X.CLANS[me.clan].name; $('bpLv').textContent = 'Lv ' + lvl(B.xp0); $('bmName').textContent = { addition: 'Prism Golem', subtraction: 'Frost Imp', times: 'Ruby Horror', division: 'Jade Tortoise', fractions: 'Amber Snail', mixed: 'Geode Gremlin', doubling: 'Twin Sprite', bonds: 'Gilded Drake' }[B.monImg.src.split('/').pop().replace('.png', '')] || 'Shard Sprite';
  setQuestion(q); B.raf = requestAnimationFrame(drawBattle);
  await bsleep(1000); say(`A ${$('bmName').textContent} appears! Solve its riddle to free the crystal.`); B.atbRun = true; B.waitCmd = true;
}
export async function endBattle() {
  await fade(() => { B.on = false; cancelAnimationFrame(B.raf); $('battle').classList.add('hidden'); document.body.classList.remove('inbattle'); closeMenu($('bcmd')); closeMenu($('rok') || document.createElement('div'));
    X.endBattleCam(); X.G.uiLock--; X.G.inBattle = false; X.afterBattle?.(B.result); B.result = null; });
}
