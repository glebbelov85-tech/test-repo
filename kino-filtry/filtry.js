// ===== Filtry 2: фильтры реального времени поверх видео (WebGL2) =====
// Картинка собирается слоями: СТИЛЬ кадра → СВЕЧЕНИЕ → СВЕТ и ЦВЕТ → АТМОСФЕРА (снег, искры...).
// Любой слой меняется плавно, поэтому сюжет может менять облик мира посреди сцены.
//
//   const f = new Filtry(canvas);            // canvas, куда рисовать
//   f.setSource(videoElement);               // что показывать (<video>: файл или камера)
//   requestAnimationFrame(function loop(ts){ f.render(ts); requestAnimationFrame(loop); });
//
//   f.setStyle('neon', 2);                   // стиль по имени или номеру, переход 2 секунды
//   f.setStyle('eho', 3, 'pyatna');          // вид перехода: plavno, pyatna, volna, krug, svet, pesok
//   f.amount = 0.7;                          // сила стиля: 0 = чистое видео, 1 = полный эффект
//   f.setAtmos('sneg', 3, 0.6);              // атмосфера: имя (или список имён), секунды, густота
//   f.setLight('zakat', 10);                 // свет: рассвет, закат, ночь, сияние...
//   f.setGrade('kino', 2);                   // цветокоррекция
//   f.set({ wind: 0.8, bloom: 0.5, grain: 0.2, vign: 0.3 }, 2);   // отдельные ручки, плавно за 2 с
//   f.setLook('metel', 4);                   // готовый образ: всё сразу
//
// Старый способ тоже работает: f.setPos(1.5), f.setEffectId(13), f.quality, f.strobe, f.vr, f.pulse.
// Нужен файл shader.js (подключить раньше этого).
"use strict";

class Filtry {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.fit = opts.fit || 'contain';      // 'contain' - всё видео с полями, 'cover' - на весь экран с обрезкой
    this.quality = opts.quality || 1;      // дополнительный множитель разрешения (старый способ)
    this.histN = opts.histN || 48;         // сколько прошлых кадров помнить (48 при 30 к/с = 1.6 с)
    this.histW = opts.histW || 0;          // ширина кадров в ленте прошлого (0 = по уровню качества)
    this.amount = 1; this.touch = [0.5, 0.5]; this.mirror = false; this.vr = false;
    this.strobe = false; this.pulse = 0; this.split = 0;
    this.time = 0; this._last = 0; this._frame = 0;
    this.head = 0; this.histCount = 0; this.histTex = null; this.HW = 0; this.HH = 0;
    this.sA = 0; this.sB = 0; this.mix = 0; this.trans = 1; this._sAnim = null;     // стиль: откуда, куда, доля
    this.atm = [];                                                                   // активные слои атмосферы
    this.P = Object.assign({}, Filtry.DEFAULTS); for (const k in this.P) if (Array.isArray(this.P[k])) this.P[k] = this.P[k].slice();
    this._tw = {}; this.lightName = 'none'; this.gradeName = 'none';
    this.windPos = [0, 0]; this.windNow = [0, 0];
    this.tier = opts.tier != null ? opts.tier : 1; this.auto = opts.auto !== false; this.fps = 0; this.onTier = null;
    this._af = 0; this._at = 0; this._low = 0; this._good = 0; this._burn = -1; this._hitch = false; this._sig = '';
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    if (!gl) { this.ok = false; return; }
    this.ok = true; this.G = window.FILTRY_GL; this.progs = {}; this.rts = {};
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // один большой треугольник
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = this._blackTex(); this.src2Tex = this._blackTex(); this.black = this._blackTex();
    this.fbo = gl.createFramebuffer();
    this.src2 = null; this.xf = 0;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
  }

  // ================= что показывать =================
  setSource(video, mirror = false) { this.src = video; this.mirror = mirror; this._watch(video); this._dirty = true; this.resetHistory(); }
  // склейка: второй источник и доля его в кадре (0..1). Размер кадра должен совпадать с основным
  setCrossfade(video2, xf) { this.src2 = video2; this.xf = video2 ? Math.max(0, Math.min(1, xf)) : 0; if (video2) this._watch(video2); }
  // забыть прошлые кадры (на склейке отрезков, иначе «время»-эффекты смешают два отрезка)
  resetHistory() { this.histCount = 0; }

  // ================= стиль =================
  static styleId(x) {
    if (typeof x === 'number') return x;
    const e = Filtry.EFFECTS.find(e => e.key === x); return e ? e.id : (x === 'obychnoe' ? 0 : null);
  }
  static info(id) { return Filtry.EFFECTS.find(e => e.id === id) || Filtry.EFFECTS[0]; }
  // плавно перейти к стилю. trans: вид перехода (имя из Filtry.TRANS)
  setStyle(x, fade = 1.2, trans) {
    const id = Filtry.styleId(x); if (id == null || !this.G.STYLES[id]) { console.warn('Filtry: нет стиля', x); return false; }
    if (trans != null) this.trans = typeof trans === 'number' ? trans : Math.max(0, Filtry.TRANS.findIndex(t => t.key === trans));
    if (this.mix >= 0.5) this.sA = this.sB;                      // если шёл другой переход - стартуем с того, что видно
    this.mix = 0;
    if (id === this.sA) { this._sAnim = null; return true; }
    if (fade <= 0) { this.sA = id; this._sAnim = null; return true; }
    this.sB = id; this._sAnim = { t: 0, dur: fade }; this._prog('s' + id);
    return true;
  }
  // два стиля одновременно: постоянная смесь (mix 0..1 - доля второго). Без второго: setStyle(a)
  // применить состояние в формате сцены (то же, что пишется в отрезок, событие или вариант выбора):
  //   look, filter, filter2 + mix (смесь двух стилей), trans, atmos + atmosAmount, light + lightAmount, grade + gradeAmount, fx { amount, wind, bloom ... }
  apply(e, fade = 1.5) {
    if (!e) return;
    if (e.look != null) this.setLook(e.look, fade);
    if (e.filter != null && e.filter2 != null && e.filter2 !== 'none' && e.filter !== 'none') this.setBlend(e.filter, e.filter2, e.mix != null ? e.mix : 0.5);
    else if (e.filter != null) this.setStyle(e.filter, fade, e.trans);
    if (e.atmos != null) this.setAtmos(e.atmos, fade, e.atmosAmount != null ? e.atmosAmount : 0.6);
    if (e.light != null) this.setLight(e.light, fade, e.lightAmount != null ? e.lightAmount : 1);
    if (e.grade != null) this.setGrade(e.grade, fade, e.gradeAmount != null ? e.gradeAmount : 1);
    if (e.fx) this.set(e.fx, fade);
  }
  setBlend(a, b, mix = 0.5) {
    const ia = Filtry.styleId(a), ib = Filtry.styleId(b); if (ia == null || ib == null) return false;
    this._sAnim = null; this.sA = ia; this.sB = ib; this.mix = Math.max(0.001, Math.min(1, mix)); this.trans = 0; this._dirty = true; return true;
  }
  get styleTarget() { return this._sAnim || this.mix > 0 ? this.sB : this.sA; }
  // --- старый способ: позиция на ползунке (дробная = смесь соседних) ---
  get pos() { const E = Filtry.EFFECTS, ia = E.findIndex(e => e.id === this.sA); if (this.mix <= 0) return ia; const ib = E.findIndex(e => e.id === this.sB); return ia + (ib - ia) * this.mix; }
  set pos(v) { this.setPos(v); }
  setPos(v) {
    const E = Filtry.EFFECTS; v = Math.max(0, Math.min(E.length - 1, v));
    const i0 = Math.floor(v), i1 = Math.min(E.length - 1, i0 + 1);
    this._sAnim = null; this.sA = E[i0].id; this.sB = E[i1].id; this.mix = v - i0; if (this.mix < 0.002) this.mix = 0;
  }
  setEffectId(id) { this.setStyle(id, 0); }
  current() { return Filtry.info(this.mix >= 0.5 ? this.sB : this.sA); }

  // ================= атмосфера, свет, цвет, ручки =================
  // names: 'sneg' | ['sneg','tuman'] | [['sneg',0.8],['tuman',0.3]] | 'none'
  setAtmos(names, fade = 2, amount = 0.6) {
    let list = names == null || names === 'none' ? [] : (Array.isArray(names) ? names : [names]);
    list = list.map(n => Array.isArray(n) ? n : [n, amount]).filter(n => Filtry.ATMOS[n[0]]);
    const rate = fade > 0 ? 1 / fade : 1e6;
    for (const a of this.atm) { a.tgt = 0; a.rate = rate; }
    for (const [k, amt] of list) {
      let a = this.atm.find(a => a.key === k);
      if (!a) { a = { key: k, lvl: 0, amt }; this.atm.push(a); this._prog('a' + Filtry.ATMOS[k].prog); }
      a.tgt = 1; a.rate = rate; a.amtTo = amt; a.amtRate = Math.abs(amt - a.amt) * rate;
    }
  }
  atmosNow() { return this.atm.filter(a => a.tgt > 0).map(a => a.key); }
  setLight(name, fade = 3, amount = 1) {
    const L = Filtry.LIGHTS[name];
    if (!L || name === 'none') { this.lightName = 'none'; return this.set({ light: 0, rays: 0, flare: 0 }, fade); }
    const t = { light: amount, Ltop: L.top, Lhor: L.hor, Lgnd: L.gnd, Lsun: L.sun, Lshadow: L.shadow, sunX: L.sunPos[0], sunY: L.sunPos[1],
      shimmer: L.shimmer || 0, horizon: L.horizon || 0.42, exposure: L.exposure || 1, sunAmt: L.sunAmt || 0, aurora: L.aurora || 0, storm: L.storm || 0, fire: L.fire || 0,
      rays: (L.rays || 0) * amount, flare: (L.flare || 0) * amount };
    if (this.P.light < 0.01 && !this._tw.light) { const now = Object.assign({}, t); delete now.light; delete now.rays; delete now.flare; this.set(now, 0); }   // свет был выключен: цвета ставим сразу
    this.lightName = name; this.set(t, fade);
  }
  setGrade(name, fade = 2, amount = 1) {
    const g = Filtry.GRADES[name];
    if (!g || name === 'none') { this.gradeName = 'none'; return this.set({ grade: 0 }, fade); }
    const t = { grade: amount, Glift: g.lift || [0, 0, 0], Ggain: g.gain || [1, 1, 1], Gcon: g.contrast || 1, Gsat: g.sat != null ? g.sat : 1, Gfade: g.fade || 0, Gbw: g.bw || 0 };
    if (this.P.grade < 0.01 && !this._tw.grade) { const now = Object.assign({}, t); delete now.grade; this.set(now, 0); }
    this.gradeName = name; this.set(t, fade);
  }
  // отдельные ручки: amount, bloom, bloomTh, grain, vign, ca, bars, rays, flare, wind, windY, sunX, sunY, light, grade...
  set(obj, fade = 0) {
    for (const k in obj) {
      let to = obj[k]; if (to == null) continue;
      const cur = k === 'amount' ? this.amount : this.P[k]; if (cur === undefined) continue;
      if (fade <= 0) { delete this._tw[k]; if (k === 'amount') this.amount = to; else this.P[k] = Array.isArray(to) ? to.slice() : to; }
      else this._tw[k] = { from: Array.isArray(cur) ? cur.slice() : cur, to, t: 0, dur: fade };
    }
    this._dirty = true;
  }
  // готовый образ: стиль + атмосфера + свет + цвет + ручки. Чего в образе нет, то выключается
  setLook(name, fade = 2.5) {
    const L = Filtry.LOOKS[name]; if (!L) { console.warn('Filtry: нет образа', name); return false; }
    this.lookName = name;
    this.setStyle(L.style || 0, fade, L.trans != null ? L.trans : 'pyatna');
    this.setAtmos(L.atmos || 'none', fade);
    this.setLight(L.light || 'none', fade, L.lightAmt != null ? L.lightAmt : 1);
    this.setGrade(L.grade || 'none', fade, L.gradeAmt != null ? L.gradeAmt : 1);
    const f = Filtry.DEFAULTS, t = { amount: L.amount != null ? L.amount : 1, wind: L.wind || 0, windY: 0 };
    for (const k of ['bloom', 'bloomTh', 'grain', 'vign', 'ca', 'bars']) t[k] = L[k] != null ? L[k] : f[k];
    if (L.rays != null) t.rays = L.rays; if (L.flare != null) t.flare = L.flare;
    if (L.sun) { t.sunX = L.sun[0]; t.sunY = L.sun[1]; }
    this.set(t, fade); return true;
  }
  // заранее собрать программы (чтобы в момент смены облика не было рывка). Без списка - всё подряд, понемногу
  warmup(list) {
    const q = [];
    if (!list) { for (const e of Filtry.EFFECTS) q.push('s' + e.id); for (const k in this.G.ATMOS) q.push('a' + k); }
    else for (const x of list) { const id = Filtry.styleId(x); if (id != null && this.G.STYLES[id]) q.push('s' + id); else if (Filtry.ATMOS[x]) q.push('a' + Filtry.ATMOS[x].prog); }
    ['comp', 'pre', 'down', 'up', 'rays', 'copy'].forEach(k => q.unshift(k));
    const step = () => { if (this.lost) return; const k = q.shift(); if (k) { this._prog(k); this._hitch = true; setTimeout(step, 30); } };
    step();
  }

  // ================= качество =================
  setTier(i, why) {
    i = Math.max(0, Math.min(Filtry.TIERS.length - 1, i)); if (i === this.tier) return;
    this.tier = i; this._dirty = true; this._low = 0; this._good = 0;
    if (this.onTier) this.onTier(i, why || 'manual');
  }
  tierName() { return Filtry.TIERS[this.tier].name; }
  // грубая оценка видеокарты: сколько миллисекунд уходит на один тяжёлый кадр. Ставит стартовый уровень.
  calibrate() {
    if (!this.ok) return null; const gl = this.gl, W = 1280, H = 548, rt = this._rt('cal', W, H), px = new Uint8Array(4);
    const run = n => { const t0 = performance.now(); for (let i = 0; i < n; i++) this._drawStyle(13, rt, W, H, [0, 0, 1, 1], [W, H], 1, true); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (performance.now() - t0) / n; };
    run(1); const ms = run(4); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const tier = ms < 4 ? 0 : ms < 8 ? 1 : ms < 14 ? 2 : ms < 24 ? 3 : 4;
    this.calMs = ms; this.setTier(tier, 'calibrate'); this._hitch = true; return { ms, tier };
  }
  _auto(dt) {
    if (dt <= 0 || dt > 0.5) return;                              // вкладка была скрыта
    this._af++; this._at += dt; if (this._at < 1) return;
    const fps = this.fps = this._af / this._at; this._af = 0; this._at = 0;
    if (this._hitch) { this._hitch = false; return; }             // в эту секунду собирались программы - не считается
    if (!this.auto || !this.src || this.src.paused) return;
    const T = Filtry.TIERS; this._peak = Math.max(this._peak || 0, Math.min(fps, 62));
    if (this._probe) {                                            // проверяем, помогло ли снижение
      if (--this._probe.left <= 0) { const p = this._probe; this._probe = null;
        if (p.before >= 27 && fps < p.before * 1.15) { this._capped = true; this.setTier(p.tier, 'auto'); return; } }   // не помогло: это потолок браузера, а не нагрузка
      return;
    }
    this._low = fps < 27 ? this._low + 2 : (fps < 42 && !this._capped ? this._low + 1 : 0);
    this._good = fps >= Math.min(57, this._peak * 0.93) ? this._good + 1 : 0;
    if (this._low >= 4 && this.tier < T.length - 1) {
      if (this._upAt != null && this.time - this._upAt < 12) this._burn = this.tier;        // только что подняли и не потянуло: больше не пробуем
      this._probe = { tier: this.tier, before: fps, left: 3 }; this.setTier(this.tier + 1, 'auto');
    } else if (this._good >= 15 && this.tier > 0 && this.tier - 1 > this._burn) { this._upAt = this.time; this.setTier(this.tier - 1, 'auto'); }
  }

  // ================= внутреннее: WebGL =================
  _blackTex() { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); this._texParams(gl.TEXTURE_2D); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255])); return t; }
  _texParams(target) {
    const gl = this.gl;
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(target, k, v);
  }
  _sh(type, src) {
    const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
  }
  _prog(key) {
    if (this.progs[key]) return this.progs[key];
    const gl = this.gl, G = this.G; let vs = G.VS, fs;
    if (key[0] === 's') fs = G.HEAD + G.STYLES[+key.slice(1)].replace(/^#define OWN\n/, m => m) + G.TAIL;
    else if (key[0] === 'a') fs = G.ATM_HEAD + G.ATMOS[key.slice(1)] + G.ATM_TAIL;
    else if (key === 'comp') { vs = G.COMP_VS; fs = G.COMP; }
    else fs = { copy: G.COPY, pre: G.BLOOM_PRE, down: G.BLOOM_DOWN, up: G.BLOOM_UP, rays: G.RAYS, present: G.PRESENT }[key];
    const p = gl.createProgram();
    try { gl.attachShader(p, this._sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, this._sh(gl.FRAGMENT_SHADER, fs)); }
    catch (e) { console.error('Filtry: шейдер ' + key + ' не собрался: ' + e.message); this.errors = (this.errors || []).concat(key + ': ' + e.message); return this.progs[key] = key === 's0' ? null : this._prog('s0'); }
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('Filtry: ' + key + ': ' + gl.getProgramInfoLog(p)); this.errors = (this.errors || []).concat(key + ': link'); return this.progs[key] = key === 's0' ? null : this._prog('s0'); }
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    this._hitch = true;
    return this.progs[key] = { p, u };
  }
  _rt(name, w, h) {       // текстура, в которую можно рисовать
    const gl = this.gl; w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    let r = this.rts[name];
    if (r && r.w === w && r.h === h) return r;
    if (r) { gl.deleteTexture(r.tex); gl.deleteFramebuffer(r.fbo); }
    r = this.rts[name] = { w, h, tex: gl.createTexture(), fbo: gl.createFramebuffer() };
    gl.bindTexture(gl.TEXTURE_2D, r.tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h); this._texParams(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.tex, 0);
    return r;
  }
  _bind(unit, tex, target) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target || gl.TEXTURE_2D, tex); }
  _to(rt, W, H, x = 0, y = 0) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fbo : null); gl.viewport(x, y, W, H); }
  _watch(v) {              // браузер сам сообщает, когда у видео новый кадр: лишний раз в видеокарту не копируем
    if (!v || v._fW || !v.requestVideoFrameCallback) return; v._fW = true;
    const cb = () => { v._fresh = true; v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb);
  }
  _upload(v, tex, mip) {
    const gl = this.gl; this._bind(0, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    if (tex._mip !== mip) { tex._mip = mip; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); }
  }
  _makeHist(vw, vh, hw) {
    const gl = this.gl;
    this.HW = hw; this.HH = Math.max(2, Math.round(hw * vh / vw));
    if (this.histTex) gl.deleteTexture(this.histTex);
    this.histTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.histTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, this.HW, this.HH, this.histN);
    this._texParams(gl.TEXTURE_2D_ARRAY);
    this.histCount = 0; this._histFor = vw + 'x' + vh + 'x' + hw;
  }
  _pushHist() {
    const gl = this.gl, P = this._prog('copy');
    this.head = (this.head + 1) % this.histN; this.histCount++;
    gl.useProgram(P.p); this._bind(0, this.srcTex); gl.uniform1i(P.u.uSrc, 0); gl.uniform4f(P.u.uUV, 0, 0, 1, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.HW, this.HH);
    const layers = this.histCount === 1 ? [...Array(this.histN).keys()] : [this.head];   // в начале вся лента = текущий кадр
    for (const l of layers) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.histTex, 0, l); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  }
  _drawStyle(id, rt, W, H, uv, res, amount, noHist) {
    const gl = this.gl, P = this._prog('s' + id) || this._prog('s0'), U = P.u, T = Filtry.TIERS[this.tier];
    gl.useProgram(P.p); this._to(rt, W, H, rt ? 0 : this._vp[0], rt ? 0 : this._vp[1]);
    this._bind(0, this.srcTex); this._bind(2, this.xfNow > 0 ? this.src2Tex : this.black);
    this._bind(1, noHist || !this.histTex ? null : this.histTex, gl.TEXTURE_2D_ARRAY);
    gl.uniform1i(U.uSrc, 0); gl.uniform1i(U.uHist, 1); gl.uniform1i(U.uSrc2, 2);
    gl.uniform1f(U.uXf, this.xfNow || 0); gl.uniform1i(U.uHead, this.head); gl.uniform1i(U.uN, this.histN);
    gl.uniform1i(U.uQ, T.uQ); gl.uniform1f(U.uAmt, amount); gl.uniform1f(U.uTime, this.time); gl.uniform1f(U.uMirror, this.mirror ? 1 : 0);
    let freeze = -1, pulse = this.pulse;
    if (this.strobe) { freeze = this.histCount % 6; if (freeze === 0) pulse += 0.12; }
    gl.uniform1i(U.uFreeze, freeze); gl.uniform1f(U.uPulse, rt ? 0 : pulse);
    gl.uniform2f(U.uTouch, this.touch[0], this.touch[1]); gl.uniform2f(U.uRes, res[0], res[1]);
    gl.uniform2f(U.uVRes, this._vw || 1, this._vh || 1); gl.uniform2f(U.uHRes, this.HW || 1, this.HH || 1);
    gl.uniform2f(U.uWind, this.windNow[0], this.windNow[1]); gl.uniform2f(U.uWindPos, this.windPos[0], this.windPos[1]);
    gl.uniform4f(U.uUV, uv[0], uv[1], uv[2], uv[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  _resize() {
    const c = this.canvas, T = Filtry.TIERS[this.tier];
    let dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    let w = c.clientWidth * dpr, h = c.clientHeight * dpr; const k = Math.min(1, T.maxW * this.quality / Math.max(w, h));
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this._dirty = true; }
  }
  _tween(dt) {
    let busy = false;
    for (const k in this._tw) {
      const a = this._tw[k]; a.t += dt; const x = Math.min(1, a.t / a.dur), s = x * x * (3 - 2 * x);
      const v = Array.isArray(a.to) ? a.to.map((b, i) => a.from[i] + (b - a.from[i]) * s) : a.from + (a.to - a.from) * s;
      if (k === 'amount') this.amount = v; else this.P[k] = v;
      if (x >= 1) delete this._tw[k]; busy = true;
    }
    if (this._sAnim) { const a = this._sAnim; a.t += dt; const x = Math.min(1, a.t / a.dur); this.mix = x * x * (3 - 2 * x); if (x >= 1) { this.sA = this.sB; this.mix = 0; this._sAnim = null; } busy = true; }
    for (let i = this.atm.length - 1; i >= 0; i--) {
      const a = this.atm[i];
      if (a.lvl !== a.tgt) { a.lvl = a.tgt > a.lvl ? Math.min(a.tgt, a.lvl + dt * a.rate) : Math.max(a.tgt, a.lvl - dt * a.rate); busy = true; }
      if (a.amtTo != null && a.amt !== a.amtTo) a.amt = a.amtTo > a.amt ? Math.min(a.amtTo, a.amt + dt * a.amtRate) : Math.max(a.amtTo, a.amt - dt * a.amtRate);
      if (a.tgt === 0 && a.lvl <= 0) this.atm.splice(i, 1);
    }
    // ветер: порывы то сильнее, то слабее; копим пройденный путь, чтобы частицы не прыгали при смене силы
    const t = this.time, gust = 0.7 + 0.3 * Math.sin(t * 0.71) * Math.sin(t * 0.23 + 1) + 0.25 * Math.sin(t * 1.9 + 2) * Math.sin(t * 0.37);
    this.windNow = [this.P.wind * gust, this.P.windY * gust];
    this.windPos[0] = (this.windPos[0] + this.windNow[0] * dt * 0.5) % 1000; this.windPos[1] = (this.windPos[1] + this.windNow[1] * dt * 0.5) % 1000;
    return busy;
  }

  // ================= кадр =================
  render(ts) {
    if (!this.ok || this.lost) return;
    const gl = this.gl, v = this.src, T = Filtry.TIERS[this.tier], P = this.P;
    const rdt = this._last ? (ts - this._last) / 1000 : 0, dt = Math.min(0.05, rdt); this._last = ts;
    this.time += dt; this._frame++; this._auto(rdt);
    const busy = this._tween(dt);
    this._resize();
    const cw = this.canvas.width, ch = this.canvas.height;
    if (!v || !v.videoWidth || v.readyState < 2) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); this._dirty = true; return; }
    const vw = this._vw = v.videoWidth, vh = this._vh = v.videoHeight;
    const A = Filtry.info(this.sA), B = Filtry.info(this.mix > 0 ? this.sB : this.sA);
    const needHist = !!(A.time || B.time || this.strobe), needMip = !!(A.mip || B.mip);
    // 1. свежий кадр видео -> текстура (только когда он действительно новый)
    const rvfc = !!v.requestVideoFrameCallback;
    let fresh = !rvfc || v._fresh || this._srcOf !== v || this.srcTex._mip !== needMip; v._fresh = false; this._srcOf = v;
    this.xfNow = 0;
    if (this.src2 && this.xf > 0 && this.src2.readyState >= 2) { this.xfNow = this.xf; this._upload(this.src2, this.src2Tex, needMip); fresh = true; }
    if (fresh) this._upload(v, this.srcTex, needMip);
    // 2. уменьшенная копия в ленту прошлого - только если стилю нужно прошлое
    if (needHist) {
      const hw = this.histW || T.histW;
      if (!this.histTex || this._histFor !== vw + 'x' + vh + 'x' + hw) this._makeHist(vw, vh, hw);
      const tick = rvfc ? fresh : this._frame % 2 === 0;
      if (tick && (!v.paused || this.histCount === 0)) this._pushHist();
    }
    // 3. нужно ли вообще что-то рисовать в этот раз
    const atmOn = this.atm.length > 0, la = P.light;
    const anim = busy || atmOn || A.anim || B.anim || this.pulse > 0 || this.strobe || (la > 0 && (P.aurora > 0 || P.storm > 0 || P.fire > 0 || P.shimmer > 0.5));
    const sig = [this.amount, this.touch[0], this.touch[1], this.split, this.vr, this.mirror, this.fit, this.sA, this.sB, this.mix, cw, ch, this.tier].join();
    if (sig !== this._sig) { this._sig = sig; this._dirty = true; }
    if (!fresh && !this._dirty && (!anim || (T.skip > 1 && this._frame % T.skip))) return;
    this._dirty = false;
    // 4. куда на экране ложится видео
    let s, uv, vp, res;
    if (this.vr) { s = Math.min(1, T.maxW / vw); uv = [0, 0, 1, 1]; vp = [0, 0, Math.round(vw * s), Math.round(vh * s)]; res = [vp[2], vp[3]]; }
    else if (this.fit === 'cover') { s = Math.max(cw / vw, ch / vh); const fx = cw / (vw * s), fy = ch / (vh * s); uv = [(1 - fx) / 2, (1 - fy) / 2, fx, fy]; vp = [0, 0, cw, ch]; res = [vw * s, vh * s]; }
    else { s = Math.min(cw / vw, ch / vh); const rw = Math.round(vw * s), rh = Math.round(vh * s); uv = [0, 0, 1, 1]; vp = [Math.round((cw - rw) / 2), Math.round((ch - rh) / 2), rw, rh]; res = [rw, rh]; }
    this._vp = vp; const W = vp[2], H = vp[3];
    // 5. ручки с учётом того, что просит сам стиль (неону нужно свечение и т.п.)
    const hint = k => (A[k] || 0) * (1 - this.mix) + (B[k] || 0) * this.mix;
    const sAmt = Math.min(1, this.amount);
    let bloom = Math.max(P.bloom, hint('bloom') * sAmt), grain = Math.max(P.grain, hint('grain') * sAmt), vign = Math.max(P.vign, hint('vign') * sAmt), ca = Math.max(P.ca, hint('ca') * sAmt);
    let bth = P.bloomTh; const bh = hint('bloom') * sAmt; if (bh > P.bloom) bth = Math.min(bth, (A.bloomTh != null ? A.bloomTh : 0.6) * (1 - this.mix) + (B.bloomTh != null ? B.bloomTh : 0.6) * this.mix);
    let rays = P.rays, flare = P.flare;
    if (!T.bloom) { bloom = 0; rays = 0; }
    const post = this.vr || this.mix > 0 || atmOn || bloom > 0.003 || grain > 0.003 || vign > 0.003 || ca > 0.003 || P.bars > 0.003 || rays > 0.003 || flare > 0.003 || la > 0.003 || P.grade > 0.003 || this.split > 0;
    gl.disable(gl.BLEND);
    if (!this.vr) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); if (vp[2] < cw || vp[3] < ch) { gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } }
    if (!post) { this._drawStyle(this.sA, null, W, H, uv, res, this.amount); return; }   // короткий путь: один проход прямо на экран
    // 6. стиль(и) в текстуру
    const rtA = this._rt('A', W, H); this._drawStyle(this.sA, rtA, W, H, uv, res, this.amount);
    let rtB = rtA; if (this.mix > 0) { rtB = this._rt('B', W, H); this._drawStyle(this.sB, rtB, W, H, uv, res, this.amount); }
    // 7. свечение: уменьшаем яркие места в несколько раз и складываем обратно
    let bloomTex = this.black, raysTex = this.black;
    if (bloom > 0.003 || rays > 0.003 || flare > 0.003) {
      const srcRt = this.mix >= 0.5 ? rtB : rtA, n = Math.max(2, T.bloom || 2), L = [];
      for (let i = 0; i < n; i++) L.push(this._rt('b' + i, W / (4 << i), H / (4 << i)));
      let Pg = this._prog('pre'); gl.useProgram(Pg.p); this._to(L[0], L[0].w, L[0].h); this._bind(0, srcRt.tex);
      gl.uniform1i(Pg.u.uT, 0); gl.uniform2f(Pg.u.uPx, 1 / W, 1 / H); gl.uniform1f(Pg.u.uTh, bth); gl.uniform4f(Pg.u.uUV, 0, 0, 1, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
      Pg = this._prog('down'); gl.useProgram(Pg.p); gl.uniform1i(Pg.u.uT, 0); gl.uniform4f(Pg.u.uUV, 0, 0, 1, 1);
      for (let i = 1; i < n; i++) { this._to(L[i], L[i].w, L[i].h); this._bind(0, L[i - 1].tex); gl.uniform2f(Pg.u.uPx, 1 / L[i - 1].w, 1 / L[i - 1].h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      Pg = this._prog('up'); gl.useProgram(Pg.p); gl.uniform1i(Pg.u.uT, 0); gl.uniform4f(Pg.u.uUV, 0, 0, 1, 1);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = n - 2; i >= 0; i--) { this._to(L[i], L[i].w, L[i].h); this._bind(0, L[i + 1].tex); gl.uniform2f(Pg.u.uPx, 0.5 / L[i + 1].w, 0.5 / L[i + 1].h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      gl.disable(gl.BLEND); bloomTex = L[0].tex;
      if (rays > 0.003) {
        const R = this._rt('rays', L[0].w, L[0].h); Pg = this._prog('rays'); gl.useProgram(Pg.p); this._to(R, R.w, R.h); this._bind(0, L[1].tex);
        gl.uniform1i(Pg.u.uT, 0); gl.uniform2f(Pg.u.uSun, P.sunX, P.sunY); gl.uniform4f(Pg.u.uUV, uv[0], uv[1], uv[2], uv[3]); gl.uniform1i(Pg.u.uQ, T.uQ); gl.drawArrays(gl.TRIANGLES, 0, 3);
        raysTex = R.tex;
      }
    }
    // 8. сборка кадра: переход между стилями, свет, цвет, зерно
    const fin = this.vr ? this._rt('fin', W, H) : null;
    const C = this._prog('comp'), U = C.u; gl.useProgram(C.p); this._to(fin, W, H, fin ? 0 : vp[0], fin ? 0 : vp[1]);
    this._bind(0, rtA.tex); this._bind(1, rtB.tex); this._bind(2, bloomTex); this._bind(3, raysTex); this._bind(4, this.srcTex);
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uBloom, 2); gl.uniform1i(U.uRays, 3); gl.uniform1i(U.uRaw, 4);
    gl.uniform1f(U.uMix, this.mix); gl.uniform1i(U.uTrans, this.trans); gl.uniform1i(U.uQ, T.uQ); gl.uniform1f(U.uTime, this.time);
    gl.uniform1f(U.uSplit, this.split); gl.uniform1f(U.uMirror, this.mirror ? 1 : 0);
    gl.uniform2f(U.uRes, res[0], res[1]); gl.uniform2f(U.uTouch, this.touch[0], this.touch[1]); gl.uniform2f(U.uSun, P.sunX, P.sunY);
    gl.uniform2f(U.uWind, this.windNow[0], this.windNow[1]); gl.uniform4f(U.uUV, uv[0], uv[1], uv[2], uv[3]);
    gl.uniform4f(U.uFin, bloom * 0.6, grain, vign, ca); gl.uniform4f(U.uFin2, P.bars, rays, flare, 0);
    gl.uniform4f(U.uLp, la, P.shimmer, P.horizon, P.exposure); gl.uniform4f(U.uLq, P.sunAmt, P.aurora, P.storm, P.fire);
    gl.uniform3fv(U.uLtop, P.Ltop); gl.uniform3fv(U.uLhor, P.Lhor); gl.uniform3fv(U.uLgnd, P.Lgnd); gl.uniform3fv(U.uLsun, P.Lsun); gl.uniform3fv(U.uLshadow, P.Lshadow);
    gl.uniform4f(U.uGp, P.grade, P.Gcon, P.Gsat, P.Gfade); gl.uniform3fv(U.uGlift, P.Glift); gl.uniform3fv(U.uGgain, P.Ggain); gl.uniform1f(U.uGbw, P.Gbw);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 9. атмосфера: полупрозрачные слои поверх
    if (atmOn) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const a of this.atm) {
        const M = Filtry.ATMOS[a.key], Pa = this._prog('a' + M.prog); if (!Pa || !Pa.u.uAmt) continue; const Ua = Pa.u;
        gl.useProgram(Pa.p); this._bind(0, rtA.tex); gl.uniform1i(Ua.uScene, 0);
        gl.uniform1f(Ua.uTime, this.time); gl.uniform1f(Ua.uAmt, a.amt * a.lvl); gl.uniform1f(Ua.uVar, M.v || 0); gl.uniform1f(Ua.uSplit, this.split); gl.uniform1f(Ua.uBars, P.bars);
        gl.uniform1i(Ua.uQ, T.uQ); gl.uniform2f(Ua.uRes, res[0], res[1]); gl.uniform4f(Ua.uUV, uv[0], uv[1], uv[2], uv[3]);
        gl.uniform2f(Ua.uWind, this.windNow[0], this.windNow[1]); gl.uniform2f(Ua.uWindPos, this.windPos[0], this.windPos[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    // 10. VR-шлем: готовую картинку два раза, с «бочкой» под линзы
    if (this.vr) {
      const Pp = this._prog('present'), ew = cw / 2, sc = Math.max(ew / vw, ch / vh) * 1.15;
      gl.useProgram(Pp.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null); this._bind(0, fin.tex); gl.uniform1i(Pp.u.uT, 0);
      gl.uniform2f(Pp.u.uRes, ew, ch); gl.uniform2f(Pp.u.uScale, ew / (vw * sc), ch / (vh * sc)); gl.uniform2f(Pp.u.uOff, (1 - ew / (vw * sc)) / 2, (1 - ch / (vh * sc)) / 2); gl.uniform4f(Pp.u.uUV, 0, 0, 1, 1);
      for (let e = 0; e < 2; e++) { gl.viewport(e * ew, 0, ew, ch); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    }
  }
}

// ---------- ручки по умолчанию ----------
Filtry.DEFAULTS = {
  bloom: 0, bloomTh: 0.62, grain: 0, vign: 0, ca: 0, bars: 0, rays: 0, flare: 0, wind: 0, windY: 0, sunX: 0.7, sunY: 0.6,
  light: 0, shimmer: 0, horizon: 0.42, exposure: 1, sunAmt: 0, aurora: 0, storm: 0, fire: 0,
  Ltop: [0.5, 0.6, 0.9], Lhor: [1, 0.8, 0.6], Lgnd: [0.5, 0.5, 0.5], Lsun: [1, 0.8, 0.6], Lshadow: [1, 1, 1],
  grade: 0, Glift: [0, 0, 0], Ggain: [1, 1, 1], Gcon: 1, Gsat: 1, Gfade: 0, Gbw: 0
};

// ---------- уровни качества (авто-качество шагает по ним само) ----------
// maxW - длинная сторона картинки в точках; histW - ширина кадров «прошлого»; uQ - упрощение шейдеров;
// bloom - сколько ступеней свечения (0 = выключено); skip - рисовать частицы через кадр
Filtry.TIERS = [
  { name: 'Макс',    maxW: 1920, histW: 640, uQ: 0, bloom: 4, skip: 1 },
  { name: 'Высокое', maxW: 1440, histW: 480, uQ: 0, bloom: 4, skip: 1 },
  { name: 'Среднее', maxW: 1120, histW: 384, uQ: 1, bloom: 3, skip: 1 },
  { name: 'Лёгкое',  maxW: 854,  histW: 320, uQ: 2, bloom: 3, skip: 1 },
  { name: 'Минимум', maxW: 640,  histW: 256, uQ: 2, bloom: 0, skip: 2 }
];

// ---------- виды перехода между стилями ----------
Filtry.TRANS = [
  { key: 'plavno', name: 'Плавно' }, { key: 'pyatna', name: 'Пятнами' }, { key: 'volna', name: 'Волной' },
  { key: 'krug', name: 'Кругом из точки' }, { key: 'svet', name: 'От светлого' }, { key: 'pesok', name: 'Рассыпаться песком' }
];

// ---------- стили. id = номер программы в shader.js ----------
// cost: 1 лёгкий, 2 средний, 3 тяжёлый. time: нужны прошлые кадры. mip: нужно размытие. anim: движется сам по себе.
// bloom/grain/vign/ca: сколько свечения, зерна и т.п. стиль просит сам. taps: чтений картинки на точку (полное/лёгкое).
Filtry.EFFECTS = [
  { id: 0,  key: 'none',      e: '🎬', name: 'Обычное видео',    grp: 'Без фильтра', cost: 1, taps: [1, 1] },
  { id: 13, key: 'neon',      e: '⚡', name: 'Неон',             grp: 'Любимые', cost: 3, time: true, anim: true, bloom: 0.9, bloomTh: 0.3, taps: [17, 9], isNew: 2 },
  { id: 7,  key: 'eho',       e: '⏳', name: 'Эхо времени',      grp: 'Любимые', cost: 2, time: true, anim: true, bloom: 0.25, taps: [6, 2], isNew: 2 },
  { id: 9,  key: 'mozaika',   e: '🧩', name: 'Мозаика времени',  grp: 'Любимые', cost: 1, time: true, anim: true, bloom: 0.2, taps: [2, 2], isNew: 2 },
  { id: 24, key: 'neon_gorod', e: '🌃', name: 'Неон-город',      grp: 'Рисованные', cost: 3, time: true, anim: true, bloom: 0.55, bloomTh: 0.45, ca: 0.3, taps: [13, 9], isNew: 1 },
  { id: 25, key: 'akvarel',   e: '🎨', name: 'Акварель',         grp: 'Рисованные', cost: 3, taps: [24, 20], isNew: 1 },
  { id: 16, key: 'multik',    e: '🖍️', name: 'Мультфильм',       grp: 'Рисованные', cost: 3, taps: [17, 9] },
  { id: 26, key: 'komiks',    e: '💥', name: 'Комикс',           grp: 'Рисованные', cost: 3, taps: [9, 5], isNew: 1 },
  { id: 27, key: 'eskiz',     e: '✏️', name: 'Эскиз карандашом', grp: 'Рисованные', cost: 3, anim: true, taps: [9, 5], isNew: 1 },
  { id: 42, key: 'vitrazh',   e: '🪟', name: 'Витраж',           grp: 'Рисованные', cost: 2, anim: true, bloom: 0.35, taps: [1, 1], isNew: 1 },
  { id: 34, key: 'dozhd_steklo', e: '🌧️', name: 'Дождь на стекле', grp: 'Погода и стихии', cost: 2, mip: true, anim: true, own: true, taps: [4, 4], isNew: 1 },
  { id: 33, key: 'moroz',     e: '🧊', name: 'Мороз на стекле',  grp: 'Погода и стихии', cost: 2, mip: true, anim: true, own: true, taps: [5, 5], isNew: 1 },
  { id: 35, key: 'veter',     e: '🌬️', name: 'Ветер',            grp: 'Погода и стихии', cost: 2, anim: true, own: true, taps: [5, 3], isNew: 1 },
  { id: 31, key: 'marevo',    e: '🏜️', name: 'Марево (жара)',    grp: 'Погода и стихии', cost: 1, anim: true, own: true, taps: [1, 1], isNew: 1 },
  { id: 32, key: 'pod_vodoy', e: '🫧', name: 'Под водой',        grp: 'Погода и стихии', cost: 1, anim: true, taps: [1, 1], isNew: 1 },
  { id: 36, key: 'rassypanie', e: '⌛', name: 'Рассыпание в песок', grp: 'Погода и стихии', cost: 1, own: true, taps: [2, 2], isNew: 1 },
  { id: 37, key: 'skorost',   e: '🚀', name: 'Скорость',         grp: 'Состояния героя', cost: 3, anim: true, own: true, taps: [13, 6], isNew: 1 },
  { id: 38, key: 'golovokruzhenie', e: '😵', name: 'Головокружение', grp: 'Состояния героя', cost: 3, mip: true, anim: true, own: true, taps: [8, 8], isNew: 1 },
  { id: 39, key: 'vospominanie', e: '🕰️', name: 'Воспоминание',  grp: 'Состояния героя', cost: 2, mip: true, time: true, anim: true, grain: 0.25, bloom: 0.3, taps: [5, 5], isNew: 1 },
  { id: 30, key: 'son',       e: '💤', name: 'Сон',              grp: 'Состояния героя', cost: 2, mip: true, anim: true, bloom: 0.35, bloomTh: 0.62, taps: [5, 5], isNew: 1 },
  { id: 40, key: 'nuar',      e: '🎩', name: 'Нуар',             grp: 'Плёнка', cost: 1, grain: 0.35, vign: 0.5, taps: [1, 1], isNew: 1 },
  { id: 28, key: 'staroe_kino', e: '🎞️', name: 'Старое кино',    grp: 'Плёнка', cost: 1, anim: true, taps: [1, 1], isNew: 1 },
  { id: 29, key: 'vhs',       e: '📼', name: 'Видеокассета',     grp: 'Плёнка', cost: 1, anim: true, taps: [3, 3], isNew: 1 },
  { id: 18, key: 'glitch',    e: '📺', name: 'Глитч',            grp: 'Плёнка', cost: 2, time: true, anim: true, taps: [3, 3] },
  { id: 17, key: 'noch',      e: '🌙', name: 'Ночное видение',   grp: 'Плёнка', cost: 1, anim: true, taps: [1, 1] },
  { id: 19, key: 'pikseli',   e: '👾', name: 'Пиксели',          grp: 'Плёнка', cost: 1, taps: [1, 1] },
  { id: 41, key: 'shleyf',    e: '☄️', name: 'Шлейф света',      grp: 'Время', cost: 3, time: true, bloom: 0.5, bloomTh: 0.55, taps: [13, 6], isNew: 1 },
  { id: 43, key: 'zhidkoe',   e: '💧', name: 'Жидкое время',     grp: 'Время', cost: 1, time: true, own: true, taps: [4, 4], isNew: 1 },
  { id: 8,  key: 'vremya_centr', e: '🌀', name: 'Время из центра', grp: 'Время', cost: 1, time: true, anim: true, taps: [2, 2] },
  { id: 10, key: 'raduga',    e: '🌈', name: 'Радужное время',   grp: 'Время', cost: 1, time: true, taps: [3, 3] },
  { id: 11, key: 'prizraki',  e: '👥', name: 'Призраки',         grp: 'Время', cost: 2, time: true, taps: [8, 8] },
  { id: 12, key: 'strob',     e: '📸', name: 'Стробоскоп-копии', grp: 'Время', cost: 2, time: true, taps: [6, 6] },
  { id: 14, key: 'teplo',     e: '🔥', name: 'Тепловизор',       grp: 'Цветные миры', cost: 1, time: true, taps: [2, 2] },
  { id: 15, key: 'konfety',   e: '🍬', name: 'Конфетный мир',    grp: 'Цветные миры', cost: 1, anim: true, taps: [1, 1] },
  { id: 20, key: 'prizrak',   e: '👻', name: 'Призрачная ночь',  grp: 'Цветные миры', cost: 1, taps: [1, 1] },
  { id: 21, key: 'plamya',    e: '😈', name: 'Адское пламя',     grp: 'Цветные миры', cost: 1, taps: [1, 1] },
  { id: 23, key: 'zelenaya',  e: '🟢', name: 'Зелёная ночь',     grp: 'Цветные миры', cost: 1, taps: [1, 1] },
  { id: 22, key: 'iznanka',   e: '🙃', name: 'Изнанка',          grp: 'Цветные миры', cost: 1, taps: [1, 1] },
  { id: 2,  key: 'volny',     e: '🌊', name: 'Волны',            grp: 'Кривое зеркало', cost: 1, anim: true, taps: [1, 1] },
  { id: 1,  key: 'puzyr',     e: '🔮', name: 'Пузырь',           grp: 'Кривое зеркало', cost: 1, anim: true, taps: [1, 1] },
  { id: 3,  key: 'hudoy',     e: '🤸', name: 'Худой и толстый',  grp: 'Кривое зеркало', cost: 1, anim: true, taps: [1, 1] },
  { id: 4,  key: 'simmetriya', e: '🦋', name: 'Симметрия',       grp: 'Кривое зеркало', cost: 1, taps: [1, 1] },
  { id: 5,  key: 'kaleidoskop', e: '❄️', name: 'Калейдоскоп',    grp: 'Кривое зеркало', cost: 1, anim: true, taps: [1, 1] },
  { id: 6,  key: 'voronka',   e: '🕳️', name: 'Воронка',          grp: 'Кривое зеркало', cost: 1, anim: true, taps: [1, 1] }
];

// ---------- атмосфера ----------
Filtry.ATMOS = {
  sneg:        { e: '❄️', name: 'Снег',            prog: 'sneg',        cost: 2 },
  dozhd:       { e: '🌧️', name: 'Дождь',           prog: 'dozhd',       cost: 1 },
  iskry:       { e: '🔥', name: 'Искры',           prog: 'iskry',       cost: 2 },
  pyl:         { e: '✨', name: 'Пыль в луче',     prog: 'pyl',         cost: 1 },
  pesok:       { e: '🏜️', name: 'Песчаная буря',   prog: 'pesok',       cost: 2 },
  pepel:       { e: '🌫️', name: 'Пепел',           prog: 'pepel',       cost: 2 },
  listya:      { e: '🍂', name: 'Листопад',        prog: 'listya',      cost: 1 },
  lepestki:    { e: '🌸', name: 'Лепестки',        prog: 'listya', v: 1, cost: 1 },
  svetlyachki: { e: '🪲', name: 'Светлячки',       prog: 'svetlyachki', cost: 1 },
  blyostki:    { e: '🌟', name: 'Блёстки',         prog: 'blyostki',    cost: 1 },
  tuman:       { e: '🌁', name: 'Туман',           prog: 'tuman',       cost: 2 }
};

// ---------- свет: время суток и особые состояния ----------
// top/hor/gnd - цвет верха неба, горизонта и земли; sun - цвет солнца; shadow - оттенок теней
Filtry.LIGHTS = {
  rassvet: { e: '🌅', name: 'Рассвет',         top: [0.5, 0.6, 0.92], hor: [1.0, 0.7, 0.6], gnd: [0.62, 0.52, 0.64], sun: [1.0, 0.75, 0.55], shadow: [0.82, 0.86, 1.06], sunPos: [0.22, 0.5], shimmer: 0.6, horizon: 0.42, exposure: 1.0, sunAmt: 0.7, rays: 0.25, flare: 0.2 },
  zolotoy: { e: '☀️', name: 'Золотой час',     top: [0.75, 0.7, 0.6], hor: [1.0, 0.78, 0.4], gnd: [0.75, 0.55, 0.35], sun: [1.0, 0.72, 0.3], shadow: [0.92, 0.86, 0.95], sunPos: [0.75, 0.55], shimmer: 0.3, horizon: 0.4, exposure: 1.05, sunAmt: 0.9, rays: 0.4, flare: 0.4 },
  zakat:   { e: '🌇', name: 'Закат',           top: [0.28, 0.2, 0.62], hor: [1.0, 0.38, 0.12], gnd: [0.48, 0.22, 0.32], sun: [1.0, 0.45, 0.15], shadow: [0.76, 0.7, 1.06], sunPos: [0.7, 0.46], shimmer: 1.0, horizon: 0.42, exposure: 0.92, sunAmt: 1.0, rays: 0.35, flare: 0.45 },
  sumerki: { e: '🌆', name: 'Сумерки',         top: [0.12, 0.18, 0.52], hor: [0.78, 0.4, 0.62], gnd: [0.2, 0.2, 0.42], sun: [0.9, 0.5, 0.6], shadow: [0.7, 0.8, 1.15], sunPos: [0.5, 0.38], shimmer: 0.7, horizon: 0.4, exposure: 0.72, sunAmt: 0.25 },
  noch:    { e: '🌕', name: 'Лунная ночь',     top: [0.05, 0.1, 0.3], hor: [0.15, 0.25, 0.45], gnd: [0.08, 0.12, 0.25], sun: [0.75, 0.85, 1.0], shadow: [0.6, 0.75, 1.2], sunPos: [0.78, 0.82], shimmer: 0.15, horizon: 0.4, exposure: 0.55, sunAmt: 0.55, flare: 0.15 },
  siyanie: { e: '🌌', name: 'Северное сияние', top: [0.03, 0.1, 0.22], hor: [0.08, 0.25, 0.3], gnd: [0.05, 0.1, 0.2], sun: [0.4, 1.0, 0.6], shadow: [0.6, 0.85, 1.1], sunPos: [0.5, 1.3], shimmer: 0.2, horizon: 0.4, exposure: 0.5, sunAmt: 0, aurora: 1 },
  groza:   { e: '⛈️', name: 'Гроза',           top: [0.2, 0.25, 0.32], hor: [0.4, 0.45, 0.48], gnd: [0.2, 0.24, 0.26], sun: [0.8, 0.85, 1.0], shadow: [0.8, 0.9, 1.05], sunPos: [0.5, 1.3], shimmer: 0.25, horizon: 0.42, exposure: 0.66, sunAmt: 0, storm: 1 },
  ogon:    { e: '🏕️', name: 'Свет костра',     top: [0.25, 0.12, 0.1], hor: [0.7, 0.35, 0.15], gnd: [1.0, 0.5, 0.15], sun: [1.0, 0.5, 0.1], shadow: [1.05, 0.85, 0.75], sunPos: [0.5, -0.1], shimmer: 0.2, horizon: 0.45, exposure: 0.82, sunAmt: 0.5, fire: 1 }
};

// ---------- цветокоррекция ----------
Filtry.GRADES = {
  kino:    { e: '🎥', name: 'Кино (бирюза и янтарь)', lift: [-0.02, 0.03, 0.06], gain: [1.08, 1.0, 0.9], contrast: 1.15, sat: 1.1 },
  zima:    { e: '🥶', name: 'Зимний холод',     lift: [0, 0.02, 0.06], gain: [0.92, 1.0, 1.1], contrast: 1.08, sat: 0.8, fade: 0.04 },
  teplo:   { e: '🧡', name: 'Тёплая память',    lift: [0.04, 0.02, 0], gain: [1.1, 1.0, 0.86], contrast: 0.95, sat: 0.9, fade: 0.08 },
  plenka:  { e: '📷', name: 'Выцветшая плёнка', lift: [0.02, 0.05, 0.03], gain: [1.04, 1.0, 0.92], contrast: 0.9, sat: 0.75, fade: 0.14 },
  zhyostko: { e: '🪨', name: 'Жёсткий',         lift: [0, 0, 0.01], gain: [1, 1, 1], contrast: 1.4, sat: 0.45 },
  chb:     { e: '⚫', name: 'Чёрно-белый',      lift: [0, 0, 0], gain: [1, 1, 1], contrast: 1.3, sat: 1, bw: 1 },
  sepiya:  { e: '🟤', name: 'Сепия',            lift: [0.03, 0.02, 0], gain: [1.15, 1.0, 0.75], contrast: 1.05, sat: 1, fade: 0.05, bw: 1 },
  kislota: { e: '🧪', name: 'Кислота',          lift: [0.05, 0, 0.08], gain: [1.1, 0.95, 1.2], contrast: 1.2, sat: 1.9 }
};

// ---------- готовые образы: настроение сцены одним словом ----------
Filtry.LOOKS = {
  chisto:       { e: '🎬', name: 'Чистое видео', mood: 'обычная жизнь, без настроения', trans: 'plavno' },
  kino:         { e: '🎥', name: 'Просто кино', mood: 'обычная сцена, но «как в фильме»', grade: 'kino', bloom: 0.3, grain: 0.18, vign: 0.3, bars: 1 },
  zimnee_utro:  { e: '🌅', name: 'Зимнее утро', mood: 'начало дня, надежда, тишина', atmos: [['sneg', 0.45]], light: 'rassvet', lightAmt: 0.8, grade: 'zima', gradeAmt: 0.4, bloom: 0.4, grain: 0.12, vign: 0.25, wind: 0.15 },
  metel:        { e: '🌨️', name: 'Метель', mood: 'опасность, борьба со стихией', style: 'veter', amount: 0.8, atmos: [['sneg', 1.0], ['tuman', 0.35]], wind: 0.95, grade: 'zima', gradeAmt: 0.8, bloom: 0.25, vign: 0.35 },
  zakat:        { e: '🌇', name: 'Закат', mood: 'конец дня, красота, прощание', light: 'zakat', bloom: 0.5, grain: 0.1, vign: 0.3 },
  zolotoy_chas: { e: '☀️', name: 'Золотой час', mood: 'тепло, счастье, уют', light: 'zolotoy', atmos: [['pyl', 0.6]], bloom: 0.45, vign: 0.2 },
  sumerki:      { e: '🌆', name: 'Сумерки', mood: 'тревожное ожидание, тайна', light: 'sumerki', atmos: [['tuman', 0.3]], bloom: 0.35, grain: 0.2, vign: 0.4 },
  siyanie:      { e: '🌌', name: 'Северное сияние', mood: 'чудо, ночь, восторг', light: 'siyanie', atmos: [['sneg', 0.25]], bloom: 0.6, bloomTh: 0.45, grain: 0.18, vign: 0.35 },
  liven:        { e: '⛈️', name: 'Ливень', mood: 'грусть, напряжение, дорога в дождь', style: 'dozhd_steklo', amount: 0.85, atmos: [['dozhd', 0.7]], light: 'groza', grade: 'kino', gradeAmt: 0.5, bloom: 0.3, vign: 0.35 },
  kiberpank:    { e: '🌃', name: 'Неоновый город', mood: 'ночной город, драйв, другой мир', style: 'neon_gorod', atmos: [['dozhd', 0.4]], bloom: 0.9, bloomTh: 0.4, ca: 0.4, vign: 0.3, bars: 1 },
  neon_son:     { e: '⚡', name: 'Неоновый сон', mood: 'мир стал нереальным, волшебство', style: 'neon', atmos: [['blyostki', 0.5]], bloom: 1.0, bloomTh: 0.3 },
  eho:          { e: '⏳', name: 'Петля времени', mood: 'время сломалось, дежавю', style: 'eho', bloom: 0.3, grain: 0.15, ca: 0.3, vign: 0.3 },
  oskolki:      { e: '🧩', name: 'Осколки времени', mood: 'память рассыпается на куски', style: 'mozaika', bloom: 0.3, grade: 'plenka', gradeAmt: 0.5, vign: 0.3 },
  vospominanie: { e: '🕰️', name: 'Воспоминание', mood: 'прошлое, ностальгия', style: 'vospominanie', atmos: [['pyl', 0.4]], grade: 'teplo', gradeAmt: 0.6, grain: 0.3, bloom: 0.35, bars: 1 },
  son:          { e: '💤', name: 'Сон', mood: 'сон, грёзы, нежность', style: 'son', atmos: [['blyostki', 0.35]], light: 'rassvet', lightAmt: 0.4, bloom: 0.6 },
  skazka:       { e: '🧚', name: 'Сказка', mood: 'детство, волшебный лес', style: 'akvarel', atmos: [['svetlyachki', 0.7]], light: 'sumerki', lightAmt: 0.45, bloom: 0.5, bloomTh: 0.5 },
  u_kostra:     { e: '🏕️', name: 'У костра', mood: 'покой, разговор по душам', light: 'ogon', atmos: [['iskry', 0.6]], grade: 'teplo', gradeAmt: 0.5, bloom: 0.55, vign: 0.45 },
  zhara:        { e: '🏜️', name: 'Жара', mood: 'зной, усталость, пустыня', style: 'marevo', light: 'zolotoy', lightAmt: 0.55, atmos: [['pyl', 0.35]], grade: 'teplo', gradeAmt: 0.6, bloom: 0.4 },
  burya:        { e: '🌪️', name: 'Песчаная буря', mood: 'хаос, потеря пути', style: 'veter', amount: 0.9, atmos: [['pesok', 0.85]], wind: 1.0, grade: 'teplo', gradeAmt: 0.8, vign: 0.4 },
  osen:         { e: '🍂', name: 'Осень', mood: 'светлая грусть, перемены', atmos: [['listya', 0.55]], light: 'zolotoy', lightAmt: 0.6, grade: 'teplo', gradeAmt: 0.4, bloom: 0.3, wind: 0.3 },
  vesna:        { e: '🌸', name: 'Весна', mood: 'влюблённость, лёгкость', atmos: [['lepestki', 0.5]], light: 'rassvet', lightAmt: 0.5, bloom: 0.45, wind: 0.25 },
  pepelishche:  { e: '🌫️', name: 'Пепелище', mood: 'после катастрофы, пустота', atmos: [['pepel', 0.7], ['tuman', 0.25]], grade: 'zhyostko', gradeAmt: 0.8, grain: 0.3, vign: 0.5, wind: 0.2 },
  trevoga:      { e: '🚨', name: 'Тревога', mood: 'страх, что-то не так', style: 'glitch', amount: 0.7, grade: 'zhyostko', gradeAmt: 0.7, ca: 0.7, grain: 0.35, vign: 0.6 },
  pogonya:      { e: '🚀', name: 'Погоня', mood: 'скорость, адреналин', style: 'skorost', amount: 0.8, grade: 'kino', ca: 0.5, vign: 0.3, bars: 1, trans: 'krug' },
  udar:         { e: '😵', name: 'После удара', mood: 'оглушён, мир плывёт', style: 'golovokruzhenie', grade: 'zhyostko', gradeAmt: 0.4, ca: 0.6, vign: 0.6, grain: 0.2 },
  nuar:         { e: '🎩', name: 'Нуар', mood: 'детектив, одиночество', style: 'nuar', atmos: [['dozhd', 0.35]], grain: 0.4, vign: 0.55, bars: 1 },
  hronika:      { e: '🎞️', name: 'Старая хроника', mood: 'давняя история, архив', style: 'staroe_kino' },
  kasseta:      { e: '📼', name: 'Домашняя кассета', mood: 'девяностые, семейный архив', style: 'vhs' },
  moroz:        { e: '🧊', name: 'Мороз', mood: 'холод сковывает, одиночество', style: 'moroz', amount: 0.6, atmos: [['sneg', 0.3]], grade: 'zima', gradeAmt: 0.6, bloom: 0.12 },
  prah:         { e: '⌛', name: 'Всё рассыпается', mood: 'конец, утрата, мир исчезает', style: 'rassypanie', amount: 0.55, atmos: [['pesok', 0.3]], wind: 0.6, grade: 'teplo', gradeAmt: 0.5, vign: 0.4, trans: 'pesok' },
  glubina:      { e: '🫧', name: 'Глубина', mood: 'под водой, тишина, сон наяву', style: 'pod_vodoy', bloom: 0.35 }
};
window.Filtry = Filtry;
