'use strict';
// «Домик Зайки» — развивающая игра для малышей 3 лет.
const VERSION = '0.1';
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
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const wait = ms => new Promise(r => setTimeout(r, ms));

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
const SFX = {
  tap() { tone(660, 0, 0.12, 'triangle', 0.12, 880); },
  pop() { tone(500, 0, 0.15, 'sine', 0.25, 1400); },
  good() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.3, 'triangle', 0.14)); },
  soft() { tone(330, 0, 0.18, 'sine', 0.14, 260); tone(300, 0.16, 0.22, 'sine', 0.12, 240); },
  whoosh() { tone(300, 0, 0.35, 'sine', 0.1, 900); },
  munch() { [0, 0.15, 0.3].forEach(t => tone(180, t, 0.09, 'square', 0.06, 120)); },
  fanfare() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, i === 5 ? 0.7 : 0.22, 'triangle', 0.16)); },
};

// ---------- голос ----------
const TEXT = {}; (window.FRAZY || []).forEach(([id, t]) => TEXT[id] = t);
const Voice = {
  have: new Set(window.ZAPISI || []),
  buf: {}, token: 0, src: null, ru: null,
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
    if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  async say(ids) {
    if (!Array.isArray(ids)) ids = [ids];
    this.stop();
    const t = this.token;
    for (const id of ids) {
      if (t !== this.token) return false;
      await this.one(id, t);
    }
    return t === this.token;
  },
  one(id, t) {
    if (this.have.has(id)) {
      return this.load(id).then(b => {
        if (t !== this.token) return;
        if (!b) return this.tts(TEXT[id] || id);
        return new Promise(res => {
          const c = ac(), s = c.createBufferSource(), g = c.createGain();
          g.gain.value = 1.0; s.buffer = b; s.connect(g).connect(c.destination);
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

const PRAISE = ['molodec', 'umnica', 'pravilno', 'ura', 'zdorovo', 'tak_derzhat'];
let lastPraise = '';
function praise() { let p; do p = pick(PRAISE); while (p === lastPraise); lastPraise = p; return p; }

// ---------- рисунки (SVG) ----------
const COLORS = {
  krasny: '#e53935', zhelty: '#fdd835', siniy: '#1e66f5',
  zeleny: '#43a047', oranzhevy: '#fb8c00', rozovy: '#f06292',
};
const ART = {
  zaika() {
    const ear = (x, r) => `<g transform="rotate(${r} ${x} 70)"><ellipse cx="${x}" cy="62" rx="21" ry="58" fill="#fbf7f2" stroke="#5b4636" stroke-width="4"/><ellipse cx="${x}" cy="68" rx="9" ry="42" fill="#f6b7c6"/></g>`;
    return `<svg viewBox="0 0 200 290">${ear(72, -12)}${ear(128, 12)}
      <ellipse cx="74" cy="276" rx="22" ry="11" fill="#fbf7f2" stroke="#5b4636" stroke-width="4"/>
      <ellipse cx="126" cy="276" rx="22" ry="11" fill="#fbf7f2" stroke="#5b4636" stroke-width="4"/>
      <ellipse cx="100" cy="232" rx="55" ry="45" fill="#fbf7f2" stroke="#5b4636" stroke-width="4"/>
      <ellipse cx="100" cy="246" rx="30" ry="26" fill="#fff"/>
      <circle cx="100" cy="150" r="62" fill="#fbf7f2" stroke="#5b4636" stroke-width="4"/>
      <ellipse cx="78" cy="145" rx="8" ry="10" fill="#3a2a20"/><circle cx="81" cy="141" r="3" fill="#fff"/>
      <ellipse cx="122" cy="145" rx="8" ry="10" fill="#3a2a20"/><circle cx="125" cy="141" r="3" fill="#fff"/>
      <circle cx="64" cy="168" r="11" fill="#f9a8b8" opacity=".6"/><circle cx="136" cy="168" r="11" fill="#f9a8b8" opacity=".6"/>
      <path d="M92 160 Q100 154 108 160 Q100 169 92 160Z" fill="#f08aa0"/>
      <path d="M100 166 v6 M100 172 q-7 7 -13 0 M100 172 q7 7 13 0" stroke="#5b4636" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M100 216 L76 204 L76 228 Z M100 216 L124 204 L124 228 Z" fill="#ff6b8a" stroke="#5b4636" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="100" cy="216" r="7" fill="#ff6b8a" stroke="#5b4636" stroke-width="3"/></svg>`;
  },
  shar(c) {
    return `<svg viewBox="0 0 100 170"><path d="M50 100 Q42 120 54 138 Q63 155 50 168" stroke="#8a8a8a" stroke-width="2.5" fill="none"/>
      <path d="M50 96 l-7 9 h14z" fill="${c}"/>
      <ellipse cx="50" cy="52" rx="40" ry="47" fill="${c}" stroke="rgba(0,0,0,.18)" stroke-width="2"/>
      <ellipse cx="35" cy="33" rx="9" ry="16" fill="#fff" opacity=".5" transform="rotate(25 35 33)"/></svg>`;
  },
  vedro(c) {
    return `<svg viewBox="0 0 120 130"><path d="M76 40 L104 2" stroke="#8d6e63" stroke-width="8" stroke-linecap="round"/>
      <path d="M100 6 L110 -6" stroke="${c}" stroke-width="12" stroke-linecap="round"/>
      <path d="M18 44 Q60 -6 102 44" fill="none" stroke="#607d8b" stroke-width="4"/>
      <path d="M18 44 L28 114 Q60 124 92 114 L102 44Z" fill="#cfd8dc" stroke="#607d8b" stroke-width="4"/>
      <ellipse cx="60" cy="44" rx="42" ry="12" fill="${c}" stroke="#607d8b" stroke-width="4"/>
      <path d="M32 52 Q34 74 30 86" stroke="${c}" stroke-width="10" stroke-linecap="round" fill="none"/></svg>`;
  },
  shapePath(s) {
    if (s === 'krug') return '<circle cx="50" cy="50" r="42"/>';
    if (s === 'kvadrat') return '<rect x="11" y="11" width="78" height="78" rx="7"/>';
    if (s === 'treugolnik') return '<path d="M50 9 L93 86 H7Z" stroke-linejoin="round"/>';
    if (s === 'serdce') return '<path d="M50 88 C10 60 3 34 21 19 C36 8 48 17 50 28 C52 17 64 8 79 19 C97 34 90 60 50 88Z"/>';
    if (s === 'zvezda') {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 19 : 46;
        d += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(1) + ' ' + (54 + r * Math.sin(a)).toFixed(1);
      }
      return `<path d="${d}Z" stroke-linejoin="round"/>`;
    }
  },
  SHAPE_COL: { krug: '#e53935', kvadrat: '#1e66f5', treugolnik: '#43a047', zvezda: '#fdd835', serdce: '#f06292' },
  figura(s) {
    const c = ART.SHAPE_COL[s];
    return `<svg viewBox="0 0 100 100"><g fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="3">${ART.shapePath(s)}</g>
      <g fill="#fff" opacity=".28" transform="translate(50 50) scale(.55) translate(-58 -60)">${ART.shapePath(s)}</g></svg>`;
  },
  dyrka(s) {
    return `<svg viewBox="0 0 100 100"><g fill="#3e2418" stroke="#2a160d" stroke-width="4" transform="translate(50 50) scale(1.08) translate(-50 -50)">${ART.shapePath(s)}</g></svg>`;
  },
  ezhik() {
    const cx = 140, cy = 100, rx = 88, ry = 60; let pts = [];
    const N = 22, t0 = 195, t1 = 395;
    for (let i = 0; i <= N * 2; i++) {
      const t = (t0 + (t1 - t0) * i / (N * 2)) * Math.PI / 180, k = i % 2 ? 1.3 : 1.0;
      pts.push((cx + rx * k * Math.cos(t)).toFixed(1) + ',' + (cy + ry * k * Math.sin(t)).toFixed(1));
    }
    return `<svg viewBox="0 0 250 180"><polygon points="${pts.join(' ')}" fill="#6d4c41" stroke="#3e2723" stroke-width="4" stroke-linejoin="round"/>
      <ellipse cx="${cx}" cy="${cy + 8}" rx="${rx - 6}" ry="${ry - 8}" fill="#6d4c41"/>
      <ellipse cx="100" cy="166" rx="16" ry="9" fill="#8d6e63" stroke="#3e2723" stroke-width="3"/>
      <ellipse cx="180" cy="166" rx="16" ry="9" fill="#8d6e63" stroke="#3e2723" stroke-width="3"/>
      <path d="M120 70 Q62 66 20 112 Q62 156 124 150 Q150 110 120 70Z" fill="#ecd2aa" stroke="#3e2723" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="21" cy="111" r="10" fill="#2b1b14"/><circle cx="18" cy="107" r="3" fill="#fff"/>
      <ellipse cx="66" cy="100" rx="7" ry="9" fill="#2b1b14"/><circle cx="68" cy="97" r="2.5" fill="#fff"/>
      <circle cx="74" cy="124" r="9" fill="#f9a8b8" opacity=".6"/>
      <path d="M34 128 Q48 138 60 130" stroke="#3e2723" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="108" cy="80" r="11" fill="#ecd2aa" stroke="#3e2723" stroke-width="3"/></svg>`;
  },
  yabloko() {
    return `<svg viewBox="0 0 100 100"><path d="M50 30 C30 18 8 30 10 56 C12 82 32 96 50 88 C68 96 88 82 90 56 C92 30 70 18 50 30Z" fill="#e53935" stroke="#9b1b1b" stroke-width="3"/>
      <path d="M50 30 Q50 18 56 9" stroke="#5d4037" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M55 18 Q70 5 82 15 Q69 27 55 18Z" fill="#43a047" stroke="#2e7d32" stroke-width="2"/>
      <ellipse cx="31" cy="48" rx="7" ry="12" fill="#fff" opacity=".4"/></svg>`;
  },
  derevo() {
    return `<svg viewBox="0 0 400 520"><path d="M170 520 L180 300 Q140 260 120 240 L135 232 Q170 262 190 280 L200 210 L215 210 L222 280 Q250 250 280 236 L290 248 Q250 270 228 300 L238 520Z" fill="#8d5a3b" stroke="#5d3a24" stroke-width="5" stroke-linejoin="round"/>
      <g stroke="#2e7d32" stroke-width="5">
      <circle cx="120" cy="200" r="95" fill="#5fb85a"/><circle cx="280" cy="200" r="95" fill="#5fb85a"/>
      <circle cx="200" cy="120" r="105" fill="#6cc463"/><circle cx="200" cy="230" r="90" fill="#5fb85a"/></g>
      <circle cx="200" cy="120" r="101" fill="#6cc463"/><circle cx="120" cy="200" r="91" fill="#5fb85a" opacity=".0"/>
      <ellipse cx="160" cy="80" rx="40" ry="22" fill="#8ed683" opacity=".6"/></svg>`;
  },
  mishka() {
    return `<svg viewBox="0 0 200 235"><g stroke="#4e2f1a" stroke-width="4">
      <circle cx="50" cy="50" r="25" fill="#a1693e"/><circle cx="150" cy="50" r="25" fill="#a1693e"/>
      <ellipse cx="100" cy="186" rx="62" ry="46" fill="#a1693e"/>
      <ellipse cx="44" cy="176" rx="17" ry="27" fill="#a1693e" transform="rotate(25 44 176)"/>
      <ellipse cx="156" cy="176" rx="17" ry="27" fill="#a1693e" transform="rotate(-25 156 176)"/>
      <ellipse cx="68" cy="224" rx="23" ry="13" fill="#a1693e"/><ellipse cx="132" cy="224" rx="23" ry="13" fill="#a1693e"/>
      <circle cx="100" cy="96" r="60" fill="#a1693e"/></g>
      <circle cx="50" cy="50" r="12" fill="#d9a77a"/><circle cx="150" cy="50" r="12" fill="#d9a77a"/>
      <ellipse cx="100" cy="194" rx="36" ry="28" fill="#d9a77a"/>
      <ellipse cx="100" cy="120" rx="29" ry="22" fill="#e8c39e"/>
      <ellipse cx="100" cy="109" rx="11" ry="8" fill="#2b1b14"/>
      <path d="M100 116 v8 M100 124 q-8 7 -14 0 M100 124 q8 7 14 0" stroke="#2b1b14" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="76" cy="88" rx="7" ry="8" fill="#2b1b14"/><circle cx="78" cy="85" r="2.5" fill="#fff"/>
      <ellipse cx="124" cy="88" rx="7" ry="8" fill="#2b1b14"/><circle cx="126" cy="85" r="2.5" fill="#fff"/>
      <circle cx="64" cy="112" r="9" fill="#f9a8b8" opacity=".5"/><circle cx="136" cy="112" r="9" fill="#f9a8b8" opacity=".5"/></svg>`;
  },
  krovatka() {
    return `<svg viewBox="0 0 300 210"><g stroke="#5d3a24" stroke-width="5" stroke-linejoin="round">
      <rect x="10" y="30" width="48" height="175" rx="22" fill="#a1704e"/>
      <rect x="248" y="90" width="44" height="115" rx="18" fill="#a1704e"/>
      <rect x="40" y="128" width="226" height="48" rx="12" fill="#fff8e7"/>
      <rect x="40" y="168" width="226" height="18" rx="6" fill="#a1704e"/></g>
      <ellipse cx="95" cy="122" rx="38" ry="18" fill="#fff" stroke="#c9b8a0" stroke-width="4"/>
      <circle cx="34" cy="70" r="9" fill="#ffd54f"/><circle cx="270" cy="120" r="7" fill="#ffd54f"/></svg>`;
  },
  odeyalo() {
    let dots = '';
    for (let i = 0; i < 9; i++) dots += `<circle cx="${135 + (i % 5) * 26 + (i > 4 ? 13 : 0)}" cy="${138 + (i > 4 ? 22 : 0)}" r="5" fill="#fff" opacity=".8"/>`;
    return `<svg viewBox="0 0 300 210"><rect x="110" y="118" width="160" height="60" rx="16" fill="#64b5f6" stroke="#1e66f5" stroke-width="4"/>${dots}</svg>`;
  },
  zver(z) {
    const E = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="10" fill="#2b1b14"/><circle cx="${x + 3}" cy="${y - 4}" r="3" fill="#fff"/>`;
    const L = 'stroke="#3a2a20" stroke-width="4" stroke-linejoin="round"';
    const ch = (y, c = '#f9a8b8') => `<circle cx="58" cy="${y}" r="10" fill="${c}" opacity=".55"/><circle cx="142" cy="${y}" r="10" fill="${c}" opacity=".55"/>`;
    const A = {
      korova: `<path d="M62 52 Q42 20 60 14 Q66 34 76 46Z" fill="#fff3d6" ${L}/><path d="M138 52 Q158 20 140 14 Q134 34 124 46Z" fill="#fff3d6" ${L}/>
        <ellipse cx="34" cy="78" rx="26" ry="13" fill="#fff" ${L} transform="rotate(-25 34 78)"/><ellipse cx="166" cy="78" rx="26" ry="13" fill="#fff" ${L} transform="rotate(25 166 78)"/>
        <ellipse cx="100" cy="98" rx="60" ry="64" fill="#fff" ${L}/>
        <path d="M58 70 Q66 46 92 50 Q96 70 80 84 Q64 90 58 70Z" fill="#3a2a20"/><path d="M128 120 Q150 110 156 96 Q160 120 146 132Z" fill="#3a2a20"/>
        ${E(80, 96)}${E(120, 96)}
        <ellipse cx="100" cy="146" rx="46" ry="32" fill="#f8bbd0" ${L}/>
        <ellipse cx="84" cy="146" rx="6" ry="9" fill="#ad1457"/><ellipse cx="116" cy="146" rx="6" ry="9" fill="#ad1457"/>`,
      sobaka: `<ellipse cx="100" cy="100" rx="60" ry="62" fill="#d39a64" ${L}/>
        <ellipse cx="42" cy="96" rx="22" ry="46" fill="#7b4a2a" ${L} transform="rotate(18 42 96)"/><ellipse cx="158" cy="96" rx="22" ry="46" fill="#7b4a2a" ${L} transform="rotate(-18 158 96)"/>
        <ellipse cx="124" cy="88" rx="20" ry="18" fill="#7b4a2a" opacity=".55"/>
        ${E(80, 90)}${E(122, 88)}
        <ellipse cx="100" cy="136" rx="38" ry="28" fill="#f3dcc0" ${L}/>
        <path d="M92 150 Q100 176 110 150Z" fill="#ff7b9c" ${L}/>
        <ellipse cx="100" cy="122" rx="14" ry="10" fill="#2b1b14"/>
        <path d="M100 130 v10 M100 140 q-10 8 -18 0 M100 140 q10 8 18 0" stroke="#3a2a20" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
      koshka: `<path d="M44 82 L48 22 L92 52Z" fill="#ffb74d" ${L}/><path d="M156 82 L152 22 L108 52Z" fill="#ffb74d" ${L}/>
        <path d="M54 66 L56 38 L78 54Z" fill="#f8bbd0"/><path d="M146 66 L144 38 L122 54Z" fill="#f8bbd0"/>
        <ellipse cx="100" cy="110" rx="66" ry="58" fill="#ffb74d" ${L}/>
        <path d="M100 56 v20 M86 58 l4 16 M114 58 l-4 16" stroke="#e67e22" stroke-width="6" stroke-linecap="round"/>
        <ellipse cx="78" cy="104" rx="10" ry="13" fill="#7cb342" stroke="#2b1b14" stroke-width="3"/><ellipse cx="78" cy="104" rx="3.5" ry="10" fill="#2b1b14"/>
        <ellipse cx="122" cy="104" rx="10" ry="13" fill="#7cb342" stroke="#2b1b14" stroke-width="3"/><ellipse cx="122" cy="104" rx="3.5" ry="10" fill="#2b1b14"/>
        ${ch(130)}
        <path d="M93 124 h14 l-7 8z" fill="#f06292"/>
        <path d="M100 132 q-8 10 -16 2 M100 132 q8 10 16 2" stroke="#3a2a20" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M70 130 L28 122 M70 138 L30 144 M130 130 L172 122 M130 138 L170 144" stroke="#3a2a20" stroke-width="2.5" stroke-linecap="round"/>`,
      utka: `<path d="M96 36 Q90 14 104 12 Q100 26 108 36Z" fill="#fbc02d" ${L}/>
        <circle cx="100" cy="98" r="64" fill="#ffeb3b" ${L}/>
        ${E(76, 88)}${E(124, 88)}${ch(116, '#ff8a65')}
        <path d="M56 134 Q100 108 144 134 Q100 168 56 134Z" fill="#ff9800" ${L}/>
        <path d="M62 134 Q100 140 138 134" stroke="#3a2a20" stroke-width="3" fill="none"/>`,
      svinka: `<path d="M48 66 L40 24 L84 46Z" fill="#f48fb1" ${L}/><path d="M152 66 L160 24 L116 46Z" fill="#f48fb1" ${L}/>
        <ellipse cx="100" cy="106" rx="66" ry="60" fill="#f8bbd0" ${L}/>
        ${E(76, 92)}${E(124, 92)}${ch(128, '#f06292')}
        <ellipse cx="100" cy="130" rx="30" ry="22" fill="#f48fb1" ${L}/>
        <ellipse cx="90" cy="130" rx="5" ry="8" fill="#ad1457"/><ellipse cx="110" cy="130" rx="5" ry="8" fill="#ad1457"/>
        <path d="M86 156 q14 9 28 0" stroke="#3a2a20" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
      ovechka: (() => {
        let w = '';
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; w += `<circle cx="${(100 + 62 * Math.cos(a)).toFixed(0)}" cy="${(100 + 58 * Math.sin(a)).toFixed(0)}" r="28" fill="#fff" ${L}/>`; }
        return w + `<ellipse cx="100" cy="100" rx="66" ry="62" fill="#fff"/>
          <ellipse cx="46" cy="104" rx="22" ry="11" fill="#5d5d5d" ${L} transform="rotate(20 46 104)"/><ellipse cx="154" cy="104" rx="22" ry="11" fill="#5d5d5d" ${L} transform="rotate(-20 154 104)"/>
          <ellipse cx="100" cy="114" rx="38" ry="46" fill="#6b6b6b" ${L}/>
          <circle cx="86" cy="58" r="14" fill="#fff" ${L}/><circle cx="106" cy="54" r="15" fill="#fff" ${L}/><circle cx="118" cy="64" r="12" fill="#fff" ${L}/>
          <ellipse cx="85" cy="104" rx="9" ry="10" fill="#fff"/><ellipse cx="115" cy="104" rx="9" ry="10" fill="#fff"/>
          ${E(86, 106)}${E(114, 106)}
          <ellipse cx="100" cy="134" rx="8" ry="5" fill="#2b1b14"/>
          <path d="M100 138 v6 M100 144 q-7 6 -12 0 M100 144 q7 6 12 0" stroke="#2b1b14" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      })(),
    };
    return `<svg viewBox="0 0 200 200">${A[z]}</svg>`;
  },
  zvezdochka(fill = '#ffd54f', stroke = '#f9a825') {
    return `<svg viewBox="0 0 100 100"><g fill="${fill}" stroke="${stroke}" stroke-width="6">${ART.shapePath('zvezda')}</g></svg>`;
  },
  domik() {
    return `<svg viewBox="0 0 100 100"><path d="M14 48 L50 16 L86 48" fill="none" stroke="#5d3a24" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M24 44 V84 H76 V44" fill="#ffcc80" stroke="#5d3a24" stroke-width="7" stroke-linejoin="round"/>
      <rect x="42" y="58" width="16" height="26" fill="#e57373" stroke="#5d3a24" stroke-width="5"/></svg>`;
  },
  ushko() {
    return `<svg viewBox="0 0 100 100"><path d="M22 40 h14 l20 -16 v52 l-20 -16 h-14z" fill="#fff" stroke="#5d3a24" stroke-width="6" stroke-linejoin="round"/>
      <path d="M66 36 q10 14 0 28 M76 26 q18 24 0 48" fill="none" stroke="#5d3a24" stroke-width="6" stroke-linecap="round"/></svg>`;
  },
  snova() {
    return `<svg viewBox="0 0 100 100"><path d="M74 34 A30 30 0 1 0 80 58" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>
      <path d="M62 20 L82 34 L62 46Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/></svg>`;
  },
  play() {
    return `<svg viewBox="0 0 100 100"><path d="M36 24 L78 50 L36 76Z" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round"/></svg>`;
  },
};

// ---------- сцена ----------
const app = document.getElementById('app');
let stage = null, W = 1600, H = 1000, scale = 1, landscape = true;
let current = null; // {name, rebuild}

function fit() {
  const L = innerWidth >= innerHeight;
  const changed = L !== landscape;
  landscape = L; W = L ? 1600 : 1000; H = L ? 1000 : 1600;
  scale = Math.min(innerWidth / W, innerHeight / H);
  if (stage) {
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    stage.style.transform = `translate(-50%,-50%) scale(${scale})`;
  }
  return changed;
}
function newStage(bg) {
  app.innerHTML = '';
  document.body.style.background = bg;
  stage = document.createElement('div'); stage.className = 'stage';
  app.appendChild(stage); fit();
  return stage;
}
function mk(html, cls = '', parent = stage) {
  const el = document.createElement('div');
  el.className = 'el ' + cls; el.innerHTML = html;
  parent.appendChild(el); return el;
}
function place(el, x, y, w, h) {
  el._x = x; el._y = y;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  if (w != null) { el.style.width = w + 'px'; el._w = w; }
  if (h != null) { el.style.height = h + 'px'; el._h = h; }
  return el;
}
function moveTo(el, x, y, ms = 500, extra = {}) {
  const from = { left: el._x + 'px', top: el._y + 'px' }, to = Object.assign({ left: x + 'px', top: y + 'px' }, extra.to || {});
  el._x = x; el._y = y;
  const a = el.animate([Object.assign(from, extra.from || {}), to], { duration: ms, easing: extra.easing || 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  return new Promise(r => a.onfinish = () => { el.style.left = x + 'px'; el.style.top = y + 'px'; r(); });
}
function anim(el, name) { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); }
function toLocal(e) {
  const r = stage.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}
function onTap(el, fn) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Idle.poke(); fn(e); });
}
function burst(x, y, n = 12, big = false) {
  for (let i = 0; i < n; i++) {
    const s = mk(ART.zvezdochka(pick(['#ffd54f', '#ff8a80', '#80d8ff', '#b9f6ca', '#ea80fc'])), 'spark');
    const sz = (big ? 60 : 40) + rnd(30); place(s, x, y, sz, sz);
    const a = Math.random() * Math.PI * 2, d = (big ? 260 : 150) + rnd(120);
    const an = s.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(${rnd(360)}deg)`, opacity: 0 }],
      { duration: 900 + rnd(400), easing: 'cubic-bezier(.2,.8,.4,1)' });
    an.onfinish = () => s.remove();
  }
}

// подсказка, если ребёнок долго ничего не делает
const Idle = {
  t: null, fn: null, n: 0,
  set(fn) { this.fn = fn; this.n = 0; this.arm(); },
  arm() { clearTimeout(this.t); if (this.fn && this.n < 3) this.t = setTimeout(() => { this.n++; this.fn(); this.arm(); }, this.n ? 11000 : 8000); },
  poke() { if (this.fn) { this.n = Math.min(this.n, 1); this.arm(); } },
  off() { clearTimeout(this.t); this.fn = null; },
};

// ---------- перетаскивание ----------
function draggable(el, opts) {
  el.classList.add('drag');
  el.addEventListener('pointerdown', e => {
    if (el._locked) return;
    e.preventDefault(); e.stopPropagation(); Idle.poke();
    el.setPointerCapture(e.pointerId);
    const p0 = toLocal(e), x0 = el._x, y0 = el._y; let moved = false;
    el.classList.add('held'); opts.onGrab && opts.onGrab();
    const mv = ev => {
      const p = toLocal(ev);
      if (Math.hypot(p.x - p0.x, p.y - p0.y) > 12) moved = true;
      place(el, x0 + p.x - p0.x, y0 + p.y - p0.y);
    };
    const up = ev => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('held');
      if (!moved) { place(el, x0, y0); opts.onTap && opts.onTap(); return; }
      const ok = opts.onDrop(el._x, el._y);
      if (!ok) moveTo(el, x0, y0, 350);
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
}
// ближайшая цель к точке (дети промахиваются — берём щедрый радиус)
function nearest(targets, x, y, maxD) {
  let best = null, bd = maxD;
  for (const t of targets) { const d = Math.hypot(t._x - x, t._y - y); if (d < bd) { bd = d; best = t; } }
  return best;
}

// ---------- шапка комнаты ----------
function header(game) {
  const home = place(mk(ART.domik(), 'btn round'), 85, 85, 130, 130);
  onTap(home, () => { SFX.tap(); goHome(); });
  const rep = place(mk(ART.ushko(), 'btn round'), W - 85, 85, 130, 130);
  onTap(rep, () => { SFX.tap(); game.repeat && game.repeat(); });
  const stars = [];
  for (let i = 0; i < ROUNDS; i++) {
    stars.push(place(mk(ART.zvezdochka('rgba(255,255,255,.55)', 'rgba(0,0,0,.18)'), 'pstar'), W / 2 + (i - (ROUNDS - 1) / 2) * 88, 80, 74, 74));
  }
  return stars;
}

// ---------- комнаты ----------
const ROOMS = {};
let session = 0;

function runRoom(key, keepRound) {
  const R = ROOMS[key];
  const my = ++session;
  Idle.off(); Voice.stop();
  newStage(R.bg);
  const lvl = Math.min(2, S.stars[key] || 0);
  const g = { key, lvl, round: keepRound || 0, wrong: 0, my, alive: () => my === session };
  current = { name: key, rebuild: () => runRoom(key, g.round) };
  g.pstars = header(g);
  for (let i = 0; i < g.round; i++) g.pstars[i].innerHTML = ART.zvezdochka();
  Voice.preload(R.voice || []);
  R.setup(g);
  g.next = async () => {
    if (!g.alive()) return;
    g.wrong = 0; Idle.off();
    if (g.round >= ROUNDS) return finish(g);
    R.round(g);
  };
  g.solved = async (x, y, sayFirst) => {
    Idle.off();
    const st = g.pstars[g.round];
    st.innerHTML = ART.zvezdochka(); anim(st, 'popin');
    burst(x, y, 12); SFX.good();
    g.round++;
    await Voice.say([].concat(sayFirst || [], praise()));
    if (!g.alive()) return;
    await wait(250);
    g.next();
  };
  g.miss = () => { g.wrong++; SFX.soft(); };
  (async () => {
    if (!keepRound) { await wait(300); await Voice.say(R.intro); }
    if (g.alive()) g.next();
  })();
}

async function finish(g) {
  S.stars[g.key] = (S.stars[g.key] || 0) + 1; save();
  const ov = mk('', 'overlay');
  const big = place(mk(ART.zvezdochka(), 'bigstar'), W / 2, H / 2 - 110, 320, 320);
  SFX.fanfare(); burst(W / 2, H / 2 - 60, 30, true);
  setTimeout(() => g.alive() && burst(W / 2, H / 2 - 60, 24, true), 600);
  await Voice.say(['final']);
  if (!g.alive()) return;
  const again = place(mk(ART.snova(), 'btn round green'), W / 2 - 150, H / 2 + 230, 190, 190);
  const home = place(mk(ART.domik(), 'btn round'), W / 2 + 150, H / 2 + 230, 190, 190);
  anim(again, 'popin'); anim(home, 'popin');
  onTap(again, () => { SFX.tap(); runRoom(g.key); });
  onTap(home, () => { SFX.tap(); goHome(); });
  Voice.say(['esche']);
}

// ===== 1. Краски =====
ROOMS.kraski = {
  bg: 'linear-gradient(#bfe8ff, #e9f7ff 60%, #c8eac0 60%, #a8dca0)',
  intro: 'kraski_intro',
  voice: ['kraski_intro', ...Object.keys(COLORS).flatMap(c => ['najdi_' + c, 'eto_' + c])],
  setup(g) {
    if (landscape) {
      g.zaika = place(mk(ART.zaika(), 'bob'), 230, 640, 300, 435);
      g.vedro = place(mk(ART.vedro('#fff')), 430, 800, 190, 205);
    } else {
      g.zaika = place(mk(ART.zaika(), 'bob'), 230, 1300, 260, 377);
      g.vedro = place(mk(ART.vedro('#fff')), 470, 1430, 180, 195);
    }
    g.balls = []; g.prev = null;
  },
  round(g) {
    g.balls.forEach(b => b.remove()); g.balls = [];
    const pal = g.lvl < 2 ? ['krasny', 'zhelty', 'siniy', 'zeleny'] : Object.keys(COLORS);
    const n = [2, 3, 4][g.lvl];
    let target; do target = pick(pal); while (target === g.prev); g.prev = target;
    const cols = shuffle([target, ...shuffle(pal.filter(c => c !== target)).slice(0, n - 1)]);
    g.vedro.innerHTML = ART.vedro(COLORS[target]); anim(g.vedro, 'popin');
    cols.forEach((c, i) => {
      let x, y, w = 200;
      if (landscape) { const x0 = 620, x1 = 1480; x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * (i + 0.5) / n; y = 470 + (i % 2) * 70; w = n > 3 ? 190 : 220; }
      else { const cols2 = n > 2 ? 2 : n; const r = Math.floor(i / cols2), k = i % cols2; x = 1000 * (k + 0.5) / cols2; y = 420 + r * 380 + (k % 2) * 40; w = 220; }
      const b = place(mk(ART.shar(COLORS[c]), 'bob ball'), x, y, w, w * 1.7);
      b.style.animationDelay = (-Math.random() * 2) + 's'; b._c = c;
      b.animate([{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3,1.6,.5,1)', delay: i * 120, fill: 'backwards' });
      onTap(b, async () => {
        if (b._locked || g.busy) return;
        if (c === target) {
          g.busy = true; g.balls.forEach(x => x._locked = true);
          SFX.pop(); b.classList.remove('bob');
          moveTo(b, b._x, -300, 1100, { easing: 'ease-in' });
          await g.solved(b._x, b._y);
          g.busy = false;
        } else {
          g.miss(); anim(b, 'shake');
          if (g.wrong >= 2) g.balls.forEach(x => x._c === target && x.classList.add('glow'));
          Voice.say(['eto_' + c, 'najdi_' + target]);
        }
      });
      g.balls.push(b);
    });
    g.repeat = () => Voice.say('najdi_' + target);
    Voice.say('najdi_' + target);
    Idle.set(() => { Voice.say('najdi_' + target); g.balls.forEach(x => x._c === target && anim(x, 'hint')); });
  },
};

// ===== 2. Фигуры =====
ROOMS.figury = {
  bg: 'linear-gradient(#ffe7c2, #fff4e0 70%, #f3d2a2 70%)',
  intro: 'figury_intro',
  voice: ['figury_intro', 'ne_podhodit', ...['krug', 'kvadrat', 'treugolnik', 'zvezda', 'serdce'].flatMap(s => ['figura_' + s, 'naz_' + s])],
  setup(g) {
    g.all = ['krug', 'kvadrat', 'treugolnik', 'zvezda', 'serdce'];
    g.set = g.all.slice(0, [3, 4, 5][g.lvl]);
    const n = g.set.length;
    if (landscape) g.box = place(mk('', 'box'), 800, 760, Math.min(1400, 280 * n + 120), 330);
    else g.box = place(mk('', 'box'), 500, 1230, 900, n > 3 ? 600 : 330);
    g.zaika = place(mk(ART.zaika(), 'bob'), landscape ? 170 : 150, landscape ? 380 : 470, 200, 290);
    g.holes = []; g.prev = null;
  },
  round(g) {
    g.holes.forEach(h => h.remove()); g.holes = [];
    if (g.shape) g.shape.remove();
    const order = shuffle(g.set), n = order.length;
    order.forEach((s, i) => {
      let x, y;
      if (landscape) { x = 800 + (i - (n - 1) / 2) * 280; y = 760; }
      else { const perRow = n > 3 ? Math.ceil(n / 2) : n; const r = Math.floor(i / perRow), k = i % perRow, cnt = r === 0 ? Math.min(perRow, n) : n - perRow; x = 500 + (k - (cnt - 1) / 2) * 280; y = n > 3 ? 1095 + r * 270 : 1230; }
      const h = place(mk(ART.dyrka(s), 'hole'), x, y, 200, 200); h._s = s;
      onTap(h, () => tryHole(h));
      g.holes.push(h);
    });
    let target; do target = pick(g.set); while (target === g.prev && g.set.length > 1); g.prev = target;
    const sx = landscape ? 800 : 500, sy = landscape ? 360 : 600;
    const sh = g.shape = place(mk(ART.figura(target), 'shape'), sx, sy, 230, 230);
    anim(sh, 'popin');
    let busy = false;
    const tryHole = async h => {
      if (busy) return false;
      if (h._s === target) {
        busy = true; sh._locked = true;
        await moveTo(sh, h._x, h._y, 380);
        SFX.whoosh();
        sh.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(.75)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(.1)', opacity: 0 }], { duration: 450, fill: 'forwards' });
        g.solved(h._x, h._y - 60, 'naz_' + target);
        return true;
      }
      g.miss(); anim(h, 'shake');
      if (g.wrong >= 2) g.holes.forEach(x => x._s === target && x.classList.add('glow'));
      Voice.say('ne_podhodit');
      return false;
    };
    draggable(sh, {
      onDrop: (x, y) => { const h = nearest(g.holes, x, y, 190); if (!h) return false; tryHole(h); return h._s === target; },
      onTap: () => Voice.say('figura_' + target),
    });
    g.repeat = () => Voice.say('figura_' + target);
    Voice.say('figura_' + target);
    Idle.set(() => { Voice.say('figura_' + target); anim(sh, 'hint'); g.holes.forEach(x => x._s === target && anim(x, 'hint')); });
  },
};

// ===== 3. Считалка =====
ROOMS.schet = {
  bg: 'linear-gradient(#d7f3ff, #effaff 62%, #b8e3a1 62%, #9ad08a)',
  intro: 'schet_intro',
  voice: ['schet_intro', 'nyam', 'sorvi', 1, 2, 3, 4, 5].flatMap(x => typeof x === 'number' ? ['hochet_' + x, 'chislo_' + x] : [x]),
  setup(g) {
    if (landscape) {
      g.tree = place(mk(ART.derevo()), 400, 540, 640, 832);
      g.ezh = place(mk(ART.ezhik()), 1190, 790, 440, 317);
      g.plateXY = [1190, 470];
    } else {
      g.tree = place(mk(ART.derevo()), 500, 560, 620, 806);
      g.ezh = place(mk(ART.ezhik()), 640, 1410, 400, 288);
      g.plateXY = [500, 1130];
    }
    const t = g.tree;
    const k = t._w / 400;
    g.spots = [[110, 190], [200, 90], [290, 180], [150, 280], [250, 270], [200, 190], [90, 110]].map(([x, y]) => [t._x - t._w / 2 + x * k, t._y - t._h / 2 + y * k]);
    g.apples = []; g.prevN = null;
  },
  round(g) {
    const pool = [[1, 2, 3], [2, 3, 4], [3, 4, 5]][g.lvl];
    let N; do N = pick(pool); while (N === g.prevN); g.prevN = N;
    // тарелка со слотами
    if (g.plate) g.plate.remove();
    const pw = 120 * N + 80;
    g.plate = place(mk('', 'plate'), g.plateXY[0], g.plateXY[1], Math.max(240, pw), 150);
    const slots = [];
    for (let i = 0; i < N; i++) slots.push(place(mk('', 'slot', g.plate), Math.max(240, pw) / 2 + (i - (N - 1) / 2) * 120, 75, 100, 100));
    // яблоки на дереве
    g.apples.forEach(a => a.remove()); g.apples = [];
    g.spots.forEach(([x, y], i) => {
      const a = place(mk(ART.yabloko(), 'apple'), x, y, 110, 110);
      a.style.animationDelay = (-Math.random() * 2) + 's';
      a.animate([{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 350, delay: i * 70, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'backwards' });
      g.apples.push(a);
      onTap(a, async () => {
        if (a._used || g.count >= N || g.flying) return;
        a._used = true; g.flying = true; g.count++;
        const c = g.count; SFX.pop();
        const s = slots[c - 1], pr = g.plate;
        const tx = pr._x - pr._w / 2 + s._x, ty = pr._y - pr._h / 2 + s._y;
        a.classList.remove('apple'); a.style.zIndex = 30;
        moveTo(a, tx, ty, 450, { easing: 'cubic-bezier(.4,0,.3,1)' }).then(() => { g.flying = false; s.classList.add('full'); });
        if (c < N) { Voice.say('chislo_' + c); return; }
        Idle.off();
        await Voice.say('chislo_' + c);
        if (!g.alive()) return;
        anim(g.ezh, 'munch'); SFX.munch();
        g.apples.filter(x => x._used).forEach(x => x.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }], { duration: 600, fill: 'forwards' }));
        g.solved(g.ezh._x, g.ezh._y - 100, 'nyam');
      });
    });
    g.count = 0; g.flying = false;
    g.repeat = () => Voice.say('hochet_' + N);
    Voice.say('hochet_' + N);
    Idle.set(() => { Voice.say(g.count ? 'hochet_' + N : ['hochet_' + N, 'sorvi']); const a = g.apples.find(x => !x._used); a && anim(a, 'hint'); });
  },
};

// ===== 4. Большой и маленький =====
ROOMS.mishki = {
  bg: 'linear-gradient(#3b4a8c, #5a6bb0 62%, #c79a6b 62%, #b5875a)',
  intro: 'mishki_intro',
  voice: ['mishki_intro', 'mishka_bolshoy', 'mishka_malenky', 'mishka_sredniy', 'tesno', 'veliko', 'spokoynoy'],
  setup(g) {
    // звёзды и луна в окне
    const moon = place(mk('<svg viewBox="0 0 100 100"><path d="M60 10 A40 40 0 1 0 90 70 A32 32 0 1 1 60 10Z" fill="#fff3b0"/></svg>', 'twinkle'), W - 260, 260, 140, 140);
    for (let i = 0; i < 7; i++) { const s = place(mk(ART.zvezdochka('#fff8c4', '#fff8c4'), 'twinkle'), 200 + rnd(W - 400), 180 + rnd(H * 0.35), 26, 26); s.style.animationDelay = (-Math.random() * 3) + 's'; }
    moon.style.animationDuration = '6s';
    g.sizes = g.lvl < 2 ? ['bolshoy', 'malenky'] : ['bolshoy', 'sredniy', 'malenky'];
    g.prev = []; g.beds = [];
  },
  round(g) {
    g.beds.forEach(b => { b.remove(); b._od.remove(); b._bear && b._bear.remove(); }); g.beds = [];
    if (g.bear) g.bear.remove();
    const SCALE = { bolshoy: 1, sredniy: 0.76, malenky: 0.54 };
    const order = shuffle(g.sizes), n = order.length;
    const bedW = landscape ? (n === 2 ? 520 : 440) : (n === 2 ? 440 : 330);
    order.forEach((sz, i) => {
      const w = bedW * SCALE[sz], h = w * 0.7;
      let x, y;
      if (landscape) { x = 800 + (i - (n - 1) / 2) * (n === 2 ? 600 : 480); y = 860 - h / 2; }
      else { x = 500 + (i - (n - 1) / 2) * (n === 2 ? 470 : 320); y = 1450 - h / 2; }
      const b = place(mk(ART.krovatka(), 'bed'), x, y, w, h); b._s = sz;
      b._od = place(mk(ART.odeyalo(), 'blanket'), x, y, w, h);
      onTap(b, () => tryBed(b)); onTap(b._od, () => tryBed(b));
      g.beds.push(b);
    });
    // какой мишка: не три одинаковых подряд
    let sz; do sz = pick(g.sizes); while (g.prev.length >= 2 && g.prev.slice(-2).every(p => p === sz));
    g.prev.push(sz);
    const bw = (landscape ? 330 : 300) * SCALE[sz];
    const bx = landscape ? 800 : 500, by = landscape ? 400 : 700;
    const bear = g.bear = place(mk(ART.mishka(), 'bear'), bx, by, bw, bw * 1.175);
    anim(bear, 'popin');
    let busy = false;
    const tryBed = async b => {
      if (busy) return false;
      if (b._s === sz) {
        busy = true; bear._locked = true;
        const tw = b._w * 0.5;
        bear.style.zIndex = 4;
        await moveTo(bear, b._x - b._w * 0.18, b._y - b._h * 0.1, 450, { to: { width: tw + 'px', height: tw * 1.175 + 'px' } });
        bear.style.width = tw + 'px'; bear.style.height = tw * 1.175 + 'px';
        b._od.classList.add('on'); b._bear = bear; g.bear = null;
        const z = place(mk('<b>z</b><b>z</b><b>z</b>', 'zzz'), b._x - b._w * 0.1, b._y - b._h * 0.7, 120, 120);
        b._bear2 = z; setTimeout(() => z.remove(), 3000);
        g.solved(b._x, b._y - b._h * 0.4, g.round % 2 ? 'spokoynoy' : null);
        return true;
      }
      g.miss(); anim(b, 'shake');
      if (g.wrong >= 2) g.beds.forEach(x => x._s === sz && x.classList.add('glow'));
      const big = SCALE[sz] > SCALE[b._s];
      Voice.say([big ? 'tesno' : 'veliko', 'mishka_' + sz]);
      return false;
    };
    draggable(bear, {
      onDrop: (x, y) => { const b = nearest(g.beds, x, y + 60, 330); if (!b) return false; tryBed(b); return b._s === sz; },
      onTap: () => Voice.say('mishka_' + sz),
    });
    g.repeat = () => Voice.say('mishka_' + sz);
    Voice.say('mishka_' + sz);
    Idle.set(() => { Voice.say('mishka_' + sz); anim(bear, 'hint'); });
  },
};

// ===== 5. Кто как говорит =====
ROOMS.zveri = {
  bg: 'linear-gradient(#bfe8ff, #e6f6ff 45%, #9bd67a 45%, #7cc35c)',
  intro: 'zveri_intro',
  voice: ['zveri_intro', ...['korova', 'sobaka', 'koshka', 'utka', 'svinka', 'ovechka'].flatMap(z => ['kto_' + z, 'eto_' + z, 'zvuk_' + z])],
  setup(g) {
    const n = [3, 4, 6][g.lvl];
    g.set = shuffle(['korova', 'sobaka', 'koshka', 'utka', 'svinka', 'ovechka']).slice(0, n);
    // забор
    mk('', landscape ? 'fence' : 'fence p');
    g.cards = g.set.map((z, i) => {
      let x, y, w;
      if (landscape) { const per = n > 4 ? 3 : n, r = Math.floor(i / per), k = i % per, cnt = r ? n - per : Math.min(per, n); w = n > 4 ? 300 : 340; x = 800 + (k - (cnt - 1) / 2) * (w + 80); y = n > 4 ? 380 + r * 360 : 560; }
      else { const per = 2, r = Math.floor(i / per), k = i % per, cnt = Math.min(per, n - r * per); w = n > 4 ? 330 : 380; const rows = Math.ceil(n / 2); x = 500 + (k - (cnt - 1) / 2) * (w + 70); y = 820 + (r - (rows - 1) / 2) * (w + 60); }
      const c = place(mk(ART.zver(z), 'card'), x, y, w, w); c._z = z;
      c.animate([{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 400, delay: i * 100, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'backwards' });
      onTap(c, () => g.tap && g.tap(c));
      return c;
    });
    g.prev = null;
  },
  round(g) {
    g.cards.forEach(c => c.classList.remove('glow'));
    let t; do t = pick(g.set); while (t === g.prev); g.prev = t;
    let busy = false;
    g.tap = async c => {
      if (busy) return;
      anim(c, 'jump');
      if (c._z === t) {
        busy = true;
        g.solved(c._x, c._y, 'zvuk_' + t);
      } else {
        g.miss();
        if (g.wrong >= 2) g.cards.forEach(x => x._z === t && x.classList.add('glow'));
        Voice.say(['eto_' + c._z, 'zvuk_' + c._z, 'kto_' + t]);
      }
    };
    g.repeat = () => Voice.say('kto_' + t);
    Voice.say('kto_' + t);
    Idle.set(() => Voice.say('kto_' + t));
  },
};

// ---------- экраны ----------
const HOME_ROOMS = [
  ['kraski', () => `<div class="ic3">${['krasny', 'zhelty', 'siniy'].map(c => ART.shar(COLORS[c])).join('')}</div>`, '#ffe0e6'],
  ['figury', () => `<div class="ic3 f">${['krug', 'kvadrat', 'treugolnik'].map(s => ART.figura(s)).join('')}</div>`, '#fff1cc'],
  ['schet', () => `<div class="ic1">${ART.ezhik()}</div>`, '#dff5d6'],
  ['mishki', () => `<div class="ic1 m">${ART.mishka()}</div>`, '#dfe4ff'],
  ['zveri', () => `<div class="ic1">${ART.zver('korova')}</div>`, '#e2f6ff'],
];

function goHome() {
  const my = ++session; Idle.off(); Voice.stop();
  current = { name: 'home', rebuild: () => goHome() };
  newStage('linear-gradient(#9fdcff, #d8f1ff 70%, #9bd67a 70%)');
  // солнце и облака
  place(mk('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#ffd54f"/><g stroke="#ffd54f" stroke-width="6" stroke-linecap="round">' + [...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return `<line x1="${50 + 38 * Math.cos(a)}" y1="${50 + 38 * Math.sin(a)}" x2="${50 + 47 * Math.cos(a)}" y2="${50 + 47 * Math.sin(a)}"/>`; }).join('') + '</g></svg>', 'spin'), landscape ? 130 : 120, landscape ? 120 : 110, 180, 180);
  const hx = landscape ? 920 : 500, hw = landscape ? 1180 : 900;
  const roofY = landscape ? 50 : 150, roofH = landscape ? 210 : 230;
  const wallTop = roofY + roofH - 30, wallBot = landscape ? 975 : 1570;
  place(mk(`<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M2 40 L50 2 L98 40Z" fill="#ef6c57" stroke="#8a3b2c" stroke-width="1.2" stroke-linejoin="round"/><circle cx="50" cy="24" r="6" fill="#fff3d6" stroke="#8a3b2c" stroke-width="1"/></svg>`, 'roof'), hx, roofY + roofH / 2, hw + 80, roofH);
  place(mk('', 'wall'), hx, (wallTop + wallBot) / 2, hw, wallBot - wallTop);
  HOME_ROOMS.forEach(([key, icon, col], i) => {
    let x, y; const ww = landscape ? 320 : 360, wh = landscape ? 300 : 320;
    if (landscape) { const r = i < 3 ? 0 : 1, k = r ? i - 3 : i, cnt = r ? 2 : 3; x = hx + (k - (cnt - 1) / 2) * 370; y = r ? 790 : 450; }
    else { const r = Math.floor(i / 2), k = i % 2, cnt = Math.min(2, 5 - r * 2); x = cnt === 1 ? 290 : 500 + (k - 0.5) * 420; y = wallTop + 230 + r * 390; }
    const st = Math.min(5, S.stars[key] || 0);
    const w = place(mk(`<div class="pane" style="background:${col}">${icon()}</div><div class="wstars">${[...Array(5)].map((_, j) => j < st ? ART.zvezdochka() : ART.zvezdochka('rgba(255,255,255,.6)', 'rgba(0,0,0,.15)')).join('')}</div>`, 'window btn'), x, y, ww, wh);
    w.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 400, delay: i * 80, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' });
    onTap(w, () => { SFX.tap(); runRoom(key); });
  });
  const z = landscape ? place(mk(ART.zaika(), 'bob'), 175, 760, 260, 377) : place(mk(ART.zaika(), 'bob front'), 720, wallTop + 230 + 2 * 390, 250, 362);
  onTap(z, () => { anim(z, 'jump'); Voice.say('privet'); });
  setTimeout(() => { if (my === session) Voice.say('vyberi'); }, 500);
}

function startScreen() {
  current = { name: 'start', rebuild: () => startScreen() };
  newStage('radial-gradient(circle at 50% 40%, #fff6d8, #ffd7a8)');
  const z = place(mk(ART.zaika(), 'bob'), W / 2, landscape ? 400 : 620, landscape ? 320 : 400, landscape ? 464 : 580);
  const b = place(mk(ART.play(), 'btn round green big pulse'), W / 2, landscape ? 820 : 1260, 240, 240);
  place(mk('v' + VERSION, 'ver'), W - 60, H - 30);
  const go = () => {
    ac(); SFX.tap();
    try { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); } catch (e) {}
    if (b._go) return; b._go = true;
    const my = session;
    Voice.say('privet').then(() => { if (my === session && current.name === 'start') goHome(); });
  };
  onTap(b, go); onTap(z, go);
}

addEventListener('resize', () => { if (fit() && current) current.rebuild(); });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden) Voice.stop(); });

startScreen();
window.__Z = { S, Voice, runRoom, goHome, ROOMS, get stage() { return stage; } };
