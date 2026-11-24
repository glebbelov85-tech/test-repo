'use strict';
// «Домик Зайки» 3.0 — 3D развивающая игра для Миры (3 года).
const VERSION = '5.0';
const ROUNDS = 5;

// ---------- сохранение ----------
const S = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('zaika1') || '{}'); } catch (e) {}
  s.stars = s.stars || {};
  return s;
})();
const save = () => { try { localStorage.setItem('zaika1', JSON.stringify(S)); } catch (e) {} };

// ---------- утилиты ----------
const rnd = n => Math.floor(Math.random() * n);
const rr = (a, b) => a + Math.random() * (b - a);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const V = (x, y, z) => new T.Vector3(x, y, z);
// «Мешочек»: задания идут по кругу без повторов, пока не выпадут все варианты (никто не остаётся голодным)
function bag(g, name, items) {
  const B = g._bag || (g._bag = {}); let b = B[name];
  if (!b || !b.q.length) { const q = shuffle(items); if (b && q.length > 1 && q[0] === b.last) q.push(q.shift()); b = B[name] = { q, last: b ? b.last : null }; }
  return (b.last = b.q.shift());
}

// ---------- звук ----------
let AC = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, t0, dur, type = 'sine', vol = 0.18, f2) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0, c.currentTime + t0);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
}
function noise(t0, dur, vol = 0.2, freq = 1800) {
  const c = ac(); if (!c) return;
  const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol; s.buffer = b;
  s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + t0);
}
const SFX = {
  tap() { tone(660, 0, 0.12, 'triangle', 0.12, 880); },
  pop() { noise(0, 0.12, 0.5, 2400); tone(420, 0, 0.1, 'sine', 0.2, 180); },
  plop() { tone(500, 0, 0.15, 'sine', 0.25, 1300); },
  good() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.14)); },
  soft() { tone(330, 0, 0.18, 'sine', 0.14, 260); tone(300, 0.16, 0.22, 'sine', 0.12, 240); },
  whoosh() { tone(300, 0, 0.3, 'sine', 0.1, 900); },
  thunk() { tone(160, 0, 0.16, 'sine', 0.3, 70); noise(0, 0.06, 0.15, 500); },
  boing() { tone(220, 0, 0.28, 'sine', 0.16, 520); },
  munch() { noise(0, 0.07, 0.25, 900); noise(0.12, 0.07, 0.2, 800); },
  fanfare() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, i === 5 ? 0.7 : 0.22, 'triangle', 0.16)); },
  chirp() { const f = 2400 + Math.random() * 1200; tone(f, 0, 0.07, 'sine', 0.025, f * 1.3); tone(f * 1.1, 0.1, 0.06, 'sine', 0.02, f * 1.4); },
  twinkle() { tone(1568, 0, 0.5, 'sine', 0.05); tone(2093, 0.1, 0.5, 'sine', 0.04); },
};

// ---------- голос ----------
const TEXT = {}; (window.FRAZY || []).forEach(([id, t]) => TEXT[id] = t);
let speaker = null; // кто «говорит» по умолчанию (Зайка в комнате)
const Voice = {
  have: new Set(window.ZAPISI || []),
  buf: {}, token: 0, src: null, ru: null, cur: null,
  pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices().filter(v => /^ru/i.test(v.lang));
    this.ru = vs.find(v => /milena|female|жен|google/i.test(v.name)) || vs[0] || null;
  },
  load(id) {
    if (!this.have.has(id)) return Promise.resolve(null);
    if (this.buf[id]) return this.buf[id];
    const c = ac();
    this.buf[id] = fetch('voice/' + id + '.mp3?v=' + VERSION)
      .then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(b => new Promise((res, rej) => c.decodeAudioData(b, res, rej)))
      .catch(() => { this.have.delete(id); return null; });
    return this.buf[id];
  },
  preload(ids) { ids.forEach(id => this.load(id)); },
  stop() {
    this.token++;
    if (this.cur) { this.cur.userData.talk = false; this.cur = null; }
    if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  // who: объект-персонаж, функция id => персонаж, null (никто) или undefined (Зайка)
  async say(ids, who) {
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.filter(Boolean);
    this.stop();
    const t = this.token;
    for (const id of ids) {
      if (t !== this.token) return false;
      const w = typeof who === 'function' ? who(id) : (who === undefined ? speaker : who);
      if (w) { w.userData.talk = true; this.cur = w; }
      await this.one(id, t);
      if (w) w.userData.talk = false;
      if (t === this.token) this.cur = null;
    }
    return t === this.token;
  },
  one(id, t) {
    if (this.have.has(id)) {
      return this.load(id).then(b => {
        if (t !== this.token) return;
        if (!b) return this.tts(TEXT[id] || id);
        return new Promise(res => {
          const c = ac(), s = c.createBufferSource();
          s.buffer = b; s.connect(c.destination);
          s.onended = res; this.src = s; s.start();
          setTimeout(res, b.duration * 1000 + 400);
        });
      });
    }
    return this.tts(TEXT[id] || id);
  },
  tts(text) {
    return new Promise(res => {
      const est = 900 + text.length * 85;
      if (!window.speechSynthesis) { setTimeout(res, est); return; }
      const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ''));
      u.lang = 'ru-RU'; u.rate = 0.9; u.pitch = 1.2;
      if (this.ru) u.voice = this.ru;
      let done = false; const fin = () => { if (!done) { done = true; res(); } };
      u.onend = fin; u.onerror = fin; setTimeout(fin, est + 1500);
      speechSynthesis.speak(u);
    });
  },
};
if (window.speechSynthesis) { Voice.pickVoice(); speechSynthesis.onvoiceschanged = () => Voice.pickVoice(); }

const PRAISE = ['molodec', 'molodec_mira', 'umnica', 'pravilno', 'ura', 'zdorovo', 'poluchilos'];
let lastPraise = '';
function praise() { let p; do p = pick(PRAISE); while (p === lastPraise); lastPraise = p; return p; }

// ---------- рендер ----------
const canvas = document.getElementById('c');
const R = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
R.outputEncoding = T.sRGBEncoding;
R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
const MOBILE = (navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width, screen.height) < 900;
let DPR = Math.min(window.devicePixelRatio || 1, S.low ? 1 : 2);
const scene = new T.Scene();
const cam = new T.PerspectiveCamera(30, 1, 1, 400);
scene.add(cam);
let world = null, landscape = true, time = 0;
let sunLight = null;

const FR = { cx: 0, cy: 5, cz: 0, halfW: 8, halfH: 5, pitch: 9 };
const camBase = V(0, 0, 0), camLook = V(0, 0, 0);
function applyFrame() {
  const t = Math.tan(cam.fov / 2 * Math.PI / 180);
  const d = Math.max(FR.halfH / t, FR.halfW / (t * cam.aspect));
  const p = FR.pitch * Math.PI / 180;
  camLook.set(FR.cx, FR.cy, FR.cz);
  camBase.set(FR.cx, FR.cy + d * Math.sin(p), FR.cz + d * Math.cos(p));
}
function setFrame(o) { Object.assign(FR, { cx: 0, cz: 0, pitch: landscape ? 9 : 7 }, o); applyFrame(); }
function fit() {
  const w = innerWidth, h = innerHeight, L = w >= h, changed = L !== landscape;
  landscape = L;
  R.setPixelRatio(DPR); R.setSize(w, h);
  cam.aspect = w / h; cam.updateProjectionMatrix(); applyFrame();
  return changed;
}

// ---------- твины ----------
const EASE = {
  lin: k => k,
  out: k => 1 - Math.pow(1 - k, 3),
  in: k => k * k * k,
  inout: k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
  back: k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2),
  elastic: k => k === 0 ? 0 : k === 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  bounce: k => { const n = 7.5625, d = 2.75; if (k < 1 / d) return n * k * k; if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75; if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375; return n * (k -= 2.625 / d) * k + 0.984375; },
};
let TW = [];
function tw(o, to, ms, ease = 'out', delay = 0) {
  return new Promise(res => TW.push({ o, to, from: null, t: -delay / 1000, d: Math.max(0.001, ms / 1000), e: EASE[ease], res }));
}
function twf(ms, fn, ease = 'lin', delay = 0) {
  return new Promise(res => TW.push({ fn, t: -delay / 1000, d: Math.max(0.001, ms / 1000), e: EASE[ease], res }));
}
const wait = ms => twf(ms, () => {});
const tws = (obj, s, ms, ease, delay) => tw(obj.scale, { x: s, y: s, z: s }, ms, ease, delay);
function updateTweens(dt) {
  const list = TW; let j = 0;
  for (let i = 0; i < list.length; i++) {
    const w = list[i]; w.t += dt;
    if (w.t >= 0) {
      const k = Math.min(1, w.t / w.d), e = w.e(k);
      if (w.fn) w.fn(e, k);
      else {
        if (!w.from) { w.from = {}; for (const p in w.to) w.from[p] = w.o[p]; }
        for (const p in w.to) w.o[p] = w.from[p] + (w.to[p] - w.from[p]) * e;
      }
      if (k >= 1) { w.res(); continue; }
    }
    list[j++] = w;
  }
  if (TW === list) list.length = j; // если во время обновления сцену не сменили
}
function arc(obj, to, ms, h = 1.5, ease = 'inout') {
  const a = obj.position.clone();
  return twf(ms, e => { obj.position.lerpVectors(a, to, e); obj.position.y += Math.sin(e * Math.PI) * h; }, ease);
}
function popIn(obj, s = 1, delay = 0, ms = 480) { obj.scale.setScalar(0.001); return tws(obj, s, ms, 'back', delay); }
// Все «подпрыгивания» прибавляют сдвиг поверх текущего положения: сколько раз ни нажми, объект вернётся на место.
function hop(obj, h = 0.7, ms = 420) { let p = 0; return twf(ms, e => { const v = Math.sin(e * Math.PI) * h; obj.position.y += v - p; p = v; }); }
function wobble(obj, amp = 0.3, ms = 520) { let p = 0; return twf(ms, (e, k) => { const v = Math.sin(k * Math.PI * 5) * amp * (1 - k); obj.rotation.z += v - p; p = v; }); }
function squash(obj, ms = 380) { let p = 0; return twf(ms, (e, k) => { const q = Math.sin(k * Math.PI * 2) * 0.12 * (1 - k), a = (1 + q) / (1 + p), b = (1 - q) / (1 - p); obj.scale.set(obj.scale.x * a, obj.scale.y * b, obj.scale.z * a); p = q; }); }
function nudge(obj) { let p = 0; return twf(1300, (e, k) => { const q = Math.abs(Math.sin(k * Math.PI * 3)) * 0.16; obj.scale.multiplyScalar((1 + q) / (1 + p)); p = q; }); }
function headNo(a) { const h = a.userData.head; if (!h) return; return twf(650, (e, k) => { h.rotation.y = Math.sin(k * Math.PI * 4) * 0.45 * (1 - k); }); }
function happy(a, spin = true) {
  let py = 0, pr = 0; SFX.boing();
  return twf(900, (e, k) => {
    const y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.9 * (k < 0.5 ? 1 : 0.6), r = spin ? EASE.inout(Math.min(1, k * 2)) * Math.PI * 2 : 0;
    a.position.y += y - py; a.rotation.y += r - pr; py = y; pr = r;
  }).then(() => { a.rotation.y -= pr; });
}

// ---------- персонажи: моргание, дыхание, речь ----------
let ACT = [];
function actor(g) { g.userData.blink = rr(1, 4); g.userData.bph = Math.random() * 6; ACT.push(g); return g; }
function updateActors(dt) {
  for (const g of ACT) {
    const U = g.userData;
    if (U.tick) U.tick(time, dt);
    if (U.body && U.bodyS && !U.noBreath) U.body.scale.y = U.bodyS.y * (1 + Math.sin(time * 2.1 + U.bph) * 0.022);
    if (U.eyes) {
      U.blink -= dt;
      const sy = U.sleep ? 0.12 : (U.blink < 0.13 && U.blink > 0 ? 0.12 : 1);
      if (U.blink <= 0) U.blink = rr(2, 5);
      U.eyes[0].scale.y = U.eyes[1].scale.y = sy;
    }
    if (U.mouth) {
      const m = U.mouth, s = U.mouthS;
      if (U.talk) { const o = Math.abs(Math.sin(time * 13 + U.bph)); m.scale.set(s.x * (1 + o * 0.25), s.y * (1 + o * 2.6), s.z); if (U.head && !U.tickHead) U.head.rotation.x = Math.sin(time * 9) * 0.05; }
      else m.scale.copy(s);
    }
  }
}

// ---------- частицы ----------
let PART = [];
const CONF_COLS = ['#ffd54f', '#ff6b8a', '#4fc3f7', '#81c784', '#ba68c8', '#ffb74d'];
const _confGeo = new T.PlaneGeometry(0.26, 0.14);
function burst(pos, n = 14, cols = CONF_COLS, o = {}) {
  const parent = o.parent || world;
  for (let i = 0; i < n; i++) {
    const star = o.conf ? false : i % 3 !== 2;
    const m = star ? new T.Mesh(GEO.star, M(pick(cols), 0.4)) : new T.Mesh(_confGeo, new T.MeshBasicMaterial({ color: C(pick(cols)), side: T.DoubleSide }));
    const s = star ? rr(0.12, 0.26) * (o.size || 1) : rr(0.8, 1.5) * (o.size || 1);
    m.position.copy(pos); m.scale.setScalar(s);
    const a = Math.random() * Math.PI * 2, sp = rr(2, 6) * (o.speed || 1);
    PART.push({ m, v: V(Math.cos(a) * sp, rr(2, 7) * (o.speed || 1) * (o.up === undefined ? 1 : o.up), Math.sin(a) * sp * 0.5), w: V(rr(-8, 8), rr(-8, 8), rr(-8, 8)), life: rr(0.9, 1.5), t: 0, s, g: o.g === undefined ? 11 : o.g, flat: !star });
    parent.add(m);
  }
}
function updateParts(dt) {
  let j = 0;
  for (let i = 0; i < PART.length; i++) {
    const p = PART[i]; p.t += dt;
    if (p.t >= p.life) { p.m.parent && p.m.parent.remove(p.m); continue; }
    p.v.y -= p.g * dt; if (p.flat) { p.v.multiplyScalar(1 - 1.5 * dt); }
    p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += p.w.x * dt; p.m.rotation.y += p.w.y * dt; p.m.rotation.z += p.w.z * dt;
    const k = p.t / p.life; p.m.scale.setScalar(p.s * (k > 0.7 ? (1 - k) / 0.3 : 1));
    PART[j++] = p;
  }
  PART.length = j;
}
// светящееся кольцо-подсказка
let HALO = [];
function halo(obj, r, y = 0) {
  if (obj.userData.halo) return;
  const m = new T.Mesh(new T.TorusGeometry(r, r * 0.09, 8, 40), new T.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.9, depthTest: false }));
  m.position.y = y; m.renderOrder = 5; obj.add(m); obj.userData.halo = m; HALO.push(m);
}
function unhalo(obj) { const m = obj.userData.halo; if (m) { obj.remove(m); HALO = HALO.filter(x => x !== m); obj.userData.halo = null; } }

// ---------- текстуры ----------
function cnv(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
}
function grad(top, bottom, mid) {
  return cnv(8, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); if (mid) g.addColorStop(0.55, mid); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, w, h); });
}

// ---------- свет ----------
function lights(g, o = {}) {
  g.add(new T.HemisphereLight(C(o.sky || '#ffffff'), C(o.gnd || '#ffe2c2'), o.hi === undefined ? 0.56 : o.hi));
  const d = new T.DirectionalLight(C(o.sun || '#fff1dc'), o.di === undefined ? 0.52 : o.di);
  d.position.set(o.lx === undefined ? 7 : o.lx, (o.ly || 17) + (o.ty || 4) - 4, 15); d.target.position.set(o.tx || 0, o.ty || 4, 0); g.add(d.target);
  d.castShadow = !S.low;
  const sz = MOBILE ? 1024 : 2048; d.shadow.mapSize.set(sz, sz);
  const c = d.shadow.camera, q = o.sh || 19; c.left = -q; c.right = q; c.top = q; c.bottom = -q; c.near = 1; c.far = 70;
  d.shadow.bias = -0.0006; d.shadow.normalBias = 0.04; d.shadow.radius = 4;
  g.add(d); sunLight = d; return d;
}

// ---------- окружение ----------
let ENVT = []; // функции анимации окружения
function meadow(g, o = {}) {
  scene.background = grad(o.top || '#6ec6ff', o.bottom || '#eafaff', o.mid || '#bfe9ff');
  const gt = cnv(256, 256, (x, w, h) => { const r = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); r.addColorStop(0, '#a5e67f'); r.addColorStop(0.5, '#86d566'); r.addColorStop(1, '#6cc257'); x.fillStyle = r; x.fillRect(0, 0, w, h); });
  const gr = new T.Mesh(new T.CircleGeometry(90, 48), new T.MeshStandardMaterial({ map: gt, roughness: 1 }));
  gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; g.add(gr);
  // холмы
  [[-22, -34, 20, 8, '#7ed068'], [14, -40, 26, 10, '#72c860'], [34, -30, 16, 6, '#88d873'], [-40, -28, 14, 5, '#88d873']].forEach(([x, z, r, h, c]) => { const m = ball(M(c, 1), [r, h, r * 0.6], x, -0.5, z); m.castShadow = false; g.add(m); });
  // облака
  const cm = M('#ffffff', 1, { emissive: C('#ffffff'), emissiveIntensity: 0.25 });
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const c = grp(rr(-30, 30), rr(11, 19), rr(-34, -22));
    for (let k = 0; k < 5; k++) { const b = ball(cm, [rr(1.2, 2.2), rr(0.9, 1.4), 1.2], (k - 2) * 1.5, rr(-0.3, 0.4), rr(-0.4, 0.4), true); b.castShadow = false; c.add(b); }
    c.scale.setScalar(rr(0.9, 1.5)); c.userData.v = rr(0.25, 0.6); g.add(c); clouds.push(c);
  }
  // солнце
  const sun = grp(o.sunX === undefined ? -13 : o.sunX, 17, -36);
  sun.add(ball(new T.MeshBasicMaterial({ color: C('#ffe066') }), 2.2));
  for (let i = 0; i < 10; i++) { const r = mesh(new T.ConeGeometry(0.35, 1.3, 6), new T.MeshBasicMaterial({ color: C('#ffd23f') })); const a = i / 10 * Math.PI * 2; r.position.set(Math.cos(a) * 3.3, Math.sin(a) * 3.3, 0); r.rotation.z = a - Math.PI / 2; r.castShadow = false; sun.add(r); }
  sun.children[0].castShadow = false; g.add(sun);
  // цветы
  const fc = ['#ff6b8a', '#ffd54f', '#ffffff', '#ba68c8', '#ff8a65', '#4fc3f7'];
  const flowers = [];
  const spots = [];
  for (let i = 0; i < 34; i++) { const front = i % 4 === 0; spots.push([rr(-17, 17), front ? rr(4.5, 7) : rr(-12, -2.5)]); }
  spots.forEach(([x, z]) => {
    const f = grp(x, 0, z), col = M(pick(fc), 0.7);
    const st = cyl(M('#4caf50', 0.9), 0.03, 0.04, 0.6, 0, 0.3, 0, 5); st.castShadow = false; f.add(st);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; f.add(ball(col, [0.11, 0.11, 0.05], Math.cos(a) * 0.13, 0.62 + Math.sin(a) * 0.13, 0, true)); }
    f.add(ball(M('#ffca28', 0.6), 0.08, 0, 0.62, 0.03, true));
    f.scale.setScalar(rr(0.8, 1.4)); f.userData.ph = Math.random() * 6; g.add(f); flowers.push(f);
  });
  // трава
  const N = 220, im = new T.InstancedMesh(new T.ConeGeometry(0.07, 0.42, 4), M('#5dbb4d', 1), N), d = new T.Object3D();
  for (let i = 0; i < N; i++) { d.position.set(rr(-20, 20), 0.18, rr(-14, 7)); d.rotation.set(rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3)); const s = rr(0.7, 1.5); d.scale.set(s, s, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
  g.add(im);
  // бабочки
  const bfs = [];
  for (let i = 0; i < 2; i++) {
    const b = grp(), col = new T.MeshBasicMaterial({ color: C(i ? '#ff80ab' : '#ffb300'), side: T.DoubleSide });
    const wg = [-1, 1].map(s => { const p = grp(); const m = new T.Mesh(new T.CircleGeometry(0.22, 10), col); m.position.x = s * 0.2; m.scale.y = 1.3; p.add(m); b.add(p); return p; });
    b.userData = { wg, ph: i * 3, cx: i ? 5 : -5 }; g.add(b); bfs.push(b);
  }
  let chirp = rr(2, 5);
  ENVT.push((t, dt) => {
    clouds.forEach(c => { c.position.x += c.userData.v * dt; if (c.position.x > 40) c.position.x = -40; });
    sun.rotation.z = t * 0.15; sun.scale.setScalar(1 + Math.sin(t * 1.5) * 0.03);
    flowers.forEach(f => f.rotation.z = Math.sin(t * 1.6 + f.userData.ph) * 0.12);
    bfs.forEach(b => { const u = b.userData, a = t * 0.5 + u.ph; b.position.set(u.cx + Math.sin(a) * 6, 2.5 + Math.sin(a * 2.3) * 1.2 + (landscape ? 0 : 2), -3 + Math.cos(a * 0.8) * 2); b.rotation.y = Math.cos(a) > 0 ? 0.6 : -0.6; const f = Math.sin(t * 16 + u.ph) * 1.0; u.wg[0].rotation.y = f; u.wg[1].rotation.y = -f; });
    chirp -= dt; if (chirp < 0) { chirp = rr(3, 8); if (AC) SFX.chirp(); }
  });
  return { sun, clouds };
}
// травяной уступ: задний ряд стоит выше, и всех видно
function terrace(y, z, x0 = -30, x1 = 30) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const t = rbox(M('#8fd870', 1), w, y, 9, 0.5, cx, y / 2 - 0.05, z - 4.5); t.receiveShadow = true; world.add(t);
  const e = mesh(new T.BoxGeometry(w, 0.5, 0.3), M('#74c45c', 1), cx, y - 0.35, z + 0.02); e.castShadow = false; world.add(e);
}
function interior(g, o) {
  scene.background = new T.Color(C(o.wall));
  const wt = cnv(256, 256, (x, w, h) => {
    x.fillStyle = o.wall; x.fillRect(0, 0, w, h); x.fillStyle = o.dot;
    if (o.stars) { for (let i = 0; i < 9; i++) { x.globalAlpha = rr(0.4, 0.9); const px = rr(10, w - 10), py = rr(10, h - 10), r = rr(2, 5); x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; x.lineTo(px + Math.sin(a) * q, py - Math.cos(a) * q); } x.fill(); } }
    else { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(i * 64 + (j % 2 ? 48 : 16), j * 64 + 32, 9, 0, 7); x.fill(); } }
  });
  wt.wrapS = wt.wrapT = T.RepeatWrapping; wt.repeat.set(14, 7);
  const wall = new T.Mesh(new T.PlaneGeometry(90, 45), new T.MeshStandardMaterial({ map: wt, roughness: 1 }));
  wall.position.set(0, 20, -3.6); wall.receiveShadow = true; g.add(wall);
  const ft = cnv(256, 256, (x, w, h) => {
    x.fillStyle = `hsl(${o.floorHue || 30},${o.floorSat || 55}%,${o.floorL || 62}%)`; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) { for (let k = 0; k < 3; k++) { const l = 40 + rnd(14); x.fillStyle = `hsl(${o.floorHue || 30},${o.floorSat || 55}%,${(o.floorL || 62) + l - 46}%)`; const x0 = k * 96 + (r % 2 ? -48 : 0); if (k === 2 && r % 2) { x.fillRect(240, r * 64, 96, 64); x.strokeStyle = 'rgba(0,0,0,.14)'; x.strokeRect(240, r * 64, 96, 64); } x.fillRect(x0, r * 64, 96, 64); x.strokeStyle = 'rgba(0,0,0,.14)'; x.lineWidth = 2; x.strokeRect(x0, r * 64, 96, 64); } }
  });
  ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(12, 4);
  const fl = new T.Mesh(new T.PlaneGeometry(90, 24), new T.MeshStandardMaterial({ map: ft, roughness: 0.8 }));
  fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, 8.4); fl.receiveShadow = true; g.add(fl);
  const bb = mesh(new T.BoxGeometry(90, 0.5, 0.2), M(o.base || '#ffffff', 0.8), 0, 0.25, -3.5); bb.receiveShadow = true; g.add(bb);
}

// ---------- касания ----------
let PICK = [];
let inputLock = 0; // время, до которого касания не принимаются
const ray = new T.Raycaster(), ndc = new T.Vector2();
function pickable(root, onTap, drag) {
  root.userData.pick = { onTap, drag }; PICK.push(root); return root;
}
function unpick(root) { PICK = PICK.filter(p => p !== root); root.userData.pick = null; }
function scr(obj, dy = 0) {
  const v = obj.getWorldPosition(new T.Vector3()); v.y += dy; v.project(cam);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}
function findPick(e) {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const list = PICK.filter(p => !p.userData.locked && p.visible);
  const hits = ray.intersectObjects(list.map(p => p.userData.hit || p), true);
  for (const h of hits) { let o = h.object; while (o) { if (o.userData.pick && !o.userData.locked) return o; o = o.parent; } }
  // промах: берём ближайший объект, если палец совсем рядом
  let best = null, bd = Math.min(innerWidth, innerHeight) * 0.085;
  for (const p of list) { const s = scr(p, p.userData.cy || 0), d = Math.hypot(s.x - e.clientX, s.y - e.clientY); if (d < bd) { bd = d; best = p; } }
  return best;
}
let dragging = null;
const dragPlane = new T.Plane(), dragPt = new T.Vector3();
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); Idle.poke();
  if (current && current.fp) return; // в доме касания разбирает dom.js
  if (performance.now() < inputLock || dragging) return;
  const p = findPick(e); if (!p) return;
  const pk = p.userData.pick;
  if (pk.drag) {
    const n = cam.getWorldDirection(new T.Vector3()).negate();
    dragPlane.setFromNormalAndCoplanarPoint(n, p.position);
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    ray.ray.intersectPlane(dragPlane, dragPt);
    dragging = { p, pk, id: e.pointerId, off: p.position.clone().sub(dragPt), home: p.position.clone(), sx: e.clientX, sy: e.clientY, moved: false };
    p.userData.held = true; p.scale.multiplyScalar(1.12);
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    pk.drag.onGrab && pk.drag.onGrab();
  } else pk.onTap && pk.onTap(p);
});
canvas.addEventListener('pointermove', e => {
  const d = dragging; if (!d || e.pointerId !== d.id) return;
  if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 10) d.moved = true;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
  if (ray.ray.intersectPlane(dragPlane, dragPt)) d.p.position.copy(dragPt).add(d.off);
});
function endDrag(e) {
  const d = dragging; if (!d || (e && e.pointerId !== d.id)) return;
  dragging = null; d.p.userData.held = false; d.p.scale.multiplyScalar(1 / 1.12);
  if (!d.moved) { d.p.position.copy(d.home); d.pk.drag.onTap && d.pk.drag.onTap(); return; }
  const ok = d.pk.drag.onDrop(d.home);
  if (!ok) arc(d.p, d.home, 380, 0.6);
}
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
function nearestScr(targets, obj, frac = 0.3, dy = 0) {
  const a = scr(obj, dy); let best = null, bd = Math.min(innerWidth, innerHeight) * frac;
  for (const t of targets) { const b = scr(t, t.userData.cy || 0), d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; best = t; } }
  return best;
}

// подсказка, если ребёнок долго ничего не делает
const Idle = {
  t: null, fn: null, n: 0,
  set(fn) { this.fn = fn; this.n = 0; this.arm(); },
  arm() { clearTimeout(this.t); if (this.fn && this.n < 3) this.t = setTimeout(() => { this.n++; this.fn(); this.arm(); }, this.n ? 12000 : 8000); },
  poke() { if (this.fn) { this.n = Math.min(this.n, 1); this.arm(); } },
  off() { clearTimeout(this.t); this.fn = null; },
};

// ---------- интерфейс (HTML) ----------
const $ = id => document.getElementById(id);
const UI = { top: $('top'), stars: $('stars'), fin: $('fin'), start: $('start'), wipe: $('wipe') };
const STAR_SVG = on => `<svg viewBox="0 0 100 100"><path d="M50 6 L62 37 L95 39 L69 60 L78 93 L50 74 L22 93 L31 60 L5 39 L38 37Z" fill="${on ? '#ffd23f' : 'rgba(255,255,255,.6)'}" stroke="${on ? '#f59e0b' : 'rgba(0,0,0,.16)'}" stroke-width="6" stroke-linejoin="round"/></svg>`;
function uiStars(n) { UI.stars.innerHTML = [...Array(ROUNDS)].map((_, i) => `<i class="${i < n ? 'on' : ''}">${STAR_SVG(i < n)}</i>`).join(''); }
function tapBtn(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); }); }
tapBtn($('bHome'), () => { SFX.tap(); go((current && current.back) || goHome); });
tapBtn($('bRep'), () => { SFX.tap(); current && current.repeat && current.repeat(); });
tapBtn($('bAgain'), () => { SFX.tap(); if (current && current.again) return go(current.again); const k = current && current.key; if (k) go(() => runRoom(k)); });
tapBtn($('bHome2'), () => { SFX.tap(); go(goHome); });
const LVL = $('lvl');
const STAR_P = 'M50 6 L62 37 L95 39 L69 60 L78 93 L50 74 L22 93 L31 60 L5 39 L38 37Z';
// возраст ребёнка: 0 — 3–4 года, 1 — 4–5 лет, 2 — 5–7 лет. Чтобы малыш не сменил случайно, кнопку нужно подержать.
const AGES = ['3–4 года', '4–5 лет', '5–7 лет'];
function updLvl() { [...LVL.querySelectorAll('.age')].forEach((b, i) => b.classList.toggle('sel', S.diff !== undefined && i === lvlOf())); }
function setAge(i) { S.diff = i; save(); updLvl(); for (let k = 0; k <= i; k++) tone(660 + k * 220, k * 0.11, 0.16, 'triangle', 0.13); }
['3', '4', '5+'].forEach((t, i) => {
  const b = document.createElement('div'); b.className = 'btn age'; b.innerHTML = `<b>${t}</b>`; let tm = 0;
  const stop = () => { clearTimeout(tm); tm = 0; b.classList.remove('hold'); };
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (S.diff !== undefined && i === lvlOf()) { SFX.tap(); return; } SFX.tap(); b.classList.add('hold'); tm = setTimeout(() => { stop(); setAge(i); }, 800); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => b.addEventListener(n, stop));
  LVL.appendChild(b);
});
{ const p = document.createElement('div'); p.className = 'par'; p.textContent = 'Родителям'; tapBtn(p, () => { SFX.tap(); openPar(); }); LVL.appendChild(p); }
// ---------- страничка для родителей и вопрос про возраст ----------
const PAR = $('par');
const ROOM_RU = { hall: 'Гостиная: цвета', kuh: 'Кухня: кто что любит', igr: 'Игровая: мячики по цветам', spal: 'Спальня: большой и маленький', zak: 'Заказы: счёт', zal: 'Зал с мячами: цвет и счёт', h3: 'Буквы на шариках', poch: 'Почта', azb: 'Азбука', h4: 'Кубики и слова', logic: 'Что дальше?' };
const COL_RU = { krasny: 'красный', zhelty: 'жёлтый', siniy: 'синий', zeleny: 'зелёный', oranzhevy: 'оранжевый', rozovy: 'розовый' };
function closePar() { PAR.classList.remove('on'); PAR.innerHTML = ''; }
function ageBtns(done) { return `<div class="ages">${AGES.map((a, i) => `<div class="ab${S.diff !== undefined && i === lvlOf() ? ' sel' : ''}" data-a="${i}">${a}</div>`).join('')}</div>`; }
function bindPar(after) {
  PAR.querySelectorAll('.ab').forEach(b => b.addEventListener('pointerdown', e => { e.stopPropagation(); setAge(+b.dataset.a); after(); }));
  const x = PAR.querySelector('.x'); if (x) x.addEventListener('pointerdown', e => { e.stopPropagation(); SFX.tap(); closePar(); });
}
function askAge() {
  PAR.innerHTML = `<div class="card small"><h2>Сколько лет ребёнку?</h2>${ageBtns()}<p class="dim">От возраста зависят задания во всех комнатах. Потом его можно поменять в домике: кнопки 3, 4 и 5+ вверху справа.</p></div>`;
  PAR.classList.add('on'); bindPar(closePar);
}
function openPar() {
  const a = lvlOf(), st = (S.st || {})[a] || {}, er = S.err || {};
  const rows = Object.keys(ROOM_RU).map(k => { const r = st[k] || {}; return `<tr><td>${ROOM_RU[k]}</td><td>${'●'.repeat((r.s || 0) + 1)}${'○'.repeat(2 - (r.s || 0))}</td><td>${r.n || 0}</td></tr>`; }).join('');
  const hard = [['c_', 'цвета', k => COL_RU[k]], ['b_', 'буквы', k => k]].map(([p, name, f]) => { const l = Object.keys(er).filter(k => k.startsWith(p)).map(k => f(k.slice(2))).filter(Boolean); return l.length ? `${name}: ${l.join(', ')}` : ''; }).filter(Boolean).join('; ');
  PAR.innerHTML = `<div class="card"><div class="x">✕</div><h2>Родителям</h2>
<p><b>«Домик Зайки» растёт вместе с ребёнком.</b> Это один дом на три возраста: 3–4 года, 4–5 лет и 5–7 лет. Комнаты те же, а задания в них становятся глубже. Игра не на один год: когда ребёнок подрос, достаточно сменить возраст.</p>
<h3>Возраст сейчас</h3>${ageBtns()}
<p class="dim">В домике возраст меняют кнопки 3, 4 и 5+ вверху справа. Кнопку нужно подержать секунду, чтобы малыш не переключил случайно.</p>
<h3>Как устроен дом</h3>
<table><tr><th>Этаж</th><th>3–4 года</th><th>4–5 лет</th><th>5–7 лет</th></tr>
<tr><td>1. Цвета, размеры, кто что любит</td><td>находит цвет, большой и маленький, кормит зверят</td><td>цвет и размер вместе, три размера, сам выбирает еду</td><td>запоминает порядок, выполняет просьбу из двух и трёх шагов</td></tr>
<tr><td>2. Счёт</td><td>один и два, потом три</td><td>до пяти, цифра и столько же точек</td><td>несколько заказов сразу, только цифры</td></tr>
<tr><td>3. Буквы</td><td>А, О, У, М, И; одинаковые картинки; «принеси утку»</td><td>десять букв, буква к букве, «что начинается на М»</td><td>все буквы, первая буква слова на слух</td></tr>
<tr><td>4. Слова и логика</td><td>повторяет ряд из фигур, простые цепочки</td><td>слова из трёх букв с подсказкой, цепочки сложнее</td><td>слова без подсказки, цепочки из трёх и по размеру</td></tr></table>
<h3>Игра подстраивается сама</h3>
<p>В каждой комнате есть три скрытые ступеньки. Два раза прошёл почти без ошибок, и задание станет чуть труднее. Много ошибок, и оно станет чуть легче. То, что ребёнок путает, встречается чаще. Звёздочка над дверью показывает, куда идти дальше, но весь дом открыт всегда.</p>
<h3>Как идут дела (${AGES[a]})</h3>
<table><tr><th>Комната</th><th>Ступенька</th><th>Пройдено раз</th></tr>${rows}</table>
<p>${hard ? 'Сейчас повторяем чаще: ' + hard + '.' : 'Трудных мест пока не замечено.'}</p>
<p class="dim">Играйте по 10–15 минут. Лучше всего рядом со взрослым: называйте вслух цвета, цифры и буквы вместе с Зайкой.</p></div>`;
  PAR.classList.add('on'); bindPar(openPar);
}

// ---------- смена сцен ----------
let session = 0, current = null, busyWipe = false;
const ON_CLEAR = []; // что ещё убрать при смене сцены (добавляют другие файлы)
function clearWorld() {
  session++; Idle.off(); Voice.stop();
  ON_CLEAR.forEach(f => f());
  if (cam.fov !== 30) { cam.fov = 30; cam.near = 1; cam.far = 400; cam.updateProjectionMatrix(); }
  TW = []; ACT = []; PART = []; PICK = []; HALO = []; ENVT = []; dragging = null; speaker = null;
  if (world) {
    scene.remove(world);
    const shared = new Set(Object.values(GEO)); shared.add(_confGeo);
    world.traverse(o => { if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose(); if (o.material && o.material.map) { o.material.map.dispose(); o.material.dispose(); } });
  }
  for (let i = cam.children.length - 1; i >= 0; i--) cam.remove(cam.children[i]);
  if (scene.background && scene.background.isTexture) scene.background.dispose();
  world = new T.Group(); scene.add(world);
  UI.fin.classList.remove('on'); UI.top.classList.remove('on'); UI.start.classList.remove('on'); LVL.classList.remove('on'); closePar(); $('ris').classList.remove('on');
  return session;
}
async function go(fn) {
  if (busyWipe) return; busyWipe = true; inputLock = performance.now() + 900;
  UI.wipe.classList.add('on');
  await new Promise(r => setTimeout(r, 380));
  fn();
  await new Promise(r => setTimeout(r, 120));
  UI.wipe.classList.remove('on');
  setTimeout(() => busyWipe = false, 350);
}

// ---------- комнаты ----------
const ROOMS = {};
// уровень сложности выбирают кнопками-звёздочками в домике: 0 — легко, 1 — средне, 2 — сложно
function lvlOf() { return S.diff === undefined ? 0 : S.diff; }

function runRoom(key, keepRound) {
  const Rm = ROOMS[key];
  const my = clearWorld();
  const g = { key, lvl: window.__lvl !== undefined ? window.__lvl : lvlOf(key), round: keepRound || 0, wrong: 0, alive: () => my === session, tick: null };
  current = { name: key, key, rebuild: () => runRoom(key, g.round), g, repeat: () => g.repeat && g.repeat() };
  UI.top.classList.add('on'); uiStars(g.round);
  Voice.preload((Rm.voice || []).concat(PRAISE, ['podskazka', 'final', 'esche']));
  Rm.setup(g);
  if (g.zaika) {
    speaker = g.zaika;
    hitBox(g.zaika, 1.9, 3.6, 1.6, 0, 1.7, 0); g.zaika.userData.cy = 1.7;
    pickable(g.zaika, () => { hop(g.zaika, 0.6); SFX.boing(); g.repeat && g.repeat(); });
  }
  g.next = () => {
    if (!g.alive()) return;
    g.wrong = 0; Idle.off();
    if (g.round >= ROUNDS) return finish(g);
    Rm.round(g);
  };
  // правильный ответ: звезда, салют, похвала
  g.solved = async (pos, sayFirst, who) => {
    Idle.off();
    uiStars(g.round + 1);
    burst(pos, 16); SFX.good();
    g.round++;
    if (g.zaika) happy(g.zaika);
    const seq = [].concat(sayFirst || []);
    if (seq.length) await Voice.say(seq, who);
    if (!g.alive()) return;
    await Voice.say(praise());
    if (!g.alive()) return;
    await wait(250);
    g.next();
  };
  // ошибка: мягко, без «нет». Возвращает true, когда пора показать подсказку
  g.miss = () => { g.wrong++; SFX.soft(); inputLock = performance.now() + 650; if (g.zaika) headNo(g.zaika); return g.wrong === 2; };
  if (!keepRound) { const hw = FR.halfW, hh = FR.halfH; FR.halfW = hw * 0.72; FR.halfH = hh * 0.72; applyFrame(); tw(FR, { halfW: hw, halfH: hh }, 1400, 'inout', 250); twf(1700, () => applyFrame()); }
  // первый вопрос идёт сразу после вступления комнаты
  g.pre = keepRound ? null : Rm.intro;
  g.say = (ids, who) => {
    const pre = g.pre; g.pre = null;
    if (!pre) return Voice.say(ids, who);
    if (g.zaika) { g.zaika.userData.wave = true; twf(2600, () => {}).then(() => { g.zaika.userData.wave = false; }); }
    return Voice.say(pre, g.zaika || g.ezh || null).then(ok => (ok && g.alive() ? Voice.say(ids, who) : false));
  };
  wait(keepRound ? 50 : 700).then(() => { if (g.alive()) g.next(); });
}

async function finish(g) {
  S.stars[g.key] = (S.stars[g.key] || 0) + 1; save();
  PICK = [];
  const d = FR.halfH / Math.tan(cam.fov / 2 * Math.PI / 180) * 0.62;
  const k = 0.62, hh = FR.halfH * k, hw = Math.min(FR.halfW, FR.halfH * cam.aspect) * k;
  const star = mkZvezda(true, 1); star.castShadow = false; star.position.set(0, hh * 0.18, -d); star.scale.setScalar(0.001); cam.add(star);
  const sz = Math.min(hh, hw) * 0.42;
  SFX.fanfare();
  tws(star, sz, 900, 'elastic');
  twf(60000, (e, kk) => { star.rotation.y = Math.sin(kk * 60 * 1.6) * 0.5; star.rotation.z = Math.sin(kk * 60 * 1.1) * 0.15; });
  const rain = n => { for (let i = 0; i < n; i++) burst(V(rr(-hw, hw), hh * rr(0.9, 1.3), -d + rr(-1, 1)), 1, CONF_COLS, { parent: cam, g: 3, speed: 0.35, up: -0.2, conf: i % 2 === 0, size: 0.8 }); };
  burst(V(0, hh * 0.18, -d + 0.5), 26, CONF_COLS, { parent: cam, speed: 0.9, size: 0.8 });
  twf(5000, (e, kk) => { if (Math.random() < 0.5) rain(1); });
  if (g.zaika) { happy(g.zaika); g.zaika.userData.wave = true; }
  await Voice.say('final');
  if (!g.alive()) return;
  UI.fin.classList.add('on');
  Voice.say('esche');
}

// ===== 1. Краски =====
const COLORS = { krasny: '#f0352b', zhelty: '#ffd21f', siniy: '#2a6df4', zeleny: '#35b24a', oranzhevy: '#ff8a1c', rozovy: '#ff6fae' };
ROOMS.kraski = {
  intro: 'kraski_intro',
  voice: ['kraski_intro', ...Object.keys(COLORS).flatMap(c => ['najdi_' + c, 'eto_' + c])],
  setup(g) {
    setFrame(landscape ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 6.1, halfW: 4.8, halfH: 7.7 });
    lights(world); meadow(world);
    g.zaika = actor(mkZaika()); g.vedro = mkVedro();
    if (landscape) { g.zaika.position.set(-6.1, 0, 0.5); g.zaika.scale.setScalar(1.28); g.vedro.position.set(-4.0, 0, 1.6); g.vedro.scale.setScalar(1.15); }
    else { g.zaika.position.set(-2.7, 0, 0.5); g.zaika.scale.setScalar(1.2); g.vedro.position.set(-0.6, 0, 1.6); g.vedro.scale.setScalar(1.1); }
    g.zaika.rotation.y = 0.35;
    world.add(g.zaika, g.vedro);
    g.balls = []; g.prev = null;
    g.tick = t => g.balls.forEach(b => { const U = b.userData; if (U.float) { b.position.y = U.by + Math.sin(t * 1.4 + U.ph) * 0.22; b.rotation.z = Math.sin(t * 1.1 + U.ph) * 0.07; } });
  },
  round(g) {
    g.balls.forEach(b => { unpick(b); world.remove(b); }); g.balls = [];
    const pal = Object.keys(COLORS); // все шесть цветов с самого начала
    const n = [3, 4, 6][g.lvl];
    const target = bag(g, 't', pal);
    const cols = shuffle([target, ...shuffle(pal.filter(c => c !== target)).slice(0, n - 1)]);
    g.vedro.userData.paint.forEach(m => m.color.copy(C(COLORS[target]))); squash(g.vedro);
    const P = landscape
      ? (n === 6 ? [[-1.2, 6.4], [2.2, 6.7], [5.6, 6.4], [0.5, 3.5], [3.9, 3.3], [7.0, 3.6]] : cols.map((c, i) => [-1.6 + (8.2 / n) * (i + 0.5), 4.9 + (i % 2) * 0.9]))
      : { 6: [[-3.0, 10.7], [0, 11.1], [3.0, 10.7], [-3.0, 7.3], [0.1, 7.0], [3.0, 7.4]], 2: [[-2.1, 9.6], [2.1, 8.3]], 3: [[-2.3, 10.2], [2.3, 9.6], [1.3, 5.9]], 4: [[-2.4, 10.4], [2.3, 9.9], [-0.3, 6.6], [2.6, 5.8]] }[n];
    let done = false;
    cols.forEach((c, i) => {
      const b = mkShar(COLORS[c]); const U = b.userData; U.c = c; U.by = P[i][1]; U.cy = 0;
      const sc = n === 6 ? (landscape ? 1.05 : 1.1) : landscape ? (n > 3 ? 1.2 : 1.35) : 1.35;
      b.position.set(P[i][0], -5, 0.3 * (i % 2)); b.scale.setScalar(sc);
      hitBox(b, 2.1, 2.6, 2, 0, -0.1, 0);
      world.add(b); g.balls.push(b);
      tw(b.position, { y: U.by }, 900, 'back', i * 140).then(() => U.float = true);
      pickable(b, async () => {
        if (done) return;
        if (c === target) {
          done = true; g.balls.forEach(unhalo);
          SFX.pop(); U.float = false;
          const pos = b.position.clone();
          await tws(b, sc * 1.35, 90, 'out');
          world.remove(b); unpick(b);
          burst(pos, 22, [COLORS[c], '#ffffff', COLORS[c]], { conf: true, speed: 1.2 });
          g.solved(pos, 'eto_' + c);
        } else {
          const hint = g.miss(); wobble(b, 0.35);
          const tb = g.balls.find(x => x.userData.c === target);
          if (hint && tb) halo(tb, 1.25);
          Voice.say(['eto_' + c, hint ? 'podskazka' : null, 'najdi_' + target]);
        }
      });
    });
    g.repeat = () => Voice.say('najdi_' + target);
    g.say('najdi_' + target);
    Idle.set(() => { Voice.say('najdi_' + target); const tb = g.balls.find(x => x.userData.c === target); tb && world === tb.parent && nudge(tb); });
  },
};

// ===== 2. Фигуры =====
const FIGS = ['krug', 'kvadrat', 'treugolnik', 'zvezda', 'serdce'];
ROOMS.figury = {
  intro: 'figury_intro',
  voice: ['figury_intro', 'ne_podhodit', ...FIGS.flatMap(s => ['figura_' + s, 'naz_' + s])],
  setup(g) {
    setFrame(landscape ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 6.1, halfW: 4.8, halfH: 7.7 });
    lights(world); interior(world, { wall: '#ffe9c9', dot: '#ffd9a3', floorHue: 28, floorL: 66 });
    // коврик и кубики для уюта
    const rug = mesh(new T.CylinderGeometry(7, 7, 0.06, 40), M('#ff9eb5', 1), 0, 0.03, 1.5); rug.castShadow = false; rug.receiveShadow = true; rug.scale.z = 0.45; world.add(rug);
    [['#4fc3f7', -7.2, 0.5, -1.5, 0.3], ['#ffd54f', -6.3, 0.45, -2.2, -0.2], ['#81c784', 7.0, 0.5, -1.8, 0.5], ['#ff8a65', -6.9, 1.4, -1.8, 0.7]].forEach(([c, x, y, z, r]) => { if (!landscape && Math.abs(x) > 4.6) x *= 0.52; const b = rbox(M(c, 0.5), 0.95, 0.95, 0.95, 0.14, x, y, z); b.rotation.y = r; world.add(b); });
    g.set = g.lvl ? FIGS : FIGS.slice(0, 4);
    g.cnt = [3, 4, 5][g.lvl]; // сколько окошек в ящике
    g.prev = null; g.sorter = null; g.shape = null;
    g.zaika = actor(mkZaika());
    world.add(g.zaika);
    g.tick = t => { const s = g.shape; if (s && !s.userData.held && !s.userData.busy) { s.rotation.y = Math.sin(t * 1.3) * 0.45; s.rotation.z = Math.sin(t * 0.9) * 0.08; s.position.y = s.userData.by + Math.sin(t * 1.8) * 0.15; } };
  },
  round(g) {
    if (g.sorter) world.remove(g.sorter);
    if (g.shape) { unpick(g.shape); world.remove(g.shape); }
    const target = bag(g, 't', g.set);
    const order = shuffle([target, ...shuffle(g.set.filter(x => x !== target)).slice(0, g.cnt - 1)]), n = order.length, sp = landscape ? 2.72 : 2.55;
    let w, h, cy, holes;
    if (landscape || n <= 3) { w = sp * n + 0.9; h = 3.4; cy = 2.75; holes = order.map((k, i) => ({ kind: k, x: (i - (n - 1) / 2) * sp, y: 0 })); }
    else { const per = Math.ceil(n / 2); w = sp * per + 0.9; h = 6.2; cy = 4.0; holes = order.map((k, i) => { const r = i < per ? 0 : 1, cnt = r ? n - per : per, j = r ? i - per : i; return { kind: k, x: (j - (cnt - 1) / 2) * sp, y: r ? -1.4 : 1.4 }; }); }
    const st = g.sorter = mkSorter(w, h, holes);
    const tilt = -0.36;
    st.position.set(0, cy, 0.4); st.rotation.x = tilt; world.add(st);
    st.scale.setScalar(0.001); tws(st, 1, 450, 'back'); st.updateMatrixWorld(true);
    // Зайка сидит на ящике
    const zs = landscape ? 0.85 : 0.75;
    g.zaika.scale.setScalar(zs); g.zaika.position.set(-w / 2 + 0.9, cy + h / 2 * Math.cos(tilt) - 0.25, 0.4 + h / 2 * Math.sin(-tilt) - 0.9); g.zaika.rotation.y = 0.3;
    // цели-окошки
    st.scale.setScalar(1); st.updateMatrixWorld(true);
    const targets = holes.map(o => { const tgt = grp(); tgt.position.copy(st.localToWorld(V(o.x, o.y, 0.05))); tgt.userData.fig = o.kind; hitBox(tgt, 2.4, 2.6, 1.2); world.add(tgt); return tgt; });
    st.scale.setScalar(0.001);
    const sh = g.shape = mkFigura(target); const sy = landscape ? 6.5 : 10.3;
    sh.userData.by = sy; sh.userData.cy = 0; sh.position.set(landscape ? 1.2 : 0.6, sy, 1.6); sh.scale.setScalar(0.001);
    hitBox(sh, 2.6, 2.6, 1.5); world.add(sh); tws(sh, 1.15, 500, 'back', 250);
    const home = sh.position.clone();
    let busy = false;
    const tryHole = async tgt => {
      if (busy) return false;
      if (tgt.userData.fig === target) {
        busy = true; sh.userData.busy = true; unpick(sh); targets.forEach(x => { unpick(x); unhalo(x); });
        const nrm = V(0, 0, 1).applyEuler(st.rotation);
        const p1 = tgt.position.clone().addScaledVector(nrm, 0.5);
        tw(sh.rotation, { x: tilt, y: 0, z: 0 }, 300); tws(sh, 1.0, 300);
        await arc(sh, p1, 340, 0.4);
        SFX.whoosh();
        await tw(sh.position, { x: p1.x - nrm.x * 1.3, y: p1.y - nrm.y * 1.3, z: p1.z - nrm.z * 1.3 }, 260, 'in');
        SFX.thunk(); squash(st); world.remove(sh); g.shape = null;
        g.solved(p1, 'naz_' + target);
        return true;
      }
      const hint = g.miss(); wobble(st, 0.04);
      const tt = targets.find(x => x.userData.fig === target);
      if (hint && tt) { halo(tt, 1.3); tt.userData.halo.rotation.x = tilt; }
      Voice.say([hint ? 'podskazka' : 'ne_podhodit']);
      return false;
    };
    targets.forEach(tgt => pickable(tgt, () => { if (!busy) { if (tgt.userData.fig === target) tryHole(tgt); else { tryHole(tgt); } } }));
    pickable(sh, null, {
      onDrop: () => { const tgt = nearestScr(targets, sh, 0.24); if (!tgt) return false; const ok = tgt.userData.fig === target; tryHole(tgt); return ok; },
      onTap: () => { hop(sh, 0.4); Voice.say('figura_' + target); },
    });
    g.repeat = () => Voice.say('figura_' + target);
    g.say('figura_' + target);
    Idle.set(() => { Voice.say('figura_' + target); if (g.shape === sh && !busy) nudge(sh); });
  },
};

// ===== 3. Считалка =====
// столик с лунками: сколько лунок, столько угощений
function mkStol(N, sp, slotHex) {
  const tb = grp(), wood = M('#d9a05b', 0.7), w = sp * N + 0.7;
  const top = grp(0, 1.25, 0); top.rotation.x = 0.62;
  const board = rbox(wood, w, 0.26, 1.7, 0.12); board.receiveShadow = true; top.add(board);
  const slots = [];
  for (let i = 0; i < N; i++) { const s = cyl(M(slotHex, 0.9), 0.42, 0.42, 0.05, (i - (N - 1) / 2) * sp, 0.14, 0, 24); s.castShadow = false; top.add(s); slots.push(s); }
  tb.add(top);
  for (const s of [-1, 1]) tb.add(cyl(M('#b9783a', 0.8), 0.14, 0.16, 1.2, s * (w / 2 - 0.35), 0.6, -0.3, 10));
  tb.userData.slots = slots; return tb;
}
ROOMS.schet = {
  intro: 'schet_intro',
  voice: ['schet_intro', 'nyam', 'sorvi', 'zhochet_1', 'zhochet_2', 'zhochet_3', 1, 2, 3, 4, 5].flatMap(x => typeof x === 'number' ? ['hochet_' + x, 'chislo_' + x] : [x]),
  setup(g) {
    setFrame(landscape ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 6.1, halfW: 4.8, halfH: 7.7 });
    lights(world); meadow(world, { sunX: 12 });
    const two = g.two = g.lvl >= 2; // третий уровень: ёжику яблоки, Зайке морковки, и число у каждого своё
    const tree = g.tree = mkDerevo();
    const ez = g.ezh = actor(mkEzhik());
    g.asc = landscape ? 1.25 : 1.1; g.csc = 1; g.tsc = 1; g.cspots = [];
    ez.rotation.y = -0.85;
    if (!two) {
      if (landscape) { tree.position.set(-4.6, 0, -1.2); tree.scale.setScalar(1.0); ez.position.set(5.7, 0, 0.6); ez.scale.setScalar(1.45); g.tab = [1.35, 0, 1.6]; }
      else { tree.position.set(-0.3, 0, -1.6); tree.scale.setScalar(1.38); ez.position.set(2.75, 0, 0.8); ez.scale.setScalar(1.2); g.tab = [-1.9, 0, 1.8]; }
    } else {
      const z = g.zaika = actor(mkZaika());
      let bed;
      if (landscape) {
        terrace(4.0, -1.2, -1.3, 30);
        tree.position.set(-5.4, 0, -1.4); tree.scale.setScalar(0.95);
        ez.position.set(6.2, 0, 0.9); ez.scale.setScalar(1.25); g.tab = [2.3, 0, 1.7];
        z.position.set(6.3, 4.0, -2.9); z.scale.setScalar(0.98); z.rotation.y = -0.35; g.tab2 = [2.3, 4.0, -2.7];
        bed = [-4.7, 0, 2.1, 5, 1.1]; g.asc = 1.15;
      } else {
        terrace(3.9, -1.0);
        tree.position.set(-2.2, 3.9, -3.2); tree.scale.setScalar(1.0);
        ez.position.set(3.35, 0, 1.0); ez.scale.setScalar(0.8); g.tab = [0.95, 0, 1.9];
        z.position.set(-3.95, 0, 0.8); z.scale.setScalar(0.8); z.rotation.y = 0.35; g.tab2 = [-1.95, 0, 1.9];
        bed = [2.45, 3.9, -2.2, 4, 1.0]; g.tsc = 0.78; g.asc = 1.0;
      }
      world.add(z);
      // грядка с морковками
      const [bx, by, bz, bn, bs] = bed; g.csc = bs;
      const soil = rbox(M('#8d5a34', 1), bn * 0.85 * bs + 0.5, 0.5, 1.3 * bs, 0.2, bx, by + 0.12, bz); soil.receiveShadow = true; world.add(soil);
      for (let i = 0; i < bn; i++) g.cspots.push(V(bx + (i - (bn - 1) / 2) * 0.85 * bs, by + 0.37 + 0.2 * bs, bz + 0.1));
    }
    world.add(tree, ez); speaker = null;
    hitBox(ez, 2.2, 2, 2.6, 0, 0.9, 0); ez.userData.cy = 1.2;
    pickable(ez, () => { hop(ez, 0.5); SFX.boing(); g.repeat && g.repeat(); });
    const k = tree.scale.x;
    g.spots = [[-1.9, 5.5, 1.75], [-0.7, 7.0, 2.2], [0.9, 7.6, 1.6], [2.0, 5.9, 1.7], [0.3, 5.5, 2.45], [-0.9, 4.4, 2.2], [1.2, 4.3, 2.15]].map(([x, y, z]) => V(tree.position.x + x * k, tree.position.y + y * k, tree.position.z + z * k));
    g.items = []; g.prevN = null; g.prevM = null; g.tables = [];
    g.tick = t => { g.items.forEach(a => { if (a.userData.hang) a.rotation.z = Math.sin(t * 1.7 + a.userData.ph) * 0.18; }); tree.userData.crown.rotation.z = Math.sin(t * 0.8) * 0.012; };
  },
  round(g) {
    const two = g.two;
    let N, Mz = 0;
    if (two) { [N, Mz] = bag(g, 'p', [[1, 2], [1, 3], [2, 1], [2, 3], [3, 1], [3, 2]]); }
    else { N = bag(g, 'n', [[1, 2, 3], [2, 3, 4, 5]][g.lvl]); }
    g.prevN = N;
    g.tables.forEach(t => world.remove(t));
    const sp = landscape ? 0.95 : 0.86;
    const mk = (n, pos, hex) => { const t = mkStol(n, sp, hex); t.position.set(pos[0], pos[1], pos[2]); world.add(t); popIn(t, g.tsc); return t; };
    const tabs = { a: mk(N, g.tab, '#8a5a2e'), m: two ? mk(Mz, g.tab2, '#b0632a') : null };
    g.tables = [tabs.a, tabs.m].filter(Boolean);
    g.items.forEach(a => { unpick(a); world.remove(a); }); g.items = [];
    const need = { a: N, m: Mz }, cnt = { a: 0, m: 0 }, eater = { a: g.ezh, m: g.zaika };
    const ask = two ? ['hochet_' + N, 'zhochet_' + Mz] : ['hochet_' + N];
    let flying = false, over = false;
    const give = async it => {
      const U = it.userData, k = U.k;
      if (U.used || flying || over) return;
      if (cnt[k] >= need[k]) { SFX.soft(); wobble(it, 0.25); wobble(eater[k], 0.08); return; } // этому зверю уже хватит
      U.used = true; U.hang = false; flying = true; unpick(it); const c = ++cnt[k]; SFX.plop();
      const tb = tabs[k]; tb.updateMatrixWorld(true);
      const dst = tb.userData.slots[c - 1].getWorldPosition(new T.Vector3()).add(V(0, 0.34 * it.scale.x, 0.25));
      twf(520, e => { it.rotation.z = -e * Math.PI * 2; });
      arc(it, dst, 520, 1.6).then(() => { flying = false; it.rotation.z = 0; squash(it); SFX.thunk(); });
      if (cnt.a < need.a || cnt.m < need.m) { Voice.say(['chislo_' + c, two && c === need[k] ? (k === 'a' ? 'zhochet_' + Mz : 'hochet_' + N) : null], null); return; }
      over = true; Idle.off(); g.items.forEach(unpick);
      await Voice.say('chislo_' + c, null);
      if (!g.alive()) return;
      // звери едят
      let first = null;
      for (const kk of two ? ['a', 'm'] : ['a']) {
        const an = eater[kk], s = an.scale.x, wp = an.getWorldPosition(new T.Vector3());
        const mp = kk === 'a' ? wp.add(V(-1.6, 1.1, 1.2).multiplyScalar(s / 1.5)) : wp.add(V(0, 1.75 * s, 0.7 * s));
        first = first || mp;
        for (const x of g.items.filter(x => x.userData.used && x.userData.k === kk)) { arc(x, mp, 330, 0.9); tws(x, 0.3, 330, 'in'); await wait(200); SFX.munch(); squash(an, 260); }
      }
      await wait(250); g.items.filter(x => x.userData.used).forEach(x => world.remove(x));
      happy(g.ezh, false);
      g.solved(first, 'nyam', g.ezh);
    };
    const add = (k, p, i) => {
      const it = k === 'a' ? mkYabloko() : mkMorkovka(), U = it.userData; it.position.copy(p); U.k = k; U.hang = k === 'a'; U.ph = Math.random() * 6;
      hitBox(it, 1.15, k === 'a' ? 1.15 : 1.7, 1.15, 0, k === 'a' ? 0 : 0.25, 0); world.add(it); g.items.push(it); popIn(it, k === 'a' ? g.asc : g.csc, i * 70, 380);
      pickable(it, () => give(it));
    };
    g.spots.forEach((p, i) => add('a', p, i));
    g.cspots.forEach((p, i) => add('m', p, i));
    g.repeat = () => Voice.say(ask, null);
    g.say(ask, null);
    Idle.set(() => { Voice.say(cnt.a + cnt.m ? ask : ask.concat('sorvi'), null); const k = cnt.a < need.a ? 'a' : 'm', a = g.items.find(x => !x.userData.used && x.userData.k === k); a && nudge(a); });
  },
};

// ===== 4. Большой и маленький =====
let _zTex = null;
function zzz(pos) {
  _zTex = _zTex || cnv(64, 64, (x) => { x.font = 'bold 54px sans-serif'; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('z', 32, 30); });
  for (let i = 0; i < 3; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: _zTex, transparent: true, opacity: 0, depthTest: false }));
    s.position.copy(pos); s.scale.setScalar(0.5 + i * 0.22); world.add(s);
    twf(2200, (e, k) => { s.position.set(pos.x + k * 0.9 + Math.sin(k * 6) * 0.15, pos.y + k * 2.2, pos.z); s.material.opacity = Math.sin(k * Math.PI); }, 'lin', i * 450).then(() => world.remove(s));
  }
}
ROOMS.mishki = {
  intro: 'mishki_intro',
  voice: ['mishki_intro', 'mishka_bolshoy', 'mishka_malenky', 'mishka_sredniy', 'tesno', 'veliko', 'spokoynoy'],
  setup(g) {
    setFrame(landscape ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 4.7, halfW: 4.8, halfH: 7.7 });
    lights(world, { sky: '#c3ceff', gnd: '#ffd9a8', hi: 0.52, di: 0.45, sun: '#ffe9c4' });
    interior(world, { wall: '#4c5cab', dot: '#fff3a8', stars: true, floorHue: 26, floorSat: 45, floorL: 52, base: '#e9ecff' });
    // окно с луной
    const wx = landscape ? 5.6 : 2.6, wy = landscape ? 5.6 : 9.9;
    const win = grp(wx, wy, -3.5);
    win.add(rbox(M('#ffffff', 0.6), 3.3, 3.3, 0.3, 0.3));
    const sky = mesh(new T.PlaneGeometry(2.8, 2.8), new T.MeshBasicMaterial({ color: C('#1c2566') }), 0, 0, 0.16); sky.castShadow = false; win.add(sky);
    const moon = mesh(new T.CircleGeometry(0.62, 28), new T.MeshBasicMaterial({ color: C('#fff4b8') }), 0.45, 0.45, 0.18); moon.castShadow = false; win.add(moon);
    const st = []; for (let i = 0; i < 6; i++) { const s = mesh(GEO.star, new T.MeshBasicMaterial({ color: C('#fff8cf') }), rr(-1.1, 1.1), rr(-1.1, 1.1), 0.18); if (s.position.x > 0 && s.position.y > 0) s.position.x -= 1.2; s.scale.setScalar(0.1); s.castShadow = false; win.add(s); st.push(s); }
    win.add(mesh(new T.BoxGeometry(0.14, 2.9, 0.1), M('#ffffff', 0.6), 0, 0, 0.2)); win.add(mesh(new T.BoxGeometry(2.9, 0.14, 0.1), M('#ffffff', 0.6), 0, 0, 0.2));
    world.add(win);
    // гирлянда
    const bulbs = [], gc = ['#ff6b8a', '#ffd54f', '#4fc3f7', '#81c784', '#ba68c8'];
    const gw = landscape ? 15 : 9, gy = landscape ? 8.3 : 12.3;
    for (let i = 0; i < 13; i++) { const u = i / 12, x = (u - 0.5) * gw, y = gy - Math.sin(u * Math.PI) * 0.8; const b = ball(new T.MeshBasicMaterial({ color: C(gc[i % 5]) }), 0.16, x, y, -3.3, true); b.castShadow = false; world.add(b); bulbs.push(b); }
    // коврик
    const rug = mesh(new T.CylinderGeometry(6.5, 6.5, 0.06, 40), M('#7986cb', 1), 0, 0.03, 1.8); rug.castShadow = false; rug.receiveShadow = true; rug.scale.z = 0.4; world.add(rug);
    // полка для мишки
    g.shelfY = landscape ? 3.55 : 6.5;
    const sh = rbox(M('#c98a55', 0.6), 4.2, 0.3, 1.6, 0.1, 0, g.shelfY - 0.15, -2.6); sh.receiveShadow = true; world.add(sh);
    for (const s of [-1, 1]) world.add(rbox(M('#a86c3d', 0.7), 0.22, 0.5, 1.1, 0.08, s * 1.6, g.shelfY - 0.5, -2.9));
    g.sizes = g.lvl < 1 ? ['bolshoy', 'malenky'] : ['bolshoy', 'sredniy', 'malenky'];
    g.prev = []; g.beds = []; g.bear = null;
    g.tick = t => { bulbs.forEach((b, i) => b.scale.setScalar(0.16 * (1 + Math.sin(t * 3 + i * 1.3) * 0.25))); st.forEach((s, i) => s.scale.setScalar(0.1 * (1 + Math.sin(t * 2 + i * 2) * 0.35))); };
  },
  round(g) {
    g.beds.forEach(b => { unpick(b); world.remove(b); b.userData.bear && world.remove(b.userData.bear); }); g.beds = [];
    if (g.bear) { unpick(g.bear); world.remove(g.bear); }
    const BS = g.lvl < 2 ? { bolshoy: 1.5, sredniy: 1.13, malenky: 0.8 } : { bolshoy: 1.38, sredniy: 1.14, malenky: 0.93 }; // на сложном размеры ближе друг к другу
    const order = shuffle(g.sizes), n = order.length;
    const k = landscape ? (n === 3 ? 1.0 : 1.08) : (n === 3 ? 0.7 : 1.0), gap = landscape ? 1.0 : 0.45;
    const widths = order.map(s => 3.3 * BS[s] * k), total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
    let x = -total / 2;
    order.forEach((sz, i) => {
      const b = mkKrovatka(), s = BS[sz] * k; const U = b.userData; U.s = sz; U.sc = s; U.cy = 0.9 * s;
      b.position.set(x + widths[i] / 2, 0, 0.8); x += widths[i] + gap; b.rotation.y = 0.12;
      hitBox(b, 3.4, 2.2, 2.2, 0, 1.0, 0);
      world.add(b); g.beds.push(b); popIn(b, s, i * 120);
      pickable(b, () => tryBed(b));
    });
    const sz = bag(g, 's', g.sizes);
    g.prev.push(sz);
    const bear = g.bear = actor(mkMishka()), bs = BS[sz] * k * 0.8;
    bear.position.set(0, g.shelfY, -2.3); bear.userData.cy = 1.4 * bs;
    hitBox(bear, 2.2, 3.2, 1.8, 0, 1.5, 0); world.add(bear); popIn(bear, bs, 200);
    const who = bear;
    let busy = false;
    const tryBed = async b => {
      if (busy) return false;
      const U = b.userData;
      if (U.s === sz) {
        busy = true; unpick(bear); g.beds.forEach(x => { unpick(x); unhalo(x); });
        const s = U.sc, c = Math.cos(0.12), sn = Math.sin(0.12);
        const lx = 0.72 * s, dst = V(b.position.x + lx * c, 0.8 * s + 0.56 * bs, b.position.z - lx * sn + 0.05);
        tw(bear.rotation, { z: Math.PI / 2, y: 0.12 }, 500, 'inout');
        await arc(bear, dst, 560, 1.4);
        SFX.thunk(); squash(b, 300);
        bear.userData.sleep = true; bear.userData.noBreath = false; bear.userData.tick = null;
        (bear.userData.limbs || []).forEach(l => { l.visible = false; });
        const bl = U.blanket; bl.visible = true; tws(bl, 1, 450, 'back');
        U.bear = bear; g.bear = null;
        SFX.twinkle();
        zzz(V(b.position.x - 1.0 * s, 1.9 * s, b.position.z + 0.5));
        g.solved(V(b.position.x, 1.6 * s, b.position.z + 1), 'spokoynoy', null);
        return true;
      }
      const hint = g.miss(); wobble(b, 0.06);
      const tb = g.beds.find(x => x.userData.s === sz);
      if (hint && tb) halo(tb, 1.75, 1.0);
      Voice.say([BS[sz] > BS[U.s] ? 'tesno' : 'veliko', hint ? 'podskazka' : null, 'mishka_' + sz], null);
      return false;
    };
    const home = V(0, g.shelfY, -2.3);
    pickable(bear, null, {
      onDrop: () => { const b = nearestScr(g.beds, bear, 0.3, 1.2 * bs); if (!b) return false; const ok = b.userData.s === sz; tryBed(b); return ok; },
      onTap: () => { hop(bear, 0.5); Voice.say('mishka_' + sz, null); },
    });
    g.repeat = () => Voice.say('mishka_' + sz, null);
    g.say('mishka_' + sz, null);
    Idle.set(() => { Voice.say('mishka_' + sz, null); if (g.bear === bear && !busy) nudge(bear); });
  },
};

// ===== 5. Кто как говорит =====
const ZVERI = ['korova', 'sobaka', 'koshka', 'utka', 'svinka', 'ovechka'];
ROOMS.zveri = {
  intro: 'zveri_intro',
  voice: ['zveri_intro', ...ZVERI.flatMap(z => ['kto_' + z, 'eto_' + z, 'zvuk_' + z])],
  setup(g) {
    const n = [4, 6, 6][g.lvl];
    setFrame(landscape ? (n > 4 ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 2.7, halfW: 7.9, halfH: 4.3 }) : { cy: n > 4 ? 5.5 : 4.6, halfW: 4.8, halfH: 7.7 });
    lights(world); meadow(world);
    g.set = shuffle(ZVERI).slice(0, n);
    // уступы-холмики, чтобы всех было видно
    let P, sc;
    if (landscape) {
      if (n === 3) { P = [[-5.2, 0, 0.6], [0, 0, 0.6], [5.2, 0, 0.6]]; sc = 1.6; }
      else if (n === 4) { P = [[-6.1, 0, 0.6], [-2.05, 0, 0.6], [2.05, 0, 0.6], [6.1, 0, 0.6]]; sc = 1.3; }
      else { terrace(4.0, -1.2); P = [[-5.2, 0, 1.2], [0, 0, 1.2], [5.2, 0, 1.2], [-5.2, 4.0, -2.9], [0, 4.0, -2.9], [5.2, 4.0, -2.9]]; sc = 1.22; }
    } else {
      terrace(3.9, -1.2); sc = 1.3;
      if (n > 4) terrace(7.8, -5.2);
      P = [[-2.3, 0, 1.2], [2.3, 0, 1.2], [-2.3, 3.9, -2.9], [2.3, 3.9, -2.9], [-2.3, 7.8, -6.9], [2.3, 7.8, -6.9]];
      if (n === 3) P[2] = [0, 3.9, -2.9];
    }
    // амбар вдали
    const barn = grp(landscape ? 13 : 6.5, n > 4 && landscape ? 4 : (landscape ? 0 : (n > 4 ? 7.8 : 3.9)), -16);
    barn.add(rbox(M('#e2574c', 0.8), 7, 5, 6, 0.2, 0, 2.5, 0));
    const rf = mesh(new T.CylinderGeometry(0.1, 4.6, 2.6, 4), M('#8d4a3a', 0.8), 0, 6.3, 0); rf.rotation.y = Math.PI / 4; rf.scale.z = 1.0; barn.add(rf);
    barn.add(mesh(new T.PlaneGeometry(2.4, 3.2), M('#fff3e0', 0.8), 0, 1.6, 3.02));
    world.add(barn);
    g.cards = g.set.map((z, i) => {
      const a = actor(mkZver(z)); a.userData.z = z; a.userData.cy = 1.3 * sc;
      a.position.set(P[i][0], P[i][1], P[i][2]); a.rotation.y = 0.42 - P[i][0] * 0.05;
      hitBox(a, 2.4, 3.0, 2.6, 0, 1.4, 0.2);
      const sc2 = sc * (1 + Math.max(0, -P[i][2]) * 0.032); a.userData.cy = 1.3 * sc2;
      world.add(a); popIn(a, sc2, i * 110);
      pickable(a, () => g.tap && g.tap(a));
      return a;
    });
    g.prev = null;
  },
  round(g) {
    g.cards.forEach(unhalo);
    const t = bag(g, 't', g.set);
    let busy = false;
    const whoFor = c => id => (id === 'zvuk_' + c.userData.z ? c : null);
    const q = g.lvl >= 2 ? 'zvuk_' + t : 'kto_' + t; // на сложном только голос зверя, без подсказки «кто говорит»
    g.tap = async c => {
      if (busy) return;
      hop(c, 0.8); SFX.boing();
      if (c.userData.z === t) {
        busy = true; g.cards.forEach(unhalo);
        g.solved(c.position.clone().add(V(0, 2.2, 1)), g.lvl >= 2 ? ['eto_' + t, 'zvuk_' + t] : 'zvuk_' + t, whoFor(c));
      } else {
        const hint = g.miss();
        const tc = g.cards.find(x => x.userData.z === t);
        if (hint && tc) halo(tc, 1.35, 1.25);
        Voice.say(['eto_' + c.userData.z, 'zvuk_' + c.userData.z, hint ? 'podskazka' : null, q], whoFor(c));
      }
    };
    g.repeat = () => Voice.say(q, null);
    g.say(q, null);
    Idle.set(() => Voice.say(q, null));
  },
};

// ---------- наряды Зайки: открываются за звёздочки, меняются нажатием на Зайку в домике ----------
const OUTFIT_AT = [0, 1, 3, 6, 10]; // сколько звёздочек нужно для каждого наряда
function outfitsOpen() { const n = Object.values(S.stars).reduce((a, b) => a + b, 0); return OUTFIT_AT.filter(x => n >= x).length; }
function dressZaika(z) {
  const head = z.userData.head; if (!head) return;
  if (z.userData.outfit) head.remove(z.userData.outfit);
  const k = Math.min(S.outfit || 0, outfitsOpen() - 1), o = grp(); z.userData.outfit = o; head.add(o);
  const gold = M('#ffc928', 0.3);
  if (k === 1) { // цветок у ушка
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; o.add(ball(M('#ff6fae', 0.6), [0.13, 0.13, 0.06], 0.46 + Math.cos(a) * 0.15, 0.6 + Math.sin(a) * 0.15, 0.36, true)); }
    o.add(ball(M('#ffd21f', 0.5), 0.09, 0.46, 0.6, 0.4, true));
  } else if (k === 2) { // очки
    for (const s of [-1, 1]) o.add(mesh(new T.TorusGeometry(0.19, 0.035, 8, 24), M('#2a6df4', 0.4), s * 0.3, 0.08, 0.72));
    const br = cyl(M('#2a6df4', 0.4), 0.03, 0.03, 0.22, 0, 0.1, 0.74, 6); br.rotation.z = Math.PI / 2; o.add(br);
  } else if (k === 3) { // шляпка
    const st = M('#ffe08a', 0.8); o.add(cyl(st, 0.95, 0.95, 0.07, 0, 0.6, 0, 28)); o.add(cyl(st, 0.5, 0.56, 0.42, 0, 0.82, 0, 24)); o.add(cyl(M('#ff5d8a', 0.6), 0.57, 0.57, 0.13, 0, 0.7, 0, 24));
  } else if (k === 4) { // корона
    o.add(mesh(new T.CylinderGeometry(0.42, 0.38, 0.3, 20, 1, true), M('#ffc928', 0.3, { side: T.DoubleSide }), 0, 0.82, 0));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; o.add(cone(gold, 0.11, 0.28, Math.cos(a) * 0.4, 1.08, Math.sin(a) * 0.4, 6)); o.add(ball(M(['#f0352b', '#2a6df4', '#35b24a'][i % 3], 0.3), 0.06, Math.cos(a) * 0.42, 0.84, Math.sin(a) * 0.42, true)); }
  }
}
function mkPtichka(hex) {
  const g = grp(), m = M(hex, 0.7);
  g.add(ball(m, [0.3, 0.27, 0.36], 0, 0.3, 0)); g.add(ball(m, 0.21, 0, 0.6, 0.2));
  g.add(ball(M('#ffffff', 0.8), [0.2, 0.18, 0.2], 0, 0.24, 0.16, true));
  const bk = cone(M('#ff9800', 0.5), 0.07, 0.18, 0, 0.58, 0.44, 8); bk.rotation.x = Math.PI / 2; g.add(bk);
  for (const s of [-1, 1]) g.add(ball(MAT.eye, 0.04, s * 0.1, 0.66, 0.37, true));
  const wings = [-1, 1].map(s => { const w = grp(s * 0.26, 0.36, 0); w.add(ball(m, [0.22, 0.05, 0.2], s * 0.18, 0, 0, true)); g.add(w); return w; });
  const tl = ball(m, [0.1, 0.04, 0.22], 0, 0.3, -0.42, true); tl.rotation.x = -0.5; g.add(tl);
  g.userData.wings = wings; return g;
}

// ---------- домик-меню ----------
const ROOM_KEYS = ['kraski', 'figury', 'schet', 'mishki', 'zveri', 'pryatki', 'piramidka', 'vedra', 'eda', 'mnogo', 'para', 'muzyka'];
const CELL_COL = { kraski: '#ffe1ea', figury: '#fff0c7', schet: '#dff6d4', mishki: '#dfe5ff', zveri: '#dff5ff', pryatki: '#e3f7d6', piramidka: '#ffe9d2', vedra: '#e0f4ff', eda: '#fff3c9', mnogo: '#ffe3ef', para: '#e9e2ff', muzyka: '#d9f5ee' };
const ICONS = {}; // значки новых комнат добавляет komnaty2.js
function cellIcon(key) {
  const g = grp();
  if (ICONS[key]) { ICONS[key](g); return g; }
  if (key === 'kraski') {
    const bs = ['krasny', 'zhelty', 'siniy'].map((c, i) => { const b = mkShar(COLORS[c]); b.scale.setScalar(0.5); b.position.set((i - 1) * 1.0, 2.3 + (i % 2) * 0.35, 0); g.add(b); return b; });
    g.userData.tick = t => bs.forEach((b, i) => { b.position.y = 2.3 + (i % 2) * 0.35 + Math.sin(t * 1.5 + i * 2) * 0.12; b.rotation.z = Math.sin(t + i) * 0.08; });
  } else if (key === 'figury') {
    const fs = ['krug', 'kvadrat', 'treugolnik'].map((k, i) => { const f = mkFigura(k); f.scale.setScalar(0.5); f.position.set((i - 1) * 1.15, 1.0 + (i === 1 ? 1.1 : 0), 0); g.add(f); return f; });
    g.userData.tick = t => fs.forEach((f, i) => { f.rotation.y = Math.sin(t * 1.2 + i * 2) * 0.7; });
  } else if (key === 'schet') {
    const e = actor(mkEzhik()); e.scale.setScalar(0.85); e.rotation.y = -0.5; e.position.set(0.45, 0, 0); g.add(e);
    [[-1.2, 0.4, 0.3], [-0.75, 0.38, 0.75]].forEach(([x, y, z]) => { const a = mkYabloko(); a.scale.setScalar(0.85); a.position.set(x, y, z); g.add(a); });
  } else if (key === 'mishki') { const b = actor(mkMishka()); b.scale.setScalar(0.85); g.add(b); }
  else if (key === 'zveri') { const c = actor(mkZver('korova')); c.scale.setScalar(0.9); c.rotation.y = 0.55; c.position.set(-0.1, 0, -0.2); g.add(c); }
  return g;
}
// дверь: нажмёшь — откроется, и выглянет ёжик. standalone = отдельный маленький домик (в лежачем положении экрана)
function homeDoor(x, y, z, k, standalone) {
  const r = grp(x, y, z); r.scale.setScalar(k); world.add(r);
  if (standalone) {
    r.add(rbox(M('#fff6e2', 0.9), 2.7, 3.3, 2.0, 0.2, 0, 1.65, -1.05));
    const rf = mesh(new T.CylinderGeometry(0.1, 2.5, 1.5, 4), M('#f0655a', 0.6), 0, 4.0, -1.05); rf.rotation.y = Math.PI / 4; r.add(rf);
  }
  const hole = rbox(M('#5a3a2a', 1), 1.7, 2.6, 0.1, 0.5, 0, 1.3, 0.02); hole.castShadow = false; r.add(hole);
  const door = grp(-0.85, 0, 0.14); door.add(rbox(M('#c0563f', 0.6), 1.7, 2.6, 0.16, 0.5, 0.85, 1.3, 0)); door.add(ball(M('#ffd54f', 0.3), 0.11, 1.4, 1.3, 0.12)); r.add(door);
  const guest = actor(mkEzhik()); guest.position.set(0, 0, 0.3); guest.rotation.y = -0.3; guest.scale.setScalar(0.001); guest.visible = false; r.add(guest);
  const dh = grp(0, 1.3, 0.3); hitBox(dh, 2.3, 3.0, 1.0); dh.userData.cy = 0; r.add(dh);
  let busy = false;
  pickable(dh, async () => {
    if (busy || busyWipe) return; busy = true; SFX.whoosh();
    // держишь палец на двери — Зайка заходит в дом; короткое нажатие — выглядывает ёжик
    let held = true; const up = () => { held = false; };
    addEventListener('pointerup', up, { once: true }); addEventListener('pointercancel', up, { once: true });
    const my = session;
    await tw(door.rotation, { y: -2.0 }, 380, 'out');
    if (window.openDom) { await wait(240); if (my !== session) return; if (held) { removeEventListener('pointerup', up); removeEventListener('pointercancel', up); SFX.good(); go(openDom); return; } }
    guest.visible = true; SFX.boing(); tws(guest, 0.62, 350, 'back');
    await tw(guest.position, { z: 1.5 }, 420, 'out');
    burst(r.localToWorld(V(0, 1.6, 1.6)), 10); SFX.good(); hop(guest, 0.4);
    await wait(700); hop(guest, 0.4); await wait(800);
    tws(guest, 0.001, 300, 'in'); await tw(guest.position, { z: 0.3 }, 300, 'in');
    guest.visible = false; await tw(door.rotation, { y: 0 }, 350, 'inout'); SFX.thunk(); busy = false;
  });
}
function goHome() {
  const my = clearWorld();
  current = { name: 'home', rebuild: () => goHome() };
  LVL.classList.add('on'); updLvl(); if (S.diff === undefined) askAge();
  const cw = 4.3, ch = 3.6, cd = 2.6, fl = 0.55;
  const cols = landscape ? 4 : 3, rows = ROOM_KEYS.length / cols;
  const y0 = landscape ? 0 : 3.5; // в портретном положении дом стоит на высоком крыльце, Зайка перед ним
  const Wd = cw * cols, Ht = (ch + fl) * rows, roofH = landscape ? 3.0 : 2.5, topY = y0 + Ht + fl + roofH;
  setFrame(landscape ? { cx: -0.6, cy: topY / 2 + 0.1, halfW: Wd / 2 + 4.3, halfH: topY / 2 + 0.7, pitch: 5 } : { cy: topY / 2 + 0.2, halfW: Wd / 2 + 0.55, halfH: topY / 2 + 0.9, pitch: 4 });
  const sunL = lights(world, { lx: 4, ly: 11, ty: topY / 2, sh: 23 }), env = meadow(world), hemiL = world.children.find(o => o.isHemisphereLight);
  const house = grp(0, y0, -0.5); world.add(house);
  // солнышко: нажмёшь — наступит ночь с луной и звёздами, ещё раз — снова день
  {
    const sun = env.sun, rays = sun.children.slice(1), disc = sun.children[0]; let night = false, busy = false;
    const stars = grp(); stars.visible = false; world.add(stars);
    for (let i = 0; i < 46; i++) { const s = ball(new T.MeshBasicMaterial({ color: 0xffffff }), rr(0.09, 0.2), rr(-34, 34), rr(6, 30), -39, true); s.castShadow = false; s.userData.ph = Math.random() * 6; stars.add(s); }
    if (!landscape) { sun.position.set(-5.2, topY + 3.2, -36); sun.scale.setScalar(0.8); }
    hitBox(sun, 8, 8, 3); sun.userData.cy = 0;
    pickable(sun, () => {
      if (busy || busyWipe) return; busy = true; night = !night; SFX.twinkle();
      if (scene.background && scene.background.isTexture) scene.background.dispose();
      scene.background = night ? grad('#101a44', '#5a6fb0', '#2a3a7a') : grad('#6ec6ff', '#eafaff', '#bfe9ff');
      rays.forEach(r => r.visible = !night); disc.material.color.copy(C(night ? '#fff8dc' : '#ffe066'));
      stars.visible = night; env.clouds.forEach(c => c.visible = !night);
      tw(hemiL, { intensity: night ? 0.36 : 0.56 }, 500); tw(sunL, { intensity: night ? 0.2 : 0.52 }, 500);
      hemiL.color.copy(C(night ? '#9fb4ff' : '#ffffff'));
      hop(zaika, 0.4); zaika.userData.sleep = night; zaika.userData.wave = !night;
      if (night) zzz(V(zaika.position.x + 0.8, 3.3 * zaika.scale.x, zaika.position.z + 0.5));
      wait(600).then(() => busy = false);
    });
    ENVT.push(t => { if (stars.visible) stars.children.forEach(s => { const k = 0.75 + Math.sin(t * 2.5 + s.userData.ph) * 0.35; s.scale.setScalar(0.14 * k); }); });
  }
  const wallM = M('#fff6e2', 0.9), trimM = M('#ffffff', 0.7);
  const back = rbox(wallM, Wd + 0.5, Ht + 0.2, 0.3, 0.1, 0, Ht / 2, -cd); back.receiveShadow = true; house.add(back);
  for (let c = 0; c <= cols; c++) { const m = rbox(trimM, 0.28, Ht, cd, 0.1, -Wd / 2 + c * cw, Ht / 2, -cd / 2); m.receiveShadow = true; house.add(m); }
  for (let r = 0; r <= rows; r++) { const m = rbox(trimM, Wd + 0.5, fl, cd + 0.25, 0.12, 0, r * (ch + fl) + fl / 2, -cd / 2 + 0.1); m.receiveShadow = true; house.add(m); }
  // крыша
  const rs = new T.Shape(); rs.moveTo(-Wd / 2 - 0.9, 0); rs.lineTo(Wd / 2 + 0.9, 0); rs.lineTo(0.6, roofH); rs.quadraticCurveTo(0, roofH + 0.35, -0.6, roofH); rs.lineTo(-Wd / 2 - 0.9, 0);
  const roofTop = rows * (ch + fl) + fl;
  const roof = mesh(new T.ExtrudeGeometry(rs, { depth: cd + 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }), M('#f0655a', 0.6), 0, roofTop - 0.05, -cd - 0.15); house.add(roof);
  const aw = cyl(M('#fff6e2', 0.7), 0.62, 0.62, 0.2, 0, roofTop + roofH * 0.42, 0.55, 28); aw.rotation.x = Math.PI / 2; house.add(aw);
  const aw2 = cyl(M('#7fd0ff', 0.2), 0.45, 0.45, 0.22, 0, roofTop + roofH * 0.42, 0.57, 28); aw2.rotation.x = Math.PI / 2; aw2.castShadow = false; house.add(aw2);
  const chm = rbox(M('#d9b48a', 0.8), 0.9, 1.9, 0.9, 0.1, Wd * 0.3, roofTop + roofH * 0.55, -cd / 2); house.add(chm);
  const smoke = [];
  for (let i = 0; i < 4; i++) { const s = ball(M('#ffffff', 1, { transparent: true, opacity: 0.8 }), 0.3, 0, 0, 0, true); s.castShadow = false; house.add(s); smoke.push(s); }
  const sx = Wd * 0.3, sy = roofTop + roofH * 0.55 + 1.1;
  // Зайка живёт снаружи: сбоку от дома или перед крыльцом
  const zaika = actor(mkZaika()); zaika.userData.wave = true; world.add(zaika);
  if (landscape) { zaika.position.set(-Wd / 2 - 2.75, 0, 1.2); zaika.scale.setScalar(1.5); zaika.rotation.y = 0.3; homeDoor(Wd / 2 + 1.75, 0, -1.2, 1.0, true); }
  else {
    const base = rbox(M('#e6cfa8', 0.9), Wd + 0.7, y0 + 0.2, cd + 0.5, 0.2, 0, y0 / 2 - 0.1, -cd / 2 - 0.4); base.receiveShadow = true; world.add(base);
    const fz = -0.1;
    homeDoor(3.3, 0, fz, 1);
    const wn = cyl(M('#ffffff', 0.7), 0.75, 0.75, 0.16, -3.9, 2.0, fz, 28); wn.rotation.x = Math.PI / 2; world.add(wn);
    const wg = cyl(M('#7fd0ff', 0.2), 0.58, 0.58, 0.2, -3.9, 2.0, fz, 28); wg.rotation.x = Math.PI / 2; wg.castShadow = false; world.add(wg);
    zaika.position.set(-0.3, 0, 1.3); zaika.scale.setScalar(0.84);
  }
  // мольберт: нажмёшь — откроется рисование
  const mb = mkMolbert(); world.add(mb);
  if (landscape) { zaika.position.x += 0.75; mb.position.set(-Wd / 2 - 4.05, 0, 2.6); mb.scale.setScalar(0.95); mb.rotation.y = 0.3; }
  else { mb.position.set(-2.35, 0, 1.5); mb.scale.setScalar(0.8); mb.rotation.y = 0.2; }
  hitBox(mb, 2.2, 3.4, 1.4, 0, 1.7, 0); mb.userData.cy = 1.7 * mb.scale.x;
  pickable(mb, () => { if (busyWipe || !window.openRis) return; SFX.tap(); hop(mb, 0.4, 300); go(openRis); });
  hitBox(zaika, 2.2, 4.0, 1.8, 0, 1.9, 0); zaika.userData.cy = 1.9 * zaika.scale.x;
  pickable(zaika, () => {
    hop(zaika, 0.5); SFX.boing(); Voice.say('hihi');
    const n = outfitsOpen(); // нажатие меняет наряд, если их открыто больше одного
    if (n > 1) { S.outfit = ((S.outfit || 0) + 1) % n; save(); dressZaika(zaika); burst(V(zaika.position.x, 3.4 * zaika.scale.x, zaika.position.z + 0.6), 10); }
  });
  // птички на крыше: нажмёшь — облетят домик и вернутся
  (landscape ? [['#4fc3f7', -0.62], ['#ff8a65', -0.36]] : [['#4fc3f7', -0.2], ['#ff8a65', 0.3]]).forEach(([c, fx], i) => {
    const b = mkPtichka(c), x = fx * Wd / 2, y = rows * (ch + fl) + fl + roofH * Math.min(1, (-Math.abs(x) + Wd / 2 + 0.9) / (Wd / 2 + 0.3)) + 0.08, home = V(x, y, 0.45);
    b.position.copy(home); b.scale.setScalar(1.25); b.rotation.y = i ? -0.5 : 0.4; house.add(b);
    hitBox(b, 1.6, 1.6, 1.6, 0, 0.4, 0); b.userData.cy = 0.5;
    let fly = false;
    pickable(b, () => {
      if (fly) return; fly = true; for (let k = 0; k < 3; k++) setTimeout(() => SFX.chirp(), k * 260);
      const r0 = b.rotation.y, dir = i ? -1 : 1;
      twf(2800, (e, k) => {
        const a = k * Math.PI * 2; b.position.set(home.x + Math.sin(a) * 4.5 * dir, home.y + Math.sin(k * Math.PI) * 2.6 + Math.sin(a * 2) * 0.4, home.z + 1.2 - Math.cos(a) * 1.2);
        b.rotation.y = Math.cos(a) * dir > 0 ? Math.PI / 2 * dir : -Math.PI / 2 * dir; const f = Math.sin(k * 90) * 0.9; b.userData.wings[0].rotation.z = f; b.userData.wings[1].rotation.z = -f;
      }, 'inout').then(() => { b.position.copy(home); b.rotation.y = r0; b.userData.wings.forEach(w => w.rotation.z = 0); hop(b, 0.3, 300); fly = false; });
    });
    ENVT.push(t => { if (!fly) b.rotation.z = Math.sin(t * 3 + i * 2) * 0.08; });
  });
  // комнаты
  const icons = [];
  ROOM_KEYS.forEach((key, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = -Wd / 2 + cw * (c + 0.5), yc = (rows - 1 - r) * (ch + fl) + fl;
    const wp = mesh(new T.PlaneGeometry(cw - 0.28, ch), M(CELL_COL[key], 1), x, yc + ch / 2, -cd + 0.17); wp.castShadow = false; wp.receiveShadow = true; house.add(wp);
    const cell = grp(x, yc, -cd / 2 + 0.25); house.add(cell);
    const ic = cellIcon(key); cell.add(ic); icons.push(ic);
    ic.scale.setScalar(0.001); tws(ic, 1, 500, 'back', 200 + i * 70);
    // звёздочки на полу комнаты: комната пройдена — горят все пять
    const n = S.stars[key] ? 5 : 0;
    for (let k = 0; k < 5; k++) { const s = mkZvezda(k < n, 0.17); s.position.set((k - 2) * 0.5, -fl / 2, cd / 2 + 0.02); s.castShadow = false; cell.add(s); if (k < n) s.userData.tw = k; icons.push(s); }
    hitBox(cell, cw - 0.3, ch, cd, 0, ch / 2, 0); cell.userData.cy = ch / 2;
    pickable(cell, () => {
      if (busyWipe) return;
      SFX.tap(); hop(ic, 0.5, 350);
      const wp = cell.getWorldPosition(new T.Vector3());
      tw(FR, { cx: wp.x, cy: wp.y + ch / 2, halfW: cw * 0.75, halfH: ch * 0.75 }, 500, 'inout');
      twf(520, () => applyFrame());
      go(() => runRoom(key));
    });
  });
  speaker = zaika;
  ENVT.push(t => {
    icons.forEach(ic => { if (ic.userData.tick) ic.userData.tick(t); if (ic.userData.tw !== undefined) ic.rotation.y = Math.sin(t * 2 + ic.userData.tw) * 0.5; });
    smoke.forEach((s, i) => { const k = (t * 0.25 + i / 4) % 1; s.position.set(sx + Math.sin(k * 5 + i) * 0.3 + k * 0.8, sy + k * 3, -cd / 2); s.scale.setScalar(0.25 + k * 0.5); s.material.opacity = 0.8 * (1 - k); });
  });
  setTimeout(() => { if (my === session) Voice.say('vyberi'); }, 700);
}

function startScreen() {
  clearWorld();
  current = { name: 'start', rebuild: () => startScreen() };
  setFrame(landscape ? { cy: 1.1, halfW: 6, halfH: 3.9 } : { cy: 1.5, halfW: 3.4, halfH: 5.6 });
  lights(world); meadow(world);
  const z = actor(mkZaika()); z.scale.setScalar(1.5); z.position.set(0, 0, 0); z.userData.wave = true; world.add(z); speaker = z;
  ENVT.push(t => { z.rotation.y = Math.sin(t * 0.8) * 0.15; });
  UI.start.classList.add('on');
}
let started = false;
tapBtn($('bPlay'), () => {
  if (started) return; started = true;
  ac(); SFX.tap();
  try { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); } catch (e) {}
  UI.start.classList.remove('on');
  const my = session;
  if (speaker) happy(speaker);
  Voice.say('privet').then(() => { started = false; if (my === session) go(goHome); });
});

// ---------- главный цикл ----------
let last = performance.now(), fpsT = 0, fpsN = 0, fpsChecked = false;
function update(dt) {
  time += dt;
  updateTweens(dt); updateActors(dt); updateParts(dt);
  for (const f of ENVT) f(time, dt);
  if (current && current.g && current.g.tick) current.g.tick(time, dt);
  for (const h of HALO) { h.scale.setScalar(1 + Math.sin(time * 6) * 0.1); h.material.opacity = 0.65 + Math.sin(time * 6) * 0.3; }
  // лёгкое покачивание камеры — ощущение объёма
  if (current && current.camFn) { current.camFn(dt); return; } // прогулка по дому: камерой управляет dom.js
  cam.position.set(camBase.x + Math.sin(time * 0.5) * 0.25, camBase.y + Math.sin(time * 0.37) * 0.12, camBase.z);
  cam.lookAt(camLook);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!window.__manual) update(dt);
  R.render(scene, cam);
  // слабое устройство: убираем тени и снижаем чёткость
  if (!fpsChecked && !S.low) { fpsT += dt; fpsN++; if (fpsT > 6) { fpsChecked = true; if (fpsN / fpsT < 24 && !window.__noLow) { S.low = 1; save(); DPR = 1; if (sunLight) sunLight.castShadow = false; fit(); } } }
}

addEventListener('resize', () => { if (fit() && current) current.rebuild(); });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden) Voice.stop(); });

fit();
startScreen();
requestAnimationFrame(frame);
window.__Z = { ICONS, clearWorld, tw, wait, step(n) { for (let i = 0; i < n; i++) update(0.033); }, S, Voice, runRoom, goHome, ROOMS, go, get current() { return current; }, get PICK() { return PICK; }, scr, cam, scene };
