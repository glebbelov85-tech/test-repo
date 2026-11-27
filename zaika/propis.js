'use strict';
// «Прописи»: обведи пальцем линию, цифру или букву. Открывается с парты в мастерской рисования.
// Возраст: 3–4 года — линии и фигуры, 4–5 — цифры, 5–7 — цифры и буквы.
(() => {
  const el = $('prp'), cv = $('pc'), x = cv.getContext('2d');
  const L = (...p) => ({ p }); // ломаная: x1, y1, x2, y2, …
  const A = (cx, cy, rx, ry, a0, a1) => ({ a: [cx, cy, rx, ry, a0, a1] }); // дуга, углы в градусах (вниз по экрану)
  // штрихи на поле 100×140; каждый штрих — список кусочков, которые идут подряд
  const G = {
    'l1': [[L(50, 16, 50, 124)]], 'l2': [[L(12, 70, 88, 70)]], 'l3': [[L(10, 110, 30, 30, 50, 110, 70, 30, 90, 110)]],
    'l4': [[A(50, 70, 36, 46, -90, 270)]], 'l5': [[A(30, 70, 20, 30, 180, 360), A(70, 70, 20, 30, 180, 0)]], 'l6': [[L(14, 30, 86, 30, 86, 110, 14, 110, 14, 30)]],
    '1': [[L(30, 46, 56, 18, 56, 122)]],
    '2': [[A(50, 48, 26, 28, -170, 50), L(24, 120, 80, 120)]],
    '3': [[A(48, 45, 24, 25, -150, 90), A(48, 95, 27, 25, -90, 150)]],
    '4': [[L(60, 18, 22, 88, 82, 88)], [L(62, 18, 62, 122)]],
    '5': [[L(72, 20, 32, 20, 30, 67), A(48, 90, 28, 30, -130, 150)]],
    '6': [[A(56, 72, 32, 50, -75, -180), A(50, 92, 26, 28, 180, -180)]],
    '7': [[L(24, 20, 78, 20, 42, 122)]],
    '8': [[A(50, 45, 22, 24, 90, -270), A(50, 95, 26, 26, -90, 270)]],
    '9': [[A(50, 48, 25, 27, 0, -360), L(75, 48, 74, 82, 62, 108, 40, 122)]],
    '0': [[A(50, 70, 27, 50, -90, -450)]],
    'А': [[L(22, 122, 50, 18, 78, 122)], [L(33, 86, 67, 86)]],
    'О': [[A(50, 70, 30, 50, -90, -450)]],
    'У': [[L(24, 18, 52, 82)], [L(78, 18, 46, 106, 28, 120)]],
    'М': [[L(18, 122, 18, 18, 50, 82, 82, 18, 82, 122)]],
    'И': [[L(22, 18, 22, 122, 78, 18, 78, 122)]],
    'Т': [[L(18, 20, 82, 20)], [L(50, 20, 50, 122)]],
    'К': [[L(26, 18, 26, 122)], [L(76, 18, 26, 70, 78, 122)]],
    'Р': [[L(26, 18, 26, 122)], [L(26, 20, 52, 20), A(52, 46, 24, 26, -90, 90), L(52, 72, 26, 72)]],
    'Ш': [[L(16, 18, 16, 120, 84, 120, 84, 18)], [L(50, 18, 50, 120)]],
    'Ч': [[L(24, 18, 24, 58, 40, 72, 76, 72)], [L(76, 18, 76, 122)]],
    'З': [[A(48, 45, 24, 25, -150, 90), A(48, 95, 27, 25, -90, 150)]],
    'Б': [[L(72, 20, 28, 20, 28, 120)], [L(28, 66, 52, 66), A(52, 93, 25, 27, -90, 90), L(52, 120, 28, 120)]],
    'Ы': [[L(20, 18, 20, 122)], [L(20, 68, 34, 68), A(34, 94, 20, 26, -90, 90), L(34, 120, 20, 120)], [L(80, 18, 80, 122)]],
    'Я': [[L(74, 18, 74, 122)], [L(74, 20, 48, 20), A(48, 46, 24, 26, -90, -270), L(48, 72, 74, 72)], [L(60, 72, 26, 122)]],
  };
  const LV = { 'А': 'a', 'Б': 'b', 'З': 'z', 'И': 'i', 'К': 'k', 'М': 'm', 'О': 'o', 'Р': 'r', 'Т': 't', 'У': 'u', 'Ч': 'ch', 'Ш': 'sh', 'Ы': 'y', 'Я': 'ya' };
  const SETS = [[['l1', 'l2', 'l4'], ['l1', 'l2', 'l3', 'l4', 'l6'], ['l3', 'l4', 'l5', 'l6', '1', '0']],
    [['1', '2', '3', '4', '5'], ['1', '2', '3', '4', '5', '6', '7', '0'], ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
    [['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'А', 'О', 'У', 'М'], ['6', '8', '9', 'А', 'О', 'У', 'М', 'И', 'Т', 'К'], Object.keys(LV)]];
  const COLS = ['#f0352b', '#2a6df4', '#35b24a', '#ff8a1c', '#b25de0', '#ff4f9a'];
  // штрих → точки через каждые 2 единицы
  const pts = st => {
    const raw = [];
    for (const s of st) {
      if (s.p) for (let i = 0; i < s.p.length; i += 2) raw.push([s.p[i], s.p[i + 1]]);
      else { const [cx, cy, rx, ry, a0, a1] = s.a, n = Math.max(8, Math.round(Math.abs(a1 - a0) / 6)); for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; raw.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } }
    }
    const out = [raw[0]];
    for (let i = 1; i < raw.length; i++) { const [ax, ay] = out[out.length - 1], [bx, by] = raw[i], d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 2); for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); }
    return out;
  };
  let W = 0, H = 0, dpr = 1, sc = 1, ox = 0, oy = 0, raf = 0, open = false, back = null;
  let lvl = 0, list = [], gi = 0, key = '', strokes = [], si = 0, pi = 0, col = COLS[0], down = false, idle = 0, doneT = 0, conf = [], t0 = 0, total = 4, told = false;
  const fit = () => { dpr = Math.min(2, devicePixelRatio || 1); W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr); sc = Math.min(H * 0.82 / 140, W * 0.56 / 100); ox = (W - 100 * sc) / 2; oy = (H - 140 * sc) / 2; };
  const X = p => ox + p[0] * sc, Y = p => oy + p[1] * sc;
  const path = (P, a, b) => { x.beginPath(); x.moveTo(X(P[a]), Y(P[a])); for (let i = a + 1; i <= b; i++) x.lineTo(X(P[i]), Y(P[i])); };
  const sayGlyph = () => { if (/^\d$/.test(key)) return Voice.say(+key >= 1 && +key <= 5 ? 'chislo_' + key : 'cif_' + key, null); if (LV[key]) return Voice.say(['eto_bukva', 'b_' + LV[key]], null); return Voice.say(praise(), null); };
  function setGlyph() {
    key = list[gi % list.length]; strokes = G[key].map(pts); si = 0; pi = 0; col = COLS[gi % COLS.length]; idle = 0; doneT = 0; down = false;
    if (!told) { told = true; Voice.say('obvedi', null); }
  }
  function finish() {
    doneT = performance.now(); SFX.good();
    for (let i = 0; i < 46; i++) conf.push({ x: W / 2 + (Math.random() - 0.5) * 100 * sc, y: H / 2, vx: (Math.random() - 0.5) * 14 * dpr, vy: -(4 + Math.random() * 12) * dpr, c: COLS[i % 6], r: (4 + Math.random() * 6) * dpr, a: Math.random() * 6 });
    sayGlyph().then(() => { if (!open) return; gi++; if (gi >= total) { SFX.fanfare(); Voice.say(praise(), null).then(() => { if (open) quit(true); }); } else setTimeout(() => { if (open) setGlyph(); }, 500); });
  }
  function move(e) {
    if (!down || doneT || !strokes.length) return;
    const fx = (e.clientX * dpr - ox) / sc, fy = (e.clientY * dpr - oy) / sc, P = strokes[si], tol = [20, 16, 13][lvl];
    let moved = false;
    while (pi < P.length - 1 && Math.hypot(P[pi + 1][0] - fx, P[pi + 1][1] - fy) < tol && Math.hypot(P[pi][0] - fx, P[pi][1] - fy) < tol * 1.6) { pi++; moved = true; }
    if (moved) { idle = 0; if (pi % 9 === 0) tone(520 + (pi / P.length) * 500, 0, 0.08, 'triangle', 0.06); }
    if (pi >= P.length - 1) { si++; pi = 0; SFX.plop(); if (si >= strokes.length) { si = strokes.length - 1; pi = strokes[si].length - 1; finish(); } }
  }
  function draw(now) {
    if (!open) return; raf = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - t0) / 1000 || 0); t0 = now; idle += dt;
    x.fillStyle = '#fffdf5'; x.fillRect(0, 0, W, H);
    // линейки, как в тетради
    x.strokeStyle = '#d9ecff'; x.lineWidth = 2 * dpr; for (const yy of [18, 70, 122]) { x.beginPath(); x.moveTo(ox - 60 * sc, oy + yy * sc); x.lineTo(ox + 160 * sc, oy + yy * sc); x.stroke(); }
    x.lineCap = 'round'; x.lineJoin = 'round';
    strokes.forEach(P => { path(P, 0, P.length - 1); x.strokeStyle = '#ece6da'; x.lineWidth = 24 * sc; x.stroke(); });
    strokes.forEach((P, i) => {
      const end = doneT || i < si ? P.length - 1 : i === si ? pi : 0;
      if (end > 0) { path(P, 0, end); x.strokeStyle = col; x.lineWidth = 17 * sc; x.stroke(); }
      if (!doneT && i >= si) { x.setLineDash([2 * sc, 7 * sc]); path(P, i === si ? pi : 0, P.length - 1); x.strokeStyle = i === si ? '#8a8072' : '#c9c0b2'; x.lineWidth = 2.2 * sc; x.stroke(); x.setLineDash([]); }
    });
    if (!doneT && strokes.length) {
      const P = strokes[si], p = P[pi], pul = 1 + Math.sin(now / 160) * 0.12;
      // куда вести: стрелочка чуть впереди
      const q = P[Math.min(P.length - 1, pi + 7)], an = Math.atan2(q[1] - p[1], q[0] - p[0]);
      x.fillStyle = '#35b24a'; x.beginPath(); x.arc(X(p), Y(p), 9.5 * sc * pul, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(X(p), Y(p), 4 * sc, 0, 7); x.fill();
      x.save(); x.translate(X(q), Y(q)); x.rotate(an); x.fillStyle = '#35b24a'; x.beginPath(); x.moveTo(5 * sc, 0); x.lineTo(-3 * sc, -4.5 * sc); x.lineTo(-3 * sc, 4.5 * sc); x.closePath(); x.fill(); x.restore();
      // номера штрихов
      strokes.forEach((S, i) => { if (i <= si || strokes.length < 2) return; x.fillStyle = '#b0a696'; x.beginPath(); x.arc(X(S[0]), Y(S[0]), 6 * sc, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = `900 ${8 * sc}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(i + 1, X(S[0]), Y(S[0]) + sc * 0.5); });
      // подсказка: если давно не ведут, точка сама пробегает по линии
      if (idle > 4) { const k = ((idle - 4) % 2.4) / 1.6; if (k < 1) { const j = Math.min(P.length - 1, pi + Math.floor((P.length - 1 - pi) * k)); x.fillStyle = 'rgba(255,170,0,.85)'; x.beginPath(); x.arc(X(P[j]), Y(P[j]), 7 * sc, 0, 7); x.fill(); } }
    }
    // сколько осталось: точки сверху
    for (let i = 0; i < total; i++) { x.fillStyle = i < gi + (doneT ? 1 : 0) ? '#ffc928' : '#e6dfd2'; x.beginPath(); x.arc(W / 2 + (i - (total - 1) / 2) * 34 * dpr, 26 * dpr, 10 * dpr, 0, 7); x.fill(); }
    conf = conf.filter(c => c.y < H + 40); conf.forEach(c => { c.vy += 26 * dt * dpr; c.x += c.vx; c.y += c.vy; c.a += 0.2; x.save(); x.translate(c.x, c.y); x.rotate(c.a); x.fillStyle = c.c; x.fillRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2); x.restore(); });
  }
  function quit(done) {
    if (!open) return; const b = back; close();
    if (done) { const a = (S.st = S.st || {})[lvl] = S.st[lvl] || {}, r = a.propis = a.propis || { s: 0, c: 0 }; r.n = (r.n || 0) + 1; if (++r.c >= 2 && r.s < 2) { r.s++; r.c = 0; } save(); }
    go(b || goHome);
  }
  function close() { open = false; cancelAnimationFrame(raf); el.classList.remove('on'); conf = []; }
  ON_CLEAR.push(() => { if (open) close(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); down = true; ac(); move(e); });
  cv.addEventListener('pointermove', e => { e.preventDefault(); move(e); });
  ['pointerup', 'pointercancel'].forEach(n => cv.addEventListener(n, () => { down = false; }));
  { const b = document.createElement('div'); b.className = 'btn home'; b.innerHTML = $('bHome').innerHTML; tapBtn(b, () => { SFX.tap(); quit(false); }); el.appendChild(b);
    const n = document.createElement('div'); n.className = 'btn next'; n.innerHTML = '<svg viewBox="0 0 100 100"><path d="M30 22 L68 50 L30 78" fill="none" stroke="#5d3a24" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>'; tapBtn(n, () => { if (doneT) return; SFX.tap(); list.push(list.splice(gi % list.length, 1)[0]); setGlyph(); }); el.appendChild(n); }
  window.openPropis = bk => {
    clearWorld(); scene.background = new T.Color(C('#fffdf5'));
    back = typeof bk === 'function' ? bk : null; current = { name: 'propis', rebuild: fit, back };
    lvl = window.__lvl !== undefined ? window.__lvl : lvlOf();
    const sp = window.__step !== undefined ? window.__step : Math.min(2, ((((S.st || {})[lvl] || {}).propis) || {}).s || 0);
    list = shuffle(SETS[lvl][sp]); gi = 0; total = Math.min(4, list.length); told = false; conf = [];
    open = true; el.classList.add('on'); fit(); setGlyph(); t0 = performance.now(); raf = requestAnimationFrame(draw);
  };
  window.__propis = { get state() { return { key, si, pi, n: strokes.length, gi, done: !!doneT, open }; }, pt: () => { const p = strokes[si][Math.min(strokes[si].length - 1, pi + 3)]; return [X(p) / dpr, Y(p) / dpr]; }, keys: Object.keys(G), show: k => { list = [k]; gi = 0; total = 99; setGlyph(); } };
  addEventListener('resize', () => { if (open) setTimeout(fit, 60); });
})();
