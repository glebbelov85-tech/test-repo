'use strict';
// «Домик изнутри» (версия 5.0): прогулка по дому от первого лица, управление как в «SCP: Побег».
// Слева джойстик — ходить. Пальцем по экрану — смотреть. Справа большая лапка — взять, открыть, включить.
// Прежнее управление (нажал на пол — пошёл) осталось: адрес с ?ctl=tap или S.ctl = 'tap'.
(() => {
  const EYE = 2.8, WH = 7.6, HS = 8, TH = 0.6, DW = 4.6, DH = 5.7, PAD = 1.2, SPEED = 8.5;
  const STEP = 2 * HS + TH;
  const SH = 8, SL = 14, CL = 6; // высота этажа, длина лестницы и коридора между комнатами
  const SIDES = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }, OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
  // дом как дерево: [комната, откуда вход, на какой стене той комнаты дверь, полуширина, 1 = лестница на этаж выше]
  // двери всегда посередине стены; комнаты разных этажей не накрывают друг друга
  const PLAN = [['kuh', 'hall', 'w', 8], ['igr', 'hall', 'n', 8], ['spal', 'hall', 'e', 8, 1], ['ris', 'kuh', 's', 8], ['zak', 'spal', 's', 14], ['zal', 'spal', 'n', 18],
    ['h3', 'spal', 'e', 8, 1], ['poch', 'h3', 's', 7], ['azb', 'h3', 'n', 13], ['h4', 'h3', 'e', 9, 1], ['logic', 'h4', 's', 7], ['lish', 'h4', 'e', 7]];
  const RM = { hall: { cx: 0, cz: 0, y: 0, hs: 8, fl: 1 } }, DOOR = {}, KIDS = { hall: [] };
  for (const [k, p, sd, hs, up] of PLAN) {
    const P = RM[p], [dx, dz] = SIDES[sd], gap = up ? SL + 2 * TH : CL + 2 * TH, at = o => ({ x: P.cx + dx * o, z: P.cz + dz * o });
    RM[k] = { cx: P.cx + dx * (P.hs + gap + hs), cz: P.cz + dz * (P.hs + gap + hs), y: P.y + (up ? SH : 0), hs, fl: P.fl + (up ? 1 : 0) }; KIDS[k] = []; KIDS[p].push(k);
    DOOR[k] = { p, sd, up: !!up, dx, dz, a: at(P.hs + TH / 2), b: at(P.hs + gap - TH / 2), out: at(P.hs - 1.5), in: at(P.hs + gap + 1.5) };
  }
  const RKEYS = Object.keys(RM), TASKS = RKEYS.filter(k => k !== 'ris'); // в комнате рисования задания нет
  const floorTasks = f => TASKS.filter(k => RM[k].fl === f);
  let RESUME = null; const GALLERY = []; // куда вернуться после рисования и рисунки для стены
  (S.gal || []).slice(-4).forEach(u => { try { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); GALLERY.push(c); }; im.src = u; } catch (e) {} });
  // точка у двери: inner = 1 — внутри комнаты, 0 — в комнате, откуда в неё входят
  const doorPt = (r, inner) => (inner ? DOOR[r].in : DOOR[r].out);
  const chainOf = r => (r === 'hall' ? [] : chainOf(DOOR[r].p).concat([r]));

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
  const hudStars = (n, tot) => { $('fpStars').innerHTML = [...Array(tot)].map((_, i) => `<i class="${i < n ? 'on' : ''}">${STAR_SVG(i < n)}</i>`).join(''); };
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
      x.fillStyle = o.pat; x.globalAlpha = 0.5;
      if (o.kind === 'stripes') { for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 20, 0, 24, h); }
      else if (o.kind === 'stars') { for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { const px = i * 64 + (j % 2 ? 48 : 16), py = j * 60 + 24, r = 9; x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; x.lineTo(px + Math.sin(a) * q, py - Math.cos(a) * q); } x.fill(); } }
      else { for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { x.beginPath(); x.arc(i * 64 + (j % 2 ? 48 : 16), j * 60 + 24, 8, 0, 7); x.fill(); } }
      x.globalAlpha = 1; const py = h * 0.72; // нижняя панель
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
  let _gardenC = null, _glowC = null, _patchC = null; const WINS = [];
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
    const cs = [];
    for (const s of [-1, 1]) { const pv = grp(s * 2.25, 2.1, 0.3); const c = rbox(M(curt, 0.95), 0.95, 4.1, 0.2, 0.09, 0, -2.05, 0); c.castShadow = false; pv.add(c); const tie = rbox(M('#ffffff', 0.9), 1.0, 0.16, 0.24, 0.05, 0, -2.8, 0); tie.castShadow = false; pv.add(tie); g.add(pv); cs.push(pv); }
    // мягкий свет: тёплое сияние у стекла и светлое пятно от окна на полу
    _glowC = _glowC || cnv(64, 64, (x, w, h) => { const r = x.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(255,244,200,.55)'); r.addColorStop(1, 'rgba(255,244,200,0)'); x.fillStyle = r; x.fillRect(0, 0, w, h); });
    _patchC = _patchC || cnv(128, 128, (x, w, h) => { for (const [a, b] of [[8, 8], [68, 8], [8, 66], [68, 66]]) { const r = x.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,236,170,.9)'); r.addColorStop(1, 'rgba(255,236,170,.2)'); x.fillStyle = r; x.filter = 'blur(4px)'; x.fillRect(a, b, 52, 54); } });
    const am = map => new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const gw = new T.Mesh(new T.PlaneGeometry(6.4, 5.8), am(_glowC)); gw.position.z = 0.5; gw.renderOrder = 3; g.add(gw);
    const pt = new T.Mesh(new T.PlaneGeometry(3.6, 4.2), am(_patchC)); pt.rotation.x = -Math.PI / 2; pt.position.set(0.5, -4.2, 2.9); pt.rotation.z = -0.12; pt.material.opacity = 0.8; pt.renderOrder = 2; g.add(pt);
    WINS.push({ g, cs, gw, pt, ph: WINS.length * 1.7 });
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
  const _num = {};
  function numTex(n, col, plain, got, nodots) { // большая цифра и столько же точек под ней (got: сколько уже закрашено)
    const k = n + col + (plain ? 'p' : '') + (got === undefined ? '' : 'g' + got) + (nodots ? 'n' : ''); if (_num[k]) return _num[k];
    const t = cnv(256, 256, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      if (!plain) { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill(); x.strokeStyle = col; x.lineWidth = 14; x.beginPath(); x.arc(128, 128, 113, 0, 7); x.stroke(); }
      x.font = '900 168px "Arial Rounded MT Bold","Nunito","Baloo 2","Trebuchet MS","Segoe UI",system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round'; x.lineWidth = 12; x.strokeStyle = col; x.fillStyle = col; x.strokeText(String(n), 128, nodots ? 132 : 108); x.fillText(String(n), 128, nodots ? 132 : 108);
      if (!nodots) for (let i = 0; i < n; i++) { x.beginPath(); x.arc(128 + (i - (n - 1) / 2) * 30, 208, 11, 0, 7); if (got === undefined || i < got) x.fill(); else { x.lineWidth = 5; x.stroke(); } }
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.repeat.set(1, 1); return _num[k] = t;
  }
  function mkButylka() {
    const g = grp(), wh = M('#ffffff', 0.35);
    g.add(cyl(wh, 0.3, 0.3, 0.75, 0, 0.4, 0, 20)); g.add(ball(wh, [0.3, 0.22, 0.3], 0, 0.78, 0)); g.add(cyl(wh, 0.15, 0.17, 0.3, 0, 1.02, 0, 16)); g.add(cyl(M('#2a8df4', 0.4), 0.18, 0.18, 0.14, 0, 1.2, 0, 16));
    g.add(cyl(M('#8fd3ff', 0.5), 0.305, 0.305, 0.3, 0, 0.42, 0, 20)); return g;
  }
  // ---------- буквы и предметы для третьего и четвёртого этажей ----------
  const rrect = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
  const FONT = '"Arial Rounded MT Bold","Nunito","Baloo 2","Trebuchet MS","Segoe UI",system-ui,sans-serif';
  const _lt = {};
  // буква на текстуре: bg — плашка, ring — её кант, out — обводка буквы, faint — бледная подсказка
  const FIGCH = { '●': 'krug', '■': 'kvadrat', '▲': 'treugolnik', '★': 'zvezda', '♥': 'serdce' };
  function figPath(x, f) {
    if (f === 'kvadrat') { rrect(x, 54, 60, 148, 148, 20); return; }
    x.beginPath();
    if (f === 'krug') x.arc(128, 134, 78, 0, 7);
    else if (f === 'treugolnik') { x.moveTo(128, 48); x.lineTo(214, 204); x.lineTo(42, 204); x.closePath(); }
    else if (f === 'zvezda') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 42 : 92; x.lineTo(128 + Math.cos(a) * r, 138 + Math.sin(a) * r); } x.closePath(); }
    else { x.moveTo(128, 214); x.bezierCurveTo(20, 140, 40, 40, 128, 92); x.bezierCurveTo(216, 40, 236, 140, 128, 214); x.closePath(); }
  }
  function letTex(ch, col, o = {}) {
    const k = [ch, col, o.bg, o.ring, o.out, o.faint].join('|'); if (_lt[k]) return _lt[k];
    const t = cnv(256, 256, (x, w, h) => {
      if (o.bg) { x.fillStyle = o.bg; rrect(x, 8, 8, 240, 240, 60); x.fill(); if (o.ring) { x.lineWidth = 12; x.strokeStyle = o.ring; rrect(x, 16, 16, 224, 224, 52); x.stroke(); } }
      if (!ch) return;
      if (FIGCH[ch]) { figPath(x, FIGCH[ch]); x.lineJoin = 'round'; if (o.out) { x.lineWidth = 22; x.strokeStyle = o.out; x.stroke(); } x.globalAlpha = o.faint ? 0.28 : 1; x.fillStyle = col; x.fill(); return; }
      x.font = '900 176px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      if (o.out) { x.lineWidth = 22; x.strokeStyle = o.out; x.strokeText(ch, 128, 140); }
      x.globalAlpha = o.faint ? 0.28 : 1; x.fillStyle = col; x.fillText(ch, 128, 140);
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.anisotropy = 4; return _lt[k] = t;
  }
  const letPlate = (ch, col, s, o) => { const m = new T.Mesh(new T.PlaneGeometry(s, s), new T.MeshBasicMaterial({ map: letTex(ch, col, o), transparent: true })); m.castShadow = false; m.renderOrder = 2; return m; };
  // буквы, которые Зайка называет вслух: озвучка b_<…>
  const LV = { 'А': 'a', 'Б': 'b', 'Д': 'd', 'З': 'z', 'И': 'i', 'К': 'k', 'М': 'm', 'О': 'o', 'Р': 'r', 'Т': 't', 'У': 'u', 'Ч': 'ch', 'Ш': 'sh', 'Ы': 'y', 'Ё': 'yo', 'Я': 'ya' };
  const bv = ch => (FIGCH[ch] ? 'naz_' + FIGCH[ch] : 'b_' + LV[ch]), nmv = ch => (FIGCH[ch] ? [bv(ch)] : ['eto_bukva', bv(ch)]);
  const LCOL = ['#f0352b', '#2a6df4', '#35b24a', '#ff8a1c', '#b25de0', '#ff4f9a', '#00a8b5', '#e0a800'];
  function mkArbuz() {
    const g = grp(), t = cnv(64, 32, (x, w, h) => { x.fillStyle = '#6cc64f'; x.fillRect(0, 0, w, h); x.fillStyle = '#2f7d32'; for (let i = 0; i < 8; i++) { x.beginPath(); x.ellipse(i * 8 + 4, h / 2, 2.4, h / 2 + 3, 0, 0, 7); x.fill(); } });
    const b = mesh(new T.SphereGeometry(1, 28, 18), new T.MeshStandardMaterial({ map: t, roughness: 0.35 })); b.scale.set(0.62, 0.54, 0.62); g.add(b);
    g.add(cyl(M('#6d4c41', 0.8), 0.04, 0.05, 0.18, 0, 0.6, 0, 6)); return g;
  }
  // кот: сидит на подоконнике, машет хвостом, моргает и водит ушами
  function mkKot(col = '#f6a04d') {
    const g = grp(), m = M(col, 0.8), w = M('#fff6e2', 0.8), dk = M('#22160f', 0.4);
    g.add(ball(m, [0.42, 0.5, 0.4], 0, 0.5, 0)); g.add(ball(w, [0.24, 0.3, 0.12], 0, 0.42, 0.32, true));
    const hd = grp(0, 1.12, 0.1); hd.add(ball(m, [0.38, 0.33, 0.33])); hd.add(ball(w, [0.17, 0.12, 0.1], 0, -0.1, 0.27, true)); hd.add(ball(M('#ff8fa3', 0.5), 0.045, 0, -0.04, 0.36, true));
    const ears = [], eyes = [];
    for (const s of [-1, 1]) { const e = mesh(new T.ConeGeometry(0.15, 0.26, 4), m, s * 0.23, 0.32, 0); e.rotation.z = -s * 0.25; hd.add(e); ears.push(e); const ey = ball(dk, [0.055, 0.075, 0.03], s * 0.15, 0.06, 0.3, true); hd.add(ey); eyes.push(ey);
      g.add(ball(w, [0.11, 0.09, 0.14], s * 0.2, 0.09, 0.34, true)); }
    g.add(hd);
    const tl = grp(0.3, 0.12, -0.2), segs = []; let p = tl; for (let i = 0; i < 5; i++) { const sg = grp(i ? 0.2 : 0, 0, 0); sg.add(ball(i === 4 ? w : m, [0.14, 0.085, 0.085], 0.1, 0, 0, true)); p.add(sg); segs.push(sg); p = sg; } g.add(tl);
    g.userData = { hd, ears, eyes, segs, purr: 0 };
    return g;
  }
  // аквариум на тумбе: вода, песок, водоросли, пузырьки и рыбки
  function mkAkv() {
    const g = grp();
    g.add(rbox(M(WOOD, 0.6), 3.4, 1.5, 1.3, 0.08, 0, 0.75, 0)); g.add(rbox(M('#ffe9c4', 0.8), 1.4, 1.0, 0.08, 0.05, -0.8, 0.75, 0.66)); g.add(rbox(M('#ffe9c4', 0.8), 1.4, 1.0, 0.08, 0.05, 0.8, 0.75, 0.66));
    g.add(rbox(M('#5d6d7e', 0.5), 3.1, 0.14, 1.1, 0.04, 0, 1.57, 0)); g.add(rbox(M('#5d6d7e', 0.5), 3.1, 0.14, 1.1, 0.04, 0, 3.4, 0));
    const bk = new T.Mesh(new T.PlaneGeometry(2.95, 1.75), new T.MeshBasicMaterial({ map: cnv(128, 76, (x, w, h) => { const r = x.createLinearGradient(0, 0, 0, h); r.addColorStop(0, '#8fe0ff'); r.addColorStop(1, '#2f9ad6'); x.fillStyle = r; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(10 + i * 26, 0); x.lineTo(24 + i * 26, 0); x.lineTo(i * 26, h); x.lineTo(-10 + i * 26, h); x.fill(); } }) })); bk.position.set(0, 2.48, -0.5); g.add(bk);
    const sand = rbox(M('#ffe2a0', 0.9), 2.95, 0.2, 1.0, 0.05, 0, 1.72, 0); sand.castShadow = false; g.add(sand);
    for (const [x, c, r] of [[-1.1, '#b0bec5', 0.2], [-0.8, '#90a4ae', 0.14], [1.15, '#b0bec5', 0.17]]) g.add(ball(M(c, 0.8), [r, r * 0.7, r], x, 1.86, 0.1, true));
    const weeds = []; for (const [x, hgt, c] of [[-1.15, 1.0, '#35b24a'], [-0.95, 0.7, '#66c45c'], [0.9, 1.15, '#35b24a'], [1.1, 0.8, '#4fae4d'], [0.2, 0.5, '#66c45c']]) { const pv = grp(x, 1.8, -0.2); const wd = rbox(M(c, 0.8), 0.1, hgt, 0.05, 0.02, 0, hgt / 2, 0); wd.castShadow = false; pv.add(wd); g.add(pv); weeds.push(pv); }
    const fish = []; [['#ff8a1c', 0.42], ['#ff6fae', 0.34], ['#ffd21f', 0.3], ['#b25de0', 0.26]].forEach(([c, s], i) => { const f = mkRybka(c); f.scale.setScalar(s); f.traverse(o => { o.castShadow = false; }); g.add(f); fish.push({ f, y: 2.2 + i * 0.28, ph: i * 1.9, sp: 0.5 + i * 0.13, d: -0.15 + i * 0.12, fast: 0 }); });
    const bub = []; for (let i = 0; i < 7; i++) { const b = ball(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 0.045 + (i % 3) * 0.015, 0, 0, 0, true); g.add(b); bub.push({ b, x: i < 4 ? -0.5 : 0.75, ph: i * 0.37, sp: 0.35 + (i % 3) * 0.08 }); }
    const gl = new T.Mesh(new T.BoxGeometry(3.0, 1.75, 1.02), new T.MeshStandardMaterial({ color: 0x9be3ff, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false })); gl.position.set(0, 2.48, 0); gl.renderOrder = 4; g.add(gl);
    g.userData = { fish, bub, weeds };
    return g;
  }
  function mkRybka(col = '#ff8a1c') {
    const g = grp(), m = M(col, 0.35);
    g.add(ball(m, [0.55, 0.36, 0.25]));
    const tl = mesh(new T.ConeGeometry(0.32, 0.44, 3), m, -0.66, 0, 0); tl.rotation.z = -Math.PI / 2; tl.scale.z = 0.35; g.add(tl);
    const fin = mesh(new T.ConeGeometry(0.17, 0.3, 3), M('#ffd21f', 0.4), 0.02, 0.36, 0); fin.scale.z = 0.3; g.add(fin);
    for (const s of [-1, 1]) { g.add(ball(M('#ffffff', 0.3), 0.085, 0.33, 0.08, s * 0.17, true)); g.add(ball(M('#22160f', 0.3), 0.048, 0.37, 0.08, s * 0.21, true)); }
    g.add(ball(M('#ff5d8a', 0.4), [0.05, 0.03, 0.08], 0.52, -0.06, 0, true));
    return g;
  }
  function mkKubik() {
    const g = grp(); g.add(rbox(M('#4fc3f7', 0.4), 0.9, 0.9, 0.9, 0.2));
    for (const [c, x, y, z, sx, sy, sz] of [['#ffd21f', 0, 0, 0.45, 0.22, 0.22, 0.04], ['#ff6fae', 0, 0.45, 0, 0.22, 0.04, 0.22], ['#35b24a', 0.45, 0, 0, 0.04, 0.22, 0.22], ['#f0352b', -0.45, 0, 0, 0.04, 0.22, 0.22], ['#ffffff', 0, 0, -0.45, 0.22, 0.22, 0.04]]) g.add(ball(M(c, 0.4), [sx, sy, sz], x, y, z, true));
    return g;
  }
  function mkDomik() {
    const g = grp(); g.add(rbox(M('#ffe0b2', 0.6), 1.0, 0.8, 0.9, 0.1, 0, 0.4, 0));
    const rg = grp(0, 1.15, 0); rg.rotation.y = Math.PI / 2; const rf = mesh(new T.CylinderGeometry(0.72, 0.72, 1.1, 3), M('#f0655a', 0.5)); rf.rotation.x = -Math.PI / 2; rg.add(rf); g.add(rg);
    g.add(rbox(M('#8d5a3c', 0.6), 0.28, 0.44, 0.06, 0.06, -0.15, 0.22, 0.46)); g.add(ball(M('#8fd3ff', 0.2), [0.13, 0.13, 0.03], 0.25, 0.48, 0.46, true));
    g.add(rbox(M('#c0675a', 0.6), 0.16, 0.34, 0.16, 0.04, 0.28, 1.35, 0.1));
    return g;
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
    // возраст (lvl: 0 — 3–4 года, 1 — 4–5, 2 — 5–7) и скрытые ступеньки внутри возраста: у каждой комнаты своя
    const STL = ((S.st = S.st || {})[lvl] = S.st[lvl] || {}), ERR = (S.err = S.err || {});
    const stp = k => (window.__step !== undefined ? window.__step : Math.min(2, (STL[k] || {}).s || 0));
    const P3 = (k, t) => t[lvl][stp(k)];
    // что путает ребёнок, то встречается чаще
    const bad = id => { ERR[id] = Math.min(4, (ERR[id] || 0) + 1); }, okk = id => { if (ERR[id] && --ERR[id] <= 0) delete ERR[id]; };
    const wsel = (pool, n, pre) => shuffle(shuffle(pool).sort((a, b) => (ERR[pre + b] || 0) - (ERR[pre + a] || 0)).slice(0, n));
    const wpick = (arr, f) => { const w = arr.map(a => 1 + 2 * (ERR[f(a)] || 0)); let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
    const TAP = S.ctl === 'tap' || /[?&]ctl=tap/.test(location.search); // прежнее управление: нажал на пол — пошёл
    hud.classList.add('on'); hud.classList.toggle('tap', TAP); checkRot(); goLandscape();
    scene.background = new T.Color(C('#fdf3dc'));
    Voice.preload(PRAISE.concat(['podskazka', 'final', 'esche', 'kraski_intro', 'eda_intro', 'mishki_intro', 'vedra_intro', 'ne_to', 'nyam', 'v_vedro', 'vedro_ne', 'tesno', 'veliko', 'spokoynoy', 'dom_intro', 'dom_vozmi', 'kuku', 'hihi', 'zal_intro', 'zal_bros', 'zal_mimo', 'vedro_ne', 'zak_intro', 'zak_esche', 'zak_lishnee', 'zak_mishka', 'zak_koshka', 'zak_sobaka'], [1, 2, 3, 4, 5].flatMap(n => ['chislo_' + n, 'hochet_' + n]),
      Object.keys(COLORS).flatMap(c => ['najdi_' + c, 'eto_' + c]), ['bolshoy', 'sredniy', 'malenky'].map(s => 'mishka_' + s), ['morkovka', 'med', 'yabloko', 'moloko', 'kost'].map(f => 'kto_lubit_' + f)));

    // свет
    const hemi = new T.HemisphereLight(C('#ffffff'), C('#ffe6c8'), 0.7); world.add(hemi);
    const sun = new T.DirectionalLight(C('#fff3dc'), 0.36);
    sun.position.set(15, 44, 8); sun.target.position.set(6, 0, -8); world.add(sun.target);
    sun.castShadow = !S.low; const sz = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(sz, sz);
    { const c = sun.shadow.camera; c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 110; }
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.05; sun.shadow.radius = 5;
    world.add(sun); sunLight = sun;

    const P0 = () => (landscape ? -0.05 : -0.2);
    const st = FP = { x: 0, z: 5.4, y: 0, yaw: 0, pitch: P0(), path: [], arrive: null, look: null, t: 0, maxT: 0, turn: 0, turnLeft: 0, turnDir: 0, room: 'hall', bob: 0, held: null, stars: 0, jx: 0, jy: 0, hopY: 0, build: null, repeat: () => repeat(), use: () => useBtn(), drop: () => drop() };
    const INTER = [], SURF = [], OBST = Object.fromEntries(RKEYS.map(k => [k, []])), TICK = [], G = {}; WINS.length = 0;
    const say = ids => Voice.say(ids, null);
    const STAIRS = PLAN.filter(q => q[4]).map(([k]) => { const D = DOOR[k], P = RM[D.p]; return { x0: P.cx + P.hs + TH, z: P.cz, y0: P.y, k }; });
    const floorY = (x, z) => { for (const q of STAIRS) if (x >= q.x0 - 0.3 && x <= q.x0 + SL + 0.3 && Math.abs(z - q.z) < DW / 2 + 0.8) return q.y0 + SH * Math.max(0, Math.min(1, (x - q.x0) / SL)); return RM[roomOf(x, z)].y; };

    // ---------- стены, пол, потолок ----------
    const STYLE = {
      hall: { wall: wallTex({ wall: '#ffe9c9', pat: '#ffdcae', panel: '#fff6e6', kind: 'stripes' }), floor: floorTex({ hue: 30, l: 62 }) },
      kuh: { wall: wallTex({ wall: '#d9f2d0', pat: '#c4e8b8', panel: '#f4fbef', kind: 'dots' }), floor: floorTex({ kind: 'tiles', a: '#fff7ea', b: '#bfe3d0' }) },
      spal: { wall: wallTex({ wall: '#dde4ff', pat: '#ffffff', panel: '#f1f3ff', kind: 'stars' }), floor: floorTex({ hue: 26, l: 68 }) },
      ris: { wall: wallTex({ wall: '#fff3d1', pat: '#ffe2a0', panel: '#fffaf0', kind: 'dots' }), floor: floorTex({ hue: 36, l: 72 }) },
      zal: { wall: wallTex({ wall: '#e9e1ff', pat: '#ffffff', panel: '#f7f3ff', kind: 'stars' }), floor: floorTex({ kind: 'carpet', a: '#ffcf9e', rep: 8 }) },
      zak: { wall: wallTex({ wall: '#d4efff', pat: '#ffffff', panel: '#f3fbff', kind: 'dots' }), floor: floorTex({ kind: 'carpet', a: '#a9dc8f', rep: 6 }) },
      h3: { wall: wallTex({ wall: '#fff0c9', pat: '#ffd98a', panel: '#fffaf0', kind: 'stars' }), floor: floorTex({ hue: 28, l: 66 }) },
      poch: { wall: wallTex({ wall: '#d7f0ff', pat: '#ffffff', panel: '#f2fbff', kind: 'stripes' }), floor: floorTex({ kind: 'tiles', a: '#fff7ea', b: '#ffd9c2' }) },
      azb: { wall: wallTex({ wall: '#e2f6d8', pat: '#ffffff', panel: '#f5fcf0', kind: 'dots' }), floor: floorTex({ kind: 'carpet', a: '#ffe08a', rep: 6 }) },
      h4: { wall: wallTex({ wall: '#ffe3ef', pat: '#ffffff', panel: '#fff5f9', kind: 'stars' }), floor: floorTex({ hue: 24, l: 64 }) },
      logic: { wall: wallTex({ wall: '#e7e4ff', pat: '#d6d0ff', panel: '#f7f5ff', kind: 'dots' }), floor: floorTex({ kind: 'carpet', a: '#b5e3d8', rep: 3 }) },
      lish: { wall: wallTex({ wall: '#d8f3ee', pat: '#ffffff', panel: '#f2fbf9', kind: 'stripes' }), floor: floorTex({ hue: 32, l: 70 }) },
      igr: { wall: wallTex({ wall: '#ffe1ea', pat: '#ffd0de', panel: '#fff3f6', kind: 'dots' }), floor: floorTex({ kind: 'carpet', a: '#9fd8ef', rep: 3 }) },
    };
    const ceilM = M('#fffaf0', 1, { emissive: C('#fff3e0'), emissiveIntensity: 0.32 }), trimM = M('#ffffff', 0.7);
    const WM = {};
    const corW = new T.MeshStandardMaterial({ map: wallTex({ wall: '#f6efe6', pat: '#ede2d3', panel: '#fbf7f1', kind: 'stripes' }), roughness: 1 });
    const corF = new T.MeshStandardMaterial({ map: floorTex({ hue: 30, l: 70, rep: 2 }), roughness: 0.85 });
    const frame = (c, X, y0, off = 0) => { // наличники проёма
      const box = (along, y, la, h) => { const m = rbox(trimM, X ? TH + 0.36 : la, h, X ? la : TH + 0.36, 0.08, X ? c : along + off, y0 + y, X ? along + off : c); m.castShadow = false; world.add(m); };
      box(-(DW / 2 + 0.12), (DH + 0.3) / 2, 0.5, DH + 0.3); box(DW / 2 + 0.12, (DH + 0.3) / 2, 0.5, DH + 0.3); box(0, DH + 0.24, DW + 0.9, 0.5);
    };
    for (const key of RKEYS) {
      const R = RM[key], Y = R.y || 0, HS = R.hs || 8, STEP = 2 * HS + 0.6, S_ = STYLE[key], wm = WM[key] = new T.MeshStandardMaterial({ map: S_.wall, roughness: 1 });
      const fl = new T.Mesh(new T.PlaneGeometry(STEP, STEP), new T.MeshStandardMaterial({ map: S_.floor, roughness: 0.85 }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(R.cx, Y, R.cz); fl.receiveShadow = true; fl.userData.surf = { room: key, floor: true }; world.add(fl); SURF.push(fl);
      const cl = new T.Mesh(new T.PlaneGeometry(STEP, STEP), ceilM); cl.rotation.x = Math.PI / 2; cl.position.set(R.cx, Y + WH, R.cz); world.add(cl);
      const lamp = mkLamp({ hall: '#ffb74d', kuh: '#81c784', spal: '#9fa8da', igr: '#ff8fb1', ris: '#ffd54f', zak: '#4fc3f7', zal: '#b39ddb', h3: '#ffb74d', poch: '#4fc3f7', azb: '#81c784', h4: '#ff8fb1', logic: '#9fa8da', lish: '#80cbc4' }[key]); lamp.position.set(R.cx, Y + WH, R.cz); world.add(lamp);
      const hasDoor = side => (DOOR[key] && OPP[DOOR[key].sd] === side) || KIDS[key].some(c => DOOR[c].sd === side);
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
    }
    // проёмы и лестницы между комнатами
    for (const k of RKEYS) {
      const D = DOOR[k]; if (!D) continue; const P = RM[D.p], X = D.dx !== 0;
      if (D.up) { stair(D); continue; }
      for (const E of [D.a, D.b]) {
        frame(X ? E.x : E.z, X, P.y, X ? E.z : E.x);
        const th = mesh(new T.BoxGeometry(X ? TH + 0.1 : DW, 0.06, X ? DW : TH + 0.1), M(WOOD, 0.6), E.x, P.y + 0.02, E.z); th.castShadow = false; th.receiveShadow = true; world.add(th);
      }
      corridor(D, k);
    }
    // коридор между соседними комнатами: спокойные стены, мягкий свет — видно, где кончается одна игра и начинается другая
    function corridor(D, k) {
      const P = RM[D.p], X = D.dx !== 0, Y = P.y, L = CL + 2 * TH, s = X ? D.dx : D.dz, m0 = P.hs + L / 2;
      const cx = P.cx + D.dx * m0, cz = P.cz + D.dz * m0, rm = k;
      const fl = new T.Mesh(new T.PlaneGeometry(X ? L - 0.6 : DW, X ? DW : L - 0.6), corF); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, Y + 0.004, cz); fl.receiveShadow = true; fl.userData.surf = { room: rm, floor: true }; world.add(fl); SURF.push(fl);
      const cl = new T.Mesh(new T.PlaneGeometry(X ? L : DW, X ? DW : L), ceilM); cl.rotation.x = Math.PI / 2; cl.position.set(cx, Y + DH, cz); world.add(cl);
      for (const sg of [-1, 1]) {
        const g = new T.PlaneGeometry(L, DH), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 4, uv.getY(i) * DH / WH);
        const w = new T.Mesh(g, corW), ox = X ? 0 : sg * DW / 2, oz = X ? sg * DW / 2 : 0; w.position.set(cx + ox, Y + DH / 2, cz + oz);
        w.rotation.y = X ? (sg > 0 ? Math.PI : 0) : (sg > 0 ? -Math.PI / 2 : Math.PI / 2); w.userData.surf = { room: rm, nx: X ? 0 : -sg, nz: X ? -sg : 0 }; world.add(w); SURF.push(w);
        const bb = mesh(new T.BoxGeometry(X ? L : 0.14, 0.36, X ? 0.14 : L), trimM, cx + ox * 0.97, Y + 0.18, cz + oz * 0.97); bb.castShadow = false; world.add(bb);
      }
      // дорожка и круглый плафон
      const run = rbox(M('#e8d5bf', 0.9), X ? L - 1.4 : 2.2, 0.06, X ? 2.2 : L - 1.4, 0.03, cx, Y + 0.08, cz); run.castShadow = false; run.receiveShadow = true; world.add(run);
      const lp = cyl(M('#ffffff', 0.4, { emissive: C('#fff1d6'), emissiveIntensity: 0.8 }), 0.55, 0.55, 0.12, cx, Y + DH - 0.06, cz, 24); lp.castShadow = false; world.add(lp);
    }
    // лестница на этаж выше (всегда на восток): ступеньки с дорожкой, перила, картинки
    function stair(D) {
      const P = RM[D.p], y0 = P.y, zc = P.cz, X0 = P.cx + P.hs + TH, X1 = X0 + SL, WP = WM[D.p];
      const N = 16, run = SL / N, rise = SH / N, slope = Math.atan2(SH, SL), len = Math.hypot(SL, SH), mx = X0 + SL / 2;
      frame(D.a.x, true, y0, zc); frame(D.b.x, true, y0 + SH, zc);
      const th = mesh(new T.BoxGeometry(TH + 0.1, 0.06, DW), M(WOOD, 0.6), D.a.x, y0 + 0.02, zc); th.castShadow = false; th.receiveShadow = true; world.add(th);
      const top = mesh(new T.BoxGeometry(TH + 0.1, 0.3, DW), M(WOOD, 0.6), D.b.x, y0 + SH - 0.14, zc); top.castShadow = false; top.receiveShadow = true; world.add(top);
      const wd = M('#d9a066', 0.6), cp = M(['#e2574c', '#4f8fe2', '#43a861', '#b25de0'][P.fl - 1] || '#e2574c', 0.9);
      for (let i = 0; i < N; i++) {
        const h = (i + 1) * rise, q = mesh(new T.BoxGeometry(run, h, DW), wd, X0 + (i + 0.5) * run, y0 + h / 2, zc); q.castShadow = false; q.receiveShadow = true; world.add(q);
        const c = mesh(new T.BoxGeometry(run + 0.02, 0.05, DW * 0.56), cp, X0 + (i + 0.5) * run, y0 + h + 0.025, zc); c.castShadow = false; c.receiveShadow = true; world.add(c);
      }
      // невидимый скат: по нему находится точка, куда нажали
      const rg = grp(mx, y0 + SH / 2 + 0.06, zc); rg.rotation.z = slope; const rp = new T.Mesh(new T.PlaneGeometry(len, DW), new T.MeshBasicMaterial({ visible: false })); rp.rotation.x = -Math.PI / 2; rp.userData.surf = { room: D.p, floor: true }; rg.add(rp); world.add(rg); SURF.push(rp);
      for (const sg of [-1, 1]) { // боковые стены и перила
        const g = new T.PlaneGeometry(SL + 0.6, SH + WH), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (SL + 0.6) / 4, uv.getY(i) * (SH + WH) / WH);
        const m = new T.Mesh(g, WP); m.position.set(mx, y0 + (SH + WH) / 2, zc + sg * DW / 2); m.rotation.y = sg > 0 ? Math.PI : 0; m.userData.surf = { room: D.p, nx: 0, nz: -sg }; world.add(m); SURF.push(m);
        const rail = cyl(M(WOOD, 0.5), 0.09, 0.09, len, mx, y0 + SH / 2 + 1.75, zc + sg * (DW / 2 - 0.22), 8); rail.rotation.z = slope - Math.PI / 2; rail.castShadow = false; world.add(rail);
        for (let i = 1; i < N; i += 3) { const bl = cyl(trimM, 0.05, 0.05, 1.7, X0 + (i + 0.5) * run, y0 + (i + 1) * rise + 0.85, zc + sg * (DW / 2 - 0.22), 6); bl.castShadow = false; world.add(bl); }
      }
      const cg = grp(mx, y0 + SH / 2 + 6.5, zc); cg.rotation.z = slope; const cpn = new T.Mesh(new T.PlaneGeometry(len + 1.5, DW), ceilM); cpn.rotation.x = Math.PI / 2; cg.add(cpn); world.add(cg);
      const mk = (x, ya, yb, ry) => { const m = new T.Mesh(new T.PlaneGeometry(DW, yb - ya), WP); m.position.set(x, (ya + yb) / 2, zc); m.rotation.y = ry; world.add(m); };
      mk(X0 - 0.02, y0 + DH, y0 + SH + WH, Math.PI / 2); mk(X1 + 0.02, y0 + SH + DH, y0 + SH + WH, -Math.PI / 2);
      for (const [i, k] of [[4, (P.fl - 1) % 3], [10, P.fl % 3]]) { const pc = mkPicture(k, ['#4fc3f7', '#ff8fb1', '#ffd54f'][k]); pc.position.set(X0 + i * run, y0 + (i + 1) * rise + 3.6, zc - DW / 2 + 0.08); world.add(pc); }
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
      cam.fov = landscape ? 74 : 92; cam.near = 0.3; cam.far = 160; cam.updateProjectionMatrix();
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
      const o = release(it), h = it.home, dst = V(p.x, floorY(p.x, p.z) + (it.fy || 0), p.z);
      o.rotation.set(0, st.yaw + Math.PI, 0); tws(o, h.s, 260); arc(o, dst, 320, 0.5).then(() => { SFX.thunk(); });
      h.p.copy(dst); h.r = new T.Euler(0, st.yaw + Math.PI, 0); o.userData.fp && (o.userData.fp.off = false);
      it.onDrop && it.onDrop(dst);
    }

    // ---------- где можно ходить ----------
    const REG = RKEYS.map(k => { const R = RM[k], IN = R.hs - 0.95; return { x0: R.cx - IN, x1: R.cx + IN, z0: R.cz - IN, z1: R.cz + IN, ya: R.y, yb: R.y }; })
      .concat(PLAN.map(([k]) => { const D = DOOR[k], X = D.dx !== 0, xs = [D.in.x, D.out.x], zs = [D.in.z, D.out.z]; return { x0: Math.min(...xs) - (X ? 0 : 1.5), x1: Math.max(...xs) + (X ? 0 : 1.5), z0: Math.min(...zs) - (X ? 1.5 : 0), z1: Math.max(...zs) + (X ? 1.5 : 0), ya: RM[D.p].y, yb: RM[k].y }; }));
    const inside = (x, z) => REG.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && st.y >= r.ya - 2 && st.y <= r.yb + 2);
    // комната под точкой; y — высота, на которой ищем (по умолчанию там, где стоит Зайка)
    const roomOf = (x, z, y = st.y) => { let best = 'hall', bd = 1e9; for (const k of RKEYS) { const R = RM[k]; if (Math.abs(R.y - y) > SH / 2 + 0.01) continue; const d = Math.max(Math.abs(x - R.cx), Math.abs(z - R.cz)) / R.hs; if (d < bd) { bd = d; best = k; } } return best; };
    function clampRoom(p, k) { const R = RM[k], m = (R.hs || HS) - PAD; p.x = Math.max(R.cx - m, Math.min(R.cx + m, p.x)); p.z = Math.max(R.cz - m, Math.min(R.cz + m, p.z)); return p; }
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
    function ping(x, z) { ring.position.set(x, floorY(x, z) + 0.09, z); twf(650, (e, k) => { ring.scale.setScalar(0.6 + k * 1.3); ring.material.opacity = 0.85 * (1 - k); }); }
    function walkTo(p, look, cb) {
      const rf = roomOf(st.x, st.z), rt = roomOf(p.x, p.z), pts = [];
      if (rf !== rt) {
        const A = chainOf(rf), B = chainOf(rt);
        let c = 0; while (c < A.length && c < B.length && A[c] === B[c]) c++;
        for (let i = A.length - 1; i >= c; i--) pts.push(doorPt(A[i], 1), doorPt(A[i], 0));
        for (let i = c; i < B.length; i++) pts.push(doorPt(B[i], 0), doorPt(B[i], 1));
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
        const f = o.userData.fp; if (!f || f.off || !o.parent || !o.visible || f.room !== st.room || f.noFocus || (f.when && !f.when())) continue;
        const p = wpos(o), dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz);
        if (d > (f.far ? 17 : REACH)) continue;
        const a = Math.abs(angd(Math.atan2(-dx, -dz), st.yaw)); if (a > (f.far ? 0.42 : 0.62)) continue;
        const s = a * 5 + d * 0.16; if (s < bs) { bs = s; best = o; }
      }
      return best;
    }
    function useBtn() {
      if (st.build) { st.build.exit(); return; }
      if (focus) { SFX.tap(); use(focus, true); } else if (st.held && st.held.throwFree) st.held.throwFree(); else SFX.soft();
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
      const R = RM[key], Y = R.y || 0, b = mkStartBtn(); b.position.set(x, Y, z); world.add(b); BTN[key] = b; b.userData.stat = true;
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
    // ступенька: два чистых прохода — задание чуть сложнее, много ошибок — чуть легче
    function stepUp(key, e) {
      const r = STL[key] = STL[key] || { s: 0, c: 0 }; r.n = (r.n || 0) + 1;
      let d = 0;
      if (e <= 1) { if (++r.c >= 2 && r.s < 2) { r.s++; r.c = 0; d = 1; } } else if (e >= 4) { r.c = 0; if (r.s > 0) { r.s--; d = -1; } }
      save(); return d;
    }
    async function roomDone(key, pos) {
      const g = G[key]; g.done = true; g.q = null; Idle.off();
      const errs = g.errs || 0, up = stepUp(key, errs) > 0;
      S.last = { fl: RM[key].fl, t: Date.now() }; save();
      st.stars++; hudFloor(); SFX.good(); burst(pos, 22);
      const bt = BTN[key]; if (bt) { const s = mkZvezda(true, 0.5); s.castShadow = false; s.position.y = 2.5; bt.add(s); popIn(s, 0.5); TICK.push(t => { s.rotation.y = t * 2; }); }
      const sg = SIGN[key]; if (sg) { const s = mkZvezda(true, 0.42); s.castShadow = false; s.position.set(0.62, 0.62, 0.25); sg.add(s); popIn(s, 0.42); TICK.push(t => { s.rotation.y = Math.sin(t * 2) * 0.6; }); }
      // хвалим по делу: без ошибок, как обычно или «было трудно, но получилось»
      await say([errs === 0 ? pick(['bez_oshibok', 'bez_oshibok2']) : errs >= 4 ? pick(['trudno_no', 'trudno_no2']) : praise()].concat(up ? ['stalo_trudnee'] : []));
      const all = TASKS.every(k => G[k] && G[k].done), flDone = floorTasks(RM[key].fl).every(k => G[k] && G[k].done);
      if (!alive() || !flDone) return;
      if (all) { S.stars.dom = (S.stars.dom || 0) + 1; save(); }
      SFX.fanfare();
      const D = 0.9, hh = D * Math.tan(cam.fov / 2 * Math.PI / 180), hw = hh * cam.aspect;
      const star = mkZvezda(true, 1); star.castShadow = false; star.position.set(0, hh * 0.15, -D); star.scale.setScalar(0.001); cam.add(star);
      tws(star, Math.min(hh, hw) * 0.45, 900, 'elastic');
      // лучи за звездой и хоровод маленьких звёздочек вокруг
      const R0 = Math.min(hh, hw), cy0 = hh * 0.15;
      const rays = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: cnv(256, 256, (x, w, h) => { x.translate(128, 128); for (let i = 0; i < 12; i++) { x.rotate(Math.PI / 6); const r = x.createLinearGradient(0, 0, 0, 126); r.addColorStop(0, 'rgba(255,224,110,.9)'); r.addColorStop(1, 'rgba(255,224,110,0)'); x.fillStyle = r; x.beginPath(); x.moveTo(0, 0); x.lineTo(-17, 126); x.lineTo(17, 126); x.closePath(); x.fill(); } }), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
      rays.position.set(0, cy0, -D - 0.03); rays.scale.setScalar(R0 * 2.9); rays.renderOrder = 5; cam.add(rays); tw(rays.material, { opacity: 0.5 }, 700);
      const minis = []; for (let i = 0; i < 8; i++) { const m = mkZvezda(true, 1); m.castShadow = false; m.scale.setScalar(0.001); cam.add(m); minis.push(m); wait(450 + i * 110).then(() => { if (!alive()) return; tws(m, R0 * 0.11, 450, 'elastic'); tone([784, 880, 988, 1047, 1175, 1319, 1480, 1568][i], 0, 0.22, 'triangle', 0.1); }); }
      const fx = [rays, ...minis];
      twf(60000, (e, kk) => { const t = kk * 60, sp = Math.max(0, 1 - t / 1.1); star.rotation.y = Math.sin(t * 1.6) * 0.5 + sp * sp * 14; star.rotation.z = Math.sin(t * 1.1) * 0.15; star.position.y = cy0 + Math.sin(t * 2.2) * R0 * 0.03;
        rays.rotation.z = t * 0.35; rays.scale.setScalar(R0 * (2.9 + Math.sin(t * 3) * 0.15));
        minis.forEach((m, i) => { const a = t * 0.9 + i * Math.PI / 4, rr2 = R0 * (0.78 + Math.sin(t * 2 + i) * 0.04); m.position.set(Math.cos(a) * rr2, cy0 + Math.sin(a) * rr2 * 0.8, -D); m.rotation.y = t * 2.5 + i; }); });
      burst(V(0, hh * 0.15, -D + 0.05), 26, CONF_COLS, { parent: cam, speed: 0.1, size: 0.1, g: 1.6 });
      twf(5000, () => { if (Math.random() < 0.5) burst(V(rr(-hw, hw), hh * rr(0.9, 1.2), -D + rr(-0.1, 0.1)), 1, CONF_COLS, { parent: cam, g: 0.5, speed: 0.05, up: -0.2, conf: true, size: 0.1 }); });
      await say('final');
      if (!alive()) return;
      if (all) { UI.fin.classList.add('on'); say('esche'); } else wait(2500).then(() => { fx.forEach(o => o === rays ? tw(o.material, { opacity: 0 }, 400) : tws(o, 0.001, 400)); tws(star, 0.001, 400).then(() => { cam.remove(star); fx.forEach(o => cam.remove(o)); }); });
    }
    const miss = g => { g.wrong = (g.wrong || 0) + 1; g.errs = (g.errs || 0) + 1; SFX.soft(); return g.wrong >= 2; };
    // «живой» предмет: нажал — что-то происходит
    const fun = (obj, room, hb, act, o = {}) => { obj.userData.stat = true; hitBox(obj, hb[0], hb[1], hb[2], hb[3] || 0, hb[4] === undefined ? hb[1] / 2 : hb[4], hb[5] || 0); obj.userData.cy = hb[4] === undefined ? hb[1] / 2 : hb[4]; return inter(obj, Object.assign({ room, fh: hb[1] + 0.6, stand: near(obj, o.d || 3.6), look: () => { const p = wpos(obj); p.y += obj.userData.cy; return p; }, act }, o)); };
    // игрушка, которую можно взять и переложить
    const toy = (obj, room, hs, fy, hy = 0) => { const it = { obj, hs, hy, fy }; obj.userData.cy = 0; hitBox(obj, 1.6, 1.6, 1.6); inter(obj, { room, fh: 1.5, stand: near(obj, 3.0), look: () => wpos(obj), act: () => take(it) }); it.onDrop = p => { obj.userData.fp.room = roomOf(p.x, p.z); }; return it; };

    // =========== ГОСТИНАЯ: шарики по цветам ===========
    {
      const sofa = mkSofa('#8fc7e8'); sofa.position.set(-6.75, 0, 5.2); sofa.rotation.y = Math.PI / 2; world.add(sofa); obst('hall', -6.75, 5.2, 1.0, 2.6, 0.5);
      fun(sofa, 'hall', [4.8, 2.4, 2.2, 0, 1.2, 0], () => { SFX.boing(); squash(sofa, 400); st.hopT = 0.0001; if (lvl === 0) Voice.say('hihi', null); });
      const sh = mkShelf(false); sh.position.set(7.25, 0, 5.2); sh.rotation.y = -Math.PI / 2; world.add(sh); obst('hall', 7.25, 5.2, 0.7, 1.9, 0.5);
      { const p = mkPlant(); p.position.set(-6.9, 0, -6.9); world.add(p); obst('hall', -6.9, -6.9, 0.5, 0.5, 0.5); fun(p, 'hall', [1.6, 2.8, 1.6], () => { wobble(p, 0.12); SFX.chirp(); burst(V(-6.9, 2.6, -6.9), 6, ['#66c45c', '#4fae4d', '#ff6b8a']); }); }
      world.add(mkRug(4.2, '#ff9db4', '#fff1c9'));
      for (const s of [-1, 1]) { const w = mkWindow('#ff8a65'); w.position.set(s * 5.0, 4.3, HS - 0.02); w.rotation.y = Math.PI; world.add(w); }
      { const pc = mkPicture(0, '#4fc3f7'); pc.position.set(-4.4, 5.0, -HS + 0.1); world.add(pc); }
      { // кот на подоконнике: погладишь — мурлычет
        const kot = mkKot(); kot.position.set(4.3, 2.62, HS - 0.42); kot.rotation.y = Math.PI + 0.5; kot.scale.setScalar(0.82); world.add(kot); const K = kot.userData;
        TICK.push((t, dt) => { K.segs.forEach((s, i) => { s.rotation.y = Math.sin(t * 1.7 - i * 0.6) * 0.28 + (i ? 0 : -0.5); }); K.hd.rotation.y = Math.sin(t * 0.45) * 0.45; K.hd.rotation.z = Math.sin(t * 0.3) * 0.08;
          const bl = (t % 3.7) < 0.14 || K.purr > 0 ? 0.12 : 1; K.eyes.forEach(e => { e.scale.y = 0.075 * bl; }); K.ears.forEach((e, i) => { e.rotation.x = (t % 5.3) < 0.3 && i === 0 ? Math.sin(t * 40) * 0.25 : 0; });
          if (K.purr > 0) { K.purr -= dt; kot.scale.y = 0.82 * (1 + Math.sin(t * 22) * 0.02); } else kot.scale.y = 0.82; });
        fun(kot, 'hall', [1.6, 1.9, 1.4, 0, 0.8, 0], () => { K.purr = 1.8; hop(kot, 0.25); for (let i = 0; i < 9; i++) tone(210 + (i % 2) * 14, i * 0.17, 0.15, 'sawtooth', 0.035, 190); tone(720, 0, 0.3, 'sine', 0.1, 480); burst(V(4.3, 4.0, HS - 0.9), 5, ['#ff8fa3', '#ff6b8a']); }, { stand: () => ({ x: 4.3, z: HS - 3.2 }) });
      }
      { // аквариум: рыбки плавают, нажмёшь — приплывают к стеклу
        const ak = mkAkv(); ak.position.set(-4.4, 0, -HS + 0.75); world.add(ak); obst('hall', -4.4, -HS + 0.75, 1.75, 0.7, 0.5); const A = ak.userData;
        TICK.push((t, dt) => {
          A.fish.forEach(o => { if (o.fast > 0) o.fast -= dt; const k = o.fast > 0 ? 3 : 1; o.ph += dt * o.sp * k; const x = Math.sin(o.ph) * 1.05, dir = Math.cos(o.ph) >= 0 ? 1 : -1; o.f.position.set(x, o.y + Math.sin(o.ph * 2.3) * 0.1, o.d + (o.fast > 0 ? 0.15 : 0)); o.f.rotation.y = dir > 0 ? 0 : Math.PI; o.f.rotation.z = Math.sin(o.ph * 6) * 0.06; });
          A.bub.forEach(o => { const k = (t * o.sp + o.ph) % 1; o.b.position.set(o.x + Math.sin(t * 3 + o.ph * 9) * 0.05, 1.85 + k * 1.45, 0.25); o.b.material.opacity = 0.75 * (1 - k * k); });
          A.weeds.forEach((w, i) => { w.rotation.z = Math.sin(t * 1.3 + i * 1.1) * 0.16; });
        });
        fun(ak, 'hall', [3.4, 3.5, 1.4, 0, 1.75, 0], () => { A.fish.forEach(o => { o.fast = 2.2; }); SFX.plop(); for (let i = 0; i < 4; i++) tone(700 + i * 160, 0.08 + i * 0.09, 0.1, 'sine', 0.09, 1200 + i * 150); }, { stand: () => ({ x: -4.4, z: -HS + 3.6 }) });
      }
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

      // по возрасту: 3–4 цвета; 4–5 цвет и размер; 5–7 запомни и лопни по порядку
      const mode = ['col', 'size', 'seq'][lvl], sp = stp('hall');
      const n = mode === 'col' ? [3, 4, 6][sp] : mode === 'size' ? [4, 6, 6][sp] : [4, 5, 6][sp];
      const cset = wsel(Object.keys(COLORS), mode === 'size' ? n / 2 : n, 'c_');
      const list = mode === 'size' ? shuffle(cset.flatMap(c => [[c, 'b'], [c, 'm']])) : cset.map(c => [c, '']);
      const P = [[-4.6, 4.5, -5.2], [2.2, 4.9, -3.6], [-2.9, 5.3, -6.6], [6.2, 4.5, -2.8], [-6.2, 4.6, 0.2], [5.6, 4.8, 2.6]];
      const g = G.hall = { intro: mode === 'seq' ? 'kraski_intro_c' : 'kraski_intro', left: mode === 'size' && sp === 2 ? 4 : 3, balls: [] };
      const szq = U => (U.sz === 'b' ? 'sh_bolshoy' : U.sz === 'm' ? 'sh_malenky' : null);
      list.forEach(([c, sz], i) => {
        const b = mkShar(COLORS[c]), U = b.userData; U.c = c; U.sz = sz; U.sc = sz === 'b' ? 1.22 : sz === 'm' ? 0.66 : 0.95; U.by = P[i][1] - (sz === 'm' ? 0.5 : 0); U.cy = 0;
        b.position.set(P[i][0], U.by, P[i][2]); b.scale.setScalar(U.sc); hitBox(b, 2.2, 2.7, 2.2, 0, -0.1, 0);
        const wt = ball(M(COLORS[c], 0.5), 0.2, P[i][0], 0.2, P[i][2]); world.add(wt);
        const str = cyl(M('#9a9a9a', 0.8), 0.014, 0.014, 1, P[i][0], 1, P[i][2], 4); str.castShadow = false; world.add(str); U.str = str;
        world.add(b); g.balls.push(b); popIn(b, U.sc, 300 + i * 120);
        U.fpo = () => ({ room: 'hall', far: true, fh: 1.6, look: () => wpos(b), act: () => { if (g.tapBall) g.tapBall(b); else { wobble(b, 0.3); say(['eto_' + c, szq(U)]); } } });
        inter(b, U.fpo());
      });
      TICK.push(t => g.balls.forEach(b => { const U = b.userData; if (!b.parent) return; b.position.y = U.by + Math.sin(t * 1.3 + U.ph) * 0.14; b.rotation.z = Math.sin(t * 0.9 + U.ph) * 0.06; const y0 = 0.3, y1 = b.position.y - 2.75 * U.sc / 0.95; U.str.scale.y = Math.max(0.01, y1 - y0); U.str.position.y = (y0 + y1) / 2; }));
      const popBall = async b => {
        const U = b.userData; U.popped = true; uninter(b); SFX.pop(); const pos = b.position.clone();
        await tws(b, U.sc * 1.35, 90, 'out'); world.remove(b); world.remove(U.str);
        burst(pos, 22, [COLORS[U.c], '#ffffff', COLORS[U.c]], { conf: true, speed: 1.2 }); SFX.good(); return pos;
      };
      const revive = (b, i) => { const U = b.userData; if (!U.popped) return; U.popped = false; world.add(b); world.add(U.str); b.scale.setScalar(0.001); popIn(b, U.sc, 150 + i * 120); inter(b, U.fpo()); };
      const pulse = b => { const U = b.userData; tone(520 + g.balls.indexOf(b) * 70, 0, 0.25, 'triangle', 0.12); tws(b, U.sc * 1.3, 180, 'out').then(() => { if (b.parent) tws(b, U.sc, 320, 'back'); }); };
      const startFind = () => {
        const liveB = g.balls.filter(b => b.parent && !b.userData.popped);
        const tb = wpick(liveB, b => 'c_' + b.userData.c), target = tb.userData.c, q = ['najdi_' + target, szq(tb.userData)]; g.wrong = 0;
        g.tapBall = async b => {
          const U = b.userData; if (U.popped) return;
          if (g.done || g.busy) { wobble(b, 0.3); say(['eto_' + U.c, szq(U)]); return; }
          if (b === tb) {
            g.busy = true; g.balls.forEach(unmark); okk('c_' + target);
            const pos = await popBall(b);
            g.left--; g.busy = false;
            if (g.left <= 0) { g.q = null; await say('eto_' + U.c); if (alive()) roomDone('hall', pos); return; }
            g.q = null; Idle.off();
            await say(['eto_' + U.c, praise()]); if (alive()) g.start();
          } else {
            const hint = miss(g); wobble(b, 0.35); if (U.c !== target) bad('c_' + target);
            if (hint) mark(tb, 1.5);
            say(['eto_' + U.c, szq(U), hint ? 'podskazka' : null].concat(q));
          }
        };
        g.tgt = () => tb; setQ('hall', q, () => { nudge(tb); });
      };
      const startSeq = async () => {
        const L = [2, 3, 4][sp]; g.busy = true; g.wrong = 0; g.q = null;
        g.balls.forEach(revive); await wait(g.balls.some(b => b.scale.x < 0.1) ? 900 : 100); if (!alive()) return;
        const seq = shuffle(g.balls).slice(0, L); let i = 0; g.tgt = () => seq[i];
        g.tapBall = async b => {
          const U = b.userData; if (U.popped) return;
          if (g.done || g.busy) { wobble(b, 0.3); say('eto_' + U.c); return; }
          if (b === seq[i]) {
            g.busy = true; g.balls.forEach(unmark); g.wrong = 0; i++;
            const pos = await popBall(b); g.busy = false;
            if (i < L) { say('cv_' + U.c); Idle.poke(); return; }
            g.left--; g.q = null; Idle.off();
            if (g.left <= 0) { await say('cv_' + U.c); if (alive()) roomDone('hall', pos); return; }
            await say(['cv_' + U.c, praise()]); if (alive()) startSeq();
          } else { const hint = miss(g); wobble(b, 0.35); if (hint) mark(seq[i], 1.5); say(hint ? ['po_poryadku_ne', 'podskazka'] : 'po_poryadku_ne'); }
        };
        await say('zapomni');
        for (const b of seq) { if (!alive()) return; pulse(b); if (!(await say('cv_' + b.userData.c))) break; await wait(150); }
        if (!alive()) return; g.busy = false;
        g.q = ['zapomni'].concat(seq.slice(i).map(b => 'cv_' + b.userData.c)); g.hint = () => seq.slice(i).forEach((b, k) => wait(1500 + k * 1100).then(() => { if (alive() && b.parent && !b.userData.popped) pulse(b); }));
        if (st.room === 'hall') { say('teper_ty'); Idle.set(() => { if (st.room === 'hall' && !g.busy) { say(g.q); g.hint(); } }); }
      };
      g.start = mode === 'seq' ? startSeq : startFind;
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
      const w1 = mkWindow('#ffd54f'); w1.position.set(cx - 5.2, 4.3, HS - 0.02); w1.rotation.y = Math.PI; world.add(w1);
      const w2 = mkWindow('#ffd54f'); w2.position.set(cx - HS + 0.02, 5.0, 1.2); w2.rotation.y = Math.PI / 2; w2.scale.set(1.2, 0.62, 1); world.add(w2);
      const rug = mkRug(3.6, '#ffd98a', '#fff7e0'); rug.position.set(cx + 1.0, 0, 1.0); world.add(rug);
      const tb = grp(cx + 5.3, 0, 6.6); tb.add(rbox(M(WOOD, 0.55), 3.2, 0.2, 1.5, 0.07, 0, 1.6, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb.add(cyl(M(WOOD, 0.6), 0.11, 0.09, 1.5, sx * 1.35, 0.75, sz * 0.55, 8)); const pl = mkPlant(); pl.scale.setScalar(0.55); pl.position.set(0.9, 1.7, 0); tb.add(pl); const tp = mkTarelka(); tp.scale.setScalar(0.42); tp.position.set(-0.6, 1.76, 0); tb.add(tp); world.add(tb); obst('kuh', cx + 5.3, 6.6, 1.6, 0.75, 0.6);
      { const ap = mkYabloko(); ap.scale.setScalar(1.3); ap.position.set(cx + 4.7, 2.16, 6.6); world.add(ap); const it = toy(ap, 'kuh', 0.85, 0.3, 0.2); ap.userData.fp.stand = () => ({ x: cx + 4.7, z: 4.4 }); }
      TICK.push(t => { if (stove.userData.pot.children[1].position.y < 0.7) stove.userData.pot.children[1].position.y = 0.63 + Math.max(0, Math.sin(t * 7)) * 0.03; });

      const FOODS = { mishka: ['med', mkMed, 1.35, 0.35], ezhik: ['yabloko', mkYabloko, 1.5, 0.3], koshka: ['moloko', mkMiska, 1.1, 0.3], sobaka: ['kost', mkKost, 1.25, 0.35] };
      const SC = { mishka: 1.1, ezhik: 1.3, koshka: 1.3, sobaka: 1.25 }, MK = { mishka: mkMishka, ezhik: mkEzhik, koshka: () => mkZver('koshka'), sobaka: () => mkZver('sobaka') };
      // по возрасту: 3–4 «кто это любит?»; 4–5 «что любит мишка?» (выбери еду сам); 5–7 покорми по порядку, как сказала Зайка
      const mode = ['who', 'what', 'seq'][lvl], sp = stp('kuh');
      const n = mode === 'who' ? [3, 3, 4][sp] : 4, set = shuffle(Object.keys(FOODS)).slice(0, n);
      const g = G.kuh = { intro: mode === 'seq' ? 'eda_intro_c' : 'eda_intro', left: mode === 'seq' ? [2, 3, 3][sp] : [3, 4, 4][sp], an: [] };
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
      const trayPos = V(cx - 1.4, 2.62, -6.95), FD = {}; g.FD = FD;
      // еда на столе: одна (для малышей) или вся сразу
      const putFood = (who, k, cnt) => {
        if (FD[who] && FD[who].obj.parent) return FD[who];
        const [name, mk, fs, hy] = FOODS[who], home = trayPos.clone(); home.x += (k - (cnt - 1) / 2) * 1.5;
        const food = mk(); food.position.copy(home); food.userData.cy = 0; hitBox(food, 1.4, 1.4, 1.4); world.add(food); popIn(food, fs, 100 + k * 90); food.userData.float = true;
        const it = FD[who] = { obj: food, who, food: true, fs, hs: fs * 0.62, hy, fy: 0.5, lookAfter: V(ax, 1.6, z0 - (n - 1) * dz / 2), home: { p: home.clone(), r: new T.Euler(), s: fs }, onBack: () => { food.userData.float = true; }, onDrop: p => { food.userData.fp.stand = near(food, 3.0); food.userData.fp.room = roomOf(p.x, p.z); } };
        inter(food, { room: 'kuh', fh: 1.4, stand: () => ({ x: home.x, z: -4.2 }), look: () => wpos(food), act: () => { take(it); if (g.q) say(g.q); } });
        it.fl = t => { if (food.userData.float && food.parent === world) { food.position.y = home.y + Math.sin(t * 2 + k) * 0.1; food.rotation.y = t * 0.8; } }; TICK.push(it.fl);
        return it;
      };
      const feed = async (a, it) => {
        const U = a.userData, food = it.obj, fs = it.fs, s = a.scale.x, mp = V(a.position.x + 1.0 * s, U.h * 0.5 * s, a.position.z);
        release(it, fs * 0.8); TICK.splice(TICK.indexOf(it.fl), 1); uninter(food); delete FD[it.who];
        await arc(food, mp, 420, 0.8);
        for (let i = 0; i < 2; i++) { SFX.munch(); squash(a, 240); tws(food, fs * (0.5 - i * 0.4), 200); await wait(230); }
        world.remove(food); happy(a, false); burst(mp.clone().add(V(0.6, 0.6, 0)), 14); SFX.good(); return mp;
      };
      const anOf = who => g.an.find(a => a.userData.who === who);
      const startWho = () => {
        const who = bag(g, 'w', set), q = ['kto_lubit_' + FOODS[who][0]]; g.wrong = 0;
        const it = putFood(who, 0, 1), food = it.obj, ta = anOf(who); mark(food, 0.95); it.onBack = () => { food.userData.float = true; mark(food, 0.95); };
        g.tapAn = async a => {
          if (g.busy) return;
          const U = a.userData;
          if (st.held !== it) { hop(a, 0.35); say(q); if (food.parent === world) nudge(food); return; }
          if (U.who !== who) { const hint = miss(g); bad('f_' + who); headNo(a); wobble(a, 0.07); if (hint) mark(ta, ta.userData.h * ta.scale.x + 0.7, 0.4); say(['ne_to', hint ? 'podskazka' : q[0]]); return; }
          g.busy = true; g.an.forEach(unmark); g.q = null; Idle.off(); okk('f_' + who);
          const mp = await feed(a, it);
          g.left--; g.busy = false;
          await Voice.say('nyam', a); if (!alive()) return;
          if (g.left <= 0) { g.tapAn = null; roomDone('kuh', mp); return; }
          await say(praise()); if (alive()) g.start();
        };
        g.need = () => who; setQ('kuh', q, () => { if (st.held !== it && food.parent === world) nudge(food); });
      };
      const startMulti = () => {
        const L = mode === 'seq' ? [2, 2, 3][sp] : 1, order = mode === 'seq' ? shuffle(set).slice(0, L) : [bag(g, 'w', set)]; let i = 0; g.wrong = 0;
        set.forEach((w, k) => putFood(w, k, n));
        const q = mode === 'seq' ? order.flatMap((w, k) => [k ? 'a_potom' : 'pokormi_snachala', 'kogo_' + w]) : ['chto_lubit_' + order[0]];
        g.tapAn = async a => {
          if (g.busy) return;
          const U = a.userData, it = st.held, need = order[i];
          if (!it || !it.food) { hop(a, 0.35); say(q); return; }
          if (U.who !== need || it.who !== need) {
            const hint = miss(g); headNo(a); wobble(a, 0.07); if (it.who !== need) bad('f_' + need);
            if (hint) { const ta = anOf(need); mark(ta, ta.userData.h * ta.scale.x + 0.7, 0.4); if (FD[need] && st.held !== FD[need]) mark(FD[need].obj, 0.95); }
            say([mode === 'seq' && U.who !== need ? 'ne_po_poryadku' : 'ne_to', hint ? 'podskazka' : null].concat(hint ? [] : q)); return;
          }
          g.busy = true; g.an.forEach(unmark); Object.values(FD).forEach(f => unmark(f.obj)); Idle.off(); okk('f_' + need); g.wrong = 0;
          const mp = await feed(a, it); i++; g.busy = false;
          await Voice.say('nyam', a); if (!alive()) return;
          if (i < order.length) { Idle.poke(); return; }
          g.left--; g.q = null;
          if (g.left <= 0) { g.tapAn = null; roomDone('kuh', mp); return; }
          await say(praise()); if (alive()) g.start();
        };
        g.need = () => order[i]; setQ('kuh', q, () => { const f = FD[order[i]]; if (mode !== 'seq' && f && st.held !== f && f.obj.parent === world) nudge(f.obj); });
      };
      g.start = mode === 'who' ? startWho : startMulti;
      startBtn('kuh', cx + 2.6, 4.4);
    }

    // =========== СПАЛЬНЯ (второй этаж): мишки и кроватки ===========
    {
      const cx = RM.spal.cx, Y = SH, up = grp(0, Y, 0); world.add(up);
      // шкаф: дверцы открываются, внутри одежда и уточка
      const wr = grp(cx - 5.5, 0, -7.1); up.add(wr); obst('spal', cx - 5.5, -7.1, 1.9, 0.8, 0.6);
      { const bl = M('#bfe3f7', 0.7); wr.add(rbox(bl, 3.8, 5.6, 0.14, 0.05, 0, 2.8, -0.73)); for (const s of [-1, 1]) wr.add(rbox(bl, 0.14, 5.6, 1.6, 0.05, s * 1.83, 2.8, 0)); wr.add(rbox(bl, 3.8, 0.14, 1.6, 0.05, 0, 5.53, 0)); wr.add(rbox(bl, 3.8, 0.14, 1.6, 0.05, 0, 0.07, 0));
        const bk = new T.Mesh(new T.PlaneGeometry(3.5, 5.3), new T.MeshBasicMaterial({ color: C('#8fb6cf') })); bk.position.set(0, 2.8, -0.64); wr.add(bk);
        const rod = cyl(M(WOOD, 0.5), 0.05, 0.05, 3.5, 0, 4.7, 0, 6); rod.rotation.z = Math.PI / 2; wr.add(rod);
        ['#ff6fae', '#ffd21f', '#35b24a', '#b25de0'].forEach((c, i) => wr.add(rbox(M(c, 0.9), 0.62, 2.0, 0.9, 0.12, -1.2 + i * 0.8, 3.55, 0)));
        const dk = actor(mkZver('utka')); dk.scale.setScalar(0.7); dk.position.set(0.3, 0.15, 0.1); wr.add(dk);
        const doors = [-1, 1].map(s => { const d = grp(s * 1.9, 2.8, 0.8); d.add(rbox(M('#e3f4ff', 0.7), 1.86, 5.4, 0.12, 0.1, -s * 0.95, 0, 0)); d.add(ball(M('#ffd54f', 0.3), 0.12, -s * 1.65, 0, 0.12)); wr.add(d); return d; });
        let open = false;
        fun(wr, 'spal', [3.9, 5.6, 2.0, 0, 2.8, 0.2], () => { open = !open; SFX.whoosh(); doors.forEach((d, i) => tw(d.rotation, { y: open ? (i ? 1.9 : -1.9) : 0 }, 420, 'inout')); if (open) wait(450).then(() => { if (alive() && open) { hop(dk, 0.4); Voice.say('kuku', null); } }); else wait(430).then(() => SFX.thunk()); }, { stand: () => ({ x: cx - 5.5, z: -3.0 }) }); }
      const w1 = mkWindow('#9fa8da'); w1.position.set(cx - 5.2, 4.3, HS - 0.02); w1.rotation.y = Math.PI; up.add(w1);
      const rug = mkRug(4.0, '#b9c6ff', '#f4f1ff'); rug.position.set(cx - 2.2, 0, 0); up.add(rug);
      const pc = mkPicture(2, '#ffd54f'); pc.position.set(cx - 6.2, 4.8, HS - 0.1); pc.rotation.y = Math.PI; pc.visible = false; up.add(pc);
      const bulbs = []; for (let i = 0; i < 9; i++) { const b = ball(new T.MeshBasicMaterial({ color: C(['#ffd54f', '#ff8fb1', '#81d4fa'][i % 3]) }), 0.16, cx + HS - 0.2, 5.6 - Math.sin(i / 8 * Math.PI) * 0.5, -6 + i * 1.5, true); b.castShadow = false; up.add(b); bulbs.push(b); }
      let garl = true; TICK.push(t => bulbs.forEach((b, i) => b.scale.setScalar(garl ? 0.16 * (1 + Math.sin(t * 3 + i * 1.3) * 0.25) : 0.08)));
      // ночник: выключает и включает свет
      const nl = mkFloorLamp(); nl.scale.setScalar(0.8); nl.position.set(cx + 3.7, 0, -6.9); up.add(nl); obst('spal', cx + 3.7, -6.9, 0.4, 0.4, 0.4); nl.userData.shade.emissiveIntensity = 0.9; let dark = false;
      fun(nl, 'spal', [1.8, 4.6, 1.8], () => { dark = !dark; tone(dark ? 700 : 1200, 0, 0.06, 'square', 0.05); tw(hemi, { intensity: dark ? 0.42 : 0.7 }, 400); tw(sun, { intensity: dark ? 0.12 : 0.36 }, 400); hemi.color.copy(C(dark ? '#aab8ff' : '#ffffff')); garl = true; if (dark) SFX.twinkle(); });
      const chest = grp(cx - 6.2, 0, 6.4); chest.add(rbox(M('#ff8a65', 0.7), 2.4, 1.3, 1.6, 0.14, 0, 0.65, 0)); const lidc = grp(0, 1.3, -0.8); lidc.add(rbox(M('#ffd54f', 0.5), 2.5, 0.25, 1.7, 0.1, 0, 0.1, 0.85)); chest.add(lidc); up.add(chest); obst('spal', cx - 6.2, 6.4, 1.2, 0.8, 0.5);
      { let op = false; fun(chest, 'spal', [2.6, 1.8, 1.8], () => { op = !op; SFX.whoosh(); tw(lidc.rotation, { x: op ? -1.3 : 0 }, 350, 'inout'); if (op) burst(V(cx - 6.2, Y + 1.8, 6.4), 10); }, { stand: () => ({ x: cx - 6.2, z: 3.6 }) }); }
      { const t = mkToy('zvezda'); t.position.set(cx - 5.6, Y + 0.6, -1.6); world.add(t); toy(t, 'spal', 0.6, 0.6, 0.1); }

      const sizes = lvl < 1 && stp('spal') < 2 ? ['bolshoy', 'malenky'] : ['bolshoy', 'sredniy', 'malenky'];
      const BS = lvl < 2 && !(lvl === 1 && stp('spal') === 2) ? { bolshoy: 1.5, sredniy: 1.13, malenky: 0.8 } : { bolshoy: 1.38, sredniy: 1.14, malenky: 0.93 };
      const k = sizes.length === 3 ? 0.75 : 0.95, gap = 0.5, order = shuffle(sizes);
      const lens = order.map(s => 3.3 * BS[s] * k), total = lens.reduce((a, b) => a + b, 0) + gap * (order.length - 1);
      const g = G.spal = { intro: 'mishki_intro', left: sizes.length, beds: [], bears: [] };
      // кроватки вдоль восточной стены, а посередине — проход к лестнице на третий этаж
      const bx = cx + HS - 1.9, DG = 1.9, sA = Math.random() < 0.5 ? -1 : 1, big = order.reduce((m, s2) => BS[s2] > BS[m] ? s2 : m, order[0]);
      const sideOf = sz => order.length === 2 ? (sz === order[0] ? sA : -sA) : (sz === big ? sA : -sA), zAt = { [sA]: DG, [-sA]: DG }, bz = {};
      order.forEach((sz, i) => { const sd = sideOf(sz); bz[sz] = sd * (zAt[sd] + lens[i] / 2); zAt[sd] += lens[i] + gap; });
      for (const sd of [-1, 1]) { const L = zAt[sd] - gap - DG; if (L > 0) obst('spal', bx, sd * (DG + L / 2), 1.3, L / 2, 0.4); }
      order.forEach((sz, i) => {
        const b = mkKrovatka(), s = BS[sz] * k, U = b.userData; U.s = sz; U.sc = s; U.cy = 0.9 * s;
        b.position.set(bx, Y, bz[sz]); b.rotation.y = -Math.PI / 2; b.scale.setScalar(s);
        hitBox(b, 3.4, 2.4, 2.2, 0, 1.1, 0); world.add(b); g.beds.push(b);
        inter(b, { room: 'spal', fh: 2.4 * s + 0.6, stand: () => ({ x: bx - 4.6, z: b.position.z }), look: () => V(bx, Y + 1.0, b.position.z), act: () => g.tapBed(b) });
      });
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
        let top = 0.12, placed = 0, busy = false, plan = [], perr = 0, pw = 0;
        // картинка-задание: какую башню построить (снизу вверх)
        const cardC = document.createElement('canvas'); cardC.width = 256; cardC.height = 384; const cardT = new T.CanvasTexture(cardC); cardT.encoding = T.sRGBEncoding;
        const card = grp(mx + 1.7, 0, mz - 3.9); card.rotation.y = -Math.PI / 2 + 0.15;
        card.add(cyl(M(WOOD, 0.6), 0.09, 0.11, 3.4, 0, 1.7, 0, 8)); card.add(rbox(M('#ffb74d', 0.5), 2.9, 4.2, 0.14, 0.2, 0, 5.2, -0.05));
        { const p = new T.Mesh(new T.PlaneGeometry(2.6, 3.9), new T.MeshBasicMaterial({ map: cardT })); p.position.set(0, 5.2, 0.04); card.add(p); }
        card.traverse(o => { if (o.isMesh) o.castShadow = false; }); world.add(card);
        const drawCard = () => {
          const x = cardC.getContext('2d'); x.fillStyle = '#fffdf5'; x.fillRect(0, 0, 256, 384); x.fillStyle = '#c5e1a5'; x.fillRect(20, 352, 216, 14);
          const U = Math.min(88, 316 / plan.reduce((a, i) => a + BLOCKS[i][2], 0)); let y = 352;
          plan.forEach((i, k) => { const [kind, col, h] = BLOCKS[i], hh = h * U, w = (kind === 'wide' ? 2 : 1) * U; x.fillStyle = col; x.strokeStyle = 'rgba(60,40,30,.55)'; x.lineWidth = 4; x.lineJoin = 'round';
            x.globalAlpha = k < placed ? 0.3 : 1; x.beginPath();
            if (kind === 'roof') { x.moveTo(128, y - hh); x.lineTo(128 + U * 0.75, y); x.lineTo(128 - U * 0.75, y); x.closePath(); }
            else if (kind === 'cyl') { x.moveTo(128 - w / 2, y); x.lineTo(128 - w / 2, y - hh + 8); x.quadraticCurveTo(128, y - hh - 8, 128 + w / 2, y - hh + 8); x.lineTo(128 + w / 2, y); x.closePath(); }
            else x.rect(128 - w / 2, y - hh, w, hh);
            x.fill(); x.stroke(); y -= hh; });
          x.globalAlpha = 1; cardT.needsUpdate = true;
        };
        const newPlan = () => {
          const n = P3('stroy', [[2, 3, 3], [3, 4, 4], [4, 5, 6]]), base = shuffle([0, 1, 2, 3, 4, 5, 6]), roof = n >= 3 && Math.random() < 0.6;
          plan = base.slice(0, roof ? n - 1 : n).concat(roof ? [7] : []); perr = 0; pw = 0; drawCard();
        };
        newPlan();
        const reset = async () => { busy = true; await wait(2200); if (!alive()) return; SFX.thunk(); noise(0, 0.3, 0.2, 600); blocks.forEach((b, i) => { const h = b.userData.home; arc(b, h.p, 520 + i * 40, 1.6); tw(b.rotation, { y: h.r, x: 0, z: 0 }, 500); b.userData.used = false; }); top = 0.12; placed = 0; newPlan(); await wait(900); busy = false; };
        const place = b => {
          if (busy || b.userData.used) return;
          if (b !== blocks[plan[placed]]) { perr++; SFX.soft(); wobble(b, 0.25); if (++pw >= 2) mark(blocks[plan[placed]], 1.2); say(pw >= 2 ? ['stroy_ne', 'podskazka'] : 'stroy_ne'); return; }
          pw = 0; blocks.forEach(unmark);
          b.userData.used = true; const h = b.userData.h, dst = V(mx + rr(-0.06, 0.06), top + h / 2, mz + rr(-0.06, 0.06)); top += h; placed++;
          tw(b.rotation, { y: rr(-0.15, 0.15) }, 300); arc(b, dst, 380, 1.2).then(() => { SFX.thunk(); tone(392 + placed * 60, 0, 0.18, 'triangle', 0.12); burst(dst.clone().add(V(0, 0.4, 0)), 5); });
          drawCard();
          if (placed === plan.length) wait(500).then(() => { if (!alive()) return; SFX.fanfare(); burst(V(mx, top + 0.6, mz), 24); say(['stroy_gotovo', praise()]); stepUp('stroy', perr); reset(); });
        };
        const enter = () => {
          if (st.build) return; st.path = []; SFX.whoosh();
          st.build = { pos: V(mx - 7.4, 5.0, mz), look: V(mx + 0.3, 2.6, mz), exit: () => { st.build = null; $('fpUse').classList.remove('back'); st.yaw = -Math.PI / 2; st.pitch = -0.25; SFX.whoosh(); } };
          $('fpUse').classList.add('back'); if (!placed) say('stroy_intro');
        };
        blocks.forEach(b => inter(b, { room: 'igr', far: true, build: true, fh: 1.4, noFocus: true, look: () => wpos(b), act: () => { if (!st.build) enter(); else place(b); } }));
        const hb = grp(mx, 1.0, mz); world.add(hb); fun(hb, 'igr', [3.4, 2.4, 6.6, 0, 0.2, 0], () => enter(), { fh: 2.6, far: true });
        st.stroy = { plan: () => plan, blocks, place, enter, placed: () => placed };
      }

      const n = P3('igr', [[3, 3, 4], [4, 4, 5], [5, 5, 5]]), cols = wsel(Object.keys(COLORS), n, 'c_');
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
        if (ballO.userData.c !== c) { const hint = miss(g); bad('c_' + ballO.userData.c); wobble(b, 0.08); const tb = g.buckets.find(x => x.userData.c === ballO.userData.c); if (hint && tb) mark(tb, 2.1, 0.4); say(['vedro_ne', hint ? 'podskazka' : null]); return; }
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

    // =========== ЗАКАЗЫ (второй этаж, большая комната): собери в корзинку сколько нужно ===========
    {
      const R = RM.zak, cx = R.cx, cz = R.cz, Y = SH, H = R.hs, up = grp(0, Y, 0); world.add(up);
      // убранство: окна, ковёр, цветы
      for (const z of [-7, 5]) { const w = mkWindow('#ffb74d'); w.position.set(cx + H - 0.02, 4.3, cz + z); w.rotation.y = -Math.PI / 2; up.add(w); const w2 = mkWindow('#ffb74d'); w2.position.set(cx - H + 0.02, 4.3, cz + z); w2.rotation.y = Math.PI / 2; up.add(w2); }
      for (const x of [-6, 6]) { const w = mkWindow('#ff8fb1'); w.position.set(cx + x, 4.3, cz + H - 0.02); w.rotation.y = Math.PI; up.add(w); }
      const rug = mkRug(7.2, '#ffe9a8', '#fff8e1'); rug.position.set(cx, 0, cz + 1.5); up.add(rug);
      for (const [x, z] of [[-4.6, -H + 1.1], [4.6, -H + 1.1]]) { const p = mkPlant(); p.position.set(cx + x, 0, cz + z); up.add(p); obst('zak', cx + x, cz + z, 0.5, 0.5, 0.5); fun(p, 'zak', [1.6, 2.8, 1.6], () => { wobble(p, 0.12); SFX.chirp(); burst(V(cx + x, Y + 2.6, cz + z), 6, ['#66c45c', '#4fae4d', '#ff6b8a']); }); }

      const TYPES = {
        yabloko: { who: 'ezhik', mk: mkYabloko, s: 1.25, col: '#f0352b', fy: 0.3 },
        med: { who: 'mishka', mk: mkMed, s: 1.1, col: '#ffa000', fy: 0.35 },
        moloko: { who: 'koshka', mk: mkButylka, s: 1.0, col: '#2a8df4', fy: 0.0 },
        kost: { who: 'sobaka', mk: mkKost, s: 1.05, col: '#8d6e63', fy: 0.3 },
      };
      const g = G.zak = { intro: 'zak_intro', left: 0, an: [], items: [], inb: [], orders: [] };
      const item = (type, p, ry = 0) => {
        const T_ = TYPES[type], o = T_.mk(); o.position.copy(p); o.rotation.y = ry; o.scale.setScalar(T_.s); o.userData.cy = 0; hitBox(o, 1.5 / T_.s, 1.5 / T_.s, 1.5 / T_.s); world.add(o);
        const it = { obj: o, type, s: T_.s, home: p.clone(), ry, in: false }; g.items.push(it);
        inter(o, { room: 'zak', fh: 1.3, stand: near(o, 3.2), look: () => wpos(o), act: () => pick(it) }); return it;
      };
      // яблоня в дальнем левом углу
      {
        const tx = cx - 9.8, tz = cz + 9.8, tr = mkDerevo(); tr.position.set(tx, Y, tz); tr.rotation.y = Math.atan2(cx - tx, cz - tz); tr.scale.setScalar(0.8); world.add(tr); obst('zak', tx, tz, 0.8, 0.8, 0.6);
        const pot = cyl(M('#e58b5a', 0.8), 1.5, 1.2, 0.9, tx, Y + 0.45, tz, 24); pot.receiveShadow = true; world.add(pot);
        tr.updateMatrixWorld(true);
        for (const [x, y, z] of [[-2.9, 4.3, 1.6], [-1.5, 3.8, 2.6], [0, 3.6, 3.0], [1.5, 3.8, 2.6], [2.9, 4.3, 1.6]]) { const it = item('yabloko', tr.localToWorld(V(x, y, z))); const st_ = cyl(M('#6d4c41', 0.9), 0.03, 0.03, 0.5, it.home.x, it.home.y + 0.75, it.home.z, 5); st_.castShadow = false; world.add(st_); }
        fun(tr, 'zak', [2.4, 4.0, 2.4, 0, 6.4, 0], () => { wobble(tr.userData.crown || tr, 0.05); SFX.chirp(); burst(V(tx, Y + 5, tz), 8, ['#66c45c', '#4fae4d', '#a5d6a7']); }, { fh: 1.2, noFocus: true });
      }
      // столики с мёдом, молоком и косточками
      const stand = (x, z, ry, col, type, deco) => {
        const s = grp(x, 0, z); s.rotation.y = ry; s.add(rbox(M(col, 0.6), 6.4, 0.3, 1.9, 0.14, 0, 1.75, 0)); s.add(rbox(M('#ffffff', 0.7), 6.0, 0.22, 1.6, 0.1, 0, 0.75, 0));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.add(cyl(M('#ffffff', 0.7), 0.16, 0.16, 1.7, sx * 2.85, 0.85, sz * 0.65, 12));
        deco && deco(s); up.add(s); up.updateMatrixWorld(true);
        const hw = Math.abs(Math.cos(ry)) * 3.2 + Math.abs(Math.sin(ry)) * 0.95, hd = Math.abs(Math.sin(ry)) * 3.2 + Math.abs(Math.cos(ry)) * 0.95; obst('zak', x, z, hw, hd, 0.6);
        for (let i = 0; i < 5; i++) item(type, s.localToWorld(V((i - 2) * 1.18, 1.9 + TYPES[type].fy, 0.1)), ry + (type === 'kost' ? 0.5 : 0));
      };
      stand(cx + H - 1.6, cz + 7.5, -Math.PI / 2, '#ffca6b', 'med');
      stand(cx + H - 1.6, cz - 7.5, -Math.PI / 2, '#9fd4ff', 'moloko');
      stand(cx - H + 1.6, cz - 7.5, Math.PI / 2, '#d7b99a', 'kost');

      // корзинка
      const bkO = grp(cx - 3.2, Y, cz - H + 3.0);
      { const wk = M('#d9a066', 0.8, { side: T.DoubleSide }), dk = M('#b9793f', 0.8);
        bkO.add(mesh(new T.CylinderGeometry(0.95, 0.7, 0.75, 28, 1, true), wk, 0, 0.42, 0)); bkO.add(cyl(dk, 0.7, 0.7, 0.08, 0, 0.06, 0, 28));
        const rim = mesh(new T.TorusGeometry(0.95, 0.09, 10, 32), dk, 0, 0.8, 0); rim.rotation.x = Math.PI / 2; bkO.add(rim);
        const band = mesh(new T.TorusGeometry(0.84, 0.05, 8, 32), dk, 0, 0.45, 0); band.rotation.x = Math.PI / 2; bkO.add(band);
        const hd = mesh(new T.TorusGeometry(0.93, 0.07, 10, 28, Math.PI), dk, 0, 0.8, 0); hd.rotation.y = Math.PI / 2; bkO.add(hd);
        const bow = ball(M('#ff6fae', 0.5), [0.2, 0.14, 0.1], 0, 0.62, 0.95); bkO.add(bow); bkO.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
      world.add(bkO); hitBox(bkO, 2.2, 2.0, 2.2, 0, 0.8, 0); bkO.userData.cy = 0.6;
      const bk = { obj: bkO, hs: 0.66, hy: -0.6, fy: 0, onDrop: p => { bkO.userData.fp.room = roomOf(p.x, p.z); numP.visible = false; }, onBack: () => { numP.visible = false; }, onTake: () => showNum() };
      inter(bkO, { room: 'zak', fh: 2.2, stand: near(bkO, 3.0), look: () => wpos(bkO), act: () => take(bk) });
      // большая цифра над корзинкой: сколько уже собрано
      const numM = new T.MeshBasicMaterial({ transparent: true, depthTest: false }), numP = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), numM); numP.renderOrder = 20; numP.visible = false; numP.position.set(1.55, 1.05, 0.2); hands.add(numP);
      let lastType = null;
      const count = t => g.inb.filter(i => i.type === t).length;
      function showNum(pop) { const n = lastType ? count(lastType) : 0; if (!n || st.held !== bk) { numP.visible = false; return; } numM.map = numTex(n, TYPES[lastType].col); numM.needsUpdate = true; numP.visible = true; if (pop) { numP.scale.setScalar(0.3); tws(numP, 1, 380, 'back'); } }
      const SLOT = [[-0.45, 0.55, 0.3], [0.45, 0.55, 0.3], [0, 0.55, -0.4], [-0.45, 0.6, -0.3], [0.45, 0.6, -0.3], [0, 0.75, 0.2], [-0.25, 0.95, -0.1], [0.25, 0.95, -0.1]];
      const layout = () => g.inb.forEach((it, i) => { it.obj.position.set(SLOT[i][0], SLOT[i][1], SLOT[i][2]); });
      function pick(it) {
        if (g.busy || it.in) return;
        if (st.held !== bk) take(bk);
        if (g.inb.length >= SLOT.length) { SFX.soft(); wobble(bkO, 0.1); return; }
        const o = it.obj; unmark(o); burst(wpos(o), 5, [TYPES[it.type].col, '#ffffff']); SFX.pop();
        o.userData.fp.off = true; it.in = true; g.inb.push(it); bkO.add(o); o.rotation.set(0, rr(0, 6), it.type === 'moloko' ? 0.25 : 0); layout(); popIn(o, it.s * 0.66, 0, 300);
        lastType = it.type; showNum(true); const n = count(it.type); if (n <= 5) say('chislo_' + n); Idle.poke();
      }
      function goHome_(it, delay = 0) {
        const o = it.obj, i = g.inb.indexOf(it); if (i >= 0) g.inb.splice(i, 1);
        world.add(o); o.position.copy(it.home); o.rotation.set(0, it.ry, 0); popIn(o, it.s, delay); o.userData.fp.off = false; it.in = false; layout(); showNum();
      }
      // звери посередине, над каждым табличка: что и сколько
      const SC = { mishka: 1.15, ezhik: 1.35, koshka: 1.35, sobaka: 1.3 }, MK = { mishka: mkMishka, ezhik: mkEzhik, koshka: () => mkZver('koshka'), sobaka: () => mkZver('sobaka') };
      const whos = ['koshka', 'mishka', 'ezhik', 'sobaka'], foodOf = w => Object.keys(TYPES).find(t => TYPES[t].who === w);
      whos.forEach((who, i) => {
        const a = actor(MK[who]()), s = SC[who], U = a.userData, x = cx + (i - 1.5) * 4.4, z = cz + 2.2 + Math.abs(i - 1.5) * -0.9 + 1.4;
        const cu = mkCushion(['#64b5f6', '#ffb74d', '#ff8fb1', '#81c784'][i]); cu.scale.setScalar(1.15); cu.position.set(x, 0, z); up.add(cu);
        U.who = who; U.type = foodOf(who); U.need = null; U.cy = U.h * 0.5 * s; a.position.set(x, Y + 0.22, z); a.rotation.y = Math.PI; a.scale.setScalar(s);
        hitBox(a, 2.6 / s, 3.4 / s, 2.6 / s, 0, 1.6 / s, 0); world.add(a); g.an.push(a); obst('zak', x, z, 0.9, 0.9, 0.7);
        // табличка
        const sg = grp(x, Y + U.h * s + 2.0, z), T_ = TYPES[U.type];
        sg.add(rbox(M('#ffffff', 0.6), 3.9, 2.3, 0.14, 0.42)); const fr = rbox(M(T_.col, 0.5), 4.14, 2.54, 0.1, 0.46, 0, 0, -0.04); sg.add(fr);
        const ic = T_.mk(); ic.scale.setScalar(0.8 * T_.s); ic.position.set(-1.0, -0.42 + (U.type === 'kost' ? 0.4 : 0), 0.34); sg.add(ic);
        const nm = new T.MeshBasicMaterial({ transparent: true }), np = new T.Mesh(new T.PlaneGeometry(2.2, 2.2), nm); np.position.set(0.85, 0, 0.09); sg.add(np);
        sg.traverse(o => { if (o.isMesh) o.castShadow = false; }); sg.visible = false; world.add(sg);
        U.sign = sg; U.setNeed = n => { U.need = n; if (n) { nm.map = numTex(n, T_.col, true, undefined, lvl === 2 && stp('zak') > 0); nm.needsUpdate = true; sg.visible = true; popIn(sg, 1); } else if (sg.visible) tws(sg, 0.001, 250).then(() => { sg.visible = false; }); };
        inter(a, { room: 'zak', fh: U.h * s + 0.9, stand: near(a, 4.0), look: () => V(x, Y + U.h * 0.55 * s, z), act: () => give(a) });
      });
      TICK.push(t => g.an.forEach((a, i) => { const s = a.userData.sign; if (s.visible) { s.rotation.y = st.yaw; s.position.y = Y + a.userData.h * a.scale.x + 2.0 + Math.sin(t * 2 + i) * 0.08; } }));
      const qOf = a => (a.userData.who === 'ezhik' ? ['hochet_' + a.userData.need] : ['zak_' + a.userData.who, 'chislo_' + a.userData.need]);
      const hintFor = a => { const it = g.items.find(i => i.type === a.userData.type && !i.in); it && nudge(it.obj); wobble(a.userData.sign, 0.08); };
      async function give(a) {
        if (g.busy) return;
        const U = a.userData, mine = g.inb.filter(i => i.type === U.type), free = !g.started || g.done || U.need === null;
        if (st.held !== bk || !g.inb.length) { hop(a, 0.35); SFX.boing(); if (!free) { say(qOf(a)); hintFor(a); } return; }
        if (!mine.length) { const hint = !free && miss(g); headNo(a); wobble(a, 0.07); say(free ? 'ne_to' : ['ne_to', hint ? 'podskazka' : null].concat(qOf(a))); if (hint) g.items.filter(i => i.type === U.type && !i.in).slice(0, U.need).forEach(i => mark(i.obj, 0.95)); return; }
        if (!free && mine.length < U.need) { const hint = miss(g); wobble(a.userData.sign, 0.1); hop(a, 0.25); say(['zak_esche'].concat(qOf(a))); if (hint) g.items.filter(i => i.type === U.type && !i.in).slice(0, U.need - mine.length).forEach(i => mark(i.obj, 0.95)); return; }
        g.busy = true; g.items.forEach(i => unmark(i.obj)); Idle.off();
        const eat = free ? mine : mine.slice(0, U.need), extra = free ? [] : mine.slice(U.need);
        if (extra.length) { extra.forEach((it, i) => goHome_(it, i * 120)); say('zak_lishnee'); await wait(500); }
        const s = a.scale.x, mp = V(a.position.x, Y + U.h * 0.55 * s, a.position.z - 1.0 * s);
        for (const it of eat) {
          const o = it.obj, p = wpos(o), i = g.inb.indexOf(it); g.inb.splice(i, 1); world.add(o); o.position.copy(p); o.scale.setScalar(it.s * 0.5); layout(); showNum();
          await arc(o, mp, 300, 0.9); SFX.munch(); squash(a, 220); await tws(o, 0.001, 140);
          o.visible = false; wait(1600).then(() => { if (alive()) { o.visible = true; goHome_(it); } });
        }
        happy(a, false); burst(mp.clone().add(V(0, 0.8, -0.4)), 16); SFX.good(); g.busy = false;
        if (free) { Voice.say('nyam', a); return; }
        U.setNeed(null); g.left--; g.wrong = 0;
        await Voice.say('nyam', a); if (!alive()) return;
        if (g.left <= 0) { g.q = null; roomDone('zak', mp); return; }
        await say(praise()); if (alive()) next();
      }
      function next() {
        const open = g.an.filter(a => a.userData.need !== null);
        if (lvl < 2 || !open.length) { const w = bag(g, 'w', whos), a = g.an.find(x => x.userData.who === w); a.userData.setNeed(bag(g, 'n', P3('zak', [[[1, 2], [1, 2], [1, 2, 3]], [[1, 2, 3], [1, 2, 3, 4], [2, 3, 4, 5]], [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]]))); setQ('zak', qOf(a), () => hintFor(a)); return; }
        const a = open[0]; setQ('zak', qOf(a), () => hintFor(a));
      }
      g.start = () => {
        g.wrong = 0;
        if (lvl === 2) { const ns = shuffle([1, 2, 3, 4, 5]); g.left = 4; g.an.forEach((a, i) => wait(i * 250).then(() => { if (alive()) a.userData.setNeed(ns[i]); })); wait(1100).then(() => { if (alive()) next(); }); }
        else { g.left = lvl === 0 ? 3 : 4; next(); }
      };
      startBtn('zak', cx + 3.4, cz - H + 3.2);
    }

    // =========== ЗАЛ С МЯЧАМИ (второй этаж, огромный): бросай мячи в корзины по цвету и по счёту ===========
    {
      const R = RM.zal, cx = R.cx, cz = R.cz, Y = SH, H = R.hs, up = grp(0, Y, 0); world.add(up);
      for (const x of [-10, 0, 10]) { const w = mkWindow('#b39ddb'); w.position.set(cx + x, 4.3, cz - H + 0.02); up.add(w); }
      for (const z of [-9, 3]) { const w = mkWindow('#ffb74d'); w.position.set(cx + H - 0.02, 4.3, cz + z); w.rotation.y = -Math.PI / 2; up.add(w); const w2 = mkWindow('#ffb74d'); w2.position.set(cx - H + 0.02, 4.3, cz + z); w2.rotation.y = Math.PI / 2; up.add(w2); }
      const rug = mkRug(8.5, '#ffd6e4', '#fff5f8'); rug.position.set(cx, 0, cz + 3); up.add(rug);
      { // флажки под потолком
        const fc = ['#f0352b', '#ffd21f', '#2a6df4', '#35b24a', '#ff8a1c', '#ff6fae'];
        for (let i = 0; i < 17; i++) { const f = mesh(new T.CylinderGeometry(0.42, 0.42, 0.05, 3), M(fc[i % 6], 0.7), cx - H + 2 + i * 2, 6.75 - Math.sin(i / 16 * Math.PI) * 0.7, cz - H + 0.5); f.rotation.x = Math.PI / 2; f.rotation.z = Math.PI; f.castShadow = false; up.add(f); }
      }
      const needs = shuffle(P3('zal', [[[1, 2], [2, 3], [1, 2, 3]], [[1, 2, 3], [2, 3, 4], [1, 2, 3, 4]], [[2, 3, 4, 5], [2, 3, 4, 5], [3, 4, 5, 5]]])), n = needs.length, cols = wsel(Object.keys(COLORS), n, 'c_');
      const g = G.zal = { intro: 'zal_intro', left: n, bks: [], balls: [] };
      const RIM = 2.1, BR = 1.8, GR = 24, BS = 0.8, RAD = 0.6 * BS, FL = [];
      const spot = () => { for (let k = 0; k < 60; k++) { const x = cx + rr(-H + 3, H - 3), z = cz + rr(-H + 11, H - 3); if (Math.hypot(x - cx, z - (cz + H - 2)) < 5) continue; if (g.balls.every(b => b.done || Math.hypot(b.obj.position.x - x, b.obj.position.z - z) > 2.4) && !OBST.zal.some(o => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1)) return V(x, Y + RAD, z); } return V(cx + rr(-6, 6), Y + RAD, cz + rr(-2, 8)); };
      // корзины
      cols.forEach((c, i) => {
        const x = cx + (i - (n - 1) / 2) * (n === 4 ? 7.6 : 9.5), z = cz - H + 4.6, b = grp(x, Y, z), col = COLORS[c], U = b.userData;
        b.add(mesh(new T.CylinderGeometry(BR, 1.3, RIM, 36, 1, true), M(col, 0.6, { side: T.DoubleSide }), 0, RIM / 2, 0)); b.add(cyl(M(col, 0.7), 1.3, 1.3, 0.1, 0, 0.06, 0, 32));
        const rim = mesh(new T.TorusGeometry(BR, 0.13, 12, 40), M('#ffffff', 0.5), 0, RIM, 0); rim.rotation.x = Math.PI / 2; b.add(rim);
        const bd = mesh(new T.TorusGeometry(1.56, 0.07, 8, 40), M('#ffffff', 0.5), 0, RIM * 0.5, 0); bd.rotation.x = Math.PI / 2; b.add(bd);
        b.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); world.add(b); hitBox(b, 4.0, 3.0, 4.0, 0, 1.4, 0); U.cy = 1.4; U.c = c; U.need = null; U.got = 0; g.bks.push(b); obst('zal', x, z, 1.5, 1.5, 0.45);
        const sg = grp(x, Y + 5.0, z); sg.add(rbox(M('#ffffff', 0.6), 2.7, 2.7, 0.14, 0.55)); sg.add(rbox(M(col, 0.5), 2.96, 2.96, 0.1, 0.6, 0, 0, -0.04));
        const nm = new T.MeshBasicMaterial({ transparent: true }), np = new T.Mesh(new T.PlaneGeometry(2.5, 2.5), nm); np.position.z = 0.09; sg.add(np); sg.traverse(o => { if (o.isMesh) o.castShadow = false; }); sg.visible = false; world.add(sg);
        U.sign = sg; U.show = () => { nm.map = numTex(U.need, col === '#ffd21f' ? '#f2b600' : col, true, U.got); nm.needsUpdate = true; if (!sg.visible) { sg.visible = true; popIn(sg, 1); } else { sg.scale.setScalar(1.25); tws(sg, 1, 300, 'back'); } };
        inter(b, { room: 'zal', far: true, fh: 3.4, when: () => !!(st.held && st.held.throwable), look: () => V(x, Y + 1.5, z), act: () => { const it = st.held; if (it && it.throwable) throwAt(it, b); else { wobble(b, 0.05); say('eto_' + c); } } });
      });
      TICK.push(t => g.bks.forEach((b, i) => { const s = b.userData.sign; if (s.visible) { s.rotation.y = st.yaw; s.position.y = Y + 5.0 + Math.sin(t * 2 + i) * 0.08; } }));
      // мячи
      const per = Math.max(...needs) + 1, list = cols.flatMap(c => Array(per).fill(c)).concat(lvl ? shuffle(Object.keys(COLORS).filter(c => !cols.includes(c))).slice(0, 2) : []);
      list.forEach(c => {
        const o = mkMyach(COLORS[c]), it = { obj: o, c, s: BS, hs: 0.56, hy: 0.1, fy: RAD, throwable: true, done: false }; g.balls.push(it);
        o.position.copy(spot()); o.rotation.y = rr(0, 6); o.scale.setScalar(BS); o.userData.cy = 0; hitBox(o, 2.0, 2.0, 2.0); world.add(o);
        it.onDrop = p => { o.userData.fp.room = roomOf(p.x, p.z); }; it.throwFree = () => { const cp = Math.cos(st.pitch); launch(it, V(-Math.sin(st.yaw) * cp * 13, 6 + Math.sin(st.pitch) * 12, -Math.cos(st.yaw) * cp * 13), null); };
        inter(o, { room: 'zal', fh: 1.3, when: () => !(st.held && st.held.throwable), stand: near(o, 2.8), look: () => wpos(o), act: () => { take(it); say('eto_' + c); Idle.poke(); } });
      });
      function launch(it, v, aim) {
        const o = release(it, BS); o.userData.fp.off = true; it.fly = { v, t: 0, aim, b: 0 }; FL.push(it); SFX.whoosh();
        hands.position.y = hands.userData.by - 0.5; tw(hands.position, { y: hands.userData.by }, 260, 'out');
      }
      function throwAt(it, b) {
        const p = wpos(it.obj), bx = b.position.x, bz = b.position.z, d = Math.hypot(bx - st.x, bz - st.z), err = Math.max(0, d - 9) * 0.26 * Math.random(), a = rr(0, 6.28);
        const tx = bx + Math.cos(a) * err, tz = bz + Math.sin(a) * err, t = Math.max(0.5, Math.min(1.1, d / 13)), ty = Y + RIM + 0.5;
        launch(it, V((tx - p.x) / t, (ty - p.y + 0.5 * GR * t * t) / t, (tz - p.z) / t), b);
      }
      function rest(it) { const o = it.obj; FL.splice(FL.indexOf(it), 1); const f = it.fly; it.fly = null; o.position.y = Y + RAD; it.home = { p: o.position.clone(), r: o.rotation.clone(), s: BS }; o.userData.fp.off = false; o.userData.fp.room = 'zal'; if (f && f.aim && g.started && !g.done) { SFX.soft(); say('zal_mimo'); } }
      function backOut(it, b) { const o = it.obj, dst = spot(); o.userData.fp.off = true; arc(o, dst, 620, 3.2).then(() => { if (!alive()) return; SFX.thunk(); it.home = { p: dst.clone(), r: o.rotation.clone(), s: BS }; o.userData.fp.off = false; o.userData.fp.room = 'zal'; }); }
      function caught(it, b) {
        const U = b.userData, o = it.obj; FL.splice(FL.indexOf(it), 1); it.fly = null; SFX.plop(); squash(b, 240);
        const free = !g.started || g.done || U.need === null;
        if (free) { o.position.set(b.position.x, Y + 0.7, b.position.z); burst(V(b.position.x, Y + RIM + 0.4, b.position.z), 8, [COLORS[it.c], '#ffffff']); wait(700).then(() => { if (alive()) backOut(it, b); }); return; }
        if (it.c !== U.c || U.got >= U.need) {
          const hint = it.c !== U.c && miss(g); wobble(b, 0.08); SFX.soft(); o.position.set(b.position.x, Y + RIM, b.position.z); backOut(it, b);
          const tb = g.bks.find(x => x.userData.c === it.c && x.userData.got < x.userData.need); if (hint && tb) mark(tb, 3.4, 0.5);
          say(it.c !== U.c ? ['vedro_ne', hint ? 'podskazka' : null] : 'zak_lishnee'); return;
        }
        U.got++; it.done = true; g.wrong = 0; g.bks.forEach(unmark); const k = U.got - 1; o.position.set(b.position.x + [0, -0.6, 0.6, 0, -0.5][k % 5], Y + 0.6 + Math.floor(k / 3) * 0.7 + (k % 3 ? 0.1 : 0), b.position.z + [0.3, -0.4, -0.3, 0.7, 0.5][k % 5]);
        uninter(o); U.show(); SFX.good(); const top = V(b.position.x, Y + RIM + 0.6, b.position.z); burst(top, 14, [COLORS[it.c], '#ffffff', '#ffd54f']);
        if (U.got < U.need) { say('chislo_' + U.got); return; }
        const s = mkZvezda(true, 0.6); s.castShadow = false; s.position.set(0, 1.9, 0.1); U.sign.add(s); popIn(s, 0.6); g.left--; Idle.off();
        if (g.left <= 0) { g.q = null; say('chislo_' + U.got).then(() => { if (alive()) roomDone('zal', top); }); return; }
        say(['chislo_' + U.got, praise()]);
      }
      const X0 = cx - H + 0.7, X1 = cx + H - 0.7, Z0 = cz - H + 0.7, Z1 = cz + H - 0.7;
      TICK.push((t, dt) => {
        if (!FL.length) return; const h = Math.min(dt, 0.034);
        for (const it of FL.slice()) {
          const f = it.fly, o = it.obj, p = o.position, v = f.v, py = p.y; f.t += h; v.y -= GR * h; p.x += v.x * h; p.y += v.y * h; p.z += v.z * h; o.rotation.x += v.z * h * 1.2; o.rotation.z -= v.x * h * 1.2;
          if (p.x < X0) { p.x = X0; v.x = Math.abs(v.x) * 0.6; } else if (p.x > X1) { p.x = X1; v.x = -Math.abs(v.x) * 0.6; }
          if (p.z < Z0) { p.z = Z0; v.z = Math.abs(v.z) * 0.6; } else if (p.z > Z1) { p.z = Z1; v.z = -Math.abs(v.z) * 0.6; }
          if (p.y > Y + WH - RAD) { p.y = Y + WH - RAD; v.y = -Math.abs(v.y) * 0.5; }
          let got = false;
          for (const b of g.bks) {
            const dx = p.x - b.position.x, dz = p.z - b.position.z, d = Math.hypot(dx, dz) || 0.001, rimY = Y + RIM;
            if (v.y < 0 && py >= rimY && p.y < rimY && d < BR - 0.15) { caught(it, b); got = true; break; }
            if (p.y < rimY && d < BR + RAD * 0.6) { const k = (BR + RAD * 0.6) / d; p.x = b.position.x + dx * k; p.z = b.position.z + dz * k; const vn = (v.x * dx + v.z * dz) / d; if (vn < 0) { v.x -= 1.6 * vn * dx / d; v.z -= 1.6 * vn * dz / d; } }
          }
          if (got) continue;
          if (p.y < Y + RAD) { p.y = Y + RAD; if (Math.abs(v.y) < 3 || f.b >= 3) { if (Math.hypot(v.x, v.z) < 1.2 || f.t > 5) { rest(it); continue; } v.y = 0; v.x *= 0.9; v.z *= 0.9; } else { v.y = -v.y * 0.5; v.x *= 0.72; v.z *= 0.72; f.b++; SFX.thunk(); } }
          if (f.t > 7) rest(it);
        }
      });
      g.start = () => {
        g.wrong = 0; g.bks.forEach((b, i) => wait(i * 250).then(() => { if (alive()) { b.userData.need = needs[i]; b.userData.show(); } }));
        setQ('zal', ['zal_bros'], () => { const it = g.balls.find(x => !x.done && !x.fly && x.obj.parent === world && g.bks.some(b => b.userData.c === x.c && b.userData.got < b.userData.need)); it && nudge(it.obj); });
      };
      startBtn('zal', cx + 3.4, cz + H - 3.2);
    }

    // =========== КОМНАТА РИСОВАНИЯ (первый этаж, маленькая): сел за мольберт — и рисуешь ===========
    {
      const R = RM.ris, cx = R.cx, cz = R.cz, H = R.hs;
      const rug = mkRug(3.4, '#ffe08a', '#fff8e1'); rug.position.set(cx, 0, cz + 0.6); world.add(rug);
      for (const [x, z, c, r] of [[-2.2, -0.6, '#ff6fae', 0.5], [2.4, 1.6, '#4fc3f7', 0.42], [1.2, -1.4, '#81c784', 0.3], [-1.6, 2.4, '#ba68c8', 0.34]]) { const m = cyl(M(c, 0.7), r, r, 0.03, cx + x, 0.045, cz + z, 20); m.castShadow = false; world.add(m); }
      const w1 = mkWindow('#ff8fb1'); w1.position.set(cx - H + 0.02, 4.3, cz); w1.rotation.y = Math.PI / 2; world.add(w1);
      // мольберт и стульчик
      const mb = mkMolbert(); mb.scale.setScalar(1.55); mb.position.set(cx, 0, cz + 3.4); mb.rotation.y = Math.PI; world.add(mb); obst('ris', cx, cz + 3.6, 1.3, 0.9, 0.4);
      const stl = grp(cx, 0, cz + 1.3); stl.add(ball(M('#ff8fb1', 0.8), [0.75, 0.2, 0.75], 0, 1.25, 0)); stl.add(cyl(M('#ffffff', 0.6), 0.6, 0.6, 0.14, 0, 1.1, 0, 24)); for (let i = 0; i < 3; i++) { const a = i * 2.094, l = cyl(M(WOOD, 0.6), 0.08, 0.1, 1.1, Math.cos(a) * 0.4, 0.55, Math.sin(a) * 0.4, 8); stl.add(l); } world.add(stl); obst('ris', cx, cz + 1.3, 0.5, 0.5, 0.3);
      const sit = () => {
        if (busyWipe || st.sit || !window.openRis) return; st.sit = true; st.path = []; SFX.plop(); squash(stl, 300);
        RESUME = { done: TASKS.filter(k => G[k].done) }; st.look = { yaw: Math.PI, pitch: -0.05 }; tw(st, { hopY: -0.8 }, 420, 'inout');
        wait(520).then(() => { if (alive()) go(() => openRis(() => { try { const c = window.risSnap && window.risSnap(); if (c) { GALLERY.push(c); if (GALLERY.length > 4) GALLERY.shift(); S.gal = GALLERY.map(g => g.toDataURL('image/jpeg', 0.72)); save(); } } catch (e) {} openDom(); })); });
      };
      fun(mb, 'ris', [2.2, 3.4, 1.6, 0, 1.7, 0], sit, { fh: 3.3, stand: () => ({ x: cx, z: cz - 0.6 }) });
      fun(stl, 'ris', [1.6, 1.6, 1.6], sit, { fh: 1.2, noFocus: true, stand: () => ({ x: cx, z: cz - 0.6 }) });
      // парта с прописями: сел — и обводишь пальцем линии, цифры и буквы
      {
        const dx = cx - H + 1.5, dz = cz - 3.6, dk = grp(dx, 0, dz); dk.rotation.y = Math.PI / 2;
        dk.add(rbox(M('#8fd3c1', 0.6), 3.0, 0.2, 1.7, 0.08, 0, 1.5, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) dk.add(cyl(M('#ffffff', 0.6), 0.1, 0.09, 1.5, sx * 1.3, 0.75, sz * 0.65, 8));
        const bd = grp(0, 1.6, -0.45); bd.rotation.x = -0.22; bd.add(rbox(M(WOOD, 0.6), 2.5, 1.9, 0.12, 0.08, 0, 0.95, 0));
        const tex = cnv(256, 192, (x, w, h) => { x.fillStyle = '#3f8f6b'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 9; x.lineCap = 'round'; x.setLineDash([3, 15]); x.font = '900 130px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.strokeText('1', 70, 100); x.strokeText('А', 176, 100); });
        const pl = new T.Mesh(new T.PlaneGeometry(2.3, 1.7), new T.MeshBasicMaterial({ map: tex })); pl.position.set(0, 0.95, 0.07); bd.add(pl); dk.add(bd);
        dk.add(cyl(M('#ffffff', 0.5), 0.07, 0.07, 0.5, 0.9, 1.66, 0.45, 8)); world.add(dk); obst('ris', dx, dz, 0.9, 1.5, 0.4);
        const sitP = () => {
          if (busyWipe || st.sit || !window.openPropis) return; st.sit = true; st.path = []; SFX.plop(); squash(dk, 300);
          RESUME = { done: TASKS.filter(k => G[k].done) };
          wait(420).then(() => { if (alive()) go(() => openPropis(() => openDom())); });
        };
        fun(dk, 'ris', [1.9, 3.6, 3.2, 0, 1.8, 0], sitP, { fh: 4.0, stand: () => ({ x: dx + 3.0, z: dz }) });
      }
      // парта с раскраской по цифрам
      {
        const dx = cx - H + 1.5, dz = cz + 3.6, dk = grp(dx, 0, dz); dk.rotation.y = Math.PI / 2;
        dk.add(rbox(M('#ffc98b', 0.6), 3.0, 0.2, 1.7, 0.08, 0, 1.5, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) dk.add(cyl(M('#ffffff', 0.6), 0.1, 0.09, 1.5, sx * 1.3, 0.75, sz * 0.65, 8));
        const bd = grp(0, 1.6, -0.45); bd.rotation.x = -0.22; bd.add(rbox(M(WOOD, 0.6), 2.5, 1.9, 0.12, 0.08, 0, 0.95, 0));
        const tex = cnv(256, 192, (x, w, h) => { x.fillStyle = '#fffdf5'; x.fillRect(0, 0, w, h); x.lineWidth = 7; x.strokeStyle = '#5d3a24'; x.lineJoin = 'round';
          x.fillStyle = '#ffd54f'; x.fillRect(70, 90, 116, 80); x.strokeRect(70, 90, 116, 80); x.fillStyle = '#ef5350'; x.beginPath(); x.moveTo(52, 92); x.lineTo(128, 26); x.lineTo(204, 92); x.closePath(); x.fill(); x.stroke();
          x.fillStyle = '#ffffff'; x.fillRect(140, 108, 30, 30); x.strokeRect(140, 108, 30, 30); x.fillStyle = '#5d3a24'; x.font = '900 40px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1', 128, 66); x.fillText('2', 104, 134); });
        const pl = new T.Mesh(new T.PlaneGeometry(2.3, 1.7), new T.MeshBasicMaterial({ map: tex })); pl.position.set(0, 0.95, 0.07); bd.add(pl); dk.add(bd);
        ['#ef5350', '#42a5f5', '#66bb6a'].forEach((c, i) => dk.add(cyl(M(c, 0.5), 0.16, 0.16, 0.3, -0.8 + i * 0.45, 1.75, 0.5, 12))); world.add(dk); obst('ris', dx, dz, 0.9, 1.5, 0.4);
        const sitR = () => {
          if (busyWipe || st.sit || !window.openRask) return; st.sit = true; st.path = []; SFX.plop(); squash(dk, 300);
          RESUME = { done: TASKS.filter(k => G[k].done) };
          wait(420).then(() => { if (alive()) go(() => openRask(() => openDom())); });
        };
        fun(dk, 'ris', [1.9, 3.6, 3.2, 0, 1.8, 0], sitR, { fh: 4.0, stand: () => ({ x: dx + 3.0, z: dz }) });
      }
      // полка с красками и стаканчик с кистями
      const sh = grp(cx + H - 0.6, 0, cz - 0.5); sh.rotation.y = -Math.PI / 2;
      for (const y of [1.3, 2.7]) sh.add(rbox(M(WOOD, 0.6), 4.4, 0.18, 0.9, 0.06, 0, y, 0)); for (const s of [-1, 1]) sh.add(rbox(M(WOOD, 0.6), 0.18, 3.0, 0.9, 0.06, s * 2.2, 1.5, 0));
      Object.values(COLORS).forEach((c, i) => { const j = grp(-1.6 + (i % 4) * 1.05, i < 4 ? 1.39 : 2.79, 0); j.add(cyl(M('#ffffff', 0.4), 0.3, 0.26, 0.55, 0, 0.28, 0, 16)); j.add(cyl(M(c, 0.5), 0.31, 0.31, 0.12, 0, 0.58, 0, 16)); j.add(cyl(M(c, 0.5), 0.305, 0.27, 0.22, 0, 0.2, 0, 16)); sh.add(j); });
      { const cup = grp(0.9, 2.79, 0); cup.add(cyl(M('#4fc3f7', 0.5), 0.26, 0.22, 0.6, 0, 0.3, 0, 16)); [['#f0352b', -0.2], ['#ffd21f', 0.05], ['#35b24a', 0.25]].forEach(([c, a]) => { const b = grp(0, 0.3, 0); b.rotation.z = a; b.add(cyl(M(WOOD, 0.6), 0.035, 0.035, 0.9, 0, 0.45, 0, 6)); b.add(ball(M(c, 0.5), [0.07, 0.13, 0.07], 0, 0.95, 0)); cup.add(b); }); sh.add(cup); }
      world.add(sh); obst('ris', cx + H - 0.6, cz - 0.5, 0.6, 2.3, 0.4);
      fun(sh, 'ris', [4.4, 3.4, 1.2, 0, 1.7, 0], () => { wobble(sh, 0.03); [0, 2, 4].forEach((n, i) => tone(NOTY[n], i * 0.09, 0.16, 'triangle', 0.1)); burst(V(cx + H - 1.2, 3.4, cz - 0.5), 10, Object.values(COLORS)); }, { fh: 3.6 });
      // большие карандаши в углах: нажмёшь — звенят
      [[-H + 1.3, -H + 1.3], [-H + 2.5, -H + 1.1], [-H + 1.1, -H + 2.5], [H - 1.3, H - 1.3], [H - 2.5, H - 1.1], [-H + 1.3, H - 1.3]].forEach(([dx, dz], i) => {
        const c = Object.values(COLORS)[i % 8], h = 3.2 + (i % 3) * 0.7, p = grp(cx + dx, 0, cz + dz);
        p.add(cyl(M(c, 0.5), 0.34, 0.34, h, 0, h / 2, 0, 18)); p.add(cyl(M('#f6d7a7', 0.7), 0.34, 0.02, 0.8, 0, h + 0.4, 0, 18)); p.add(cyl(M(c, 0.5), 0.1, 0.0, 0.26, 0, h + 0.67, 0, 12)); p.add(cyl(M('#ffffff', 0.5), 0.36, 0.36, 0.18, 0, h * 0.75, 0, 18));
        p.rotation.y = i; world.add(p); obst('ris', cx + dx, cz + dz, 0.4, 0.4, 0.3);
        fun(p, 'ris', [1.0, h + 0.8, 1.0], () => { wobble(p, 0.08); tone(NOTY[i % NOTY.length], 0, 0.2, 'triangle', 0.12); }, { fh: h + 1.2 });
      });
      // палитра художника на стене и цветные кляксы
      { const pl = grp(cx - H + 0.12, 4.6, cz + H - 3.2); pl.rotation.y = Math.PI / 2; const b = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 0.12, 40), M('#e0b07a', 0.6)); b.rotation.x = Math.PI / 2; b.scale.set(1.25, 1, 1); pl.add(b);
        const hole = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.14, 24), M('#c48a52', 0.7)); hole.rotation.x = Math.PI / 2; hole.position.set(0.9, -0.55, 0.01); pl.add(hole);
        Object.values(COLORS).slice(0, 6).forEach((c, i) => { const a = 2.6 - i * 0.62, d = ball(M(c, 0.35), [0.32, 0.32, 0.12], Math.cos(a) * 1.25, Math.sin(a) * 0.95, 0.08); pl.add(d); });
        world.add(pl);
        [[-H + 0.05, 2.0, -2.5, '#ff6fae', 0.6], [-H + 0.05, 6.4, 2.0, '#4fc3f7', 0.45], [H - 0.05, 5.8, -4.6, '#ffd54f', 0.55], [H - 0.05, 1.6, 4.4, '#81c784', 0.5]].forEach(([x, y, z, c, r]) => { const k = grp(cx + x, y, cz + z); k.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; for (let j = 0; j < 5; j++) { const a = j * 1.26, q = cyl(M(c, 0.6), r * (j ? 0.35 : 1), r * (j ? 0.35 : 1), 0.04, j ? Math.cos(a) * r * 1.4 : 0, j ? Math.sin(a) * r * 1.4 : 0, 0, 20); q.rotation.x = Math.PI / 2; q.castShadow = false; k.add(q); } world.add(k); });
      }
      // галерея: рисунки на стене за мольбертом
      const fc = ['#ff8fb1', '#4fc3f7', '#ffd54f', '#81c784'];
      for (let i = 0; i < 4; i++) {
        const src = GALLERY[GALLERY.length - 1 - i], f = grp(cx - 4.05 + i * 2.7, 5.0, cz + H - 0.1); f.rotation.y = Math.PI; f.rotation.z = [0.04, -0.03, 0.03, -0.04][i];
        const fr = rbox(M(fc[i], 0.6), 2.4, 1.9, 0.14, 0.12); fr.castShadow = false; f.add(fr);
        let map; if (src) { map = new T.CanvasTexture(src); map.encoding = T.sRGBEncoding; } else map = picTex(i % 3);
        const p = new T.Mesh(new T.PlaneGeometry(2.1, 1.6), new T.MeshBasicMaterial({ map })); p.position.z = 0.08; f.add(p); world.add(f);
      }
    }

    // =========================== ТРЕТИЙ ЭТАЖ: БУКВЫ ===========================
    const LET3 = ['А', 'М', 'У', 'З', 'Я', 'Р', 'К', 'Д', 'Ш'], LET10 = [...'АОУМИКДТРШ'];
    const ITEMS3 = [['arbuz', 'А', mkArbuz, 1.2, 0.58], ['myach', 'М', () => mkMyach(COLORS.siniy), 0.85, 0.52], ['utka', 'У', () => mkToy('utka'), 1.1, 0.0], ['zvezda', 'З', () => mkToy('zvezda'), 1.05, 0.7],
        ['yabloko', 'Я', () => mkToy('yabloko'), 1.0, 0.45], ['rybka', 'Р', () => mkRybka(), 1.3, 0.48], ['kubik', 'К', mkKubik, 1.1, 0.5], ['domik', 'Д', mkDomik, 1.15, 0.0], ['sharik', 'Ш', () => mkShar('#ff6fae'), 0.5, 1.5]];
    const WORD3 = Object.fromEntries(ITEMS3.map(q => [q[1], q[0]]));
    const billboard = (o, y0) => TICK.push(t => { if (o.visible) { o.rotation.y = st.yaw; o.position.y = y0 + Math.sin(t * 2) * 0.08; } });
    const bigSign = (x, y, z, room) => { // табличка с большой буквой, всегда смотрит на Зайку
      const s = grp(x, y, z); s.add(rbox(M('#ffffff', 0.5), 2.5, 2.5, 0.18, 0.55)); s.add(rbox(M('#ffc928', 0.4), 2.75, 2.75, 0.1, 0.6, 0, 0, -0.06));
      const m = new T.MeshBasicMaterial({ transparent: true }), p = new T.Mesh(new T.PlaneGeometry(2.3, 2.3), m); p.position.z = 0.11; p.renderOrder = 2; s.add(p);
      s.traverse(o => { if (o.isMesh) o.castShadow = false; }); s.visible = false; world.add(s); billboard(s, y);
      s.userData.show = (ch, col = '#e2574c') => { m.map = letTex(ch, col); m.needsUpdate = true; s.visible = true; s.scale.setScalar(0.3); tws(s, 1, 420, 'back'); };
      return s;
    };
    const plant = (room, x, z, y) => { const p = mkPlant(); p.position.set(x, y, z); world.add(p); obst(room, x, z, 0.5, 0.5, 0.5); fun(p, room, [1.6, 2.8, 1.6], () => { wobble(p, 0.12); SFX.chirp(); burst(V(x, y + 2.6, z), 6, ['#66c45c', '#4fae4d', '#ff6b8a']); }); };

    // ---------- холл букв: найди шарик с нужной буквой ----------
    {
      const R = RM.h3, cx = R.cx, cz = R.cz, Y = R.y, H = R.hs;
      const AB = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';
      for (const sg of [-1, 1]) for (let i = 0; i < 14; i++) { // азбука под потолком
        const ch = AB[(sg > 0 ? 13 : 0) + i] || 'Я', p = letPlate(ch, LCOL[i % 8], 0.84, { bg: '#ffffff' });
        p.position.set(cx + (sg > 0 ? 6.5 - i : -6.5 + i), Y + 6.78, cz + sg * (H - 0.06)); p.rotation.y = sg > 0 ? Math.PI : 0; world.add(p);
      }
      for (const x of [-5.3, 5.3]) { const w = mkWindow('#ffb74d'); w.position.set(cx + x, Y + 4.1, cz - H + 0.02); w.scale.set(0.8, 0.8, 1); world.add(w); }
      for (const [x, k, c] of [[-5.3, 0, '#4fc3f7'], [5.3, 2, '#ff8fb1']]) { const pc = mkPicture(k, c); pc.position.set(cx + x, Y + 4.2, cz + H - 0.1); pc.rotation.y = Math.PI; world.add(pc); }
      const rug = mkRug(4.4, '#ffe08a', '#ffffff'); rug.position.set(cx, Y, cz); world.add(rug);
      plant('h3', cx - 6.8, cz - 6.8, Y); plant('h3', cx + 6.8, cz + 6.8, Y);
      { const sh = mkShelf(true); sh.position.set(cx + H - 0.75, Y, cz - 5.0); sh.rotation.y = -Math.PI / 2; world.add(sh); obst('h3', cx + H - 0.75, cz - 5.0, 0.7, 1.9, 0.5); }

      const sp3 = stp('h3'), byWord = lvl === 2 && sp3 > 0; // 5–7 лет: «с какой буквы начинается слово?»
      const pool3 = lvl === 0 ? ['А', 'О', 'У', 'М', 'И'].slice(0, 3 + sp3) : lvl === 1 ? LET10 : byWord ? LET3 : Object.keys(LV);
      const n = lvl === 0 ? 3 + sp3 : lvl === 1 ? [4, 5, 6][sp3] : 6, lets = wsel(pool3, n, 'b_'), COLS = ['#ff6fae', '#4fc3f7', '#ffd21f', '#81c784', '#ff8a65', '#ba68c8'];
      const P = [[-4.6, 4.7, -4.6], [4.2, 5.0, -4.4], [-4.9, 5.2, 4.3], [4.7, 4.8, 4.6], [-1.6, 5.4, -6.0], [1.9, 5.3, 6.1]];
      const g = G.h3 = { intro: 'bukvy_intro', left: lvl === 0 ? 3 : 4, balls: [] };
      const sign = bigSign(cx, Y + 4.7, cz, 'h3');
      lets.forEach((ch, i) => {
        const b = mkShar(COLS[i]), U = b.userData; U.ch = ch; U.by = Y + P[i][1]; U.cy = 0; U.ph = i * 1.7;
        const pl = letPlate(ch, '#ffffff', 1.2, { out: '#5d3a24' }); pl.position.set(0, 0.05, 0.84); b.add(pl);
        b.position.set(cx + P[i][0], U.by, cz + P[i][2]); b.scale.setScalar(0.95); hitBox(b, 2.2, 2.7, 2.2, 0, -0.1, 0);
        const wt = ball(M(COLS[i], 0.5), 0.2, cx + P[i][0], Y + 0.2, cz + P[i][2]); world.add(wt);
        const str = cyl(M('#9a9a9a', 0.8), 0.014, 0.014, 1, cx + P[i][0], Y + 1, cz + P[i][2], 4); str.castShadow = false; world.add(str); U.str = str;
        world.add(b); g.balls.push(b); popIn(b, 0.95, 300 + i * 120);
        inter(b, { room: 'h3', far: true, fh: 1.6, look: () => wpos(b), act: () => { if (g.tapBall) g.tapBall(b); else { wobble(b, 0.3); say(['eto_bukva', bv(ch)]); } } });
      });
      TICK.push(t => g.balls.forEach(b => { const U = b.userData; if (!b.parent) return; b.position.y = U.by + Math.sin(t * 1.3 + U.ph) * 0.14; b.rotation.z = Math.sin(t * 0.9 + U.ph) * 0.06; b.rotation.y = st.yaw; const y0 = Y + 0.3, y1 = b.position.y - 2.75; U.str.scale.y = Math.max(0.01, y1 - y0); U.str.position.y = (y0 + y1) / 2; }));
      g.start = () => {
        const tb = wpick(g.balls.filter(b => b.parent && !b.userData.popped), b => 'b_' + b.userData.ch), ch = tb.userData.ch, q = byWord ? ['s_kakoy_bukvy', 'sl_' + WORD3[ch]] : ['najdi_bukvu', bv(ch)]; g.wrong = 0; if (byWord) sign.userData.show('?', '#9aa7ad'); else sign.userData.show(ch);
        g.tapBall = async b => {
          const U = b.userData; if (U.popped) return;
          if (g.done || g.busy) { wobble(b, 0.3); say(['eto_bukva', bv(U.ch)]); return; }
          if (U.ch === ch) {
            g.busy = true; g.balls.forEach(unmark); U.popped = true; uninter(b); okk('b_' + ch);
            SFX.pop(); const pos = b.position.clone();
            await tws(b, 1.3, 90, 'out'); world.remove(b); world.remove(U.str);
            burst(pos, 22, [b.children[0].material.color.getStyle(), '#ffffff', '#ffd54f'], { conf: true, speed: 1.2 }); SFX.good();
            g.left--; g.busy = false; sign.visible = false;
            const fin = byWord ? ['sl_' + WORD3[ch], 'na_bukvu', bv(ch)] : [bv(ch)];
            if (g.left <= 0) { g.q = null; await say(fin); if (alive()) roomDone('h3', pos); return; }
            g.q = null; Idle.off();
            await say(fin.concat([praise()])); if (alive()) g.start();
          } else {
            const hint = miss(g); bad('b_' + ch); wobble(b, 0.35); if (hint) mark(tb, 1.5);
            say(['eto_bukva', bv(U.ch), hint ? 'podskazka' : null].concat(q));
          }
        };
        g.tgt = () => tb; setQ('h3', q, () => { if (!byWord) nudge(tb); wobble(sign, 0.1); });
      };
      startBtn('h3', cx - 3.2, cz + 2.8);
    }

    // ---------- почта: письмо в ящик с такой же буквой ----------
    {
      const R = RM.poch, cx = R.cx, cz = R.cz, Y = R.y, H = R.hs; // дверь в северной стене
      { const w = mkWindow('#81d4fa'); w.position.set(cx - H + 0.02, Y + 4.3, cz - 1.0); w.rotation.y = Math.PI / 2; w.scale.set(0.85, 0.85, 1); world.add(w); }
      const rug = mkRug(3.6, '#9fd8ef', '#ffffff'); rug.position.set(cx, Y, cz + 1.0); world.add(rug);
      plant('poch', cx - 5.8, cz + 5.8, Y);
      { // полка с посылками
        const sh = grp(cx + H - 0.7, Y, cz - 1.5); sh.rotation.y = -Math.PI / 2; for (const y of [1.2, 2.6]) sh.add(rbox(M(WOOD, 0.6), 4.0, 0.16, 1.0, 0.05, 0, y, 0)); for (const sx of [-1, 1]) sh.add(rbox(M(WOOD, 0.6), 0.16, 2.8, 1.0, 0.05, sx * 2.0, 1.4, 0));
        [[-1.2, 1.28, 0.9, '#d9a066'], [0.2, 1.28, 0.7, '#e8b27a'], [1.3, 1.28, 0.8, '#d9a066'], [-0.8, 2.68, 0.75, '#e8b27a'], [0.8, 2.68, 0.9, '#d9a066']].forEach(([x, y, s, c]) => { sh.add(rbox(M(c, 0.8), s * 1.1, s * 0.8, s * 0.8, 0.08, x, y + s * 0.4, 0)); sh.add(rbox(M('#ff6fae', 0.6), 0.1, s * 0.82, s * 0.82, 0.03, x, y + s * 0.4, 0)); });
        world.add(sh); obst('poch', cx + H - 0.7, cz - 1.5, 0.6, 2.1, 0.4);
      }
      const spP = stp('poch'), pmode = ['fig', 'let', 'pic'][lvl]; // 3–4: такая же картинка; 4–5: такая же буква; 5–7: с какой буквы начинается слово
      const n = P3('poch', [[3, 3, 4], [3, 4, 5], [4, 5, 5]]), lets = pmode === 'fig' ? shuffle(Object.keys(FIGCH)).slice(0, n) : wsel(pmode === 'let' ? LET10 : LET3, n, 'b_'), BC = ['#f0352b', '#2a6df4', '#35b24a', '#ff8a1c', '#b25de0'];
      const g = G.poch = { intro: pmode === 'fig' ? 'pochta_intro_a' : pmode === 'pic' ? 'pochta_intro_c' : 'pochta_intro', left: n, boxes: [], envs: [] };
      const bz = cz + H - 0.9, sp = n === 5 ? 2.55 : 3.0;
      lets.forEach((ch, i) => {
        const x = cx + (i - (n - 1) / 2) * sp, b = grp(x, Y, bz), col = BC[i]; b.rotation.y = Math.PI;
        b.add(cyl(M('#ffffff', 0.6), 0.12, 0.15, 1.6, 0, 0.8, 0, 10));
        b.add(rbox(M(col, 0.45), 1.9, 1.4, 1.1, 0.34, 0, 2.25, 0)); b.add(ball(M(col, 0.45), [0.94, 0.42, 0.54], 0, 2.9, 0));
        b.add(rbox(M('#3a2a20', 0.8), 1.15, 0.14, 0.06, 0.05, 0, 2.72, 0.55));
        const pl = letPlate(ch, col, 1.0, { bg: '#ffffff' }); pl.position.set(0, 2.08, 0.565); b.add(pl);
        const fl = grp(-1.0, 2.15, 0); fl.add(cyl(M('#9aa7ad', 0.3), 0.04, 0.04, 1.0, 0, 0.5, 0, 6)); fl.add(rbox(M('#ff3b30', 0.5), 0.5, 0.32, 0.06, 0.05, -0.27, 0.86, 0)); fl.rotation.z = 1.4; b.add(fl);
        world.add(b); hitBox(b, 2.2, 3.4, 1.6, 0, 1.9, 0); b.userData.cy = 2.3; b.userData.ch = ch; b.userData.flag = fl; g.boxes.push(b); obst('poch', x, bz, 1.0, 0.6, 0.5);
        inter(b, { room: 'poch', fh: 3.8, stand: () => ({ x, z: bz - 3.4 }), look: () => V(x, Y + 2.4, bz), act: () => post(b) });
      });
      // стол с письмами
      const tz = cz + 0.6, tw_ = n * 1.5 + 0.8; { const tb = grp(cx, Y, tz); tb.add(rbox(M(WOOD, 0.55), tw_, 0.2, 1.3, 0.08, 0, 1.2, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb.add(cyl(M(WOOD, 0.6), 0.1, 0.09, 1.2, sx * (tw_ / 2 - 0.25), 0.6, sz * 0.45, 8)); world.add(tb); obst('poch', cx, tz, tw_ / 2, 0.65, 0.5); }
      shuffle(lets).forEach((ch, i) => {
        const e = grp(cx + (i - (n - 1) / 2) * 1.5, Y + 1.78, tz); e.rotation.y = Math.PI; e.rotation.x = -0.12;
        e.add(rbox(M('#fffaf0', 0.6), 1.3, 0.9, 0.08, 0.06));
        const fp_ = mesh(new T.CylinderGeometry(0.62, 0.62, 0.02, 3), M('#f1e3c8', 0.6), 0, 0.33, 0.045); fp_.rotation.x = Math.PI / 2; fp_.scale.z = 0.4; fp_.castShadow = false; e.add(fp_);
        e.add(rbox(M(pmode === 'fig' || (pmode === 'let' && spP === 0) ? BC[lets.indexOf(ch)] : '#ff6fae', 0.5), 0.22, 0.26, 0.02, 0.03, 0.45, 0.22, 0.05));
        const I3 = pmode === 'pic' && ITEMS3.find(q => q[1] === ch);
        if (I3) { const m = I3[2](), k = I3[3] * 0.34; m.scale.setScalar(k); m.position.set(-0.1, -0.36 + I3[4] * k, 0.22); m.rotation.y = 0.4; m.traverse(o => { if (o.isMesh) o.castShadow = false; }); e.add(m); }
        else { const pl = letPlate(ch, pmode === 'fig' ? BC[lets.indexOf(ch)] : '#3a2a20', 0.6); pl.position.set(-0.08, -0.13, 0.06); e.add(pl); }
        e.userData.cy = 0; hitBox(e, 1.5, 1.4, 1.0); world.add(e);
        const it = { obj: e, ch, key: I3 && I3[0], env: true, hs: 0.8, hy: 0.15 }; g.envs.push(it);
        it.onDrop = p => { e.userData.fp.room = roomOf(p.x, p.z); };
        inter(e, { room: 'poch', fh: 1.3, stand: () => ({ x: e.position.x, z: tz - 2.6 }), look: () => wpos(e), act: () => { take(it); say(I3 ? 'sl_' + I3[0] : nmv(ch)); } });
      });
      async function post(b) {
        const it = st.held, U = b.userData;
        if (!it || !it.env) { wobble(b, 0.05); say(nmv(U.ch)); return; }
        if (g.busy) return;
        if (it.ch !== U.ch) { const hint = g.started && !g.done && miss(g); wobble(b, 0.07); SFX.soft(); const tb = g.boxes.find(x => x.userData.ch === it.ch); if (hint && tb) mark(tb, 3.9, 0.45); if (pmode !== 'fig') bad('b_' + it.ch); say(pmode === 'fig' ? 'drugaya' : pmode === 'pic' ? ['sl_' + it.key, 'pochta_ne_c'] : 'pochta_ne'); return; }
        g.busy = true; g.boxes.forEach(unmark);
        const o = release(it); o.userData.fp.off = true;
        tw(o.rotation, { x: 0, y: Math.PI, z: Math.PI / 2 }, 300); await arc(o, V(b.position.x, Y + 2.72, b.position.z - 0.9), 380, 0.6); await tw(o.position, { z: b.position.z - 0.2 }, 200); o.visible = false;
        SFX.plop(); squash(b, 220); tw(U.flag.rotation, { z: 0 }, 300, 'back'); tone(784, 0, 0.12, 'sine', 0.15); tone(1047, 0.12, 0.2, 'sine', 0.15); burst(V(b.position.x, Y + 3.4, b.position.z - 0.6), 12);
        g.busy = false;
        if (!(g.started && !g.done)) { // без задания письмо возвращается на стол
          say('pochta_da'); wait(1400).then(() => { if (!alive()) return; tw(U.flag.rotation, { z: 1.4 }, 300); o.visible = true; o.position.copy(it.home.p); o.rotation.copy(it.home.r); popIn(o, it.home.s); o.userData.fp.off = false; o.userData.fp.room = 'poch'; });
          return;
        }
        it.done = true; uninter(o); g.left--; okk('b_' + it.ch); g.wrong = 0;
        if (pmode === 'pic') await say(['sl_' + it.key, 'na_bukvu', bv(it.ch)]);
        if (g.left <= 0) { g.q = null; await say('pochta_da'); if (alive()) roomDone('poch', V(b.position.x, Y + 3, b.position.z - 1.2)); return; }
        await say(['pochta_da', praise()]);
      }
      g.start = () => { g.wrong = 0; setQ('poch', [pmode === 'fig' ? 'pochta_q_a' : pmode === 'pic' ? 'pochta_q_c' : 'pochta_q'], () => { const e = g.envs.find(x => !x.done && x.obj.parent === world && !x.obj.userData.fp.off); e && nudge(e.obj); }); };
      startBtn('poch', cx + 4.6, cz - 3.8);
    }

    // ---------- азбука: принеси то, что начинается на букву ----------
    {
      const R = RM.azb, cx = R.cx, cz = R.cz, Y = R.y, H = R.hs; // дверь в южной стене
      for (const x of [-6.5, 6.5]) { const w = mkWindow('#a5d6a7'); w.position.set(cx + x, Y + 4.3, cz - H + 0.02); world.add(w); }
      for (const sg of [-1, 1]) { const w = mkWindow('#ffcc80'); w.position.set(cx + sg * (H - 0.02), Y + 4.3, cz - 2); w.rotation.y = -sg * Math.PI / 2; world.add(w); }
      const rug = mkRug(5.6, '#ffffff', '#ffd6e4'); rug.position.set(cx, Y, cz); world.add(rug);
      plant('azb', cx - H + 1.4, cz - H + 1.4, Y); plant('azb', cx + H - 1.4, cz - H + 1.4, Y); plant('azb', cx - H + 1.4, cz + H - 1.4, Y);
      for (let i = 0; i < 9; i++) { const ch = 'АМУЗЯРКДШ'[i], p = letPlate(ch, LCOL[i % 8], 1.1, { bg: '#ffffff', ring: LCOL[i % 8] }); p.position.set(cx - 8 + i * 2, Y + 6.6, cz - H + 0.08); world.add(p); }
      // постамент посередине
      const pd = grp(cx, Y, cz); pd.add(cyl(M('#ffffff', 0.5), 1.5, 1.7, 1.2, 0, 0.6, 0, 36)); const pr = mesh(new T.TorusGeometry(1.52, 0.12, 10, 44), M('#ffc928', 0.3), 0, 1.2, 0); pr.rotation.x = Math.PI / 2; pd.add(pr); pd.add(ball(M('#ff8fb1', 0.8), [1.3, 0.25, 1.3], 0, 1.3, 0));
      world.add(pd); obst('azb', cx, cz, 1.6, 1.6, 0.5); hitBox(pd, 3.6, 2.4, 3.6, 0, 1.2, 0); pd.userData.cy = 1.4; pd.userData.stat = true;
      const sign = bigSign(cx, Y + 4.8, cz, 'azb'); sign.userData.show('?', '#9aa7ad');
      const g = G.azb = { intro: 'azb_intro', left: 0, items: [] };
      ITEMS3.forEach(([key, ch, mk, s, fy], i) => {
        const a = (i - 4) * 0.6, x = cx + Math.sin(a) * 8.2, z = cz - Math.cos(a) * 8.2, col = LCOL[i % 8];
        const tb = grp(x, Y, z); tb.add(cyl(M(col, 0.55), 0.75, 0.85, 1.05, 0, 0.53, 0, 24)); tb.add(cyl(M('#ffffff', 0.5), 0.92, 0.92, 0.12, 0, 1.1, 0, 28)); world.add(tb); obst('azb', x, z, 0.85, 0.85, 0.45);
        const o = mk(); o.scale.setScalar(s); o.position.set(x, Y + 1.16 + fy * s, z); o.rotation.y = Math.atan2(cx - x, cz - z); o.userData.cy = 0; hitBox(o, 1.7 / s, 1.7 / s, 1.7 / s); world.add(o);
        const it = { obj: o, key, ch, fy: fy * s, hs: s * 0.6, hy: 0 }; g.items.push(it);
        it.onDrop = p => { o.userData.fp.room = roomOf(p.x, p.z); };
        inter(o, { room: 'azb', fh: 1.4 + fy * s, stand: near(o, 3.0), look: () => wpos(o), act: () => { take(it); say('sl_' + key); } });
      });
      const back = it => { const o = it.obj, h = it.home; tws(o, h.s, 400); arc(o, h.p, 520, 1.8).then(() => { if (!alive()) return; o.rotation.copy(h.r); o.userData.fp.off = false; o.userData.fp.room = 'azb'; }); };
      inter(pd, { room: 'azb', fh: 3.0, stand: near(pd, 3.4), look: () => V(cx, Y + 1.6, cz), act: async () => {
        const it = st.held;
        if (!it || !it.key) { wobble(sign, 0.06); if (g.started && !g.done && g.q) say(g.q); else SFX.tap(); return; }
        if (g.busy) return; g.busy = true;
        const o = release(it); o.userData.fp.off = true; tws(o, it.home.s, 300); o.rotation.set(0, st.yaw, 0);
        await arc(o, V(cx, Y + 1.55 + it.fy, cz), 420, 1.0); SFX.thunk(); squash(pd, 200);
        const target = g.started && !g.done ? g.ch : null;
        if (!target) { await say('sl_' + it.key); await wait(500); back(it); g.busy = false; return; }
        if (it.ch === target) {
          g.items.forEach(x => unmark(x.obj)); burst(V(cx, Y + 2.4, cz), 18); SFX.good(); hop(o, 0.6); g.left--;
          await say(['sl_' + it.key, 'na_bukvu', bv(it.ch)]); back(it); g.busy = false; if (!alive()) return;
          if (g.left <= 0) { g.q = null; sign.visible = false; roomDone('azb', V(cx, Y + 3, cz)); return; }
          await say(praise()); if (alive()) next();
        } else {
          const hint = miss(g); if (lvl) bad('b_' + target); wobble(o, 0.2); await say(['sl_' + it.key, 'na_bukvu', bv(it.ch)]); back(it); g.busy = false; if (!alive()) return;
          if (hint) { const t = g.items.find(x => x.ch === target); t && mark(t.obj, 1.3); }
          say(g.q);
        }
      } });
      const spA = stp('azb'); // 3–4: «принеси утку»; 4–5: на букву, буква видна; 5–7: только на слух
      const next = () => { let ch, q; if (lvl === 0) { const k = bag(g, 'i', ITEMS3.map(q => q[0])); ch = ITEMS3.find(q => q[0] === k)[1]; q = ['prinesi', 'sl_' + k]; } else { ch = bag(g, 'l', lvl === 1 && spA === 0 ? ['А', 'М', 'У', 'Я', 'Д'] : LET3); q = ['prinesi_na', bv(ch)]; }
        g.ch = ch; g.wrong = 0; if (lvl === 2 && spA > 0) sign.userData.show('?', '#9aa7ad'); else sign.userData.show(ch); setQ('azb', q, () => { const t = g.items.find(x => x.ch === ch); t && t.obj.parent === world && nudge(t.obj); }); };
      g.intro = lvl === 0 ? 'azb_intro_a' : 'azb_intro'; g.start = () => { g.left = P3('azb', [[3, 3, 4], [3, 4, 4], [5, 5, 5]]); next(); };
      startBtn('azb', cx + 3.6, cz + H - 3.4);
    }

    // =========================== ЧЕТВЁРТЫЙ ЭТАЖ: СЛОВА И ЛОГИКА ===========================
    // ---------- собери слово из кубиков с буквами ----------
    {
      const R = RM.h4, cx = R.cx, cz = R.cz, Y = R.y, H = R.hs; // двери на западе и юге
      { const w = mkWindow('#f48fb1'); w.position.set(cx - 5.6, Y + 4.3, cz + H - 0.02); w.rotation.y = Math.PI; w.scale.set(0.8, 0.8, 1); world.add(w); }
      const rug = mkRug(4.8, '#ffd6e4', '#ffffff'); rug.position.set(cx, Y, cz + 3.0); world.add(rug);
      plant('h4', cx + H - 1.3, cz + H - 1.3, Y); plant('h4', cx - H + 1.3, cz - H + 1.3, Y);
      // доска на северной стене и полочка для картинки
      const bz = cz - H + 0.3, board = grp(cx, Y, bz);
      board.add(rbox(M('#ff8fb1', 0.5), 11.0, 3.5, 0.2, 0.5, 0, 2.6, -0.06)); board.add(rbox(M('#ffffff', 0.6), 10.5, 3.0, 0.3, 0.45, 0, 2.6, 0));
      board.add(rbox(M(WOOD, 0.6), 3.4, 0.2, 1.1, 0.08, 0, 4.6, 0.5)); for (const sx of [-1, 1]) { const br = rbox(M(WOOD, 0.6), 0.16, 0.6, 0.9, 0.05, sx * 1.4, 4.3, 0.4); board.add(br); }
      world.add(board); hitBox(board, 11, 3.8, 1.4, 0, 2.6, 0.6); board.userData.cy = 2.6; board.userData.stat = true;
      const WORD = { kot: ['КОТ', () => mkZver('koshka'), 1.25, 0], dom: ['ДОМ', mkDomik, 1.7, 0], myach: ['МЯЧ', () => mkMyach(COLORS.krasny), 1.15, 0.6], shar: ['ШАР', () => mkShar('#4fc3f7'), 0.6, 2.9],
        med: ['МЁД', mkMed, 1.5, 0.46], utka: ['УТКА', () => mkZver('utka'), 1.2, 0], ryba: ['РЫБА', () => mkRybka('#4fc3f7'), 2.0, 0.36], sharik: ['ШАРИК', () => mkShar('#ffd21f'), 0.6, 2.9] };
      const SP = [[-6, 1.5], [-6, 5.5], [-3.6, 3.2], [-3.6, 6.6], [-1.4, 1.8], [-1.4, 5.0], [2.6, 2.6], [2.6, 6.4], [4.8, 1.0], [4.8, 4.4], [6.6, 2.8], [6.6, 6.6]];
      const sp4 = stp('h4'), figs4 = lvl === 0; // 3–4 года: повтори ряд кубиков с фигурами; дальше слова
      const g = G.h4 = { intro: figs4 ? 'kubiki_intro' : 'slovo_intro', left: P3('h4', [[2, 3, 3], [2, 3, 3], [3, 3, 3]]), cubes: [], slots: [] };
      let word = null, model = null, idx = 0;
      const mkCube = (ch, col) => {
        const c = grp(); c.add(rbox(M(col, 0.45), 1.1, 1.1, 1.1, 0.26));
        for (const [x, y, z, rx, ry] of [[0, 0, 0.565, 0, 0], [0, 0, -0.565, 0, Math.PI], [0.565, 0, 0, 0, Math.PI / 2], [-0.565, 0, 0, 0, -Math.PI / 2], [0, 0.565, 0, -Math.PI / 2, 0]]) { const p = letPlate(ch, '#ffffff', 0.92, { out: 'rgba(70,40,30,.5)' }); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); c.add(p); }
        return c;
      };
      function setWord() {
        let key = null, txt, mk, s, fy;
        if (figs4) txt = shuffle(Object.keys(FIGCH)).slice(0, [2, 3, 3][sp4]).join('');
        else { key = bag(g, 'w', lvl === 2 && sp4 > 0 ? ['utka', 'ryba', 'sharik'] : ['kot', 'dom', 'myach', 'shar', 'med']); [txt, mk, s, fy] = WORD[key]; }
        word = { key, txt }; idx = 0; g.wrong = 0; model = null;
        if (key) { model = mk(); model.position.set(cx, Y + 4.7 + fy * s, bz + 0.55); world.add(model); popIn(model, s, 200); }
        g.slots = [...txt].map((ch, i) => { const p = new T.Mesh(new T.PlaneGeometry(1.6, 1.6), new T.MeshBasicMaterial({ map: letTex(figs4 || (lvl === 1 && sp4 < 2) ? ch : '', figs4 ? LCOL[i] : '#5d3a24', { bg: '#f3efff', ring: '#c9bfff', faint: !figs4 }), transparent: true })); p.position.set((i - (txt.length - 1) / 2) * 1.9, 2.6, 0.17); board.add(p); return p; });
        const extra = shuffle((figs4 ? Object.keys(FIGCH) : 'АОУКМДТРШЯ'.split('')).filter(c => !txt.includes(c))).slice(0, P3('h4', [[0, 1, 2], [1, 2, 2], [3, 3, 3]])), lets = shuffle([...txt, ...extra]), spots = shuffle(SP);
        g.cubes = lets.map((ch, i) => {
          const o = mkCube(ch, LCOL[(i * 3) % 8]); o.position.set(cx + spots[i][0], Y + 0.56, cz + spots[i][1]); o.rotation.y = rr(-0.5, 0.5); o.userData.cy = 0; hitBox(o, 1.6, 1.6, 1.6); world.add(o); popIn(o, 1, 300 + i * 90);
          const it = { obj: o, ch, cube: true, hs: 0.55, hy: 0.1, fy: 0.56 }; it.onDrop = p => { o.userData.fp.room = roomOf(p.x, p.z); };
          inter(o, { room: 'h4', fh: 1.4, stand: near(o, 2.8), look: () => wpos(o), act: () => { take(it); say(bv(ch)); } });
          return it;
        });
        setQ('h4', figs4 ? ['kubiki_kak'] : ['slovo_sobery', 'sl_' + key], () => { const c = g.cubes.find(c => !c.done && c.ch === txt[idx] && c.obj.parent === world); c && nudge(c.obj); });
      }
      inter(board, { room: 'h4', fh: 6.6, stand: () => ({ x: cx, z: bz + 4.4 }), look: () => V(cx, Y + 2.8, bz), act: async () => {
        const it = st.held;
        if (!word) { wobble(board, 0.01); SFX.tap(); return; }
        if (!it || !it.cube) { say(g.q || 'slovo_intro'); return; }
        if (g.busy) return;
        const need = word.txt[idx];
        if (it.ch !== need) { const hint = miss(g); if (!figs4) bad('b_' + need); wobble(board, 0.01); putBack(it); say([figs4 ? 'drugaya' : 'slovo_ne']); if (hint) { const c = g.cubes.find(c => !c.done && c.ch === need && st.held !== c); c && mark(c.obj, 1.3); } return; }
        g.busy = true; g.wrong = 0; g.cubes.forEach(c => unmark(c.obj));
        const o = release(it); uninter(o); it.done = true; const dst = g.slots[idx].getWorldPosition(new T.Vector3()); dst.z += 0.62;
        tw(o.rotation, { x: 0, y: 0, z: 0 }, 300); tws(o, 1.4, 300); await arc(o, dst, 380, 0.8);
        SFX.thunk(); tone(392 + idx * 90, 0, 0.18, 'triangle', 0.12); burst(dst, 6); idx++; g.busy = false;
        if (idx < word.txt.length) { say(bv(it.ch)); return; }
        g.busy = true; Idle.off(); g.q = null; await wait(400); SFX.good(); model && hop(model, 0.6); burst(V(cx, Y + 5.4, bz + 0.9), 22);
        if (word.key) await say(['slovo_gotovo', 'sl_' + word.key]); if (!alive()) return; g.left--; await wait(600); if (!alive()) return;
        if (st.held && st.held.cube) { const h = release(st.held); world.remove(h); }
        const old = g.cubes, om = model; g.cubes = []; old.forEach((c, i) => { if (c.obj.userData.fp) uninter(c.obj); tws(c.obj, 0.001, 300, 'in', i * 60).then(() => world.remove(c.obj)); }); om && tws(om, 0.001, 300).then(() => world.remove(om));
        g.slots.forEach(p => board.remove(p)); g.slots = []; word = null; g.busy = false;
        if (g.left <= 0) { roomDone('h4', V(cx, Y + 3, bz + 2)); return; }
        await say(praise()); if (alive()) setWord();
      } });
      g.start = () => setWord(); g.word = () => word;
      startBtn('h4', cx - 4.0, cz + 4.2);
    }

    // ---------- что будет дальше: продолжи ряд ----------
    {
      const R = RM.logic, cx = R.cx, cz = R.cz, Y = R.y, H = R.hs; // дверь в северной стене
      for (const sg of [-1, 1]) { const w = mkWindow('#b39ddb'); w.position.set(cx + sg * (H - 0.02), Y + 4.3, cz - 1.0); w.rotation.y = -sg * Math.PI / 2; w.scale.set(0.8, 0.8, 1); world.add(w); }
      const rug = mkRug(3.4, '#fff3b0', '#ffffff'); rug.position.set(cx, Y, cz); world.add(rug);
      plant('logic', cx - H + 1.2, cz + H - 1.2, Y); plant('logic', cx + H - 1.2, cz + H - 1.2, Y);
      const tz = cz + 3.9, tb = grp(cx, Y, tz); tb.add(rbox(M(WOOD, 0.55), 10.6, 0.24, 2.0, 0.1, 0, 1.4, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) tb.add(cyl(M(WOOD, 0.6), 0.12, 0.1, 1.4, sx * 5.0, 0.7, sz * 0.8, 8));
      const SX = i => (2.5 - i) * 1.72; // ряд читается слева направо, когда входишь с севера for (let i = 0; i < 6; i++) tb.add(cyl(M(i === 5 ? '#fff3b0' : '#ffffff', 0.6), 0.68, 0.68, 0.06, SX(i), 1.55, 0, 28));
      world.add(tb); obst('logic', cx, tz, 5.3, 1.0, 0.5);
      const qr = mesh(new T.TorusGeometry(0.72, 0.07, 10, 36), new T.MeshBasicMaterial({ color: C('#ffc928') }), cx + SX(5), Y + 1.62, tz); qr.rotation.x = Math.PI / 2; qr.visible = false; world.add(qr);
      const qp = letPlate('?', '#ff8a1c', 1.1, { bg: '#ffffff', ring: '#ffc928' }); qp.position.set(cx + SX(5), Y + 3.0, tz); qp.visible = false; world.add(qp); billboard(qp, Y + 3.0);
      TICK.push(t => { if (qr.visible) qr.scale.setScalar(1 + Math.sin(t * 5) * 0.08); });
      const PX = j => cx + (j - 1) * 3.3, pz = cz - 0.6, peds = [0, 1, 2].map(j => { const p = grp(PX(j), Y, pz); p.add(cyl(M(['#ff8fb1', '#81d4fa', '#a5d6a7'][j], 0.55), 0.7, 0.8, 1.2, 0, 0.6, 0, 24)); p.add(cyl(M('#ffffff', 0.5), 0.86, 0.86, 0.1, 0, 1.24, 0, 28)); world.add(p); obst('logic', PX(j), pz, 0.8, 0.8, 0.4); return p; });
      const FIGS = ['krug', 'kvadrat', 'treugolnik', 'zvezda', 'serdce'];
      const mkEl = el => { // мячик или фигурка нужного цвета и размера
        let o; if (el.t === 'ball') { o = mkMyach(el.c); o.userData.dy = 0.6 * 0.55 * el.s; o.scale.setScalar(0.55 * el.s); }
        else { o = mkFigura(el.f); o.children[0].material = M(el.c, 0.28); o.scale.setScalar(0.42 * el.s); o.userData.dy = 0.42 * el.s; }
        return o;
      };
      const elId = el => el.t + el.c + (el.f || '') + el.s;
      const g = G.logic = { intro: 'dalshe_intro', left: 0 };
      let row = [], chs = [], ans = -1;
      const clear = () => { row.concat(chs.map(c => c.o)).forEach(o => { if (o.userData.fp) uninter(o); tws(o, 0.001, 260).then(() => world.remove(o)); }); row = []; chs = []; qr.visible = qp.visible = false; };
      function round() {
        const cols = shuffle(Object.values(COLORS)), figs = shuffle(FIGS), kinds = P3('logic', [[['AB'], ['AB'], ['AB', 'ABf']], [['AB', 'AAB'], ['AB', 'AAB', 'ABf'], ['AAB', 'ABB', 'ABf', 'size']], [['ABC', 'AAB', 'ABB', 'size', 'ABf'], ['ABC', 'AAB', 'ABB', 'size', 'ABf'], ['ABC', 'AAB', 'ABB', 'size', 'ABf']]]), nopt = lvl === 0 && stp('logic') < 1 ? 2 : 3, px = j => PX(nopt === 2 ? j * 2 : j), kind = bag(g, 'k', kinds);
        const ball_ = c => ({ t: 'ball', c, s: 1 }), fig = (f, c, s = 1) => ({ t: 'fig', f, c, s });
        let E, pat;
        if (kind === 'AB') { E = { A: ball_(cols[0]), B: ball_(cols[1]) }; pat = 'ABABAB'; }
        else if (kind === 'AAB') { E = { A: ball_(cols[0]), B: ball_(cols[1]) }; pat = 'AABAAB'; }
        else if (kind === 'ABB') { E = { A: fig(figs[0], cols[0]), B: fig(figs[1], cols[1]) }; pat = 'ABBABB'; }
        else if (kind === 'ABC') { E = { A: ball_(cols[0]), B: ball_(cols[1]), C: ball_(cols[2]) }; pat = 'ABCABC'; }
        else if (kind === 'size') { E = { A: fig(figs[0], cols[0], 1.35), B: fig(figs[0], cols[0], 0.7) }; pat = 'ABABAB'; }
        else { E = { A: fig(figs[0], cols[0]), B: fig(figs[1], cols[1]) }; pat = 'ABABAB'; }
        const answer = E[pat[5]], pool = Object.values(E).filter(e => elId(e) !== elId(answer)).concat([kind === 'size' ? fig(figs[0], cols[0], 1.0) : (answer.t === 'ball' ? ball_(cols[3]) : fig(figs[2], cols[2]))]);
        const opts = shuffle([answer].concat(shuffle(pool).slice(0, nopt - 1))); ans = opts.findIndex(e => elId(e) === elId(answer));
        for (let i = 0; i < 5; i++) { const o = mkEl(E[pat[i]]), s = o.scale.x; o.position.set(cx + SX(i), Y + 1.58 + o.userData.dy, tz); world.add(o); popIn(o, s, 150 + i * 160); row.push(o); }
        wait(950).then(() => { if (alive() && row.length) { qr.visible = qp.visible = true; popIn(qp, 1); } });
        chs = opts.map((el, j) => {
          const o = mkEl(el), s = o.scale.x; o.position.set(px(j), Y + 1.3 + o.userData.dy, pz); o.userData.cy = 0; hitBox(o, 1.6 / s, 1.6 / s, 1.6 / s); world.add(o); popIn(o, s, 1100 + j * 120);
          inter(o, { room: 'logic', fh: 1.4, stand: () => ({ x: px(j), z: pz - 3.0 }), look: () => wpos(o), act: () => choose(j) });
          return { o, s };
        });
        g.wrong = 0; setQ('logic', ['dalshe_q'], () => { nudge(chs[ans].o); qr.scale.setScalar(1.3); });
      }
      async function choose(j) {
        const c = chs[j]; if (!c) return;
        if (!g.started || g.done || g.busy) { hop(c.o, 0.3); SFX.boing(); return; }
        if (j !== ans) { const hint = miss(g); wobble(c.o, 0.25); SFX.soft(); if (hint) mark(chs[ans].o, 1.3); say(hint ? ['dalshe_ne', 'podskazka'] : 'dalshe_ne'); return; }
        g.busy = true; g.q = null; Idle.off(); chs.forEach(x => unmark(x.o)); uninter(c.o); qr.visible = qp.visible = false;
        await arc(c.o, V(cx + SX(5), Y + 1.58 + c.o.userData.dy, tz), 480, 1.4); SFX.good(); burst(V(cx + SX(5), Y + 2.4, tz), 16);
        row.forEach((o, i) => wait(i * 90).then(() => hop(o, 0.35)));
        g.left--; await say(praise()); if (!alive()) return; await wait(400); row.push(c.o); chs.splice(j, 1); clear(); g.busy = false;
        if (g.left <= 0) { roomDone('logic', V(cx, Y + 3, tz - 1)); return; }
        await wait(400); if (alive()) round();
      }
      g.start = () => { g.left = P3('logic', [[3, 3, 4], [4, 4, 4], [5, 5, 5]]); round(); }; g.ans = () => ans; g.choose = j => choose(j);
      startBtn('logic', cx + 4.6, cz - 4.0);
    }

    // ---------- что лишнее: один предмет не подходит к остальным ----------
    {
      const R = RM.lish, cx = R.cx, cz = R.cz, Y = R.y, H = R.hs; // дверь в западной стене
      for (const sg of [-1, 1]) { const w = mkWindow('#80cbc4'); w.position.set(cx + sg * 3.4, Y + 4.3, cz + H - 0.02); w.rotation.y = Math.PI; w.scale.set(0.8, 0.8, 1); world.add(w); }
      { const pc = mkPicture(1, '#ffb74d'); pc.position.set(cx, Y + 4.4, cz - H + 0.1); world.add(pc); }
      const rug = mkRug(3.6, '#c8f0e4', '#ffffff'); rug.position.set(cx - 1.5, Y, cz); world.add(rug);
      plant('lish', cx - H + 1.2, cz + H - 1.2, Y); plant('lish', cx - H + 1.2, cz - H + 1.2, Y);
      const px = cx + 3.6, PZ = (i, n) => cz + (i - (n - 1) / 2) * (n === 5 ? 2.45 : 2.9);
      { const sh = rbox(M('#ffffff', 0.6), 2.2, 0.24, 13.2, 0.1, px, Y + 0.12, cz); sh.receiveShadow = true; world.add(sh); obst('lish', px, cz, 1.1, 6.6, 0.5); }
      const CN = Object.keys(COLORS), FG = ['krug', 'kvadrat', 'treugolnik', 'zvezda', 'serdce'];
      const SETS = { // по смыслу: звери, еда, игрушки
        zveri: [[() => actor(mkMishka()), 0.6, 0], [() => actor(mkEzhik()), 0.72, 0], [() => actor(mkZver('koshka')), 0.72, 0], [() => actor(mkZver('sobaka')), 0.68, 0], [() => actor(mkZver('utka')), 0.75, 0]],
        eda: [[mkYabloko, 1.0, 0.28], [mkArbuz, 0.85, 0.5], [mkMed, 0.95, 0.3], [mkMorkovka, 1.0, 0.3], [mkKost, 0.9, 0.3]],
        igr: [[() => mkMyach(COLORS.siniy), 0.62, 0.38], [mkKubik, 0.8, 0.4], [mkDomik, 0.75, 0], [() => mkToy('zvezda'), 0.75, 0.52], [() => mkShar('#ff6fae'), 0.36, 1.1]],
      };
      const ballE = c => [() => mkMyach(COLORS[c]), 0.78, 0.47], figE = (f, c, s = 1) => [() => { const o = mkFigura(f); o.children[0].material = M(COLORS[c], 0.28); return o; }, 0.64 * s, 0.66 * s];
      const g = G.lish = { intro: 'lishnee_intro', left: 0 };
      let row = [], peds = [], ans = -1;
      const clear = () => { row.forEach(o => { if (o.userData.fp) uninter(o); tws(o, 0.001, 260).then(() => world.remove(o)); }); peds.forEach(p => tws(p, 0.001, 260).then(() => world.remove(p))); row = []; peds = []; };
      function round() {
        const kinds = P3('lish', [[['col'], ['col', 'fig'], ['col', 'fig', 'size']], [['cat'], ['cat', 'fig'], ['cat', 'cat5']], [['cat5', 'figmix'], ['cat5', 'figmix', 'colmix'], ['figmix', 'colmix', 'cat5']]]), kind = bag(g, 'k', kinds);
        const cs = shuffle(CN), fs = shuffle(FG); let same, odd, n = 4;
        if (kind === 'col') { same = [0, 1, 2].map(() => ballE(cs[0])); odd = ballE(cs[1]); }
        else if (kind === 'fig') { same = [0, 1, 2].map(() => figE(fs[0], cs[0])); odd = figE(fs[1], cs[0]); }
        else if (kind === 'size') { same = [0, 1, 2].map(() => figE(fs[0], cs[0], 1.25)); odd = figE(fs[0], cs[0], 0.62); }
        else if (kind === 'figmix') { same = [0, 1, 2].map(i => figE(fs[0], cs[i])); odd = figE(fs[1], cs[3]); } // цвета разные у всех, лишняя фигура другой формы
        else if (kind === 'colmix') { same = [0, 1, 2].map(i => figE(fs[i], cs[0])); odd = figE(fs[3], cs[1]); } // формы разные у всех, лишняя другого цвета
        else { n = kind === 'cat5' ? 5 : 4; const ks = shuffle(Object.keys(SETS)); same = shuffle(SETS[ks[0]]).slice(0, n - 1); odd = pick(SETS[ks[1]]); }
        n = same.length + 1; ans = rnd(n); const list = same.slice(); list.splice(ans, 0, odd);
        list.forEach(([mk, s, dy], i) => {
          const z = PZ(i, n), p = cyl(M(LCOL[(i * 3 + 1) % 8], 0.55), 0.8, 0.9, 1.1, px, Y + 0.79, z, 24); p.add(cyl(M('#ffffff', 0.5), 0.95, 0.95, 0.1, 0, 0.6, 0, 28)); world.add(p); popIn(p, 1, i * 80); peds.push(p);
          const o = mk(); o.position.set(px, Y + 1.44 + dy, z); o.rotation.y = -Math.PI / 2; o.userData.cy = 0.4; hitBox(o, 1.9 / s, 2.2 / s, 1.9 / s, 0, 0.5 / s, 0); world.add(o); popIn(o, s, 250 + i * 120); o.userData.sc = s;
          inter(o, { room: 'lish', fh: 2.0, stand: () => ({ x: px - 3.4, z }), look: () => V(px, Y + 2.0, z), act: () => choose(i) }); row.push(o);
        });
        g.wrong = 0; setQ('lish', ['lishnee_q'], () => { row.forEach((o, i) => { if (i !== ans) wait(i * 120).then(() => { if (o.parent) hop(o, 0.25); }); }); });
      }
      async function choose(j) {
        const o = row[j]; if (!o) return;
        if (!g.started || g.done || g.busy) { hop(o, 0.3); SFX.boing(); return; }
        if (j !== ans) { const hint = miss(g); wobble(o, 0.2); SFX.soft(); if (hint) mark(row[ans], 1.6); say(hint ? ['lishnee_ne', 'podskazka'] : 'lishnee_ne'); return; }
        g.busy = true; g.q = null; Idle.off(); row.forEach(unmark); SFX.good(); burst(V(px, Y + 2.6, o.position.z), 16);
        hop(o, 0.9); tw(o.rotation, { y: o.rotation.y + Math.PI * 2 }, 600);
        g.left--; await say(['lishnee_da', praise()]); if (!alive()) return; clear(); await wait(450); g.busy = false; if (!alive()) return;
        if (g.left <= 0) { roomDone('lish', V(px - 2, Y + 3, cz)); return; }
        round();
      }
      g.start = () => { g.left = P3('lish', [[3, 3, 4], [4, 4, 4], [4, 5, 5]]); round(); }; g.ans = () => ans; g.choose = j => choose(j);
      startBtn('lish', cx - 2.6, cz + 4.2);
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
      if (rm !== st.room && Math.max(Math.abs(st.x - R.cx), Math.abs(st.z - R.cz)) < (R.hs || HS) - 1.0) { const nf = RM[rm].fl !== RM[st.room].fl; st.room = rm; enterRoom(rm); cullRooms(); if (nf) hudFloor(); }
      st.y += (floorY(st.x, st.z) - st.y) * Math.min(1, dt * 14);
      if (st.hopT) { st.hopT += dt; st.hopY = Math.abs(Math.sin(st.hopT * 7)) * 0.7 * Math.max(0, 1 - st.hopT / 0.9); if (st.hopT > 0.9) { st.hopT = 0; st.hopY = 0; } }
      st.bob += moving ? dt * 9 : 0;
      const by = moving ? Math.abs(Math.sin(st.bob)) * 0.12 : 0;
      cam.position.set(st.x, st.y + EYE + by + st.hopY + Math.sin(time * 1.6) * 0.02, st.z);
      cam.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
      if (hands.visible) { hands.rotation.z = moving ? Math.sin(st.bob) * 0.03 : 0; slot.rotation.y = Math.sin(time * 1.2) * 0.25; }
      { const sx = Math.round(st.x / 3) * 3, sz_ = Math.round(st.z / 3) * 3, sy = Math.round(st.y / SH) * SH; sun.position.set(sx + 9, sy + 44, sz_ + 16); sun.target.position.set(sx, sy, sz_); }
      for (const m of MARKS) { m.rotation.y = time * 3; m.position.y = m.userData.by + Math.sin(time * 4) * m.userData.amp; }
      // что сейчас под прицелом
      focus = findFocus();
      $('fpUse').classList.toggle('lit', !!focus || !!(st.held && st.held.throwFree));
      if (focus && !TAP) { const p = wpos(focus); focusM.visible = true; focusM.position.set(p.x, p.y + (focus.userData.fp.fh || 2.2) + Math.sin(time * 5) * 0.12, p.z); focusM.rotation.y = time * 2; } else focusM.visible = false;
      for (const f of TICK) f(time, dt);
    }
    const hudFloor = () => { const ks = floorTasks(RM[st.room].fl); hudStars(ks.filter(k => G[k] && G[k].done).length, ks.length); };
    const NEAR = {}; { const adj = k => [k, ...KIDS[k], ...(DOOR[k] ? [DOOR[k].p] : [])]; for (const k of RKEYS) { const q = new Set(); adj(k).forEach(a => adj(a).forEach(b => q.add(b))); NEAR[k] = q; } }
    const LAYER = Object.fromEntries(RKEYS.map((k, i) => [k, i + 1]));
    { // каждой неподвижной вещи — слой её комнаты
      const live = new Set(); INTER.forEach(o => { if (o.userData.stat) return; for (let q = o; q; q = q.parent) live.add(q); });
      const pv = new T.Vector3(), tag = o => { for (const c of o.children) { if (c.isLight || c === ring || c === focusM || c === sun.target) continue; if (live.has(c)) { if (!INTER.includes(c)) tag(c); continue; } c.getWorldPosition(pv); const L = LAYER[roomOf(pv.x, pv.z, pv.y + 0.3 - ((pv.y + 0.3) % SH + SH) % SH)]; c.traverse(d => d.layers.set(L)); } };
      tag(world);
    }
    function cullRooms() { let m = 1; NEAR[st.room].forEach(k => { m |= 1 << LAYER[k]; }); cam.layers.mask = m; sun.shadow.camera.layers.mask = m; }
    if (rc.layers) rc.layers.enableAll();
    { // звёздочка-подсказка: висит над дверью, за которой ближайшее несделанное задание
      const gs = grp(0, 0, 0), sm = mkZvezda(true, 0.55); sm.castShadow = false; gs.add(sm); gs.visible = false; world.add(gs); let cur = '', tgt = null;
      const ORDER = ['hall', 'kuh', 'igr', 'spal', 'zak', 'zal', 'h3', 'poch', 'azb', 'h4', 'logic', 'lish'].filter(k => G[k]);
      TICK.push(t => {
        const r = st.room, to = ORDER.find(k => !G[k].done), key = r + '>' + to;
        if (key !== cur) { cur = key; tgt = null;
          if (to && to !== r && RM[r]) { const path = ['hall'].concat(chainOf(to)), i = path.indexOf(r), p = i >= 0 ? DOOR[path[i + 1]].out : DOOR[r] && DOOR[r].in; if (p) tgt = V(p.x, RM[r].y + 5.3, p.z); }
          gs.visible = !!tgt; if (tgt) { gs.position.copy(tgt); gs.scale.setScalar(0.3); tws(gs, 1, 400, 'back'); } }
        if (tgt) { gs.position.y = tgt.y + Math.sin(t * 3) * 0.18; sm.rotation.y = t * 2.2; }
      });
    }
    ON_CLEAR.push(function cl() { cam.layers.enableAll(); cam.layers.mask = 0xffffffff; ON_CLEAR.splice(ON_CLEAR.indexOf(cl), 1); });
    hudFloor(); cullRooms();
    current = { name: 'dom', fp: true, rebuild: () => setFov(), camFn, again: openDom, st, G, INTER, use, tap, BTN, RM };
    camFn(0);
    { // окна: шторы чуть колышутся, сияние дышит, пятно света ложится на пол своего этажа
      const ys = [...new Set(RKEYS.map(k => RM[k].y))], wp = V(0, 0, 0);
      WINS.forEach(w => { w.g.updateWorldMatrix(true, false); w.g.getWorldPosition(wp); const fy = Math.max(...ys.filter(y => y <= wp.y + 0.01)); w.pt.position.y = (fy + 0.06 - wp.y) / w.g.scale.y; });
      TICK.push(t => WINS.forEach(w => { w.cs.forEach((c, i) => { c.rotation.z = Math.sin(t * 0.9 + w.ph + i) * 0.035; c.rotation.x = Math.sin(t * 1.3 + w.ph + i * 2) * 0.05; }); w.gw.material.opacity = 0.8 + Math.sin(t * 0.5 + w.ph) * 0.2; }));
    }
    if (RESUME) { // вернулись из рисования: звёзды на месте, стоим у мольберта
      const r = RESUME; RESUME = null;
      r.done.forEach(k => { const gk = G[k], b = BTN[k]; if (!gk || !b) return; gk.done = gk.started = true; gk.q = null; st.stars++; const U = b.userData; U.tri.visible = false; U.mat.color.copy(C('#ffb300')); U.mat.emissive.copy(C('#ffb300')); const s = mkZvezda(true, 0.5); s.castShadow = false; s.position.y = 2.5; b.add(s); TICK.push(t => { s.rotation.y = t * 2; }); });
      st.x = RM.ris.cx; st.z = RM.ris.cz - 1.6; st.yaw = Math.PI; st.pitch = 0.12; st.room = 'ris'; hudFloor(); cullRooms(); camFn(0);
    } else { const L = S.last, was = L && L.fl >= 1 && L.fl <= 4 && Date.now() - L.t > 20 * 60000; wait(700).then(() => { if (alive()) say(was ? ['proshly_' + L.fl, 'proshly_dalshe'] : 'dom_intro'); }); }
  }
  addEventListener('resize', () => { if (current && current.fp) current.rebuild(); checkRot(); });
  window.openDom = openDom;
  window.__Z && (window.__Z.openDom = openDom);
})();
