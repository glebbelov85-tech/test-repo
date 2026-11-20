// Генератор кисти: гладкая поверхность из «слепленных» капсул (SDF + surface nets), веса костей для скиннинга.
// Запуск: node tools/kist_gen.js  -> пишет kist.js рядом с игрой. Правая рука: Y вдоль пальцев, Z из тыльной стороны, большой палец на −X.
const fs = require('fs');
const H = 0.002;
const v3 = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => mul(a, 1 / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 3x3 matrices as arrays of columns
const mm = (A, B) => [0, 1, 2].map((c) => mv(A, B[c]));
function mv(A, v) { return [A[0][0] * v[0] + A[1][0] * v[1] + A[2][0] * v[2], A[0][1] * v[0] + A[1][1] * v[1] + A[2][1] * v[2], A[0][2] * v[0] + A[1][2] * v[1] + A[2][2] * v[2]]; }
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const FINGERS = [
  { x: -0.0305, y: 0.092, L: [0.043, 0.026, 0.022], r: 0.0092, splay: 0.11 },
  { x: -0.0100, y: 0.097, L: [0.047, 0.030, 0.023], r: 0.0094, splay: 0.03 },
  { x: 0.0100, y: 0.093, L: [0.043, 0.028, 0.022], r: 0.0089, splay: -0.05 },
  { x: 0.0285, y: 0.084, L: [0.033, 0.020, 0.020], r: 0.0078, splay: -0.13 },
];
const REST = [0.35, 0.45, 0.3], TREST = [0.25, 0.3];
const THUMB = { p: [-0.029, 0.021, -0.009], dir: norm([-0.62, 0.66, -0.42]), n: [-0.55, -0.25, 0.8], L: [0.042, 0.031, 0.027], r: [0.0138, 0.0118, 0.0105, 0.0093] };

// ---- bones: {name,parent,lp (local pos), lR (local rot), wp, wR} ----
const bones = [{ name: 'palm', parent: -1, lp: [0, 0, 0], lR: I3 }];
function addBone(name, parent, lp, lR) { bones.push({ name, parent, lp, lR }); return bones.length - 1; }
const chains = [];
FINGERS.forEach((f, i) => {
  const b0 = addBone('f' + i + '0', 0, [f.x, f.y, 0.002], mm(Rz(f.splay), Rx(-REST[0])));
  const b1 = addBone('f' + i + '1', b0, [0, f.L[0], 0], Rx(-REST[1]));
  const b2 = addBone('f' + i + '2', b1, [0, f.L[1], 0], Rx(-REST[2]));
  chains.push({ bones: [b0, b1, b2], L: f.L, r: [f.r, f.r * 0.93, f.r * 0.86, f.r * 0.8] });
});
(function () {
  const y = THUMB.dir, z = norm(sub(THUMB.n, mul(y, dot(THUMB.n, y)))), x = cross(y, z);
  const b0 = addBone('t0', 0, THUMB.p, [x, y, z]);
  const b1 = addBone('t1', b0, [0, THUMB.L[0], 0], Rx(-TREST[0]));
  const b2 = addBone('t2', b1, [0, THUMB.L[1], 0], Rx(-TREST[1]));
  chains.push({ bones: [b0, b1, b2], L: THUMB.L, r: THUMB.r, thumb: true });
})();
bones.forEach((b) => { if (b.parent < 0) { b.wp = b.lp; b.wR = b.lR; } else { const p = bones[b.parent]; b.wR = mm(p.wR, b.lR); b.wp = add(p.wp, mv(p.wR, b.lp)); } });

// ---- SDF primitives ----
const prims = []; // {bone, chain, fn}
function capsule(a, b, ra, rb) {
  const ab = sub(b, a), l2 = dot(ab, ab);
  return (p) => { const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)); return len(sub(p, add(a, mul(ab, t)))) - (ra + (rb - ra) * t); };
}
function sphere(c, r) { return (p) => len(sub(p, c)) - r; }
function ellipsoid(c, r) { const m = Math.min(r[0], r[1], r[2]); return (p) => { const q = sub(p, c); return (Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]) - 1) * m; }; }
chains.forEach((ch, ci) => {
  for (let k = 0; k < 3; k++) {
    const b = bones[ch.bones[k]], a = b.wp, e = add(a, mul(b.wR[1], ch.L[k]));
    prims.push({ bone: ch.bones[k], chain: ci, fn: capsule(a, e, ch.r[k], ch.r[k + 1]) });
    // knuckle bump on the back of the joint
    const bump = k === 0 && !ch.thumb ? 1.24 : 1.07;
    prims.push({ bone: ch.bones[k], chain: ci, fn: sphere(add(a, mul(b.wR[2], ch.r[k] * (k === 0 && !ch.thumb ? 0.42 : 0.14))), ch.r[k] * bump) });
    // soft pad on the palm side of the fingertip
    if (k === 2) prims.push({ bone: ch.bones[k], chain: ci, fn: ellipsoid(add(add(a, mul(b.wR[1], ch.L[k] * 0.55)), mul(b.wR[2], -ch.r[k] * 0.22)), [ch.r[k] * 0.98, ch.L[k] * 0.62, ch.r[k] * 0.9]) });
  }
});
// palm group (bone 0)
function palmBox(p) {
  const t = Math.max(0, Math.min(1, p[1] / 0.098)), k = 0.76 + 0.24 * t;
  const q = [Math.abs((p[0] + 0.001) / k) - (0.0425 - 0.012), Math.abs(p[1] - 0.047) - (0.052 - 0.012), Math.abs(p[2] - 0.001 * Math.sin(t * 3.1)) - (0.0148 - 0.011)];
  const o = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0);
  return o - 0.0115;
}
const palmPrims = [palmBox,
  ellipsoid([-0.025, 0.036, -0.0105], [0.021, 0.036, 0.0145]),      // base of the thumb
  ellipsoid([0.0275, 0.04, -0.008], [0.0135, 0.038, 0.012]),         // little-finger edge
  ellipsoid([0.002, 0.082, -0.0085], [0.036, 0.011, 0.008]),         // pads under the fingers
  (p) => { const q = [p[0] / 1.28, p[1], p[2] / 0.84]; return capsule([0, -0.06, 0], [0, 0.006, 0], 0.0215, 0.0235)(q) * 0.84; }, // wrist
  ellipsoid([0.028, -0.012, 0.012], [0.008, 0.009, 0.006]),          // wrist bone bump
];
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function parts(p) {
  let dp = 1e9; for (const f of palmPrims) dp = smin(dp, f(p), 0.006);
  const dc = chains.map(() => 1e9);
  for (const pr of prims) dc[pr.chain] = smin(dc[pr.chain], pr.fn(p), 0.0025);
  return { dp, dc };
}
function sdf(p) {
  const { dp, dc } = parts(p);
  let df = Math.min(dc[0], dc[1], dc[2], dc[3]);
  let d = smin(dp, df, 0.0055);
  d = smin(d, dc[4], 0.009);
  return d;
}
const grad = (p) => { const e = 0.0004; return norm([sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]), sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]), sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e])]); };

// ---- surface nets ----
const B0 = [-0.1, -0.058, -0.085], B1 = [0.062, 0.2, 0.04];   // the wrist is cut open at y = B0[1]
const N = [0, 1, 2].map((i) => Math.ceil((B1[i] - B0[i]) / H) + 1);
const val = new Float32Array(N[0] * N[1] * N[2]);
const gi = (i, j, k) => i + N[0] * (j + N[1] * k);
for (let k = 0; k < N[2]; k++) for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++) val[gi(i, j, k)] = sdf([B0[0] + i * H, B0[1] + j * H, B0[2] + k * H]);
const cellV = new Int32Array(N[0] * N[1] * N[2]).fill(-1), verts = [];
const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let k = 0; k < N[2] - 1; k++) for (let j = 0; j < N[1] - 1; j++) for (let i = 0; i < N[0] - 1; i++) {
  const v = C.map((c) => val[gi(i + c[0], j + c[1], k + c[2])]);
  let neg = 0; for (const x of v) if (x < 0) neg++;
  if (neg === 0 || neg === 8) continue;
  let s = [0, 0, 0], n = 0;
  for (const e of E) { const a = v[e[0]], b = v[e[1]]; if ((a < 0) !== (b < 0)) { const t = a / (a - b); for (let d = 0; d < 3; d++) s[d] += C[e[0]][d] + (C[e[1]][d] - C[e[0]][d]) * t; n++; } }
  cellV[gi(i, j, k)] = verts.length;
  verts.push([B0[0] + (i + s[0] / n) * H, B0[1] + (j + s[1] / n) * H, B0[2] + (k + s[2] / n) * H]);
}
const tris = [];
function quad(a, b, c, d, flip) { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tris.push(a, d, c, a, c, b); else tris.push(a, b, c, a, c, d); }
for (let k = 1; k < N[2] - 1; k++) for (let j = 1; j < N[1] - 1; j++) for (let i = 1; i < N[0] - 1; i++) {
  const a = val[gi(i, j, k)] < 0;
  if (a !== (val[gi(i + 1, j, k)] < 0)) quad(cellV[gi(i, j - 1, k - 1)], cellV[gi(i, j, k - 1)], cellV[gi(i, j, k)], cellV[gi(i, j - 1, k)], !a);
  if (a !== (val[gi(i, j + 1, k)] < 0)) quad(cellV[gi(i - 1, j, k - 1)], cellV[gi(i - 1, j, k)], cellV[gi(i, j, k)], cellV[gi(i, j, k - 1)], !a);
  if (a !== (val[gi(i, j, k + 1)] < 0)) quad(cellV[gi(i - 1, j - 1, k)], cellV[gi(i, j - 1, k)], cellV[gi(i, j, k)], cellV[gi(i - 1, j, k)], !a);
}
// pull the vertices onto the true surface, smooth normals from the field
const nrm = [];
for (let it = 0; it < 3; it++) for (let i = 0; i < verts.length; i++) { const g = grad(verts[i]); verts[i] = sub(verts[i], mul(g, sdf(verts[i]))); if (it === 2) nrm[i] = g; }
// make sure the triangles face outwards
{ const a = verts[tris[0]], b = verts[tris[1]], c = verts[tris[2]]; if (dot(cross(sub(b, a), sub(c, a)), nrm[tris[0]]) < 0) for (let t = 0; t < tris.length; t += 3) { const x = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = x; } }

// ---- skin weights and colours ----
const TAU = 0.0055;
const skinI = new Uint8Array(verts.length * 4), skinW = new Uint8Array(verts.length * 4), col = new Uint8Array(verts.length * 3);
const boneDist = (p) => { const d = new Array(bones.length).fill(1e9); let dp = 1e9; for (const f of palmPrims) dp = Math.min(dp, f(p)); d[0] = dp; for (const pr of prims) d[pr.bone] = Math.min(d[pr.bone], pr.fn(p)); return d; };
for (let i = 0; i < verts.length; i++) {
  const p = verts[i], d = boneDist(p), { dc } = parts(p);
  let ci = 0; for (let c = 1; c < 5; c++) if (dc[c] < dc[ci]) ci = c;
  const inChain = dc[ci] < d[0] + 0.004;
  const cand = [0]; if (inChain) cand.push(...chains[ci].bones); else chains.forEach((ch) => cand.push(ch.bones[0]));
  let dmin = 1e9; for (const b of cand) dmin = Math.min(dmin, d[b]);
  let w = cand.map((b) => [b, Math.pow(Math.max(0, 1 - (d[b] - dmin) / TAU), 2)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = w.reduce((s, x) => s + x[1], 0);
  let acc = 0; for (let k = 0; k < 4; k++) { const x = w[k] || [0, 0]; skinI[i * 4 + k] = x[0]; const q = Math.round((x[1] / sum) * 255); skinW[i * 4 + k] = q; acc += q; }
  skinW[i * 4] += 255 - acc;
  // colour: paler palm, redder knuckles and fingertips, a little uneven
  let c = [196, 138, 108];
  const palmar = nrm[i][2] < -0.2 && !inChain;
  if (palmar) c = [206, 150, 124];
  if (inChain) {
    const ch = chains[ci]; let jd = 1e9; for (let k = 0; k < 3; k++) jd = Math.min(jd, len(sub(p, bones[ch.bones[k]].wp)));
    const tipB = bones[ch.bones[2]], tip = add(tipB.wp, mul(tipB.wR[1], ch.L[2])), td = len(sub(p, tip));
    const dorsal = dot(nrm[i], bones[d[ch.bones[0]] < d[ch.bones[1]] ? ch.bones[0] : d[ch.bones[1]] < d[ch.bones[2]] ? ch.bones[1] : ch.bones[2]].wR[2]);
    const kj = Math.max(0, 1 - jd / 0.014) * Math.max(0, dorsal) * 0.9, kt = Math.max(0, 1 - td / 0.02) * 0.6;
    c = [c[0] - 14 * kj + 4 * kt, c[1] - 30 * kj - 18 * kt, c[2] - 28 * kj - 14 * kt];
  }
  { // darker creases where two fingers meet
    const srt = dc.slice().sort((x, y) => x - y); const gap = srt[1] - srt[0];
    if (inChain && gap < 0.004) { const k = 1 - 0.3 * (1 - gap / 0.004); c = c.map((x) => x * k); }
  }
  const nz = 1 + 0.035 * (Math.sin(p[0] * 700 + p[1] * 300) * Math.sin(p[1] * 520 + p[2] * 610) + 0.5 * Math.sin(p[2] * 1500 + p[0] * 900));
  for (let k = 0; k < 3; k++) col[i * 3 + k] = Math.max(0, Math.min(255, Math.round(c[k] * nz)));
}
const pos = new Float32Array(verts.length * 3), nor = new Int8Array(verts.length * 3);
verts.forEach((v, i) => { pos.set(v, i * 3); for (let k = 0; k < 3; k++) nor[i * 3 + k] = Math.round(nrm[i][k] * 127); });
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const out = {
  n: verts.length, pos: b64(pos), nor: b64(nor), idx: b64(verts.length < 65536 ? new Uint16Array(tris) : new Uint32Array(tris)), idx32: verts.length >= 65536,
  skinI: b64(skinI), skinW: b64(skinW), col: b64(col),
  bones: bones.map((b) => ({ name: b.name, parent: b.parent, p: b.lp.map((x) => +x.toFixed(5)), r: [].concat(...b.lR).map((x) => +x.toFixed(6)) })),
  fingers: chains.slice(0, 4).map((c) => ({ L: c.L, r: c.r })), thumb: { L: THUMB.L, r: THUMB.r }, rest: REST, trest: TREST, splay: FINGERS.map((f) => f.splay),
};
fs.writeFileSync(__dirname + '/../kist.js', '// Сгенерировано tools/kist_gen.js — кисть правой руки (сетка, веса, кости).\nwindow.KIST=' + JSON.stringify(out) + ';\n');
console.log('verts', verts.length, 'tris', tris.length / 3, 'grid', N.join('x'));
