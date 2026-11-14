"use strict";
// Монстры, нарисованные кодом (без картинок). Все функции рисуют в точке (0,0),
// размер примерно 100x100 единиц - перед вызовом масштабируй ctx.
function drawGhost(ctx, m) {
  const base = ctx.globalAlpha, a = 0.55 + Math.sin(m.t * 3 + m.seed) * 0.25;
  ctx.globalAlpha = a * base;
  ctx.shadowColor = '#9fd4ff'; ctx.shadowBlur = 30;
  ctx.fillStyle = m.hitT > 0 ? '#ffb0b0' : '#eef6ff';
  ctx.beginPath();
  ctx.arc(0, -10, 40, Math.PI, 0);
  ctx.lineTo(40, 40);
  for (let i = 0; i < 5; i++) {
    const x1 = 40 - (i + 0.5) * 16, x2 = 40 - (i + 1) * 16;
    ctx.quadraticCurveTo(x1, 40 + (i % 2 ? -12 : 14) + Math.sin(m.t * 6 + i) * 4, x2, 40);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.globalAlpha = Math.min(1, a + 0.3) * base;
  ctx.fillStyle = '#10142a';
  ctx.beginPath(); ctx.ellipse(-14, -12, 7, 11, 0, 0, 7); ctx.ellipse(14, -12, 7, 11, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 12, 8, 6 + Math.sin(m.t * 4) * 4, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = base;
}
function drawBug(ctx, m) {
  const legs = Math.sin(m.t * 18);
  ctx.strokeStyle = '#1a0d22'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * 20, i * 12);
    ctx.lineTo(s * 44, i * 16 + (i === 0 ? legs : -legs) * 8 * s); ctx.lineTo(s * 52, i * 22 + 14); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-8, -26); ctx.quadraticCurveTo(-20, -52, -30, -50 + legs * 4);
  ctx.moveTo(8, -26); ctx.quadraticCurveTo(20, -52, 30, -50 - legs * 4); ctx.stroke();
  ctx.fillStyle = m.hitT > 0 ? '#ff8080' : '#5b2a86';
  ctx.shadowColor = '#b4ff5a'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 32, 0, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#7d45b0'; ctx.beginPath(); ctx.ellipse(0, 10, 20, 16, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.arc(0, -8, 15, 0, 7); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(Math.sin(m.t * 2) * 5, -8, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(Math.sin(m.t * 2) * 5 + 3, -11, 2.5, 0, 7); ctx.fill();
}
function drawBoss(ctx, m) {
  const pulse = 1 + Math.sin(m.t * 4) * 0.04;
  ctx.scale(pulse, 1 / pulse);
  ctx.fillStyle = '#ffd9a0';
  ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(-48, -70); ctx.lineTo(-14, -42); ctx.fill();
  ctx.beginPath(); ctx.moveTo(30, -30); ctx.lineTo(48, -70); ctx.lineTo(14, -42); ctx.fill();
  ctx.shadowColor = '#ff3a1a'; ctx.shadowBlur = 34;
  ctx.fillStyle = m.hitT > 0 ? '#ffffff' : '#c4161c';
  ctx.beginPath(); ctx.moveTo(-50, 40);
  ctx.bezierCurveTo(-60, -20, -30, -50, 0, -48); ctx.bezierCurveTo(30, -50, 60, -20, 50, 40);
  ctx.quadraticCurveTo(0, 56, -50, 40); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffef5a';
  ctx.beginPath(); ctx.moveTo(-32, -18); ctx.lineTo(-8, -8); ctx.lineTo(-30, -2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(32, -18); ctx.lineTo(8, -8); ctx.lineTo(30, -2); ctx.fill();
  ctx.fillStyle = '#2a0000';
  const open = 8 + Math.abs(Math.sin(m.t * 3)) * 10;
  ctx.beginPath(); ctx.ellipse(0, 20, 28, open, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 10 - 4, 20 - open + 2); ctx.lineTo(i * 10 + 4, 20 - open + 2); ctx.lineTo(i * 10, 20 - open + 11); ctx.fill(); }
}
function drawMonsterBody(ctx, m) {
  if (m.type === 'ghost') drawGhost(ctx, m); else if (m.type === 'bug') drawBug(ctx, m); else if (m.type === 'boss') drawBoss(ctx, m);
  else if (m.type === 'imp') drawImp(ctx, m); else if (m.type === 'fly') drawFly(ctx, m);
}
// чертёнок из трещины: тёмный, с горящими глазами и хвостом
function drawImp(ctx, m) {
  const step = Math.sin(m.t * 12);
  ctx.strokeStyle = '#1a0610'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, 26); ctx.lineTo(-16 + step * 6, 48); ctx.moveTo(12, 26); ctx.lineTo(16 - step * 6, 48); ctx.stroke();
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(18, 22); ctx.quadraticCurveTo(46, 30, 40 + Math.sin(m.t * 5) * 6, 0); ctx.stroke();
  ctx.fillStyle = '#1a0610'; ctx.beginPath(); ctx.moveTo(40 + Math.sin(m.t * 5) * 6, -8); ctx.lineTo(34, 2); ctx.lineTo(46, 2); ctx.fill();
  ctx.shadowColor = m.glow || '#c35bff'; ctx.shadowBlur = 22;
  ctx.fillStyle = m.hitT > 0 ? '#ff9a9a' : '#2b0b25';
  ctx.beginPath(); ctx.ellipse(0, 4, 28, 30, 0, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#2b0b25';
  ctx.beginPath(); ctx.moveTo(-20, -18); ctx.lineTo(-30, -44); ctx.lineTo(-8, -26); ctx.fill();
  ctx.beginPath(); ctx.moveTo(20, -18); ctx.lineTo(30, -44); ctx.lineTo(8, -26); ctx.fill();
  ctx.strokeStyle = '#2b0b25'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-24, 6); ctx.lineTo(-40, 18 - step * 8); ctx.moveTo(24, 6); ctx.lineTo(40, 18 + step * 8); ctx.stroke();
  ctx.fillStyle = m.glow || '#ff4fd8'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.ellipse(-10, -4, 7, 5, 0.3, 0, 7); ctx.ellipse(10, -4, 7, 5, -0.3, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(10, 12); ctx.lineTo(6, 17); ctx.lineTo(2, 13); ctx.lineTo(-2, 17); ctx.lineTo(-6, 13); ctx.closePath(); ctx.fill();
}
// муха: крылья мелькают, большие красные глаза
function drawFly(ctx, m) {
  const w = Math.sin(m.t * 60);
  ctx.fillStyle = 'rgba(220,235,255,.55)';
  ctx.beginPath(); ctx.ellipse(-22, -22, 26, 12, -0.6 + w * 0.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(22, -22, 26, 12, 0.6 - w * 0.5, 0, 7); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-10, i * 8 + 10); ctx.lineTo(-28, i * 12 + 24); ctx.moveTo(10, i * 8 + 10); ctx.lineTo(28, i * 12 + 24); ctx.stroke(); }
  ctx.fillStyle = m.hitT > 0 ? '#c66' : (m.color || '#2c3a2e');
  ctx.beginPath(); ctx.ellipse(0, 10, 16, 24, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(120,255,160,.35)'; ctx.beginPath(); ctx.ellipse(-5, 4, 5, 12, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c0141c';
  ctx.beginPath(); ctx.arc(-11, -14, 10, 0, 7); ctx.arc(11, -14, 10, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-14, -17, 3, 0, 7); ctx.arc(8, -17, 3, 0, 7); ctx.fill();
}
