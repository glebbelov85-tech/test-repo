// ===== Источники картинки для фильтров =====
// Из ar/core.js (startCamera) + новое: видеофайл и выбор файла с телефона.
// Фильтрам всё равно, откуда кадры: им нужен <video>, который играет.
"use strict";

// 1) Камера телефона (как в AR-играх). facing: 'environment' - задняя, 'user' - передняя.
//    Работает только по https (или localhost) и после разрешения пользователя.
async function startCamera(video, facing = 'environment', hiRes = true) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
  if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: hiRes ? 1920 : 1280 }, height: { ideal: hiRes ? 1080 : 720 } },
      audio: false
    });
    video.removeAttribute('src'); video.srcObject = stream;
    video.muted = true; video.playsInline = true;
    await video.play().catch(() => {});
    return stream;
  } catch (e) { console.log('Камера недоступна:', e); return null; }
}

// 2) Видеофайл по адресу (отрезок кино). Для кино - главный вариант.
//    Файл должен лежать на том же сайте, иначе WebGL откажется его читать (CORS).
function playVideoUrl(video, url, { loop = true, muted = true } = {}) {
  if (video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  video.crossOrigin = 'anonymous';
  video.src = url; video.loop = loop; video.muted = muted;
  video.playsInline = true;                 // без этого iPhone откроет видео на весь экран своим плеером
  video.setAttribute('playsinline', '');
  return video.play().catch(() => {});      // со звуком браузер разрешит play() только после касания экрана
}

// 3) Видео, выбранное на телефоне/компьютере (<input type="file" accept="video/*">)
function playVideoFile(video, file, opts) {
  const url = URL.createObjectURL(file);
  if (video._blobUrl) URL.revokeObjectURL(video._blobUrl);
  video._blobUrl = url;
  return playVideoUrl(video, url, opts);
}
