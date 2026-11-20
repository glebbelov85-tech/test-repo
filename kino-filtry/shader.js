// ===== Шейдеры фильтров, версия 2 (GLSL ES 3.00, WebGL2) =====
// Картинка собирается слоями:
//   1. СТИЛЬ       - как перерисован сам кадр (неон, эхо времени, акварель, дождь на стекле...).
//                    Каждый стиль - отдельная маленькая программа, собирается при первом включении.
//   2. СВЕЧЕНИЕ    - ореол вокруг ярких мест (bloom) и лучи света.
//   3. СВЕТ + ЦВЕТ - рассвет/закат/ночь/сияние, цветокоррекция, зерно, виньетка, блики.
//   4. АТМОСФЕРА   - то, что летит перед камерой: снег, дождь, искры, пыль, листья, туман.
// Переход между стилями: оба кадра считаются отдельно и смешиваются по маске (пятнами, волной, песком...).
// Основа старых 24 фильтров: ar/chudesa.html («Комната чудес») и ar/ohota.html.
"use strict";

(function () {
const G = {};

G.VS = `#version 300 es
in vec2 aPos; out vec2 vUV; out vec2 vST;
uniform vec4 uUV;                 // какая часть кадра видна: xy - начало, zw - размер (в долях кадра)
void main() { vST = aPos * 0.5 + 0.5; vUV = uUV.xy + vST * uUV.zw; gl_Position = vec4(aPos, 0.0, 1.0); }`;

G.COPY = `#version 300 es
precision mediump float; in vec2 vST; uniform sampler2D uSrc; out vec4 o;
void main() { o = texture(uSrc, vST); }`;

// ---------- общие функции ----------
const NOISE = `
const float PI = 3.14159265;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
`;

// ---------- шапка стиля ----------
G.HEAD = `#version 300 es
precision highp float;
precision mediump sampler2DArray;
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc;          // текущий кадр видео
uniform sampler2D uSrc2;         // следующий отрезок во время склейки
uniform sampler2DArray uHist;    // лента прошлых кадров (кольцо)
uniform int uHead, uN, uFreeze, uQ;   // uQ: 0 - полное качество, 1 - среднее, 2 - лёгкое
uniform float uXf, uAmt, uTime, uMirror, uPulse;
uniform vec2 uRes, uVRes, uHRes, uTouch, uWind, uWindPos;
#define A (uRes.x / uRes.y)
` + NOISE + `
vec2 cuv(vec2 p) { if (uMirror > 0.5) p.x = 1.0 - p.x; return clamp(p, 0.001, 0.999); }
vec3 past(vec2 p, int k) { k = clamp(k, 0, uN - 2); int l = (uHead - k + uN * 4) % uN; return texture(uHist, vec3(cuv(p), float(l))).rgb; }
vec3 pastF(vec2 p, float k) { float f = floor(k); return mix(past(p, int(f)), past(p, int(f) + 1), k - f); }
vec3 now(vec2 p) { if (uFreeze >= 0) return past(p, uFreeze); vec3 c = texture(uSrc, cuv(p)).rgb; if (uXf > 0.0) c = mix(c, texture(uSrc2, cuv(p)).rgb, uXf); return c; }
// размытый кадр (нужны mip-уровни: у стиля флаг mip). lod 0 = резко, 3 = сильно размыто
vec3 blur(vec2 p, float lod) {
  if (lod < 0.05) return now(p);
  vec2 e = exp2(lod) * 0.5 / uVRes; vec2 q = cuv(p);
  vec3 c = textureLod(uSrc, q + e, lod).rgb + textureLod(uSrc, q - e, lod).rgb + textureLod(uSrc, q + vec2(e.x, -e.y), lod).rgb + textureLod(uSrc, q + vec2(-e.x, e.y), lod).rgb;
  c *= 0.25; if (uXf > 0.0) c = mix(c, textureLod(uSrc2, q, lod).rgb, uXf); return c;
}
// контур: 8 точек (Собель), в лёгком режиме 4
float edge(vec2 p) {
  vec2 e = 1.5 / uRes;
  if (uQ >= 2) { float l = lum(now(p - vec2(e.x, 0))), r = lum(now(p + vec2(e.x, 0))), d = lum(now(p - vec2(0, e.y))), u = lum(now(p + vec2(0, e.y))); return length(vec2(r - l, u - d)) * 2.0; }
  float tl = lum(now(p + vec2(-e.x, e.y))), t = lum(now(p + vec2(0, e.y))), tr = lum(now(p + e));
  float l = lum(now(p - vec2(e.x, 0))), r = lum(now(p + vec2(e.x, 0)));
  float bl = lum(now(p - e)), b = lum(now(p - vec2(0, e.y))), br = lum(now(p + vec2(e.x, -e.y)));
  return length(vec2(-tl - 2.0 * l - bl + tr + 2.0 * r + br, tl + 2.0 * t + tr - bl - 2.0 * b - br));
}
float edgeP(vec2 p, int k) { // контур в прошлом кадре (4 точки)
  vec2 e = 1.0 / uHRes;
  float l = lum(past(p - vec2(e.x, 0), k)), r = lum(past(p + vec2(e.x, 0), k)), d = lum(past(p - vec2(0, e.y), k)), u = lum(past(p + vec2(0, e.y), k));
  return length(vec2(r - l, u - d)) * 2.0;
}
vec3 heat(float t) {
  vec3 c = mix(vec3(0.0, 0.0, 0.15), vec3(0.3, 0.0, 0.7), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.9, 0.1, 0.3), smoothstep(0.25, 0.5, t));
  c = mix(c, vec3(1.0, 0.6, 0.0), smoothstep(0.5, 0.75, t));
  return mix(c, vec3(1.0, 1.0, 0.85), smoothstep(0.75, 1.0, t));
}
vec3 cssSepiaGray(vec3 c) { float l = lum(c); return clamp(vec3(l * 1.351, l * 1.203, l * 0.937), 0.0, 1.0); }
vec3 cssHue(vec3 c, float deg) {
  float a = radians(deg), co = cos(a), si = sin(a);
  mat3 m = mat3(
    0.213 + co * 0.787 - si * 0.213, 0.213 - co * 0.213 + si * 0.143, 0.213 - co * 0.213 - si * 0.787,
    0.715 - co * 0.715 - si * 0.715, 0.715 + co * 0.285 + si * 0.140, 0.715 - co * 0.715 + si * 0.715,
    0.072 - co * 0.072 + si * 0.928, 0.072 - co * 0.072 - si * 0.283, 0.072 + co * 0.928 + si * 0.072);
  return clamp(m * c, 0.0, 1.0);
}
vec3 cssSat(vec3 c, float s) { return clamp(mix(vec3(dot(c, vec3(0.213, 0.715, 0.072))), c, s), 0.0, 1.0); }
vec3 cssCon(vec3 c, float k) { return clamp((c - 0.5) * k + 0.5, 0.0, 1.0); }
vec2 windDir() { float w = length(uWind); return w > 0.05 ? uWind / w : vec2(1.0, -0.06); }
`;

// OWN: стиль сам распоряжается «силой» (am), иначе результат просто смешивается с чистым видео
G.TAIL = `
void main() {
  vec2 p = vUV; vec3 c = fx(p, uAmt);
#ifndef OWN
  if (uAmt < 0.999) c = mix(now(p), c, uAmt);
#endif
  o = vec4(c * (1.0 + uPulse), 1.0);
}`;

// ---------- стили: id -> тело функции vec3 fx(vec2 p, float am) ----------
const S = G.STYLES = {};
S[0] = `vec3 fx(vec2 p, float am) { return now(p); }`;
// --- кривые зеркала (как были) ---
S[1] = `vec3 fx(vec2 p, float am) { // пузырь
  float t = uTime; vec2 d = (p - uTouch) * vec2(A, 1.0); float r = length(d), R = 0.42;
  if (r < R) { float pw = 1.0 + 0.8 * (0.6 + 0.4 * sin(t * 1.6)); d *= pow(r / R, pw) * R / max(r, 1e-4); }
  return now(uTouch + d / vec2(A, 1.0)) + vec3(0.08) * smoothstep(0.03, 0.0, abs(r - R)); }`;
S[2] = `vec3 fx(vec2 p, float am) { // волны
  float t = uTime; vec2 q = p;
  q.x += sin(p.y * 11.0 + t * 1.3) * 0.04 + sin(p.y * 29.0 - t * 0.8) * 0.012;
  q.y += sin(p.x * 7.0 + t * 0.9) * 0.025; q.y = q.y + 0.07 * sin(q.y * PI * 2.0 + t * 0.4);
  return now(q); }`;
S[3] = `vec3 fx(vec2 p, float am) { // худой и толстый
  float f = 1.0 + 0.65 * sin(uTime * 0.7); float c = p.x - uTouch.x, s = smoothstep(0.0, 0.45, abs(c));
  float q = uTouch.x + c * mix(1.0 / f, 1.0, s * s); float cy = p.y - 0.5;
  return now(vec2(q, 0.5 + cy * mix(f * 0.92, 1.0, smoothstep(0.0, 0.6, abs(cy))))); }`;
S[4] = `vec3 fx(vec2 p, float am) { vec2 q = p; if (q.x > uTouch.x) q.x = 2.0 * uTouch.x - q.x; return now(q); }`;
S[5] = `vec3 fx(vec2 p, float am) { // калейдоскоп
  vec2 d = (p - 0.5) * vec2(A, 1.0); float r = length(d), an = atan(d.y, d.x) + uTime * 0.12, seg = PI / 4.0;
  an = mod(an, seg * 2.0); if (an > seg) an = seg * 2.0 - an;
  return now(fract(uTouch + vec2(cos(an), sin(an)) * r * 0.8 / vec2(A, 1.0))); }`;
S[6] = `vec3 fx(vec2 p, float am) { // воронка
  float t = uTime; vec2 d = (p - uTouch) * vec2(A, 1.0); float r = length(d), an = atan(d.y, d.x);
  an += (0.9 + 0.5 * sin(t * 0.5)) * exp(-r * 3.0) * 4.0 * sin(t * 0.3 + 1.0); r = pow(r, 1.0 + 0.25 * sin(t * 0.8));
  return now(uTouch + vec2(cos(an), sin(an)) * r / vec2(A, 1.0)); }`;

// --- ЭХО ВРЕМЕНИ (доработано): граница времени идёт волной, у движущегося появляется радужная кайма ---
S[7] = `vec3 fx(vec2 p, float am) {
  float N = float(uN - 2), t = uTime;
  float d = p.y + 0.05 * sin(p.x * 5.0 + t * 0.7) + 0.025 * sin(p.x * 13.0 - t * 1.1);
  d = clamp(d, 0.0, 1.0); d = d * d * (3.0 - 2.0 * d);
  float k = d * N;
  vec3 c;
  if (uQ >= 2) c = pastF(p, k);
  else c = vec3(pastF(p, k * 0.93).r, pastF(p, k).g, pastF(p, min(k * 1.07, N)).b);   // цвета из чуть разного времени
  if (k < 1.5) c = mix(now(p), c, clamp(k / 1.5, 0.0, 1.0));                          // низ кадра - резкое «сейчас»
  // тонкие светящиеся линии - «слои времени»
  float ln = smoothstep(0.92, 1.0, sin(d * 38.0 - t * 0.8) * 0.5 + 0.5);
  c += hsv(fract(0.55 + d * 0.5), 0.6, 1.0) * ln * 0.07 * smoothstep(0.05, 0.3, d);
  return c; }`;
S[8] = `vec3 fx(vec2 p, float am) { // время из центра
  float r = length((p - uTouch) * vec2(A, 1.0)); float k = clamp(r * 1.6 + 0.04 * sin(r * 30.0 - uTime * 2.0), 0.0, 1.0) * float(uN - 2);
  vec3 c = pastF(p, k); if (k < 1.5) c = mix(now(p), c, clamp(k / 1.5, 0.0, 1.0)); return c; }`;

// --- МОЗАИКА ВРЕМЕНИ (доработано): стеклянные плитки разного размера, время в плитке меняется плавно ---
S[9] = `vec3 fx(vec2 p, float am) {
  float N = float(uN - 2), t = uTime;
  vec2 g = p * vec2(8.0, 8.0 / A);
  vec2 big = floor(g * 0.5);
  float isBig = step(0.7, hash(big + 3.7));
  vec2 id = isBig > 0.5 ? big * 2.0 + 0.5 : floor(g);
  vec2 f = isBig > 0.5 ? fract(g * 0.5) : fract(g);
  float sz = isBig > 0.5 ? 2.0 : 1.0;
  float ph = t * 0.2 + hash(id + 1.3) * 3.0, s = floor(ph), fr = fract(ph);
  float k0 = hash(id + s * 17.1) * N, k1 = hash(id + (s + 1.0) * 17.1) * N;
  k0 *= k0 / N; k1 *= k1 / N;                                  // чаще недавнее прошлое, изредка далёкое
  float w = smoothstep(0.86, 1.0, fr);
  vec2 q = p - (f - 0.5) * 0.02 * sz;                           // каждая плитка - маленькая линза
  vec3 a = k0 < 1.0 ? now(q) : past(q, int(k0)), b = k1 < 1.0 ? now(q) : past(q, int(k1));
  vec3 col = mix(a, b, w);
  col = mix(col, vec3(lum(col)) * vec3(0.9, 0.97, 1.08), mix(k0, k1, w) / N * 0.45);   // старое время - холоднее и бледнее
  float ed = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)) * sz;
  col *= 0.62 + 0.38 * smoothstep(0.0, 0.07, ed);              // шов между плитками
  col += vec3(0.16) * smoothstep(0.1, 0.03, min(f.x, 1.0 - f.y) * sz) * smoothstep(0.0, 0.03, ed);   // блик на грани
  col += vec3(0.7, 0.9, 1.0) * w * (1.0 - w) * 0.5;            // вспышка в момент смены времени
  return col; }`;
S[10] = `vec3 fx(vec2 p, float am) { return vec3(now(p).r, past(p, 7).g, past(p, 14).b); }`;
S[11] = `vec3 fx(vec2 p, float am) { // призраки
  vec3 c0 = now(p), col = c0 * 0.5; float w = 0.5;
  for (int i = 1; i <= 7; i++) { float wi = 0.5 * (1.0 - float(i) / 8.0) / 3.5; col += past(p, i * 3) * wi * vec3(0.75, 0.85, 1.15); w += wi; }
  return col / w; }`;
S[12] = `vec3 fx(vec2 p, float am) { // стробоскоп-копии
  vec3 c0 = now(p), col = c0;
  for (int i = 1; i <= 5; i++) { vec3 c = past(p, i * 4); float mm = smoothstep(0.1, 0.3, length(c - c0)); col = mix(col, c, mm * (0.7 - float(i) * 0.1)); }
  return col; }`;

// --- НЕОН (доработано): горячая белая сердцевина линий, два цветных следа из прошлого, сцена читается в темноте ---
S[13] = `vec3 fx(vec2 p, float am) {
  float t = uTime; float l = lum(now(p));
  float k0 = smoothstep(0.07, 0.42, edge(p));
  float h = fract(p.y * 0.4 + p.x * 0.12 + t * 0.07 + l * 0.3);
  vec3 col = hsv(h, 0.92, 1.0) * k0 * 1.3 + vec3(1.0) * pow(k0, 5.0) * 0.4;
  col += hsv(h + 0.5, 0.9, 1.0) * smoothstep(0.05, 0.3, edgeP(p, 7)) * 0.5;
  if (uQ < 2) col += hsv(h + 0.28, 0.9, 1.0) * smoothstep(0.05, 0.3, edgeP(p, 16)) * 0.28;
  col += hsv(h + 0.6, 0.75, 1.0) * l * l * 0.14 + vec3(0.012, 0.0, 0.03);
  col *= 0.85 + 0.3 * smoothstep(0.7, 1.0, sin(p.y * 9.0 - p.x * 3.0 + t * 1.7));   // волна яркости бежит по линиям
  return col; }`;
S[14] = `vec3 fx(vec2 p, float am) { vec3 c0 = now(p); float mm = length(c0 - past(p, 5)); return heat(clamp(lum(c0) * 0.55 + mm * 2.5, 0.0, 1.0)); }`;
S[15] = `vec3 fx(vec2 p, float am) { vec3 c0 = now(p); float l = lum(c0);
  return mix(hsv(fract(l * 1.5 + uTime * 0.1 + p.x * 0.2), 0.75, 0.35 + l * 0.75), c0, 0.25); }`;
S[16] = `vec3 fx(vec2 p, float am) { // мультфильм
  vec2 e = 2.0 / uRes; vec3 c0 = now(p), s = c0; float w = 1.0; int T = uQ >= 2 ? 4 : 8;
  for (int i = 0; i < T; i++) { float an = float(i) * 2.0 * PI / float(T); vec3 n = now(p + vec2(cos(an), sin(an)) * e); float k = exp(-dot(n - c0, n - c0) * 40.0); s += n * k; w += k; }
  vec3 c = s / w; float l = lum(c), q = (floor(l * 5.0) + 0.5) / 5.0;
  c = c * (q / max(l, 0.03)); c = clamp(mix(vec3(lum(c)), c, 1.45), 0.0, 1.0);
  return c * (1.0 - smoothstep(0.22, 0.48, edge(p))); }`;
S[17] = `vec3 fx(vec2 p, float am) { // ночное видение
  float l = pow(clamp(lum(now(p)) * 1.7, 0.0, 1.0), 0.8);
  float n = hash(p * uRes + fract(uTime * 7.3) * 100.0);
  float scan = 0.88 + 0.12 * sin(p.y * uRes.y * 1.2);
  vec3 col = vec3(0.18, 1.0, 0.3) * (l * scan + (n - 0.5) * 0.14);
  return col * smoothstep(0.85, 0.45, length((p - 0.5) * vec2(A, 1.0))); }`;
S[18] = `vec3 fx(vec2 p, float am) { // глитч
  float t = uTime, bt = floor(t * 9.0);
  float burst = step(0.55, hash(vec2(floor(t * 1.7), 3.1)));
  float row = floor(p.y * 28.0), r = hash(vec2(row, bt));
  float sh = r > 0.8 ? (hash(vec2(row, bt + 7.0)) - 0.5) * 0.18 * burst : 0.0;
  vec2 q = vec2(fract(p.x + sh), p.y);
  float split = 0.004 + 0.02 * burst * hash(vec2(bt, 1.0));
  vec3 col = vec3(now(q + vec2(split, 0)).r, now(q).g, now(q - vec2(split, 0)).b);
  vec2 cell = floor(p * vec2(10.0, 7.0)); float hc = hash(cell + bt);
  if (burst > 0.5 && hc > 0.93) col = past(p, 10);
  if (burst > 0.5 && hc < 0.03) col = 1.0 - col;
  return col * (0.92 + 0.08 * sin(p.y * uRes.y * 2.0)); }`;
S[19] = `vec3 fx(vec2 p, float am) { vec2 cells = vec2(160.0, 160.0 / A); vec3 c = now((floor(p * cells) + 0.5) / cells); return floor(c * 5.0 + 0.5) / 5.0; }`;
S[20] = `vec3 fx(vec2 p, float am) { return cssCon(cssSat(cssHue(cssSepiaGray(now(p)), 180.0), 2.2) * 0.6, 1.25); }`;
S[21] = `vec3 fx(vec2 p, float am) { return cssCon(cssSat(cssHue(cssSepiaGray(now(p)), -35.0), 4.0), 1.3) * 0.8; }`;
S[22] = `vec3 fx(vec2 p, float am) { return cssCon(cssSat(cssHue(1.0 - now(p), 180.0), 1.8), 1.1); }`;
S[23] = `vec3 fx(vec2 p, float am) { return cssCon(cssSat(cssHue(cssSepiaGray(now(p)), 65.0), 3.0) * 1.1, 1.4); }`;

// ================= НОВЫЕ СТИЛИ =================
// Неон-город: тёмная сине-розовая сцена остаётся видна, поверх горят контуры
S[24] = `vec3 fx(vec2 p, float am) {
  vec3 c0 = now(p); float l = lum(c0), t = uTime;
  vec3 base = mix(vec3(0.02, 0.01, 0.07), vec3(0.04, 0.3, 0.46), smoothstep(0.0, 0.55, l));
  base = mix(base, vec3(1.0, 0.4, 0.8), smoothstep(0.5, 1.0, l) * 0.75);
  base = mix(base, c0 * vec3(0.65, 0.8, 1.25), 0.3) * (0.42 + 0.3 * (1.0 - l));
  float e = smoothstep(0.16, 0.55, edge(p));
  float h = abs(fract(p.x * 0.6 + p.y * 0.35 + t * 0.05) - 0.5) * 2.0;
  vec3 nc = mix(vec3(1.0, 0.1, 0.72), vec3(0.1, 0.9, 1.0), smoothstep(0.25, 0.75, h));
  vec3 col = base + nc * e * 0.8 + vec3(1.0) * pow(e, 6.0) * 0.2;
  col += vec3(0.9, 0.15, 0.8) * smoothstep(0.06, 0.3, edgeP(p, 8)) * 0.3;
  return col * (0.94 + 0.06 * sin(p.y * uRes.y * 1.5)); }`;

// Акварель: мазки, которые не переходят через границы предметов, бумага, тёмные края пятен
S[25] = `vec3 fx(vec2 p, float am) {
  vec2 px = (uQ >= 2 ? 1.6 : 2.2) * max(1.0, uRes.y / 540.0) / uRes;
  vec3 best = vec3(0.0); float bw = 0.0;
  for (int q = 0; q < 4; q++) {
    vec2 s = vec2((q == 0 || q == 3) ? 1.0 : -1.0, q < 2 ? 1.0 : -1.0);
    vec3 m = vec3(0.0), m2 = vec3(0.0);
    for (int j = 0; j < 4; j++) { vec3 c = now(p + vec2(float(j % 2) * 2.0 + 0.6, float(j / 2) * 2.0 + 0.6) * s * px); m += c; m2 += c * c; }
    m *= 0.25; m2 = abs(m2 * 0.25 - m * m);
    float w = 1.0 / (0.0004 + m2.r + m2.g + m2.b); w = w * w;
    best += m * w; bw += w;
  }
  vec3 col = best / bw; float l = lum(col);
  col = mix(vec3(l), col, 1.3); col = mix(col, vec3(1.0), 0.07);
  vec2 pp = p * uRes / max(1.0, uRes.y / 540.0);
  float paper = 0.93 + 0.07 * noise(pp * 0.45) + 0.05 * (fbm(pp * 0.02) - 0.5);
  col *= paper; col -= (noise(pp * 0.9) - 0.5) * 0.06 * (1.0 - l);          // зерно пигмента в тёмных местах
  col *= 1.0 - 0.32 * smoothstep(0.1, 0.5, edge(p));                          // краска собирается у краёв
  return clamp(col, 0.0, 1.0); }`;

// Комикс: мало цветов, типографские точки в тенях, чёрная обводка
S[26] = `vec3 fx(vec2 p, float am) {
  vec3 c = now(p); float l = lum(c);
  float ql = (floor(l * 4.0) + 0.5) / 4.0; vec3 q = c * (ql / max(l, 0.04)); q = clamp(mix(vec3(lum(q)), q, 1.35), 0.0, 1.0);
  float s = 5.5 * max(1.0, uRes.y / 540.0);
  vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * (p * uRes / s);
  float d = length(fract(g) - 0.5), rad = sqrt(clamp(1.0 - l * 1.7, 0.0, 1.0)) * 0.62;
  float dotm = smoothstep(rad, rad - 0.14, d);
  vec3 col = q * (1.0 - 0.5 * dotm);
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.8, 0.95, l) * 0.6);
  return col * (1.0 - smoothstep(0.2, 0.5, edge(p))); }`;

// Эскиз карандашом: штриховка в три слоя по темноте, линия «дышит», как в рисованной анимации
S[27] = `float hatch(vec2 px, vec2 d, float wob) { float n = noise(px * 0.11 + d * 7.0); return smoothstep(0.2 + 0.16 * n, 0.04, abs(fract(dot(px, d) / 8.0 + wob) - 0.5)) * (0.35 + 0.65 * n); }
vec3 fx(vec2 p, float am) {
  float bo = floor(uTime * 8.0); vec2 jit = (hash2(vec2(bo, 1.7)) - 0.5) * 1.6 / uRes;
  vec2 pp = p + jit; float l = lum(now(pp)), e = edge(pp);
  vec2 px = p * uRes / max(1.0, uRes.y / 540.0);
  float wob = noise(px * 0.02 + bo * 3.1) * 0.9;
  float ink = (1.0 - smoothstep(0.3, 0.56, l)) * hatch(px, vec2(0.7, 0.7), wob);
  ink += (1.0 - smoothstep(0.18, 0.36, l)) * hatch(px, vec2(-0.7, 0.7), wob * 1.3 + 0.3);
  ink += (1.0 - smoothstep(0.06, 0.2, l)) * hatch(px, vec2(1.0, 0.15), wob * 0.7 + 0.6);
  float g = clamp(ink * 0.7 + smoothstep(0.1, 0.45, e) * 0.95, 0.0, 1.0);
  vec3 paper = vec3(0.96, 0.94, 0.88) * (0.94 + 0.06 * noise(px * 0.5));
  return mix(paper, vec3(0.15, 0.16, 0.22), g); }`;

// Старое кино: сепия, мерцание, царапины, пыль, дрожание кадра
S[28] = `vec3 fx(vec2 p, float am) {
  float fr = floor(uTime * 18.0); vec2 q = p;
  q.y += (hash(vec2(fr, 2.0)) - 0.5) * 0.006; q.x += (hash(vec2(fr, 5.0)) - 0.5) * 0.002;
  float l = smoothstep(0.03, 0.93, lum(now(q)));
  vec3 col = vec3(l) * vec3(1.08, 0.95, 0.76);
  col *= 0.86 + 0.18 * hash(vec2(fr, 9.0));
  for (int i = 0; i < 2; i++) {
    float fi = float(i), tk = floor(uTime * (2.5 + fi));
    float sx = hash(vec2(tk, fi * 7.0 + 1.0)), on = step(0.45, hash(vec2(tk, fi + 20.0)));
    col += on * 0.28 * smoothstep(0.0018, 0.0, abs(p.x - sx - 0.004 * sin(p.y * 17.0 + fr)));
  }
  vec2 dg = p * vec2(A, 1.0) * 9.0; vec2 dh = hash2(floor(dg) + fr * 3.1);
  if (dh.x > 0.965) col *= smoothstep(0.02, 0.05 + 0.1 * dh.y, length(fract(dg) - 0.5 - (dh - 0.5) * 0.5));
  col += (hash(p * uRes * 0.7 + fr) - 0.5) * 0.13;
  return col * (0.25 + 0.75 * smoothstep(1.15, 0.35, length((p - 0.5) * vec2(1.2, 1.1) * 1.45))); }`;

// Видеокассета: строки плывут, цвет размазан, полоса помех ползёт по кадру
S[29] = `vec3 fx(vec2 p, float am) {
  float t = uTime, ln = p.y * uRes.y;
  float wob = (noise(vec2(p.y * 40.0, t * 8.0)) - 0.5) * 0.003 + (noise(vec2(p.y * 3.0, t * 1.5)) - 0.5) * 0.006;
  float trk = smoothstep(0.07, 0.0, abs(p.y - (1.0 - fract(t * 0.13))));
  wob += trk * (hash(vec2(floor(p.y * 120.0), floor(t * 30.0))) - 0.5) * 0.08;
  wob += step(p.y, 0.035) * (0.02 + 0.02 * sin(t * 40.0 + p.y * 300.0));
  vec2 q = vec2(p.x + wob, p.y);
  vec3 c0 = now(q), cL = now(q - vec2(0.006, 0.0)), cR = now(q + vec2(0.009, 0.0));
  vec3 av = (c0 + cL + cR) / 3.0;
  vec3 col = vec3(lum(c0)) + (av - vec3(lum(av))) * 1.3;
  col.r = mix(col.r, cL.r, 0.35); col.b = mix(col.b, cR.b, 0.35);
  col = mix(col, vec3(hash(vec2(floor(p.x * 300.0), floor(ln) + floor(t * 50.0)))), trk * 0.55);
  col *= 0.92 + 0.08 * sin(ln * PI);
  col += (hash(p * uRes * 0.5 + fract(t) * 91.0) - 0.5) * 0.07;
  return col * vec3(0.93, 0.97, 1.03) * 0.92 + 0.045; }`;

// Сон: мягкий фокус, светлая сиреневая дымка, кадр медленно дышит
S[30] = `vec3 fx(vec2 p, float am) {
  float t = uTime; vec2 q = (p - 0.5) / (1.0 + 0.012 * sin(t * 0.5)) + 0.5 + 0.002 * vec2(sin(t * 0.4), cos(t * 0.3));
  vec3 s = now(q), b = blur(q, 3.2);
  vec3 col = 1.0 - (1.0 - s * 0.82) * (1.0 - b * 0.38); col = mix(col, b, 0.35);
  col = col * vec3(1.02, 0.95, 1.07) + mix(vec3(0.06, 0.02, 0.08), vec3(0.02, 0.04, 0.09), p.y) * 0.5;
  float v = smoothstep(0.3, 0.95, length((p - 0.5) * vec2(1.1, 1.3)));
  return mix(col, vec3(0.93, 0.86, 1.0), v * 0.4); }`;

// Марево: горячий воздух поднимается и ломает картинку
S[31] = `#define OWN
vec3 fx(vec2 p, float am) {
  float band = 0.35 + 0.65 * smoothstep(0.0, 0.35, p.y) * smoothstep(1.0, 0.5, p.y);
  vec2 n = vec2(noise(vec2(p.x * 26.0, p.y * 12.0 - uTime * 1.6)), noise(vec2(p.x * 22.0 + 7.0, p.y * 10.0 - uTime * 1.3 + 3.0))) - 0.5;
  vec3 col = now(p + n * vec2(0.009, 0.013) * am * band);
  col = mix(col, col * vec3(1.1, 1.0, 0.82) + vec3(0.05, 0.03, 0.0), 0.6 * am);
  return mix(col, vec3(lum(col)) * vec3(1.12, 1.0, 0.8), 0.15 * am); }`;

// Под водой: колыхание, сине-зелёная толща, солнечная сетка, пузырьки
S[32] = `vec3 fx(vec2 p, float am) {
  float t = uTime;
  vec2 q = p + vec2(sin(p.y * 9.0 + t * 1.1), cos(p.x * 7.0 + t * 0.9)) * 0.008 + vec2(sin(p.y * 23.0 - t * 1.7), 0.0) * 0.003;
  vec3 c = now(q); float depth = 1.0 - p.y * 0.6;
  c *= mix(vec3(0.3, 0.8, 0.95), vec3(0.1, 0.45, 0.7), depth * 0.7) * 1.45;
  c = mix(c, vec3(0.02, 0.2, 0.3), 0.22 + 0.2 * depth);
  vec2 k = p * vec2(A, 1.0) * 4.0; k += vec2(sin(k.y * 1.3 + t * 0.6), cos(k.x * 1.1 - t * 0.5)) * 0.5;
  float c1 = 1.0 - abs(noise(k + t * 0.15) * 2.0 - 1.0), c2 = 1.0 - abs(noise(k * 1.7 - t * 0.2 + 5.0) * 2.0 - 1.0);
  c += vec3(0.5, 0.9, 1.0) * pow(c1 * c2, 3.0) * 0.55 * (0.4 + lum(c));
  c += vec3(0.4, 0.8, 0.9) * pow(noise(vec2(p.x * 7.0 + p.y * 2.0 + t * 0.1, t * 0.25)), 3.0) * smoothstep(0.1, 1.0, p.y) * 0.3;
  vec2 bg = vec2(p.x * A * 9.0, p.y * 9.0 - t * 1.1); vec2 bh = hash2(floor(bg));
  if (bh.x > 0.72) { float d = length(fract(bg) - 0.5 - (bh - 0.5) * 0.5 - vec2(0.08 * sin(t * 2.0 + bh.y * 30.0), 0.0)), r = 0.03 + 0.06 * bh.y; c += vec3(0.6, 0.9, 1.0) * smoothstep(0.02, 0.0, abs(d - r)) * 0.5; }
  return c * smoothstep(1.1, 0.35, length(p - vec2(0.5, 0.6))); }`;

// Мороз: лёд нарастает от краёв кадра к центру (сила = насколько замёрзло стекло)
S[33] = `#define OWN
vec3 fx(vec2 p, float am) {
  vec2 uv = p * vec2(A, 1.0);
  float ed = min(min(p.x, 1.0 - p.x) * A, min(p.y, 1.0 - p.y));
  float n = fbm(uv * 4.0) * 0.6 + noise(uv * 19.0) * 0.4;
  float reach = am * 0.5;
  float m = smoothstep(reach, reach - 0.22, ed - (n - 0.5) * 0.3) * step(0.001, am);
  if (m < 0.002) return now(p);
  // кристаллы растут от края внутрь: вытянутый «гребенчатый» шум в несколько масштабов
  vec2 c2 = p - 0.5; vec2 rd = normalize(c2 * vec2(A, 1.0) + 1e-4), tg = vec2(-rd.y, rd.x);
  vec2 cu = vec2(dot(uv, rd) * 9.0, dot(uv, tg) * 60.0) + n * 2.0;
  float r1 = 1.0 - abs(noise(cu) * 2.0 - 1.0), r2 = 1.0 - abs(noise(cu * 2.7 + 11.0) * 2.0 - 1.0), r3 = 1.0 - abs(noise(uv * 46.0) * 2.0 - 1.0);
  float vein = pow(r1, 5.0) * 0.9 + pow(r2, 6.0) * 0.6 + pow(r3, 7.0) * 0.35;
  float H = n * 0.45 + vein * 0.6;
  vec3 fz = blur(p + (vec2(noise(uv * 30.0), noise(uv * 30.0 + 9.0)) - 0.5) * 0.03 * m, 2.6 * m);
  vec3 ice = mix(fz * 0.74 + vec3(0.17, 0.22, 0.28), vec3(0.9, 0.95, 1.0), clamp(H * 0.5 * m, 0.0, 0.8));
  ice += step(0.992, hash(floor(p * uRes / 2.0) + floor(uTime * 5.0))) * m * 0.7;       // искорки инея
  return mix(now(p), ice, m); }`;

// Дождь на стекле: запотевшее стекло, капли-линзы сползают рывками и оставляют чистый след
S[34] = `#define OWN
vec3 drops(vec2 uv, float t, float size, float seed, float dens) {
  vec2 g = uv * vec2(size, size * 0.5);
  float colId = floor(g.x), cr = hash(vec2(colId, seed));
  g.y += t * (0.3 + 0.35 * cr) + cr * 9.0;
  vec2 id = vec2(colId, floor(g.y)), f = fract(g), h = hash2(id + seed * 3.1);
  if (h.x > dens) return vec3(0.0);
  float ph = t * (0.5 + h.y * 0.9) + h.y * 6.283;
  float cy = 0.5 - 0.3 * sin(ph + 0.9 * sin(ph));                       // капля то стоит, то срывается вниз
  float cx = 0.5 + (h.y - 0.5) * 0.4 + 0.07 * sin(g.y * 2.5 + h.x * 6.0);
  vec2 d = (f - vec2(cx, cy)) * vec2(1.0, 2.0); if (d.y > 0.0) d.y *= 0.75;
  float R = 0.17 + 0.1 * h.x / max(dens, 0.01);
  float m = smoothstep(R, R * 0.55, length(d));
  float above = f.y - cy, top = 1.0 - cy;
  float fade = smoothstep(top, 0.0, above) * step(0.0, above);
  float tw = R * 0.5 * fade;
  float trail = smoothstep(tw, tw * 0.3, abs(f.x - cx)) * fade;
  float ti = floor(above * 3.2), th = hash(id + ti * 7.3 + 1.7);
  vec2 dd = vec2(f.x - cx - (th - 0.5) * 0.09, (fract(above * 3.2) - 0.3 - 0.4 * th) / 3.2 * 2.0);
  float tr2 = R * (0.16 + 0.26 * th), td = smoothstep(tr2, tr2 * 0.5, length(dd)) * fade * step(0.25, th);
  vec2 off = -d * m - dd * td * 2.0;
  return vec3(off, max(max(m, td), trail * 0.55));
}
vec3 fx(vec2 p, float am) {
  vec2 uv = p * vec2(A, 1.0); float t = uTime;
  vec3 d1 = drops(uv, t, 4.6, 1.0, am * 0.7);
  vec3 d2 = uQ < 2 ? drops(uv * 1.8 + 3.3, t * 1.25, 4.6, 5.0, am * 0.55) : vec3(0.0);
  vec2 sg = uv * 22.0 + vec2(noise(uv * 9.0), noise(uv * 9.0 + 5.0)) * 0.8, sid = floor(sg), sh = hash2(sid);
  float life = fract(t * 0.07 * (1.0 + sh.x) + sh.y), sr = (0.1 + 0.22 * sh.x) * smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.75, life);
  vec2 sd = fract(sg) - 0.5 - (sh - 0.5) * 0.4;
  float sm = smoothstep(sr, sr * 0.5, length(sd)) * step(sh.y, am * 0.9);
  vec2 off = d1.xy * 0.11 + d2.xy * 0.06 - sd * sm * 0.05;
  float msk = clamp(d1.z + d2.z + sm, 0.0, 1.0);
  vec3 col = blur(p + off, 3.3 * am * (1.0 - msk));
  col = mix(col, col * 0.86 + vec3(0.03, 0.035, 0.04), am * (1.0 - msk));           // запотевшее стекло чуть серее
  float hl = clamp(dot(normalize(vec3(d1.xy + d2.xy * 0.6 - sd * sm, 0.25)), normalize(vec3(-0.5, -0.6, 0.6))), 0.0, 1.0);
  col += vec3(0.9, 0.95, 1.0) * pow(hl, 12.0) * msk * 0.4;
  return col; }`;

// Ветер: порывы идут по кадру, смазывают картинку вдоль ветра, тонкие струи воздуха, камеру потряхивает
S[35] = `#define OWN
vec3 fx(vec2 p, float am) {
  vec2 dir = windDir(), pe = vec2(-dir.y, dir.x), uv = p * vec2(A, 1.0);
  float str = am * clamp(0.55 + length(uWind) * 0.6, 0.55, 1.3), t = uTime;
  float al = dot(uv, dir), ac = dot(uv, pe), ph = t * 0.8 + dot(uWindPos, dir) * 2.0;
  float g = smoothstep(0.42, 0.82, noise(vec2(al * 1.5 - ph * 1.5, ac * 2.6 + ph * 0.2)));
  float gl = 0.4 + 0.6 * noise(vec2(t * 0.6, 3.0));
  vec2 q = p + (vec2(noise(vec2(t * 5.0, 1.0)), noise(vec2(t * 5.0, 9.0))) - 0.5) * 0.007 * str * gl;
  vec2 dv = dir / vec2(A, 1.0), pv = pe / vec2(A, 1.0);
  float sm = (0.2 + g) * str * 0.022; int T = uQ >= 2 ? 3 : 5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < T; i++) { float k = float(i) / float(T - 1) - 0.3; col += now(q - dv * sm * k + pv * sin(al * 36.0 - ph * 18.0 + float(i)) * 0.0016 * g * str); }
  col /= float(T);
  float s1 = noise(vec2(al * 2.2 - ph * 6.0, ac * 60.0)), s2 = noise(vec2(al * 1.2 - ph * 9.0 + 5.0, ac * 120.0 + 3.0));
  float st = (pow(s1, 7.0) * 1.8 + pow(s2, 9.0) * 2.6) * (0.25 + 0.75 * g) * str;
  col += vec3(0.9, 0.95, 1.0) * st * 0.2;
  return mix(col, vec3(0.86, 0.9, 0.95), g * str * 0.1); }`;

// Рассыпание: кадр крошится в песок, и его уносит ветром (сила = насколько рассыпался)
S[36] = `#define OWN
vec3 fx(vec2 p, float am) {
  vec2 dir = windDir(), uv = p * vec2(A, 1.0);
  float th = fbm(uv * 2.4) * 0.55 + (dot(p - 0.5, dir) + 0.5) * 0.45;
  float s = clamp((am * 1.45 - th) / 0.35, 0.0, 1.0);
  if (s <= 0.0) return now(p);
  vec2 pe = vec2(-dir.y, dir.x), gp = uv * uRes.y / max(2.0, uRes.y / 200.0);
  vec2 r = hash2(floor(gp));
  float hole = noise(vec2(dot(gp, dir) * 0.25 - uTime * 3.0, dot(gp, pe) * 0.7)) * 0.5 + r.y * 0.5;   // дырки вытянуты вдоль ветра
  vec2 src = p - dir * s * s * (0.2 + 0.14 * r.x) / vec2(A, 1.0) + vec2(0.0, 0.05 * s * s * (0.5 + r.y));
  float alive = step(s * 1.02, 0.03 + hole * 0.97);
  vec3 bg = blur(p, 0.0) * 0.16 * vec3(1.0, 0.86, 0.72) + vec3(0.03, 0.022, 0.015);
  vec3 gr = now(src) * (1.0 + 0.35 * s) + vec3(0.14, 0.09, 0.03) * s;
  vec3 col = mix(bg, gr, alive);
  col += vec3(1.0, 0.7, 0.35) * s * (1.0 - s) * 0.5 * (1.0 - alive) * smoothstep(0.0, 0.2, s);    // тлеющая кромка
  return col; }`;

// Скорость: всё летит из одной точки, по краям штрихи
S[37] = `#define OWN
vec3 fx(vec2 p, float am) {
  vec2 c = uTouch, d = p - c; float r = length(d * vec2(A, 1.0));
  float str = am * 0.24 * smoothstep(0.04, 0.7, r);
  int T = uQ >= 2 ? 6 : (uQ == 1 ? 9 : 13); float j = hash(p * uRes + fract(uTime) * 17.0);
  vec3 col = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < T; i++) { float k = (float(i) + j) / float(T), w = 1.0 - k * 0.6; col += now(c + d * (1.0 - str * k)) * w; ws += w; }
  col /= ws;
  vec2 dn = normalize(d * vec2(A, 1.0) + 1e-5);
  float ln = pow(noise(dn * 26.0), 8.0) * 2.5 + pow(noise(dn * 61.0 + 9.0), 10.0) * 4.0;
  ln *= 0.5 + 0.5 * sin(r * 26.0 - uTime * 24.0 + noise(dn * 9.0) * 20.0);
  col += vec3(1.0) * ln * smoothstep(0.22, 0.8, r) * am * 0.55;
  return col * (1.0 - 0.25 * am * smoothstep(0.4, 1.05, r)); }`;

// Головокружение: двоится, плывёт, кадр покачивается
S[38] = `#define OWN
vec3 fx(vec2 p, float am) {
  float t = uTime, an = 0.06 * am * sin(t * 0.7), z = 1.0 - 0.035 * am * (1.0 + sin(t * 0.9));
  vec2 d = (p - 0.5) * vec2(A, 1.0); d = mat2(cos(an), -sin(an), sin(an), cos(an)) * d;
  vec2 q = d / vec2(A, 1.0) * z + 0.5, off = vec2(cos(t * 1.3), sin(t * 1.7)) * 0.022 * am;
  float r = length(d), bl = am * 1.5 * r;
  vec3 a = blur(q + off, bl), b = blur(q - off, bl + 0.4 * am);
  vec3 col = mix(mix(a, b, 0.5), vec3(a.r, (a.g + b.g) * 0.5, b.b), 0.6);
  return col * (1.0 - 0.4 * am * smoothstep(0.3, 0.9, r) * (0.7 + 0.3 * sin(t * 2.0))); }`;

// Воспоминание: выцветший тёплый кадр, размытые светлые края, засветка плёнки, лёгкое эхо
S[39] = `vec3 fx(vec2 p, float am) {
  float t = uTime; vec2 q = (p - 0.5) * (1.0 - 0.015 * (1.0 + sin(t * 0.25))) + 0.5;
  float r = length((p - 0.5) * vec2(1.0, 1.25));
  vec3 c = blur(q, smoothstep(0.15, 0.7, r) * 3.4);
  c = mix(c, past(q, 5), 0.2);
  c = mix(c, vec3(lum(c)) * vec3(1.12, 0.98, 0.82), 0.7);
  c = c * 0.85 + 0.12;
  c = mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.35, 0.95, r) * 0.7);
  float lk = noise(vec2(t * 0.15, p.y * 1.5));
  c += vec3(1.0, 0.45, 0.15) * smoothstep(0.5, 0.0, p.x + 0.25 * lk - 0.1 * sin(t * 0.3)) * 0.3 * (0.4 + 0.6 * lk);
  return c; }`;

// Нуар: чёрно-белое с жёстким контрастом, красное остаётся красным
S[40] = `vec3 fx(vec2 p, float am) {
  vec3 c = now(p); float bw = smoothstep(0.06, 0.8, lum(c)); bw = bw * bw * (3.0 - 2.0 * bw);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float red = smoothstep(0.3, 0.55, (mx - mn) / (mx + 0.001)) * smoothstep(0.08, 0.25, c.r - max(c.g, c.b));
  return mix(vec3(bw), vec3(bw * 1.2 + 0.08, bw * 0.1, bw * 0.08), red); }`;

// Шлейф света: яркое и движущееся оставляет за собой цветной светящийся след
S[41] = `vec3 fx(vec2 p, float am) {
  vec3 c0 = now(p), col = c0; int T = uQ >= 2 ? 5 : (uQ == 1 ? 8 : 12);
  for (int i = 1; i <= T; i++) {
    float k = float(i) / float(T); vec3 c = past(p, i * 2);
    float b = smoothstep(0.1, 0.38, length(c - c0)) * (0.45 + 0.8 * smoothstep(0.35, 0.9, max(c.r, max(c.g, c.b))));
    col = max(col, c * hsv(fract(0.08 + k * 0.75 + uTime * 0.05), 0.7, 1.0) * b * (1.0 - k * 0.75) * 1.25);
  }
  return col; }`;

// Витраж: кадр собран из цветных стёкол со свинцовой оплёткой
S[42] = `vec3 fx(vec2 p, float am) {
  vec2 uv = p * vec2(A, 1.0) * 11.0, ip = floor(uv), fp = fract(uv), best = vec2(0.0); float F1 = 9.0, F2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o2 = vec2(float(i), float(j)), pt = o2 + 0.5 + (hash2(ip + o2) - 0.5) * 0.8; float d = length(pt - fp);
    if (d < F1) { F2 = F1; F1 = d; best = ip + pt; } else if (d < F2) F2 = d;
  }
  vec3 c = now(best / 11.0 / vec2(A, 1.0)); c = clamp(mix(vec3(lum(c)), c, 1.8), 0.0, 1.0); c = pow(c, vec3(0.85)) * 1.1;
  float hc = hash(floor(best * 3.0));
  float gl = 0.72 + 0.3 * noise(uv * 3.0 + hc * 10.0) + 0.16 * sin(dot(p, vec2(3.0, 2.0)) * 3.0 + uTime * 0.6 + hc * 6.0);
  return c * gl * smoothstep(0.03, 0.1, F2 - F1); }`;

// Жидкое время: тёмное отстаёт, светлое живёт сейчас; движение растекается
S[43] = `#define OWN
vec3 fx(vec2 p, float am) {
  float N = float(uN - 2); float l = mix(lum(past(p, 0)), lum(past(p, 6)), 0.5);
  float k = (1.0 - smoothstep(0.1, 0.85, l)) * N * 0.85 * am;
  return k < 1.0 ? mix(now(p), past(p, 1), k) : pastF(p, k); }`;

// ---------- АТМОСФЕРА: полупрозрачные слои поверх готового кадра ----------
G.ATM_HEAD = `#version 300 es
precision highp float;
in vec2 vUV; in vec2 vST; out vec4 o;
uniform sampler2D uScene;
uniform float uTime, uAmt, uVar, uSplit, uBars;
uniform int uQ;
uniform vec2 uRes, uWind, uWindPos;
#define A (uRes.x / uRes.y)
` + NOISE + `
vec4 over(vec4 acc, vec3 c, float a) { return vec4(acc.rgb + c * a * (1.0 - acc.a), acc.a + a * (1.0 - acc.a)); }
`;
G.ATM_TAIL = `
void main() { if (vUV.x < uSplit) { o = vec4(0.0); return; } o = atm(vUV) * smoothstep(0.0, 0.006, 0.5 - uBars * 0.11 - abs(vUV.y - 0.5)); }`;

const AT = G.ATMOS = {};
// Снег с глубиной: дальние снежинки мелкие и медленные, ближние крупные и не в фокусе; ветер сносит и вытягивает
AT.sneg = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 3 : (uQ == 1 ? 5 : 7);
  float am = clamp(uAmt, 0.0, 1.0), vis = min(1.0, uAmt * 2.5); vec4 acc = vec4(0.0);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1);                       // 0 - у самой камеры, 1 - далеко
    float sc = mix(5.0, 42.0, pow(fi, 0.7)), sp = mix(0.55, 0.12, fi), par = mix(1.6, 0.45, fi);
    float an = float(i) * 0.83; vec2 q = mat2(cos(an), -sin(an), sin(an), cos(an)) * uv * sc;      // каждый слой повёрнут: сетки не видно
    vec2 fall = vec2(-uWindPos.x * par, uTime * sp - uWindPos.y * par) * sc;
    q += mat2(cos(an), -sin(an), sin(an), cos(an)) * fall + float(i) * vec2(13.7, 7.3);
    vec2 id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > mix(0.12, 0.5, am) * mix(0.45, 1.6, fi)) continue;   // у камеры снежинок мало, вдали много
    float r = mix(0.11, 0.075, fi) * (0.45 + 0.9 * h.x * h.x);
    vec2 c = 0.5 + (hash2(id + 7.7) - 0.5) * 0.55; c += 0.07 * vec2(sin(uTime * (0.8 + h.x * 1.7) + h.y * 40.0), cos(uTime * (0.6 + h.y) + h.x * 30.0));
    vec2 vel = mat2(cos(an), -sin(an), sin(an), cos(an)) * vec2(uWind.x * par * 1.6, -sp * 2.0 + uWind.y * par), dn = normalize(vel);
    vec2 d = f - c; float along = dot(d, dn), across = dot(d, vec2(-dn.y, dn.x));
    float dd = length(vec2(across, along / min(2.0, 1.0 + length(vel) * 0.7 * mix(1.0, 0.3, fi))));
    float soft = mix(0.95, 0.45, smoothstep(0.0, 0.45, fi));
    float a = smoothstep(r, r * (1.0 - soft), dd) * mix(0.4, 0.95, smoothstep(0.0, 0.35, fi)) * mix(1.0, 0.65, fi);
    acc = over(acc, mix(vec3(0.94, 0.97, 1.0), vec3(0.82, 0.88, 0.96), fi * 0.6), a * vis);
  }
  return acc; }`;
// Дождь: косые струи в несколько планов и лёгкая водяная дымка
AT.dozhd = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 2 : (uQ == 1 ? 3 : 4);
  uv.x += uv.y * uWind.x * 0.45; vec4 acc = vec4(0.0);
  float dens = mix(0.15, 0.85, clamp(uAmt, 0.0, 1.0)), vis = min(1.0, uAmt * 2.5);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(11.0, 34.0, fi);
    vec2 q = vec2(uv.x * sc + float(i) * 5.3, uv.y * sc * 0.2);
    float cid = floor(q.x), ch = hash(vec2(cid, float(i) + 3.0));
    q.y += uTime * mix(5.5, 3.4, fi) * (0.8 + 0.4 * ch) + ch * 17.0;
    vec2 f = fract(q), h = hash2(vec2(cid, floor(q.y)) + float(i) * 9.1);
    if (h.x > dens) continue;
    float line = smoothstep(mix(0.07, 0.11, fi), 0.0, abs(f.x - 0.5 - (h.y - 0.5) * 0.6));
    float len = 0.25 + 0.6 * h.y * h.y, shape = smoothstep(len, len * 0.2, f.y) * smoothstep(0.0, 0.04, f.y);
    acc = over(acc, vec3(0.82, 0.88, 0.98), line * shape * mix(0.5, 0.26, fi) * vis);
  }
  return over(acc, vec3(0.6, 0.66, 0.72), 0.1 * vis * (0.6 + 0.4 * noise(uv * 3.0 + vec2(uTime * 0.3, uTime)))); }`;
// Искры: поднимаются снизу по извилистым путям, мерцают и гаснут; снизу тёплый отсвет огня
AT.iskry = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 2 : (uQ == 1 ? 3 : 5); vec3 acc = vec3(0.0);
  float dens = mix(0.2, 0.85, clamp(uAmt, 0.0, 1.0)), vis = min(1.0, uAmt * 2.5);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(6.0, 17.0, fi), sp = mix(0.24, 0.11, fi);
    vec2 q = uv * sc; q.y -= uTime * sp * sc; q.x -= uWindPos.x * sc * 0.9;
    q.x += 0.55 * sin(uv.y * 5.0 + uTime * 1.3 + float(i) * 2.0) + 0.28 * sin(uv.y * 11.0 - uTime * 0.9 + float(i));
    q += float(i) * vec2(3.1, 17.9);
    vec2 id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > dens) continue;
    vec2 c = 0.5 + (hash2(id + 3.3) - 0.5) * 0.5;
    float r = 0.045 * (0.5 + h.x), d = length((f - c) * vec2(1.0, 0.5));
    float core = smoothstep(r, 0.0, d), halo = r * r / (d * d + r * r * 0.4) * 0.3 * smoothstep(0.42, 0.1, d);
    float life = smoothstep(1.02, 0.1, p.y + h.x * 0.25) * (0.45 + 0.55 * sin(uTime * (7.0 + h.x * 19.0) + h.y * 50.0));
    acc += mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.85, 0.45), core) * (core + halo) * max(life, 0.0) * mix(1.0, 0.6, fi);
  }
  acc += vec3(1.0, 0.35, 0.05) * pow(1.0 - p.y, 4.0) * 0.28 * (0.75 + 0.25 * noise(vec2(uTime * 3.0, p.x * 3.0)));
  return vec4(acc * vis, 0.0); }`;
// Пыль в луче: медленные светлые пылинки, ярче там, где в кадре свет
AT.pyl = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 2 : 4; vec3 acc = vec3(0.0);
  float sl = lum(texture(uScene, vST).rgb), lit = 0.35 + 1.2 * sl * sl, vis = min(1.0, uAmt * 2.0);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(3.2, 15.0, fi);
    vec2 q = uv * sc + vec2(sin(uTime * 0.07 + float(i)) * 0.8 - uWindPos.x * sc * 0.35, uTime * (0.04 - 0.03 * fi) * sc) + float(i) * vec2(7.7, 3.9);
    vec2 id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > 0.25 + 0.6 * uAmt) continue;
    vec2 c = 0.5 + (hash2(id + 5.1) - 0.5) * 0.3 + 0.07 * vec2(sin(uTime * (0.3 + h.x) + h.y * 20.0), cos(uTime * (0.25 + h.y) + h.x * 20.0));
    float r = mix(0.26, 0.1, fi) * (0.4 + 0.6 * h.x), d = length(f - c);
    float disc = smoothstep(r, r * 0.82, d) * (0.5 + 0.5 * smoothstep(r * 0.45, r, d));
    float tw = 0.55 + 0.45 * sin(uTime * (0.6 + h.x * 1.5) + h.y * 30.0);
    acc += vec3(1.0, 0.92, 0.74) * disc * tw * mix(0.16, 0.42, fi);
  }
  return vec4(acc * lit * vis, 0.0); }`;
// Светлячки: редкие огоньки блуждают и медленно загораются и гаснут
AT.svetlyachki = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); vec3 acc = vec3(0.0); float vis = min(1.0, uAmt * 2.0);
  for (int i = 0; i < 2; i++) {
    float sc = i == 0 ? 3.4 : 6.2;
    vec2 q = uv * sc + float(i) * vec2(5.3, 9.1) + vec2(-uWindPos.x * 0.4, uTime * 0.02) * sc, id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > 0.3 + 0.55 * uAmt) continue;
    float t = uTime * (0.35 + h.x * 0.5);
    vec2 c = 0.5 + 0.22 * vec2(sin(t * 1.3 + h.y * 20.0) + 0.4 * sin(t * 3.1), cos(t * 1.1 + h.x * 20.0) + 0.4 * cos(t * 2.7));
    float d = length(f - c), r = i == 0 ? 0.045 : 0.06;
    float pulse = pow(0.5 + 0.5 * sin(uTime * (0.9 + h.x * 1.6) + h.y * 30.0), 3.0);
    float g = r * r / (d * d + r * r * 0.25) * smoothstep(0.45, 0.12, d);
    acc += (vec3(0.7, 1.0, 0.25) * g * 0.35 + vec3(1.0, 1.0, 0.8) * smoothstep(r * 0.6, 0.0, d)) * pulse;
  }
  return vec4(acc * vis, 0.0); }`;
// Пепел: тёмные хлопья кружатся и медленно оседают, некоторые ещё тлеют
AT.pepel = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 2 : 4; vec4 acc = vec4(0.0); vec3 glow = vec3(0.0);
  float vis = min(1.0, uAmt * 2.5);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(5.0, 19.0, fi), sp = mix(0.16, 0.06, fi);
    vec2 q = uv * sc; q.y += uTime * sp * sc; q.x -= uWindPos.x * sc * mix(1.2, 0.5, fi); q.x += 0.4 * sin(uv.y * 4.0 + uTime * 0.6 + float(i) * 2.0); q += float(i) * vec2(9.3, 4.1);
    vec2 id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > 0.2 + 0.7 * uAmt) continue;
    vec2 c = 0.5 + (hash2(id + 2.9) - 0.5) * 0.36, d = f - c;
    float an = uTime * (0.5 + h.x * 2.0) + h.y * 6.0; d = mat2(cos(an), -sin(an), sin(an), cos(an)) * d;
    d.x /= 0.3 + 0.7 * abs(cos(uTime * (1.0 + h.y * 2.0) + h.x * 9.0));
    float r = mix(0.085, 0.05, fi) * (0.4 + 0.8 * h.x) * (0.6 + 0.8 * noise(d * 40.0 + h * 20.0));
    float a = smoothstep(r, r * 0.6, length(d));
    acc = over(acc, mix(vec3(0.05), vec3(0.34, 0.32, 0.3), h.x), a * mix(0.9, 0.65, fi) * vis);
    if (h.x > 0.88) glow += vec3(1.0, 0.35, 0.05) * smoothstep(r * 1.2, r * 0.5, length(d)) * (0.5 + 0.5 * sin(uTime * 3.0 + h.y * 40.0)) * vis;
  }
  return vec4(acc.rgb + glow * 0.8, acc.a); }`;
// Листья (uVar = 1: лепестки): кружатся и переворачиваются на лету
AT.listya = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 2 : 3; vec4 acc = vec4(0.0); float vis = min(1.0, uAmt * 2.5);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(3.0, 8.5, fi), sp = mix(0.22, 0.1, fi);
    vec2 q = uv * sc; q.y += uTime * sp * sc; q.x -= uWindPos.x * sc * mix(1.3, 0.6, fi) + 0.5 * sin(uv.y * 3.0 + uTime * 0.7 + float(i) * 2.0); q += float(i) * vec2(4.7, 11.3);
    vec2 id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > 0.15 + 0.6 * uAmt) continue;
    vec2 c = 0.5 + (hash2(id + 6.1) - 0.5) * 0.2, d = f - c;
    float an = uTime * (0.6 + h.x * 1.6) + h.y * 6.0 + sin(uTime * 1.3 + h.x * 9.0); d = mat2(cos(an), -sin(an), sin(an), cos(an)) * d;
    float flip = cos(uTime * (1.4 + h.y * 2.0) + h.x * 9.0); d.y /= 0.25 + 0.75 * abs(flip);
    float len = mix(0.24, 0.17, fi) * (0.6 + 0.5 * h.x), x = d.x / len;
    float wd = len * mix(0.42, 0.6, uVar) * (1.0 - x * x) * mix(1.0 - 0.35 * x, 1.0, uVar);
    float a = smoothstep(0.0, 0.025, wd - abs(d.y)) * step(abs(x), 1.0);
    vec3 col = h.x < 0.3 ? vec3(0.85, 0.33, 0.05) : (h.x < 0.6 ? vec3(0.95, 0.68, 0.1) : (h.x < 0.85 ? vec3(0.68, 0.14, 0.05) : vec3(0.5, 0.52, 0.12)));
    col = mix(col, mix(vec3(1.0, 0.72, 0.84), vec3(1.0, 0.93, 0.95), h.x), uVar);
    col *= (0.7 + 0.3 * flip) * (1.0 - 0.3 * (1.0 - uVar) * smoothstep(0.012, 0.0, abs(d.y)));
    acc = over(acc, col, a * mix(0.95, 0.75, fi) * vis);
  }
  return acc; }`;
// Туман: клубится и плывёт по ветру, гуще у горизонта
AT.tuman = `vec4 atm(vec2 p) {
  vec2 q = vec2(p.x * A, p.y) * vec2(1.5, 3.0); q.x -= uWindPos.x * 0.7 + uTime * 0.02;
  float n = uQ >= 2 ? noise(q * 1.5) : (fbm(q) * 0.65 + fbm(q * 2.3 + vec2(uTime * 0.03, 0.0)) * 0.35);
  float band = mix(0.5, 1.0, smoothstep(0.95, 0.25, p.y));
  float sl = lum(texture(uScene, vST).rgb);
  float a = clamp(uAmt * band * smoothstep(0.3, 0.8, n + uAmt * 0.25) * (0.6 + 0.4 * sl), 0.0, 0.72);
  return vec4(vec3(0.8, 0.84, 0.88) * a, a); }`;
// Песчаная буря: песок несётся вдоль ветра, рыжая мгла
AT.pesok = `vec4 atm(vec2 p) {
  float w = length(uWind); vec2 dir = w > 0.05 ? uWind / w : vec2(1.0, -0.05), pe = vec2(-dir.y, dir.x);
  vec2 uv0 = vec2(p.x * A, p.y), uv = vec2(dot(uv0, dir), dot(uv0, pe)); float ph = uTime * 0.9 + dot(uWindPos, dir) * 1.5;
  int L = uQ >= 2 ? 2 : 3; vec4 acc = vec4(0.0); float vis = min(1.0, uAmt * 2.0);
  float hz = uQ >= 2 ? noise(vec2(uv.x * 1.5 - ph * 0.8, uv.y * 3.0)) : fbm(vec2(uv.x * 1.5 - ph * 0.8, uv.y * 3.0));
  acc = over(acc, vec3(0.78, 0.56, 0.3), clamp(uAmt * (0.2 + 0.55 * hz), 0.0, 0.8));
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(30.0, 80.0, fi);
    vec2 q = vec2(uv.x * sc * 0.2, uv.y * sc + float(i) * 3.7);
    float rid = floor(q.y), rh = hash(vec2(rid, float(i) + 1.0));
    q.x -= ph * mix(3.5, 2.0, fi) * (0.7 + 0.6 * rh) + rh * 13.0; q.y += 0.3 * sin(uv.x * 6.0 + rh * 20.0 + ph);
    vec2 f = fract(q), h = hash2(vec2(floor(q.x), rid) + float(i) * 5.5);
    if (h.x > 0.3 + 0.6 * uAmt) continue;
    float line = smoothstep(0.22, 0.0, abs(f.y - 0.5 - (h.y - 0.5) * 0.5));
    float shape = smoothstep(0.0, 0.5 + 0.4 * h.y, f.x) * smoothstep(1.0, 0.92, f.x);
    acc = over(acc, vec3(0.96, 0.8, 0.52), line * shape * mix(0.4, 0.2, fi) * vis);
  }
  return acc; }`;
// Блёстки: звёздочки вспыхивают и плывут вверх («волшебная пыль»)
AT.blyostki = `vec4 atm(vec2 p) {
  vec2 uv = vec2(p.x * A, p.y); int L = uQ >= 2 ? 2 : 3; vec3 acc = vec3(0.0); float vis = min(1.0, uAmt * 2.0);
  for (int i = 0; i < L; i++) {
    float fi = float(i) / float(L - 1), sc = mix(5.0, 13.0, fi);
    vec2 q = uv * sc + vec2(sin(uTime * 0.2 + float(i)) * 0.5 - uWindPos.x * sc * 0.4, -uTime * 0.05 * sc) + float(i) * vec2(8.1, 2.3);
    vec2 id = floor(q), f = fract(q), h = hash2(id);
    if (h.y > 0.25 + 0.6 * uAmt) continue;
    vec2 d = f - 0.5 - (hash2(id + 4.4) - 0.5) * 0.3;
    float tw = pow(max(0.0, sin(uTime * (1.5 + h.x * 3.5) + h.y * 40.0)), 5.0);
    float len = 0.32 * (0.5 + 0.5 * h.x), wd = 0.018;
    float star = max(0.0, 1.0 - abs(d.x) / len) * smoothstep(wd, 0.0, abs(d.y)) + max(0.0, 1.0 - abs(d.y) / len) * smoothstep(wd, 0.0, abs(d.x));
    float core = smoothstep(0.05, 0.0, length(d));
    acc += (hsv(fract(h.x * 3.0 + uTime * 0.05), 0.45, 1.0) * star * 0.8 + vec3(1.0) * core) * tw * mix(1.0, 0.6, fi);
  }
  return vec4(acc * vis, 0.0); }`;

// ---------- СВЕЧЕНИЕ ----------
G.BLOOM_PRE = `#version 300 es
precision highp float; in vec2 vST; out vec4 o; uniform sampler2D uT; uniform vec2 uPx; uniform float uTh;
void main() {
  vec3 c = (texture(uT, vST + uPx).rgb + texture(uT, vST - uPx).rgb + texture(uT, vST + vec2(uPx.x, -uPx.y)).rgb + texture(uT, vST + vec2(-uPx.x, uPx.y)).rgb) * 0.25;
  float m = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(uTh, uTh + 0.35, m), 1.0); }`;
G.BLOOM_DOWN = `#version 300 es
precision highp float; in vec2 vST; out vec4 o; uniform sampler2D uT; uniform vec2 uPx;
void main() { o = vec4((texture(uT, vST).rgb * 4.0 + texture(uT, vST + uPx).rgb + texture(uT, vST - uPx).rgb + texture(uT, vST + vec2(uPx.x, -uPx.y)).rgb + texture(uT, vST + vec2(-uPx.x, uPx.y)).rgb) / 8.0, 1.0); }`;
G.BLOOM_UP = `#version 300 es
precision highp float; in vec2 vST; out vec4 o; uniform sampler2D uT; uniform vec2 uPx;
void main() { o = vec4((texture(uT, vST + uPx).rgb + texture(uT, vST - uPx).rgb + texture(uT, vST + vec2(uPx.x, -uPx.y)).rgb + texture(uT, vST + vec2(-uPx.x, uPx.y)).rgb) * 0.25, 1.0); }`;
// лучи света: яркие места «тянутся» от солнца
G.RAYS = `#version 300 es
precision highp float; in vec2 vUV; in vec2 vST; out vec4 o; uniform sampler2D uT; uniform vec2 uSun; uniform vec4 uUV; uniform int uQ;
` + NOISE + `
void main() {
  vec2 d = uSun - vUV; int T = uQ >= 2 ? 8 : 14; float j = hash(gl_FragCoord.xy), w = 1.0, ws = 0.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < T; i++) { float k = (float(i) + j) / float(T); acc += texture(uT, (vUV + d * k * 0.9 - uUV.xy) / uUV.zw).rgb * w; ws += w; w *= 0.9; }
  o = vec4(acc / ws * smoothstep(1.4, 0.2, length(d)), 1.0); }`;

// ---------- СБОРКА КАДРА: переход, свечение, свет, цвет, зерно ----------
G.COMP_VS = `#version 300 es
in vec2 aPos; out vec2 vUV; out vec2 vST; out float vVis;
uniform vec4 uUV; uniform sampler2D uBloom; uniform vec2 uSun;
void main() { vST = aPos * 0.5 + 0.5; vUV = uUV.xy + vST * uUV.zw; gl_Position = vec4(aPos, 0.0, 1.0);
  vVis = dot(textureLod(uBloom, clamp((uSun - uUV.xy) / uUV.zw, 0.0, 1.0), 0.0).rgb, vec3(0.333)); }`;
G.COMP = `#version 300 es
precision highp float;
in vec2 vUV; in vec2 vST; in float vVis; out vec4 o;
uniform sampler2D uA, uB, uBloom, uRays, uRaw;
uniform float uMix, uTime, uSplit, uMirror, uGbw;
uniform int uTrans, uQ;
uniform vec2 uRes, uTouch, uSun, uWind;
uniform vec4 uUV;
uniform vec4 uFin;    // свечение, зерно, виньетка, цветная кайма
uniform vec4 uFin2;   // киношные полосы, лучи, блик, -
uniform vec4 uLp;     // свет: сила, переливы, горизонт, экспозиция
uniform vec4 uLq;     // солнце, сияние, гроза, огонь
uniform vec3 uLtop, uLhor, uLgnd, uLsun, uLshadow;
uniform vec4 uGp;     // цвет: сила, контраст, насыщенность, выцветание
uniform vec3 uGlift, uGgain;
#define A (uRes.x / uRes.y)
` + NOISE + `
vec2 ST(vec2 p) { return clamp((p - uUV.xy) / uUV.zw, 0.0, 1.0); }
vec3 soft(vec3 a, vec3 b) { return mix(2.0 * a * b + a * a * (1.0 - 2.0 * b), sqrt(a) * (2.0 * b - 1.0) + 2.0 * a * (1.0 - b), step(0.5, b)); }
float front = 0.0;
vec3 scene(vec2 p) {
  vec3 a = texture(uA, ST(p)).rgb;
  if (uMix <= 0.0) return a;
  vec3 b = texture(uB, ST(p)).rgb;
  if (uTrans == 0) return mix(a, b, uMix);
  if (uTrans == 5) {                                           // песок: старая картинка рассыпается и улетает
    float w = length(uWind); vec2 dir = w > 0.05 ? uWind / w : vec2(1.0, -0.06);
    float th = fbm(p * vec2(A, 1.0) * 2.4) * 0.55 + (dot(p - 0.5, dir) + 0.5) * 0.45;
    float s = clamp((uMix * 1.45 - th) / 0.35, 0.0, 1.0);
    if (s <= 0.0) return a;
    vec2 r = hash2(floor(p * uRes / max(2.0, uRes.y / 190.0)));
    vec2 src = p - dir * s * s * (0.1 + 0.3 * r.x) / vec2(A, 1.0) + vec2(0.0, 0.07 * s * s * r.y);
    float th2 = fbm(src * vec2(A, 1.0) * 2.4) * 0.55 + (dot(src - 0.5, dir) + 0.5) * 0.45;
    float alive = step(s, 0.02 + r.y * 0.98) * step(th2, uMix * 1.45);
    return mix(b, texture(uA, ST(src)).rgb * (1.0 + 0.3 * s), alive);
  }
  float f;                                                     // кто меняется первым (меньше = раньше)
  if (uTrans == 1) f = fbm(p * vec2(A, 1.0) * 3.0);                                               // пятнами
  else if (uTrans == 2) f = p.x * 0.8 + 0.1 + 0.2 * (noise(vec2(p.y * 5.0, uTime * 0.3)) - 0.5);  // волной слева направо
  else if (uTrans == 3) f = clamp(length((p - uTouch) * vec2(A, 1.0)) / 1.25, 0.0, 1.0);          // кругом из точки
  else f = 1.0 - lum(a);                                                                          // от светлого к тёмному
  float s = 0.1, k = smoothstep(f - s, f + s, uMix * (1.0 + 2.0 * s) - s);
  front = max(front, k * (1.0 - k) * 4.0);
  return mix(a, b, k);
}
float aurora(vec2 p, out float hgt) {
  float x = p.x * A, t = uTime, acc = 0.0; hgt = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cy = 0.62 + 0.1 * fi + 0.06 * sin(x * 1.4 + t * 0.2 + fi * 2.0) + 0.05 * (noise(vec2(x * 2.0 + t * 0.1, fi * 9.0)) - 0.5);
    float d = p.y - cy, cur = smoothstep(-0.015, 0.0, d) * exp(-max(d, 0.0) * mix(9.0, 6.0, fi * 0.5));
    float ray = 0.35 + 0.65 * noise(vec2(x * 16.0 + sin(t * 0.3 + fi) * 2.0, t * 0.35 + fi * 7.0));
    acc += cur * ray * (1.0 - 0.25 * fi); hgt += cur * ray * clamp(d * 5.0, 0.0, 1.0);
  }
  return acc;
}
void main() {
  vec2 p = vUV; vec3 col;
  float ca = uFin.w;
  if (ca > 0.001) { vec2 d = (p - 0.5) * ca * 0.014 * (0.3 + length(p - 0.5) * 1.6); col = vec3(scene(p + d).r, scene(p).g, scene(p - d).b); }
  else col = scene(p);
  if (uMix > 0.0 && uTrans != 0 && uTrans != 4 && uTrans != 5) col += vec3(1.0, 0.88, 0.7) * front * 0.3;
  if (uFin.x > 0.0) col += texture(uBloom, vST).rgb * uFin.x * 1.15;
  float l = lum(col), la = uLp.x;
  if (la > 0.001) {
    float sh = uLp.y, n = 0.5;
    if (sh > 0.0) n = uQ >= 2 ? noise(vec2(p.x * 2.4 + uTime * 0.03, p.y * 3.6 - uTime * 0.02)) : fbm(vec2(p.x * 2.0 + uTime * 0.03, p.y * 3.0 - uTime * 0.02));
    float band = p.y + (n - 0.5) * sh * 0.34 + 0.03 * sh * sin(p.x * 6.0 + uTime * 0.2);
    vec3 sky = mix(uLhor, uLtop, smoothstep(uLp.z, 1.0, band));
    sky = mix(uLgnd, sky, smoothstep(uLp.z - 0.28, uLp.z + 0.04, band));
    sky += sh * 0.2 * (hsv(fract(band * 1.3 + n * 0.8 + uTime * 0.015), 0.7, 1.0) - 0.5) * smoothstep(uLp.z - 0.1, uLp.z + 0.3, band);   // переливы
    float bright = smoothstep(0.35, 0.85, l);
    col = mix(col, soft(clamp(col, 0.0, 1.0), clamp(sky, 0.0, 1.0)), la * (0.5 + 0.5 * bright));
    col = mix(col, sky * (0.55 + 0.6 * l), la * 0.55 * smoothstep(0.62, 0.95, l) * smoothstep(uLp.z - 0.15, uLp.z + 0.2, p.y));   // пересвеченное небо красим градиентом
    col *= mix(vec3(1.0), mix(uLshadow, vec3(1.0), smoothstep(0.0, 0.55, l)), la);
    col *= mix(1.0, uLp.w, la);
    vec2 sd = (p - uSun) * vec2(A, 1.0); float sr = length(sd);
    col += uLsun * (exp(-sr * sr * 22.0) * 0.5 + exp(-sr * 3.2) * 0.16) * uLq.x * la * (1.0 - 0.6 * smoothstep(0.5, 1.0, l));
    if (uLq.y > 0.0) { float hg; float au = aurora(p, hg); col += mix(vec3(0.1, 1.0, 0.45), vec3(0.5, 0.25, 1.0), clamp(hg / max(au, 0.001), 0.0, 1.0)) * au * uLq.y * la * (1.0 - 0.6 * l) * 0.9; }
    if (uLq.z > 0.0) { float tt = uTime * 0.33, f = fract(tt), on = step(0.55, hash(vec2(floor(tt), 4.0))); float fl = on * (exp(-f * 16.0) + 0.6 * exp(-abs(f - 0.11) * 45.0)); col = col * (1.0 + fl * 1.6 * uLq.z * la) + vec3(0.5, 0.6, 0.9) * fl * uLq.z * la * 0.22 * (0.4 + p.y); }
    if (uLq.w > 0.0) { float fk = 0.6 + 0.4 * noise(vec2(uTime * 6.0, p.x * 3.0)); col += vec3(1.0, 0.4, 0.08) * pow(1.0 - p.y, 2.0) * fk * 0.42 * uLq.w * la * (0.35 + l); col *= 1.0 + (fk - 0.8) * 0.12 * uLq.w * la; }
  }
  if (uFin2.y > 0.0) col += texture(uRays, vST).rgb * uFin2.y * mix(vec3(1.0, 0.92, 0.8), uLsun, min(la * 2.0, 1.0)) * 0.6;
  if (uFin2.z > 0.0) {
    float vis = max(smoothstep(0.04, 0.4, vVis), min(uLq.x * la, 1.0));
    vec2 q = (p - uSun) * vec2(A, 1.0), ax = 0.5 - uSun; vec3 fl = vec3(0.0);
    fl += vec3(1.0, 0.8, 0.6) * exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 2.4) * 0.5;
    fl += vec3(1.0, 0.9, 0.8) * 0.1 / (length(q) * 14.0 + 0.6);
    for (int i = 0; i < 4; i++) {
      float fi = float(i), k = 0.4 + fi * 0.42, rr = 0.03 + 0.035 * mod(fi, 2.0) + 0.012 * fi;
      float d = length((p - (uSun + ax * 2.0 * k)) * vec2(A, 1.0));
      fl += hsv(fract(0.55 + 0.13 * fi), 0.55, 1.0) * (smoothstep(rr, rr * 0.7, d) * 0.07 + smoothstep(0.006, 0.0, abs(d - rr)) * 0.05);
    }
    float hd = length((p - 0.5) * vec2(A, 1.0)) - length(ax * vec2(A, 1.0)) * 0.95;
    fl += hsv(fract(0.6 + hd * 6.0), 0.5, 1.0) * smoothstep(0.03, 0.0, abs(hd)) * 0.05 * smoothstep(0.0, 0.5, dot(normalize((p - 0.5) * vec2(A, 1.0) + 1e-4), normalize(ax * vec2(A, 1.0) + 1e-4)));
    col += fl * uFin2.z * vis;
  }
  if (uGp.x > 0.001) {
    vec3 g = max(col, 0.0); float gl = lum(g);
    g = mix(g, vec3(gl), uGbw);
    g = g * uGgain + uGlift * (1.0 - smoothstep(0.0, 0.6, gl));
    g = (g - 0.5) * uGp.y + 0.5;
    g = mix(vec3(lum(g)), g, uGp.z);
    g = g * (1.0 - uGp.w) + uGp.w * 0.5 * vec3(1.0, 0.98, 0.95);
    col = mix(col, g, uGp.x);
  }
  col = max(col, 0.0);
  col = mix(col, 0.8 + 0.2 * tanh((col - 0.8) * 5.0), step(0.8, col));       // мягкий пересвет, как на плёнке
  if (uFin.y > 0.0) col += (hash(floor(vST * uRes / max(1.5, uRes.y / 400.0)) + fract(uTime * 7.31) * vec2(117.0, 71.0)) - 0.5) * uFin.y * 0.24 * (1.0 - 0.5 * lum(col));
  if (uFin.z > 0.0) col *= 1.0 - uFin.z * smoothstep(0.35, 1.05, length((p - 0.5) * vec2(1.15, 1.3)) * 1.25);
  if (uFin2.x > 0.0) col *= smoothstep(0.0, 0.006, 0.5 - uFin2.x * 0.11 - abs(p.y - 0.5));
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;                                // от полос на градиентах
  if (uSplit > 0.0) { if (p.x < uSplit) col = texture(uRaw, vec2(uMirror > 0.5 ? 1.0 - p.x : p.x, p.y)).rgb; col = mix(col, vec3(1.0), smoothstep(0.003, 0.0015, abs(p.x - uSplit))); }
  o = vec4(col, 1.0);
}`;

// ---------- вывод для VR-шлема (две картинки с «бочкой») ----------
G.PRESENT = `#version 300 es
precision highp float; in vec2 vST; out vec4 o; uniform sampler2D uT; uniform vec2 uRes, uScale, uOff;
void main() {
  float a = uRes.x / uRes.y; vec2 c = (vST - 0.5) * vec2(a, 1.0); float r2 = dot(c, c);
  c *= (1.0 + 0.24 * r2 + 0.06 * r2 * r2) * 0.82; vec2 p = c / vec2(a, 1.0) + 0.5;
  vec2 q = p * uScale + uOff;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { o = vec4(0, 0, 0, 1); return; }
  o = vec4(texture(uT, q).rgb * smoothstep(0.75, 0.55, length((vST - 0.5) * vec2(a, 1.0))), 1.0); }`;

window.FILTRY_GL = G;
})();
