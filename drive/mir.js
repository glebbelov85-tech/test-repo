// Мир за окном: зимний посёлок с сеткой улиц и объездной дорогой. Пока «любая локация»:
// когда появится свой фон, панораму можно положить в fon/nebo.jpg (см. fon/ЧИТАЙ.txt).
(function () {
  'use strict';
  const T = THREE, K = window.KABINA;
  const W = (window.MIR = {});
  const rnd = K.rnd;
  const PITCH = 120, LINES = [-240, -120, 0, 120, 240], HW = 3.6, RING = 430, RHW = 4.6, SHOULDER = 2.4;
  W.FOG = 0xcfd6dc;

  function merge(parts) {
    // parts: [geometry, Matrix4, [r,g,b]?]
    let n = 0; const gs = parts.map((p) => { const g = p[0].index ? p[0].toNonIndexed() : p[0].clone(); g.applyMatrix4(p[1]); n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o = 0;
    gs.forEach((g, i) => {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      const c = (parts[i][2] || [1, 1, 1]).map((v) => Math.pow(v, 2.2));
      for (let k = 0; k < g.attributes.position.count; k++) { col[(o + k) * 3] = c[0]; col[(o + k) * 3 + 1] = c[1]; col[(o + k) * 3 + 2] = c[2]; }
      o += g.attributes.position.count;
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2)); out.setAttribute('color', new T.BufferAttribute(col, 3));
    return out;
  }
  const M4 = (x, y, z, ry, sx, sy, sz, rx, rz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx || 1, sy || 1, sz || 1));

  // ---------- drivable area ----------
  const rects = [];
  for (const l of LINES) {
    const far = l === 0 ? RING : 240 + HW;
    rects.push({ x0: l - HW, x1: l + HW, z0: -far, z1: far, kind: 'street', ns: true });
    rects.push({ x0: -far, x1: far, z0: l - HW, z1: l + HW, kind: 'street', ns: false });
  }
  rects.push({ x0: -RING - RHW, x1: RING + RHW, z0: -RING - RHW, z1: -RING + RHW, kind: 'asphalt', ns: false });
  rects.push({ x0: -RING - RHW, x1: RING + RHW, z0: RING - RHW, z1: RING + RHW, kind: 'asphalt', ns: false });
  rects.push({ x0: -RING - RHW, x1: -RING + RHW, z0: -RING - RHW, z1: RING + RHW, kind: 'asphalt', ns: true });
  rects.push({ x0: RING - RHW, x1: RING + RHW, z0: -RING - RHW, z1: RING + RHW, kind: 'asphalt', ns: true });
  W.rects = rects;
  W.inside = function (x, z, m) {
    for (const r of rects) if (x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m) return true;
    return false;
  };
  W.surface = function (x, z) {
    let s = 'snow';
    for (const r of rects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) { if (r.kind === 'asphalt') return 'asphalt'; s = 'street'; }
    return s;
  };
  W.DRIVE_MARGIN = SHOULDER - 0.9;

  W.build = function (scene, renderer) {
    const world = new T.Group(); scene.add(world);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    // ---------- sky ----------
    const skyMat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { sun: { value: new T.Vector3() }, hor: { value: new T.Color(W.FOG) }, zen: { value: new T.Color(0x8fa6bd) } },
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 d; uniform vec3 sun; uniform vec3 hor; uniform vec3 zen;',
        'void main(){ vec3 n = normalize(d); float h = clamp(n.y,0.0,1.0);',
        ' vec3 c = mix(hor, zen, pow(h,0.55));',
        ' float s = max(dot(n, normalize(sun)),0.0);',
        ' c += vec3(1.0,0.86,0.66) * (pow(s,6.0)*0.28 + pow(s,60.0)*0.5 + pow(s,900.0)*2.0);',
        ' c = mix(c, hor, smoothstep(0.12,0.0,n.y));',
        ' gl_FragColor = vec4(c,1.0);', '#include <tonemapping_fragment>', '#include <encodings_fragment>', '}'].join('\n'),
    });
    const sky = new T.Mesh(new T.SphereGeometry(1800, 32, 16), skyMat); sky.frustumCulled = false; world.add(sky);
    W.sky = sky;
    scene.fog = new T.FogExp2(W.FOG, 0.0042);
    scene.background = new T.Color(W.FOG);

    // ---------- lights ----------
    const sunDir = new T.Vector3(-0.55, 0.36, -0.75).normalize();
    skyMat.uniforms.sun.value.copy(sunDir);
    const hemi = new T.HemisphereLight(0xdfe9f5, 0xb9b3ab, 0.4); scene.add(hemi);
    const sun = new T.DirectionalLight(0xffe7c8, 1.5); scene.add(sun); scene.add(sun.target);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 10; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.5;
    W.sun = sun; W.sunDir = sunDir;
    W.follow = function (p) {
      const g = 4, x = Math.round(p.x / g) * g, z = Math.round(p.z / g) * g;
      sun.target.position.set(x, 0, z); sun.position.set(x, 0, z).addScaledVector(sunDir, 200);
      sky.position.set(p.x, 0, p.z);
    };

    // ---------- ground ----------
    const snowTex = K.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#eef2f6'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const r = 12 + rnd() * 50; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); const a = rnd() < 0.5 ? '205,216,230' : '255,255,255'; gr.addColorStop(0, 'rgba(' + a + ',0.22)'); gr.addColorStop(1, 'rgba(' + a + ',0)'); g.save(); g.translate(rnd() * w, rnd() * h); g.scale(1 + rnd() * 2, 0.6); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore(); }
      for (let i = 0; i < 2500; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + rnd() * 0.5) + ')'; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
    }, { repeat: [220, 220] });
    snowTex.anisotropy = aniso;
    const ground = new T.Mesh(new T.PlaneGeometry(2600, 2600), new T.MeshStandardMaterial({ map: snowTex, roughness: 0.92, color: 0xf4f6f8 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);

    // ---------- roads ----------
    const streetTex = K.canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#8f8a84'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 95 + rnd() * 80; g.fillStyle = 'rgba(' + v + ',' + (v - 3) + ',' + (v - 8) + ',0.35)'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 2 + rnd() * 8); }
      // wheel tracks: darker wet dirt
      for (const cx of [60, 108, 148, 196]) { const gr = g.createLinearGradient(cx - 20, 0, cx + 20, 0); gr.addColorStop(0, 'rgba(70,62,54,0)'); gr.addColorStop(0.5, 'rgba(70,62,54,0.55)'); gr.addColorStop(1, 'rgba(70,62,54,0)'); g.fillStyle = gr; g.fillRect(cx - 20, 0, 40, h); }
      // snow on the edges and a thin strip in the middle
      for (const e of [0, 1]) { const gr = g.createLinearGradient(e ? w : 0, 0, e ? w - 46 : 46, 0); gr.addColorStop(0, 'rgba(240,244,248,1)'); gr.addColorStop(0.55, 'rgba(236,240,244,0.75)'); gr.addColorStop(1, 'rgba(236,240,244,0)'); g.fillStyle = gr; g.fillRect(e ? w - 46 : 0, 0, 46, h); }
      for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(238,242,246,' + (0.2 + rnd() * 0.5) + ')'; g.beginPath(); g.ellipse(128 + (rnd() - 0.5) * 22, rnd() * h, 3 + rnd() * 8, 6 + rnd() * 22, 0, 0, 7); g.fill(); }
      for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(238,242,246,0.5)'; g.beginPath(); g.ellipse(rnd() < 0.5 ? 30 + rnd() * 18 : 208 + rnd() * 18, rnd() * h, 4 + rnd() * 8, 8 + rnd() * 20, 0, 0, 7); g.fill(); }
    });
    const asphTex = K.canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#4a4c50'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 12000; i++) { const v = 50 + rnd() * 60; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',0.4)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      for (const cx of [62, 104, 152, 194]) { const gr = g.createLinearGradient(cx - 16, 0, cx + 16, 0); gr.addColorStop(0, 'rgba(25,26,30,0)'); gr.addColorStop(0.5, 'rgba(25,26,30,0.45)'); gr.addColorStop(1, 'rgba(25,26,30,0)'); g.fillStyle = gr; g.fillRect(cx - 16, 0, 32, h); }
      g.fillStyle = 'rgba(235,235,225,0.85)'; g.fillRect(125, 40, 6, 190); g.fillRect(125, 296, 6, 190);
      g.fillStyle = 'rgba(235,235,225,0.7)'; g.fillRect(22, 0, 5, h); g.fillRect(229, 0, 5, h);
      for (const e of [0, 1]) { const gr = g.createLinearGradient(e ? w : 0, 0, e ? w - 24 : 24, 0); gr.addColorStop(0, 'rgba(240,244,248,1)'); gr.addColorStop(1, 'rgba(236,240,244,0)'); g.fillStyle = gr; g.fillRect(e ? w - 24 : 0, 0, 24, h); }
    });
    for (const tx of [streetTex, asphTex]) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.anisotropy = aniso; }
    const mats = {
      street: new T.MeshStandardMaterial({ map: streetTex, roughness: 0.88 }),
      asphalt: new T.MeshStandardMaterial({ map: asphTex, roughness: 0.55 }),
    };
    rects.forEach((r, i) => {
      const lx = r.x1 - r.x0, lz = r.z1 - r.z0, len = r.ns ? lz : lx, wid = r.ns ? lx : lz;
      const g = new T.PlaneGeometry(wid, len);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (len / (r.kind === 'asphalt' ? 12 : 14)));
      const m = new T.Mesh(g, mats[r.kind]);
      m.rotation.x = -Math.PI / 2; if (!r.ns) m.rotation.z = Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, r.kind === 'asphalt' ? 0.035 : 0.02 + (r.ns ? 0 : 0.006), (r.z0 + r.z1) / 2);
      m.receiveShadow = true; world.add(m);
    });

    // ---------- houses, fences ----------
    const houseTex = [['#6b4a32', '#55381f', 'log'], ['#3f7a5a', '#2f5f47', 'plank'], ['#3b6c9c', '#2c5480', 'plank'], ['#8a3b30', '#74302a', 'brick'], ['#b9a37a', '#a08a62', 'plank']].map((v) => K.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = v[0]; g.fillRect(0, 0, w, h);
      if (v[2] === 'log') for (let y = 0; y < h; y += 26) { const gr = g.createLinearGradient(0, y, 0, y + 26); gr.addColorStop(0, 'rgba(255,220,170,0.16)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(0, y, w, 26); }
      else if (v[2] === 'plank') for (let y = 0; y < h; y += 14) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y + 2, w, 3); }
      else for (let y = 0; y < h; y += 10) for (let x = (y / 10) % 2 ? 0 : 12; x < w; x += 24) { g.strokeStyle = 'rgba(225,205,190,0.35)'; g.lineWidth = 1; g.strokeRect(x, y, 24, 10); }
      for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 20, 1); }
      // three windows with white carved frames in the lower 60 % of the texture
      for (let i = 0; i < 3; i++) {
        const cx = 96 + i * 160, cy = 330;
        g.fillStyle = '#f1f3f5'; g.fillRect(cx - 46, cy - 62, 92, 124);
        g.beginPath(); g.moveTo(cx - 54, cy - 62); g.lineTo(cx, cy - 92); g.lineTo(cx + 54, cy - 62); g.fill();
        g.fillRect(cx - 52, cy + 60, 104, 12);
        g.fillStyle = v[1]; for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(cx + k * 16, cy - 68, 3, 0, 7); g.fill(); }
        const gl = g.createLinearGradient(0, cy - 48, 0, cy + 48); gl.addColorStop(0, '#39485a'); gl.addColorStop(1, '#1b232d'); g.fillStyle = gl; g.fillRect(cx - 34, cy - 48, 68, 96);
        g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(cx - 34, cy - 48); g.lineTo(cx + 6, cy - 48); g.lineTo(cx - 34, cy + 20); g.fill();
        g.fillStyle = '#f1f3f5'; g.fillRect(cx - 2, cy - 48, 4, 96); g.fillRect(cx - 34, cy - 14, 68, 4);
      }
      // attic window in the gable part
      g.fillStyle = '#f1f3f5'; g.fillRect(226, 96, 60, 56); g.fillStyle = '#232c36'; g.fillRect(234, 104, 44, 40); g.fillStyle = '#f1f3f5'; g.fillRect(254, 104, 4, 40);
      // snow line and dark base at the ground
      g.fillStyle = 'rgba(30,25,22,0.5)'; g.fillRect(0, h - 26, w, 26); g.fillStyle = 'rgba(240,244,248,0.9)'; g.fillRect(0, h - 9, w, 9);
    }));
    function houseGeo() {
      // unit house: x ±0.5 (length), z ±0.5 (depth), walls 0..1, gable up to 1.55
      const pos = [], uv = [], nor = [];
      const quad = (a, b, c, d, n, uvs) => { [a, b, c, a, c, d].forEach((p) => pos.push(p[0], p[1], p[2])); [0, 1, 2, 0, 2, 3].forEach((i) => uv.push(uvs[i][0], uvs[i][1])); for (let i = 0; i < 6; i++) nor.push(n[0], n[1], n[2]); };
      const U = [[0, 0], [1, 0], [1, 0.6], [0, 0.6]];
      quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], [0, 0, 1], U);
      quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0, 0, -1], U);
      for (const s of [1, -1]) {
        const x = 0.5 * s, n = [s, 0, 0];
        quad([x, 0, 0.5 * s], [x, 0, -0.5 * s], [x, 1, -0.5 * s], [x, 1, 0.5 * s], n, [[0.02, 0], [0.98, 0], [0.98, 0.6], [0.02, 0.6]]);
        [[x, 1, 0.5 * s], [x, 1, -0.5 * s], [x, 1.55, 0]].forEach((p) => pos.push(p[0], p[1], p[2]));
        uv.push(0.02, 0.6, 0.98, 0.6, 0.5, 0.93); for (let i = 0; i < 3; i++) nor.push(n[0], n[1], n[2]);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      return g;
    }
    const roofGeo = (function () {
      const slope = Math.atan2(0.55, 0.5), L = Math.hypot(0.55, 0.5) * 1.16;
      const b = new T.BoxGeometry(1.12, 0.09, L);
      return merge([
        [b, M4(0, 1.3, 0.27, 0, 1, 1, 1, slope), [0.97, 0.98, 1]], [b, M4(0, 1.3, -0.27, 0, 1, 1, 1, -slope), [0.97, 0.98, 1]],
        [new T.BoxGeometry(0.09, 0.5, 0.14), M4(0.2, 1.55, 0.08), [0.55, 0.3, 0.25]], [new T.BoxGeometry(0.11, 0.05, 0.17), M4(0.2, 1.82, 0.08), [0.97, 0.98, 1]],
      ]);
    })();
    const lots = [];
    const edge = HW + SHOULDER;
    for (let bi = 0; bi < 4; bi++) for (let bj = 0; bj < 4; bj++) {
      const x0 = LINES[bi] + edge, x1 = LINES[bi + 1] - edge, z0 = LINES[bj] + edge, z1 = LINES[bj + 1] - edge;
      const n = 5, span = (x1 - x0) / n;
      for (let k = 0; k < n; k++) {
        const c = x0 + (k + 0.5) * span;
        lots.push({ x: c, z: z0, dx: 0, dz: 1, w: span }); lots.push({ x: c, z: z1, dx: 0, dz: -1, w: span });
        if (k > 0 && k < n - 1) { const cz = z0 + (k + 0.5) * span; lots.push({ x: x0, z: cz, dx: 1, dz: 0, w: span }); lots.push({ x: x1, z: cz, dx: -1, dz: 0, w: span }); }
      }
    }
    const hG = houseGeo(), dummy = new T.Object3D();
    const perTex = houseTex.map(() => []);
    const roofs = [], fences = [], trees = [], firs = [];
    const fenceCols = [0x6d2f2f, 0x2f6b4f, 0x2c5f9e, 0x7a7168, 0x5b4030, 0x1f7f7a, 0x8d8f92, 0x4a5a35];
    for (const l of lots) {
      const ry = Math.atan2(l.dx, l.dz);       // house front (+z of the unit house) faces the street
      const along = [l.dz, -l.dx];
      // fence with a gap for the gate
      const col = fenceCols[Math.floor(rnd() * fenceCols.length)], fh = 1.5 + rnd() * 0.5;
      const gate = (rnd() - 0.5) * (l.w - 8);
      for (const seg of [[-l.w / 2, gate - 1.7], [gate + 1.7, l.w / 2]]) {
        const c = (seg[0] + seg[1]) / 2, len = seg[1] - seg[0];
        fences.push({ x: l.x + along[0] * c, z: l.z + along[1] * c, ry: ry, len: len, h: fh, col: col });
      }
      fences.push({ x: l.x + along[0] * gate, z: l.z + along[1] * gate, ry: ry, len: 3.4, h: fh + 0.25, col: 0x3a3230, gate: true });
      if (rnd() < 0.88) {
        const hw = 7 + rnd() * 3.5, hd = 6 + rnd() * 2, hh = 2.9 + rnd() * 0.6, back = 5.5 + rnd() * 5, sh = (rnd() - 0.5) * (l.w - hw - 3);
        const hx = l.x + l.dx * (back + hd / 2) + along[0] * sh, hz = l.z + l.dz * (back + hd / 2) + along[1] * sh;
        dummy.position.set(hx, 0, hz); dummy.rotation.set(0, ry, 0); dummy.scale.set(hw, hh, hd); dummy.updateMatrix();
        perTex[Math.floor(rnd() * houseTex.length)].push(dummy.matrix.clone()); roofs.push(dummy.matrix.clone());
      }
      const nt = Math.floor(rnd() * 3);
      for (let i = 0; i < nt; i++) {
        const d = 3 + rnd() * 30, s = (rnd() - 0.5) * l.w;
        (rnd() < 0.3 ? firs : trees).push({ x: l.x + l.dx * d + along[0] * s, z: l.z + l.dz * d + along[1] * s, s: 0.8 + rnd() * 0.7 });
      }
    }
    perTex.forEach((list, i) => {
      if (!list.length) return;
      const im = new T.InstancedMesh(hG, new T.MeshStandardMaterial({ map: houseTex[i], roughness: 0.9 }), list.length);
      list.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = true; im.receiveShadow = true; world.add(im);
    });
    const roofM = new T.InstancedMesh(roofGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), roofs.length);
    roofs.forEach((m, k) => roofM.setMatrixAt(k, m)); roofM.castShadow = true; world.add(roofM);
    const fenceTex = K.canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 2, h); g.fillStyle = 'rgba(255,255,255,' + rnd() * 0.25 + ')'; g.fillRect(x + 2, 0, 14, h); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 14, w, 3); g.fillRect(0, 46, w, 3);
      g.fillStyle = '#f2f5f8'; g.fillRect(0, 0, w, 4);
    });
    fenceTex.wrapS = T.RepeatWrapping;
    const fG = new T.BoxGeometry(1, 1, 0.07); fG.translate(0, 0.5, 0);
    const fM = new T.InstancedMesh(fG, new T.MeshStandardMaterial({ map: fenceTex, roughness: 0.85 }), fences.length);
    const cc = new T.Color();
    fences.forEach((f, k) => { dummy.position.set(f.x, 0, f.z); dummy.rotation.set(0, f.ry, 0); dummy.scale.set(f.len, f.h, f.gate ? 1.6 : 1); dummy.updateMatrix(); fM.setMatrixAt(k, dummy.matrix); fM.setColorAt(k, cc.setHex(f.col).convertSRGBToLinear()); });
    fM.castShadow = true; fM.receiveShadow = true; world.add(fM);

    // ---------- snow banks along the streets ----------
    const banks = [];
    for (const r of rects) {
      const len = r.ns ? r.z1 - r.z0 : r.x1 - r.x0, half = (r.ns ? r.x1 - r.x0 : r.z1 - r.z0) / 2 + SHOULDER * 0.75;
      for (let d = 0; d < len; d += 3.2) for (const s of [1, -1]) {
        const a = (r.ns ? r.z0 : r.x0) + d + rnd() * 2, c = (r.ns ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2) + s * (half + rnd() * 0.6);
        const x = r.ns ? c : a, z = r.ns ? a : c;
        // no banks where another road crosses
        let cross = false; for (const q of rects) if (q !== r && x > q.x0 - 1 && x < q.x1 + 1 && z > q.z0 - 1 && z < q.z1 + 1) { cross = true; break; }
        if (!cross) banks.push({ x: x, z: z, sx: r.ns ? 1.1 + rnd() : 2.2 + rnd() * 1.5, sz: r.ns ? 2.2 + rnd() * 1.5 : 1.1 + rnd(), sy: 0.35 + rnd() * 0.45 });
      }
    }
    const bM = new T.InstancedMesh(new T.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0xf1f4f7, roughness: 0.95 }), banks.length);
    banks.forEach((b, k) => { dummy.position.set(b.x, -0.02, b.z); dummy.rotation.set(0, rnd() * 3, 0); dummy.scale.set(b.sx, b.sy, b.sz); dummy.updateMatrix(); bM.setMatrixAt(k, dummy.matrix); });
    bM.receiveShadow = true; world.add(bM);

    // ---------- utility poles and wires ----------
    const poleGeo = merge([
      [new T.CylinderGeometry(0.09, 0.12, 8, 8), M4(0, 4, 0), [0.36, 0.3, 0.25]],
      [new T.BoxGeometry(1.5, 0.1, 0.1), M4(0, 7.4, 0), [0.3, 0.25, 0.2]],
      [new T.BoxGeometry(1.52, 0.04, 0.12), M4(0, 7.47, 0), [0.95, 0.96, 0.98]],
      [new T.CylinderGeometry(0.03, 0.03, 0.14, 6), M4(-0.6, 7.52, 0), [0.8, 0.82, 0.8]], [new T.CylinderGeometry(0.03, 0.03, 0.14, 6), M4(0.6, 7.52, 0), [0.8, 0.82, 0.8]],
    ]);
    const poles = [], wire = [];
    for (const l of LINES) for (const ns of [true, false]) {
      let prev = null;
      for (let d = -220; d <= 220; d += 40) {
        if (LINES.some((q) => Math.abs(d - q) < 8)) { prev = null; continue; }
        const off = l + HW + 1.4, x = ns ? off : d, z = ns ? d : off;
        poles.push({ x: x, z: z, ry: ns ? 0 : Math.PI / 2 });
        if (prev) for (const s of [-0.6, 0.6]) {
          const ax = ns ? prev.x + s : prev.x, az = ns ? prev.z : prev.z + s, bx = ns ? x + s : x, bz = ns ? z : z + s;
          wire.push(ax, 7.55, az, (ax + bx) / 2, 7.05, (az + bz) / 2, (ax + bx) / 2, 7.05, (az + bz) / 2, bx, 7.55, bz);
        }
        prev = { x: x, z: z };
      }
    }
    const pM = new T.InstancedMesh(poleGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), poles.length);
    poles.forEach((p, k) => { dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.ry, (rnd() - 0.5) * 0.04); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); pM.setMatrixAt(k, dummy.matrix); });
    pM.castShadow = true; world.add(pM);
    const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wire, 3));
    world.add(new T.LineSegments(wg, new T.LineBasicMaterial({ color: 0x2a2c30, transparent: true, opacity: 0.7 })));

    // ---------- trees ----------
    const treeTex = K.canvasTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.lineCap = 'round';
      const br = (x, y, a, len, wd, dep) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.strokeStyle = dep > 3 ? '#3a3230' : dep > 1 ? '#5a5250' : '#dfe6ee'; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
        if (dep > 3) { g.strokeStyle = 'rgba(240,244,250,0.75)'; g.lineWidth = Math.max(1, wd * 0.3); g.beginPath(); g.moveTo(x - wd * 0.2, y); g.lineTo(x2 - wd * 0.2, y2); g.stroke(); }
        if (dep <= 0) return;
        const n = dep > 4 ? 3 : 2 + (rnd() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) br(x2, y2, a + (rnd() - 0.5) * 1.3, len * (0.62 + rnd() * 0.2), Math.max(0.7, wd * 0.62), dep - 1);
      };
      br(128, 256, -Math.PI / 2, 62, 11, 6);
    });
    const tp = new T.PlaneGeometry(7, 9); tp.translate(0, 4.5, 0);
    const treeGeo = merge([[tp, M4(0, 0, 0)], [tp, M4(0, 0, 0, Math.PI / 2)]]);
    for (let i = 0; i < 420; i++) {            // fields between the village and the ring road, and beyond
      const a = rnd() * 6.283, far = rnd() < 0.5, d = far ? RING + 14 + rnd() * 160 : 262 + rnd() * (RING - 280);
      let x = Math.cos(a) * d * 1.3, z = Math.sin(a) * d * 1.3;
      x = Math.max(-RING - 170, Math.min(RING + 170, x)); z = Math.max(-RING - 170, Math.min(RING + 170, z));
      if (W.inside(x, z, 7) || (Math.abs(x) < 256 && Math.abs(z) < 256)) continue;
      (rnd() < (far ? 0.7 : 0.35) ? firs : trees).push({ x: x, z: z, s: 0.9 + rnd() * 0.9 });
    }
    for (let i = 0; i < 700; i++) {            // forest wall behind the ring road
      const side = Math.floor(rnd() * 4), t = (rnd() * 2 - 1) * (RING + 150), d = RING + 12 + rnd() * rnd() * 150;
      const x = side === 0 ? t : side === 1 ? t : side === 2 ? d : -d, z = side === 0 ? d : side === 1 ? -d : t;
      firs.push({ x: x, z: z, s: 1 + rnd() * 1.1 });
    }
    const tM = new T.InstancedMesh(treeGeo, new T.MeshStandardMaterial({ map: treeTex, alphaTest: 0.35, side: T.DoubleSide, roughness: 1 }), trees.length);
    trees.forEach((t, k) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, rnd() * 3, 0); dummy.scale.set(t.s, t.s, t.s); dummy.updateMatrix(); tM.setMatrixAt(k, dummy.matrix); });
    tM.castShadow = true; world.add(tM);
    tM.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: treeTex, alphaTest: 0.35 });
    const firGeo = merge([
      [new T.CylinderGeometry(0.12, 0.16, 1.2, 6), M4(0, 0.6, 0), [0.25, 0.2, 0.16]],
      [new T.ConeGeometry(1.7, 2.6, 9), M4(0, 2.1, 0), [0.16, 0.27, 0.2]], [new T.ConeGeometry(1.75, 0.5, 9), M4(0, 2.62, 0, 0, 0.8, 1, 0.8), [0.93, 0.95, 0.98]],
      [new T.ConeGeometry(1.3, 2.3, 9), M4(0, 3.5, 0), [0.17, 0.29, 0.21]], [new T.ConeGeometry(1.35, 0.45, 9), M4(0, 3.95, 0, 0, 0.8, 1, 0.8), [0.93, 0.95, 0.98]],
      [new T.ConeGeometry(0.85, 2.0, 9), M4(0, 4.9, 0), [0.19, 0.31, 0.23]], [new T.ConeGeometry(0.6, 1.2, 9), M4(0, 5.45, 0), [0.93, 0.95, 0.98]],
    ]);
    const fiM = new T.InstancedMesh(firGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), firs.length);
    firs.forEach((t, k) => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, rnd() * 3, 0); dummy.scale.set(t.s, t.s * (0.9 + rnd() * 0.4), t.s); dummy.updateMatrix(); fiM.setMatrixAt(k, dummy.matrix); });
    fiM.castShadow = true; world.add(fiM);

    // ---------- falling snow ----------
    const NS = 1600, sp = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { sp[i * 3] = (rnd() - 0.5) * 60; sp[i * 3 + 1] = rnd() * 22; sp[i * 3 + 2] = (rnd() - 0.5) * 60; }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    const flake = K.canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
    const snow = new T.Points(sg, new T.PointsMaterial({ map: flake, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, color: 0xffffff }));
    snow.frustumCulled = false; world.add(snow);
    W.snowUpdate = function (dt, cam, vx, vz) {
      for (let i = 0; i < NS; i++) {
        let x = sp[i * 3], y = sp[i * 3 + 1] - dt * (0.9 + (i % 7) * 0.08), z = sp[i * 3 + 2];
        x += dt * 0.4 * Math.sin(i + y);
        if (y < 0) y += 22;
        const dx = x - cam.x, dz = z - cam.z;
        if (dx > 30) x -= 60; else if (dx < -30) x += 60;
        if (dz > 30) z -= 60; else if (dz < -30) z += 60;
        sp[i * 3] = x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = z;
      }
      sg.attributes.position.needsUpdate = true;
    };

    // ---------- own backdrop: fon/nebo.jpg (equirectangular panorama) ----------
    W.tryPanorama = function (url) {
      const img = new Image();
      img.onload = function () {
        const tx = new T.Texture(img); tx.encoding = T.sRGBEncoding; tx.needsUpdate = true;
        sky.material = new T.MeshBasicMaterial({ map: tx, side: T.BackSide, fog: false, depthWrite: false });
        sky.scale.x = -1;
      };
      img.src = url;
    };
    return world;
  };
})();
