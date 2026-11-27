'use strict';
// «Раскраска по цифрам»: выбери краску с цифрой и нажми на кусочек с такой же цифрой.
// Возраст: 3–4 года — цифры 1–3 с точками, 4–5 — до пяти, 5–7 — примеры (2+1, 5−2).
(() => {
  const el = $('rsk'), cv = $('kc'), x = cv.getContext('2d');
  const P = f => { const p = new Path2D(); f(p); return p; };
  const circ = (cx, cy, r) => P(p => p.arc(cx, cy, r, 0, 7)), rect = (a, b, w, h) => P(p => p.rect(a, b, w, h)), ell = (cx, cy, rx, ry, rot = 0) => P(p => p.ellipse(cx, cy, rx, ry, rot, 0, 7));
  const poly = (...q) => P(p => { p.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) p.lineTo(q[i], q[i + 1]); p.closePath(); });
  // картинки: цвета кусочков и сами кусочки [номер цвета, контур, x и y подписи, размер подписи]. Поле от −1 до 1, рисуются по порядку.
  const PICS = [
    { name: 'domik', cols: ['#ffd21f', '#f0352b', '#4fc3f7', '#35b24a', '#b0764a'], parts: [
      [3, rect(-1.5, 0.62, 3, 0.4), -1.1, 0.82], [0, rect(-0.62, -0.1, 1.24, 0.74), -0.38, 0.42], [1, poly(-0.82, -0.1, 0, -0.84, 0.82, -0.1), 0, -0.34],
      [4, rect(-0.1, 0.16, 0.34, 0.48), 0.07, 0.42, 0.7], [2, rect(-0.5, 0.02, 0.3, 0.3), -0.35, 0.18, 0.7], [0, circ(1.05, -0.62, 0.24), 1.05, -0.61], [1, rect(0.36, -0.78, 0.18, 0.4), 0.45, -0.66, 0.6]] },
    { name: 'cvetok', cols: ['#ff6fae', '#ffd21f', '#35b24a', '#4fc3f7', '#b0764a'], parts: [
      [3, rect(-1.5, -1.1, 3, 1.75), -1.1, -0.6], [4, rect(-1.5, 0.65, 3, 0.4), -1.1, 0.84], [2, rect(-0.05, 0, 0.1, 0.7), 0, 0.5, 0.01],
      [2, ell(-0.3, 0.42, 0.26, 0.12, 0.5), -0.3, 0.42, 0.6], [2, ell(0.3, 0.42, 0.26, 0.12, -0.5), 0.3, 0.42, 0.6],
      ...[0, 1, 2, 3, 4, 5].map(i => { const a = i * Math.PI / 3 + 0.5; return [0, circ(Math.cos(a) * 0.4, -0.35 + Math.sin(a) * 0.4, 0.23), Math.cos(a) * 0.43, -0.34 + Math.sin(a) * 0.43, 0.8]; }),
      [1, circ(0, -0.35, 0.22), 0, -0.34, 0.8]] },
    { name: 'rybka', cols: ['#ff8a1c', '#4fc3f7', '#ffd21f', '#35b24a', '#f0352b'], parts: [
      [1, rect(-1.5, -1.1, 3, 2.2), -1.15, -0.7], [3, P(p => { p.moveTo(-1.2, 1.05); p.quadraticCurveTo(-1.0, 0.2, -0.8, 1.05); p.closePath(); }), -1.0, 0.8, 0.6], [3, P(p => { p.moveTo(0.95, 1.05); p.quadraticCurveTo(1.15, 0.0, 1.35, 1.05); p.closePath(); }), 1.15, 0.75, 0.6],
      [4, poly(0.42, 0, 1.0, -0.42, 1.0, 0.42), 0.82, 0.01], [0, ell(-0.15, 0, 0.66, 0.42), -0.05, 0.14], [2, P(p => { p.moveTo(-0.2, -0.4); p.quadraticCurveTo(0.05, -0.85, 0.32, -0.34); p.closePath(); }), 0.06, -0.5, 0.6],
      [2, circ(-0.5, -0.1, 0.11), -0.5, -0.1, 0.01], [2, circ(-1.0, -0.55, 0.13), -1.0, -0.54, 0.55], [2, circ(-0.8, -0.86, 0.09), -0.8, -0.86, 0.01]] },
    { name: 'babochka', cols: ['#b25de0', '#ff6fae', '#ffd21f', '#8d5a34', '#c6e84a'], parts: [
      [4, rect(-1.5, -1.1, 3, 2.2), -1.15, 0.75], [0, ell(-0.46, -0.3, 0.42, 0.36, -0.5), -0.5, -0.4], [0, ell(0.46, -0.3, 0.42, 0.36, 0.5), 0.5, -0.4],
      [1, ell(-0.36, 0.34, 0.3, 0.26, 0.5), -0.38, 0.38, 0.8], [1, ell(0.36, 0.34, 0.3, 0.26, -0.5), 0.38, 0.38, 0.8], [2, circ(-0.46, -0.12, 0.11), -0.46, -0.12, 0.01], [2, circ(0.46, -0.12, 0.11), 0.46, -0.11, 0.55],
      [3, ell(0, 0, 0.09, 0.6), 0, 0.02, 0.5]] },
    { name: 'mashina', cols: ['#f0352b', '#4fc3f7', '#2b2b2b', '#9e9e9e', '#ffd21f'], parts: [
      [1, rect(-1.5, -1.1, 3, 1.7), -1.15, -0.75], [3, rect(-1.5, 0.6, 3, 0.45), -1.15, 0.84], [4, circ(1.0, -0.66, 0.22), 1.0, -0.65],
      [0, P(p => { p.moveTo(-0.9, 0.42); p.lineTo(-0.9, 0.06); p.quadraticCurveTo(-0.9, -0.06, -0.76, -0.06); p.lineTo(-0.48, -0.06); p.lineTo(-0.28, -0.46); p.lineTo(0.36, -0.46); p.lineTo(0.56, -0.06); p.lineTo(0.8, -0.06); p.quadraticCurveTo(0.92, -0.06, 0.92, 0.08); p.lineTo(0.92, 0.42); p.closePath(); }), 0.02, 0.2],
      [1, poly(-0.36, -0.1, -0.22, -0.38, 0.02, -0.38, 0.02, -0.1), -0.14, -0.22, 0.55], [1, poly(0.1, -0.1, 0.1, -0.38, 0.3, -0.38, 0.44, -0.1), 0.24, -0.22, 0.55],
      [2, circ(-0.5, 0.46, 0.2), -0.5, 0.47, 0.7], [2, circ(0.52, 0.46, 0.2), 0.52, 0.47, 0.7]] },
  ];
  let W = 0, H = 0, dpr = 1, sc = 1, ox = 0, oy = 0, raf = 0, open = false, back = null;
  let lvl = 0, sp = 0, order = [], gi = 0, pic = null, K = 3, num = [], lab = [], filled = [], sel = 0, wrong = 0, errs = 0, doneT = 0, conf = [], t0 = 0, total = 2, pop = [], shake = -1, shakeT = 0, hintN = -1;
  const palR = () => Math.min(H * 0.105, W * 0.06), palY = () => H - palR() * 1.35, palX = i => W / 2 + (i - (K - 1) / 2) * palR() * 2.7;
  const fit = () => { dpr = Math.min(2, devicePixelRatio || 1); W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr); const ah = H - palR() * 2.9; sc = Math.min(ah * 0.47, W * 0.3); ox = W / 2; oy = ah * 0.52; };
  const colOf = n => pic.cols[n], nOf = part => part[0] % K; // у малышей красок меньше: цвета объединяются
  // подпись на кусочке: цифра или пример
  const label = n => {
    const v = num[n];
    if (lvl < 2 || sp === 0) return String(v);
    const opts = []; for (let a = 1; a < v; a++) opts.push(a + '+' + (v - a)); if (sp === 2) for (let a = v + 1; a <= Math.min(9, v + 3); a++) opts.push(a + '−' + (a - v));
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : String(v);
  };
  function setPic() {
    pic = PICS[order[gi % order.length]]; K = Math.min(pic.cols.length, [3, 5, 5][lvl] - (lvl === 1 && sp === 0 ? 1 : 0));
    const base = lvl === 2 ? [2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5]; num = shuffle(base.slice(0, lvl === 2 ? 7 : K)).slice(0, K).sort((a, b) => a - b); num = lvl === 2 ? num : shuffle(num);
    lab = pic.parts.map(p => label(nOf(p))); filled = pic.parts.map(() => false); sel = 0; wrong = 0; errs = 0; doneT = 0; pop = pic.parts.map(() => 0); hintN = -1;
  }
  function finish() {
    doneT = performance.now(); SFX.fanfare();
    for (let i = 0; i < 50; i++) conf.push({ x: W / 2 + (Math.random() - 0.5) * sc * 2, y: oy, vx: (Math.random() - 0.5) * 14 * dpr, vy: -(4 + Math.random() * 12) * dpr, c: pic.cols[i % pic.cols.length], r: (4 + Math.random() * 6) * dpr, a: Math.random() * 6 });
    Voice.say(['rask_gotovo', praise()], null).then(() => { if (!open) return; gi++; if (gi >= total) quit(true); else setTimeout(() => { if (open) setPic(); }, 600); });
  }
  function tap(e) {
    if (doneT || !pic) return; const px = e.clientX * dpr, py = e.clientY * dpr;
    for (let i = 0; i < K; i++) if (Math.hypot(px - palX(i), py - palY()) < palR() * 1.2) { sel = i; hintN = -1; tone(440 + i * 70, 0, 0.12, 'triangle', 0.1); Voice.say(num[i] <= 5 ? 'chislo_' + num[i] : 'cif_' + num[i], null); return; }
    x.setTransform(sc, 0, 0, sc, ox, oy); let hit = -1;
    for (let i = pic.parts.length - 1; i >= 0; i--) if (x.isPointInPath(pic.parts[i][1], px, py)) { hit = i; break; }
    x.setTransform(1, 0, 0, 1, 0, 0); if (hit < 0 || filled[hit]) return;
    if (nOf(pic.parts[hit]) === sel) { filled[hit] = true; pop[hit] = performance.now(); wrong = 0; hintN = -1; SFX.plop(); if (filled.every(Boolean)) finish(); }
    else { wrong++; errs++; SFX.soft(); shake = hit; shakeT = performance.now(); if (wrong >= 2) { hintN = nOf(pic.parts[hit]); Voice.say(['rask_ne', 'podskazka'], null); } else Voice.say('rask_ne', null); }
  }
  function draw(now) {
    if (!open) return; raf = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - t0) / 1000 || 0); t0 = now;
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#fff7e6'; x.fillRect(0, 0, W, H);
    if (!pic) return;
    // лист
    x.save(); x.beginPath(); const lx = ox - sc * 1.5, ly = oy - sc * 1.06, lw = sc * 3, lh = sc * 2.12; x.rect(lx, ly, lw, lh); x.fillStyle = '#fff'; x.fill(); x.clip();
    pic.parts.forEach((p, i) => {
      const n = nOf(p), dx = shake === i && now - shakeT < 350 ? Math.sin((now - shakeT) / 30) * 0.02 : 0;
      x.setTransform(sc, 0, 0, sc, ox + dx * sc, oy);
      x.fillStyle = filled[i] ? colOf(n) : '#ffffff'; x.fill(p[1]);
      if (filled[i] && now - pop[i] < 260) { x.fillStyle = `rgba(255,255,255,${0.7 * (1 - (now - pop[i]) / 260)})`; x.fill(p[1]); }
      x.lineWidth = 0.022; x.lineJoin = 'round'; x.strokeStyle = '#4a3426'; x.stroke(p[1]);
      const fs = p[4] === undefined ? 1 : p[4];
      if (!filled[i] && fs > 0.02) { const f = 0.19 * fs * (lab[i].length > 1 ? 0.72 : 1); x.font = `900 ${f}px "Arial Rounded MT Bold","Nunito","Trebuchet MS",system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = n === sel ? '#e2574c' : '#8a8072'; x.fillText(lab[i], p[2], p[3]); }
    });
    x.restore(); x.setTransform(1, 0, 0, 1, 0, 0); x.lineWidth = 5 * dpr; x.strokeStyle = '#ffb74d'; x.strokeRect(lx, ly, lw, lh);
    // краски с цифрами
    for (let i = 0; i < K; i++) {
      const r = palR() * (i === sel ? 1.12 : 1) * (hintN === i ? 1 + Math.sin(now / 110) * 0.1 : 1), px = palX(i), py = palY() - (i === sel ? palR() * 0.16 : 0);
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fillStyle = colOf(i); x.fill(); x.lineWidth = (i === sel ? 7 : 4) * dpr; x.strokeStyle = i === sel || hintN === i ? '#5d3a24' : '#ffffff'; x.stroke();
      const dark = ['#2b2b2b', '#8d5a34', '#b0764a', '#2a6df4', '#b25de0', '#f0352b', '#35b24a'].includes(colOf(i));
      x.fillStyle = dark ? '#fff' : '#4a3426'; x.font = `900 ${r * 1.05}px "Arial Rounded MT Bold","Nunito","Trebuchet MS",system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num[i], px, py - (lvl === 0 ? r * 0.14 : 0) + r * 0.05);
      if (lvl === 0) for (let k = 0; k < num[i]; k++) { x.beginPath(); x.arc(px + (k - (num[i] - 1) / 2) * r * 0.3, py + r * 0.62, r * 0.09, 0, 7); x.fill(); }
    }
    for (let i = 0; i < total; i++) { x.fillStyle = i < gi + (doneT ? 1 : 0) ? '#ffc928' : '#e6dfd2'; x.beginPath(); x.arc(W / 2 + (i - (total - 1) / 2) * 34 * dpr, 22 * dpr, 10 * dpr, 0, 7); x.fill(); }
    conf = conf.filter(c => c.y < H + 40); conf.forEach(c => { c.vy += 26 * dt * dpr; c.x += c.vx; c.y += c.vy; c.a += 0.2; x.save(); x.translate(c.x, c.y); x.rotate(c.a); x.fillStyle = c.c; x.fillRect(-c.r, -c.r * 0.6, c.r * 2, c.r * 1.2); x.restore(); });
  }
  function quit(done) {
    if (!open) return; const b = back; close();
    if (done) { const a = (S.st = S.st || {})[lvl] = S.st[lvl] || {}, r = a.rask = a.rask || { s: 0, c: 0 }; r.n = (r.n || 0) + 1; if (errs <= 1) { if (++r.c >= 2 && r.s < 2) { r.s++; r.c = 0; } } else if (errs >= 5) { r.c = 0; if (r.s > 0) r.s--; } save(); }
    go(b || goHome);
  }
  function close() { open = false; cancelAnimationFrame(raf); el.classList.remove('on'); conf = []; }
  ON_CLEAR.push(() => { if (open) close(); });
  cv.addEventListener('pointerdown', e => { e.preventDefault(); ac(); tap(e); });
  { const b = document.createElement('div'); b.className = 'btn home'; b.innerHTML = $('bHome').innerHTML; tapBtn(b, () => { SFX.tap(); quit(false); }); el.appendChild(b);
    const n = document.createElement('div'); n.className = 'btn next'; n.innerHTML = '<svg viewBox="0 0 100 100"><path d="M30 22 L68 50 L30 78" fill="none" stroke="#5d3a24" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>'; tapBtn(n, () => { if (doneT) return; SFX.tap(); order.push(order.splice(gi % order.length, 1)[0]); setPic(); }); el.appendChild(n); }
  window.openRask = bk => {
    clearWorld(); scene.background = new T.Color(C('#fff7e6'));
    back = typeof bk === 'function' ? bk : null; current = { name: 'rask', rebuild: fit, back };
    lvl = window.__lvl !== undefined ? window.__lvl : lvlOf();
    sp = window.__step !== undefined ? window.__step : Math.min(2, ((((S.st || {})[lvl] || {}).rask) || {}).s || 0);
    order = shuffle(PICS.map((_, i) => i)); gi = 0; total = 2; conf = [];
    open = true; el.classList.add('on'); fit(); setPic(); t0 = performance.now(); raf = requestAnimationFrame(draw);
    Voice.say('rask_intro', null);
  };
  window.__rask = { get state() { return { pic: pic && pic.name, K, num, lab, filled, sel, gi, done: !!doneT, open, errs }; }, show: i => { order = [i]; gi = 0; total = 99; setPic(); },
    // точка на экране для краски i и для кусочка j
    pal: i => [palX(i) / dpr, palY() / dpr], part: j => [(ox + pic.parts[j][2] * sc) / dpr, (oy + pic.parts[j][3] * sc) / dpr], nOf: j => nOf(pic.parts[j]), n: () => pic.parts.length };
  addEventListener('resize', () => { if (open) setTimeout(fit, 60); });
})();
