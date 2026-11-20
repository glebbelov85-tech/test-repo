// ===== Запасной вариант без WebGL: CSS-фильтры прямо на <video> =====
// Из ar/ohota.html (миры «Охоты на монстров»). Почти ничего не стоят по скорости,
// работают везде, но умеют только менять цвет: никаких контуров, искажений и «времени».
// Плюс в «Охоте» поверх рисовалась виньетка нужного цвета (vig) и частицы (part).
"use strict";

const CSS_TEMY = [
  { name: 'Обычный мир',     filter: 'none', vig: '0,0,0' },
  { name: 'Призрачная ночь', filter: 'grayscale(1) sepia(1) hue-rotate(180deg) saturate(2.2) brightness(.6) contrast(1.25)', vig: '0,10,40' },
  { name: 'Адское пламя',    filter: 'grayscale(1) sepia(1) hue-rotate(-35deg) saturate(4) contrast(1.3) brightness(.8)', vig: '60,0,0' },
  { name: 'Ночное видение',  filter: 'grayscale(1) sepia(1) hue-rotate(65deg) saturate(3) brightness(1.1) contrast(1.4)', vig: '0,25,0' },
  { name: 'Изнанка',         filter: 'invert(1) hue-rotate(180deg) saturate(1.8) contrast(1.1)', vig: '40,0,60' },
  // новые, по тому же принципу
  { name: 'Старое кино',     filter: 'sepia(.9) contrast(1.15) brightness(.95)', vig: '30,15,0' },
  { name: 'Яркий мультик',   filter: 'saturate(2.2) contrast(1.35) brightness(1.05)', vig: '0,0,0' }
];

// video - элемент <video>; vignetteEl - div поверх видео (position:absolute; inset:0; pointer-events:none)
function setCssTema(video, i, vignetteEl) {
  const t = CSS_TEMY[(i + CSS_TEMY.length) % CSS_TEMY.length];
  video.style.filter = t.filter;
  video.style.transition = 'filter .6s';     // плавная смена мира
  if (vignetteEl) vignetteEl.style.background =
    `radial-gradient(ellipse at center, rgba(${t.vig},0) 45%, rgba(${t.vig},${t.filter === 'none' ? 0 : 0.8}) 100%)`;
  return t;
}
