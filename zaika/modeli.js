'use strict';
// 3D-модели «Домика Зайки»: всё собрано из простых фигур, без внешних файлов.
const T = THREE;
const C = hex => new T.Color(hex).convertSRGBToLinear();

const _mats = {};
function M(hex, r = 0.72, extra) {
  if (extra) return new T.MeshStandardMaterial(Object.assign({ color: C(hex), roughness: r, metalness: 0 }, extra));
  const k = hex + '|' + r;
  return _mats[k] || (_mats[k] = new T.MeshStandardMaterial({ color: C(hex), roughness: r, metalness: 0 }));
}
const GEO = {
  sph: new T.SphereGeometry(1, 24, 16),
  sphLo: new T.SphereGeometry(1, 14, 10),
};
const MAT = {
  eye: M('#22160f', 0.15),
  white: new T.MeshBasicMaterial({ color: 0xffffff }),
  pink: M('#f79ab0', 0.8),
  dark: M('#3a2a20', 0.6),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m;
}
function ball(mat, s, x = 0, y = 0, z = 0, lo) {
  const m = mesh(lo ? GEO.sphLo : GEO.sph, mat, x, y, z);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  return m;
}
function cyl(mat, rt, rb, h, x = 0, y = 0, z = 0, seg = 20) { return mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, y, z); }
function cone(mat, r, h, x = 0, y = 0, z = 0, seg = 16) { return mesh(new T.ConeGeometry(r, h, seg), mat, x, y, z); }
function rrShape(w, h, r) {
  const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// скруглённая коробка w×h×d
function rbox(mat, w, h, d, r = 0.12, x = 0, y = 0, z = 0) {
  const b = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = new T.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, Math.max(0.001, r - b) + 0.001), { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 6 });
  g.center();
  return mesh(g, mat, x, y, z);
}
function grp(x = 0, y = 0, z = 0) { const g = new T.Group(); g.position.set(x, y, z); return g; }
function hitBox(parent, w, h, d, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ visible: false }));
  m.position.set(x, y, z); parent.add(m); parent.userData.hit = m; return m;
}

// ----- лицо -----
function eye(parent, x, y, z, r = 0.1) {
  const e = grp(x, y, z);
  e.add(ball(MAT.eye, [r, r * 1.18, r * 0.7]));
  const h = ball(MAT.white, r * 0.3, r * 0.32, r * 0.42, r * 0.6, true); h.castShadow = false; e.add(h);
  parent.add(e); return e;
}
function face(g, head, o) {
  // o: {ex, ey, ez, er, cheeks:[x,y,z,r]}
  const eyes = [eye(head, -o.ex, o.ey, o.ez, o.er), eye(head, o.ex, o.ey, o.ez, o.er)];
  if (o.cheeks) {
    const [cx, cy, cz, cr] = o.cheeks;
    for (const s of [-1, 1]) { const c = ball(M(o.cheekCol || '#ff9db4', 0.9), [cr, cr * 0.75, cr * 0.4], s * cx, cy, cz); c.castShadow = false; c.rotation.y = s * 0.7; head.add(c); }
  }
  g.userData.eyes = eyes;
}

// ====== ЗАЙКА ======
function mkZaika() {
  const g = grp(), U = g.userData;
  const fur = M('#f7f1e8', 0.85), wht = M('#ffffff', 0.85), pinkIn = M('#f9b4c4', 0.85);
  const body = ball(fur, [0.62, 0.7, 0.55], 0, 0.85, 0); g.add(body);
  g.add(ball(wht, [0.42, 0.48, 0.3], 0, 0.82, 0.32));
  g.add(ball(wht, 0.22, 0, 0.55, -0.55));
  for (const s of [-1, 1]) g.add(ball(fur, [0.26, 0.15, 0.38], s * 0.3, 0.13, 0.22));
  const arms = [];
  for (const s of [-1, 1]) {
    const a = grp(s * 0.55, 1.28, 0.08); a.add(ball(fur, [0.16, 0.36, 0.16], 0, -0.26, 0)); a.rotation.z = s * 0.35; g.add(a); arms.push(a);
  }
  const head = grp(0, 2.02, 0); g.add(head);
  head.add(ball(fur, [0.8, 0.72, 0.72]));
  const ears = [];
  for (const s of [-1, 1]) {
    const e = grp(s * 0.32, 0.55, -0.05);
    e.add(ball(fur, [0.2, 0.72, 0.13], 0, 0.62, 0)); e.add(ball(pinkIn, [0.11, 0.54, 0.06], 0, 0.6, 0.09));
    e.rotation.z = -s * 0.16; head.add(e); ears.push(e);
  }
  for (const s of [-1, 1]) head.add(ball(wht, [0.2, 0.16, 0.14], s * 0.13, -0.2, 0.62));
  head.add(ball(M('#f2889f', 0.5), [0.09, 0.065, 0.06], 0, -0.1, 0.74));
  const mouth = ball(MAT.dark, [0.07, 0.035, 0.04], 0, -0.31, 0.66); head.add(mouth);
  face(g, head, { ex: 0.3, ey: 0.08, ez: 0.64, er: 0.1, cheeks: [0.5, -0.16, 0.5, 0.15] });
  // бантик
  const bowM = M('#ff5d8a', 0.5);
  for (const s of [-1, 1]) { const b = ball(bowM, [0.2, 0.14, 0.09], s * 0.2, 1.4, 0.5); b.rotation.z = s * 0.3; g.add(b); }
  g.add(ball(bowM, 0.09, 0, 1.4, 0.54));
  Object.assign(U, { body, head, ears, arms, mouth, bodyS: body.scale.clone(), mouthS: mouth.scale.clone(), kind: 'zaika', h: 3.3 });
  U.tick = t => {
    ears[0].rotation.z = 0.16 + Math.sin(t * 1.7) * 0.06; ears[1].rotation.z = -0.16 - Math.sin(t * 1.7 + 0.6) * 0.06;
    ears[0].rotation.x = ears[1].rotation.x = Math.sin(t * 2.3) * 0.05;
    if (!U.wave) { arms[0].rotation.z = -0.35 + Math.sin(t * 2) * 0.05; arms[1].rotation.z = 0.35 - Math.sin(t * 2) * 0.05; }
    else { arms[1].rotation.z = 2.4 + Math.sin(t * 9) * 0.35; }
  };
  return g;
}

// ====== МИШКА ======
function mkMishka() {
  const g = grp(), U = g.userData;
  const fur = M('#b97f4c', 0.9), lt = M('#ebcaa0', 0.9);
  const body = ball(fur, [0.72, 0.74, 0.62], 0, 0.86, 0); g.add(body);
  g.add(ball(lt, [0.46, 0.5, 0.3], 0, 0.84, 0.38));
  for (const s of [-1, 1]) { g.add(ball(fur, [0.27, 0.22, 0.38], s * 0.4, 0.2, 0.42)); g.add(ball(lt, [0.16, 0.14, 0.05], s * 0.4, 0.2, 0.79)); }
  const arms = [];
  for (const s of [-1, 1]) { const a = grp(s * 0.62, 1.3, 0.1); a.add(ball(fur, [0.2, 0.38, 0.2], 0, -0.26, 0)); a.rotation.z = s * 0.45; g.add(a); arms.push(a); }
  const head = grp(0, 2.0, 0); g.add(head);
  head.add(ball(fur, [0.78, 0.7, 0.7]));
  for (const s of [-1, 1]) { head.add(ball(fur, [0.27, 0.27, 0.14], s * 0.56, 0.52, 0)); head.add(ball(lt, [0.15, 0.15, 0.06], s * 0.56, 0.52, 0.11)); }
  head.add(ball(lt, [0.33, 0.26, 0.24], 0, -0.16, 0.56));
  head.add(ball(MAT.eye, [0.11, 0.08, 0.07], 0, -0.06, 0.78));
  const mouth = ball(MAT.dark, [0.06, 0.03, 0.03], 0, -0.27, 0.76); head.add(mouth);
  face(g, head, { ex: 0.29, ey: 0.12, ez: 0.62, er: 0.095, cheeks: [0.5, -0.14, 0.5, 0.14] });
  Object.assign(U, { body, head, arms, mouth, bodyS: body.scale.clone(), mouthS: mouth.scale.clone(), kind: 'mishka', h: 2.9 });
  U.tick = t => { arms[0].rotation.z = -0.45 + Math.sin(t * 1.8 + U.ph) * 0.07; arms[1].rotation.z = 0.45 - Math.sin(t * 1.8 + U.ph) * 0.07; head.rotation.z = Math.sin(t * 1.1 + U.ph) * 0.05; };
  U.ph = Math.random() * 6;
  return g;
}

// ====== ЁЖИК ====== (смотрит вдоль +z)
function mkEzhik() {
  const g = grp(), U = g.userData;
  const br = M('#7a5238', 0.9), bg = M('#f0d6ae', 0.85), sp = M('#5a3a26', 0.8);
  const body = ball(br, [0.95, 0.82, 1.1], 0, 0.85, 0); g.add(body);
  g.add(ball(bg, [0.7, 0.5, 0.9], 0, 0.55, 0.12));
  // иголки
  const N = 110, im = new T.InstancedMesh(new T.ConeGeometry(0.11, 0.5, 7), sp, N); im.castShadow = true;
  const d = new T.Object3D(), up = new T.Vector3(0, 1, 0); let k = 0;
  for (let i = 0; k < N && i < 2000; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const n = new T.Vector3(s * Math.cos(a), u, s * Math.sin(a));
    if (n.y < -0.1 || (n.z > 0.45 && n.y < 0.75)) continue;
    d.position.set(n.x * 0.95, 0.85 + n.y * 0.82, n.z * 1.1);
    const nn = new T.Vector3(n.x / 0.95, n.y / 0.82, n.z / 1.1).normalize(); nn.z -= 0.35; nn.normalize();
    d.quaternion.setFromUnitVectors(up, nn); d.position.addScaledVector(nn, 0.16);
    const sc = 0.85 + Math.random() * 0.4; d.scale.set(sc, sc, sc); d.updateMatrix(); im.setMatrixAt(k++, d.matrix);
  }
  im.count = k; g.add(im);
  const head = grp(0, 0.78, 0.82); g.add(head);
  head.add(ball(bg, [0.58, 0.52, 0.55]));
  const sn = cone(bg, 0.3, 0.7, 0, -0.1, 0.62, 18); sn.rotation.x = Math.PI / 2 - 0.12; head.add(sn);
  head.add(ball(MAT.eye, 0.11, 0, 0.0, 0.98));
  for (const s of [-1, 1]) head.add(ball(bg, [0.15, 0.17, 0.08], s * 0.42, 0.42, -0.02));
  const mouth = ball(MAT.dark, [0.07, 0.03, 0.05], 0, -0.3, 0.5); head.add(mouth);
  face(g, head, { ex: 0.25, ey: 0.16, ez: 0.45, er: 0.085, cheeks: [0.42, -0.08, 0.3, 0.12] });
  for (const s of [-1, 1]) for (const z of [-0.5, 0.55]) g.add(ball(bg, [0.17, 0.1, 0.24], s * 0.5, 0.09, z));
  Object.assign(U, { body, head, mouth, bodyS: body.scale.clone(), mouthS: mouth.scale.clone(), kind: 'ezhik', h: 1.8 });
  U.tick = t => { head.rotation.x = Math.sin(t * 1.5) * 0.05; head.rotation.y = Math.sin(t * 0.9) * 0.1; };
  return g;
}

// ====== ЗВЕРИ ФЕРМЫ ====== (смотрят вдоль +z)
function legs4(g, mat, hoof, x, z1, z2, h, r) {
  const L = [];
  for (const s of [-1, 1]) for (const z of [z1, z2]) {
    const l = grp(s * x, h, z); l.add(cyl(mat, r, r * 0.9, h, 0, -h / 2, 0, 12));
    if (hoof) l.add(cyl(hoof, r * 1.05, r * 1.1, h * 0.28, 0, -h + h * 0.14, 0, 12));
    g.add(l); L.push(l);
  }
  return L;
}
function mkZver(kind) {
  const g = grp(), U = g.userData; let body, head, mouth, tick = () => {};
  if (kind === 'korova') {
    const w = M('#fffaf2', 0.85), sp = M('#3a2c26', 0.85), pk = M('#f8b3c2', 0.7);
    body = ball(w, [0.8, 0.72, 1.05], 0, 1.3, -0.1); g.add(body);
    [[0.5, 1.7, -0.3, 0.42], [-0.55, 1.45, 0.3, 0.36], [0.1, 1.9, -0.75, 0.38], [-0.4, 1.2, -0.8, 0.3]].forEach(([x, y, z, r]) => g.add(ball(sp, [r, r, r], x * 0.93, y * 0.985, z * 0.93)));
    legs4(g, w, sp, 0.42, -0.65, 0.5, 0.75, 0.17);
    g.add(ball(pk, [0.3, 0.2, 0.3], 0, 0.72, -0.45));
    const tail = grp(0, 1.6, -1.1); tail.add(cyl(w, 0.04, 0.04, 0.8, 0, -0.4, 0, 6)); tail.add(ball(sp, [0.1, 0.16, 0.1], 0, -0.85, 0)); tail.rotation.x = 0.4; g.add(tail);
    head = grp(0, 1.95, 0.85); g.add(head);
    head.add(ball(w, [0.62, 0.6, 0.56]));
    head.add(ball(sp, [0.3, 0.3, 0.2], 0.3, 0.2, 0.36));
    head.add(ball(pk, [0.44, 0.3, 0.32], 0, -0.3, 0.42));
    for (const s of [-1, 1]) {
      head.add(ball(M('#c9577a', 0.6), [0.06, 0.08, 0.04], s * 0.16, -0.26, 0.72));
      const hn = cone(M('#fff0cf', 0.5), 0.1, 0.36, s * 0.34, 0.62, 0, 10); hn.rotation.z = -s * 0.5; head.add(hn);
      const e = ball(w, [0.27, 0.13, 0.1], s * 0.72, 0.28, 0); e.rotation.z = s * 0.4; head.add(e);
    }
    mouth = ball(MAT.dark, [0.12, 0.03, 0.04], 0, -0.46, 0.66); head.add(mouth);
    face(g, head, { ex: 0.27, ey: 0.14, ez: 0.5, er: 0.095 });
    tick = t => { tail.rotation.z = Math.sin(t * 2.2) * 0.5; head.rotation.z = Math.sin(t * 0.9) * 0.06; };
  } else if (kind === 'sobaka') {
    const f = M('#d9a066', 0.9), dk = M('#8a5632', 0.9), cr = M('#f8e6cc', 0.9);
    body = ball(f, [0.6, 0.58, 0.88], 0, 1.0, -0.1); g.add(body);
    g.add(ball(cr, [0.4, 0.4, 0.5], 0, 0.85, 0.25));
    legs4(g, f, cr, 0.34, -0.6, 0.45, 0.55, 0.15);
    const tail = grp(0, 1.35, -0.9); const tm = ball(f, [0.1, 0.4, 0.1], 0, 0.3, 0); tail.add(tm); tail.rotation.x = -0.5; g.add(tail);
    const col = mesh(new T.TorusGeometry(0.4, 0.07, 8, 24), M('#e53935', 0.5), 0, 1.38, 0.5); col.rotation.x = Math.PI / 2 - 0.5; g.add(col);
    head = grp(0, 1.85, 0.62); g.add(head);
    head.add(ball(f, [0.62, 0.58, 0.56]));
    head.add(ball(dk, [0.26, 0.25, 0.16], 0.3, 0.12, 0.4));
    const ears = [];
    for (const s of [-1, 1]) { const e = grp(s * 0.52, 0.35, 0); e.add(ball(dk, [0.17, 0.42, 0.24], 0, -0.3, 0)); e.rotation.z = s * 0.25; head.add(e); ears.push(e); }
    head.add(ball(cr, [0.34, 0.26, 0.3], 0, -0.2, 0.42));
    head.add(ball(MAT.eye, [0.12, 0.09, 0.08], 0, -0.08, 0.72));
    const tng = ball(M('#ff7b9c', 0.5), [0.1, 0.03, 0.15], 0, -0.42, 0.52); tng.rotation.x = 0.7; head.add(tng);
    mouth = ball(MAT.dark, [0.1, 0.03, 0.04], 0, -0.36, 0.6); head.add(mouth);
    face(g, head, { ex: 0.27, ey: 0.13, ez: 0.5, er: 0.095 });
    tick = t => { tail.rotation.z = Math.sin(t * 11) * 0.55; ears.forEach((e, i) => e.rotation.z = (i ? 1 : -1) * (0.25 + Math.sin(t * 2.4) * 0.08)); head.rotation.z = Math.sin(t * 1.3) * 0.1; };
  } else if (kind === 'koshka') {
    const f = M('#ffb14a', 0.9), st = M('#e9842a', 0.9), w = M('#fff6e6', 0.9);
    body = ball(f, [0.52, 0.56, 0.8], 0, 0.9, -0.1); g.add(body);
    g.add(ball(w, [0.34, 0.38, 0.4], 0, 0.8, 0.3));
    legs4(g, f, w, 0.3, -0.55, 0.42, 0.45, 0.13);
    const tail = grp(0, 1.1, -0.85);
    const tc = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, 0.5, -0.25), new T.Vector3(0.1, 1.0, -0.15), new T.Vector3(0.3, 1.25, 0.05)]);
    tail.add(mesh(new T.TubeGeometry(tc, 14, 0.09, 8), f)); tail.add(ball(st, 0.11, 0.3, 1.25, 0.05)); g.add(tail);
    head = grp(0, 1.72, 0.55); g.add(head);
    head.add(ball(f, [0.66, 0.56, 0.55]));
    for (const s of [-1, 1]) {
      const e = cone(f, 0.24, 0.42, s * 0.4, 0.56, 0, 4); e.rotation.y = Math.PI / 4; e.rotation.z = -s * 0.25; head.add(e);
      const ei = cone(MAT.pink, 0.13, 0.26, s * 0.4, 0.54, 0.07, 4); ei.rotation.y = Math.PI / 4; ei.rotation.z = -s * 0.25; ei.castShadow = false; head.add(ei);
      head.add(ball(w, [0.17, 0.13, 0.12], s * 0.11, -0.2, 0.5));
      for (const dy of [-0.05, 0.06]) { const wh = cyl(M('#ffffff', 0.5), 0.012, 0.012, 0.5, s * 0.5, -0.2 + dy, 0.4, 5); wh.rotation.z = Math.PI / 2 + s * dy * 3; wh.castShadow = false; head.add(wh); }
    }
    for (const dx of [-0.14, 0, 0.14]) head.add(ball(st, [0.04, 0.14, 0.05], dx, 0.42 - Math.abs(dx) * 0.3, 0.4));
    head.add(ball(M('#f06292', 0.5), [0.06, 0.045, 0.04], 0, -0.12, 0.6));
    mouth = ball(MAT.dark, [0.06, 0.025, 0.03], 0, -0.28, 0.55); head.add(mouth);
    const eyes = [];
    for (const s of [-1, 1]) { const e = grp(s * 0.27, 0.08, 0.47); e.add(ball(M('#8bc34a', 0.2), [0.11, 0.13, 0.07])); e.add(ball(MAT.eye, [0.04, 0.11, 0.03], 0, 0, 0.055)); const h = ball(MAT.white, 0.03, 0.04, 0.05, 0.08, true); h.castShadow = false; e.add(h); head.add(e); eyes.push(e); }
    U.eyes = eyes;
    tick = t => { tail.rotation.z = Math.sin(t * 1.6) * 0.35; tail.rotation.x = Math.sin(t * 1.1) * 0.15; head.rotation.z = Math.sin(t * 1.0 + 1) * 0.08; };
  } else if (kind === 'utka') {
    const y = M('#ffe033', 0.85), or = M('#ff9416', 0.6);
    body = ball(y, [0.6, 0.55, 0.78], 0, 0.78, -0.1); g.add(body);
    const tl = cone(y, 0.25, 0.5, 0, 1.05, -0.8, 10); tl.rotation.x = -0.9; g.add(tl);
    const wings = [];
    for (const s of [-1, 1]) { const wg = grp(s * 0.55, 0.95, -0.05); wg.add(ball(M('#ffd21a', 0.85), [0.12, 0.3, 0.45], s * 0.02, -0.15, -0.05)); g.add(wg); wings.push(wg); g.add(ball(or, [0.2, 0.05, 0.28], s * 0.25, 0.05, 0.2)); g.add(cyl(or, 0.05, 0.05, 0.3, s * 0.25, 0.2, 0.05, 8)); }
    head = grp(0, 1.62, 0.3); g.add(head);
    head.add(ball(y, 0.52));
    const tf = cone(y, 0.08, 0.3, 0, 0.56, -0.05, 8); tf.rotation.z = 0.3; head.add(tf);
    head.add(ball(or, [0.3, 0.09, 0.3], 0, -0.1, 0.5));
    mouth = ball(or, [0.26, 0.06, 0.26], 0, -0.19, 0.46); head.add(mouth);
    face(g, head, { ex: 0.22, ey: 0.12, ez: 0.42, er: 0.085, cheeks: [0.36, -0.06, 0.34, 0.11], cheekCol: '#ffab7a' });
    U.wingFlap = 0;
    tick = t => { const f = U.talk ? 16 : 2.4, a = U.talk ? 0.7 : 0.08; wings[0].rotation.z = -Math.abs(Math.sin(t * f)) * a; wings[1].rotation.z = Math.abs(Math.sin(t * f)) * a; head.rotation.z = Math.sin(t * 1.4) * 0.1; };
  } else if (kind === 'svinka') {
    const p = M('#ffb7c8', 0.85), d = M('#f78faa', 0.8);
    body = ball(p, [0.72, 0.66, 0.95], 0, 1.0, -0.1); g.add(body);
    legs4(g, p, d, 0.38, -0.6, 0.45, 0.5, 0.16);
    const tail = mesh(new T.TorusGeometry(0.14, 0.04, 6, 14, Math.PI * 1.6), d, 0, 1.25, -1.05); tail.rotation.y = Math.PI / 2; g.add(tail);
    head = grp(0, 1.55, 0.72); g.add(head);
    head.add(ball(p, [0.66, 0.6, 0.56]));
    for (const s of [-1, 1]) { const e = cone(d, 0.22, 0.36, s * 0.42, 0.52, 0.08, 4); e.rotation.y = Math.PI / 4; e.rotation.x = 0.5; e.rotation.z = -s * 0.3; head.add(e); }
    const sn = cyl(d, 0.26, 0.28, 0.22, 0, -0.14, 0.56, 20); sn.rotation.x = Math.PI / 2; sn.scale.y = 1; sn.scale.z = 0.8; head.add(sn);
    for (const s of [-1, 1]) head.add(ball(M('#b9456a', 0.6), [0.05, 0.07, 0.03], s * 0.1, -0.14, 0.67));
    mouth = ball(MAT.dark, [0.1, 0.03, 0.04], 0, -0.4, 0.46); head.add(mouth);
    face(g, head, { ex: 0.28, ey: 0.14, ez: 0.48, er: 0.09, cheeks: [0.48, -0.1, 0.36, 0.13], cheekCol: '#ff7d9f' });
    tick = t => { tail.rotation.x = Math.sin(t * 6) * 0.3; head.rotation.z = Math.sin(t * 1.2 + 2) * 0.07; };
  } else if (kind === 'ovechka') {
    const w = M('#ffffff', 0.95), dk = M('#5c5560', 0.85);
    body = grp(0, 1.15, -0.1); g.add(body);
    body.add(ball(w, [0.7, 0.62, 0.9]));
    for (let i = 0; i < 26; i++) {
      const u = Math.random() * 1.7 - 0.7, a = Math.random() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u)));
      body.add(ball(w, 0.28 + Math.random() * 0.1, s * Math.cos(a) * 0.62, u * 0.52, s * Math.sin(a) * 0.82, true));
    }
    legs4(g, dk, null, 0.34, -0.55, 0.4, 0.6, 0.11);
    head = grp(0, 1.7, 0.78); g.add(head);
    head.add(ball(dk, [0.42, 0.5, 0.44]));
    for (const [x, y, z, r] of [[0, 0.42, 0.05, 0.3], [-0.24, 0.36, 0.0, 0.22], [0.24, 0.36, 0.0, 0.22], [0, 0.3, -0.25, 0.3]]) head.add(ball(w, r, x, y, z, true));
    for (const s of [-1, 1]) { const e = ball(dk, [0.24, 0.1, 0.12], s * 0.52, 0.1, -0.02); e.rotation.z = -s * 0.35; head.add(e); }
    head.add(ball(M('#2b2530', 0.4), [0.07, 0.05, 0.04], 0, -0.2, 0.42));
    mouth = ball(M('#2b2530', 0.6), [0.07, 0.025, 0.03], 0, -0.33, 0.36); head.add(mouth);
    const eyes = [];
    for (const s of [-1, 1]) { const e = grp(s * 0.18, 0.06, 0.38); e.add(ball(M('#ffffff', 0.3), [0.1, 0.11, 0.06])); e.add(ball(MAT.eye, [0.055, 0.065, 0.03], 0, -0.01, 0.045)); head.add(e); eyes.push(e); }
    U.eyes = eyes;
    tick = t => { head.rotation.z = Math.sin(t * 1.1 + 3) * 0.09; };
  }
  Object.assign(U, { body, head, mouth, bodyS: body.scale.clone(), mouthS: mouth.scale.clone(), kind, tick, h: 2.5 });
  return g;
}

// ====== ШАРИК ======
function mkShar(hex) {
  const g = grp(), U = g.userData;
  const m = M(hex, 0.22);
  const b = ball(m, [0.82, 1.0, 0.82], 0, 0, 0); g.add(b);
  const hl = ball(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), [0.14, 0.26, 0.05], -0.32, 0.38, 0.66, true); hl.rotation.z = 0.5; hl.castShadow = false; g.add(hl);
  const kn = cone(m, 0.13, 0.2, 0, -1.05, 0, 8); kn.rotation.x = Math.PI; g.add(kn);
  const cv = new T.CatmullRomCurve3([new T.Vector3(0, -1.1, 0), new T.Vector3(0.12, -1.7, 0), new T.Vector3(-0.1, -2.3, 0.05), new T.Vector3(0.05, -2.9, 0)]);
  const s = mesh(new T.TubeGeometry(cv, 16, 0.018, 5), M('#9a9a9a', 0.8)); s.castShadow = false; g.add(s);
  U.ball = b; U.kind = 'shar'; U.ph = Math.random() * 6;
  return g;
}

// ====== ФИГУРЫ ======
function drawFig(p, kind, s = 1, ox = 0, oy = 0) {
  const poly = (pts, r) => {
    const n = pts.length, A = [], B = [];
    for (let i = 0; i < n; i++) {
      const P = pts[i], Pp = pts[(i + n - 1) % n], Pn = pts[(i + 1) % n];
      const d1 = Math.hypot(Pp[0] - P[0], Pp[1] - P[1]), d2 = Math.hypot(Pn[0] - P[0], Pn[1] - P[1]);
      A.push([P[0] + (Pp[0] - P[0]) / d1 * r, P[1] + (Pp[1] - P[1]) / d1 * r]);
      B.push([P[0] + (Pn[0] - P[0]) / d2 * r, P[1] + (Pn[1] - P[1]) / d2 * r]);
    }
    p.moveTo(ox + A[0][0] * s, oy + A[0][1] * s);
    for (let i = 0; i < n; i++) {
      if (i) p.lineTo(ox + A[i][0] * s, oy + A[i][1] * s);
      p.quadraticCurveTo(ox + pts[i][0] * s, oy + pts[i][1] * s, ox + B[i][0] * s, oy + B[i][1] * s);
    }
    p.lineTo(ox + A[0][0] * s, oy + A[0][1] * s);
  };
  if (kind === 'krug') { p.moveTo(ox + s, oy); p.absarc(ox, oy, s, 0, Math.PI * 2, false); }
  else if (kind === 'kvadrat') poly([[-0.88, -0.88], [0.88, -0.88], [0.88, 0.88], [-0.88, 0.88]], 0.16);
  else if (kind === 'treugolnik') poly([[0, 1.05], [-1.08, -0.82], [1.08, -0.82]].reverse(), 0.18);
  else if (kind === 'zvezda') { const pts = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.52 : 1.16; pts.push([r * Math.cos(a), r * Math.sin(a) - 0.06]); } poly(pts, 0.1); }
  else if (kind === 'serdce') {
    const q = (a, b, c, d, e, f) => p.bezierCurveTo(ox + a * s, oy + b * s, ox + c * s, oy + d * s, ox + e * s, oy + f * s);
    p.moveTo(ox, oy - 0.98 * s);
    q(1.45, -0.05, 1.2, 1.1, 0.52, 0.98); q(0.2, 0.92, 0, 0.66, 0, 0.44); q(0, 0.66, -0.2, 0.92, -0.52, 0.98); q(-1.2, 1.1, -1.45, -0.05, 0, -0.98);
  }
  return p;
}
const FIG_COL = { krug: '#f04438', kvadrat: '#2f7bf6', treugolnik: '#3fb950', zvezda: '#ffc928', serdce: '#f262a0' };
function mkFigura(kind, depth = 0.5) {
  const g = grp();
  const geo = new T.ExtrudeGeometry(drawFig(new T.Shape(), kind, 0.9), { depth: depth - 0.2, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 4, curveSegments: 24 });
  geo.center();
  g.add(mesh(geo, M(FIG_COL[kind], 0.28)));
  g.userData.kind = 'figura'; g.userData.fig = kind;
  return g;
}
// ящик-сортер: holes = [{kind, x, y}], w×h
function mkSorter(w, h, holes) {
  const g = grp(), wood = M('#d99a55', 0.7), woodD = M('#b9783a', 0.75);
  const sh = rrShape(w, h, 0.5);
  holes.forEach(o => sh.holes.push(drawFig(new T.Path(), o.kind, 1.08, o.x, o.y)));
  const lid = mesh(new T.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 20 }), wood, 0, 0, -0.3);
  lid.receiveShadow = true; g.add(lid);
  const D = 1.6;
  const back = mesh(new T.PlaneGeometry(w - 0.2, h - 0.2), M('#4a2b17', 1), 0, 0, -1.0); back.castShadow = false; g.add(back);
  const body = rbox(woodD, w - 0.06, h - 0.06, D, 0.3, 0, 0, -0.4 - D / 2 - 0.62); g.add(body);
  for (const s of [-1, 1]) {
    g.add(mesh(new T.BoxGeometry(0.3, h - 0.3, 1.0), woodD, s * (w / 2 - 0.2), 0, -0.85));
    g.add(mesh(new T.BoxGeometry(w - 0.3, 0.3, 1.0), woodD, 0, s * (h / 2 - 0.2), -0.85));
  }
  return g;
}

// ====== ЯБЛОКО, ДЕРЕВО ======
function mkYabloko() {
  const g = grp();
  g.add(ball(M('#ee3b32', 0.25), [0.42, 0.39, 0.42]));
  const st = cyl(M('#6b4226', 0.8), 0.03, 0.04, 0.26, 0.02, 0.46, 0, 6); st.rotation.z = -0.2; g.add(st);
  const lf = ball(M('#4caf50', 0.6), [0.2, 0.03, 0.1], 0.2, 0.52, 0, true); lf.rotation.z = 0.5; g.add(lf);
  const hl = ball(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }), [0.07, 0.12, 0.03], -0.16, 0.14, 0.36, true); hl.rotation.z = 0.4; hl.castShadow = false; g.add(hl);
  g.userData.kind = 'yabloko';
  return g;
}
function mkDerevo() {
  const g = grp(), tr = M('#8b5a3c', 0.9), g1 = M('#5fbf58', 0.9), g2 = M('#74d06a', 0.9), g3 = M('#4fae4d', 0.9);
  g.add(cyl(tr, 0.42, 0.72, 4.2, 0, 2.1, 0, 14));
  for (const s of [-1, 1]) { const b = cyl(tr, 0.16, 0.26, 1.8, s * 0.75, 3.9, 0, 8); b.rotation.z = -s * 0.75; g.add(b); }
  const crown = grp(0, 0, 0); g.add(crown);
  [[0, 6.5, 0, 2.3, g2], [-1.8, 5.6, 0.2, 1.75, g1], [1.8, 5.6, 0.2, 1.75, g1], [0, 5.1, 0.7, 1.7, g3], [-1.0, 7.5, 0, 1.5, g1], [1.0, 7.4, -0.2, 1.55, g2], [0, 6.0, -1.2, 2.0, g3]].forEach(([x, y, z, r, m]) => crown.add(ball(m, r, x, y, z)));
  g.userData.crown = crown;
  return g;
}

// ====== КРОВАТКА ====== (длина 3 вдоль x)
function mkKrovatka() {
  const g = grp(), wd = M('#c98a55', 0.6), wh = M('#fffaf0', 0.95);
  g.add(rbox(wd, 0.26, 1.7, 1.7, 0.12, -1.5, 0.85, 0));
  g.add(rbox(wd, 0.26, 1.0, 1.7, 0.12, 1.5, 0.5, 0));
  g.add(rbox(wd, 3.0, 0.26, 1.6, 0.08, 0, 0.36, 0));
  g.add(rbox(wh, 2.76, 0.34, 1.5, 0.14, 0, 0.62, 0));
  const pl = rbox(wh, 0.8, 0.26, 1.15, 0.12, -0.9, 0.86, 0); g.add(pl);
  for (const s of [-1, 1]) g.add(ball(M('#ffd54f', 0.4), 0.13, -1.5, 1.78, s * 0.7));
  const bl = grp(0.55, 1.2, 0);
  bl.add(rbox(M('#6fb8ff', 0.9), 1.8, 0.95, 1.72, 0.2));
  for (let i = 0; i < 7; i++) { const d = ball(M('#ffffff', 0.9), [0.09, 0.09, 0.03], -0.6 + (i % 4) * 0.4 + (i > 3 ? 0.2 : 0), i > 3 ? -0.2 : 0.18, 0.86, true); d.castShadow = false; bl.add(d); }
  const fold = rbox(M('#ffffff', 0.9), 0.3, 0.99, 1.74, 0.14, -0.8, 0, 0); bl.add(fold);
  bl.scale.set(0.001, 0.001, 0.001); bl.visible = false; g.add(bl);
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  g.userData.blanket = bl; g.userData.kind = 'krovatka';
  return g;
}

// ====== ЗВЕЗДА ======
function starGeo(depth = 0.25) {
  const geo = new T.ExtrudeGeometry(drawFig(new T.Shape(), 'zvezda', 1), { depth, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 8 });
  geo.center(); return geo;
}
GEO.star = starGeo();
const MAT_GOLD = new T.MeshStandardMaterial({ color: C('#ffc928'), roughness: 0.3, metalness: 0.1, emissive: C('#ff9800'), emissiveIntensity: 0.25 });
const MAT_PALE = new T.MeshStandardMaterial({ color: C('#c9b299'), roughness: 0.8, transparent: true, opacity: 0.55 });
function mkZvezda(gold = true, s = 1) { const m = mesh(GEO.star, gold ? MAT_GOLD : MAT_PALE); m.scale.setScalar(s); m.castShadow = gold; return m; }

// ====== ВЕДЁРКО С КРАСКОЙ ======
function mkVedro() {
  const g = grp(), met = M('#cfd8dc', 0.35);
  g.add(cyl(met, 0.62, 0.48, 0.9, 0, 0.45, 0, 24));
  const paint = cyl(M('#ffffff', 0.3, {}), 0.56, 0.56, 0.08, 0, 0.88, 0, 24); g.add(paint);
  const hd = mesh(new T.TorusGeometry(0.6, 0.03, 6, 20, Math.PI), M('#78909c', 0.4), 0, 0.85, 0); g.add(hd);
  const br = grp(0.2, 0.9, 0); br.rotation.z = -0.5;
  br.add(cyl(M('#a1784f', 0.7), 0.05, 0.05, 1.1, 0, 0.55, 0, 8));
  const tip = ball(M('#ffffff', 0.4, {}), [0.11, 0.2, 0.11], 0, 1.2, 0); br.add(tip); g.add(br);
  g.userData.paint = [paint.material, tip.material];
  return g;
}
