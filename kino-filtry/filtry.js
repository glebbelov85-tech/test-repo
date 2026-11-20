// ===== Filtry: фильтры реального времени поверх видео (WebGL2) =====
// Вынесено из ar/chudesa.html и переделано так, чтобы источником мог быть
// ЛЮБОЙ <video>: видеофайл (отрезок кино), камера или поток.
//
//   const f = new Filtry(canvas);        // canvas, куда рисовать
//   f.setSource(videoElement);           // что показывать
//   f.setPos(13);                        // номер фильтра из Filtry.EFFECTS (дробное = плавный переход)
//   f.amount = 1;                        // сила: 0 = чистое видео, 1 = полный эффект
//   requestAnimationFrame(function loop(ts){ f.render(ts); requestAnimationFrame(loop); });
//
// Нужен файл shader.js (подключить раньше этого).
"use strict";

class Filtry {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.fit = opts.fit || 'contain';      // 'contain' - всё видео с полями, 'cover' - на весь экран с обрезкой
    this.quality = opts.quality || 1;      // множитель разрешения (0.5 - вдвое легче для слабых телефонов)
    this.histN = opts.histN || 48;         // сколько прошлых кадров помнить (48 при 30 к/с ≈ 1.6 с)
    this.histW = opts.histW || 320;        // ширина кадров в ленте прошлого (маленькая ради скорости)
    this.amount = 1; this.touch = [0.5, 0.5]; this.mirror = false; this.vr = false;
    this.strobe = false; this.pulse = 0;
    this.pos = 0; this.time = 0; this._last = 0; this._frame = 0;
    this.head = 0; this.histCount = 0; this.histTex = null; this.HW = 0; this.HH = 0;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) { this.ok = false; return; }
    this.ok = true;
    this.copyP = this._prog(FILTRY_COPY_FS); this.fxP = this._prog(FILTRY_FS);
    // один большой треугольник на весь экран
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    this._texParams(gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.fbo = gl.createFramebuffer();
  }
  _texParams(target) {
    const gl = this.gl;
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(target, k, v);
  }
  _sh(type, src) {
    const gl = this.gl, s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s;
  }
  _prog(fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._sh(gl.VERTEX_SHADER, FILTRY_VS)); gl.attachShader(p, this._sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  // источник: <video> (файл, камера). mirror = true для фронтальной камеры
  setSource(video, mirror = false) { this.src = video; this.mirror = mirror; this.resetHistory(); }
  // забыть прошлые кадры (вызывать на склейке отрезков, иначе «время»-эффекты смешают два отрезка)
  resetHistory() { this.histCount = 0; }
  // позиция ползунка: 13 = Неон, 13.5 = половина Неона + половина следующего
  setPos(v) { this.pos = Math.max(0, Math.min(Filtry.EFFECTS.length - 1, v)); }
  setEffectId(id) { const i = Filtry.EFFECTS.findIndex(e => e.id === id); if (i >= 0) this.setPos(i); }
  current() { return Filtry.EFFECTS[Math.round(this.pos)]; }

  _resize() {
    const c = this.canvas, dpr = Math.min(devicePixelRatio || 1, 2) * this.quality;
    const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  _makeHist(vw, vh) {
    const gl = this.gl;
    this.HW = this.histW; this.HH = Math.max(2, Math.round(this.histW * vh / vw));
    if (this.histTex) gl.deleteTexture(this.histTex);
    this.histTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.histTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, this.HW, this.HH, this.histN);
    this._texParams(gl.TEXTURE_2D_ARRAY);
    this.histCount = 0; this._histFor = vw + 'x' + vh;
  }

  render(ts) {
    const gl = this.gl, v = this.src;
    if (!this.ok) return;
    const dt = Math.min(0.05, this._last ? (ts - this._last) / 1000 : 0); this._last = ts;
    this.time += dt; this._frame++;
    this._resize();
    if (!v || !v.videoWidth || v.readyState < 2) { gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!this.histTex || this._histFor !== vw + 'x' + vh) this._makeHist(vw, vh);
    // 1. свежий кадр видео -> текстура
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    // 2. каждый второй кадр - уменьшенная копия в ленту прошлого (только если видео идёт)
    if (this._frame % 2 === 0 && (!v.paused || this.histCount === 0)) {
      this.head = (this.head + 1) % this.histN; this.histCount++;
      gl.useProgram(this.copyP.p); gl.uniform1i(this.copyP.u.uSrc, 0);
      gl.viewport(0, 0, this.HW, this.HH);
      const layers = this.histCount === 1 ? [...Array(this.histN).keys()] : [this.head]; // в начале заливаем всю ленту текущим кадром
      for (const l of layers) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.histTex, 0, l);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // 3. эффект на экран
    const P = this.fxP, U = P.u, E = Filtry.EFFECTS;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.histTex);
    gl.uniform1i(U.uSrc, 0); gl.uniform1i(U.uHist, 1);
    gl.uniform1i(U.uHead, this.head); gl.uniform1i(U.uN, this.histN);
    const i0 = Math.floor(this.pos), i1 = Math.min(E.length - 1, i0 + 1);
    gl.uniform1i(U.uModeA, E[i0].id); gl.uniform1i(U.uModeB, E[i1].id); gl.uniform1f(U.uMixAB, this.pos - i0);
    gl.uniform1f(U.uAmt, this.amount);
    gl.uniform1f(U.uTime, this.time); gl.uniform1f(U.uMirror, this.mirror ? 1 : 0);
    let freeze = -1, pulse = this.pulse;
    if (this.strobe) { freeze = this.histCount % 6; if (freeze === 0) pulse += 0.12; } // стоп-кадр 0.2 с
    gl.uniform1i(U.uFreeze, freeze); gl.uniform1f(U.uPulse, pulse);
    gl.uniform2f(U.uTouch, this.touch[0], this.touch[1]);
    const eyes = this.vr ? 2 : 1, ew = this.canvas.width / eyes, eh = this.canvas.height;
    // как уложить видео в область: cover (обрезать) или contain (поля)
    const s = (this.fit === 'cover' || this.vr ? Math.max(ew / vw, eh / vh) : Math.min(ew / vw, eh / vh)) * (this.vr ? 1.15 : 1);
    gl.uniform2f(U.uScale, ew / (vw * s), eh / (vh * s));
    gl.uniform2f(U.uOff, (1 - ew / (vw * s)) / 2, (1 - eh / (vh * s)) / 2);
    gl.uniform2f(U.uRes, ew, eh); gl.uniform1f(U.uVR, this.vr ? 1 : 0);
    for (let e = 0; e < eyes; e++) { gl.viewport(e * ew, 0, ew, eh); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  }
}

// Порядок = порядок на ползунке. id = номер ветки в шейдере (shader.js, функция fx).
// cost: 1 - лёгкий, 2 - средний, 3 - тяжёлый для слабого телефона.
// time: true - эффект использует прошлые кадры (на склейке отрезков звать resetHistory()).
Filtry.EFFECTS = [
  { id: 0,  e: '🎬', name: 'Обычное видео',    grp: 'Без фильтра', cost: 1 },
  { id: 13, e: '⚡', name: 'Неон',             grp: 'Цвет', cost: 3, time: true },
  { id: 16, e: '🖍️', name: 'Мультфильм',       grp: 'Цвет', cost: 3 },
  { id: 17, e: '🌙', name: 'Ночное видение',   grp: 'Цвет', cost: 1 },
  { id: 18, e: '📺', name: 'Глитч',            grp: 'Искажение', cost: 2, time: true },
  { id: 19, e: '👾', name: 'Пиксели',          grp: 'Цвет', cost: 1 },
  { id: 14, e: '🔥', name: 'Тепловизор',       grp: 'Цвет', cost: 1, time: true },
  { id: 15, e: '🍬', name: 'Конфетный мир',    grp: 'Цвет', cost: 1 },
  { id: 20, e: '👻', name: 'Призрачная ночь',  grp: 'Мир (из «Охоты»)', cost: 1 },
  { id: 21, e: '😈', name: 'Адское пламя',     grp: 'Мир (из «Охоты»)', cost: 1 },
  { id: 23, e: '🟢', name: 'Зелёная ночь',     grp: 'Мир (из «Охоты»)', cost: 1 },
  { id: 22, e: '🙃', name: 'Изнанка',          grp: 'Мир (из «Охоты»)', cost: 1 },
  { id: 2,  e: '🌊', name: 'Волны',            grp: 'Кривое зеркало', cost: 1 },
  { id: 1,  e: '🔮', name: 'Пузырь',           grp: 'Кривое зеркало', cost: 1 },
  { id: 3,  e: '🤸', name: 'Худой и толстый',  grp: 'Кривое зеркало', cost: 1 },
  { id: 4,  e: '🦋', name: 'Симметрия',        grp: 'Кривое зеркало', cost: 1 },
  { id: 5,  e: '❄️', name: 'Калейдоскоп',      grp: 'Кривое зеркало', cost: 1 },
  { id: 6,  e: '🕳️', name: 'Воронка',          grp: 'Кривое зеркало', cost: 1 },
  { id: 7,  e: '⏳', name: 'Эхо времени',      grp: 'Время', cost: 2, time: true },
  { id: 8,  e: '🌀', name: 'Время из центра',  grp: 'Время', cost: 2, time: true },
  { id: 9,  e: '🧩', name: 'Мозаика времени',  grp: 'Время', cost: 1, time: true },
  { id: 10, e: '🌈', name: 'Радужное время',   grp: 'Время', cost: 1, time: true },
  { id: 11, e: '👥', name: 'Призраки',         grp: 'Время', cost: 2, time: true },
  { id: 12, e: '📸', name: 'Стробоскоп-копии', grp: 'Время', cost: 2, time: true }
];
window.Filtry = Filtry;
