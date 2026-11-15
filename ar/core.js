"use strict";
// ============================================================
// Общее ядро AR-режимов: камера, гироскоп, проекция, звук,
// частицы, экраны (старт / пауза / конец), главный цикл.
// Каждый режим подключает этот файл и вызывает ARGame.setup({...}).
// ============================================================
const $ = s => document.querySelector(s);
const D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
let W = 0, H = 0, DPR = 1, FOCAL = 600;
let cam, fx, ctx;
let time = 0;

// ---------- Векторы ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// направление по углам: yaw - поворот, pitch - вверх/вниз. Мир: x - восток, y - север, z - вверх
const dirOf = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];

// Глаза (телефон) примерно на высоте 1.35 м над полом
const EYE = 1.35;
// точка в мире относительно игрока: направление yaw, расстояние по полу d, высота над полом h
const worldVec = (yaw, d, h) => [Math.sin(yaw) * d, Math.cos(yaw) * d, h - EYE];

// ---------- Гироскоп ----------
let gyroOK = false, gyroTarget = null, basis = null;
let dragYaw = 0, dragPitch = 0; // запасной режим без гироскопа (ПК)
let turnSpeed = 0; // как быстро крутится телефон (рад/с)

function basisFromEuler(a, b, g) {
  a *= D2R; b *= D2R; g *= D2R;
  const cX = Math.cos(b), sX = Math.sin(b), cY = Math.cos(g), sY = Math.sin(g), cZ = Math.cos(a), sZ = Math.sin(a);
  return {
    r: [cZ * cY - sZ * sX * sY, cY * sZ + cZ * sX * sY, -cX * sY],
    u: [-cX * sZ, cZ * cX, sX],
    f: [-(cY * sZ * sX + cZ * sY), -(sZ * sY - cZ * cY * sX), -(cX * cY)]
  };
}
function basisFromYawPitch(y, p) {
  const f = dirOf(y, p), r = [Math.cos(y), -Math.sin(y), 0];
  return { r, u: cross(r, f), f };
}
function onOrientation(e) {
  if (e.alpha == null || e.beta == null) return;
  gyroOK = true;
  gyroTarget = basisFromEuler(e.alpha, e.beta, e.gamma || 0);
}
function screenAngle() { return ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D2R; }
function updateBasis(dt) {
  const prevF = basis ? basis.f : null;
  if (gyroOK && gyroTarget) {
    if (!basis) basis = gyroTarget;
    const k = 0.35;
    const f = norm(lerp3(basis.f, gyroTarget.f, k)), u0 = norm(lerp3(basis.u, gyroTarget.u, k));
    const r = norm(cross(f, u0));
    basis = { r, u: cross(r, f), f };
  } else basis = basisFromYawPitch(dragYaw, dragPitch);
  if (prevF && dt > 0) {
    const a = Math.acos(clamp(dot(prevF, basis.f), -1, 1)) / dt;
    turnSpeed += (a - turnSpeed) * 0.3;
  }
}
// направление мира -> координаты камеры
function toCam(p) {
  let x = dot(p, basis.r), y = dot(p, basis.u);
  const z = dot(p, basis.f);
  if (gyroOK) {
    const t = screenAngle();
    if (t) { const c = Math.cos(t), s = Math.sin(t); const x2 = x * c + y * s; y = -x * s + y * c; x = x2; }
  }
  return { x, y, z };
}
const camHeading = () => Math.atan2(basis.f[0], basis.f[1]);
const camPitch = () => Math.asin(clamp(basis.f[2], -1, 1));
// наклон экрана, чтобы рисовать монстров "стоя"
function screenRoll() { const up = toCam([0, 0, 1]); return Math.atan2(up.x, up.y); }
// проекция точки мира v (вектор от глаз) с размером size (метры) на экран
function project3(v, size) {
  const range = Math.hypot(v[0], v[1], v[2]) || 0.001;
  const c = toCam([v[0] / range, v[1] / range, v[2] / range]);
  if (c.z < 0.08) return { vis: false, c, range };
  const sx = W / 2 + (c.x / c.z) * FOCAL, sy = H / 2 - (c.y / c.z) * FOCAL;
  const r = (size * FOCAL) / range;
  return { vis: sx > -r * 1.5 && sx < W + r * 1.5 && sy > -r * 1.5 && sy < H + r * 1.5, sx, sy, r, c, range };
}

// ---------- Камера ----------
let camOn = false, camFacing = 'environment', camStream = null;
async function startCamera(facing, hiRes) {
  camFacing = facing || 'environment';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing }, width: { ideal: hiRes ? 1920 : 1280 }, height: { ideal: hiRes ? 1080 : 720 } }, audio: false
    });
    cam.srcObject = camStream;
    cam.classList.toggle('mirror', camFacing === 'user');
    await cam.play().catch(() => {});
    camOn = true;
    return true;
  } catch (e) { console.log('Камера недоступна:', e); camOn = false; return false; }
}
// как видео растянуто на экран (object-fit: cover): масштаб и сдвиг
function videoFit() {
  const vw = cam.videoWidth || 1, vh = cam.videoHeight || 1;
  const s = Math.max(W / vw, H / vh);
  return { vw, vh, s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2, mirror: camFacing === 'user' };
}
// перевод точки экрана в пиксели видео
function screenToVideo(x, y, fit) {
  fit = fit || videoFit();
  if (fit.mirror) x = W - x;
  return { x: (x - fit.ox) / fit.s, y: (y - fit.oy) / fit.s };
}

// ---------- Звук (синтезатор, без файлов) ----------
let AC = null, soundOn = true;
function initAudio() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { AC = null; }
}
function tone(freq, dur, type = 'square', vol = 0.12, slide = 1, delay = 0) {
  if (!AC || !soundOn) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol = 0.2, freq = 1200, delay = 0, type = 'lowpass') {
  if (!AC || !soundOn) return;
  const len = Math.max(1, Math.floor(AC.sampleRate * dur)), buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = vol;
  src.connect(f).connect(g).connect(AC.destination); src.start(AC.currentTime + delay);
}
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
// голос (синтез речи телефона)
function say(text) {
  try {
    if (!soundOn || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ru-RU'; u.rate = 1; u.pitch = 1.15;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- Частицы и надписи ----------
let parts = [];
function burst(x, y, color, n, speed = 260) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * speed;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 300, life: 0.4 + Math.random() * 0.5, color, size: 2 + Math.random() * 4 });
  }
}
function floatText(x, y, txt, color = '#ffe066') { parts.push({ x, y, vx: 0, vy: -60, life: 1, txt, color }); }
function updateParts(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
}
function drawParts() {
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    if (p.txt) { ctx.fillStyle = p.color; ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText(p.txt, p.x, p.y); ctx.fillText(p.txt, p.x, p.y); }
    else { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size); }
  }
  ctx.globalAlpha = 1;
}

// ---------- Подсказки ----------
let bannerTO = 0, hintTO = 0;
function showBanner(t, sub, ms) {
  const b = $('#banner'); b.innerHTML = t + (sub ? '<small>' + sub + '</small>' : '');
  b.classList.add('show'); clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove('show'), ms || 1800);
}
function showHint(t, ms) {
  const h = $('#hint'); h.textContent = t; h.classList.add('show');
  clearTimeout(hintTO); hintTO = setTimeout(() => h.classList.remove('show'), ms || 2500);
}
function hud(html) { $('#hudInfo').innerHTML = html; }

// ---------- Стрелка к объекту за краем экрана и радар ----------
function drawPointer(c, color, danger) {
  let ax = c.x, ay = c.y;
  if (c.z < 0 && Math.hypot(ax, ay) < 0.05) ax = 1;
  const ang = Math.atan2(-ay, ax);
  const x = W / 2 + Math.cos(ang) * (W / 2 - 34), y = H / 2 + Math.sin(ang) * (H / 2 - 80);
  const pulse = danger ? 1 + Math.sin(time * 12) * 0.2 : 1;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(pulse, pulse);
  ctx.fillStyle = color; ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -13); ctx.lineTo(-4, 0); ctx.lineTo(-10, 13); ctx.closePath(); ctx.fill();
  ctx.restore();
}
// items: [{yaw, dist, color, big}], maxDist - край радара
function drawRadar(items, maxDist) {
  const R = 46, cx = W / 2, cy = H - R - 18;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.strokeStyle = 'rgba(120,255,160,.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R / 2, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(120,255,160,.15)';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.fill();
  const h = camHeading();
  for (const it of items) {
    const rel = it.yaw - h, d = Math.min(1, it.dist / maxDist) * R;
    ctx.fillStyle = it.color;
    ctx.beginPath(); ctx.arc(cx + Math.sin(rel) * d, cy - Math.cos(rel) * d, it.big ? 5 : 3.5, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#7dffa0'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
  ctx.restore();
}

// ---------- Если камеры нет: тёмная комната ----------
const STARS = Array.from({ length: 260 }, () => {
  const y = Math.random() * Math.PI * 2, p = Math.asin(Math.random() * 1.6 - 0.6);
  return { d: dirOf(y, p), s: Math.random() * 1.8 + 0.4 };
});
function drawFakeWorld(top = '#1b1036', bottom = '#05030c') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, bottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c9c3ff';
  for (const st of STARS) {
    const c = toCam(st.d); if (c.z < 0.1) continue;
    const x = W / 2 + (c.x / c.z) * FOCAL, y = H / 2 - (c.y / c.z) * FOCAL;
    if (x < 0 || x > W || y < 0 || y > H) continue;
    ctx.fillRect(x, y, st.s, st.s);
  }
  // сетка пола, чтобы было видно глубину
  ctx.strokeStyle = 'rgba(160,120,255,.22)'; ctx.lineWidth = 1;
  for (let d = 1; d <= 12; d += 1) {
    ctx.beginPath(); let first = true;
    for (let a = 0; a <= 360; a += 6) {
      const p = project3(worldVec(a * D2R, d, 0), 0.1);
      if (p.c.z < 0.1) { first = true; continue; }
      first ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy); first = false;
    }
    ctx.stroke();
  }
}

// ---------- Экраны и цикл ----------
const ARGame = {
  state: 'menu', // menu | play | pause | over
  cfg: null,
  flash: 0, shake: 0,
  setup(cfg) {
    this.cfg = cfg;
    document.title = cfg.title;
    if (cfg.colors) for (const k in cfg.colors) document.documentElement.style.setProperty('--' + k, cfg.colors[k]);
    document.body.insertAdjacentHTML('afterbegin', `
<video id="cam" playsinline muted autoplay></video>
<canvas id="fx"></canvas>
<div id="hud">
  <a class="hbtn" href="./" id="btnBack">←</a>
  <span class="grow"></span><span id="hudInfo"></span><span class="grow"></span>
  <span id="hudExtra"></span>
  <button class="hbtn" id="btnSound">🔊</button>
  <button class="hbtn" id="btnPause">II</button>
</div>
<div id="banner"></div><div id="hint"></div>
<div class="screen" id="startScr">
  <canvas id="icon" width="240" height="240"></canvas>
  <h1>${cfg.title}</h1>
  ${(cfg.intro || []).map(t => '<p>' + t + '</p>').join('')}
  <p class="note warn" id="httpsWarn" style="display:none">Страница открыта не по https - камера может не включиться.</p>
  <button class="big" id="btnStart">${cfg.startText || 'Начать'}</button>
  <a class="small" href="./">← Все режимы</a>
</div>
<div class="screen hide" id="pauseScr"><h1>Пауза</h1><button class="big" id="btnResume">Продолжить</button><a class="small" href="./">← Все режимы</a></div>
<div class="screen hide" id="overScr"><h1 id="overTitle"></h1><div id="overBody"></div>
  <button class="big" id="btnAgain">Ещё раз</button><a class="small" href="./">← Все режимы</a></div>`);
    cam = $('#cam'); fx = $('#fx'); ctx = fx.getContext('2d');
    const resize = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      fx.width = Math.round(W * DPR); fx.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      FOCAL = Math.max(W, H) * 0.78;
      cfg.onResize && cfg.onResize();
    };
    addEventListener('resize', resize); resize();
    for (const b of cfg.buttons || []) {
      const el = document.createElement('button'); el.className = 'hbtn'; el.textContent = b.text; el.id = b.id || '';
      el.onclick = b.onclick; $('#hudExtra').appendChild(el);
    }
    // ввод: с гироскопом тап сразу, без него - тянем пальцем, тап = короткое касание
    let down = null;
    fx.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, moved: 0 };
      if ((gyroOK || !cfg.useGyro) && this.state === 'play') cfg.onTap && cfg.onTap(e.clientX, e.clientY);
    });
    fx.addEventListener('pointermove', e => {
      if (cfg.onMove && this.state === 'play') cfg.onMove(e.clientX, e.clientY, !!down);
      if (!down || gyroOK || !cfg.useGyro) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down.moved += Math.abs(dx) + Math.abs(dy); down.x = e.clientX; down.y = e.clientY;
      dragYaw -= dx * 0.005; dragPitch = clamp(dragPitch + dy * 0.005, -1.2, 1.2);
    });
    fx.addEventListener('pointerup', e => {
      if (down && cfg.useGyro && !gyroOK && down.moved < 12 && this.state === 'play') cfg.onTap && cfg.onTap(e.clientX, e.clientY);
      down = null;
    });
    addEventListener('keydown', e => {
      if (gyroOK) return;
      if (e.key === 'ArrowLeft') dragYaw -= 0.15;
      if (e.key === 'ArrowRight') dragYaw += 0.15;
      if (e.key === 'ArrowUp') dragPitch = Math.min(1.2, dragPitch + 0.1);
      if (e.key === 'ArrowDown') dragPitch = Math.max(-1.2, dragPitch - 0.1);
    });
    $('#btnStart').onclick = () => this.start();
    $('#btnAgain').onclick = () => { $('#overScr').classList.add('hide'); this.begin(); };
    $('#btnSound').onclick = () => { soundOn = !soundOn; $('#btnSound').textContent = soundOn ? '🔊' : '🔇'; if (!soundOn && window.speechSynthesis) speechSynthesis.cancel(); };
    $('#btnPause').onclick = () => this.pause();
    $('#btnResume').onclick = () => { this.state = 'play'; $('#pauseScr').classList.add('hide'); initAudio(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    if (location.protocol !== 'https:' && !/^(localhost|127\.)/.test(location.hostname)) $('#httpsWarn').style.display = 'block';
    // иконка на стартовом экране
    if (cfg.drawIcon) {
      const ic = $('#icon').getContext('2d');
      const anim = ts => {
        if (this.state !== 'menu') return;
        ic.setTransform(1, 0, 0, 1, 0, 0); ic.clearRect(0, 0, 240, 240);
        ic.setTransform(2, 0, 0, 2, 120, 120 + Math.sin(ts / 500) * 6);
        cfg.drawIcon(ic, ts / 1000);
        requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    } else $('#icon').style.display = 'none';
    let last = 0;
    const loop = ts => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0); last = ts;
      updateBasis(dt);
      if (this.state !== 'pause') { time += dt; updateParts(dt); this.flash = Math.max(0, this.flash - dt * 2); this.shake = Math.max(0, this.shake - dt);
        if (this.state !== 'menu') cfg.update && cfg.update(dt); }
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * 30, (Math.random() - 0.5) * this.shake * 30);
      if (!camOn && cfg.fakeWorld !== false) drawFakeWorld(...(cfg.fakeColors || []));
      cfg.render && cfg.render(dt);
      drawParts();
      ctx.restore();
      cfg.renderTop && cfg.renderTop(dt);
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,0,0,${this.flash * 0.45})`; ctx.fillRect(0, 0, W, H); }
    };
    requestAnimationFrame(loop);
  },
  async start() {
    initAudio();
    const cfg = this.cfg;
    if (cfg.useGyro) {
      try { if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission(); } catch (e) {}
      addEventListener('deviceorientation', onOrientation);
    }
    try { document.documentElement.requestFullscreen && await document.documentElement.requestFullscreen(); } catch (e) {}
    try { screen.orientation && screen.orientation.lock && await screen.orientation.lock('portrait'); } catch (e) {}
    $('#startScr').classList.add('hide');
    const ok = cfg.camera === false ? false : await startCamera(cfg.facing);
    this.begin();
    if (!ok && cfg.camera !== false) showHint('Камера не включилась - играем без неё', 3000);
    if (cfg.useGyro) setTimeout(() => { if (!gyroOK) showHint('Гироскопа нет: крути мир пальцем, мышкой или стрелками', 4000); }, 1500);
  },
  begin() {
    parts = []; this.flash = 0; this.shake = 0;
    this.state = 'play';
    $('#hud').style.display = 'flex';
    this.cfg.onBegin && this.cfg.onBegin();
  },
  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause'; $('#pauseScr').classList.remove('hide');
  },
  over(title, bodyHtml, delay = 900) {
    this.state = 'over';
    $('#overTitle').textContent = title; $('#overBody').innerHTML = bodyHtml;
    setTimeout(() => { $('#overScr').classList.remove('hide'); $('#hud').style.display = 'none'; }, delay);
  },
  hurt() { this.flash = 1; this.shake = 0.5; buzz([120, 60, 200]); }
};
// рекорды
const best = {
  get: k => { try { return +localStorage.getItem('ar_best_' + k) || 0; } catch (e) { return 0; } },
  set: (k, v) => { try { localStorage.setItem('ar_best_' + k, v); } catch (e) {} }
};
