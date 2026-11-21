'use strict';
// «Домик изнутри» (версия 4.3): прогулка по дому от первого лица, управление как в «SCP: Побег».
// Слева джойстик — ходить. Пальцем по экрану — смотреть. Справа большая лапка — взять, открыть, включить.
// Прежнее управление (нажал на пол — пошёл) осталось: адрес с ?ctl=tap или S.ctl = 'tap'.
(() => {
  const EYE = 2.8, WH = 7.6, HS = 8, TH = 0.6, DW = 4.6, DH = 5.7, PAD = 1.2, SPEED = 8.5;
  const STEP = 2 * HS + TH;
  const SH = 8, SL = 14, XS0 = HS + TH, XS1 = XS0 + SL; // второй этаж: высота, длина лестницы, её начало и конец
  const RM = {
    hall: { cx: 0, cz: 0 },
    kuh: { cx: -STEP, cz: 0, ax: 'x', s: -1 },
    spal: { cx: XS1 + TH + HS, cz: 0, y: SH },
    igr: { cx: 0, cz: -STEP, ax: 'z', s: -1 },
  };
  const RKEYS = ['hall', 'kuh', 'spal', 'igr'];
  // точка у двери: inner = 1 — внутри комнаты, 0 — со стороны гостиной
  const doorPt = (r, inner) => {
    if (r === 'spal') return { x: inner ? XS1 + TH + 1.5 : HS - 1.5, z: 0 };
    const R = RM[r], v = R.s * (inner ? HS + TH + 1.5 : HS - 1.5); return R.ax === 'x' ? { x: v, z: 0 } : { x: 0, z: v };
  };

  // ---------- кнопки поверх экрана ----------
  const css = document.createElement('style');
  css.textContent = `
#fp { position: fixed; inset: 0; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity .3s, visibility .3s; touch-action: none; }
#fp.on { opacity: 1; visibility: visible; }
#fp .btn { pointer-events: auto; touch-action: none; }
#fpHome { left: calc(2.5vmin + env(safe-area-inset-left)); top: calc(2.5vmin + env(safe-area-inset-top)); }
#fpRep { right: calc(2.5vmin + env(safe-area-inset-right)); top: calc(2.5vmin + env(safe-area-inset-top)); }
#fpL, #fpR { bottom: calc(3vmin + env(safe-area-inset-bottom)); width: 17vmin; height: 17vmin; max-width: 130px; max-height: 130px; background: rgba(255,255,255,.82); display: none; }
#fp.tap #fpL, #fp.tap #fpR { display: flex; }
#fpL { left: calc(3vmin + env(safe-area-inset-left)); } #fpR { right: calc(3vmin + env(safe-area-inset-right)); }
#fpJoy { position: absolute; pointer-events: auto; touch-action: none; left: calc(4vmin + env(safe-area-inset-left)); bottom: calc(4vmin + env(safe-area-inset-bottom)); width: 34vmin; height: 34vmin; max-width: 190px; max-height: 190px; border-radius: 50%; background: rgba(255,255,255,.38); border: .8vmin solid rgba(255,255,255,.8); box-sizing: border-box; box-shadow: 0 .6vmin 2vmin rgba(93,58,36,.18); }
#fpKnob { position: absolute; left: 50%; top: 50%; width: 46%; height: 46%; margin: -23% 0 0 -23%; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff, #ffd9e6 60%, #ff9dbd); box-shadow: 0 .5vmin 1.4vmin rgba(93,58,36,.35); }
#fp.tap #fpJoy { display: none; }
#fpUse { right: calc(4vmin + env(safe-area-inset-right)); bottom: calc(5vmin + env(safe-area-inset-bottom)); width: 27vmin; height: 27vmin; max-width: 150px; max-height: 150px; background: rgba(255,255,255,.6); opacity: .6; transition: opacity .2s, transform .2s, background .2s; }
#fpUse svg { width: 70%; height: 70%; }
#fpUse .bk { display: none; } #fpUse.back .pw { display: none; } #fpUse.back .bk { display: block; }
#fpUse.lit, #fpUse.back { opacity: 1; background: #fff3b0; transform: scale(1.08); box-shadow: 0 0 0 1vmin rgba(255,210,31,.75), 0 1vmin 2.4vmin rgba(93,58,36,.3); }
#fp.tap #fpUse:not(.back) { display: none; }
#fpDrop { right: calc(34vmin + env(safe-area-inset-right)); bottom: calc(4vmin + env(safe-area-inset-bottom)); width: 19vmin; height: 19vmin; max-width: 108px; max-height: 108px; background: rgba(255,255,255,.85); display: none; }
#fpDrop.show { display: flex; }
#fpDrop svg { width: 70%; height: 70%; }
@media (min-width: 700px) and (min-height: 500px) { #fpDrop { right: calc(190px + env(safe-area-inset-right)); } }
#fpStars { position: absolute; left: 50%; top: calc(3.5vmin + env(safe-area-inset-top)); transform: translateX(-50%); display: flex; gap: 1.2vmin; background: rgba(255,255,255,.4); padding: 1.2vmin 2.4vmin; border-radius: 6vmin; }
#fpStars i { width: 8.5vmin; height: 8.5vmin; max-width: 64px; max-height: 64px; display: block; transition: transform .4s cubic-bezier(.3,1.8,.5,1); }
#fpStars i.on { transform: scale(1.12) rotate(-8deg); filter: drop-shadow(0 0 1.2vmin #fff59d); }
#fpStars svg { width: 100%; height: 100%; display: block; }
#fpRot { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: rgba(255,243,220,.96); touch-action: none; }
#fpRot.on { display: flex; }
#fpRot svg { width: 62vmin; height: 62vmin; }
#fpRot .ph { transform-origin: 50px 50px; animation: fpTurn 2.4s ease-in-out infinite; }
@keyframes fpTurn { 0%, 18% { transform: rotate(0deg); } 55%, 100% { transform: rotate(-90deg); } }`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'fp';
  const arrow = d => `<svg viewBox="0 0 100 100"><path d="M${d < 0 ? 62 : 38} 22 L${d < 0 ? 30 : 70} 50 L${d < 0 ? 62 : 38} 78" fill="none" stroke="#5d3a24" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const PAW = `<svg class="pw" viewBox="0 0 100 100"><ellipse cx="50" cy="64" rx="24" ry="19" fill="#ff8fb1"/><ellipse cx="22" cy="42" rx="9" ry="12" fill="#ff8fb1"/><ellipse cx="41" cy="27" rx="9" ry="12" fill="#ff8fb1"/><ellipse cx="60" cy="27" rx="9" ry="12" fill="#ff8fb1"/><ellipse cx="79" cy="42" rx="9" ry="12" fill="#ff8fb1"/></svg><svg class="bk" viewBox="0 0 100 100"><path d="M40 28 L18 50 L40 72 M20 50 H62 a18 18 0 0 1 0 36 H50" fill="none" stroke="#5d3a24" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const DROP = `<svg viewBox="0 0 100 100"><path d="M50 14 V58 M30 40 L50 60 L70 40" fill="none" stroke="#5d3a24" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 80 H82" stroke="#ffb300" stroke-width="11" stroke-linecap="round"/></svg>`;
  hud.innerHTML = `<div class="btn" id="fpHome">${$('bHome').innerHTML}</div><div id="fpStars"></div><div class="btn" id="fpRep">${$('bRep').innerHTML}</div><div class="btn" id="fpL">${arrow(-1)}</div><div class="btn" id="fpR">${arrow(1)}</div><div id="fpJoy"><div id="fpKnob"></div></div><div class="btn" id="fpDrop">${DROP}</div><div class="btn" id="fpUse">${PAW}</div>`;
  document.body.insertBefore(hud, $('wipe'));
  // просьба повернуть телефон: нажатие ещё и разворачивает экран само, где это разрешено
  const rot = document.createElement('div'); rot.id = 'fpRot';
  rot.innerHTML = `<svg viewBox="0 0 100 100"><g class="ph"><rect x="32" y="14" width="36" height="72" rx="7" fill="#fff" stroke="#5d3a24" stroke-width="4"/><rect x="37" y="22" width="26" height="50" rx="2" fill="#8fd3ff"/><circle cx="50" cy="79" r="3" fill="#5d3a24"/><circle cx="50" cy="47" r="9" fill="#fff"/><ellipse cx="46" cy="35" rx="3" ry="8" fill="#fff"/><ellipse cx="54" cy="35" rx="3" ry="8" fill="#fff"/></g><path d="M80 30 A36 36 0 0 0 58 10 M58 10 l8 -3 M58 10 l3 8" fill="none" stroke="#ff8fb1" stroke-width="4" stroke-linecap="round"/></svg>`;
  document.body.insertBefore(rot, $('wipe'));
  let rotSkip = false, lockedByUs = false;
  function checkRot() { rot.classList.toggle('on', hud.classList.contains('on') && MOBILE && innerHeight > innerWidth * 1.05 && !rotSkip); }
  function goLandscape() {
    try { const d = document.documentElement; if (!document.fullscreenElement && !document.webkitFullscreenElement) { const r = (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); if (r && r.catch) r.catch(() => {}); } } catch (e) {}
    try { if (screen.orientation && screen.orientation.lock) { const r = screen.orientation.lock('landscape'); lockedByUs = true; if (r && r.catch) r.catch(() => {}); } } catch (e) {}
  }
  rot.addEventListener('pointerup', e => { e.preventDefault(); e.stopPropagation(); goLandscape(); setTimeout(() => { if (innerHeight > innerWidth * 1.05) { rotSkip = true; } checkRot(); }, 900); });
  rot.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
  const hudStars = n => { $('fpStars').innerHTML = RKEYS.map((_, i) => `<i class="${i < n ? 'on' : ''}">${STAR_SVG(i < n)}</i>`).join(''); };
  ON_CLEAR.push(() => { hud.classList.remove('on'); rot.classList.remove('on'); rotSkip = false; $('fpUse').classList.remove('lit', 'back'); if (lockedByUs) { lockedByUs = false; try { screen.orientation.unlock(); } catch (e) {} } });
  let FP = null; // состояние текущей прогулки
  tapBtn($('fpHome'), () => { SFX.tap(); go(goHome); });
  tapBtn($('fpRep'), () => { if (FP) FP.repeat(); });
  tapBtn($('fpUse'), () => { Idle.poke(); if (FP) FP.use(); });
  tapBtn($('fpDrop'), () => { Idle.poke(); if (FP) FP.drop(); });
  for (const [id, dir] of [['fpL', 1], ['fpR', -1]]) {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Idle.poke(); if (FP) { FP.turn = dir; FP.turnLeft = 0.55; FP.turnDir = dir; FP.look = null; } try { el.setPointerCapture(e.pointerId); } catch (er) {} });
    const up = () => { if (FP) FP.turn = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  { // джойстик, как в «SCP: Побег»: круг стоит слева внизу, ручка идёт за пальцем
    const joy = $('fpJoy'), knob = $('fpKnob'); let id = null;
    const set = e => { const r = joy.getBoundingClientRect(), m = r.width * 0.33; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy); if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; if (FP) { FP.jx = dx / m; FP.jy = dy / m; } };
    const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; if (FP) { FP.jx = 0; FP.jy = 0; } };
    joy.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (id !== null) return; id = e.pointerId; Idle.poke(); try { joy.setPointerCapture(id); } catch (er) {} set(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === id) { e.preventDefault(); set(e); } });
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
    ON_CLEAR.push(() => { id = null; knob.style.transform = ''; });
  }

  // ---------- текстуры ----------
  function wallTex(o) {
    const t = cnv(256, 512, (x, w, h) => {
      x.fillStyle = o.wall; x.fillRect(0, 0, w, h);
      x.fillStyle = o.pat;
      if (o.kind === 'stripes') { for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 20, 0, 24, h); }
      else if (o.kind === 'stars') { for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { const px = i * 64 + (j % 2 ? 48 : 16), py = j * 60 + 24, r = 9; x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; x.lineTo(px + Math.sin(a) * q, py - Math.cos(a) * q); } x.fill(); } }
      else { for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { x.beginPath(); x.arc(i * 64 + (j % 2 ? 48 : 16), j * 60 + 24, 8, 0, 7); x.fill(); } }
      const py = h * 0.72; // нижняя панель
      x.fillStyle = o.panel; x.fillRect(0, py, w, h - py);
      x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(0, py - 10, w, 14);
      x.strokeStyle = 'rgba(0,0,0,.07)'; x.lineWidth = 3; for (let i = 0; i < 4; i++) x.strokeRect(i * 64 + 8, py + 18, 48, h - py - 46);
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function floorTex(o) {
    const t = cnv(256, 256, (x, w, h) => {
      if (o.kind === 'tiles') { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? o.a : o.b; x.fillRect(i * 64, j * 64, 64, 64); } x.strokeStyle = 'rgba(0,0,0,.08)'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, h); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); } }
      else if (o.kind === 'carpet') { x.fillStyle = o.a; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.04)'; x.fillRect(rnd(w), rnd(h), 3, 3); } }
      else { x.fillStyle = `hsl(${o.hue},50%,${o.l}%)`; x.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) { x.fillStyle = `hsl(${o.hue},50%,${o.l - 5 + rnd(10)}%)`; const x0 = k * 128 + (r % 2 ? 64 : 0); x.fillRect(x0, r * 64, 128, 64); x.strokeStyle = 'rgba(0,0,0,.13)'; x.lineWidth = 2; x.strokeRect(x0, r * 64, 128, 64); } }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.rep || 4, o.rep || 4); t.anisotropy = 4; return t;
  }
  // вид из окна: небо, солнце, холмы, дерево
  let _gardenC = null;
  function gardenTex() {
    return cnv(256, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6ec6ff'); g.addColorStop(0.7, '#d9f3ff'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffe066'; x.beginPath(); x.arc(196, 56, 26, 0, 7); x.fill();
      x.fillStyle = '#fff'; for (const [cx, cy] of [[60, 60], [84, 52], [104, 64], [76, 70]]) { x.beginPath(); x.arc(cx, cy, 18, 0, 7); x.fill(); }
      x.fillStyle = '#7ed068'; x.beginPath(); x.ellipse(70, 250, 150, 80, 0, 0, 7); x.fill();
      x.fillStyle = '#6cc257'; x.beginPath(); x.ellipse(220, 262, 120, 78, 0, 0, 7); x.fill();
      x.fillStyle = '#9a6a43'; x.fillRect(150, 150, 12, 50); x.fillStyle = '#4fae4d'; x.beginPath(); x.arc(156, 132, 34, 0, 7); x.fill();
      for (const [fx, fy, c] of [[40, 214, '#ff6b8a'], [96, 228, '#ffd54f'], [206, 222, '#ffffff'], [236, 236, '#ba68c8']]) { x.fillStyle = c; x.beginPath(); x.arc(fx, fy, 6, 0, 7); x.fill(); }
    });
  }
  const picTex = kind => cnv(128, 128, (x, w, h) => {
    x.fillStyle = '#fffdf5'; x.fillRect(0, 0, w, h); x.lineWidth = 9; x.lineCap = 'round';
    if (kind === 0) { x.fillStyle = '#ffd21f'; x.beginPath(); x.arc(64, 64, 26, 0, 7); x.fill(); x.strokeStyle = '#ffb300'; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36); x.lineTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); x.stroke(); } }
    else if (kind === 1) { x.strokeStyle = '#35b24a'; x.beginPath(); x.moveTo(64, 116); x.lineTo(64, 60); x.stroke(); x.fillStyle = '#ff6fae'; for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; x.beginPath(); x.arc(64 + Math.cos(a) * 20, 46 + Math.sin(a) * 20, 14, 0, 7); x.fill(); } x.fillStyle = '#ffd21f'; x.beginPath(); x.arc(64, 46, 11, 0, 7); x.fill(); }
    else { x.fillStyle = '#f0352b'; x.beginPath(); x.moveTo(64, 108); x.bezierCurveTo(4, 62, 30, 14, 64, 44); x.bezierCurveTo(98, 14, 124, 62, 64, 108); x.fill(); }
  });

  // ---------- мебель ----------
  const WOOD = '#c98a55', CREAM = '#fff6e2';
  function mkCounter(w) {
    const g = grp();
    g.add(rbox(M(CREAM, 0.8), w, 1.8, 1.5, 0.08, 0, 0.95, 0));
    g.add(rbox(M(WOOD, 0.55), w + 0.2, 0.2, 1.75, 0.06, 0, 1.95, 0.05));
    const n = Math.round(w / 1.75);
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * (w / n); g.add(rbox(M('#ffe9c4', 0.8), w / n - 0.25, 1.3, 0.08, 0.05, x, 0.95, 0.77)); g.add(ball(M('#ff8a65', 0.4), 0.09, x, 1.4, 0.84, true)); }
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    return g;
  }
  function mkStove() {
    const g = grp();
    g.add(rbox(M('#ffffff', 0.5), 2.7, 1.95, 1.6, 0.1, 0, 0.98, 0));
    g.add(rbox(M('#40454a', 0.3), 1.9, 0.95, 0.08, 0.1, 0, 0.85, 0.8)); g.add(rbox(M('#cfd8dc', 0.3), 2.1, 0.1, 0.12, 0.04, 0, 1.5, 0.86));
    for (const [x, z] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.4], [0.65, 0.4]]) { const b = cyl(M('#40454a', 0.5), 0.42, 0.42, 0.05, x, 1.97, z, 20); b.castShadow = false; g.add(b); }
    const pot = grp(0.65, 2.0, -0.3); pot.add(cyl(M('#f0352b', 0.35), 0.48, 0.44, 0.6, 0, 0.3, 0, 22)); pot.add(cyl(M('#ffffff', 0.35), 0.5, 0.5, 0.07, 0, 0.63, 0, 22)); pot.add(ball(M('#40454a', 0.4), 0.09, 0, 0.72, 0)); g.add(pot);
    g.userData.pot = pot;
    return g;
  }
  function mkSofa(col) {
    const g = grp(), m = M(col, 0.95), d = M('#f7c0cf', 0.95);
    g.add(rbox(m, 4.6, 0.95, 2.0, 0.3, 0, 0.75, 0)); g.add(rbox(m, 4.6, 1.9, 0.6, 0.28, 0, 1.6, -0.78));
    for (const s of [-1, 1]) { g.add(rbox(m, 0.6, 1.5, 2.0, 0.28, s * 2.3, 1.0, 0)); g.add(rbox(d, 1.1, 1.0, 0.4, 0.22, s * 1.0, 1.7, -0.35)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(M(WOOD, 0.6), 0.1, 0.08, 0.3, sx * 2.0, 0.15, sz * 0.75, 8));
    return g;
  }
  function mkShelf(toys) {
    const g = grp(), wd = M(WOOD, 0.6);
    g.add(rbox(wd, 3.6, 4.6, 0.2, 0.06, 0, 2.3, -0.5));
    for (const s of [-1, 1]) g.add(rbox(wd, 0.2, 4.6, 1.2, 0.06, s * 1.8, 2.3, 0));
    for (let i = 0; i < 4; i++) g.add(rbox(wd, 3.6, 0.18, 1.2, 0.05, 0, 0.12 + i * 1.46, 0));
    if (toys) {
      [['myach_s', -1.0, 0], ['mishka', 0.7, 0], ['zvezda', -0.9, 1], ['utka', 0.6, 1], ['koltso', -0.9, 2], ['serdce', 0.6, 2]].forEach(([k, x, r]) => { const t = mkToy(k); t.scale.setScalar(0.75); t.position.set(x, 0.75 + r * 1.46, 0.05); g.add(t); });
    } else {
      const cols = ['#f0352b', '#2a6df4', '#ffd21f', '#35b24a', '#ff6fae', '#b25de0', '#ff8a1c'];
      for (let r = 0; r < 3; r++) { let x = -1.5; for (let i = 0; i < 7; i++) { const w = rr(0.22, 0.4), h = rr(0.85, 1.15); if (x + w > 1.5) break; if (!(r === 1 && i > 3)) g.add(rbox(M(cols[(i + r * 2) % 7], 0.7), w, h, 0.8, 0.04, x + w / 2, 0.21 + r * 1.46 + h / 2, 0)); x += w + 0.04; } }
    }
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    return g;
  }
  function mkWardrobe() {
    const g = grp();
    g.add(rbox(M('#bfe3f7', 0.7), 3.8, 5.6, 1.6, 0.16, 0, 2.8, 0));
    for (const s of [-1, 1]) { g.add(rbox(M('#e3f4ff', 0.7), 1.7, 4.9, 0.08, 0.1, s * 0.9, 2.9, 0.8)); g.add(ball(M('#ffd54f', 0.3), 0.12, s * 0.2, 2.9, 0.9)); }
    return g;
  }
  function mkPlant() {
    const g = grp();
    g.add(cyl(M('#e07a4d', 0.7), 0.6, 0.42, 0.9, 0, 0.45, 0, 18));
    [[0, 1.6, 0, 0.75], [-0.5, 1.2, 0.1, 0.5], [0.5, 1.25, -0.1, 0.52], [0.1, 2.25, 0.05, 0.5]].forEach(([x, y, z, r], i) => g.add(ball(M(i % 2 ? '#4fae4d' : '#66c45c', 0.95), r, x, y, z)));
    return g;
  }
  function mkLamp(col) {
    const g = grp();
    const c = cyl(M('#ffffff', 0.6), 0.03, 0.03, 0.9, 0, -0.45, 0, 6); c.castShadow = false; g.add(c);
    const sh = mesh(new T.CylinderGeometry(0.35, 1.0, 0.8, 24, 1, true), M(col, 0.6, { side: T.DoubleSide }), 0, -1.2, 0); sh.castShadow = false; g.add(sh);
    const b = ball(new T.MeshBasicMaterial({ color: C('#fff6c4') }), 0.3, 0, -1.4, 0); b.castShadow = false; g.add(b);
    return g;
  }
  function mkWindow(curt) {
    const g = grp();
    _gardenC = _gardenC || gardenTex();
    const gl = new T.Mesh(new T.PlaneGeometry(3.4, 3.0), new T.MeshBasicMaterial({ map: _gardenC })); gl.position.z = 0.04; g.add(gl);
    const wm = M('#ffffff', 0.6);
    const add = (w, h, x, y) => { const m = rbox(wm, w, h, 0.22, 0.05, x, y, 0.1); m.castShadow = false; g.add(m); };
    add(3.9, 0.26, 0, 1.6); add(3.9, 0.26, 0, -1.6); add(0.26, 3.4, -1.82, 0); add(0.26, 3.4, 1.82, 0); add(0.14, 3.0, 0, 0); add(3.4, 0.14, 0, 0);
    const sill = rbox(wm, 4.3, 0.18, 0.6, 0.06, 0, -1.78, 0.3); sill.castShadow = false; g.add(sill);
    const rod = cyl(M(WOOD, 0.5), 0.07, 0.07, 5.2, 0, 2.1, 0.3, 8); rod.rotation.z = Math.PI / 2; rod.castShadow = false; g.add(rod);
    for (const s of [-1, 1]) { const c = rbox(M(curt, 0.95), 0.95, 4.1, 0.2, 0.09, s * 2.25, 0.05, 0.3); c.castShadow = false; g.add(c); const tie = rbox(M('#ffffff', 0.9), 1.0, 0.16, 0.24, 0.05, s * 2.25, -0.7, 0.3); tie.castShadow = false; g.add(tie); }
    return g;
  }
  function mkPicture(kind, frame) {
    const g = grp();
    const f = rbox(M(frame, 0.6), 1.9, 1.9, 0.14, 0.06); f.castShadow = false; g.add(f);
    const p = new T.Mesh(new T.PlaneGeometry(1.55, 1.55), new T.MeshBasicMaterial({ map: picTex(kind) })); p.position.z = 0.08; g.add(p);
    return g;
  }
  function mkRug(r, a, b) {
    const g = grp();
    const m1 = cyl(M(a, 1), r, r, 0.05, 0, 0.03, 0, 40), m2 = cyl(M(b, 1), r * 0.72, r * 0.72, 0.05, 0, 0.045, 0, 40), m3 = cyl(M(a, 1), r * 0.4, r * 0.4, 0.05, 0, 0.06, 0, 32);
    [m1, m2, m3].forEach(m => { m.castShadow = false; m.receiveShadow = true; g.add(m); });
    return g;
  }
  function mkCushion(col) { const g = grp(); const m = ball(M(col, 0.95), [1.25, 0.22, 1.25], 0, 0.16, 0); m.receiveShadow = true; g.add(m); return g; }
  function mkExitDoor() {
    const g = grp();
    g.add(rbox(M('#ffffff', 0.6), 3.3, 5.5, 0.3, 0.1, 0, 2.75, 0));
    g.add(rbox(M('#c0563f', 0.6), 2.7, 5.1, 0.3, 0.3, 0, 2.6, 0.08));
    g.add(ball(M('#ffd54f', 0.3), 0.16, 0.95, 2.5, 0.3));
    const wn = cyl(M('#7fd0ff', 0.2), 0.6, 0.6, 0.1, 0, 3.9, 0.22, 24); wn.rotation.x = Math.PI / 2; wn.castShadow = false; g.add(wn);
    const mat = rbox(M('#8bc34a', 1), 3.0, 0.08, 1.6, 0.04, 0, 0.04, 1.3); mat.castShadow = false; mat.receiveShadow = true; g.add(mat);
    return g;
  }

  function mkFridge() {
    const g = grp(), w = M('#d6f3ee', 0.4), wh = M('#ffffff', 0.4);
    // корпус-коробка без передней стенки, чтобы дверца открывалась по-настоящему
    g.add(rbox(w, 2.5, 5.0, 0.16, 0.06, 0, 2.5, -0.87)); g.add(rbox(w, 0.16, 5.0, 1.9, 0.06, -1.17, 2.5, 0)); g.add(rbox(w, 0.16, 5.0, 1.9, 0.06, 1.17, 2.5, 0));
    g.add(rbox(w, 2.5, 0.16, 1.9, 0.06, 0, 4.92, 0)); g.add(rbox(w, 2.5, 0.16, 1.9, 0.06, 0, 0.08, 0)); g.add(rbox(w, 2.3, 0.14, 1.8, 0.05, 0, 3.3, 0));
    const inner = new T.Mesh(new T.PlaneGeometry(2.2, 4.7), new T.MeshBasicMaterial({ color: C('#f4fffd') })); inner.position.set(0, 2.5, -0.78); g.add(inner);
    g.add(rbox(wh, 2.2, 0.08, 1.5, 0.03, 0, 1.75, -0.05));
    // продукты внутри
    const mb = grp(-0.55, 1.8, 0.1); mb.add(cyl(wh, 0.26, 0.3, 0.8, 0, 0.4, 0, 14)); mb.add(cyl(M('#4fa3f7', 0.4), 0.14, 0.26, 0.22, 0, 0.9, 0, 12)); g.add(mb);
    g.add(rbox(M('#ffd21f', 0.6), 0.7, 0.4, 0.5, 0.08, 0.45, 2.0, 0.1));
    const ap = mkYabloko(); ap.scale.setScalar(0.75); ap.position.set(-0.5, 0.5, 0.2); g.add(ap);
    const mk = mkMorkovka(); mk.scale.setScalar(0.7); mk.rotation.z = 1.4; mk.position.set(0.4, 0.42, 0.2); g.add(mk);
    const hn = mkMed(); hn.scale.setScalar(0.7); hn.position.set(0.5, 3.75, 0.1); g.add(hn);
    // дверцы на петлях слева
    const mkDoor = (y, h) => { const d = grp(-1.25, y, 0.95); d.add(rbox(wh, 2.5, h, 0.14, 0.1, 1.25, 0, 0.05)); d.add(rbox(M('#9aa7ad', 0.3), 0.14, Math.min(0.9, h * 0.5), 0.14, 0.05, 2.15, 0, 0.18)); g.add(d); return d; };
    const top = mkDoor(4.12, 1.56), bot = mkDoor(1.68, 3.2);
    for (const [x, y, c] of [[0.7, 0.3, '#ff6fae'], [1.4, 0.0, '#ffd21f'], [1.0, -0.6, '#35b24a']]) { const m = ball(M(c, 0.5), [0.16, 0.16, 0.04], x, y, 0.14, true); m.castShadow = false; bot.add(m); }
    g.userData.doors = [top, bot];
    return g;
  }
  function mkTV() {
    const g = grp(), dk = M('#3a3f45', 0.4);
    g.add(rbox(M(WOOD, 0.6), 4.2, 1.5, 1.3, 0.1, 0, 0.75, 0));
    for (const s of [-1, 1]) g.add(ball(M('#ffd54f', 0.3), 0.09, s * 0.9, 0.8, 0.68, true));
    g.add(rbox(dk, 0.9, 0.3, 0.5, 0.06, 0, 1.62, 0)); g.add(rbox(dk, 3.6, 2.2, 0.22, 0.12, 0, 2.95, 0));
    const c = document.createElement('canvas'); c.width = 160; c.height = 96;
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const scr = new T.Mesh(new T.PlaneGeometry(3.3, 1.9), new T.MeshBasicMaterial({ map: tex })); scr.position.set(0, 2.95, 0.12); g.add(scr);
    const x = c.getContext('2d');
    g.userData.draw = (on, t) => {
      if (!on) { x.fillStyle = '#20262c'; x.fillRect(0, 0, 160, 96); x.fillStyle = 'rgba(255,255,255,.07)'; x.beginPath(); x.ellipse(40, 24, 50, 14, -0.4, 0, 7); x.fill(); tex.needsUpdate = true; return; }
      x.fillStyle = '#8fd3ff'; x.fillRect(0, 0, 160, 96); x.fillStyle = '#ffe066'; x.beginPath(); x.arc(132, 20, 11, 0, 7); x.fill();
      x.fillStyle = '#fff'; const cxp = (t * 14) % 200 - 30; for (const d of [0, 12, 24]) { x.beginPath(); x.arc(cxp + d, 22 + (d === 12 ? -5 : 0), 9, 0, 7); x.fill(); }
      x.fillStyle = '#7ed068'; x.fillRect(0, 70, 160, 26);
      const bx = 80 + Math.sin(t * 1.3) * 46, by = 62 - Math.abs(Math.sin(t * 5)) * 20; // зайчик прыгает
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(bx, by, 10, 9, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(bx - 4, by - 15, 3, 9, -0.2, 0, 7); x.fill(); x.beginPath(); x.ellipse(bx + 4, by - 15, 3, 9, 0.2, 0, 7); x.fill();
      x.fillStyle = '#22160f'; x.beginPath(); x.arc(bx - 3.5, by - 2, 1.4, 0, 7); x.arc(bx + 3.5, by - 2, 1.4, 0, 7); x.fill(); x.fillStyle = '#ff5d8a'; x.beginPath(); x.arc(bx, by + 2, 1.6, 0, 7); x.fill();
      for (let i = 0; i < 4; i++) { x.fillStyle = ['#ff6b8a', '#ffd54f', '#fff', '#ba68c8'][i]; x.beginPath(); x.arc(18 + i * 42, 80 + (i % 2) * 6, 3.5, 0, 7); x.fill(); }
      tex.needsUpdate = true;
    };
    g.userData.draw(false, 0);
    return g;
  }
  function mkFloorLamp() {
    const g = grp();
    g.add(cyl(M('#8d6e63', 0.6), 0.5, 0.56, 0.12, 0, 0.06, 0, 18)); g.add(cyl(M('#8d6e63', 0.6), 0.06, 0.06, 3.6, 0, 1.9, 0, 8));
    const sm = M('#ffe08a', 0.7, { emissive: C('#ffd54f'), emissiveIntensity: 0, side: T.DoubleSide });
    const sh = mesh(new T.CylinderGeometry(0.5, 0.95, 1.1, 24, 1, true), sm, 0, 4.0, 0); g.add(sh);
    g.userData.shade = sm; return g;
  }
  function mkClock() {
    const g = grp();
    g.add(rbox(M('#a86c3d', 0.6), 1.5, 1.7, 0.5, 0.1)); const rf = mesh(new T.CylinderGeometry(0.05, 1.25, 0.8, 4), M('#f0655a', 0.6), 0, 1.2, 0); rf.rotation.y = Math.PI / 4; rf.scale.z = 0.4; g.add(rf);
    const f = cyl(M('#fffdf5', 0.6), 0.5, 0.5, 0.08, 0, -0.2, 0.26, 24); f.rotation.x = Math.PI / 2; g.add(f);
    const h1 = rbox(M('#3a2a20', 0.5), 0.07, 0.4, 0.04, 0.02, 0, 0, 0.32), h2 = rbox(M('#3a2a20', 0.5), 0.05, 0.3, 0.04, 0.02, 0, 0, 0.33);
    const p1 = grp(0, -0.2, 0), p2 = grp(0, -0.2, 0); h1.position.y = 0.17; h2.position.y = 0.12; p1.add(h1); p2.add(h2); p2.rotation.z = -1.2; g.add(p1); g.add(p2);
    g.add(rbox(M('#5a3a2a', 0.8), 0.5, 0.45, 0.06, 0.08, 0, 0.5, 0.25));
    const bird = mkPtichka('#ffd21f'); bird.scale.setScalar(0.5); bird.position.set(0, 0.32, 0.0); bird.visible = false; g.add(bird);
    const pend = grp(0, -0.85, 0); pend.add(cyl(M('#ffc928', 0.3), 0.03, 0.03, 1.0, 0, -0.5, 0, 6)); pend.add(ball(M('#ffc928', 0.3), [0.2, 0.2, 0.08], 0, -1.0, 0)); g.add(pend);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    Object.assign(g.userData, { bird, pend, p1 }); return g;
  }
  function mkStartBtn() {
    const g = grp();
    g.add(cyl(M('#ffffff', 0.6), 0.5, 0.62, 1.5, 0, 0.75, 0, 20)); g.add(cyl(M('#ffd54f', 0.4), 0.72, 0.72, 0.16, 0, 1.56, 0, 24));
    const mat = M('#3fcf5a', 0.3, { emissive: C('#3fcf5a'), emissiveIntensity: 0.25 });
    const dome = ball(mat, [0.6, 0.34, 0.6], 0, 1.68, 0); g.add(dome);
    const tri = mesh(new T.CylinderGeometry(0.26, 0.26, 0.06, 3), new T.MeshBasicMaterial({ color: 0xffffff }), 0, 2.03, 0); tri.castShadow = false; g.add(tri);
    Object.assign(g.userData, { dome, mat, tri }); return g;
  }
  const BLOCKS = [ // кубики конструктора: [вид, цвет, высота]
    ['box', '#f0352b', 1.0], ['box', '#2a6df4', 1.0], ['wide', '#ffd21f', 0.7], ['cyl', '#35b24a', 1.1], ['box', '#ff8a1c', 1.0], ['wide', '#b25de0', 0.7], ['cyl', '#ff6fae', 1.1], ['roof', '#f0352b', 1.0],
  ];
  function mkBlock(kind, col) {
    const m = M(col, 0.45);
    if (kind === 'box') return rbox(m, 1.0, 1.0, 1.0, 0.1);
    if (kind === 'wide') return rbox(m, 2.0, 0.7, 1.0, 0.1);
    if (kind === 'cyl') return cyl(m, 0.5, 0.5, 1.1, 0, 0, 0, 20);
    const r = mesh(new T.CylinderGeometry(0.02, 0.8, 1.0, 4), m); r.rotation.y = Math.PI / 4; return r;
  }

  // =====================================================================
  function openDom() {
    const my = clearWorld(), alive = () => my === session;
    const lvl = window.__lvl !== undefined ? window.__lvl : lvlOf();
    const TAP = S.ctl === 'tap' || /[?&]ctl=tap/.test(location.search); // прежнее управление: нажал на пол — пошёл
    hud.classList.add('on'); hud.classList.toggle('tap', TAP); hudStars(0); checkRot(); goLandscape();
    scene.background = new T.Color(C('#fdf3dc'));
    Voice.preload(PRAISE.concat(['podskazka', 'final', 'esche', 'kraski_intro', 'eda_intro', 'mishki_intro', 'vedra_intro', 'ne_to', 'nyam', 'v_vedro', 'vedro_ne', 'tesno', 'veliko', 'spokoynoy', 'dom_intro', 'dom_vozmi', 'kuku', 'hihi'],
      Object.keys(COLORS).flatMap(c => ['najdi_' + c, 'eto_' + c]), ['bolshoy', 'sredniy', 'malenky'].map(s => 'mishka_' + s), ['morkovka', 'med', 'yabloko', 'moloko', 'kost'].map(f => 'kto_lubit_' + f)));

    // свет
    const hemi = new T.HemisphereLight(C('#ffffff'), C('#ffe6c8'), 0.8); world.add(hemi);
    const sun = new T.DirectionalLight(C('#fff3dc'), 0.4);
    sun.position.set(15, 44, 8); sun.target.position.set(6, 0, -8); world.add(sun.target);
    sun.castShadow = !S.low; const sz = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
    { const c = sun.shadow.camera; c.left = -34; c.right = 36; c.top = 32; c.bottom = -30; c.near = 1; c.far = 100; }
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.05; sun.shadow.radius = 5;
    world.add(sun); sunLight = sun;

    const P0 = () => (landscape ? -0.05 : -0.2);
    const st = FP = { x: 0, z: 5.4, y: 0, yaw: 0, pitch: P0(), path: [], arrive: null, look: null, t: 0, maxT: 0, turn: 0, turnLeft: 0, turnDir: 0, room: 'hall', bob: 0, held: null, stars: 0, jx: 0, jy: 0, hopY: 0, build: null, repeat: () => repeat(), use: () => useBtn(), drop: () => drop() };
    const INTER = [], SURF = [], OBST = { hall: [], kuh: [], spal: [], igr: [] }, TICK = [], G = {};
    const say = ids => Voice.say(ids, null);
    const floorY = x => SH * Math.max(0, Math.min(1, (x - XS0) / SL));

    // ---------- стены, пол, потолок ----------
    const STYLE = {
      hall: { wall: wallTex({ wall: '#ffe9c9', pat: '#ffdcae', panel: '#fff6e6', kind: 'stripes' }), floor: floorTex({ hue: 30, l: 62 }) },
      kuh: { wall: wallTex({ wall: '#d9f2d0', pat: '#c4e8b8', panel: '#f4fbef', kind: 'dots' }), floor: floorTex({ kind: 'tiles', a: '#fff7ea', b: '#bfe3d0' }) },
      spal: { wall: wallTex({ wall: '#dde4ff', pat: '#ffffff', panel: '#f1f3ff', kind: 'stars' }), floor: floorTex({ hue: 26, l: 68 }) },
      igr: { wall: wallTex({ wall: '#ffe1ea', pat: '#ffd0de', panel: '#fff3f6', kind: 'dots' }), floor: floorTex({ kind: 'carpet', a: '#9fd8ef', rep: 3 }) },
    };
    const ceilM = M('#fffaf0', 1, { emissive: C('#fff3e0'), emissiveIntensity: 0.45 }), trimM = M('#ffffff', 0.7);
    const WM = {};
    const frame = (c, X, y0) => { // наличники проёма
      const box = (along, y, la, h) => { const m = rbox(trimM, X ? TH + 0.36 : la, h, X ? la : TH + 0.36, 0.08, X ? c : along, y0 + y, X ? along : c); m.castShadow = false; world.add(m); };
      box(-(DW / 2 + 0.12), (DH + 0.3) / 2, 0.5, DH + 0.3); box(DW / 2 + 0.12, (DH + 0.3) / 2, 0.5, DH + 0.3); box(0, DH + 0.24, DW + 0.9, 0.5);
    };
    for (const key of RKEYS) {
      const R = RM[key], Y = R.y || 0, S_ = STYLE[key], wm = WM[key] = new T.MeshStandardMaterial({ map: S_.wall, roughness: 1 });
      const fl = new T.Mesh(new T.PlaneGeometry(STEP, STEP), new T.MeshStandardMaterial({ map: S_.floor, roughness: 0.85 }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(R.cx, Y, R.cz); fl.receiveShadow = true; fl.userData.surf = { room: key, floor: true }; world.add(fl); SURF.push(fl);
      const cl = new T.Mesh(new T.PlaneGeometry(STEP, STEP), ceilM); cl.rotation.x = Math.PI / 2; cl.position.set(R.cx, Y + WH, R.cz); world.add(cl);
      const lamp = mkLamp({ hall: '#ffb74d', kuh: '#81c784', spal: '#9fa8da', igr: '#ff8fb1' }[key]); lamp.position.set(R.cx, Y + WH, R.cz); world.add(lamp);
      const hasDoor = side => key === 'hall' ? (side === 'w' || side === 'e' || side === 'n') : (key === 'kuh' && side === 'e') || (key === 'spal' && side === 'w') || (key === 'igr' && side === 's');
      for (const side of ['n', 's', 'w', 'e']) {
        const piece = (a0, a1, y0, y1) => {
          const g = new T.PlaneGeometry(a1 - a0, y1 - y0), uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (a0 + uv.getX(i) * (a1 - a0) + HS) / 4, (y0 + uv.getY(i) * (y1 - y0)) / WH);
          const m = new T.Mesh(g, wm), a = (a0 + a1) / 2, y = Y + (y0 + y1) / 2;
          if (side === 'n') { m.position.set(R.cx + a, y, R.cz - HS); m.userData.surf = { room: key, nx: 0, nz: 1 }; }
          else if (side === 's') { m.position.set(R.cx - a, y, R.cz + HS); m.rotation.y = Math.PI; m.userData.surf = { room: key, nx: 0, nz: -1 }; }
          else if (side === 'w') { m.position.set(R.cx - HS, y, R.cz - a); m.rotation.y = Math.PI / 2; m.userData.surf = { room: key, nx: 1, nz: 0 }; }
          else { m.position.set(R.cx + HS, y, R.cz + a); m.rotation.y = -Math.PI / 2; m.userData.surf = { room: key, nx: -1, nz: 0 }; }
          world.add(m); SURF.push(m);
        };
        if (hasDoor(side)) { piece(-HS, -DW / 2, 0, WH); piece(DW / 2, HS, 0, WH); piece(-DW / 2, DW / 2, DH, WH); }
        else piece(-HS, HS, 0, WH);
        const bb = (a0, a1) => { const L = a1 - a0, a = (a0 + a1) / 2, hz = side === 'n' || side === 's'; const sgn = side === 'n' || side === 'w' ? -1 : 1; const m = mesh(new T.BoxGeometry(hz ? L : 0.16, 0.42, hz ? 0.16 : L), trimM, hz ? R.cx + a : R.cx + sgn * (HS - 0.08), Y + 0.21, hz ? R.cz + sgn * (HS - 0.08) : R.cz + a); m.castShadow = false; world.add(m); };
        if (hasDoor(side)) { bb(-HS, -DW / 2 - 0.3); bb(DW / 2 + 0.3, HS); } else bb(-HS, HS);
      }
      if (R.ax) { // обычный проём между соседними комнатами
        const c = R.s * (HS + TH / 2), X = R.ax === 'x'; frame(c, X, 0);
        const th = mesh(new T.BoxGeometry(X ? TH + 0.1 : DW, 0.06, X ? DW : TH + 0.1), M(WOOD, 0.6), X ? c : 0, 0.02, X ? 0 : c); th.castShadow = false; th.receiveShadow = true; th.userData.surf = { room: key, floor: true }; world.add(th); SURF.push(th);
      }
    }
    // ---------- лестница на второй этаж: из гостиной направо и вверх, в спальню ----------
    {
      const N = 16, run = SL / N, rise = SH / N, slope = Math.atan2(SH, SL), len = Math.hypot(SL, SH), mx = XS0 + SL / 2;
      frame(HS + TH / 2, true, 0); frame(XS1 + TH / 2, true, SH);
      const th = mesh(new T.BoxGeometry(TH + 0.1, 0.06, DW), M(WOOD, 0.6), HS + TH / 2, 0.02, 0); th.castShadow = false; th.receiveShadow = true; world.add(th);
      const top = mesh(new T.BoxGeometry(TH + 0.1, 0.3, DW), M(WOOD, 0.6), XS1 + TH / 2, SH - 0.14, 0); top.castShadow = false; top.receiveShadow = true; world.add(top);
      const wd = M('#d9a066', 0.6), cp = M('#e2574c', 0.9);
      for (let i = 0; i < N; i++) {
        const h = (i + 1) * rise, s = mesh(new T.BoxGeometry(run, h, DW), wd, XS0 + (i + 0.5) * run, h / 2, 0); s.castShadow = false; s.receiveShadow = true; world.add(s);
        const c = mesh(new T.BoxGeometry(run + 0.02, 0.05, DW * 0.56), cp, XS0 + (i + 0.5) * run, h + 0.025, 0); c.castShadow = false; c.receiveShadow = true; world.add(c);
      }
      // невидимый скат: по нему находится точка, куда нажали
      const rg = grp(mx, SH / 2 + 0.06, 0); rg.rotation.z = slope; const rp = new T.Mesh(new T.PlaneGeometry(len, DW), new T.MeshBasicMaterial({ visible: false })); rp.rotation.x = -Math.PI / 2; rp.userData.surf = { room: 'hall', floor: true }; rg.add(rp); world.add(rg); SURF.push(rp);
      for (const s of [-1, 1]) { // боковые стены и перила
        const g = new T.PlaneGeometry(SL + 0.6, SH + WH), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (SL + 0.6) / 4, uv.getY(i) * (SH + WH) / WH);
        const m = new T.Mesh(g, WM.hall); m.position.set(mx, (SH + WH) / 2, s * DW / 2); m.rotation.y = s > 0 ? Math.PI : 0; m.userData.surf = { room: 'hall', nx: 0, nz: -s }; world.add(m); SURF.push(m);
        const rail = cyl(M(WOOD, 0.5), 0.09, 0.09, len, mx, SH / 2 + 1.75, s * (DW / 2 - 0.22), 8); rail.rotation.z = slope - Math.PI / 2; rail.castShadow = false; world.add(rail);
        for (let i = 1; i < N; i += 3) { const b = cyl(trimM, 0.05, 0.05, 1.7, XS0 + (i + 0.5) * run, (i + 1) * rise + 0.85, s * (DW / 2 - 0.22), 6); b.castShadow = false; world.add(b); }
      }
      const cg = grp(mx, SH / 2 + 6.5, 0); cg.rotation.z = slope; const cpn = new T.Mesh(new T.PlaneGeometry(len + 1.5, DW), ceilM); cpn.rotation.x = Math.PI / 2; cg.add(cpn); world.add(cg);
      const mk = (x, y0, y1, ry) => { const m = new T.Mesh(new T.PlaneGeometry(DW, y1 - y0), WM.hall); m.position.set(x, (y0 + y1) / 2, 0); m.rotation.y = ry; world.add(m); };
      mk(XS0 - 0.02, DH, SH + WH, Math.PI / 2); mk(XS1 + 0.02, SH + DH, SH + WH, -Math.PI / 2);
      for (const [i, k] of [[4, 0], [10, 1]]) { const pc = mkPicture(k, k ? '#ff8fb1' : '#4fc3f7'); pc.position.set(XS0 + i * run, (i + 1) * rise + 3.6, -DW / 2 + 0.08); world.add(pc); }
    }

    // ---------- что можно нажать ----------
    const inter = (obj, fp) => { obj.userData.fp = fp; INTER.push(obj); return obj; };
    const uninter = obj => { const i = INTER.indexOf(obj); if (i >= 0) INTER.splice(i, 1); obj.userData.fp = null; };
    const wpos = o => o.getWorldPosition(new T.Vector3());
    const MARKS = [];
    function mark(obj, y, s = 0.34) { if (obj.userData.mark) return; const k = 1 / (obj.scale.x || 1); const m = mkZvezda(true, s * k); m.castShadow = false; m.userData.by = y * k; m.userData.amp = 0.12 * k; m.position.y = y * k; obj.add(m); obj.userData.mark = m; MARKS.push(m); }
    function unmark(obj) { const m = obj.userData.mark; if (!m) return; obj.remove(m); obj.userData.mark = null; const i = MARKS.indexOf(m); if (i >= 0) MARKS.splice(i, 1); }

    // ---------- руки ----------
    const hands = grp(); hands.visible = false; cam.add(hands);
    const pawM = M('#fff8f0', 0.9), slot = grp(); hands.add(slot);
    for (const s of [-1, 1]) { const p = ball(pawM, [0.3, 0.26, 0.42], s * 0.62, -0.28, 0.12); p.castShadow = false; p.rotation.y = s * 0.5; hands.add(p); const pad = ball(M('#f7b6c6', 0.8), [0.13, 0.05, 0.16], s * 0.6, -0.04, 0.05, true); pad.castShadow = false; hands.add(pad); }
    function setFov() {
      cam.fov = landscape ? 62 : 84; cam.near = 0.3; cam.far = 160; cam.updateProjectionMatrix();
      const D = 2.5, hh = D * Math.tan(cam.fov / 2 * Math.PI / 180), k = landscape ? 1 : 0.74;
      hands.position.set(0, -hh * 0.64, -D); hands.scale.setScalar(k); hands.userData.by = hands.position.y;
    }
    setFov();
    const setHeld = it => { st.held = it; hands.visible = !!it; $('fpDrop').classList.toggle('show', !!it); };
    function take(it) {
      if (st.held === it) return;
      if (st.held) putBack(st.held);
      const o = it.obj; unmark(o);
      it.home = it.home || { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.x };
      o.userData.fp && (o.userData.fp.off = true); o.userData.float = false;
      slot.add(o); o.position.set(0, it.hy || 0, 0); o.rotation.set(0, it.hry || 0, 0); o.scale.setScalar(0.001); tws(o, it.hs, 320, 'back');
      setHeld(it); SFX.plop();
      hands.position.y = hands.userData.by - 1.2; tw(hands.position, { y: hands.userData.by }, 300, 'out');
      it.onTake && it.onTake();
      if (it.lookAfter && TAP) wait(500).then(() => { if (alive() && st.held === it && !st.path.length) lookAt(it.lookAfter); });
    }
    function putBack(it) {
      const o = it.obj, h = it.home; world.add(o); o.position.copy(h.p); o.rotation.copy(h.r); popIn(o, h.s);
      o.userData.fp && (o.userData.fp.off = false);
      if (st.held === it) setHeld(null);
      it.onBack && it.onBack();
    }
    function release(it, s) {
      const o = it.obj, p = wpos(o), q = o.getWorldQuaternion(new T.Quaternion());
      world.add(o); o.position.copy(p); o.quaternion.copy(q); o.scale.setScalar(s === undefined ? it.hs * hands.scale.x : s);
      setHeld(null); return o;
    }
    // положить предмет на пол перед собой: там он и останется
    function drop() {
      const it = st.held; if (!it || st.build) return;
      let p = { x: st.x - Math.sin(st.yaw) * 2.8, z: st.z - Math.cos(st.yaw) * 2.8 }; if (!inside(p.x, p.z)) p = { x: st.x - Math.sin(st.yaw) * 1.2, z: st.z - Math.cos(st.yaw) * 1.2 }; if (!inside(p.x, p.z)) p = { x: st.x, z: st.z };
      const o = release(it), h = it.home, dst = V(p.x, floorY(p.x) + (it.fy || 0), p.z);
      o.rotation.set(0, st.yaw + Math.PI, 0); tws(o, h.s, 260); arc(o, dst, 320, 0.5).then(() => { SFX.thunk(); });
      h.p.copy(dst); h.r = new T.Euler(0, st.yaw + Math.PI, 0); o.userData.fp && (o.userData.fp.off = false);
      it.onDrop && it.onDrop(dst);
    }

    // ---------- где можно ходить ----------
    const IN = HS - 0.95;
    const REG = RKEYS.map(k => ({ x0: RM[k].cx - IN, x1: RM[k].cx + IN, z0: RM[k].cz - IN, z1: RM[k].cz + IN }))
      .concat([{ x0: -(HS + TH + 1.2), x1: -(HS - 1.2), z0: -1.5, z1: 1.5 }, { x0: -1.5, x1: 1.5, z0: -(HS + TH + 1.2), z1: -(HS - 1.2) }, { x0: HS - 1.2, x1: XS1 + TH + 1.2, z0: -1.5, z1: 1.5 }]);
    const inside = (x, z) => REG.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    const roomOf = (x, z) => { let best = 'hall', bd = 1e9; for (const k of RKEYS) { const R = RM[k], d = Math.max(Math.abs(x - R.cx), Math.abs(z - R.cz)); if (d < bd) { bd = d; best = k; } } return best; };
    function clampRoom(p, k) { const R = RM[k], m = HS - PAD; p.x = Math.max(R.cx - m, Math.min(R.cx + m, p.x)); p.z = Math.max(R.cz - m, Math.min(R.cz + m, p.z)); return p; }
    function pushOut(p, k) {
      let hit = false;
      for (const o of OBST[k]) {
        if (o.off) continue;
        if (p.x > o.x0 && p.x < o.x1 && p.z > o.z0 && p.z < o.z1) {
          const d = [p.x - o.x0, o.x1 - p.x, p.z - o.z0, o.z1 - p.z], m = Math.min(...d), i = d.indexOf(m);
          if (i === 0) p.x = o.x0; else if (i === 1) p.x = o.x1; else if (i === 2) p.z = o.z0; else p.z = o.z1;
          hit = true;
        }
      }
      return hit;
    }
    const setOb = (o, x, z, hw, hd, pad) => { o.x0 = x - hw - pad; o.x1 = x + hw + pad; o.z0 = z - hd - pad; o.z1 = z + hd + pad; return o; };
    const obst = (k, x, z, hw, hd, pad = 0.75) => { const o = setOb({}, x, z, hw, hd, pad); OBST[k].push(o); return o; };
    const ring = mesh(new T.RingGeometry(0.34, 0.5, 28), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.castShadow = false; world.add(ring);
    function ping(x, z) { ring.position.set(x, floorY(x) + 0.09, z); twf(650, (e, k) => { ring.scale.setScalar(0.6 + k * 1.3); ring.material.opacity = 0.85 * (1 - k); }); }
    function walkTo(p, look, cb) {
      const rf = roomOf(st.x, st.z), rt = roomOf(p.x, p.z), pts = [];
      if (rf !== rt) {
        if (rf !== 'hall') pts.push(doorPt(rf, 1), doorPt(rf, 0));
        if (rt !== 'hall') pts.push(doorPt(rt, 0), doorPt(rt, 1));
      }
      pts.push({ x: p.x, z: p.z });
      let L = 0, px = st.x, pz = st.z; for (const q of pts) { L += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
      st.path = pts; st.arrive = cb || null; st.look = null; st.lookEnd = look || null; st.t = 0; st.maxT = L / SPEED * 1.6 + 1.2;
    }
    function lookAt(v) { const dx = v.x - st.x, dz = v.z - st.z, d = Math.hypot(dx, dz); st.look = { yaw: Math.atan2(-dx, -dz), pitch: Math.max(-0.55, Math.min(0.6, Math.atan2(v.y - (st.y + EYE), Math.max(d, 0.5)))) }; }
    const angd = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    function arrived() { st.path = []; const cb = st.arrive, lk = st.lookEnd; st.arrive = null; st.lookEnd = null; if (lk) lookAt(lk()); if (cb) cb(); }
    const REACH = 6.8;
    const distTo = o => { const p = wpos(o); return Math.hypot(p.x - st.x, p.z - st.z); };
    // нажали на предмет: если он рядом — действуем сразу, если далеко — Зайка сама подходит
    function use(o, direct) {
      const f = o.userData.fp; if (!f || f.off) return;
      if (f.far) { if (TAP) lookAt(f.look()); f.act(); return; }
      if (direct || (!TAP && distTo(o) <= REACH)) { st.path = []; f.act(); return; }
      const p = f.stand(); pushOut(p, roomOf(p.x, p.z));
      walkTo(p, f.look, f.act);
    }
    const near = (o, d) => () => { const p = wpos(o), dx = st.x - p.x, dz = st.z - p.z, l = Math.hypot(dx, dz) || 1, k = roomOf(p.x, p.z); return clampRoom({ x: p.x + dx / l * d, z: p.z + dz / l * d }, k); };
    // предмет «под прицелом»: на него сработает большая кнопка-лапка
    const focusM = grp(); { const c = cone(new T.MeshBasicMaterial({ color: C('#ffd21f') }), 0.3, 0.55, 0, 0, 0, 14); c.rotation.x = Math.PI; c.castShadow = false; focusM.add(c); } focusM.visible = false; world.add(focusM);
    let focus = null;
    function findFocus() {
      let best = null, bs = 1e9;
      if (st.build) return null;
      for (const o of INTER) {
        const f = o.userData.fp; if (!f || f.off || !o.parent || !o.visible || f.room !== st.room || f.noFocus) continue;
        const p = wpos(o), dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
        if (d > (f.far ? 17 : REACH)) continue;
        const a = Math.abs(angd(Math.atan2(-dx, -dz), st.yaw)); if (a > (f.far ? 0.42 : 0.62)) continue;
        const s = a * 5 + d * 0.16; if (s < bs) { bs = s; best = o; }
      }
      return best;
    }
    function useBtn() {
      if (st.build) { st.build.exit(); return; }
      if (focus) { SFX.tap(); use(focus, true); } else SFX.soft();
    }

    // ---------- касания ----------
    const rc = new T.Raycaster(), nd = new T.Vector2();
    function tap(cx, cy) {
      nd.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); rc.setFromCamera(nd, cam);
      const live = INTER.filter(o => o.userData.fp && !o.userData.fp.off && o.visible && o.parent && (!st.build || o.userData.fp.build));
      const hits = rc.intersectObjects(live.map(o => o.userData.hit || o).concat(SURF), true);
      let target = null, surf = null;
      for (const h of hits) {
        if (h.object.userData.surf) { surf = h; break; }
        let o = h.object; while (o && !(o.userData.fp && !o.userData.fp.off)) o = o.parent;
        if (o && live.includes(o)) { target = o; break; }
      }
      if (!target) {
        let bd = Math.min(innerWidth, innerHeight) * 0.07;
        for (const o of live) {
          if (o.userData.fp.room !== st.room) continue;
          const v = wpos(o); v.y += (o.userData.cy || 0); v.project(cam); if (v.z > 1) continue;
          const d = Math.hypot((v.x + 1) / 2 * innerWidth - cx, (1 - v.y) / 2 * innerHeight - cy); if (d < bd) { bd = d; target = o; }
        }
      }
      if (target) { use(target); return; }
      if (!surf || !TAP || st.build) return;
      const s = surf.object.userData.surf, p = { x: surf.point.x, z: surf.point.z };
      if (!s.floor) { p.x += s.nx * 1.6; p.z += s.nz * 1.6; }
      const k = roomOf(p.x, p.z); clampRoom(p, k); pushOut(p, k);
      ping(p.x, p.z); walkTo(p); st.walked = true;
    }
    let ptr = null;
    const onDown = e => { if (!alive()) return; Idle.poke(); if (ptr) return; ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, t: performance.now() }; try { canvas.setPointerCapture(e.pointerId); } catch (er) {} };
    const onMove = e => {
      if (!ptr || e.pointerId !== ptr.id) return;
      if (!ptr.moved && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > Math.min(innerWidth, innerHeight) * 0.03) { ptr.moved = true; st.look = null; }
      if (ptr.moved && !st.build) {
        // с джойстиком — как в «SCP: Побег»: ведёшь палец вправо, взгляд идёт вправо
        const k = TAP ? 2.4 / Math.min(innerWidth, innerHeight) * (cam.fov / 62) : -0.005, dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly;
        st.yaw += dx * k; st.pitch = Math.max(-0.7, Math.min(0.7, st.pitch + dy * k * (TAP ? 0.7 : 1))); st.userLook = performance.now();
      }
      ptr.lx = e.clientX; ptr.ly = e.clientY;
    };
    const onUp = e => { if (!ptr || e.pointerId !== ptr.id) return; const p = ptr; ptr = null; if (!alive()) return; if (!p.moved && e.type === 'pointerup' && performance.now() > inputLock) tap(p.x, p.y); };
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    const keys = {};
    const onKey = e => { const d = e.type === 'keydown'; keys[e.code] = d; if (d && (e.code === 'KeyE' || e.code === 'Space')) useBtn(); if (d && e.code === 'KeyQ') drop(); };
    addEventListener('keydown', onKey); addEventListener('keyup', onKey);
    const onClear = () => { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); ON_CLEAR.splice(ON_CLEAR.indexOf(onClear), 1); if (FP === st) FP = null; $('fpDrop').classList.remove('show'); };
    ON_CLEAR.push(onClear);

    // ---------- задания: общее ----------
    const SIGN = {}, BTN = {};
    function setQ(key, ids, hint) {
      const g = G[key]; g.q = ids; g.hint = hint || null;
      if (st.room === key) { say(ids); Idle.set(() => { if (st.room === key) { say(g.q); g.hint && g.hint(); } }); }
    }
    function repeat() { const g = G[st.room]; if (g && g.started && g.q && !g.done) { say(g.q); g.hint && g.hint(); } else SFX.tap(); }
    // задание начинается только с зелёной кнопки в комнате; без неё по дому можно просто гулять
    function startBtn(key, x, z) {
      const R = RM[key], Y = R.y || 0, b = mkStartBtn(); b.position.set(x, Y, z); world.add(b); BTN[key] = b;
      hitBox(b, 1.9, 2.6, 1.9, 0, 1.3, 0); b.userData.cy = 1.6; obst(key, x, z, 0.4, 0.4, 0.55);
      inter(b, { room: key, fh: 2.9, stand: near(b, 2.6), look: () => V(x, Y + 1.6, z), act: () => {
        const g = G[key], U = b.userData; squash(b, 300); tw(U.dome.position, { y: 1.58 }, 90).then(() => tw(U.dome.position, { y: 1.68 }, 160, 'back'));
        if (g.done) { SFX.good(); burst(V(x, Y + 2.4, z), 12); return; }
        if (g.started) { SFX.tap(); if (g.q) { say(g.q); g.hint && g.hint(); } return; }
        g.started = true; SFX.good(); U.tri.visible = false; U.mat.color.copy(C('#ffb300')); U.mat.emissive.copy(C('#ffb300'));
        const carry = key !== 'hall' && !st.told; if (carry) st.told = true;
        say([g.intro, carry ? 'dom_vozmi' : null]).then(ok => { if (alive()) { if (ok) g.start(); else g.pending = true; } });
      } });
      TICK.push(t => { const U = b.userData, g = G[key]; if (g && !g.started) { U.mat.emissiveIntensity = 0.3 + Math.sin(t * 4) * 0.25; U.tri.rotation.y = t * 1.5; } else U.mat.emissiveIntensity = 0.15; });
    }
    function enterRoom(key) {
      Idle.off(); Voice.stop(); const g = G[key]; if (!g || g.done || !g.started) return;
      if (g.pending) { g.pending = false; g.start(); return; }
      if (g.q) { say(g.q); Idle.set(() => { if (st.room === key) { say(g.q); g.hint && g.hint(); } }); }
    }
    async function roomDone(key, pos) {
      const g = G[key]; g.done = true; g.q = null; Idle.off();
      st.stars++; hudStars(st.stars); SFX.good(); burst(pos, 22);
      const bt = BTN[key]; if (bt) { const s = mkZvezda(true, 0.5); s.castShadow = false; s.position.y = 2.5; bt.add(s); popIn(s, 0.5); TICK.push(t => { s.rotation.y = t * 2; }); }
      const sg = SIGN[key]; if (sg) { const s = mkZvezda(true, 0.42); s.castShadow = false; s.position.set(0.62, 0.62, 0.25); sg.add(s); popIn(s, 0.42); TICK.push(t => { s.rotation.y = Math.sin(t * 2) * 0.6; }); }
      await say(praise());
      if (!alive() || st.stars < RKEYS.length) return;
      S.stars.dom = (S.stars.dom || 0) + 1; save();
      SFX.fanfare();
      const D = 0.9, hh = D * Math.tan(cam.fov / 2 * Math.PI / 180), hw = hh * cam.aspect;
      const star = mkZvezda(true, 1); star.castShadow = false; star.position.set(0, hh * 0.15, -D); star.scale.setScalar(0.001); cam.add(star);
      tws(star, Math.min(hh, hw) * 0.45, 900, 'elastic');
      twf(60000, (e, kk) => { star.rotation.y = Math.sin(kk * 60 * 1.6) * 0.5; star.rotation.z = Math.sin(kk * 60 * 1.1) * 0.15; });
      burst(V(0, hh * 0.15, -D + 0.05), 26, CONF_COLS, { parent: cam, speed: 0.1, size: 0.1, g: 1.6 });
      twf(5000, () => { if (Math.random() < 0.5) burst(V(rr(-hw, hw), hh * rr(0.9, 1.2), -D + rr(-0.1, 0.1)), 1, CONF_COLS, { parent: cam, g: 0.5, speed: 0.05, up: -0.2, conf: true, size: 0.1 }); });
      await say('final');
      if (!alive()) return;
      UI.fin.classList.add('on'); say('esche');
    }
    const miss = g => { g.wrong = (g.wrong || 0) + 1; SFX.soft(); return g.wrong >= 2; };
    // «живой» предмет: нажал — что-то происходит
    const fun = (obj, room, hb, act, o = {}) => { hitBox(obj, hb[0], hb[1], hb[2], hb[3] || 0, hb[4] === undefined ? hb[1] / 2 : hb[4], hb[5] || 0); obj.userData.cy = hb[4] === undefined ? hb[1] / 2 : hb[4]; return inter(obj, Object.assign({ room, fh: hb[1] + 0.6, stand: near(obj, o.d || 3.6), look: () => { const p = wpos(obj); p.y += obj.userData.cy; return p; }, act }, o)); };
    // игрушка, которую можно взять и переложить
    const toy = (obj, room, hs, fy, hy = 0) => { const it = { obj, hs, hy, fy }; obj.userData.cy = 0; hitBox(obj, 1.6, 1.6, 1.6); inter(obj, { room, fh: 1.5, stand: near(obj, 3.0), look: () => wpos(obj), act: () => take(it) }); it.onDrop = p => { obj.userData.fp.room = roomOf(p.x, p.z); }; return it; };

    // =========== ГОСТИНАЯ: шарики по цветам ===========
    {
      const sofa = mkSofa('#8fc7e8'); sofa.position.set(-6.75, 0, 5.2); sofa.rotation.y = Math.PI / 2; world.add(sofa); obst('hall', -6.75, 5.2, 1.0, 2.6, 0.5);
      fun(sofa, 'hall', [4.8, 2.4, 2.2, 0, 1.2, 0], () => { SFX.boing(); squash(sofa, 400); st.hopT = 0.0001; Voice.say('hihi', null); });
      const sh = mkShelf(false); sh.position.set(7.25, 0, 5.2); sh.rotation.y = -Math.PI / 2; world.add(sh); obst('hall', 7.25, 5.2, 0.7, 1.9, 0.5);
      { const p = mkPlant(); p.position.set(-6.9, 0, -6.9); world.add(p); obst('hall', -6.9, -6.9, 0.5, 0.5, 0.5); fun(p, 'hall', [1.6, 2.8, 1.6], () => { wobble(p, 0.12); SFX.chirp(); burst(V(-6.9, 2.6, -6.9), 6, ['#66c45c', '#4fae4d', '#ff6b8a']); }); }
      world.add(mkRug(4.2, '#ff9db4', '#fff1c9'));
      for (const s of [-1, 1]) { const w = mkWindow('#ff8a65'); w.position.set(s * 5.0, 4.3, HS - 0.02); w.rotation.y = Math.PI; world.add(w); }
      { const pc = mkPicture(0, '#4fc3f7'); pc.position.set(-5.2, 4.4, -HS + 0.1); world.add(pc); }
      // телевизор: нажал — идёт мультик с музыкой
      const tv = mkTV(); tv.position.set(5.1, 0, -7.2); world.add(tv); obst('hall', 5.1, -7.2, 2.1, 0.7, 0.5);
      let tvOn = false, tvT = 0, tvN = 0; const MEL = [0, 2, 4, 2, 0, 2, 4, 5, 4, 2, 0, 4];
      fun(tv, 'hall', [4.2, 4.2, 1.4, 0, 2.1, 0], () => { tvOn = !tvOn; SFX.tap(); tone(tvOn ? 880 : 440, 0, 0.12, 'sine', 0.1); if (!tvOn) tv.userData.draw(false, 0); });
      TICK.push((t, dt) => { if (!tvOn) return; tvT += dt; if (tvT > 0.1) { tvT = 0; tv.userData.draw(true, t); } tvN -= dt; if (tvN <= 0) { tvN = 0.36; if (st.room === 'hall') { const i = MEL[Math.floor(t / 0.36) % MEL.length]; tone(NOTY[i], 0, 0.3, 'triangle', 0.05); } } });
      // торшер
      const fl = mkFloorLamp(); fl.position.set(-6.9, 0, 2.0); world.add(fl); obst('hall', -6.9, 2.0, 0.4, 0.4, 0.4); let flOn = false;
      fun(fl, 'hall', [1.8, 4.6, 1.8], () => { flOn = !flOn; fl.userData.shade.emissiveIntensity = flOn ? 0.9 : 0; tone(flOn ? 1200 : 700, 0, 0.06, 'square', 0.05); });
      // часы с кукушкой
      const ck = mkClock(); ck.position.set(-HS + 0.3, 4.9, -4.6); ck.rotation.y = Math.PI / 2; world.add(ck); let ckB = false;
      fun(ck, 'hall', [1.8, 3.2, 1.2, 0, -0.3, 0], async () => { if (ckB) return; ckB = true; const b = ck.userData.bird; b.visible = true; for (let i = 0; i < 2; i++) { tw(b.position, { z: 0.75 }, 160, 'out'); tone(784, 0, 0.16, 'sine', 0.2); tone(622, 0.2, 0.22, 'sine', 0.2); await wait(520); tw(b.position, { z: 0.0 }, 140, 'in'); await wait(260); } b.visible = false; ckB = false; }, { fh: 1.4 });
      TICK.push(t => { ck.userData.pend.rotation.z = Math.sin(t * 3) * 0.3; ck.userData.p1.rotation.z = -t * 0.5; });
      const door = mkExitDoor(); door.position.set(0, 0, HS - 0.12); door.rotation.y = Math.PI; world.add(door);
      hitBox(door, 3.2, 5.4, 0.8, 0, 2.7, 0.2); door.userData.cy = 2.7;
      inter(door, { room: 'hall', exit: true, fh: 6.0, stand: () => ({ x: 0, z: 5.6 }), look: () => V(0, 2.6, HS), act: () => { if (!busyWipe) { SFX.whoosh(); go(goHome); } } });
      const plaque = (key, x, z, ry, icon) => { const g = grp(x, 6.9, z); g.rotation.y = ry; g.scale.setScalar(0.8); const d = cyl(M('#ffffff', 0.6), 0.82, 0.82, 0.12, 0, 0, 0, 32); d.rotation.x = Math.PI / 2; d.castShadow = false; g.add(d); const r = mesh(new T.TorusGeometry(0.82, 0.07, 8, 36), M('#ffb300', 0.4)); r.castShadow = false; g.add(r); icon.position.z += 0.14; icon.traverse(o => { if (o.isMesh) o.castShadow = false; }); g.add(icon); world.add(g); SIGN[key] = g; };
      { const i = mkMed(); i.scale.setScalar(0.72); i.position.y = -0.08; plaque('kuh', -HS + 0.12, 0, Math.PI / 2, i); }
      { const i = mkMishka(); i.scale.setScalar(0.4); i.position.y = -0.6; plaque('spal', HS - 0.12, 0, -Math.PI / 2, i); }
      { const i = mkMyach(COLORS.krasny); i.scale.setScalar(0.78); plaque('igr', 0, -HS + 0.12, 0, i); }
      { const t = mkMyach(COLORS.zeleny); t.position.set(-3.6, 0.72, 4.6); t.scale.setScalar(1.2); world.add(t); toy(t, 'hall', 0.78, 0.72, 0.1); }

      const n = [3, 4, 6][lvl], cols = shuffle(Object.keys(COLORS)).slice(0, n);
      const P = [[-4.6, 4.5, -5.2], [2.2, 4.9, -3.6], [-2.9, 5.3, -6.6], [6.2, 4.5, -2.8], [-6.2, 4.6, 0.2], [5.6, 4.8, 2.6]];
      const g = G.hall = { intro: 'kraski_intro', left: 3, balls: [] };
      cols.forEach((c, i) => {
        const b = mkShar(COLORS[c]), U = b.userData; U.c = c; U.by = P[i][1]; U.cy = 0;
        b.position.set(P[i][0], P[i][1], P[i][2]); b.scale.setScalar(0.95); hitBox(b, 2.2, 2.7, 2.2, 0, -0.1, 0);
        const wt = ball(M(COLORS[c], 0.5), 0.2, P[i][0], 0.2, P[i][2]); world.add(wt);
        const str = cyl(M('#9a9a9a', 0.8), 0.014, 0.014, 1, P[i][0], 1, P[i][2], 4); str.castShadow = false; world.add(str); U.str = str;
        world.add(b); g.balls.push(b); popIn(b, 0.95, 300 + i * 120);
        inter(b, { room: 'hall', far: true, fh: 1.6, look: () => wpos(b), act: () => { if (g.tapBall) g.tapBall(b); else { wobble(b, 0.3); say('eto_' + c); } } });
      });
      TICK.push(t => g.balls.forEach(b => { const U = b.userData; if (!b.parent) return; b.position.y = U.by + Math.sin(t * 1.3 + U.ph) * 0.14; b.rotation.z = Math.sin(t * 0.9 + U.ph) * 0.06; const y0 = 0.3, y1 = b.position.y - 2.75; U.str.scale.y = Math.max(0.01, y1 - y0); U.str.position.y = (y0 + y1) / 2; }));
      g.start = () => {
        const liveB = g.balls.filter(b => b.parent && !b.userData.popped);
        const tb = pick(liveB), target = tb.userData.c; g.wrong = 0;
        g.tapBall = async b => {
          const U = b.userData; if (U.popped) return;
          if (g.done || g.busy) { wobble(b, 0.3); say('eto_' + U.c); return; }
          if (U.c === target) {
            g.busy = true; g.balls.forEach(unmark); U.popped = true; uninter(b);
            SFX.pop(); const pos = b.position.clone();
            await tws(b, 1.3, 90, 'out'); world.remove(b); world.remove(U.str);
            burst(pos, 22, [COLORS[U.c], '#ffffff', COLORS[U.c]], { conf: true, speed: 1.2 }); SFX.good();
            g.left--; g.busy = false;
            if (g.left <= 0) { g.q = null; await say('eto_' + U.c); if (alive()) roomDone('hall', pos); return; }
            g.q = null; Idle.off();
            await say(['eto_' + U.c, praise()]); if (alive()) g.start();
          } else {
            const hint = miss(g); wobble(b, 0.35);
            if (hint) mark(tb, 1.5);
            say(['eto_' + U.c, hint ? 'podskazka' : null, 'najdi_' + target]);
          }
        };
        setQ('hall', ['najdi_' + target], () => { nudge(tb); });
      };
      startBtn('hall', 3.4, 3.0);
    }

    // =========== КУХНЯ: кто что любит ===========
    {
      const cx = RM.kuh.cx;
      const stove = mkStove(); stove.position.set(cx - 6.4, 0, -7.1); world.add(stove);
      { const pot = stove.userData.pot; let b = false; const hbx = grp(cx - 5.75, 2.3, -7.4); world.add(hbx);
        fun(hbx, 'kuh', [1.6, 1.4, 1.6, 0, 0, 0], async () => { if (b) return; b = true; const lid = pot.children[1], knob = pot.children[2]; noise(0, 0.5, 0.12, 700); for (let i = 0; i < 3; i++) { tw(lid.position, { y: 0.95 }, 120, 'out'); tw(knob.position, { y: 1.04 }, 120, 'out'); tone(300 + i * 60, 0, 0.1, 'sine', 0.12, 500); const s = ball(M('#ffffff', 1, { transparent: true, opacity: 0.7 }), 0.2, cx - 5.75 + rr(-0.2, 0.2), 2.8, -7.4, true); s.castShadow = false; world.add(s); tw(s.position, { y: 4.6 }, 900, 'out'); twf(900, (e, k) => { s.scale.setScalar(0.2 + k * 0.5); s.material.opacity = 0.7 * (1 - k); }).then(() => world.remove(s)); await wait(140); tw(lid.position, { y: 0.63 }, 120, 'in'); tw(knob.position, { y: 0.72 }, 120, 'in'); await wait(200); } b = false; }, { fh: 1.6, d: 3.4, stand: () => ({ x: cx - 5.6, z: -4.6 }) }); }
      const ctr = mkCounter(6.6); ctr.position.set(cx - 1.4, 0, -7.15); world.add(ctr);
      // холодильник: дверцы открываются
      const fr = mkFridge(); fr.position.set(cx + 5.1, 0, -6.95); world.add(fr); let frOpen = false;
      fun(fr, 'kuh', [2.6, 5.0, 2.2, 0, 2.5, 0.2], () => { frOpen = !frOpen; SFX.whoosh(); fr.userData.doors.forEach((d, i) => tw(d.rotation, { y: frOpen ? -1.9 : 0 }, 420, 'inout', i * 90)); if (frOpen) { SFX.twinkle(); } else wait(430).then(() => SFX.thunk()); }, { stand: () => ({ x: cx + 5.4, z: -2.6 }) });
      obst('kuh', cx - 1.0, -7.2, 7.0, 0.9, 0.6);
      const sh = grp(cx - 1.4, 4.6, -7.75); sh.add(rbox(M(WOOD, 0.6), 5.4, 0.16, 0.7, 0.05)); [[-2.0, '#f0352b'], [-1.2, '#ffd21f'], [1.3, '#2a6df4'], [2.1, '#35b24a']].forEach(([x, c]) => { sh.add(cyl(M(c, 0.4), 0.26, 0.26, 0.6, x, 0.4, 0, 14)); sh.add(cyl(M('#ffffff', 0.5), 0.28, 0.28, 0.1, x, 0.74, 0, 14)); }); const hj = mkMed(); hj.scale.setScalar(0.75); hj.position.set(0.1, 0.42, 0); sh.add(hj); world.add(sh);
      const w1 = mkWindow('#ffd54f'); w1.position.set(cx, 4.3, HS - 0.02); w1.rotation.y = Math.PI; world.add(w1);
      const w2 = mkWindow('#ffd54f'); w2.position.set(cx - HS + 0.02, 5.0, 1.2); w2.rotation.y = Math.PI / 2; w2.scale.set(1.2, 0.62, 1); world.add(w2);
      const rug = mkRug(3.6, '#ffd98a', '#fff7e0'); rug.position.set(cx + 1.0, 0, 1.0); world.add(rug);
      const tb = grp(cx + 0.5, 0, 6.6); tb.add(rbox(M(WOOD, 0.55), 3.2, 0.2, 1.5, 0.07, 0, 1.6, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb.add(cyl(M(WOOD, 0.6), 0.11, 0.09, 1.5, sx * 1.35, 0.75, sz * 0.55, 8)); const pl = mkPlant(); pl.scale.setScalar(0.55); pl.position.set(0.9, 1.7, 0); tb.add(pl); const tp = mkTarelka(); tp.scale.setScalar(0.42); tp.position.set(-0.6, 1.76, 0); tb.add(tp); world.add(tb); obst('kuh', cx + 0.5, 6.6, 1.6, 0.75, 0.6);
      { const ap = mkYabloko(); ap.scale.setScalar(1.3); ap.position.set(cx - 0.1, 2.16, 6.6); world.add(ap); const it = toy(ap, 'kuh', 0.85, 0.3, 0.2); ap.userData.fp.stand = () => ({ x: cx - 0.1, z: 4.4 }); }
      TICK.push(t => { if (stove.userData.pot.children[1].position.y < 0.7) stove.userData.pot.children[1].position.y = 0.63 + Math.max(0, Math.sin(t * 7)) * 0.03; });

      const FOODS = { mishka: ['med', mkMed, 1.35, 0.35], ezhik: ['yabloko', mkYabloko, 1.5, 0.3], koshka: ['moloko', mkMiska, 1.1, 0.3], sobaka: ['kost', mkKost, 1.25, 0.35] };
      const SC = { mishka: 1.1, ezhik: 1.3, koshka: 1.3, sobaka: 1.25 }, MK = { mishka: mkMishka, ezhik: mkEzhik, koshka: () => mkZver('koshka'), sobaka: () => mkZver('sobaka') };
      const n = [3, 4, 4][lvl], set = shuffle(Object.keys(FOODS)).slice(0, n);
      const g = G.kuh = { intro: 'eda_intro', left: 3, an: [] };
      const ax = cx - 5.7, z0 = n === 4 ? 5.0 : 4.4, dz = n === 4 ? 2.95 : 3.6;
      set.forEach((who, i) => {
        const a = actor(MK[who]()), s = SC[who], U = a.userData, z = z0 - i * dz;
        const cu = mkCushion(['#ff8fb1', '#81c784', '#64b5f6', '#ffb74d'][i]); cu.position.set(ax, 0, z); world.add(cu);
        U.who = who; U.cy = U.h * 0.5 * s; a.position.set(ax, 0.2, z); a.rotation.y = Math.PI / 2; a.scale.setScalar(s);
        hitBox(a, 2.6 / s, 3.4 / s, 2.6 / s, 0, 1.6 / s, 0); world.add(a); g.an.push(a);
        obst('kuh', ax, z, 0.9, 0.9, 0.7);
        inter(a, { room: 'kuh', fh: U.h * s + 0.9, stand: () => ({ x: ax + 4.7, z }), look: () => V(ax, U.h * 0.55 * s, z), act: () => { if (g.tapAn) g.tapAn(a); else { hop(a, 0.4); SFX.boing(); } } });
      });
      const tray = mkTarelka(); tray.scale.setScalar(0.62); tray.position.set(cx - 1.4, 2.12, -6.95); world.add(tray);
      const trayPos = V(cx - 1.4, 2.62, -6.95);
      g.start = () => {
        const who = bag(g, 'w', set), [name, mk, fs, hy] = FOODS[who], q = 'kto_lubit_' + name; g.wrong = 0;
        const food = mk(); food.position.copy(trayPos); food.userData.cy = 0; hitBox(food, 1.4, 1.4, 1.4); world.add(food); popIn(food, fs, 100);
        food.userData.float = true;
        const it = { obj: food, hs: fs * 0.62, hy, fy: 0.5, lookAfter: V(ax, 1.6, z0 - (n - 1) * dz / 2), home: { p: trayPos.clone(), r: new T.Euler(), s: fs }, onBack: () => { food.userData.float = true; mark(food, 0.95); }, onDrop: p => { food.userData.fp.stand = near(food, 3.0); food.userData.fp.room = roomOf(p.x, p.z); } };
        mark(food, 0.95);
        inter(food, { room: 'kuh', fh: 1.4, stand: () => ({ x: trayPos.x, z: -4.2 }), look: () => wpos(food), act: () => { take(it); say(q); } });
        const fl = t => { if (food.userData.float && food.parent === world) { food.position.y = trayPos.y + Math.sin(t * 2) * 0.1; food.rotation.y = t * 0.8; } }; TICK.push(fl);
        const ta = g.an.find(a => a.userData.who === who);
        g.tapAn = async a => {
          if (g.busy) return;
          const U = a.userData;
          if (st.held !== it) { hop(a, 0.35); say(q); if (food.parent === world) nudge(food); return; }
          if (U.who !== who) { const hint = miss(g); headNo(a); wobble(a, 0.07); if (hint) mark(ta, ta.userData.h * ta.scale.x + 0.7, 0.4); say(['ne_to', hint ? 'podskazka' : q]); return; }
          g.busy = true; g.an.forEach(unmark); g.q = null; Idle.off();
          const s = a.scale.x, mp = V(a.position.x + 1.0 * s, U.h * 0.5 * s, a.position.z);
          release(it, fs * 0.8); TICK.splice(TICK.indexOf(fl), 1); uninter(food);
          await arc(food, mp, 420, 0.8);
          for (let i = 0; i < 2; i++) { SFX.munch(); squash(a, 240); tws(food, fs * (0.5 - i * 0.4), 200); await wait(230); }
          world.remove(food); happy(a, false); burst(mp.clone().add(V(0.6, 0.6, 0)), 14); SFX.good();
          g.left--; g.busy = false;
          await Voice.say('nyam', a); if (!alive()) return;
          if (g.left <= 0) { g.tapAn = null; roomDone('kuh', mp); return; }
          await say(praise()); if (alive()) g.start();
        };
        setQ('kuh', [q], () => { if (st.held !== it && food.parent === world) nudge(food); });
      };
      startBtn('kuh', cx + 5.2, 3.4);
    }

    // =========== СПАЛЬНЯ (второй этаж): мишки и кроватки ===========
    {
      const cx = RM.spal.cx, Y = SH, up = grp(0, Y, 0); world.add(up);
      // шкаф: дверцы открываются, внутри одежда и уточка
      const wr = grp(cx - 3.6, 0, -7.1); up.add(wr); obst('spal', cx - 3.6, -7.1, 1.9, 0.8, 0.6);
      { const bl = M('#bfe3f7', 0.7); wr.add(rbox(bl, 3.8, 5.6, 0.14, 0.05, 0, 2.8, -0.73)); for (const s of [-1, 1]) wr.add(rbox(bl, 0.14, 5.6, 1.6, 0.05, s * 1.83, 2.8, 0)); wr.add(rbox(bl, 3.8, 0.14, 1.6, 0.05, 0, 5.53, 0)); wr.add(rbox(bl, 3.8, 0.14, 1.6, 0.05, 0, 0.07, 0));
        const bk = new T.Mesh(new T.PlaneGeometry(3.5, 5.3), new T.MeshBasicMaterial({ color: C('#8fb6cf') })); bk.position.set(0, 2.8, -0.64); wr.add(bk);
        const rod = cyl(M(WOOD, 0.5), 0.05, 0.05, 3.5, 0, 4.7, 0, 6); rod.rotation.z = Math.PI / 2; wr.add(rod);
        ['#ff6fae', '#ffd21f', '#35b24a', '#b25de0'].forEach((c, i) => wr.add(rbox(M(c, 0.9), 0.62, 2.0, 0.9, 0.12, -1.2 + i * 0.8, 3.55, 0)));
        const dk = actor(mkZver('utka')); dk.scale.setScalar(0.7); dk.position.set(0.3, 0.15, 0.1); wr.add(dk);
        const doors = [-1, 1].map(s => { const d = grp(s * 1.9, 2.8, 0.8); d.add(rbox(M('#e3f4ff', 0.7), 1.86, 5.4, 0.12, 0.1, -s * 0.95, 0, 0)); d.add(ball(M('#ffd54f', 0.3), 0.12, -s * 1.65, 0, 0.12)); wr.add(d); return d; });
        let open = false;
        fun(wr, 'spal', [3.9, 5.6, 2.0, 0, 2.8, 0.2], () => { open = !open; SFX.whoosh(); doors.forEach((d, i) => tw(d.rotation, { y: open ? (i ? 1.9 : -1.9) : 0 }, 420, 'inout')); if (open) wait(450).then(() => { if (alive() && open) { hop(dk, 0.4); Voice.say('kuku', null); } }); else wait(430).then(() => SFX.thunk()); }, { stand: () => ({ x: cx - 3.6, z: -3.0 }) }); }
      const w1 = mkWindow('#9fa8da'); w1.position.set(cx - 1.0, 4.3, HS - 0.02); w1.rotation.y = Math.PI; up.add(w1);
      const rug = mkRug(4.0, '#b9c6ff', '#f4f1ff'); rug.position.set(cx - 2.2, 0, 0); up.add(rug);
      const pc = mkPicture(2, '#ffd54f'); pc.position.set(cx + 2.6, 4.6, -HS + 0.1); up.add(pc);
      const bulbs = []; for (let i = 0; i < 9; i++) { const b = ball(new T.MeshBasicMaterial({ color: C(['#ffd54f', '#ff8fb1', '#81d4fa'][i % 3]) }), 0.16, cx + HS - 0.2, 5.6 - Math.sin(i / 8 * Math.PI) * 0.5, -6 + i * 1.5, true); b.castShadow = false; up.add(b); bulbs.push(b); }
      let garl = true; TICK.push(t => bulbs.forEach((b, i) => b.scale.setScalar(garl ? 0.16 * (1 + Math.sin(t * 3 + i * 1.3) * 0.25) : 0.08)));
      // ночник: выключает и включает свет
      const nl = mkFloorLamp(); nl.scale.setScalar(0.8); nl.position.set(cx - 6.9, 0, -6.6); up.add(nl); obst('spal', cx - 6.9, -6.6, 0.4, 0.4, 0.4); nl.userData.shade.emissiveIntensity = 0.9; let dark = false;
      fun(nl, 'spal', [1.8, 4.6, 1.8], () => { dark = !dark; tone(dark ? 700 : 1200, 0, 0.06, 'square', 0.05); tw(hemi, { intensity: dark ? 0.42 : 0.8 }, 400); tw(sun, { intensity: dark ? 0.12 : 0.4 }, 400); hemi.color.copy(C(dark ? '#aab8ff' : '#ffffff')); garl = true; if (dark) SFX.twinkle(); });
      const chest = grp(cx - 6.2, 0, 6.4); chest.add(rbox(M('#ff8a65', 0.7), 2.4, 1.3, 1.6, 0.14, 0, 0.65, 0)); const lidc = grp(0, 1.3, -0.8); lidc.add(rbox(M('#ffd54f', 0.5), 2.5, 0.25, 1.7, 0.1, 0, 0.1, 0.85)); chest.add(lidc); up.add(chest); obst('spal', cx - 6.2, 6.4, 1.2, 0.8, 0.5);
      { let op = false; fun(chest, 'spal', [2.6, 1.8, 1.8], () => { op = !op; SFX.whoosh(); tw(lidc.rotation, { x: op ? -1.3 : 0 }, 350, 'inout'); if (op) burst(V(cx - 6.2, Y + 1.8, 6.4), 10); }, { stand: () => ({ x: cx - 6.2, z: 3.6 }) }); }
      { const t = mkToy('zvezda'); t.position.set(cx - 5.6, Y + 0.6, -1.6); world.add(t); toy(t, 'spal', 0.6, 0.6, 0.1); }

      const sizes = lvl < 1 ? ['bolshoy', 'malenky'] : ['bolshoy', 'sredniy', 'malenky'];
      const BS = lvl < 2 ? { bolshoy: 1.5, sredniy: 1.13, malenky: 0.8 } : { bolshoy: 1.38, sredniy: 1.14, malenky: 0.93 };
      const k = sizes.length === 3 ? 0.9 : 1.0, gap = 0.75, order = shuffle(sizes);
      const lens = order.map(s => 3.3 * BS[s] * k), total = lens.reduce((a, b) => a + b, 0) + gap * (order.length - 1);
      const g = G.spal = { intro: 'mishki_intro', left: sizes.length, beds: [], bears: [] };
      const bx = cx + HS - 1.9; let z = -total / 2;
      order.forEach((sz, i) => {
        const b = mkKrovatka(), s = BS[sz] * k, U = b.userData; U.s = sz; U.sc = s; U.cy = 0.9 * s;
        b.position.set(bx, Y, z + lens[i] / 2); z += lens[i] + gap; b.rotation.y = -Math.PI / 2; b.scale.setScalar(s);
        hitBox(b, 3.4, 2.4, 2.2, 0, 1.1, 0); world.add(b); g.beds.push(b);
        inter(b, { room: 'spal', fh: 2.4 * s + 0.6, stand: () => ({ x: bx - 4.6, z: b.position.z }), look: () => V(bx, Y + 1.0, b.position.z), act: () => g.tapBed(b) });
      });
      obst('spal', bx, 0, 1.3, 7.5, 0.6);
      const BP = sizes.length === 3 ? [[cx - 3.0, -3.7], [cx - 3.0, 3.7], [cx - 0.2, 0]] : [[cx - 2.4, -3.2], [cx - 2.4, 3.2]];
      shuffle(sizes).forEach((sz, i) => {
        const bear = actor(mkMishka()), bs = BS[sz] * k * 0.8, U = bear.userData; U.s = sz; U.bs = bs; U.cy = 1.4 * bs;
        bear.position.set(BP[i][0], Y, BP[i][1]); bear.rotation.y = -Math.PI / 2; bear.scale.setScalar(bs);
        hitBox(bear, 2.3, 3.2, 2.0, 0, 1.5, 0); world.add(bear); g.bears.push(bear);
        const ob = obst('spal', BP[i][0], BP[i][1], 0.5 * bs, 0.5 * bs, 0.6);
        const it = U.it = { obj: bear, fy: 0, lookAfter: V(bx, Y + 1.2, 0), hs: 0.36 * BS[sz], hy: -1.2 * 0.36 * BS[sz], onTake: () => { ob.off = true; U.noBreath = false; }, onBack: () => { ob.off = false; }, onDrop: p => { ob.off = true; bear.userData.fp.room = roomOf(p.x, p.z); } };
        inter(bear, { room: 'spal', fh: 3.2 * bs + 0.5, stand: near(bear, 3.4), look: () => { const p = wpos(bear); p.y += 1.4 * bs; return p; }, act: () => { if (g.busy) return; take(it); g.cur = bear; g.wrong = 0; g.bears.forEach(unmark); if (!g.started || g.done) return; g.q = ['mishka_' + sz]; say(g.q); Idle.set(() => { if (st.room === 'spal') say(g.q); }); } });
      });
      const ask = () => { const b = g.bears.find(x => !x.userData.inBed && x.parent === world) || g.bears.find(x => !x.userData.inBed); if (!b) return; if (st.held && st.held === b.userData.it) { g.q = ['mishka_' + b.userData.s]; if (st.room === 'spal') say(g.q); return; } setQ('spal', ['mishka_' + b.userData.s], () => { if (b.parent === world) nudge(b); }); if (b.parent === world) mark(b, 3.5, 0.4); };
      g.start = ask;
      g.tapBed = async b => {
        if (g.busy) return;
        const U = b.userData, bear = g.cur, it = bear && bear.userData.it;
        if (!bear || st.held !== it) { wobble(b, 0.05); if (g.started && g.q) say(g.q); return; }
        const sz = bear.userData.s;
        if (U.bear) { wobble(b, 0.05); return; }
        if (U.s !== sz) {
          const hint = miss(g); wobble(b, 0.06); const tb = g.beds.find(x => x.userData.s === sz);
          if (hint && tb && g.started) mark(tb, 2.6, 0.4);
          say(g.started ? [BS[sz] > BS[U.s] ? 'tesno' : 'veliko', hint ? 'podskazka' : null, 'mishka_' + sz] : [BS[sz] > BS[U.s] ? 'tesno' : 'veliko']); return;
        }
        g.busy = true; g.beds.forEach(unmark); g.q = null; Idle.off();
        const s = U.sc, bs = bear.userData.bs, dst = V(b.position.x - 0.05, Y + 0.8 * s + 0.56 * bs, b.position.z + 0.72 * s);
        release(it, bs * 0.6); uninter(bear); tws(bear, bs, 500);
        bear.rotation.set(0, -Math.PI / 2 + angd(st.yaw + Math.PI, -Math.PI / 2), 0); tw(bear.rotation, { z: Math.PI / 2, y: -Math.PI / 2 }, 520, 'inout');
        await arc(bear, dst, 580, 1.2);
        SFX.thunk(); squash(b, 300);
        bear.userData.sleep = true; bear.userData.inBed = true; (bear.userData.limbs || []).forEach(l => { l.visible = false; });
        const bl = U.blanket; bl.visible = true; tws(bl, 1, 450, 'back'); U.bear = bear; g.cur = null;
        SFX.twinkle(); zzz(V(b.position.x - 0.6, Y + 1.9 * s, b.position.z - 1.0 * s));
        const pos = V(b.position.x - 1.2, Y + 1.8 * s, b.position.z); burst(pos, 14); SFX.good();
        g.left--; g.busy = false;
        await say('spokoynoy'); if (!alive()) return;
        if (g.left <= 0) { if (g.started) roomDone('spal', pos); else { g.started = true; roomDone('spal', pos); } return; }
        if (g.started) { await say(praise()); if (alive()) ask(); }
      };
      startBtn('spal', cx - 6.0, 2.6);
    }

    // =========== ИГРОВАЯ: мячики по ведёркам, конструктор, ксилофон ===========
    {
      const cz = RM.igr.cz;
      const sh = mkShelf(true); sh.position.set(HS - 0.75, 0, cz + 3.6); sh.rotation.y = -Math.PI / 2; world.add(sh); obst('igr', HS - 0.75, cz + 3.6, 0.7, 1.9, 0.5);
      const w1 = mkWindow('#81d4fa'); w1.position.set(-HS + 0.02, 4.3, cz - 1.0); w1.rotation.y = Math.PI / 2; world.add(w1);
      const rug = mkRug(4.4, '#ffe08a', '#ffffff'); rug.position.set(0, 0, cz + 0.8); world.add(rug);
      for (const [x, kind, c] of [[-5.2, 0, '#ff8fb1'], [5.2, 2, '#4fc3f7']]) { const pc = mkPicture(kind, c); pc.position.set(x, 4.9, cz - HS + 0.1); world.add(pc); }
      const py = grp(-6.8, 0, cz + 6.8); ['krasny', 'oranzhevy', 'zhelty', 'zeleny', 'siniy'].forEach((c, i) => { const r = mkKoltso(0.95 - i * 0.15, COLORS[c]); r.rotation.x = Math.PI / 2; r.position.y = 0.3 + i * 0.52; py.add(r); }); py.add(ball(M('#ff5d8a', 0.3), 0.3, 0, 3.0, 0)); world.add(py); obst('igr', -6.8, cz + 6.8, 0.6, 0.6, 0.5);
      fun(py, 'igr', [2.2, 3.4, 2.2], () => { wobble(py, 0.15); [0, 1, 2, 3, 4].forEach(i => tone(392 + i * 80, i * 0.07, 0.15, 'triangle', 0.1)); });
      // ксилофон: каждая пластинка звучит
      const ks = mkKsilofon(6); ks.scale.setScalar(0.62); ks.rotation.y = Math.PI / 2; ks.position.set(-6.3, 1.25, cz + 2.4); world.add(ks);
      { const tbl = rbox(M(WOOD, 0.6), 2.4, 1.0, 5.6, 0.12, -6.3, 0.5, cz + 2.4); tbl.receiveShadow = true; world.add(tbl); obst('igr', -6.3, cz + 2.4, 1.2, 2.8, 0.5); }
      ks.userData.bars.forEach((b, i) => { hitBox(b, 1.3, 1.2, b.userData.len, 0, 0.3, 0); b.userData.cy = 0.2; inter(b, { room: 'igr', fh: 1.3, noFocus: i !== 2, stand: () => ({ x: -3.6, z: cz + 2.4 }), look: () => wpos(ks), act: () => { nota(i); const m = b.userData.mat; m.emissiveIntensity = 0.9; tw(m, { emissiveIntensity: 0 }, 400); tw(b.position, { y: -0.12 }, 60).then(() => tw(b.position, { y: 0 }, 160, 'back')); } }); });
      { const t = mkToy('utka'); t.position.set(2.6, 0.75, cz + 5.6); world.add(t); toy(t, 'igr', 0.62, 0.75, -0.2); const t2 = mkToy('serdce'); t2.position.set(-2.4, 0.6, cz + 5.9); world.add(t2); toy(t2, 'igr', 0.6, 0.6, 0.1); }

      // гора конструктора: нажмёшь — приблизится, и можно строить башню
      {
        const mx = 6.2, mz = cz - 1.6, mat = rbox(M('#c5e1a5', 0.9), 3.2, 0.12, 3.2, 0.06, mx, 0.06, mz); mat.castShadow = false; mat.receiveShadow = true; world.add(mat);
        obst('igr', mx + 0.4, mz, 1.5, 2.6, 0.5);
        const pile = [[-0.7, 0.5, -2.3, 0.3], [0.5, 0.5, -2.6, 1.0], [-0.2, 0.35, 2.4, 0.5], [0.9, 0.55, 2.2, 0.2], [0.0, 1.5, -2.45, 0.7], [-0.9, 0.35, 3.0, 1.2], [1.0, 0.55, -3.3, 0.4], [0.4, 1.3, 2.35, 0.6]];
        const blocks = BLOCKS.map(([kind, col, h], i) => { const b = grp(mx + pile[i][0], pile[i][1], mz + pile[i][2]); const m = mkBlock(kind, col); m.receiveShadow = true; b.add(m); b.rotation.y = pile[i][3]; b.userData.h = h; b.userData.home = { p: b.position.clone(), r: pile[i][3] }; b.userData.cy = 0; hitBox(b, 1.5, 1.4, 1.5); world.add(b); return b; });
        let top = 0.12, placed = 0, busy = false;
        const reset = async () => { busy = true; await wait(1600); if (!alive()) return; SFX.thunk(); noise(0, 0.3, 0.2, 600); blocks.forEach((b, i) => { const h = b.userData.home; arc(b, h.p, 520 + i * 40, 1.6); tw(b.rotation, { y: h.r, x: 0, z: 0 }, 500); b.userData.used = false; }); top = 0.12; placed = 0; await wait(900); busy = false; };
        const place = b => {
          if (busy || b.userData.used) return; b.userData.used = true; const h = b.userData.h, dst = V(mx + rr(-0.06, 0.06), top + h / 2, mz + rr(-0.06, 0.06)); top += h; placed++;
          tw(b.rotation, { y: rr(-0.15, 0.15) }, 300); arc(b, dst, 380, 1.2).then(() => { SFX.thunk(); tone(392 + placed * 60, 0, 0.18, 'triangle', 0.12); burst(dst.clone().add(V(0, 0.4, 0)), 5); });
          if (placed === blocks.length) wait(500).then(() => { if (!alive()) return; SFX.fanfare(); burst(V(mx, top + 0.6, mz), 24); say(praise()); reset(); });
        };
        const enter = () => {
          if (st.build) return; st.path = []; SFX.whoosh();
          st.build = { pos: V(mx - 7.4, 5.0, mz), look: V(mx + 0.3, 2.6, mz), exit: () => { st.build = null; $('fpUse').classList.remove('back'); st.yaw = -Math.PI / 2; st.pitch = -0.25; SFX.whoosh(); } };
          $('fpUse').classList.add('back');
        };
        blocks.forEach(b => inter(b, { room: 'igr', far: true, build: true, fh: 1.4, noFocus: true, look: () => wpos(b), act: () => { if (!st.build) enter(); else place(b); } }));
        const hb = grp(mx, 1.0, mz); world.add(hb); fun(hb, 'igr', [3.4, 2.4, 6.6, 0, 0.2, 0], () => enter(), { fh: 2.6, far: true });
      }

      const n = [3, 4, 5][lvl], cols = shuffle(Object.keys(COLORS)).slice(0, n);
      const g = G.igr = { intro: 'vedra_intro', left: n, buckets: [], balls: [] };
      const bz = cz - HS + 1.6, sp = n === 5 ? 2.5 : 3.0, bsc = n === 5 ? 1.15 : 1.35, x0 = -1.6;
      cols.forEach((c, i) => {
        const b = mkVedro2(COLORS[c]), x = x0 + (i - (n - 1) / 2) * sp; b.position.set(x, 0, bz); b.scale.setScalar(bsc); b.userData.c = c; b.userData.cy = 0.75 * bsc;
        hitBox(b, 2.1, 2.2, 2.1, 0, 0.8, 0); world.add(b); g.buckets.push(b);
        inter(b, { room: 'igr', fh: 2.6 * bsc, stand: () => ({ x, z: bz + 4.8 }), look: () => V(x, 0.9, bz), act: () => g.tapBucket(b) });
      });
      obst('igr', 0, bz, 7.6, 1.0, 0.7);
      const BP = [[-4.4, cz + 4.6], [4.6, cz + 5.6], [-3.6, cz - 1.6], [2.4, cz + 1.6], [0.2, cz + 3.6]];
      shuffle(cols).forEach((c, i) => {
        const ballO = mkMyach(COLORS[c]), U = ballO.userData; U.c = c; U.cy = 0;
        ballO.position.set(BP[i][0], 0.72, BP[i][1]); ballO.scale.setScalar(1.2); hitBox(ballO, 1.7, 1.7, 1.7); world.add(ballO); g.balls.push(ballO);
        const it = U.it = { obj: ballO, hs: 0.78, hy: 0.1, fy: 0.72, lookAfter: V(x0, 1.0, bz), onDrop: p => { ballO.userData.fp.room = roomOf(p.x, p.z); } };
        inter(ballO, { room: 'igr', fh: 1.5, stand: near(ballO, 3.0), look: () => wpos(ballO), act: () => { if (g.busy) return; take(it); g.cur = ballO; g.wrong = 0; g.buckets.forEach(unmark); g.balls.forEach(unmark); if (!g.started || g.done) return; g.q = ['eto_' + c, 'v_vedro']; say(g.q); Idle.set(() => { if (st.room === 'igr') say(g.q); }); } });
      });
      const ask = () => { const b = g.balls.find(x => !x.userData.done); if (!b) return; if (st.held && g.balls.some(x => x.userData.it === st.held)) { g.q = ['v_vedro']; return; } setQ('igr', ['v_vedro'], () => { const f = g.balls.find(x => !x.userData.done && x.parent === world); f && nudge(f); }); };
      g.start = ask;
      g.tapBucket = async b => {
        if (g.busy) return;
        const ballO = g.cur, it = ballO && ballO.userData.it, c = b.userData.c;
        if (!ballO || st.held !== it) { wobble(b, 0.06); say(g.started && g.q ? g.q : 'eto_' + c); return; }
        if (ballO.userData.c !== c) { const hint = miss(g); wobble(b, 0.08); const tb = g.buckets.find(x => x.userData.c === ballO.userData.c); if (hint && tb) mark(tb, 2.1, 0.4); say(['vedro_ne', hint ? 'podskazka' : null]); return; }
        g.busy = true; g.buckets.forEach(unmark); g.q = null; Idle.off();
        release(it, 1.0); uninter(ballO); ballO.userData.done = true;
        const top = V(b.position.x, 1.3 * bsc + 1.2, b.position.z);
        await arc(ballO, top, 420, 1.0);
        await tw(ballO.position, { y: 0.62 * bsc }, 220, 'in');
        SFX.thunk(); squash(b, 260); burst(top, 14, [COLORS[c], '#ffffff', '#ffd54f']); SFX.good();
        g.left--; g.busy = false; g.cur = null;
        if (g.left <= 0) { g.started = true; await say('eto_' + c); if (alive()) roomDone('igr', top); return; }
        await say(g.started ? ['eto_' + c, praise()] : ['eto_' + c]); if (alive() && g.started) ask();
      };
      startBtn('igr', 3.4, cz + 6.4);
    }

    // ---------- каждый кадр ----------
    const tmpV = new T.Vector3();
    function camFn(dt) {
      if (st.build) { // режим конструктора: камера стоит над ковриком
        cam.position.lerp(st.build.pos, Math.min(1, dt * 5)); tmpV.copy(st.build.look); cam.lookAt(tmpV);
        if (Math.hypot(st.jx, st.jy) > 0.5) st.build.exit();
        focusM.visible = false; hands.visible = false;
        for (const f of TICK) f(time, dt); return;
      }
      if (st.held && !hands.visible) hands.visible = true;
      if (st.turn || st.turnLeft > 0) { const d = 2.1 * dt; st.yaw += st.turnDir * d; st.turnLeft -= d; }
      let moving = false;
      // джойстик и клавиши
      let jx = st.jx + ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0), jy = st.jy + ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0);
      const jl = Math.hypot(jx, jy);
      if (jl > 0.12) {
        st.path = []; st.arrive = null; st.lookEnd = null; st.look = null; st.walked = true;
        if (jl > 1) { jx /= jl; jy /= jl; }
        const sn = Math.sin(st.yaw), cs = Math.cos(st.yaw), sp = 7.2 * dt;
        const mxv = (jx * cs + jy * sn) * sp, mzv = (-jx * sn + jy * cs) * sp;
        let nx = st.x + mxv, nz = st.z + mzv;
        if (!inside(nx, nz)) { if (inside(nx, st.z)) nz = st.z; else if (inside(st.x, nz)) nx = st.x; else { nx = st.x; nz = st.z; } }
        const p = { x: nx, z: nz }; pushOut(p, roomOf(nx, nz)); if (inside(p.x, p.z)) { st.x = p.x; st.z = p.z; }
        moving = true;
      } else if (st.path.length) {
        st.t += dt;
        const q = st.path[0], dx = q.x - st.x, dz = q.z - st.z, d = Math.hypot(dx, dz), stepL = SPEED * dt;
        if (d <= stepL + 0.02) { st.x = q.x; st.z = q.z; st.path.shift(); if (!st.path.length) arrived(); }
        else {
          st.x += dx / d * stepL; st.z += dz / d * stepL; moving = true;
          const k = roomOf(st.x, st.z), p = { x: st.x, z: st.z };
          if (st.path.length === 1 && pushOut(p, k)) {
            const tx = -(p.z - st.z), tz = p.x - st.x, tl = Math.hypot(tx, tz) || 1, sg = (tx * dx + tz * dz) >= 0 ? 1 : -1;
            st.x = p.x + sg * tx / tl * stepL * 0.7; st.z = p.z + sg * tz / tl * stepL * 0.7;
          }
          if (!ptr || !ptr.moved) { const ty = Math.atan2(-dx, -dz); st.yaw += angd(ty, st.yaw) * Math.min(1, dt * 4.5); if (!st.userLook || performance.now() - st.userLook > 1500) st.pitch += (P0() - st.pitch) * Math.min(1, dt * 3); }
          if (st.t > st.maxT) arrived();
        }
      }
      if (st.look && !(ptr && ptr.moved)) {
        const dy = angd(st.look.yaw, st.yaw), dp = st.look.pitch - st.pitch, kk = Math.min(1, dt * 6);
        st.yaw += dy * kk; st.pitch += dp * kk; if (Math.abs(dy) < 0.01 && Math.abs(dp) < 0.01) st.look = null;
      }
      const rm = roomOf(st.x, st.z), R = RM[rm];
      if (rm !== st.room && Math.max(Math.abs(st.x - R.cx), Math.abs(st.z - R.cz)) < HS - 1.0) { st.room = rm; enterRoom(rm); }
      st.y += (floorY(st.x) - st.y) * Math.min(1, dt * 14);
      if (st.hopT) { st.hopT += dt; st.hopY = Math.abs(Math.sin(st.hopT * 7)) * 0.7 * Math.max(0, 1 - st.hopT / 0.9); if (st.hopT > 0.9) { st.hopT = 0; st.hopY = 0; } }
      st.bob += moving ? dt * 9 : 0;
      const by = moving ? Math.abs(Math.sin(st.bob)) * 0.12 : 0;
      cam.position.set(st.x, st.y + EYE + by + st.hopY + Math.sin(time * 1.6) * 0.02, st.z);
      cam.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
      if (hands.visible) { hands.rotation.z = moving ? Math.sin(st.bob) * 0.03 : 0; slot.rotation.y = Math.sin(time * 1.2) * 0.25; }
      for (const m of MARKS) { m.rotation.y = time * 3; m.position.y = m.userData.by + Math.sin(time * 4) * m.userData.amp; }
      // что сейчас под прицелом
      focus = findFocus();
      $('fpUse').classList.toggle('lit', !!focus);
      if (focus && !TAP) { const p = wpos(focus); focusM.visible = true; focusM.position.set(p.x, p.y + (focus.userData.fp.fh || 2.2) + Math.sin(time * 5) * 0.12, p.z); focusM.rotation.y = time * 2; } else focusM.visible = false;
      for (const f of TICK) f(time, dt);
    }
    current = { name: 'dom', fp: true, rebuild: () => setFov(), camFn, again: openDom, st, G, INTER, use, tap, BTN };
    camFn(0);
    wait(700).then(() => { if (alive()) say('dom_intro'); });
  }
  addEventListener('resize', () => { if (current && current.fp) current.rebuild(); checkRot(); });
  window.openDom = openDom;
  window.__Z && (window.__Z.openDom = openDom);
})();
