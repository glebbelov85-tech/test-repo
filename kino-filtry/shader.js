// ===== Шейдеры фильтров (GLSL ES 3.00, WebGL2) =====
// Источник: ar/chudesa.html («Комната чудес») + цветовые миры из ar/ohota.html,
// плюс новые фильтры для кино: мультфильм, ночное видение, глитч, пиксели.
// Весь эффект считается в одной функции fx(режим, точка). Так можно плавно
// перетекать из одного фильтра в другой: main() вызывает fx() два раза и смешивает.
"use strict";

window.FILTRY_VS = `#version 300 es
in vec2 aPos; out vec2 vUV;
void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// копия кадра в ленту прошлого (уменьшенная)
window.FILTRY_COPY_FS = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uSrc; out vec4 o;
void main() { o = texture(uSrc, vUV); }`;

window.FILTRY_FS = `#version 300 es
precision highp float;
precision mediump sampler2DArray;
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc;          // текущий кадр видео/камеры
uniform sampler2DArray uHist;    // лента прошлых кадров (кольцо)
uniform int uHead, uN, uModeA, uModeB, uFreeze;
uniform float uMixAB;            // 0 = только A, 1 = только B (переход ползунком)
uniform float uAmt;              // сила фильтра: 0 = чистое видео, 1 = полный эффект
uniform float uTime, uMirror, uVR, uPulse;
uniform vec2 uRes, uScale, uOff, uTouch;
const float PI = 3.14159265;

vec2 cuv(vec2 p) { if (uMirror > 0.5) p.x = 1.0 - p.x; return clamp(p * uScale + uOff, 0.001, 0.999); }
vec3 past(vec2 p, int k) {
  k = clamp(k, 0, uN - 2);
  int l = (uHead - k + uN * 4) % uN;
  return texture(uHist, vec3(cuv(p), float(l))).rgb;
}
vec3 pastF(vec2 p, float k) { float f = floor(k); return mix(past(p, int(f)), past(p, int(f) + 1), k - f); }
vec3 now(vec2 p) { if (uFreeze >= 0) return past(p, uFreeze); return texture(uSrc, cuv(p)).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0, 4, 2), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1), k, s); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// контур (оператор Собеля). k < 0 - текущий кадр, иначе кадр из прошлого
float edge(vec2 p, int k) {
  vec2 e = 1.5 / uRes;
  float tl = lum(k < 0 ? now(p + vec2(-e.x, e.y)) : past(p + vec2(-e.x, e.y), k)), t = lum(k < 0 ? now(p + vec2(0, e.y)) : past(p + vec2(0, e.y), k)), tr = lum(k < 0 ? now(p + e) : past(p + e, k));
  float l = lum(k < 0 ? now(p - vec2(e.x, 0)) : past(p - vec2(e.x, 0), k)), r = lum(k < 0 ? now(p + vec2(e.x, 0)) : past(p + vec2(e.x, 0), k));
  float bl = lum(k < 0 ? now(p - e) : past(p - e, k)), b = lum(k < 0 ? now(p - vec2(0, e.y)) : past(p - vec2(0, e.y), k)), br = lum(k < 0 ? now(p + vec2(e.x, -e.y)) : past(p + vec2(e.x, -e.y), k));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;
  return length(vec2(gx, gy));
}
vec3 heat(float t) {
  vec3 c = mix(vec3(0.0, 0.0, 0.15), vec3(0.3, 0.0, 0.7), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.9, 0.1, 0.3), smoothstep(0.25, 0.5, t));
  c = mix(c, vec3(1.0, 0.6, 0.0), smoothstep(0.5, 0.75, t));
  return mix(c, vec3(1.0, 1.0, 0.85), smoothstep(0.75, 1.0, t));
}
// --- точный перенос CSS-фильтров из ohota.html (grayscale, sepia, hue-rotate, saturate...) ---
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

vec3 fx(int m, vec2 p) {
  float a = uRes.x / uRes.y, t = uTime;
  int N = uN - 2;
  vec3 col;
  if (m == 0) { // обычное видео
    col = now(p);
  } else if (m == 1) { // пузырь
    vec2 d = (p - uTouch) * vec2(a, 1.0);
    float r = length(d), R = 0.42;
    if (r < R) { float pw = 1.0 + 0.8 * (0.6 + 0.4 * sin(t * 1.6)); d *= pow(r / R, pw) * R / max(r, 1e-4); }
    col = now(uTouch + d / vec2(a, 1.0));
    col += vec3(0.08) * smoothstep(0.03, 0.0, abs(r - R));
  } else if (m == 2) { // волны (комната смеха)
    vec2 q = p;
    q.x += sin(p.y * 11.0 + t * 1.3) * 0.04 + sin(p.y * 29.0 - t * 0.8) * 0.012;
    q.y += sin(p.x * 7.0 + t * 0.9) * 0.025;
    q.y = q.y + 0.07 * sin(q.y * PI * 2.0 + t * 0.4);
    col = now(q);
  } else if (m == 3) { // худой и толстый
    float f = 1.0 + 0.65 * sin(t * 0.7);
    float c = p.x - uTouch.x, s = smoothstep(0.0, 0.45, abs(c));
    float q = uTouch.x + c * mix(1.0 / f, 1.0, s * s);
    float cy = p.y - 0.5;
    col = now(vec2(q, 0.5 + cy * mix(f * 0.92, 1.0, smoothstep(0.0, 0.6, abs(cy)))));
  } else if (m == 4) { // симметрия
    vec2 q = p; if (q.x > uTouch.x) q.x = 2.0 * uTouch.x - q.x;
    col = now(q);
  } else if (m == 5) { // калейдоскоп
    vec2 d = (p - 0.5) * vec2(a, 1.0);
    float r = length(d), an = atan(d.y, d.x) + t * 0.12, seg = PI / 4.0;
    an = mod(an, seg * 2.0); if (an > seg) an = seg * 2.0 - an;
    vec2 q = uTouch + vec2(cos(an), sin(an)) * r * 0.8 / vec2(a, 1.0);
    col = now(fract(q));
  } else if (m == 6) { // воронка
    vec2 d = (p - uTouch) * vec2(a, 1.0);
    float r = length(d), an = atan(d.y, d.x);
    an += (0.9 + 0.5 * sin(t * 0.5)) * exp(-r * 3.0) * 4.0 * sin(t * 0.3 + 1.0);
    r = pow(r, 1.0 + 0.25 * sin(t * 0.8));
    col = now(uTouch + vec2(cos(an), sin(an)) * r / vec2(a, 1.0));
  } else if (m == 7) { // эхо времени (щелевая съёмка): низ - сейчас, верх - прошлое
    col = pastF(p, p.y * float(N));
  } else if (m == 8) { // время из центра
    float r = length((p - uTouch) * vec2(a, 1.0));
    col = pastF(p, clamp(r * 1.6, 0.0, 1.0) * float(N));
  } else if (m == 9) { // мозаика времени
    vec2 cell = floor(p * vec2(6.0, 6.0 / a));
    float k = floor(hash(cell + floor(t * 0.25)) * float(N));
    col = past(p, int(k));
    vec2 f = fract(p * vec2(6.0, 6.0 / a));
    col *= 0.85 + 0.15 * smoothstep(0.0, 0.04, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
  } else if (m == 10) { // радужное время: R сейчас, G и B из прошлого
    col = vec3(now(p).r, past(p, 7).g, past(p, 14).b);
  } else if (m == 11) { // призраки (шлейф за движением)
    vec3 c0 = now(p); col = c0 * 0.5; float w = 0.5;
    for (int i = 1; i <= 7; i++) { float wi = 0.5 * (1.0 - float(i) / 8.0) / 3.5; col += past(p, i * 3) * wi * vec3(0.75, 0.85, 1.15); w += wi; }
    col /= w;
  } else if (m == 12) { // стробоскоп: чёткие копии движущегося
    vec3 c0 = now(p); col = c0;
    for (int i = 1; i <= 5; i++) {
      vec3 c = past(p, i * 4);
      float mm = smoothstep(0.1, 0.3, length(c - c0));
      col = mix(col, c, mm * (0.7 - float(i) * 0.1));
    }
  } else if (m == 13) { // неон
    float e0 = edge(p, -1), e1 = edge(p, 8);
    float h = fract(p.y * 0.4 + t * 0.08 + lum(now(p)) * 0.3);
    col = hsv(h, 0.9, 1.0) * smoothstep(0.08, 0.45, e0) * 1.4 + hsv(h + 0.5, 0.9, 1.0) * smoothstep(0.1, 0.5, e1) * 0.5;
  } else if (m == 14) { // тепловизор
    vec3 c0 = now(p);
    float mm = length(c0 - past(p, 5));
    col = heat(clamp(lum(c0) * 0.55 + mm * 2.5, 0.0, 1.0));
  } else if (m == 15) { // конфетный мир
    vec3 c0 = now(p);
    float l = lum(c0);
    col = hsv(fract(l * 1.5 + t * 0.1 + p.x * 0.2), 0.75, 0.35 + l * 0.75);
    col = mix(col, c0, 0.25);
  } else if (m == 16) { // МУЛЬТФИЛЬМ: сглаживание с сохранением краёв + ступени яркости + чёрный контур
    vec2 e = 2.0 / uRes;
    vec3 c0 = now(p), s = c0; float w = 1.0;
    for (int i = 0; i < 8; i++) {
      float an = float(i) * PI / 4.0;
      vec3 n = now(p + vec2(cos(an), sin(an)) * e);
      float k = exp(-dot(n - c0, n - c0) * 40.0);
      s += n * k; w += k;
    }
    vec3 c = s / w;
    float l = lum(c), q = (floor(l * 5.0) + 0.5) / 5.0;
    c = c * (q / max(l, 0.03));
    c = clamp(mix(vec3(lum(c)), c, 1.45), 0.0, 1.0);
    float ed = edge(p, -1);
    col = c * (1.0 - smoothstep(0.22, 0.48, ed));
  } else if (m == 17) { // НОЧНОЕ ВИДЕНИЕ (шейдерная версия): зелёный, шум, строки, круглая маска
    float l = pow(clamp(lum(now(p)) * 1.7, 0.0, 1.0), 0.8);
    float n = hash(p * uRes + fract(t * 7.3) * 100.0);
    float scan = 0.88 + 0.12 * sin(p.y * uRes.y * 1.2);
    col = vec3(0.18, 1.0, 0.3) * (l * scan + (n - 0.5) * 0.14);
    col *= smoothstep(0.85, 0.45, length((p - 0.5) * vec2(a, 1.0)));
  } else if (m == 18) { // ГЛИТЧ: сдвиг полос, разъезд RGB, застывшие блоки
    float bt = floor(t * 9.0);
    float burst = step(0.55, hash(vec2(floor(t * 1.7), 3.1)));        // всплески, не постоянно
    float row = floor(p.y * 28.0);
    float r = hash(vec2(row, bt));
    float sh = r > 0.8 ? (hash(vec2(row, bt + 7.0)) - 0.5) * 0.18 * burst : 0.0;
    vec2 q = vec2(fract(p.x + sh), p.y);
    float split = 0.004 + 0.02 * burst * hash(vec2(bt, 1.0));
    col = vec3(now(q + vec2(split, 0)).r, now(q).g, now(q - vec2(split, 0)).b);
    vec2 cell = floor(p * vec2(10.0, 7.0));
    float hc = hash(cell + bt);
    if (burst > 0.5 && hc > 0.93) col = past(p, 10);                   // кусок из прошлого
    if (burst > 0.5 && hc < 0.03) col = 1.0 - col;                     // инверсия
    col *= 0.92 + 0.08 * sin(p.y * uRes.y * 2.0);
  } else if (m == 19) { // ПИКСЕЛИ (8 бит)
    vec2 cells = vec2(160.0, 160.0 / a);
    vec2 q = (floor(p * cells) + 0.5) / cells;
    vec3 c = now(q);
    col = floor(c * 5.0 + 0.5) / 5.0;
  } else if (m == 20) { // Призрачная ночь (CSS из ohota.html)
    col = cssCon(cssSat(cssHue(cssSepiaGray(now(p)), 180.0), 2.2) * 0.6, 1.25);
  } else if (m == 21) { // Адское пламя (CSS из ohota.html)
    col = cssCon(cssSat(cssHue(cssSepiaGray(now(p)), -35.0), 4.0), 1.3) * 0.8;
  } else if (m == 22) { // Изнанка (CSS из ohota.html)
    col = cssCon(cssSat(cssHue(1.0 - now(p), 180.0), 1.8), 1.1);
  } else { // 23: Зелёная ночь (CSS-версия ночного видения из ohota.html)
    col = cssCon(cssSat(cssHue(cssSepiaGray(now(p)), 65.0), 3.0) * 1.1, 1.4);
  }
  return col;
}

void main() {
  vec2 p = vUV;
  float a = uRes.x / uRes.y;
  float vign = 1.0;
  if (uVR > 0.5) { // предыскажение «бочкой» под линзы VR-шлема
    vec2 c = (p - 0.5) * vec2(a, 1.0);
    float r2 = dot(c, c);
    c *= (1.0 + 0.24 * r2 + 0.06 * r2 * r2) * 0.82;
    p = c / vec2(a, 1.0) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) { o = vec4(0, 0, 0, 1); return; }
    vign = smoothstep(0.75, 0.55, length((vUV - 0.5) * vec2(a, 1.0)));
  }
  // режим «вписать» (contain): за краями видео - чёрные поля
  vec2 q = p * uScale + uOff;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { o = vec4(0, 0, 0, 1); return; }
  vec3 col = fx(uModeA, p);
  if (uMixAB > 0.002) col = mix(col, fx(uModeB, p), uMixAB);   // второй фильтр считаем только во время перехода
  col = mix(now(p), col, uAmt);
  col *= 1.0 + uPulse;
  o = vec4(col * vign, 1.0);
}`;
