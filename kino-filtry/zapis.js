// ===== Запись того, что видно на экране, в видеофайл =====
// Из ar/chudesa.html (кнопка записи): canvas.captureStream + MediaRecorder.
// Пригодится, чтобы сохранить отрезок кино уже с фильтром.
"use strict";

function pickMime() {
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

// startRecording(canvas, { audioStream }) -> объект с stop(), который вернёт Promise<Blob>
// audioStream - можно передать звук (микрофон или звук видео через AudioContext.createMediaStreamDestination()).
function startRecording(canvas, { fps = 30, audioStream = null, bitrate = 8000000 } = {}) {
  if (!window.MediaRecorder || !canvas.captureStream) return null;
  const stream = canvas.captureStream(fps);
  if (audioStream) audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = pickMime();
  let rec;
  try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: bitrate }); }
  catch (e) { rec = new MediaRecorder(stream); }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(500);
  return {
    mime: rec.mimeType || mime,
    stop: () => new Promise(res => {
      rec.onstop = () => { const type = (rec.mimeType || mime || 'video/webm').split(';')[0]; res(new Blob(chunks, { type })); };
      rec.stop();
    })
  };
}

// сохранить Blob как файл (попадёт в «Загрузки», на телефоне видно в галерее)
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
