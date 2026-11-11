// Dragon Sums v7 — Crystal Isles: free-roaming HD-2D action adventure (single player, static).
// One continuous hand-laid map streamed in 16x16-tile chunks, real-time sword combat with a maths shield
// finisher, dragon eggs to hatch and wild dragons to befriend. FF-style title / dialog / menus from ff.js.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import * as FF from './ff.js';

const $ = id => document.getElementById(id), CLANS = window.CLANS, Q = window.Q;
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const MOBILE = /Android|iPhone|iPad|Mobile/.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
const LOW = params.has('low') || MOBILE;
const G = window.__game = { mode: 'title', errors: [], uiLock: 0, gems: 0, focus: 0, dragons: [], buddy: null, year: 3, chunksBuilt: 0, kills: 0, hatched: 0, befriended: 0 };
addEventListener('error', e => G.errors.push(String(e.message)));
const rng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const hash = (x, z, k = 0) => { let h = (x * 374761393 + z * 668265263 + k * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const sleep = ms => new Promise(r => setTimeout(r, ms));
// v13: Safari private mode / locked-down storage can throw on any access
const LS = { getItem: k => { try { return localStorage.getItem(k); } catch { return null; } }, setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { } }, removeItem: k => { try { localStorage.removeItem(k); } catch { } } };
const boot = window.__boot || { step() { } };

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d4b8); scene.fog = new THREE.Fog(0xd9d2b0, 30, 64);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 150);
const CAM = { pitch: 0.78, dist: 24 }; const CAM_MIN = 16; // v12: never zoom so close the hero is cut off
scene.add(new THREE.HemisphereLight(0xcfe4f0, 0x5a5a3a, .95));
const sun = new THREE.DirectionalLight(0xffcf8a, 3.4); sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 5; sun.shadow.blurSamples = 12;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-17, 10, -9); // low warm sun upper-left: long shadows falling to the lower right

// shared uniforms: time + cloud shadows/wind patched into every lit material
const U = { uT: { value: 0 } };
const CLOUD_GLSL = `uniform float uT; varying vec2 vCW;
 float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
 float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
 float cloud(vec2 p){ p = p*0.045 + vec2(uT*0.018, uT*0.007); float n = vn(p)*0.6 + vn(p*2.1)*0.3 + vn(p*4.3)*0.1; return 1. - smoothstep(0.5, 0.72, n) * 0.32; }`;
function patch(mat, { wind = false } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = U.uT;
    sh.vertexShader = 'uniform float uT; varying vec2 vCW;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 cwp = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        cwp = instanceMatrix * cwp;
        ${wind ? 'transformed.x += sin(uT*1.9 + instanceMatrix[3].x*0.55 + instanceMatrix[3].z*0.35) * 0.09 * position.y; transformed.z += cos(uT*1.4 + instanceMatrix[3].x*0.3) * 0.03 * position.y;' : ''}
      #endif
      vCW = (modelMatrix * cwp).xz;`);
    sh.fragmentShader = CLOUD_GLSL + '\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= cloud(vCW);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'cloud' + (wind ? 'w' : '');
  return mat;
}

// ---------- pixel helpers ----------
const loadImg = src => new Promise((res, rej) => { boot.want = (boot.want || 0) + 1; const i = new Image(); i.onload = () => { boot.step(); res(i); }; i.onerror = () => rej(new Error('img ' + src)); i.src = src; });
function cv(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; draw && draw(g, c); return c; }
function ntex(src, rep = false) { const t = src instanceof THREE.Texture ? src : (src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src));
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; }
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => clamp(Math.round(v + k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

// ---------- 16x16 tiles, hand-made in code (tileable, tight palettes, no noise) ----------
const TILE = {}; // name -> [canvas variants]
function makeTiles() {
  const grassBase = '#62a83c', grassDk = '#4f9032', grassLt = '#7cc04e', bladeDk = '#3e7a2a';
  const grass = v => cv(16, 16, g => { const r = rng(11 + v * 7); px(g, grassBase, 0, 0, 16, 16);
    for (let i = 0; i < 12; i++) px(g, grassDk, r() * 16 | 0, r() * 16 | 0, r() < .5 ? 2 : 1, 1);
    for (let i = 0; i < 3; i++) { const x = r() * 14 | 0, y = 2 + r() * 12 | 0; px(g, grassLt, x, y - 1); px(g, grassLt, x + 1, y - 2); px(g, bladeDk, x, y); px(g, bladeDk, x + 1, y); }
    if (v === 3) { const x = 3 + r() * 8 | 0, y = 4 + r() * 8 | 0; px(g, '#fff6d6', x, y); px(g, '#fff6d6', x + 2, y + 1); px(g, '#ffd75a', x + 1, y + 1); } });
  const flowers = v => cv(16, 16, g => { g.drawImage(grass(v), 0, 0); const r = rng(91 + v); const cols = ['#ffffff', '#ffd75a', '#ff9ab8', '#b9a4ff'];
    for (let i = 0; i < 3; i++) { const x = 2 + r() * 11 | 0, y = 2 + r() * 11 | 0, c = cols[(r() * 4) | 0]; px(g, c, x - 1, y); px(g, c, x + 1, y); px(g, c, x, y - 1); px(g, c, x, y + 1); px(g, '#f2b632', x, y); px(g, bladeDk, x, y + 2); } });
  const tones = ['#c2ae90', '#b29c7e', '#cdbd9f', '#a68f72', '#bba487', '#d6c8ac'];
  const cobble = v => cv(16, 16, g => { const r = rng(301 + v * 13); px(g, '#584a40', 0, 0, 16, 16);
    for (let row = 0; row < 4; row++) { const y = row * 4; let x = ((row * 5 + v * 3) % 7); x -= 7;
      while (x < 16) { const w = 4 + (r() * 4 | 0), tone = tones[(r() * tones.length) | 0];
        for (let i = 0; i < w - 1; i++) { const xx = ((x + i) % 16 + 16) % 16; px(g, tone, xx, y, 1, 3); px(g, shade(tone, 22), xx, y); px(g, shade(tone, -26), xx, y + 2); }
        px(g, shade(tone, -34), ((x + w - 2) % 16 + 16) % 16, y + 1, 1, 2);
        if (r() < .35) px(g, shade(tone, -14), ((x + 1 + (r() * (w - 2) | 0)) % 16 + 16) % 16, y + 1);
        x += w; } }
    if (v === 2) { px(g, '#5f9a38', 6, 7); px(g, '#7cc04e', 6, 6); } });
  const dirt = v => cv(16, 16, g => { const r = rng(501 + v); px(g, '#b48b5c', 0, 0, 16, 16); for (let i = 0; i < 10; i++) px(g, r() < .5 ? '#9e7a50' : '#c49c6c', r() * 16 | 0, r() * 16 | 0, r() < .3 ? 2 : 1, 1); });
  const sand = v => cv(16, 16, g => { const r = rng(601 + v); px(g, '#dcc48e', 0, 0, 16, 16); for (let i = 0; i < 9; i++) px(g, r() < .5 ? '#c9ae78' : '#ead6a6', r() * 16 | 0, r() * 16 | 0); });
  const plank = v => cv(16, 16, g => { for (let i = 0; i < 4; i++) { const c = (i + v) % 2 ? '#a96e36' : '#bd7f40'; px(g, c, i * 4, 0, 4, 16); px(g, shade(c, 25), i * 4, 0, 1, 16); px(g, '#5a3618', i * 4 + 3, 0, 1, 16); px(g, '#6b4220', i * 4 + 1, (i * 5 + v * 3) % 14 + 1); } px(g, '#3a2210', 0, 15, 16, 1); });
  const V = f => [0, 1, 2, 3].map(f);
  Object.assign(TILE, { grass: V(grass), flowers: V(flowers), cobble: V(cobble), dirt: V(dirt), sand: V(sand), plank: V(plank) });
  TILE.cliffSide = cv(16, 32, g => { px(g, '#6e5f52', 0, 0, 16, 32); const r = rng(77);
    for (let row = 0; row < 6; row++) { let x = row % 2 ? -4 : 0; const y = row * 5 + 2; while (x < 16) { const w = 5 + (r() * 3 | 0), tone = ['#9a8a76', '#8a7a68', '#a89880'][(r() * 3) | 0];
      px(g, tone, x, y, w - 1, 4); px(g, shade(tone, 20), x, y, w - 1, 1); px(g, shade(tone, -25), x, y + 3, w - 1, 1); x += w; } }
    px(g, '#4f9032', 0, 0, 16, 2); for (let x = 0; x < 16; x++) if (hash(x, 3) < .6) px(g, '#4f9032', x, 2, 1, 1 + (hash(x, 9) * 2 | 0)); px(g, '#3a3028', 0, 30, 16, 2); });
  // v8 voxel side: grass lip that drips over packed earth with stones + strata (32px = 1 world unit tall)
  TILE.earthSide = cv(16, 32, g => { const r = rng(123); px(g, '#7a5638', 0, 0, 16, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) { const n = hash(x, y, 31); if (n < .16) px(g, '#684830', x, y); else if (n > .9) px(g, '#8c6644', x, y); }
    for (let i = 0; i < 5; i++) { const x = r() * 13 | 0, y = 8 + r() * 20 | 0; px(g, '#8f8a7e', x, y, 3, 2); px(g, '#aaa597', x, y, 2, 1); px(g, '#5e5244', x, y + 2, 3, 1); }
    px(g, '#5a3e28', 0, 15, 16, 1); px(g, '#5a3e28', 0, 27, 16, 1);
    for (let x = 0; x < 16; x++) { const d = 3 + (hash(x, 1, 5) * 3 | 0); px(g, '#7cc04e', x, 0, 1, 1); px(g, '#62a83c', x, 1, 1, d - 1); px(g, '#4f9032', x, d, 1, 1); if (hash(x, 2, 6) < .3) px(g, '#3e7a2a', x, d + 1, 1, 1); px(g, '#4a3220', x, d + 1 + (hash(x, 2, 6) < .3 ? 1 : 0), 1, 1); } });
  TILE.stone = cv(16, 16, g => { px(g, '#8a877c', 0, 0, 16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = hash(x, y, 41); if (n < .2) px(g, '#77746a', x, y); else if (n > .85) px(g, '#a3a092', x, y); } px(g, '#6e9a48', 0, 0, 5, 1); px(g, '#6e9a48', 9, 0, 3, 1); });
  TILE.bark = cv(16, 16, g => { for (let x = 0; x < 16; x++) { const c = ['#6b4428', '#7c5232', '#5a3820'][hash(x, 0, 51) * 3 | 0]; px(g, c, x, 0, 1, 16); } for (let i = 0; i < 6; i++) px(g, '#4a2e18', hash(i, 1, 52) * 16 | 0, hash(i, 2, 52) * 14 | 0, 1, 3); });
  TILE.crate = cv(16, 16, g => { px(g, '#b07a40', 0, 0, 16, 16); for (let y = 0; y < 16; y += 4) { px(g, '#8a5a2a', 0, y + 3, 16, 1); px(g, '#c89050', 0, y, 16, 1); } px(g, '#6b4220', 0, 0, 16, 2); px(g, '#6b4220', 0, 14, 16, 2); px(g, '#6b4220', 0, 0, 2, 16); px(g, '#6b4220', 14, 0, 2, 16); for (let i = 2; i < 14; i++) px(g, '#7a4a24', i, i, 2, 1); });
  TILE.canvas = cv(16, 16, g => { px(g, '#d8c39a', 0, 0, 16, 16); for (let x = 0; x < 16; x += 4) px(g, '#c4ab80', x, 0, 1, 16); for (let i = 0; i < 10; i++) px(g, '#e6d4ae', hash(i, 3, 61) * 16 | 0, hash(i, 4, 61) * 16 | 0); px(g, '#a8875c', 0, 15, 16, 1); });
}
// tile types
const T_GRASS = 0, T_COBBLE = 1, T_DIRT = 2, T_WATER = 3, T_PLANK = 4, T_CLIFF = 5, T_SAND = 6, T_FLOWER = 7;
const TILE_NAME = ['grass', 'cobble', 'dirt', null, 'plank', 'grass', 'sand', 'flowers'];

// ---------- the hand-laid map (1 tile = 1 world unit) ----------
const MW = 160, MH = 120, CH = 16;
const MAP = new Uint8Array(MW * MH);
const VILLAGE = { x: 40, z: 60 }, NEST = { x: 45.5, z: 65.5 }, CLIFF_C = { x: 141, z: 58 }, CAMP = { x: 0, z: 0 };
const riverX = z => 113 + Math.sin(z * 0.07) * 4 + Math.sin(z * 0.023) * 3;
const roadZ = x => x < 52 ? 60 : 60 + Math.sin((x - 52) * 0.07) * 3.2;
const tileAt = (x, z) => (x < 0 || z < 0 || x >= MW || z >= MH) ? T_CLIFF : MAP[(z | 0) * MW + (x | 0)];
function buildMap() {
  for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) {
    const cx = x + .5, cz = z + .5; let t = hash(x, z, 1) < (cx > 58 && cx < 106 && cz > 64 ? 0.14 : 0.025) ? T_FLOWER : T_GRASS;
    const rx = riverX(cz), dr = Math.abs(cx - rx);
    // roads: main east-west road, village north-south road, meadow dirt track
    const onRoad = (Math.abs(cz - roadZ(cx)) < 1.6 && cx > 8 && cx < 134) || (Math.abs(cx - VILLAGE.x) < 1.6 && cz > 26 && cz < 98);
    if (onRoad) t = T_COBBLE;
    if (Math.hypot(cx - VILLAGE.x, cz - VILLAGE.z) < 6.5) t = T_COBBLE;
    if (Math.abs(cz - (78 + Math.sin(cx * 0.12) * 4)) < 0.9 && cx > 60 && cx < 104) t = T_DIRT;
    if (Math.abs(cx - (74 + Math.sin(cz * .2) * 2)) < 0.9 && cz > 61 && cz < 78) t = T_DIRT;
    if (dr < 3.2) t = onRoad || (Math.abs(cz - roadZ(cx)) < 1.6) ? T_PLANK : T_WATER; else if (dr < 4.3 && !onRoad) t = T_SAND;
    // dragon nest cliffs: a ring of cliffs east of the river, open toward the road
    const ex = (cx - CLIFF_C.x) / 15, ez = (cz - CLIFF_C.z) / 22, er = Math.hypot(ex, ez);
    if (er > 0.86 && er < 1.0 && !(cx < CLIFF_C.x && Math.abs(cz - roadZ(cx)) < 3)) t = T_CLIFF;
    if (er < 0.86 && t === T_GRASS && hash(x, z, 4) < .3) t = T_DIRT;
    // world rim: cliffs
    if (x < 2 || z < 2 || x >= MW - 2 || z >= MH - 2) t = T_CLIFF;
    MAP[z * MW + x] = t;
  }
}
// ---------- v8 voxel heightmap: paths/sand sunk (0), grass raised one step (1), meadow + forest plateaus (2) ----------
const HG = new Uint8Array(MW * MH), STEP = 0.4, WATER_Y = -0.2, BED_Y = -0.55;
const vnoise = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, 9), b = hash(ix + 1, iz, 9), c = hash(ix, iz + 1, 9), d = hash(ix + 1, iz + 1, 9); return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz; };
const isLand = t => t === T_GRASS || t === T_FLOWER || t === T_CLIFF;
function buildHeights() {
  for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) { const t = MAP[z * MW + x]; let h = 0;
    const er = Math.hypot((x + .5 - CLIFF_C.x) / 15, (z + .5 - CLIFF_C.z) / 22);
    if (isLand(t) || (t === T_DIRT && er < .86)) h = 1;
    if (h === 1 && t !== T_CLIFF) { let clear = true; for (let dz = -2; dz <= 2 && clear; dz++) for (let dx = -2; dx <= 2; dx++) if (!isLand(tileAt(x + dx, z + dz)) && !(er < .86)) { clear = false; break; }
      const n = vnoise(x * .11, z * .11) * .7 + vnoise(x * .31, z * .31) * .3, forest = z < 22 || x < 8 || z > MH - 8;
      if (clear && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > 15 && er > 1.05 && (n > .6 || forest)) h = 2; }
    HG[z * MW + x] = h; }
  // remove single-tile spikes/pits so cliffs read as chunky blocks
  for (let pass = 0; pass < 2; pass++) for (let z = 1; z < MH - 1; z++) for (let x = 1; x < MW - 1; x++) { const i = z * MW + x, h = HG[i]; if (h !== 2) continue;
    let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (HG[i + dx + dz * MW] === 2) n++; if (n < 2) HG[i] = 1; }
}
const hAt = (x, z) => (x < 0 || z < 0 || x >= MW || z >= MH) ? 1 : HG[(z | 0) * MW + (x | 0)];
const gy = (x, z) => { const t = tileAt(x, z); return t === T_WATER ? WATER_Y : hAt(x, z) * STEP; };
// props: binned by chunk; solids as circles/boxes
const PROPS = new Map(); // chunkKey -> [{type,x,z,...}]
const SOLIDS = new Map(); // chunkKey -> [{x,z,r}|{box}]
const ck = (cx, cz) => cx + ',' + cz;
function addProp(p) { const k = ck(Math.floor(p.x / CH), Math.floor(p.z / CH)); if (!PROPS.has(k)) PROPS.set(k, []); PROPS.get(k).push(p); }
function addSolid(s) { const x0 = s.box ? s.box[0] : s.x - s.r, x1 = s.box ? s.box[1] : s.x + s.r, z0 = s.box ? s.box[2] : s.z - s.r, z1 = s.box ? s.box[3] : s.z + s.r;
  for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) for (let cz = Math.floor(z0 / CH); cz <= Math.floor(z1 / CH); cz++) { const k = ck(cx, cz); if (!SOLIDS.has(k)) SOLIDS.set(k, []); SOLIDS.get(k).push(s); } }
const freeTile = (x, z, pad = 1.2) => { for (let dz = -pad; dz <= pad; dz += pad) for (let dx = -pad; dx <= pad; dx += pad) { const t = tileAt(x + dx, z + dz); if (t !== T_GRASS && t !== T_FLOWER && t !== T_DIRT) return false; } return true; };
function buildProps() {
  const houses = [[31, 52, 5, 3, 'red'], [49, 52, 4, 3, 'blue'], [31, 68.5, 4, 3, 'blue'], [51, 70, 5, 3, 'red'], [24, 61, 4, 3, 'red']];
  for (const [x, z, w, d, s] of houses) { addProp({ type: 'house', x, z, w, d, scheme: s }); addSolid({ box: [x - w / 2 - .2, x + w / 2 + .2, z - d / 2 - .4, z + d / 2 + .25] }); }
  addProp({ type: 'nest', x: NEST.x, z: NEST.z }); addSolid({ x: NEST.x, z: NEST.z, r: 0.75 });
  addProp({ type: 'nest', x: CLIFF_C.x + 4, z: CLIFF_C.z - 2, big: true });
  addProp({ type: 'npc', x: 37.5, z: 57.5 }); addSolid({ x: 37.5, z: 57.5, r: .35 });
  addProp({ type: 'sign', x: 45, z: 57.4 }); addProp({ type: 'sign', x: 106, z: roadZ(106) - 2.2 });
  for (const [x, z] of [[36, 56], [44, 56], [36, 64], [44.5, 62], [104, 57], [122, 57]]) { addProp({ type: 'lamp', x, z }); addSolid({ x, z, r: .2 }); }
  // trees: forest edge north + west, scattered meadow trees, river copses
  const R = rng(4242);
  for (let i = 0; i < 1400; i++) {
    const x = 2 + R() * (MW - 4), z = 2 + R() * (MH - 4);
    const forest = z < 24 + Math.sin(x * .15) * 4 || x < 10 || z > MH - 8 || (x > 124 && (Math.hypot((x - CLIFF_C.x) / 15, (z - CLIFF_C.z) / 22) > 1.08));
    const p = forest ? 0.9 : (z < 34 + Math.sin(x * .3) * 3 ? 0.35 : 0.04);
    if (R() > p) continue; if (!freeTile(x, z, forest ? .9 : 1.6)) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 15 && !forest) continue;
    const type = R() < (z < 30 ? .55 : .3) ? 'pine' : 'oak';
    addProp({ type, x, z, s: 2.6 + R() * 1.4 }); addSolid({ x, z, r: .42 });
  }
  for (let i = 0; i < 260; i++) { const x = 4 + R() * (MW - 8), z = 4 + R() * (MH - 8); if (!freeTile(x, z, .8)) continue;
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 9) continue; const k = R(); addProp({ type: k < .45 ? 'bush' : k < .75 ? 'rock' : 'stump', x, z }); if (k >= .45) addSolid({ x, z, r: .38 }); }
  // fences around the village gardens
  for (let x = 26; x < 36; x++) addProp({ type: 'fence', x: x + .5, z: 74.5 });
  addSolid({ box: [26, 36, 74.2, 74.8] });
  // v8: riverside camp (tent, campfire, crates, logs, boat) + stepping stones, like the reference framing
  const CZ = 84, rx = riverX(CZ); CAMP.x = rx + 7.6; CAMP.z = CZ;
  addProp({ type: 'tent', x: CAMP.x + 1.8, z: CZ - 2.2 }); addSolid({ box: [CAMP.x + .6, CAMP.x + 3, CZ - 3.3, CZ - 1.2] });
  addProp({ type: 'fire', x: CAMP.x, z: CZ }); addSolid({ x: CAMP.x, z: CZ, r: .45 });
  for (const [dx, dz, r] of [[-1.6, .3, .3], [1.5, 1.1, -.4]]) { addProp({ type: 'log', x: CAMP.x + dx, z: CZ + dz, r }); addSolid({ x: CAMP.x + dx, z: CZ + dz, r: .4 }); }
  for (const [dx, dz] of [[3.4, .4], [3.9, 1.2], [3.5, 1.3]]) { addProp({ type: 'crate', x: CAMP.x + dx, z: CZ + dz, s: dz > 1 ? .55 : .7 }); }
  addSolid({ box: [CAMP.x + 3, CAMP.x + 4.3, CZ, CZ + 1.6] });
  addProp({ type: 'boat', x: rx - 1.2, z: CZ - 3.5 });
  for (let i = -2; i <= 2; i++) addProp({ type: 'steprock', x: riverX(CZ + 5) + i * 1.35 + (i % 2) * .2, z: CZ + 5 + (i % 2) * .5, s: .9 + hash(i, 5) * .3 });
  for (let i = 0; i < 40; i++) { const z = 4 + R() * (MH - 8), x = riverX(z) + (R() - .5) * 5.2; if (tileAt(x, z) === T_WATER && Math.abs(z - CZ) > 7) addProp({ type: 'steprock', x, z, s: .5 + R() * .5 }); }
  // village clutter: crates, barrels, log piles
  for (const [x, z] of [[34.2, 53.5], [46.6, 53.6], [34, 69.5], [54, 68.4], [27, 62.5]]) { addProp({ type: 'crate', x, z, s: .6 }); addProp({ type: 'barrel', x: x + .8, z: z + .3 }); addSolid({ x: x + .4, z, r: .55 }); }
  addProp({ type: 'circle', x: NEST.x, z: NEST.z });
}

// ---------- materials & textures shared by chunks ----------
const MAT = {}; const GEO = {};
let ART = {};
function houseTex(w, h, front) { return ntex(cv(w * 16, h * 16, g => { // timber + plaster pixel facade
  for (let y = 0; y < h * 16; y += 16) for (let x = 0; x < w * 16; x += 16) { px(g, '#efe2c4', x, y, 16, 16); px(g, '#d9c8a4', x, y + 15, 16, 1); px(g, '#8a5a32', x, y, 2, 16); }
  px(g, '#6b4226', 0, h * 16 - 4, w * 16, 4); px(g, '#8a5a32', 0, 0, w * 16, 2); px(g, '#8a5a32', 0, 15, w * 16, 2);
  for (let i = 0; i < w; i++) { const x = i * 16; if (front && i === (w >> 1)) { px(g, '#5a3618', x + 3, 18, 10, 14); px(g, '#7a4a24', x + 4, 19, 8, 13); px(g, '#f2c14e', x + 10, 26); continue; }
    if (i % 2 === (front ? 0 : 1) || !front) { px(g, '#5a3618', x + 4, 4, 9, 8); px(g, '#9fd8f0', x + 5, 5, 7, 6); px(g, '#e8f8ff', x + 5, 5, 2, 2); px(g, '#5a3618', x + 8, 5, 1, 6); px(g, '#c0392b', x + 4, 12, 9, 2); px(g, '#e85a8a', x + 5, 11); px(g, '#ffd75a', x + 9, 11); }
    if (!front && h > 1) { px(g, '#5a3618', x + 4, 20, 9, 8); px(g, '#9fd8f0', x + 5, 21, 7, 6); } } })); }
function roofTex(red) { return ntex(cv(16, 16, g => { const a = red ? '#c4553e' : '#3e6fb8', b = shade(a, -40), c = shade(a, 30);
  for (let row = 0; row < 4; row++) { px(g, a, 0, row * 4, 16, 4); px(g, b, 0, row * 4 + 3, 16, 1); for (let x = (row % 2) * 2; x < 16; x += 4) { px(g, b, x, row * 4, 1, 3); px(g, c, x + 1, row * 4, 2, 1); } } }), true); }
let FIRE_L;
function makeShared() {
  FIRE_L = new THREE.PointLight(0xff8a3a, 7, 8, 1.4); FIRE_L.position.set(CAMP.x, gy(CAMP.x, CAMP.z) + .9, CAMP.z); scene.add(FIRE_L);
  MAT.ground = null; // per chunk
  const tuft = ntex(cv(16, 16, g => {
    const cols = ['#2c5a20', '#3e7a2a', '#55983a', '#74b94a', '#9ed864'];
    const blades = [[1, 7, 0], [3, 11, 1], [5, 9, -1], [6, 14, 0], [8, 12, 1], [9, 15, 0], [11, 10, -1], [12, 13, 1], [14, 8, 0]];
    for (const [x, h, lean] of blades) for (let y = 0; y < h; y++) { const k = y / h; const xx = x + (k > .6 ? lean : 0) + (k > .85 ? lean : 0); px(g, cols[Math.min(4, (k * 5) | 0)], clamp(xx, 0, 15), 15 - y); if (y < 3) px(g, '#22481a', clamp(xx + 1, 0, 15), 15 - y); }
  }));
  MAT.tuft = patch(new THREE.MeshLambertMaterial({ map: tuft, alphaTest: 0.5, side: THREE.DoubleSide }), { wind: true });
  const a = new THREE.PlaneGeometry(0.85, 0.85); a.translate(0, 0.4, 0); const b = a.clone().rotateY(Math.PI / 2.4), c2 = a.clone().rotateY(-Math.PI / 2.4);
  GEO.tuft = mergeGeos([a, b, c2]);
  const side = ntex(TILE.cliffSide), top = ntex(TILE.grass[1]);
  MAT.cliff = [side, side, top, top, side, side].map(m => patch(new THREE.MeshLambertMaterial({ map: m })));
  GEO.cliff = new THREE.BoxGeometry(1, 2.4, 1); GEO.cliff.translate(0, 1.2, 0);
  for (const n of ['oak', 'pine']) { const img = ART['tree_' + n], t = ntex(img); MAT[n] = patch(new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }));
    MAT[n + 'D'] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: 0.5 }); GEO[n + 'Aspect'] = img.width / img.height; }
  const sprite = (name, w, h, draw) => { const t = ntex(cv(w, h, draw)); MAT[name] = patch(new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })); MAT[name + 'D'] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: t, alphaTest: .5 }); GEO[name] = [w, h]; };
  sprite('bush', 20, 14, g => { const r = rng(8); for (let i = 0; i < 70; i++) { const a = r() * 6.28, d = Math.sqrt(r()); const x = 10 + Math.cos(a) * d * 9, y = 8 + Math.sin(a) * d * 5.5; px(g, y < 7 ? '#6cb446' : y < 10 ? '#4f9032' : '#356b24', x | 0, y | 0, 2, 2); }
    px(g, '#ff7a8a', 6, 5); px(g, '#ff7a8a', 13, 7); px(g, '#fff', 10, 4); });
  sprite('rock', 16, 12, g => { px(g, '#7d7468', 2, 4, 12, 7); px(g, '#968c7e', 3, 2, 10, 4); px(g, '#b5ab9b', 4, 2, 5, 2); px(g, '#5c544a', 2, 10, 12, 2); px(g, '#4f9032', 1, 11, 3, 1); px(g, '#4f9032', 12, 11, 3, 1); });
  sprite('stump', 14, 12, g => { px(g, '#7a4a24', 2, 4, 10, 7); px(g, '#c8925a', 2, 2, 10, 3); px(g, '#a8743e', 4, 3, 6, 1); px(g, '#5a3618', 2, 10, 10, 2); px(g, '#4f9032', 0, 11, 3, 1); });
  sprite('lamp', 8, 28, g => { px(g, '#6a5a6a', 3, 6, 2, 22); px(g, '#8a7a8a', 3, 6, 1, 22); px(g, '#5a4a5a', 1, 26, 6, 2); px(g, '#5a4a5a', 1, 0, 6, 7); px(g, '#ffe7a0', 2, 1, 4, 5); px(g, '#fff8e0', 3, 2, 2, 2); });
  sprite('sign', 16, 18, g => { px(g, '#6b4226', 7, 8, 2, 10); px(g, '#b8783a', 1, 1, 14, 8); px(g, '#8a5a2a', 1, 8, 14, 1); px(g, '#5a3618', 3, 3, 10, 1); px(g, '#5a3618', 3, 5, 7, 1); });
  sprite('fence', 16, 12, g => { px(g, '#a8743e', 0, 3, 16, 2); px(g, '#a8743e', 0, 7, 16, 2); px(g, '#8a5a2a', 2, 1, 3, 11); px(g, '#8a5a2a', 11, 1, 3, 11); px(g, '#c8925a', 2, 1, 3, 1); px(g, '#c8925a', 11, 1, 3, 1); });
  sprite('nest', 32, 16, g => { const r = rng(5); for (let i = 0; i < 200; i++) { const a = r() * 6.28, d = .55 + r() * .45; const x = 16 + Math.cos(a) * d * 15, y = 9 + Math.sin(a) * d * 6; px(g, ['#c8925a', '#a8743e', '#e0b070', '#7a4a24'][(r() * 4) | 0], x | 0, y | 0, 2, 1); }
    px(g, '#5a3a20', 6, 7, 20, 3); });
  MAT.lampGlow = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .55 });
  MAT.roofR = patch(new THREE.MeshLambertMaterial({ map: roofTex(true), side: THREE.DoubleSide })); MAT.roofB = patch(new THREE.MeshLambertMaterial({ map: roofTex(false), side: THREE.DoubleSide }));
  MAT.side = patch(new THREE.MeshLambertMaterial({ map: ntex(TILE.earthSide, true), vertexColors: true, side: THREE.DoubleSide }));
  MAT.foam = new THREE.MeshBasicMaterial({ color: 0xe8f4ee, transparent: true, opacity: .55, depthWrite: false });
  for (const k of ['stone', 'bark', 'crate', 'canvas']) MAT[k] = patch(new THREE.MeshLambertMaterial({ map: ntex(TILE[k], true), flatShading: true }));
  MAT.flame = new THREE.SpriteMaterial({ map: ntex(cv(8, 12, g => { const S = ['...yy...', '..yyy...', '..ywy...', '.yywwy..', '.ywwwyy.', 'yywwwwyo', 'oywwwwyo', 'oyywwyyo', 'ooyyyyoo', '.ooyyoo.', '..oooo..', '........'];
    S.forEach((r, y) => [...r].forEach((c, x) => c !== '.' && px(g, { y: '#ffb02e', w: '#fff3b0', o: '#e8551e' }[c], x, y))); })), color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  MAT.circle = new THREE.MeshBasicMaterial({ map: ntex(cv(48, 48, g => { for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const d = Math.hypot(x - 23.5, y - 23.5), a = Math.atan2(y - 23.5, x - 23.5);
    if ((d > 21 && d < 23) || (d > 15 && d < 16.2) || (d < 15 && d > 8 && Math.abs(((a / 6.283 * 6 + 1) % 1) - .5) < .04) || (d > 16.5 && d < 20.5 && (Math.floor(a / 6.283 * 24 + 24) % 3 === 0) && hash(x, y, 71) < .7)) px(g, d > 21 ? '#bff6ff' : '#7ee8ff', x, y); } })),
    color: 0x9ff2ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .85 });
}
let _glow; function glowTex() { if (_glow) return _glow; const c = cv(32, 32, g => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, '#fff8'); gr.addColorStop(1, '#fff0'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  _glow = new THREE.CanvasTexture(c); return _glow; }
function mergeGeos(list) {
  const g = new THREE.BufferGeometry(); const idx = []; let off = 0; const attrs = { position: [], normal: [], uv: [] };
  for (const a of list) { for (const k in attrs) attrs[k].push(...a.attributes[k].array); idx.push(...Array.from(a.index.array, i => i + off)); off += a.attributes.position.count; }
  for (const k in attrs) g.setAttribute(k, new THREE.Float32BufferAttribute(attrs[k], k === 'uv' ? 2 : 3)); g.setIndex(idx); return g;
}

// ---------- chunk streaming ----------
// v8 voxel terrain: one top quad per land tile at its step height (vertex AO at the foot of higher blocks)
// and earth side walls wherever a neighbour is lower (AO gradient to the bottom). One draw call each per chunk.
const tileH = (x, z) => tileAt(x, z) === T_WATER ? BED_Y : hAt(x, z) * STEP;
function geoFrom(pos, nor, uv, col, idx) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g; }
function terrainTop(x0, z0) { const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) { const X = x0 + tx, Z = z0 + tz; if (tileAt(X, Z) === T_WATER) continue; const h = tileH(X, Z), n = pos.length / 3;
    for (const [dx, dz] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push(X + dx, h, Z + dz); nor.push(0, 1, 0); uv.push((tx + dx) / CH, 1 - (tz + dz) / CH);
      let ao = 1; for (const [ax, az] of [[dx - 1, dz - 1], [dx, dz - 1], [dx - 1, dz], [dx, dz]]) if (tileAt(X + ax, Z + az) !== T_WATER && tileH(X + ax, Z + az) > h + .01) ao = .66;
      const warm = .97 + hash(X, Z, 13) * .06; col.push(ao * warm, ao * warm, ao * (warm - .02)); }
    idx.push(n, n + 3, n + 2, n, n + 2, n + 1); }
  return geoFrom(pos, nor, uv, col, idx); }
function terrainSides(x0, z0) { const pos = [], nor = [], uv = [], col = [], idx = [];
  for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) { const X = x0 + tx, Z = z0 + tz; if (tileAt(X, Z) === T_WATER) continue; const h = tileH(X, Z);
    for (const [nx, nz, ax, az, bx, bz] of [[0, -1, 1, 0, 0, 0], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0]]) {
      const lo = tileH(X + nx, Z + nz); if (lo >= h - .01) continue; const n = pos.length / 3;
      const pts = [[X + ax, h, Z + az], [X + bx, h, Z + bz], [X + bx, lo, Z + bz], [X + ax, lo, Z + az]];
      pts.forEach(([px_, py, pz], i) => { pos.push(px_, py, pz); nor.push(nx, 0, nz); const along = nx ? pz : px_; uv.push(along * (nx ? -nx : nz), (h > .01 ? 1 : .75) + (py - h));
        const k = i < 2 ? 1 : .5; col.push(k, k * .97, k * .95); });
      idx.push(n, n + 3, n + 2, n, n + 2, n + 1); } }
  return geoFrom(pos, nor, uv, col, idx); }
const chunks = new Map(); const buildQueue = [];
function billboardMesh(mat, depth, w, h, x, z, y = 0) {
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2 - 0.04, 0);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (depth) m.customDepthMaterial = depth; return m;
}
function buildChunk(cx, cz) {
  const grp = new THREE.Group(); grp.name = 'chunk' + cx + ',' + cz;
  const x0 = cx * CH, z0 = cz * CH;
  // ground texture: tiles + soft grass fringes over paths
  const c = cv(CH * 16, CH * 16, g => {
    for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) { const X = x0 + tx, Z = z0 + tz, t = tileAt(X, Z); if (t === T_WATER) continue;
      const name = TILE_NAME[t]; const v = (hash(X, Z, 2) * 4) | 0; g.drawImage(TILE[name][v], tx * 16, tz * 16); }
    for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) { const X = x0 + tx, Z = z0 + tz, t = tileAt(X, Z); if (t === T_GRASS || t === T_FLOWER || t === T_WATER || t === T_CLIFF) continue;
      const isG = (a, b) => { const n = tileAt(a, b); return n === T_GRASS || n === T_FLOWER || n === T_CLIFF; };
      const ox = tx * 16, oz = tz * 16;
      for (let i = 0; i < 16; i++) {
        const r1 = hash(X * 16 + i, Z, 5), r2 = hash(X * 16 + i, Z, 6);
        if (isG(X, Z - 1)) { const d = r1 < .5 ? 1 : r1 < .85 ? 2 : 3; px(g, '#62a83c', ox + i, oz, 1, d); px(g, '#3c6e2a', ox + i, oz + d, 1, 1); }
        if (isG(X, Z + 1)) { const d = r2 < .6 ? 1 : 2; px(g, '#62a83c', ox + i, oz + 16 - d, 1, d); }
        if (isG(X - 1, Z)) { const d = r1 < .5 ? 1 : 2; px(g, '#62a83c', ox, oz + i, d, 1); px(g, '#4f9032', ox + d, oz + i, 1, 1); }
        if (isG(X + 1, Z)) { const d = r2 < .5 ? 1 : 2; px(g, '#62a83c', ox + 16 - d, oz + i, d, 1); }
      } }
  });
  const gt = ntex(c); const gm = patch(new THREE.MeshLambertMaterial({ map: gt, alphaTest: 0.5, vertexColors: true }));
  const ground = new THREE.Mesh(terrainTop(x0, z0), gm); ground.receiveShadow = true; grp.add(ground);
  const sides = new THREE.Mesh(terrainSides(x0, z0), MAT.side); sides.receiveShadow = true; sides.castShadow = true; grp.add(sides);
  // instanced grass tufts (chunky cross planes) and cliff blocks
  const tufts = [], cliffs = [];
  for (let tz = 0; tz < CH; tz++) for (let tx = 0; tx < CH; tx++) { const X = x0 + tx, Z = z0 + tz, t = tileAt(X, Z);
    if (t === T_CLIFF) cliffs.push([X + .5, Z + .5]);
    else if (t === T_GRASS || t === T_FLOWER) { const n = hash(X, Z, 7) < .55 ? (hash(X, Z, 8) < .4 ? 2 : 1) : 0; for (let i = 0; i < n; i++) tufts.push([X + hash(X, Z, 10 + i), Z + hash(X, Z, 20 + i), .7 + hash(X, Z, 30 + i) * .7, hash(X, Z, 40 + i) * 3]); } }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  if (tufts.length) { const im = new THREE.InstancedMesh(GEO.tuft, MAT.tuft, tufts.length); tufts.forEach(([x, z, sc, r], i) => im.setMatrixAt(i, m4.compose(v.set(x, gy(x, z), z), q.setFromAxisAngle(up, r), s.set(sc, sc * (0.8 + (sc - .7) * .5), sc))));
    im.receiveShadow = true; im.castShadow = !LOW; grp.add(im); }
  if (cliffs.length) { const im = new THREE.InstancedMesh(GEO.cliff, MAT.cliff, cliffs.length); cliffs.forEach(([x, z], i) => im.setMatrixAt(i, m4.compose(v.set(x, 0, z), q.identity(), s.set(1, 1 + hash(x | 0, z | 0, 3) * .25, 1))));
    im.castShadow = im.receiveShadow = true; grp.add(im); }
  for (const p of PROPS.get(ck(cx, cz)) || []) { const m = buildProp(p); if (p.type !== 'boat' && p.type !== 'steprock') m.position.y += gy(p.x, p.z); grp.add(m); }
  scene.add(grp); G.chunksBuilt++;
  return { grp, gt };
}
const FIRES = [], CIRCLES = [];
function mesh3(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }
function rockGeo(seed, s = 1) { const g = new THREE.IcosahedronGeometry(.5, 0); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = .8 + hash(Math.round(p.getX(i) * 9), Math.round(p.getZ(i) * 9) + seed, 3) * .4; p.setXYZ(i, p.getX(i) * k * s, Math.max(-.1, p.getY(i)) * .7 * k * s, p.getZ(i) * k * s); }
  g.computeVertexNormals(); return g; }
function buildProp3D(p) {
  const grp = new THREE.Group(); grp.position.set(p.x, 0, p.z);
  if (p.type === 'rock') grp.add(mesh3(rockGeo(p.x | 0, .9), MAT.stone, 0, .1, 0));
  else if (p.type === 'steprock') { const m = mesh3(rockGeo((p.x * 7) | 0, p.s * 1.2), MAT.stone, 0, WATER_Y - .02, 0); m.scale.y = .32; grp.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(p.s * .5, p.s * .6, 9).rotateX(-Math.PI / 2), MAT.foam); ring.position.y = WATER_Y + .01; grp.add(ring); }
  else if (p.type === 'stump') { grp.add(mesh3(new THREE.CylinderGeometry(.32, .38, .45, 7), MAT.bark, 0, .22, 0)); }
  else if (p.type === 'log') { const m = mesh3(new THREE.CylinderGeometry(.2, .2, 1.5, 7), MAT.bark, 0, .2, 0); m.rotation.z = Math.PI / 2; grp.rotation.y = p.r; grp.add(m); }
  else if (p.type === 'crate') { const m = mesh3(new THREE.BoxGeometry(p.s, p.s, p.s), MAT.crate, 0, p.s / 2, 0); m.rotation.y = hash(p.x | 0, p.z | 0) * .6; grp.add(m); }
  else if (p.type === 'barrel') { grp.add(mesh3(new THREE.CylinderGeometry(.28, .28, .7, 8), MAT.crate, 0, .35, 0)); }
  else if (p.type === 'tent') { const m = mesh3(new THREE.ConeGeometry(1.3, 1.8, 4), MAT.canvas, 0, .9, 0); m.rotation.y = Math.PI / 4; grp.add(m);
    const door = mesh3(new THREE.PlaneGeometry(.5, .8), new THREE.MeshBasicMaterial({ color: 0x3a2618 }), 0, .4, .93); door.castShadow = false; grp.add(door); }
  else if (p.type === 'boat') { const sh = new THREE.Shape(); sh.moveTo(0, -1); sh.quadraticCurveTo(.5, -.4, .45, .8); sh.lineTo(-.45, .8); sh.quadraticCurveTo(-.5, -.4, 0, -1);
    const hull = mesh3(new THREE.ExtrudeGeometry(sh, { depth: .3, bevelEnabled: false }).rotateX(Math.PI / 2), MAT.crate, 0, WATER_Y + .2, 0); grp.add(hull);
    const inner = mesh3(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4a2c16 }), 0, WATER_Y + .12, 0); inner.scale.set(.82, 1, .85); grp.add(inner);
    grp.add(mesh3(new THREE.BoxGeometry(.85, .06, .2), MAT.crate, 0, WATER_Y + .16, .1)); grp.rotation.y = .5; }
  else if (p.type === 'fire') { for (let i = 0; i < 6; i++) { const s = mesh3(new THREE.DodecahedronGeometry(.16, 0), MAT.stone, Math.cos(i) * .4, .06, Math.sin(i) * .4); grp.add(s); }
    for (let i = 0; i < 3; i++) { const l = mesh3(new THREE.CylinderGeometry(.06, .06, .6, 5), MAT.bark, 0, .12, 0); l.rotation.set(Math.PI / 2.4, i * 2.1, 0); grp.add(l); }
    const fl = new THREE.Sprite(MAT.flame); fl.scale.set(.55, .8, 1); fl.position.y = .45; grp.add(fl);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .8 })); gl.scale.set(2.6, 2.6, 1); gl.position.y = .5; grp.add(gl);
    FIRES.push({ fl, gl }); }
  else if (p.type === 'circle') { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), MAT.circle); m.position.y = .03; m.renderOrder = 2; grp.add(m);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x6fe0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .35 })); gl.scale.set(4, 2, 1); gl.position.y = .4; grp.add(gl); CIRCLES.push(m); }
  else if (p.type === 'fence') { for (const x of [-.4, .4]) grp.add(mesh3(new THREE.BoxGeometry(.12, .7, .12), MAT.crate, x, .35, 0)); for (const y of [.25, .5]) grp.add(mesh3(new THREE.BoxGeometry(1, .08, .06), MAT.crate, 0, y, 0)); }
  return grp; }
function buildProp(p) {
  if (['rock', 'steprock', 'stump', 'log', 'crate', 'barrel', 'tent', 'boat', 'fire', 'circle', 'fence'].includes(p.type)) return buildProp3D(p);
  if (p.type === 'oak' || p.type === 'pine') { const h = p.s, w = h * GEO[p.type + 'Aspect']; return billboardMesh(MAT[p.type], MAT[p.type + 'D'], w, h, p.x, p.z); }
  if (p.type === 'house') return buildHouse(p);
  if (p.type === 'npc') { const m = spriteMesh(SHEETS.elder, 16); m.position.set(p.x, 0, p.z); m.userData.npc = true; NPC.mesh = m; return m; }
  const sz = { bush: 1.3, rock: 1, stump: .9, lamp: 1.5, sign: 1.1, fence: 1, nest: p.big ? 3.2 : 2 }[p.type];
  const [w, h] = GEO[p.type]; const m = billboardMesh(MAT[p.type], MAT[p.type + 'D'], sz, sz * h / w, p.x, p.z);
  if (p.type === 'lamp') { const gl = new THREE.Sprite(MAT.lampGlow); gl.scale.set(1.6, 1.6, 1); gl.position.y = 1.4; m.add(gl); }
  if (p.type === 'nest') m.position.y = -0.1;
  return m;
}
function buildHouse({ x, z, w, d, scheme }) {
  const grp = new THREE.Group(); grp.position.set(x, 0, z); const H = 2;
  const fm = patch(new THREE.MeshLambertMaterial({ map: houseTex(w, 2, true) })), sm = patch(new THREE.MeshLambertMaterial({ map: houseTex(d, 2, false) }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), [sm, sm, fm, fm, fm, fm]); body.position.y = H / 2; body.castShadow = body.receiveShadow = true; grp.add(body);
  const rm = scheme === 'red' ? MAT.roofR : MAT.roofB; const rhd = d / 2 + .35, rise = 1.5, ang = Math.atan2(rise, rhd), L = Math.hypot(rhd, rise);
  for (const sg of [-1, 1]) { const geo = new THREE.BoxGeometry(w + .7, .16, L); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w + .7), uv.getY(i) * L);
    rm.map.repeat.set(1, 1); const p = new THREE.Mesh(geo, rm); p.position.set(0, H + rise / 2, sg * rhd / 2); p.rotation.x = sg * ang; p.castShadow = p.receiveShadow = true; grp.add(p); }
  const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const gmat = patch(new THREE.MeshLambertMaterial({ color: 0xe8d8b4, side: THREE.DoubleSide }));
  for (const sg of [-1, 1]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), gmat); gm.rotation.y = Math.PI / 2; gm.position.set(sg * w / 2, H, 0); gm.castShadow = true; grp.add(gm); }
  const ch = new THREE.Mesh(new THREE.BoxGeometry(.5, 1, .5), patch(new THREE.MeshLambertMaterial({ color: 0x8a5a3a }))); ch.position.set(w / 2 - .8, H + 1.4, -.3); ch.castShadow = true; grp.add(ch);
  return grp;
}
function streamChunks(px_, pz_, force = false) {
  const hx = Math.floor(px_ / CH), hz = Math.floor(pz_ / CH), R = LOW ? 2 : 2;
  const want = new Set();
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { const cx = hx + dx, cz = hz + dz; if (cx < 0 || cz < 0 || cx * CH >= MW || cz * CH >= MH) continue; want.add(ck(cx, cz)); if (!chunks.has(ck(cx, cz)) && !buildQueue.includes(ck(cx, cz))) buildQueue.push(ck(cx, cz)); }
  buildQueue.sort((a, b) => { const [ax, az] = a.split(',').map(Number), [bx, bz] = b.split(',').map(Number); return Math.hypot(ax - hx, az - hz) - Math.hypot(bx - hx, bz - hz); });
  let n = force ? 99 : 1; while (n-- > 0 && buildQueue.length) { const k = buildQueue.shift(); if (chunks.has(k)) continue; const [cx, cz] = k.split(',').map(Number); chunks.set(k, buildChunk(cx, cz)); }
  for (const [k, c] of chunks) { const [cx, cz] = k.split(',').map(Number); if (Math.abs(cx - hx) > R + 1 || Math.abs(cz - hz) > R + 1) { disposeChunk(c); chunks.delete(k); } }
  G.chunksLoaded = chunks.size;
}
function disposeChunk(c) { scene.remove(c.grp); c.grp.traverse(o => { if (o.isMesh && o.geometry !== GEO.tuft && o.geometry !== GEO.cliff) o.geometry.dispose(); if (o.isMesh && !Array.isArray(o.material) && o.material.map === c.gt) o.material.dispose(); }); c.gt.dispose(); }

// ---------- water (one moving pixel-water plane under the ground holes) + cloud-free sky motes ----------
let water;
function makeWater() { // v8 toon water: flat teal, shore foam from a land-distance field, pixel ripples, sky glints
  const D = new Uint8Array(MW * MH * 4), dist = new Float32Array(MW * MH).fill(9), q = [];
  for (let z = 0; z < MH; z++) for (let x = 0; x < MW; x++) if (MAP[z * MW + x] !== T_WATER) { dist[z * MW + x] = 0; q.push(x, z); }
  for (let k = 0; k < q.length; k += 2) { const x = q[k], z = q[k + 1], d = dist[z * MW + x]; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= MW || Z >= MH) continue; if (dist[Z * MW + X] > d + 1) { dist[Z * MW + X] = d + 1; q.push(X, Z); } } }
  for (let i = 0; i < MW * MH; i++) { D[i * 4] = Math.min(255, dist[i] * 50); D[i * 4 + 3] = 255; }
  const dt = new THREE.DataTexture(D, MW, MH); dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({ fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 }, dist: { value: null }, sz: { value: new THREE.Vector2(MW, MH) } }]),
    vertexShader: `varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float t; uniform sampler2D dist; uniform vec2 sz; varying vec3 vW;\n#include <fog_pars_fragment>
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
      void main(){ vec2 p = floor(vW.xz*16.)/16.; float d = texture2D(dist, p/sz).r*255./50.;
      vec3 deep = vec3(.16,.36,.37), shal = vec3(.27,.52,.50); vec3 c = mix(shal, deep, smoothstep(.6, 2.6, d));
      float r = vn(p*vec2(1.2,3.) + vec2(t*.25, t*.6)); float r2 = vn(p*vec2(2.5,5.) - vec2(t*.4, t*.9));
      if (r > .72 && r2 > .5) c = mix(c, vec3(.6,.8,.76), .45); else if (r < .2) c *= .93;
      float sky = vn(p*.35 + vec2(t*.05, 0.)); c += vec3(.08,.07,.03)*step(.7, sky);
      float fo = .64 + .14*sin(t*1.6 + vW.x*1.3 + vW.z*.9) + (vn(p*4. + t*.3) - .5)*.25;
      if (d < fo) c = vec3(.92,.97,.93); else if (d < fo + .14) c = mix(c, vec3(.92,.97,.93), .45);
      gl_FragColor = vec4(pow(c, vec3(2.2)),1.);\n#include <fog_fragment>\n}` });
  mat.uniforms.dist.value = dt;
  water = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), mat); water.position.y = WATER_Y; scene.add(water);
}
let motes;
function makeMotes() {
  const N = LOW ? 70 : 160, pos = new Float32Array(N * 3), ph = new Float32Array(N); const r = rng(9);
  for (let i = 0; i < N; i++) { pos[i * 3] = r() * 40; pos[i * 3 + 1] = 0.3 + r() * 4.5; pos[i * 3 + 2] = r() * 40; ph[i] = r() * 6.28; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, s: { value: renderer.getPixelRatio() * innerHeight / 720 }, c: { value: new THREE.Vector3() } },
    vertexShader: `attribute float ph; uniform float t; uniform float s; uniform vec3 c; varying float a;
      void main(){ vec3 p = position + vec3(sin(t*.35+ph)*1.2, sin(t*.6+ph*2.)*.5, cos(t*.27+ph)*1.2 + t*.15);
      p.xz = c.xz + mod(p.xz - c.xz + 20., 40.) - 20.; a = .45 + .55*sin(t*1.7+ph*3.);
      vec4 mv = modelViewMatrix*vec4(p,1.); gl_PointSize = s*(ph>3.?70.:44.)/-mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float a; void main(){ vec2 q = floor(gl_PointCoord*5.)/5.-.4; float d = length(q); if (d>.42) discard; gl_FragColor = vec4(vec3(1.,.9,.6)*2.,a*(1.-d*2.2)); }` });
  motes = new THREE.Points(g, mat); motes.frustumCulled = false; scene.add(motes);
}

// ---------- sprites ----------
const SHEETS = {}; let ANIM;
const DR = (c, f) => [((f % ANIM.dragon[c][1]) + ANIM.dragon[c][1]) % ANIM.dragon[c][1], ANIM.dragon[c][0]]; // dragon clip -> [col,row]
const MR = (c, f, hold) => [hold ? Math.min(f, ANIM.mon[c][1] - 1) : f % ANIM.mon[c][1], ANIM.mon[c][0]];
const PPU = 24;
function sheet(img, fw, fh) { return { img, fw, fh, cols: Math.round(img.width / fw), rows: Math.round(img.height / fh) }; }
function spriteMesh(sh, ppu = PPU, light = 0.3, pad = 2) {
  const tex = ntex(new THREE.Texture(sh.img)); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1 / sh.cols, 1 / sh.rows); tex.offset.set(0, 1 - 1 / sh.rows);
  const geo = new THREE.PlaneGeometry(sh.fw / ppu, sh.fh / ppu); geo.translate(0, sh.fh / (2 * ppu) - pad / ppu, 0);
  const m = new THREE.Mesh(geo, patch(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: light })));
  m.castShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  m.userData.sheet = sh; return m;
}
function setFrame(m, col, row, flip = false) { const sh = m.userData.sheet, t = m.material.map;
  t.repeat.x = (flip ? -1 : 1) / sh.cols; t.offset.x = (col + (flip ? 1 : 0)) / sh.cols; t.offset.y = 1 - (row + 1) / sh.rows; }
function artMesh(img, h) { // AI-generated art as a billboard (monsters), nearest-filtered
  const tex = ntex(new THREE.Texture(img)); tex.wrapS = THREE.RepeatWrapping; const w = h * img.width / img.height;
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2 - .05, 0);
  const m = new THREE.Mesh(geo, patch(new THREE.MeshLambertMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .3, transparent: false })));
  m.castShadow = true; m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: .5 }); return m;
}
let BLOB;
function blob(w = 1.2) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * .55).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false, opacity: .8 })); m.position.y = .02; m.renderOrder = 1; scene.add(m); return m; }
function starRow(n, max) { // status stars over the hero's head (like the reference)
  const c = cv(max * 9 + 1, 9, g => { const S = ['....o....', '...oyo...', 'oooyyyooo', 'oyyyyyyyo', '.oyyyyyo.', '..oyyyo..', '.oyyoyyo.', 'oyyo.oyyo', 'ooo...ooo'];
    for (let i = 0; i < max; i++) S.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; px(g, ch === 'o' ? '#3a2410' : i < n ? (y < 3 ? '#fff6b0' : '#ffd23a') : '#6a6a7a', i * 9 + x, y); })); });
  return c;
}
function eggCanvas(clan) { const C = CLANS[clan]; return cv(14, 17, g => { const sh = ['....oooo....', '...oBBBBo...', '..oBWBBBBo..', '.oBWBBBBBBo.', '.oBBBBSBBBo.', 'oBBBBSSSBBBo', 'oBSBBBSBBBBo', 'oBSSBBBBBSBo', 'oBBBBBBBSSBo', 'oBBBBBBBBBBo', 'oDBBBSBBBBDo', '.oDBBSSBBDo.', '..oDDDDDDo..', '...oooooo...'];
  sh.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '.') return; px(g, { o: '#2a1a2e', B: C.belly, W: '#ffffff', S: C.body, D: shade(C.belly, -40) }[ch], x + 1, y + 2); })); }); }

// ---------- audio (procedural WebAudio, original) ----------
let actx, master, muted = LS.getItem('ds_muted') === '1', musicOn = false;
function audio() { if (actx) return; try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } master = actx.createGain(); master.gain.value = muted ? 0 : .5; master.connect(actx.destination); startMusic(); }
function tone(f, t0, dur, type = 'triangle', vol = .15, f2) { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + .01); g.gain.exponentialRampToValueAtTime(.001, t0 + dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + .05); }
function noise(t0, dur, vol, freq) { const b = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol; s.buffer = b; s.connect(f); f.connect(g); g.connect(master); s.start(t0); }
function sfx(n) { if (!actx) return; const t = actx.currentTime;
  ({ slash: () => { noise(t, .12, .12, 4000); tone(900, t, .1, 'sine', .04, 300); }, hit: () => { noise(t, .1, .25, 1800); tone(180, t, .12, 'square', .08, 60); },
    hurt: () => { tone(400, t, .2, 'square', .06, 120); }, roll: () => noise(t, .2, .08, 700), step: () => noise(t, .04, .02, 900),
    right: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .07, .25, 'square', .07)), wrong: () => [330, 262].forEach((f, i) => tone(f, t + i * .12, .25, 'triangle', .07)),
    shatter: () => { noise(t, .5, .2, 3000); [2637, 2349, 1976, 1760].forEach((f, i) => tone(f, t + i * .04, .2, 'triangle', .05)); }, gem: () => [1319, 1568, 2093].forEach((f, i) => tone(f, t + i * .05, .3, 'sine', .08)),
    focus: () => tone(500, t, .35, 'sawtooth', .04, 1400), pickup: () => [784, 988, 1319].forEach((f, i) => tone(f, t + i * .06, .2, 'square', .05)),
    hatch: () => [392, 523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, t + i * .1, .5, 'sine', .07)), heart: () => [988, 1319].forEach((f, i) => tone(f, t + i * .08, .25, 'sine', .07)),
    cursor: () => tone(1560, t, .04, 'square', .03), select: () => { tone(1046, t, .06, 'square', .04); tone(1568, t + .05, .08, 'square', .04); }, cancel: () => tone(523, t, .08, 'square', .04),
    blip: () => tone(1180 + Math.random() * 60, t, .035, 'square', .018), open: () => [659, 988].forEach((f, i) => tone(f, t + i * .05, .12, 'triangle', .07)), buzz: () => tone(140, t, .12, 'sawtooth', .05),
    tele: () => tone(220, t, .3, 'triangle', .05, 440) }[n] || (() => {}))(); }
function startMusic() { if (musicOn) return; musicOn = true; const sc = [262, 294, 330, 392, 440, 523, 587, 659], bass = [131, 110, 147, 98]; let st = 0;
  setInterval(() => { if (!actx || muted) return; const t = actx.currentTime + .05, bar = Math.floor(st / 8) % 4; if (st % 8 === 0) tone(bass[bar], t, 1.6, 'triangle', .06);
    if (st % 2 === 0 || Math.random() < .3) tone(sc[(bar * 2 + [0, 2, 4, 2, 5, 4, 2, 1][st % 8]) % 8], t, .4, 'triangle', .03); st++; }, 280); }
const toggleMute = () => { muted = !muted; LS.setItem('ds_muted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; audio(); if (master) master.gain.value = muted ? 0 : .5; };
$('muteBtn').textContent = muted ? '🔇' : '🔊'; $('muteBtn').onclick = toggleMute;
addEventListener('pointerdown', audio, { once: true }); addEventListener('keydown', audio, { once: true });

// ---------- post processing: bloom, tilt-shift top+bottom, vignette ----------
let composer, tilts = [];
// v12: tilt-shift with a flat in-focus band (half-height `band`) whose centre `r` follows the hero on screen, so characters stay crisp
function bandTilt(S) { const u = THREE.UniformsUtils.clone(S.uniforms); u.band = { value: .17 };
  const fs = S.fragmentShader.replace('uniform float r;', 'uniform float r; uniform float band;').replace(/abs\( r - vUv\.y \)/, 'max( abs( r - vUv.y ) - band, 0.0 ) * 1.6');
  if (fs === S.fragmentShader) throw new Error('tilt patch failed'); return { name: S.name + 'Band', uniforms: u, vertexShader: S.vertexShader, fragmentShader: fs }; }
const _fv = new THREE.Vector3();
function focusOnHero() { if (!tilts.length || !hero) return; _fv.set(H.x, (H.y || 0) + .9, H.z).project(camera); const r = Math.min(.85, Math.max(.15, _fv.y * .5 + .5));
  for (const [hp, vp] of tilts) hp.uniforms.r.value = vp.uniforms.r.value = r;
  // keep the gold star row over the hero's head inside the screen
  if (heroStars) { heroStars.position.y = 2.75; heroStars.getWorldPosition(_fv); _fv.project(camera); if (_fv.y > .86) heroStars.position.y = Math.max(1.9, 2.75 - (_fv.y - .86) * CAM.dist * .3); } }
function setupPost() {
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  if (!LOW) composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .35, .45, .86));
  const passes = LOW ? 1 : 2;
  for (let i = 0; i < passes; i++) { const h = new ShaderPass(bandTilt(HorizontalTiltShiftShader)), v = new ShaderPass(bandTilt(VerticalTiltShiftShader)); h.uniforms.r.value = v.uniforms.r.value = .5; composer.addPass(h); composer.addPass(v); tilts.push([h, v, i + 1]); }
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, // warm LUT-like grade: lifted warm shadows, teal-ish mids kept, gentle saturation
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 x = c.rgb; float l = dot(x, vec3(.299,.587,.114));
      x = mix(vec3(l), x, 1.08); x *= vec3(1.08, .99, .86); x += vec3(.018,.012,.0)*(1.-l); x = mix(x, x*vec3(.92,1.0,1.06), smoothstep(.35,0.,l)*.5); gl_FragColor = vec4(x, c.a); }` }));
  const vig = new ShaderPass(VignetteShader); vig.uniforms.offset.value = .95; vig.uniforms.darkness.value = 1.1; composer.addPass(vig);
  composer.addPass(new OutputPass());
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  const small = Math.min(w, h) < 520; CAM.dist = w < h ? (small ? 22 : 24) : (small ? 21 : 24); // v12: hero ~1/6 of screen height (reference framing) camera.updateProjectionMatrix(); // small screens: zoom in a bit
  document.body.classList.toggle('portrait', w < h); document.body.classList.toggle('smallscr', small);
  if (composer) { composer.setSize(w, h); const pr = renderer.getPixelRatio(); for (const [hp, vp, k] of tilts) { hp.uniforms.h.value = 1.5 * k / (w * pr); vp.uniforms.v.value = 1.5 * k / (h * pr); } } }
addEventListener('resize', resize);

// ---------- input ----------
const keys = {}; let joy = { x: 0, y: 0 };
const pressed = new Set();
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (!keys[e.code]) pressed.add(e.code); keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && G.mode === 'play') e.preventDefault(); });
addEventListener('keyup', e => keys[e.code] = false);
// v9 floating joystick: appears wherever the thumb lands on the left half (#joyZone), base follows if dragged far
const joyEl = $('joy'), knob = $('knob'), joyZone = $('joyZone'); let joyId = null, joyO = { x: 0, y: 0 };
const placeJoy = (x, y) => { joyO = { x, y }; joyEl.style.left = x - 65 + 'px'; joyEl.style.top = y - 65 + 'px'; joyEl.style.bottom = 'auto'; };
joyZone.addEventListener('pointerdown', e => { if (G.mode !== 'play') return; e.preventDefault(); joyId = e.pointerId; joyZone.setPointerCapture(e.pointerId); placeJoy(e.clientX, e.clientY); joyEl.classList.add('live'); moveJoy(e); });
joyZone.addEventListener('pointermove', e => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = () => { joyId = null; joy = { x: 0, y: 0 }; knob.style.left = knob.style.top = '40px'; joyEl.classList.remove('live'); };
joyZone.addEventListener('pointerup', endJoy); joyZone.addEventListener('pointercancel', endJoy);
function moveJoy(e) { let dx = e.clientX - joyO.x, dy = e.clientY - joyO.y; const d = Math.hypot(dx, dy);
  if (d > 80) { placeJoy(joyO.x + dx * (1 - 80 / d), joyO.y + dy * (1 - 80 / d)); dx = e.clientX - joyO.x; dy = e.clientY - joyO.y; }
  let x = dx / 50, y = dy / 50; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy = { x, y }; knob.style.left = 40 + x * 45 + 'px'; knob.style.top = 40 + y * 45 + 'px'; }
// no pinch / double-tap zoom / page scroll
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (!e.target.closest('#mmPane,.scroll')) e.preventDefault(); }, { passive: false });
for (const [id, code] of [['bAtk', 'KeyJ'], ['bRoll', 'KeyK'], ['bAct', 'KeyE'], ['bRide', 'KeyR']]) $(id).addEventListener('pointerdown', e => { e.preventDefault(); pressed.add(code); });
$('menuBtn').onclick = () => openMenu();
document.querySelectorAll('#hotbar [data-k]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (b.dataset.k === 'Escape') openMenu(); else pressed.add(b.dataset.k); }));

// ---------- hero ----------
const H = { x: VILLAGE.x + 2, z: VILLAGE.z + 3, vx: 0, vz: 0, fx: 0, fz: 1, state: 'idle', st: 0, hp: 5, maxHp: 5, inv: 0, steps: 0, carry: null, lastStars: -1 };
let hero, heroShadow, heroStars, carryMesh;
// v10: two original heroes (tools/hero10.py): 96px frames, 8 true view rows per block, clips in hero10.json
const HERO_PPU = 36; let HK = LS.getItem('ds10hero') || 'trainer', HMETA = null; const HERO_SHEETS = {};
const HEROES10 = { trainer: { name: 'Kip', role: 'Trainer', blurb: 'Eager dragon tamer. Cap, satchel, crystal baton. Quick combos.' },
  blade: { name: 'Rook', role: 'Blade', blurb: 'Cool swordsman with a giant crystal-edged blade. Big sweeping slashes.' } };
function makeHero() {
  hero = new THREE.Group(); scene.add(hero); setHeroKind(HK);
  heroShadow = blob(1.1);
  heroStars = new THREE.Sprite(new THREE.SpriteMaterial({ map: ntex(starRow(5, 5)), depthTest: false, fog: false })); heroStars.renderOrder = 20; heroStars.position.y = 2.75; heroStars.scale.set(46 / 22, 9 / 22, 1); hero.add(heroStars);
}
function setHeroKind(k) { HK = HEROES10[k] ? k : 'trainer'; G.heroKind = HK; LS.setItem('ds10hero', HK); SHEETS.hero = HERO_SHEETS[HK];
  if (!hero) return; if (hero.userData.spr) hero.remove(hero.userData.spr);
  const spr = spriteMesh(SHEETS.hero, HERO_PPU, .32, 96 - 89); hero.add(spr); hero.userData.spr = spr;
  Object.assign(spr.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -60 }); // taller sprite: don't let terrain steps behind slice through it
  if (G.mode === 'play') { $('hudPortrait').innerHTML = ''; $('hudPortrait').append(FF.artPortrait(`heroes/${HK}_portrait.png`, 56)); } }
function heroFrame(t) {
  const spr = hero.userData.spr, M = HMETA[HK];
  // v10: 8 true facings (S, SE, E, NE, N, NW, W, SW rows); walk/run frames advance with distance (no foot slide)
  const k = Math.round(Math.atan2(H.fx, H.fz) * 180 / Math.PI / 45), view = k >= 0 ? k % 8 : 8 + k;
  const A = M.clips, clip = (c, f) => A[c][0] + (((f % A[c][1]) + A[c][1]) % A[c][1]);
  const now = performance.now() / 1000; let col;
  if (H.state === 'slash') col = clip('slash', (H.combo | 0) * 3 + Math.min(2, Math.floor(H.st / .08)));
  else if (H.state === 'roll') col = clip('roll', Math.min(5, Math.floor(H.st / .055)));
  else if (H.state === 'hurt') col = clip('hurt', Math.min(1, Math.floor(H.st / .12)));
  else if (H.mountAnim && now - H.mountAnim.t0 < .6) col = clip(H.mountAnim.clip, Math.min(5, Math.floor((now - H.mountAnim.t0) / .1)));
  else if (RIDE.on) col = clip('ride', Math.floor(t * (H.state === 'idle' ? 4 : H.state === 'run' ? 18 : 14)));
  else if (H.state === 'walk') col = clip('walk', Math.floor(H.steps * 4));
  else if (H.state === 'run') col = clip('run', Math.floor(H.steps * 4));
  else if (H.victoryT && now - H.victoryT < 1.1) col = clip('victory', Math.min(5, Math.floor((now - H.victoryT) / .09)));
  else { let f = Math.floor(t * 5); if (f % 4 === 3 && f % 20 !== 3) f = 1; col = clip('idle', f); } // blink only every 5th breath
  setFrame(spr, col % M.cols, Math.floor(col / M.cols) * M.views + view, false);
  spr.scale.set(1, 1, 1); spr.rotation.z = 0; spr.position.y = 0;
  spr.material.emissive.setRGB(1, 1, 1); spr.material.emissiveIntensity = (H.inv > 0 && Math.floor(H.inv * 16) % 2) ? 1.6 : .32;
  if (H.hp !== H.lastStars) { H.lastStars = H.hp; heroStars.material.map.dispose(); heroStars.material.map = ntex(starRow(H.hp, H.maxHp)); }
}
function solidAt(x, z, r = .3) {
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) { const t = tileAt(x + dx, z + dz); if (t === T_WATER || t === T_CLIFF) return true; }
  const k = ck(Math.floor(x / CH), Math.floor(z / CH));
  for (const s of SOLIDS.get(k) || []) { if (s.box) { if (x > s.box[0] - r && x < s.box[1] + r && z > s.box[2] - r && z < s.box[3] + r) return true; } else if (Math.hypot(x - s.x, z - s.z) < s.r + r) return true; }
  return false;
}
function moveBody(o, dx, dz, r = .3) { const nx = o.x + dx, nz = o.z + dz; let moved = false; if (!solidAt(nx, o.z, r)) { o.x = nx; moved = true; } if (!solidAt(o.x, nz, r)) { o.z = nz; moved = true; } return moved; }

// ---------- monsters ----------
const MON_KINDS = ['addition', 'subtraction', 'times', 'division', 'fractions', 'mixed', 'doubling', 'bonds'];
const SKILL = { doubling: 'addition', bonds: 'addition' };
const MON_SPAWNS = [[62, 52, 'addition'], [70, 70, 'bonds'], [84, 88, 'doubling'], [96, 66, 'subtraction'], [58, 40, 'times'], [80, 36, 'division'], [100, 48, 'mixed'], [128, 74, 'fractions'], [26, 86, 'addition'], [20, 40, 'subtraction'], [132, 40, 'times'], [90, 104, 'mixed']];
const mons = [];
let shieldTex;
function makeMonsters() {
  shieldTex = ntex(cv(32, 32, g => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5); if (d > 15) continue;
    const hex = ((x + (Math.floor(y / 5) % 2) * 3) % 6 === 0 || y % 5 === 0); const a = d > 13.5 ? .9 : hex ? .45 : .12; g.fillStyle = `rgba(150,235,255,${a})`; g.fillRect(x, y, 1, 1); } }));
  MON_SPAWNS.forEach(([x, z, kind], i) => spawnMon(x, z, kind, i));
}
function spawnMon(x, z, kind, id) {
  const m = { id, kind, home: { x, z }, x, z, vx: 0, vz: 0, state: 'wander', t: Math.random() * 2, guard: 30, maxGuard: 30, dead: false, flip: false, wx: 0, wz: 0, hitT: 0, lunge: null };
  m.mesh = spriteMesh(SHEETS['mon_' + kind], 27, .3); scene.add(m.mesh); m.shadow = blob(1.3);
  m.shield = new THREE.Sprite(new THREE.SpriteMaterial({ map: shieldTex, transparent: true, depthWrite: false, opacity: .5, blending: THREE.AdditiveBlending })); m.shield.scale.set(2, 2, 1); scene.add(m.shield);
  mons[id] = m; return m;
}
function monUpdate(m, dt, t) {
  if (m.dead) { m.respawn -= dt; if (m.respawn <= 0 && Math.hypot(H.x - m.home.x, H.z - m.home.z) > 20) { scene.remove(m.mesh, m.shadow, m.shield); spawnMon(m.home.x, m.home.z, m.kind, m.id); } return; }
  const dx = H.x - m.x, dz = H.z - m.z, d = Math.hypot(dx, dz); m.t += dt; m.hitT = Math.max(0, m.hitT - dt);
  const near = d < 25; m.mesh.visible = m.shadow.visible = m.shield.visible = near; if (!near) return;
  // knockback velocity
  if (Math.abs(m.vx) + Math.abs(m.vz) > .01) { moveBody(m, m.vx * dt, m.vz * dt, .4); m.vx = damp(m.vx, 0, 8, dt); m.vz = damp(m.vz, 0, 8, dt); }
  const frozen = G.question && G.question.mon === m;
  if (!frozen) {
    if (m.state === 'wander') { if (m.t > 2) { m.t = 0; const a = Math.random() * 6.28; m.wx = Math.cos(a) * .9; m.wz = Math.sin(a) * .9; if (Math.random() < .3) m.wx = m.wz = 0; }
      if (Math.hypot(m.x - m.home.x, m.z - m.home.z) > 6) { m.wx = (m.home.x - m.x) * .3; m.wz = (m.home.z - m.z) * .3; }
      moveBody(m, m.wx * dt, m.wz * dt, .4); if (m.wx) m.flip = m.wx > 0; if (d < 6.5 && !G.question) { m.state = 'chase'; m.t = 0; } }
    else if (m.state === 'chase') { const sp = 2.1; moveBody(m, dx / d * sp * dt, dz / d * sp * dt, .4); m.flip = dx > 0;
      if (d < 2.3 && m.t > .4) { m.state = 'tele'; m.t = 0; sfx('tele'); } if (d > 11) { m.state = 'wander'; m.t = 0; } }
    else if (m.state === 'tele') { if (m.t > .65) { m.state = 'lunge'; m.t = 0; m.lunge = { x: dx / d, z: dz / d }; } }
    else if (m.state === 'lunge') { moveBody(m, m.lunge.x * 9 * dt, m.lunge.z * 9 * dt, .4);
      if (d < .9 && H.inv <= 0 && H.state !== 'roll') heroHurt(m); if (m.t > .26) { m.state = 'recover'; m.t = 0; } }
    else if (m.state === 'recover') { if (m.t > .9) { m.state = 'chase'; m.t = 0; } }
    else if (m.state === 'stun') { if (m.t > .45) { m.state = 'chase'; m.t = 0; } }
  }
  // visuals: bob, telegraph flash + crouch, hit flash
  const tele = m.state === 'tele', bob = 0;
  const my = gy(m.x, m.z); m.mesh.position.set(m.x, my, m.z); m.mesh.quaternion.copy(camera.quaternion);
  const fr = m.hitT > 0 ? MR('hit', 0) : m.state === 'stun' ? MR('hit', 1) : tele ? MR('tele', Math.floor(m.t / .65 * 4), true) : m.state === 'lunge' ? MR('lunge', Math.floor(m.t / .26 * 4), true)
    : m.state === 'chase' ? MR('walk', Math.floor(t * 9)) : m.state === 'wander' && (m.wx || m.wz) ? MR('walk', Math.floor(t * 6)) : MR('idle', Math.floor(t * 4 + m.id));
  setFrame(m.mesh, fr[0], fr[1], m.flip); m.mesh.material.emissiveIntensity = .3;
  m.shadow.position.set(m.x, my + .02, m.z);
  m.shield.position.set(m.x, my + .85 + bob, m.z); m.shield.material.opacity = (.25 + .15 * Math.sin(t * 4 + m.id)) * (m.guard / m.maxGuard * .7 + .3);
}
function heroHurt(m) { H.hp--; H.inv = 1.1; H.state = 'hurt'; H.st = 0; const dx = H.x - m.x, dz = H.z - m.z, d = Math.hypot(dx, dz) || 1; H.vx = dx / d * 8; H.vz = dz / d * 8;
  shake(.35, .25); hitStop(.06); sfx('hurt'); dmgNum(H.x, 2, H.z, '-1★', 'hurt'); if (H.hp <= 0) faint(); }
async function faint() { G.uiLock++; await FF.fade(() => { H.x = VILLAGE.x + 2; H.z = VILLAGE.z + 3; H.hp = H.maxHp; H.state = 'idle'; snapCam(); streamChunks(H.x, H.z, true); }); G.uiLock--; toast('You felt dizzy and rested in the village. Stars refilled!'); }

// ---------- combat ----------
let stopT = 0, shakeA = 0, shakeT = 0; const slashes = [];
const hitStop = s => stopT = Math.max(stopT, s);
const shake = (a, s) => { shakeA = Math.max(shakeA, a); shakeT = Math.max(shakeT, s); };
function slashVFX(big = false) { // v12: thin pale-cyan crescent smear, ~1.35x sword reach, fades in 120 ms, drawn behind the head
  const ang = Math.atan2(H.fx, H.fz), R = (big ? 1.5 : 1.35) * 1.05, W = big ? .26 : .18, N = 24, a0 = -Math.PI * .42, a1 = Math.PI * .42; const pos = [], idx = [];
  for (let i = 0; i <= N; i++) { const k = i / N, a = a0 + (a1 - a0) * k, w = W * Math.pow(Math.sin(Math.PI * k), .8) * (0.35 + .65 * k); // tapered, thicker at the trailing end
    pos.push(Math.sin(a) * R, 0, Math.cos(a) * R, Math.sin(a) * (R - w), 0, Math.cos(a) * (R - w)); if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: big ? 0xbff6ff : 0x9eeaff, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -1; m.position.set(H.x, (H.y || 0) + .55, H.z); m.rotation.y = ang; m.rotateX(-.18); scene.add(m);
  slashes.push({ m, life: .12, max: .12 });
}
const sparks = []; let sparkTex;
function burst(x, y, z, n, col = 0xffffff, sp = 4) { if (!sparkTex) sparkTex = ntex(cv(5, 5, g => { px(g, '#fff', 2, 0, 1, 5); px(g, '#fff', 0, 2, 5, 1); }));
  for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.position.set(x, y, z); s.scale.setScalar(.25);
    const a = Math.random() * 6.28, v = sp * (.4 + Math.random()); s.userData = { vx: Math.cos(a) * v, vy: 1 + Math.random() * sp * .8, vz: Math.sin(a) * v, life: .5 + Math.random() * .4 }; scene.add(s); sparks.push(s); } }
function dmgNum(x, y, z, text, cls = '') { const v = new THREE.Vector3(x, y, z).project(camera); const d = document.createElement('div'); d.className = 'dnum ' + cls; d.textContent = text;
  d.style.left = (v.x * .5 + .5) * innerWidth + 'px'; d.style.top = (-v.y * .5 + .5) * innerHeight + 'px'; $('dmgLayer').append(d); setTimeout(() => d.remove(), 850); }
function attack() {
  if (H.state === 'roll' || H.state === 'hurt') return;
  if (H.state === 'slash') { if (H.st < .2) { H.queued = true; } return; } // buffer the next combo hit
  const now = performance.now(); H.combo = now - (H.lastSlash || 0) < 520 ? ((H.combo | 0) + 1) % 3 : 0; H.lastSlash = now;
  H.state = 'slash'; H.st = 0; H.hitDone = false; H.queued = false; slashVFX(); sfx('slash');
}
function slashHits() {
  let any = false;
  for (const m of mons) { if (!m || m.dead || !m.mesh.visible) continue; const dx = m.x - H.x, dz = m.z - H.z, d = Math.hypot(dx, dz); if (d > 2.1) continue;
    const dot = (dx * H.fx + dz * H.fz) / (d || 1); if (d > .8 && dot < .2) continue;
    any = true; const dmg = 6 + (Math.random() * 6 | 0); m.guard = Math.max(0, m.guard - dmg); m.hitT = .12; m.state = 'stun'; m.t = 0;
    m.vx = dx / (d || 1) * 9; m.vz = dz / (d || 1) * 9; dmgNum(m.x, 1.6, m.z, dmg); burst(m.x, .9, m.z, 7, 0xbfefff);
    addFocus(m.guard <= 0 ? 100 : 34, m); }
  if (any) { hitStop(.075); shake(.18, .14); sfx('hit'); }
}
function addFocus(n, m) { const was = G.focus; G.focus = Math.min(100, G.focus + n); if (G.focus >= 100 && was < 100) { sfx('focus'); toast('FOCUS full! Answer the riddle to break the maths shield!'); }
  if (G.focus >= 100 && m && !G.question) setTimeout(() => openQuestion(m), 160); }
function roll() { if (H.state === 'roll' || H.state === 'hurt') return; H.state = 'roll'; H.st = 0; H.inv = Math.max(H.inv, .42); const l = Math.hypot(H.fx, H.fz) || 1; H.vx = H.fx / l * 11; H.vz = H.fz / l * 11; sfx('roll'); }

// ---------- in-world question bubble (no screen swap) ----------
function makeQ(skill) { const level = Q.yearLevel(G.year); const q = Q.gen(skill || 'mixed', level); const opts = q.options.filter(o => o !== q.a).slice(0, 2).concat(q.a).sort(() => Math.random() - .5); return { q: q.q, a: q.a, options: opts }; }
function askBubble(anchor, tag, skill) { // returns Promise<boolean>
  return new Promise(res => {
    const q = makeQ(skill); const el = $('qb'); el.classList.remove('hidden'); el.classList.add('pop'); $('qbTag').textContent = tag; $('qbText').textContent = q.q + ' = ?'; $('qbFb').textContent = '';
    $('qbOpts').innerHTML = q.options.map((o, i) => `<button data-v="${o}">${o}<small>${MOBILE ? '' : i + 1}</small></button>`).join('');
    G.question = { anchor, q, mon: anchor.mon || null };
    let done = false;
    const pick = v => { if (done) return; done = true; removeEventListener('keydown', kd, true); const ok = v === q.a;
      $('qbOpts').querySelectorAll('button').forEach(b => { b.disabled = true; if (+b.dataset.v === q.a) b.classList.add('right'); else if (+b.dataset.v === v) b.classList.add('wrong'); });
      $('qbFb').textContent = ok ? 'Correct!' : `Nice try! ${q.q} = ${q.a}`; sfx(ok ? 'right' : 'wrong'); G.answered = (G.answered || 0) + 1;
      setTimeout(() => { el.classList.add('hidden'); G.question = null; res(ok); }, ok ? 650 : 1500); };
    const kd = e => { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(q.options[i]); } };
    addEventListener('keydown', kd, true);
    $('qbOpts').querySelectorAll('button').forEach(b => b.onclick = () => pick(+b.dataset.v));
    G.answerQ = correct => pick(correct ? q.a : q.options.find(o => o !== q.a)); // test hook
  });
}
function placeBubble() { if (!G.question) return; const a = G.question.anchor; const v = new THREE.Vector3(a.x, a.y || 2.6, a.z).project(camera); const el = $('qb');
  const hw = Math.min(el.offsetWidth / 2 + 8, innerWidth / 2); el.style.left = clamp((v.x * .5 + .5) * innerWidth, hw, innerWidth - hw) + 'px'; el.style.top = clamp((-v.y * .5 + .5) * innerHeight, el.offsetHeight + 70, innerHeight - 8) + 'px'; }
async function openQuestion(m) {
  if (G.question || m.dead) return; m.state = 'stun'; m.t = -99; // hold still
  const ok = await askBubble({ get x() { return m.x; }, get z() { return m.z; }, y: 2.4, mon: m }, 'Maths shield · ' + (SKILL[m.kind] || m.kind), SKILL[m.kind] || m.kind);
  G.focus = 0;
  if (ok) finisher(m);
  else { m.guard = m.maxGuard; m.state = 'recover'; m.t = 0; dmgNum(m.x, 1.8, m.z, 'Shield up!', 'info'); }
}
function shatterFX(m) { const mesh = m.mesh; let f = 0; const step = () => { if (f >= ANIM.mon.shatter[1]) { scene.remove(mesh); return; } setFrame(mesh, f, ANIM.mon.shatter[0], m.flip); mesh.quaternion.copy(camera.quaternion); f++; setTimeout(step, 70); }; step(); }
async function finisher(m) {
  H.fx = m.x - H.x; H.fz = m.z - H.z; const l = Math.hypot(H.fx, H.fz) || 1; H.fx /= l; H.fz /= l;
  H.state = 'slash'; H.st = 0; H.hitDone = true; slashVFX(true); sfx('slash'); hitStop(.12); shake(.5, .35);
  setTimeout(() => { sfx('shatter'); burst(m.x, 1, m.z, 26, 0x9feaff, 6); burst(m.x, 1, m.z, 10, 0xffe27a, 4); dmgNum(m.x, 2, m.z, 'SHIELD BREAK!', 'big');
    m.dead = true; m.respawn = 40; H.victoryT = performance.now() / 1000 + .25; scene.remove(m.shadow, m.shield); shatterFX(m); G.kills++; const gain = 3; G.gems += gain; sfx('gem'); setTimeout(() => dmgNum(H.x, 2.4, H.z, `+${gain} 💎`, 'info'), 300); hud(); save(); }, 140);
}

// ---------- eggs, incubator, dragons ----------
const EGG_SPOTS = [[109, 40, 'tidecrest'], [137, 64, 'emberhorn'], [16, 30, 'mossback']];
const WILD = [[146, 50, 'stormquill'], [92, 92, 'dawnpetal'], [64, 30, 'frostmere']];
const eggs = [], wilds = [];
let incubator = null; // {clan, warmth, stepsAt, mesh}
let glintTex;
function makeEggs() {
  glintTex = ntex(cv(7, 7, g => { px(g, '#fff', 3, 0, 1, 7); px(g, '#fff', 0, 3, 7, 1); px(g, '#fff6b0', 2, 2, 3, 3); }));
  for (const [x, z, clan] of EGG_SPOTS) { if (G.found?.includes('egg:' + clan)) continue;
    const m = spriteMesh(sheet(eggCanvas(clan), 14, 17), 22, .4); m.position.set(x, 0, z); scene.add(m); const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.setScalar(.45); scene.add(gl);
    eggs.push({ x, z, clan, mesh: m, glint: gl, sh: blob(.6) }); }
  for (const [x, z, clan] of WILD) { if (G.dragons.includes(clan)) continue; const m = spriteMesh(SHEETS['dragon_' + clan], 38, .35); m.position.set(x, 0, z); scene.add(m); wilds.push({ x, z, hx: x, hz: z, clan, mesh: m, trust: 0, sh: blob(.9), t: 0 }); }
}
let buddy = null; // companion {clan, mesh, x, z, cd, dash}
function setBuddy(clan) { if (!clan && RIDE.on) toggleRide(false); if (buddy) { scene.remove(buddy.mesh, buddy.sh); } if (!clan) { buddy = null; return; }
  const m = spriteMesh(SHEETS['dragon_' + clan], 43, .35); scene.add(m); buddy = { clan, mesh: m, x: H.x - 1, z: H.z + .5, y: .5, cd: 2, dash: null, sh: blob(.8) }; G.buddy = clan; }
// v8 rideable dragon mount: R / hotbar to mount the buddy dragon (scaled up, own gait), 1.75x speed, J dismounts + slashes
const RIDE = { on: false, k: 0, hop: 0 };
function toggleRide(force) { const want = force ?? !RIDE.on;
  if (want && !buddy) { toast('Hatch or befriend a dragon first, then press R to ride it!'); return; }
  if (want === RIDE.on) return; RIDE.on = want; RIDE.hop = .35; H.mountAnim = { clip: want ? 'mount' : 'dismount', t0: performance.now() / 1000 }; G.riding = want; sfx(want ? 'open' : 'cancel');
  burst(H.x, (H.y || 0) + .4, H.z, 8, 0xfff1c8, 2.4); if (buddy) { buddy.x = H.x; buddy.z = H.z; } hud(); }
function rideLift(t) { const target = RIDE.on ? .78 + (H.state === 'idle' ? Math.sin(t * 2.4) * .03 : Math.abs(Math.sin(t * 7)) * .1) : 0;
  RIDE.k = damp(RIDE.k, target, 12, 1 / 60); return RIDE.k + (RIDE.hop > 0 ? Math.sin(RIDE.hop / .35 * Math.PI) * .6 : 0); }
function buddyUpdate(dt, t) {
  RIDE.hop = Math.max(0, RIDE.hop - dt);
  if (!buddy) return; const b = buddy; b.cd -= dt;
  if (RIDE.on) { b.x = H.x; b.z = H.z - .06; const moving = H.state === 'walk' || H.state === 'run'; const gait = moving ? Math.abs(Math.sin(t * (H.state === 'run' ? 9 : 7))) * .1 : Math.sin(t * 2.4) * .03;
    const by = gy(b.x, b.z); b.mesh.position.set(b.x, by + .05 + gait, b.z); b.mesh.quaternion.copy(camera.quaternion); b.mesh.scale.setScalar(1.85);
    setFrame(b.mesh, ...(moving ? DR(H.state === 'run' ? 'm_run' : 'm_walk', Math.floor(H.steps * (H.state === 'run' ? 3 : 4))) : DR('m_idle', Math.floor(t * 4))), H.fx > 0 ? false : true); b.sh.position.set(b.x, by + .02, b.z); b.sh.scale.setScalar(1.8); return; }
  b.mesh.scale.setScalar(1); b.sh.scale.setScalar(1);
  let tx = H.x - (H.fx >= 0 ? 1.3 : -1.3), tz = H.z - .4, sp = 6;
  if (b.dash) { const m = b.dash; tx = m.x; tz = m.z; sp = 12; if (m.dead) b.dash = null;
    else if (Math.hypot(b.x - m.x, b.z - m.z) < .7) { const dmg = 4 + (Math.random() * 3 | 0); m.guard = Math.max(0, m.guard - dmg); m.hitT = .1; m.vx = (m.x - H.x) * 1.5; m.vz = (m.z - H.z) * 1.5; dmgNum(m.x, 1.6, m.z, dmg); burst(m.x, .9, m.z, 6, new THREE.Color(CLANS[b.clan].body).getHex()); sfx('hit'); addFocus(15, null); b.dash = null; b.cd = 3.2; b.puff = .4; } }
  else if (b.cd <= 0) { const m = mons.find(m => m && !m.dead && m.state !== 'wander' && Math.hypot(m.x - H.x, m.z - H.z) < 5); if (m && !G.question) b.dash = m; else b.cd = .5; }
  b.x = damp(b.x, tx, sp * .6, dt); b.z = damp(b.z, tz, sp * .6, dt); b.y = .45 + Math.sin(t * 3) * .15;
  const by = gy(b.x, b.z); b.mesh.position.set(b.x, by + b.y, b.z); b.mesh.quaternion.copy(camera.quaternion); setFrame(b.mesh, ...(b.puff > 0 ? DR('puff', Math.floor((.4 - b.puff) / .08)) : b.dash ? DR('flap', Math.floor(t * 16)) : DR('hover', Math.floor(t * 10))), b.dash ? b.x > (b.dash.x ?? b.x) : H.fx > 0 ? false : true); b.puff = Math.max(0, (b.puff || 0) - dt);
  b.sh.position.set(b.x, by + .02, b.z);
}
function eggsUpdate(dt, t) {
  for (const e of eggs) { e.mesh.quaternion.copy(camera.quaternion); e.mesh.rotation.z = Math.sin(t * 3 + e.x) * .08; const ey = gy(e.x, e.z); e.mesh.position.y = ey; e.sh.position.set(e.x, ey + .02, e.z);
    const k = (t * 1.3 + e.x) % 1.6; e.glint.position.set(e.x + .25, ey + .55 + k * .3, e.z); e.glint.material.opacity = k < .6 ? Math.sin(k / .6 * Math.PI) : 0; e.glint.material.rotation = t * 2; }
  for (const w of wilds) { w.t += dt; if (w.t > 2.5) { w.t = 0; w.tx = w.hx + (Math.random() - .5) * 4; w.tz = w.hz + (Math.random() - .5) * 4; }
    if (w.tx != null && !G.question) { w.x = damp(w.x, w.tx, 1.2, dt); w.z = damp(w.z, w.tz, 1.2, dt); }
    const hop = Math.abs(Math.sin(t * 4 + w.hx)) * (w.happy > 0 ? .5 : .12); w.happy = Math.max(0, (w.happy || 0) - dt);
    const wy = gy(w.x, w.z); w.mesh.position.set(w.x, wy + hop, w.z); w.mesh.quaternion.copy(camera.quaternion); setFrame(w.mesh, ...(w.happy > 0 ? DR('happy', Math.floor(t * 10)) : DR('hop', Math.floor((t * 4 + w.hx) / Math.PI * 6))), H.x < w.x); w.sh.position.set(w.x, wy + .02, w.z); }
  if (carryMesh) { carryMesh.position.set(H.x, hero.position.y + 2.35 + Math.sin(t * 4) * .05, H.z + .01); carryMesh.quaternion.copy(camera.quaternion); }
}
function nearest() { // what E would interact with
  if (H.carry && Math.hypot(H.x - NEST.x, H.z - NEST.z) < 2.4) return { kind: 'nestPut' };
  if (!H.carry && incubator && Math.hypot(H.x - NEST.x, H.z - NEST.z) < 2.4) return { kind: 'nestWarm' };
  if (!H.carry) for (const e of eggs) if (Math.hypot(H.x - e.x, H.z - e.z) < 1.5) return { kind: 'egg', e };
  for (const w of wilds) if (Math.hypot(H.x - w.x, H.z - w.z) < 2) return { kind: 'wild', w };
  if (Math.hypot(H.x - 37.5, H.z - 57.5) < 2) return { kind: 'npc' };
  return null;
}
async function interact() {
  const n = nearest(); if (!n || G.question || G.uiLock) return;
  if (n.kind === 'egg') { const e = n.e; eggs.splice(eggs.indexOf(e), 1); scene.remove(e.mesh, e.glint, e.sh); H.carry = e.clan; carryMesh = spriteMesh(sheet(eggCanvas(e.clan), 14, 17), 22, .4); scene.add(carryMesh);
    G.found = [...(G.found || []), 'egg:' + e.clan]; sfx('pickup'); toast(`You found a ${CLANS[e.clan].name} egg! Carry it to the nest in the village.`); hud(); save(); }
  else if (n.kind === 'nestPut') { if (incubator) return toast('The nest is already warming an egg. Hatch it first!');
    incubator = { clan: H.carry, warmth: 0, stepsAt: H.steps - 999 }; H.carry = null; scene.remove(carryMesh); carryMesh = null; makeIncubatorEgg(); sfx('pickup');
    toast('The egg is snug in the nest. Warm it with maths: answer, go exploring, come back!'); hud(); save(); }
  else if (n.kind === 'nestWarm') warmEgg();
  else if (n.kind === 'wild') trustGame(n.w);
  else if (n.kind === 'npc') talkElder();
}
function makeIncubatorEgg() { if (incubator.mesh) scene.remove(incubator.mesh); const m = spriteMesh(sheet(eggCanvas(incubator.clan), 14, 17), 22, .4); m.position.set(NEST.x, gy(NEST.x, NEST.z) + .15, NEST.z + .05); scene.add(m); incubator.mesh = m; }
const STEPS_PER_WARM = 40;
async function warmEgg() {
  const inc = incubator, need = inc.stepsAt + STEPS_PER_WARM - H.steps;
  if (need > 0) return toast(`The egg needs a little time: walk ${Math.ceil(need)} more steps, then warm it again.`);
  const ok = await askBubble({ x: NEST.x, z: NEST.z, y: 1.6 }, `Warm the egg · ${inc.warmth}/3`, 'mixed');
  if (!ok) return toast('The egg wobbles. Try another one!');
  inc.warmth++; inc.stepsAt = H.steps; burst(NEST.x, .6, NEST.z, 8, 0xffd27a, 2); sfx('heart'); save();
  if (inc.warmth >= 3) return hatch();
  toast(`Warmth ${inc.warmth}/3. Explore for ${STEPS_PER_WARM} steps and come back!`);
}
async function hatch() {
  const clan = incubator.clan; G.uiLock++;
  for (let i = 0; i < 10; i++) { incubator.mesh.rotation.z = (i % 2 ? 1 : -1) * .25; sfx('blip'); await sleep(110); }
  scene.remove(incubator.mesh); incubator = null; burst(NEST.x, .8, NEST.z, 30, 0xfff1a0, 5); sfx('hatch'); shake(.2, .2);
  G.uiLock--; addDragon(clan, 'hatched'); G.hatched++;
  await FF.dialog([`Crack! A baby ${CLANS[clan].name} hatched!`, `It flaps over and nuzzles you. ${CLANS[clan].name} joins your party!`], { name: CLANS[clan].name, img: FF.dragonPortrait(clan) });
}
async function trustGame(w) {
  G.uiLock++; await FF.dialog([`A wild ${CLANS[w.clan].name} is watching you. Answer 3 riddles to earn its trust!`], { name: 'Wild dragon', img: FF.dragonPortrait(w.clan) }); G.uiLock--;
  for (let tries = 0; tries < 6 && w.trust < 3; tries++) {
    const ok = await askBubble({ get x() { return w.x; }, get z() { return w.z; }, y: 2 }, `Trust ${'♥'.repeat(w.trust)}${'♡'.repeat(3 - w.trust)}`, CLANS[w.clan].power);
    if (ok) { w.trust++; w.happy = 1; sfx('heart'); dmgNum(w.x, 1.8, w.z, '♥', 'big'); } else dmgNum(w.x, 1.8, w.z, '?', 'info');
    await sleep(250);
  }
  if (w.trust >= 3) { wilds.splice(wilds.indexOf(w), 1); scene.remove(w.mesh, w.sh); burst(w.x, .8, w.z, 20, 0xff9ab8, 4); addDragon(w.clan, 'befriended'); G.befriended++;
    await FF.dialog([`${CLANS[w.clan].name} trusts you now and joins your party!`], { name: CLANS[w.clan].name, img: FF.dragonPortrait(w.clan) }); }
  else toast('It flutters off to think. Come back and try again!');
}
function addDragon(clan, how) { if (!G.dragons.includes(clan)) G.dragons.push(clan); G.how = { ...(G.how || {}), [clan]: how }; setBuddy(clan); hud(); save(); }

// ---------- NPC, UI ----------
const NPC = { mesh: null };
async function talkElder() { await FF.dialog(['Welcome to the Crystal Isles, young rider!', 'Crystal monsters roam the meadow. Each wears a maths shield.', 'Strike them to build FOCUS, then answer the riddle bubble to break the shield!',
  'Dragon eggs glint in the wild. Bring them to the nest here and warm them with maths.', 'And wild baby dragons will join you if you earn their trust. Off you go!'], { name: 'Elder Brightscale', img: elderPortrait() }); }
function elderPortrait() { const sh = SHEETS.elder, c = document.createElement('canvas'); c.width = c.height = 72; c.className = 'portrait'; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(sh.img, 5, 1, 24, 24, 0, 0, 72, 72); return c; }
let toastT; function toast(m) { const el = $('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }
const HEART = ['.oo.oo.', 'orroRro', 'orrrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'];
const heartURL = full => cv(7, 7, g => HEART.forEach((r, y) => [...r].forEach((c, x) => c !== '.' && px(g, c === 'o' ? '#2a1418' : full ? (c === 'R' ? '#ffc0c0' : '#e8384a') : '#5a4a58', x, y)))).toDataURL();
let HURL; function heartsHTML() { HURL = HURL || [heartURL(false), heartURL(true)]; return Array.from({ length: H.maxHp }, (_, i) => `<img src="${HURL[i < H.hp ? 1 : 0]}" alt="">`).join(''); }
function hud() { if ($('hearts').dataset.hp != H.hp) { $('hearts').dataset.hp = H.hp; $('hearts').innerHTML = heartsHTML(); }
  const hb = $('hotbar'); if (hb) { hb.querySelector('[data-k=KeyR]').classList.toggle('on', RIDE.on); hb.querySelector('[data-k=KeyR]').classList.toggle('dim', !buddy); hb.querySelector('[data-k=KeyE] i').textContent = H.carry ? '🥚' : '✋'; } $('gems').textContent = '💎 ' + G.gems; $('dragonsN').textContent = '🐉 ' + G.dragons.length + '/6'; $('carry').textContent = H.carry ? '🥚 carrying' : incubator ? `🥚 nest ${incubator.warmth}/3` : '';
  const fb = $('focusBar'); fb.style.width = G.focus + '%'; fb.classList.toggle('full', G.focus >= 100);
  const goal = !G.kills ? 'Defeat a crystal monster east of the village (hit it, then answer its shield riddle).'
    : !G.dragons.length && !H.carry && !incubator ? 'Find a glinting dragon egg (try the river bank or the north forest).'
      : H.carry ? 'Carry the egg to the nest in the village square.' : incubator ? `Warm the egg in the nest (${incubator.warmth}/3). Walk ${Math.max(0, Math.ceil(incubator.stepsAt + STEPS_PER_WARM - H.steps))} steps between warmings.`
        : G.dragons.length < 6 ? 'Befriend wild baby dragons (meadow, forest, cliff nest) and find more eggs.' : 'You found every dragon! Keep exploring.';
  $('goal').textContent = '★ ' + goal; }
function save() { LS.setItem('ds7', JSON.stringify({ gems: G.gems, dragons: G.dragons, how: G.how, found: G.found, buddy: G.buddy, year: G.year, kills: G.kills, x: H.x, z: H.z, steps: H.steps, carry: H.carry, incubator: incubator && { clan: incubator.clan, warmth: incubator.warmth, stepsAt: incubator.stepsAt } })); }
function load() { const s = JSON.parse(LS.getItem('ds7') || 'null'); if (!s) return false; Object.assign(G, { gems: s.gems | 0, dragons: s.dragons || [], how: s.how || {}, found: s.found || [], year: s.year || 3, kills: s.kills | 0, buddy: s.buddy });
  H.x = s.x || H.x; H.z = s.z || H.z; H.steps = s.steps | 0; H.carry = s.carry || null; if (s.incubator) incubator = { ...s.incubator }; return true; }
function openMenu() {
  if (G.uiLock || G.question || G.mode !== 'play') return; G.uiLock++; sfx('open'); const mm = $('mainMenu'); mm.classList.remove('hidden'); mm.classList.add('pop'); const pane = $('mmPane');
  const close = () => { mm.classList.add('hidden'); FF.closeMenu($('mmCmd')); G.uiLock--; };
  const status = () => { pane.innerHTML = `<div class="prow"><div class="pf"></div><div class="pinfo"><div class="pname">Sunny</div><div>Lv <b>${1 + (G.kills / 3 | 0)}</b> &nbsp; Dragon Rider</div>
      <div>Stars ${'★'.repeat(H.hp)}${'☆'.repeat(H.maxHp - H.hp)}</div><small>Monsters calmed ${G.kills} · Questions answered ${G.answered || 0}</small></div></div>
      ${G.buddy ? `<div class="prow"><div class="pf pfd"></div><div class="pinfo"><div class="pname">${CLANS[G.buddy].name}</div><div>Buddy dragon</div><small>Power: ${CLANS[G.buddy].powerName}</small></div></div>` : '<p>No dragon buddy yet. Find an egg!</p>'}`;
    pane.querySelector('.pf').append(FF.artPortrait(`heroes/${HK}_portrait.png`)); if (G.buddy) pane.querySelector('.pfd').append(FF.dragonPortrait(G.buddy)); };
  const dex = () => { pane.innerHTML = `<h3>Dragon Dex · ${G.dragons.length}/6</h3><div class="dex">${Object.entries(CLANS).map(([id, c]) => { const has = G.dragons.includes(id);
      return `<div class="card ${has ? '' : 'no'}"><img src="assets/gen/dragons/${id}_portrait.png" alt=""><b>${has ? c.name : '???'}</b><small>${has ? (G.how?.[id] === 'hatched' ? 'Hatched' : 'Befriended') + ' · ' + c.power : 'Not found yet'}</small>${has && G.buddy !== id ? `<button data-b="${id}">Buddy</button>` : has ? '<small> ★ buddy</small>' : ''}</div>`; }).join('')}</div>`;
    pane.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { setBuddy(b.dataset.b); save(); dex(); }); };
  const items = () => { pane.innerHTML = `<h3>Items</h3><ul class="ilist"><li><span>Crystal Gems</span><b>${G.gems}</b></li><li><span>Dragon egg (carried)</span><b>${H.carry ? 1 : 0}</b></li><li><span>Egg in nest</span><b>${incubator ? incubator.warmth + '/3 warm' : '-'}</b></li></ul>`; };
  const settings = () => { const go = () => FF.menu(pane, [{ label: `Year level: ${G.year}`, v: 'y' }, { label: `Sound: ${muted ? 'off' : 'on'}`, v: 'm' }, { label: `Text speed: ${FF.settings.textSpeed}`, v: 's' }, { label: 'Back', v: 'b' }], it => {
      if (it.v === 'y') G.year = G.year % 6 + 1; else if (it.v === 'm') toggleMute(); else if (it.v === 's') { FF.settings.textSpeed = { slow: 'normal', normal: 'fast', fast: 'slow' }[FF.settings.textSpeed]; LS.setItem('ds_settings', JSON.stringify(FF.settings)); } else { status(); return main(); } save(); go(); }, { onCancel: () => { status(); main(); } }); go(); };
  const cmds = [{ label: 'Status', f: status }, { label: 'Dragons', f: dex }, { label: 'Items', f: items }, { label: 'Settings', f: settings }, { label: 'Close', f: close }];
  const main = () => FF.menu($('mmCmd'), cmds, it => it.f(), { onCancel: close });
  $('mmGems').textContent = G.gems; $('mmLoc').textContent = areaName(); status(); main(); G.menuDex = dex;
}
function areaName() { if (Math.hypot(H.x - VILLAGE.x, H.z - VILLAGE.z) < 16) return 'Crystal Village'; if (H.x > 124) return 'Dragon Nest Cliffs'; if (Math.abs(H.x - riverX(H.z)) < 8) return 'Silverrun River'; if (H.z < 34) return 'Whisperwood Edge'; return 'Honey Meadow'; }

// ---------- ambient life: birds + butterflies ----------
const birds = [], flies = [];
function makeLife() {
  const bt = ntex(cv(16, 8, g => { px(g, '#2a2a3a', 1, 2, 2, 1); px(g, '#2a2a3a', 3, 3, 2, 1); px(g, '#2a2a3a', 5, 4, 1, 1); px(g, '#2a2a3a', 6, 3, 2, 1); px(g, '#2a2a3a', 8, 2, 2, 1);
    px(g, '#2a2a3a', 9, 5, 2, 1); px(g, '#2a2a3a', 11, 4, 2, 1); px(g, '#2a2a3a', 13, 5, 1, 1); px(g, '#2a2a3a', 14, 6, 1, 1); px(g, '#2a2a3a', 12, 4, 1, 2); })); bt.repeat.set(.5, 1);
  for (let i = 0; i < 5; i++) { const t = bt.clone(); t.needsUpdate = true; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false })); s.scale.set(.7, .7, 1); s.userData = { ph: i * 1.7, sp: 3 + i * .4, off: (i - 2) * 3 }; scene.add(s); birds.push(s); }
  const cols = ['#fff6d6', '#ffd75a', '#ff9ab8', '#a5e8ff'];
  for (let i = 0; i < 10; i++) { const t = ntex(cv(8, 4, g => { const c = cols[i % 4]; px(g, c, 0, 0, 2, 3); px(g, c, 2, 1, 1, 1); px(g, '#3a2a2a', 3, 1, 1, 2); px(g, c, 4, 0, 2, 3); px(g, c, 5, 1, 1, 1); }));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t })); s.scale.set(.3, .15, 1); s.userData = { ph: Math.random() * 6, ox: (Math.random() - .5) * 18, oz: (Math.random() - .5) * 14 }; scene.add(s); flies.push(s); }
}
function lifeUpdate(dt, t) {
  for (const b of birds) { const u = b.userData; const k = ((t * u.sp + u.ph * 10) % 80) - 40; b.position.set(H.x + k, 7 + Math.sin(t + u.ph) * .5, H.z - 6 + u.off + k * .3); b.material.map.offset.x = Math.floor(t * 6 + u.ph) % 2 * .5; }
  for (const f of flies) { const u = f.userData; f.position.set(H.x + u.ox + Math.sin(t * .7 + u.ph) * 2, .5 + Math.abs(Math.sin(t * 6 + u.ph)) * .25 + Math.sin(t + u.ph) * .2, H.z + u.oz + Math.cos(t * .5 + u.ph) * 1.5);
    f.scale.x = .3 * Math.abs(Math.cos(t * 14 + u.ph)) + .06; if (Math.hypot(f.position.x - H.x, f.position.z - H.z) > 12) { u.ox = (Math.random() - .5) * 18; u.oz = (Math.random() - .5) * 14; } }
}

// ---------- main loop ----------
const clock = new THREE.Clock(); const camT = new THREE.Vector3(), camC = new THREE.Vector3(); let fpsAcc = 0, fpsN = 0;
function snapCam() { camC.set(H.x, 0, H.z); }
function update(dt, t) {
  const play = G.mode === 'play';
  const locked = G.uiLock > 0 || !!G.question;
  if (stopT > 0) { stopT -= dt; heroFrame(t); return; } // hit-stop: freeze the action for a few frames
  if (play && !locked) {
    if (pressed.has('KeyR')) toggleRide();
    if (pressed.has('KeyJ') || pressed.has('Space')) { if (RIDE.on) toggleRide(false); attack(); }
    if ((pressed.has('KeyK') || pressed.has('KeyL')) && !RIDE.on) roll();
    if (pressed.has('KeyE') || pressed.has('Enter')) interact();
    if (pressed.has('Escape') || pressed.has('KeyM')) openMenu();
  }
  pressed.clear();
  if (play) {
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x, iz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + joy.y;
    if (locked) ix = iz = 0;
    const len = Math.min(1, Math.hypot(ix, iz)); H.st += dt; H.inv = Math.max(0, H.inv - dt);
    if (H.state === 'roll') { moveBody(H, H.vx * dt, H.vz * dt); H.vx = damp(H.vx, 0, 3, dt); H.vz = damp(H.vz, 0, 3, dt); if (H.st > .33) H.state = 'idle'; }
    else if (H.state === 'hurt') { moveBody(H, H.vx * dt, H.vz * dt); H.vx = damp(H.vx, 0, 7, dt); H.vz = damp(H.vz, 0, 7, dt); if (H.st > .3) H.state = 'idle'; }
    else {
      if (H.state === 'slash') { if (!H.hitDone && H.st > .07) { H.hitDone = true; slashHits(); } if (H.st > .26) { H.state = 'idle'; if (H.queued) { H.queued = false; attack(); } } }
      const run = keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > .85;
      const sp = (H.state === 'slash' ? 1.2 : run ? 6.2 : 3.6) * len * (RIDE.on ? 1.75 : 1);
      const tvx = len > .05 ? ix / Math.max(1, Math.hypot(ix, iz)) * sp / Math.max(len, .001) * len : 0, tvz = len > .05 ? iz / Math.max(1, Math.hypot(ix, iz)) * sp / Math.max(len, .001) * len : 0;
      H.vx = damp(H.vx, tvx, 16, dt); H.vz = damp(H.vz, tvz, 16, dt);
      const ox = H.x, oz = H.z; moveBody(H, H.vx * dt, H.vz * dt); const moved = Math.hypot(H.x - ox, H.z - oz);
      if (len > .05 && H.state !== 'slash') { H.fx = ix; H.fz = iz; const l = Math.hypot(H.fx, H.fz); H.fx /= l; H.fz /= l; }
      if (H.state !== 'slash') H.state = moved > .001 && len > .05 ? (run ? 'run' : 'walk') : 'idle';
      const before = Math.floor(H.steps); H.steps += moved / .6; if (Math.floor(H.steps) !== before) { if (Math.floor(H.steps) % 2 === 0) sfx('step'); if (H.state === 'run' && Math.floor(H.steps) % 2 === 0) burst(H.x, .1, H.z, 1, 0xf3e6c8, .6); }
    }
    H.y = damp(H.y || 0, gy(H.x, H.z), 14, dt); hero.position.set(H.x, H.y + rideLift(t), H.z); hero.quaternion.copy(camera.quaternion); heroShadow.position.set(H.x, H.y + .02, H.z);
    heroFrame(t);
    streamChunks(H.x, H.z);
    for (const m of mons) if (m) monUpdate(m, locked && !G.question ? 0 : dt, t);
    buddyUpdate(dt, t); eggsUpdate(dt, t);
    const n = nearest(); $('bAct').classList.toggle('on', !!n);
    if (!G.hudT || t - G.hudT > .25) { G.hudT = t; hud(); }
    placeBubble();
  }
  // effects
  for (let i = slashes.length - 1; i >= 0; i--) { const s = slashes[i]; s.life -= dt; const k = 1 - s.life / s.max; s.m.material.opacity = (1 - k) * .75; s.m.scale.setScalar(1 + k * .08); s.m.position.set(H.x, (H.y || 0) + .55, H.z);
    if (s.life <= 0) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); slashes.splice(i, 1); } }
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i], u = s.userData; u.life -= dt; u.vy -= 9 * dt; s.position.x += u.vx * dt; s.position.y = Math.max(.05, s.position.y + u.vy * dt); s.position.z += u.vz * dt; s.material.opacity = Math.min(1, u.life * 2);
    if (u.life <= 0) { scene.remove(s); s.material.dispose(); sparks.splice(i, 1); } }
  lifeUpdate(dt, t);
  if (NPC.mesh) { setFrame(NPC.mesh, Math.floor(t * 1.6) % 2, 0); NPC.mesh.quaternion.copy(camera.quaternion); }
  // camera: smooth follow with a little lead in the walking direction
  const lead = 1.6; camT.set(H.x + H.vx / 6.2 * lead, 0, H.z + H.vz / 6.2 * lead * .6);
  camC.x = damp(camC.x, camT.x, 4, dt); camC.z = damp(camC.z, camT.z, 4, dt);
  if (G.mode === 'title') { camC.x = VILLAGE.x + Math.sin(t * .05) * 6; camC.z = VILLAGE.z + 2; }
  shakeT = Math.max(0, shakeT - dt); const sh = shakeT > 0 ? shakeA * (shakeT / .3) : 0; if (!shakeT) shakeA = 0;
  const cp = Math.cos(CAM.pitch) * CAM.dist;
  camera.position.set(camC.x + (Math.random() - .5) * sh, Math.sin(CAM.pitch) * CAM.dist + 1 + (Math.random() - .5) * sh, camC.z + cp);
  camera.lookAt(camC.x, 1, camC.z);
  sun.position.copy(camC).add(SUN_OFF); sun.target.position.copy(camC);
  water.position.x = camC.x; water.position.z = camC.z; water.material.uniforms.t.value = t;
  motes.material.uniforms.t.value = t; motes.material.uniforms.c.value.set(camC.x, 0, camC.z);
  U.uT.value = t;
  // v8: campfire flicker + light, magic circle spin, boats bob
  const fk = .8 + Math.sin(t * 17) * .1 + Math.sin(t * 7.3) * .1; FIRE_L.intensity = (LOW ? 0 : 7) * fk; FIRE_L.visible = !LOW; if (Math.hypot(camC.x - CAMP.x, camC.z - CAMP.z) > 26) FIRE_L.intensity = 0;
  for (const f of FIRES) { f.fl.scale.set(.5 + fk * .1, .7 + fk * .25, 1); f.gl.material.opacity = .55 + fk * .3; }
  for (const c of CIRCLES) { c.rotation.y = t * .25; c.material.opacity = .65 + Math.sin(t * 2) * .2; }
}
let snapWant = null;
// v9 dynamic resolution: drop pixel ratio below 30fps, creep back up above 50 (bounded by device cap)
const PR_MAX = Math.min(devicePixelRatio, LOW ? 1.25 : 1.5); let prNow = Math.min(devicePixelRatio, LOW ? 1 : 1.5);
function drs(fps) { if (TEST) return; let n = prNow; if (fps < 30) n = Math.max(.55, prNow - .15); else if (fps > 50) n = Math.min(PR_MAX, prNow + .05);
  if (Math.abs(n - prNow) > .01) { prNow = n; renderer.setPixelRatio(n); resize(); } G.pr = prNow;
  if (fps < 24 && sun.castShadow && prNow <= .56) { sun.castShadow = false; } }
function loop() {
  requestAnimationFrame(loop); const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  update(dt, t); focusOnHero(); composer.render();
  if (snapWant) { const r = snapWant; snapWant = null; r(true); }
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = fpsN = 0; drs(G.fps); }
}

// ---------- boot ----------
async function startGame(cont) {
  if (cont) load(); else { LS.removeItem('ds7'); }
  makeEggs(); if (incubator) makeIncubatorEgg(); if (H.carry) { carryMesh = spriteMesh(sheet(eggCanvas(H.carry), 14, 17), 22, .4); scene.add(carryMesh); }
  if (G.buddy) setBuddy(G.buddy);
  streamChunks(H.x, H.z, true); snapCam();
  G.mode = 'play'; $('hud').classList.remove('hidden'); $('hudPortrait').innerHTML = ''; $('hudPortrait').append(FF.artPortrait(`heroes/${HK}_portrait.png`, 56)); hud();
  G.elderPending = !cont && !TEST;
  toast(MOBILE ? 'Joystick to move · ⚔ sword · ↻ roll · E talk' : 'WASD move · Shift run · J sword · K roll · E interact');
}
(async () => {
  try {
    BLOB = ntex(cv(16, 16, g => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; if (d < 1) px(g, `rgba(30,20,40,${(.5 * (1 - d * d)).toFixed(2)})`, x, y); } }));
    makeTiles(); buildMap(); buildHeights(); buildProps();
    await Promise.race([document.fonts.load('600 28px "Pixelify Sans"'), sleep(2500)]).catch(() => {});
    const im = async (k, p) => { ART[k] = await loadImg(p); };
    await Promise.all([im('tree_oak', 'assets/gen/textures/tree_oak.png'), im('tree_pine', 'assets/gen/textures/tree_pine.png'), ...MON_KINDS.map(async k => { SHEETS['mon_' + k] = sheet(await loadImg(`assets/sprites/mon_${k}.png`), 56, 52); }),
      (async () => { ANIM = await (await fetch('assets/sprites/anim.json')).json(); HMETA = await (await fetch('assets/sprites/hero10.json')).json(); })(),
      ...Object.keys(HEROES10).map(async k => { HERO_SHEETS[k] = sheet(await loadImg(`assets/sprites/hero_${k}.png`), 96, 96); }), (async () => { SHEETS.elder = sheet(await loadImg('assets/sprites/npc_elder.png'), 34, 48); })(),
      ...Object.keys(CLANS).map(async c => { SHEETS['dragon_' + c] = sheet(await loadImg(`assets/sprites/dragonv9_${c}.png`), 64, 56); })]);
    makeShared(); makeWater(); makeMotes(); makeHero(); makeMonsters(); makeLife();
    setupPost(); resize(); streamChunks(H.x, H.z, true); snapCam();
    Object.assign(FF.X, { G, sfx, SHEETS, CLANS, isMuted: () => muted, toggleMute });
    FF.preloadArt(); document.querySelector('#dialog .more').src = FF.HAND_URL;
    $('loading').classList.add('hidden');
    const hasSave = !!LS.getItem('ds7');
    FF.showTitle({ hasSave, onNew: async () => { const k = await chooseHero(); await FF.fade(() => { setHeroKind(k); return startGame(false); }); if (G.elderPending) { G.elderPending = false; await sleep(250); await talkElder(); } }, onContinue: () => FF.fade(() => startGame(true)),
      onCode: () => { if (params.has('server')) location.href = 'class.html'; else FF.fade(() => startGame(hasSave)).then(() => toast('Class mode needs the class server (npm start, then open /class.html). Playing solo!')); } });
    G.ready = true; boot.done && boot.done(); loop();
  } catch (e) { G.errors.push(String(e.stack || e)); console.error(e); $('loading').textContent = 'Oops: ' + e.message; boot.fail && boot.fail(e); }
})();


// ---------- v10 character select (FF window, animated 8-way sprite previews) ----------
function chooseHero() {
  return new Promise(res => {
    const box = document.createElement('div'); box.id = 'heroSel';
    box.innerHTML = `<div class="ffw hs-title">Choose your hero</div><div class="hs-row">${Object.entries(HEROES10).map(([k, h]) => `
      <button class="ffw hcard" data-k="${k}"><img class="hs-por" src="assets/gen/heroes/${k}_portrait.png" alt=""><canvas width="96" height="96"></canvas>
      <b>${h.name}</b><span class="hs-role">${h.role}</span><small>${h.blurb}</small></button>`).join('')}</div><div class="ffw hs-help">◀ ▶ choose · Enter / tap to start</div>`;
    box.style.setProperty('--hand', `url(${FF.HAND_URL})`); document.body.append(box); G.uiLock++; let sel = HK === 'blade' ? 1 : 0; const cards = [...box.querySelectorAll('.hcard')];
    const mark = () => cards.forEach((c, i) => c.classList.toggle('on', i === sel)); mark();
    let raf; const t0 = performance.now();
    const draw = () => { raf = requestAnimationFrame(draw); const tt = (performance.now() - t0) / 1000;
      cards.forEach((c, i) => { const k = c.dataset.k, M = HMETA[k], sh = HERO_SHEETS[k], g = c.querySelector('canvas').getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 96, 96);
        const on = i === sel, clipN = on ? (Math.floor(tt / 2.4) % 2 ? 'victory' : 'walk') : 'idle', [c0, n] = M.clips[clipN];
        const f = c0 + (clipN === 'victory' ? Math.min(n - 1, Math.floor((tt % 2.4) / .12)) : Math.floor(tt * (clipN === 'walk' ? 9 : 5)) % n);
        const view = on ? [0, 1, 2, 7, 6][Math.floor(tt / 1.2) % 5] : 1;
        g.drawImage(sh.img, (f % M.cols) * 96, (Math.floor(f / M.cols) * M.views + view) * 96, 96, 96, 0, 0, 96, 96); }); };
    draw();
    const done = () => { cancelAnimationFrame(raf); removeEventListener('keydown', key, true); box.remove(); G.uiLock--; sfx('open'); res(cards[sel].dataset.k); };
    const key = e => { if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) { sel = 1 - sel; mark(); sfx('cursor'); e.preventDefault(); e.stopPropagation(); }
      else if (['Enter', 'Space', 'KeyJ'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); done(); } };
    addEventListener('keydown', key, true);
    cards.forEach((c, i) => c.addEventListener('click', () => { if (sel === i) done(); else { sel = i; mark(); sfx('cursor'); } }));
    cards.forEach((c, i) => c.addEventListener('dblclick', () => { sel = i; done(); }));
  });
}

// ---------- test hooks ----------
Object.assign(G, {
  H, mons, eggs, wilds, get incubator() { return incubator; }, startGame, interact, attack, roll, openMenu, setBuddy,
  teleport: (x, z) => { H.x = x; H.z = z; snapCam(); streamChunks(x, z, true); },
  frame: () => new Promise(r => { snapWant = r; }),
  toggleRide, CAMP, chooseHero, setHeroKind, gy: (x, z) => gy(x, z),
  setCam: (pitch, dist) => { CAM.pitch = pitch; CAM.dist = Math.max(CAM_MIN, dist); }, chunkKeys: () => [...chunks.keys()],
  addSteps: n => { H.steps += n; },
  ask: (tag, skill) => askBubble({ x: H.x + 2, z: H.z, y: 2.4 }, tag, skill), say: lines => FF.dialog(lines, { name: 'Elder Brightscale', img: elderPortrait() }),
});
