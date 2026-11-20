// Кабина: праворульный минивэн 90-х, собранный по кадрам из видео.
// Координаты кабины: x вправо, y вверх от пола, z назад (вперёд по ходу = −z). Водитель справа, x = +0.37.
(function () {
  'use strict';
  const T = THREE;
  const K = (window.KABINA = {});
  const DRV_X = 0.37;
  K.DRV_X = DRV_X;
  K.EYE = new T.Vector3(DRV_X, 1.17, 0.06);
  K.WHEEL_C = new T.Vector3(DRV_X, 0.80, -0.40);
  K.WHEEL_TILT = (25 * Math.PI) / 180;
  K.WHEEL_R = 0.19;
  K.TUBE_R = 0.0165;

  // ---------- helpers ----------
  function canvasTex(w, h, draw, o) {
    o = o || {};
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = o.data ? T.LinearEncoding : T.sRGBEncoding;
    t.anisotropy = 8;
    if (o.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    return t;
  }
  K.canvasTex = canvasTex;
  let seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  K.rnd = rnd;
  function noiseTex(size, lo, hi, rep, blur) {
    return canvasTex(size, size, (g, w, h) => {
      const im = g.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = lo + rnd() * (hi - lo);
        im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      if (blur) { g.filter = 'blur(' + blur + 'px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none'; }
    }, { data: true, repeat: [rep, rep] });
  }
  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function bump(x, c, hw, soft) { return 1 - smooth(hw - soft, hw + soft, Math.abs(x - c)); }
  K.smooth = smooth;

  // surface from a function (u,v) -> Vector3
  function gridSurf(nu, nv, fn) {
    const pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = new Float32Array((nu + 1) * (nv + 1) * 2), idx = [];
    const p = new T.Vector3();
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      fn(i / nu, j / nv, p);
      const k = i * (nv + 1) + j;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv;
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  K.gridSurf = gridSurf;

  // rounded box: box vertices pulled onto a rounded shell
  function sbox(w, h, d, r, seg) {
    seg = seg || 8;
    const g = new T.BoxGeometry(w, h, d, seg, seg, seg);
    const p = g.attributes.position, n = g.attributes.normal;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    const v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(c);
      if (v.lengthSq() < 1e-12) v.fromBufferAttribute(n, i);
      v.normalize();
      n.setXYZ(i, v.x, v.y, v.z);
      p.setXYZ(i, c.x + v.x * r, c.y + v.y * r, c.z + v.z * r);
    }
    return g;
  }
  K.sbox = sbox;

  // capsule along +Y from y=0 to y=len, radius r1 at the bottom, r2 at the top
  function capsule(r1, r2, len, seg) {
    seg = seg || 12;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new T.Vector2(Math.cos(a) * r1, Math.sin(a) * r1)); }
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push(new T.Vector2(Math.cos(a) * r2, len + Math.sin(a) * r2)); }
    return new T.LatheGeometry(pts, seg);
  }
  K.capsule = capsule;

  function roundedShape(w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function plate(w, h, r, depth, bevel) {
    return new T.ExtrudeGeometry(roundedShape(w, h, r), { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  }

  K.build = function (env) {
    const cab = new T.Group();
    const add = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); (parent || cab).add(m); return m; };

    // ---------- materials ----------
    const grain = noiseTex(256, 90, 170, 14, 0.6);
    const fineGrain = noiseTex(256, 100, 160, 30, 0);
    const fabricTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#6c6d6f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 80 + rnd() * 60; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 4) + ',0.5)'; g.fillRect(rnd() * w, rnd() * h, 2, 1); }
      for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(40,40,40,0.10)'; g.fillRect(0, y, w, 1); }
    }, { repeat: [6, 6] });
    const M = {
      dash: new T.MeshStandardMaterial({ color: 0x5c5753, roughness: 0.82, metalness: 0, bumpMap: grain, bumpScale: 0.0009, side: T.DoubleSide }),
      dashDark: new T.MeshStandardMaterial({ color: 0x35373a, roughness: 0.8, bumpMap: grain, bumpScale: 0.0008 }),
      trim: new T.MeshStandardMaterial({ color: 0x8c8a84, roughness: 0.85, bumpMap: grain, bumpScale: 0.0007, side: T.DoubleSide }),
      door: new T.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.86, bumpMap: grain, bumpScale: 0.0007, side: T.DoubleSide }),
      piano: new T.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.16, metalness: 0.1, envMapIntensity: 1.3 }),
      black: new T.MeshStandardMaterial({ color: 0x111213, roughness: 0.6 }),
      rubber: new T.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 }),
      wheel: new T.MeshStandardMaterial({ color: 0x34383a, roughness: 0.7, bumpMap: grain, bumpScale: 0.0008 }),
      leather: new T.MeshStandardMaterial({ color: 0x18191b, roughness: 0.55, bumpMap: fineGrain, bumpScale: 0.0006 }),
      chrome: new T.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.18, metalness: 1 }),
      satin: new T.MeshStandardMaterial({ color: 0x8b8e92, roughness: 0.4, metalness: 0.8 }),
      fabric: new T.MeshStandardMaterial({ color: 0xa9a9a9, map: fabricTex, roughness: 0.95 }),
      head: new T.MeshStandardMaterial({ color: 0x9d9a92, roughness: 0.97, bumpMap: fineGrain, bumpScale: 0.0005, side: T.DoubleSide }),
      carpet: new T.MeshStandardMaterial({ color: 0x1d1e20, roughness: 1 }),
      body: new T.MeshStandardMaterial({ color: 0xeef0f1, roughness: 0.32, metalness: 0.1 }),
      glass: new T.MeshPhysicalMaterial({ color: 0xcfe0e6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.085, envMapIntensity: 1.2, depthWrite: false, side: T.DoubleSide }),
      pants: new T.MeshStandardMaterial({ color: 0x101114, roughness: 0.93, bumpMap: fineGrain, bumpScale: 0.0005 }),
    };
    K.M = M;

    // ---------- dashboard ----------
    function dashPts(x) {
      const dB = bump(x, DRV_X, 0.30, 0.14), dC = bump(x, DRV_X, 0.205, 0.045), dK = bump(x, -0.11, 0.205, 0.08);
      const side = Math.pow(Math.min(1, Math.abs(x) / 0.78), 6);
      const p = [[-1.37, 0.83], [-1.23, 0.895], [-0.96, 0.905], [-0.75, 0.895], [-0.63, 0.868], [-0.585, 0.80], [-0.578, 0.70], [-0.60, 0.56], [-0.67, 0.44], [-0.82, 0.33]];
      p[2][1] += 0.02 * dB; p[3][1] += 0.04 * dB; p[3][0] += 0.03 * dB; p[4][1] += 0.045 * dB; p[4][0] += 0.05 * dB;
      const cav = [[-0.593, 0.868], [-0.725, 0.842], [-0.69, 0.662], [-0.615, 0.632]];
      for (let i = 0; i < 4; i++) { p[5 + i][0] += (cav[i][0] - p[5 + i][0]) * dC; p[5 + i][1] += (cav[i][1] - p[5 + i][1]) * dC; }
      for (let i = 4; i <= 8; i++) p[i][0] += 0.055 * dK * (i === 4 ? 0.5 : 1);
      p[3][1] += 0.008 * dK;
      for (let i = 1; i <= 4; i++) p[i][1] -= 0.02 * side;
      return p;
    }
    const NV = 64;
    const cols = [];
    const dashGeo = gridSurf(96, NV, (u, v, out) => {
      const x = -0.79 + 1.58 * u, ci = Math.round(u * 96);
      if (!cols[ci]) {
        const c = new T.CatmullRomCurve3(dashPts(x).map((q) => new T.Vector3(0, q[1], q[0])), false, 'centripetal');
        cols[ci] = c.getSpacedPoints(NV);
      }
      const q = cols[ci][Math.round(v * NV)];
      out.set(x, q.y, q.z);
    });
    const dash = add(dashGeo, M.dash);
    dash.receiveShadow = true;
    // lower dash / knee area
    add(sbox(1.56, 0.34, 0.30, 0.05), M.dashDark, 0, 0.30, -0.93);

    // ---------- instrument cluster ----------
    const clW = 0.375, clH = 0.158;
    const faceTex = canvasTex(1024, 432, drawCluster);
    const clG = new T.Group();
    clG.position.set(DRV_X, 0.752, -0.698);
    clG.rotation.x = -0.19;
    cab.add(clG);
    add(new T.PlaneGeometry(clW + 0.05, clH + 0.03), M.black, 0, 0, -0.002, clG);
    const faceMat = new T.MeshStandardMaterial({ map: faceTex, roughness: 0.75, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.05 });
    add(new T.PlaneGeometry(clW, clH), faceMat, 0, 0, 0, clG);
    K.faceMat = faceMat;
    function needle(len, w, color) {
      const g = new T.Group();
      const s = new T.Shape(); s.moveTo(-w, -len * 0.18); s.lineTo(w, -len * 0.18); s.lineTo(w * 0.35, len); s.lineTo(-w * 0.35, len);
      const m = new T.Mesh(new T.ShapeGeometry(s), new T.MeshBasicMaterial({ color: color }));
      m.position.z = 0.003; g.add(m);
      const cap = new T.Mesh(new T.CylinderGeometry(w * 3.2, w * 3.6, 0.004, 20), M.black);
      cap.rotation.x = Math.PI / 2; cap.position.z = 0.004; g.add(cap);
      return g;
    }
    const px = (X) => (X / 1024 - 0.5) * clW, py = (Y) => (0.5 - Y / 432) * clH;
    K.nSpeed = needle(0.058, 0.0016, 0xff5a1f); K.nSpeed.position.set(px(CL.sp.x), py(CL.sp.y), 0); clG.add(K.nSpeed);
    K.nTach = needle(0.03, 0.0013, 0xff3b1a); K.nTach.position.set(px(CL.ta.x), py(CL.ta.y), 0); clG.add(K.nTach);
    K.nFuel = needle(0.02, 0.001, 0xff5a1f); K.nFuel.position.set(px(CL.fu.x), py(CL.fu.y), 0); clG.add(K.nFuel);
    K.nTemp = needle(0.02, 0.001, 0xff5a1f); K.nTemp.position.set(px(CL.te.x), py(CL.te.y), 0); clG.add(K.nTemp);
    K.nFuel.rotation.z = 0.5; K.nTemp.rotation.z = -0.35 + Math.PI;
    // indicator lamps
    function lamp(X, Y, draw, color) {
      const tx = canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; draw(g); });
      const m = new T.Mesh(new T.PlaneGeometry(0.013, 0.013), new T.MeshBasicMaterial({ map: tx, color: color, transparent: true, opacity: 0.06 }));
      m.position.set(px(X), py(Y), 0.002); clG.add(m); return m.material;
    }
    const arrow = (dir) => (g) => { g.beginPath(); g.moveTo(32 - 26 * dir, 32); g.lineTo(32 + 2 * dir, 6); g.lineTo(32 + 2 * dir, 20); g.lineTo(32 + 26 * dir, 20); g.lineTo(32 + 26 * dir, 44); g.lineTo(32 + 2 * dir, 44); g.lineTo(32 + 2 * dir, 58); g.fill(); };
    K.lampL = lamp(388, 84, arrow(1), 0x35ff5a);
    K.lampR = lamp(640, 84, arrow(-1), 0x35ff5a);
    K.lampBrake = lamp(250, 330, (g) => { g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.stroke(); g.fillRect(29, 18, 6, 18); g.fillRect(29, 41, 6, 6); }, 0xff3020);
    // gear letter display
    const gearC = document.createElement('canvas'); gearC.width = 128; gearC.height = 64;
    const gearT = new T.CanvasTexture(gearC); gearT.encoding = T.sRGBEncoding;
    const gm = new T.Mesh(new T.PlaneGeometry(0.044, 0.022), new T.MeshBasicMaterial({ map: gearT }));
    gm.position.set(px(CL.sp.x), py(352), 0.002); clG.add(gm);
    K.setGear = function (g) {
      const c = gearC.getContext('2d'); c.fillStyle = '#0a0d0a'; c.fillRect(0, 0, 128, 64);
      c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      ['P', 'R', 'N', 'D'].forEach((L, i) => { c.fillStyle = L === g ? '#ffb23a' : '#3a3f3a'; c.fillText(L, 19 + i * 30, 34); });
      gearT.needsUpdate = true;
    };
    K.setGear('D');
    // lens
    const lens = add(new T.PlaneGeometry(clW + 0.04, clH + 0.02), new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.05, depthWrite: false }), 0, 0, 0.022, clG);
    lens.rotation.x = 0.12;

    // ---------- centre console ----------
    const cs = new T.Group(); cs.position.set(-0.11, 0.715, -0.522); cs.rotation.x = -0.07; cab.add(cs);
    (function () {
      const s = new T.Shape();
      s.moveTo(-0.15, -0.125); s.quadraticCurveTo(-0.185, -0.12, -0.19, -0.06); s.lineTo(-0.2, 0.09);
      s.quadraticCurveTo(-0.2, 0.15, -0.12, 0.158); s.lineTo(0.12, 0.158); s.quadraticCurveTo(0.2, 0.15, 0.2, 0.09);
      s.lineTo(0.19, -0.06); s.quadraticCurveTo(0.185, -0.12, 0.15, -0.125); s.lineTo(-0.15, -0.125);
      const g = new T.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 4, curveSegments: 14 });
      add(g, M.piano, 0, 0, 0, cs);
    })();
    // head unit sticking out of the panel, as in the video
    const hu = new T.Group(); hu.position.set(0.0, 0.058, 0.02); cs.add(hu);
    add(sbox(0.2, 0.118, 0.07, 0.006, 3), M.black, 0, 0, 0.02, hu);
    const scrTex = canvasTex(256, 144, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#4a3630'); gr.addColorStop(0.5, '#33262a'); gr.addColorStop(1, '#1d181d');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.55, 0); g.lineTo(w * 0.25, h); g.lineTo(0, h); g.fill();
    });
    add(new T.PlaneGeometry(0.168, 0.094), new T.MeshStandardMaterial({ map: scrTex, roughness: 0.12, metalness: 0.2, envMapIntensity: 1.5 }), -0.006, 0.004, 0.0556, hu);
    add(new T.BoxGeometry(0.004, 0.118, 0.085), M.satin, 0.102, 0, 0.012, hu);
    add(new T.BoxGeometry(0.004, 0.118, 0.085), M.satin, -0.102, 0, 0.012, hu);
    add(new T.BoxGeometry(0.19, 0.008, 0.004), M.satin, 0, -0.054, 0.056, hu);
    add(new T.CylinderGeometry(0.008, 0.008, 0.04, 12), M.chrome, 0.112, -0.02, 0.03, hu);
    add(new T.BoxGeometry(0.15, 0.02, 0.01), M.black, 0, -0.03, 0.02, cs); // slot under the unit
    function vent(w, h, parent, x, y, z, slats) {
      const g = new T.Group(); g.position.set(x, y, z); parent.add(g);
      add(new T.BoxGeometry(w, h, 0.004), M.rubber, 0, 0, 0, g);
      for (let i = 0; i < slats; i++) { const s = add(new T.BoxGeometry(w * 0.94, 0.0035, 0.016), M.dashDark, 0, -h / 2 + ((i + 0.5) / slats) * h, 0.006, g); s.rotation.x = 0.5; }
      add(new T.BoxGeometry(0.005, h, 0.014), M.dashDark, 0, 0, 0.008, g);
      return g;
    }
    vent(0.12, 0.05, cs, -0.105, -0.075, 0.02, 5);
    vent(0.12, 0.05, cs, 0.105, -0.075, 0.02, 5);
    // hazard pod
    const hz = new T.Group(); hz.position.set(0.155, 0.80, -0.575); hz.rotation.x = -0.25; cab.add(hz);
    const pod = add(new T.SphereGeometry(0.05, 24, 16), M.piano, 0, 0, -0.012, hz); pod.scale.set(1.25, 0.62, 0.34);
    const hzTex = canvasTex(64, 64, (g) => { g.fillStyle = '#7d1512'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#ffd9d0'; g.lineWidth = 4; g.beginPath(); g.moveTo(32, 14); g.lineTo(52, 48); g.lineTo(12, 48); g.closePath(); g.stroke(); });
    K.hazMat = new T.MeshStandardMaterial({ map: hzTex, roughness: 0.4, emissive: 0xff2200, emissiveMap: hzTex, emissiveIntensity: 0.1 });
    add(new T.BoxGeometry(0.03, 0.02, 0.012), K.hazMat, 0, 0, 0.006, hz);
    // climate panel
    const cl = new T.Group(); cl.position.set(-0.11, 0.515, -0.55); cl.rotation.x = -0.32; cab.add(cl);
    add(plate(0.33, 0.085, 0.02, 0.006, 0.004), M.dashDark, 0, 0, 0, cl);
    for (let i = 0; i < 3; i++) {
      const kx = -0.02 + i * 0.075;
      const k = add(new T.CylinderGeometry(0.022, 0.025, 0.022, 28), M.black, kx, 0, 0.02, cl); k.rotation.x = Math.PI / 2;
      const k2 = add(new T.CylinderGeometry(0.012, 0.014, 0.016, 20), M.dashDark, kx, 0, 0.036, cl); k2.rotation.x = Math.PI / 2;
      add(new T.BoxGeometry(0.003, 0.012, 0.002), new T.MeshBasicMaterial({ color: 0xdddddd }), kx, 0.014, 0.0315, cl);
    }
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) add(sbox(0.026, 0.018, 0.01, 0.003, 2), M.black, -0.135 + i * 0.032, -0.012 + j * 0.024, 0.012, cl);
    // side vents and the small round cap on the passenger side
    const vL = vent(0.11, 0.055, cab, -0.64, 0.79, -0.575, 5); vL.rotation.x = -0.1;
    const vR = vent(0.07, 0.085, cab, 0.69, 0.775, -0.575, 7); vR.rotation.x = -0.1;
    const cap1 = add(new T.CylinderGeometry(0.022, 0.024, 0.012, 24), M.dashDark, -0.47, 0.82, -0.585); cap1.rotation.x = Math.PI / 2 - 0.3;
    const cap2 = add(new T.CylinderGeometry(0.02, 0.022, 0.014, 24), M.black, 0.685, 0.855, -0.565); cap2.rotation.x = Math.PI / 2 - 0.3;
    // lid of the compartment on top of the dash (passenger side), sunglasses, air freshener by the head unit
    const lid = add(sbox(0.3, 0.006, 0.2, 0.003, 2), M.dash, -0.42, 0.9, -0.93); lid.rotation.x = -0.03;
    add(new T.BoxGeometry(0.31, 0.002, 0.21), M.rubber, -0.42, 0.8985, -0.93);
    const gl = new T.Group(); gl.position.set(0.3, 0.925, -1.12); gl.rotation.y = 0.15; cab.add(gl);
    const lensM = new T.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.1, metalness: 0.5 });
    for (const sx of [-0.033, 0.033]) add(sbox(0.055, 0.036, 0.005, 0.002, 2), lensM, sx, 0.012, 0, gl);
    add(new T.BoxGeometry(0.014, 0.006, 0.005), M.black, 0, 0.022, 0, gl);
    for (const sx of [-0.063, 0.063]) add(new T.BoxGeometry(0.004, 0.006, 0.12), M.black, sx, 0.02, 0.06, gl);
    const fresh = new T.Group(); fresh.position.set(0.012, 0.76, -0.47); cab.add(fresh);
    add(new T.CylinderGeometry(0.011, 0.011, 0.04, 12), new T.MeshPhysicalMaterial({ color: 0xdfe8ea, roughness: 0.05, transparent: true, opacity: 0.55 }), 0, 0, 0, fresh);
    add(new T.CylinderGeometry(0.007, 0.007, 0.016, 10), new T.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5 }), 0, 0.028, 0, fresh);
    // glovebox seam
    add(new T.BoxGeometry(0.36, 0.003, 0.004), M.rubber, -0.52, 0.66, -0.575);
    add(new T.BoxGeometry(0.36, 0.003, 0.004), M.rubber, -0.52, 0.47, -0.648);

    // ---------- steering wheel ----------
    const mount = new T.Group(); mount.position.copy(K.WHEEL_C); mount.rotation.x = -K.WHEEL_TILT; cab.add(mount);
    K.wheelMount = mount;
    const spin = new T.Group(); mount.add(spin); K.wheelSpin = spin;
    const R = K.WHEEL_R;
    const perf = canvasTex(64, 64, (g) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#3c3c3c'; for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) { g.beginPath(); g.arc(x + 2, y + 2, 1.5, 0, 7); g.fill(); } }, { data: true, repeat: [90, 6] });
    const rimMat = new T.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5, bumpMap: perf, bumpScale: 0.0012, map: perf });
    const rim = add(new T.TorusGeometry(R, K.TUBE_R, 18, 72), rimMat, 0, 0, 0, spin);
    rim.castShadow = true;
    // stitching along the inner side of the rim
    const stitch = canvasTex(64, 8, (g) => { g.clearRect(0, 0, 64, 8); g.fillStyle = '#6b6b6b'; for (let i = 0; i < 64; i += 8) g.fillRect(i + 1, 3, 5, 2); }, { repeat: [40, 1] });
    add(new T.TorusGeometry(R - K.TUBE_R * 0.93, 0.0022, 6, 72), new T.MeshStandardMaterial({ map: stitch, transparent: true, roughness: 0.9, alphaTest: 0.3 }), 0, 0, 0.004, spin);
    // hub pad
    const padG = new T.Group(); padG.position.z = -0.028; spin.add(padG); K.hornPad = padG;
    const pad = add(sbox(0.2, 0.125, 0.06, 0.03, 10), M.wheel, 0, -0.006, 0, padG);
    (function () { // trapezoid: narrower at the bottom, puffed in the middle
      const p = pad.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + (y / 0.0625) * 0.12;
        const puff = z > 0 ? 0.012 * (1 - Math.pow(x / 0.1, 2)) * (1 - Math.pow(y / 0.0625, 2)) : 0;
        p.setXYZ(i, x * k, y, z + puff);
      }
      pad.geometry.computeVertexNormals();
    })();
    const emb = add(new T.TorusGeometry(0.02, 0.0022, 8, 40), M.wheel, 0, -0.004, 0.043, padG); emb.scale.set(1.5, 1, 1);
    add(sbox(0.03, 0.006, 0.004, 0.0015, 2), M.wheel, 0, -0.004, 0.044, padG);
    const srs = canvasTex(256, 32, (g) => { g.clearRect(0, 0, 256, 32); g.fillStyle = '#1c1e20'; g.font = '600 22px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SRS AIRBAG', 128, 17); });
    const srsM = add(new T.PlaneGeometry(0.075, 0.0095), new T.MeshStandardMaterial({ map: srs, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), 0.045, -0.045, 0.0335, padG); srsM.rotation.z = 0.0;
    // four spokes
    function spoke(ang, w, th) {
      const a0 = new T.Vector3(Math.sin(ang) * 0.085, Math.cos(ang) * 0.05 - 0.004, -0.03), a1 = new T.Vector3(Math.sin(ang) * (R - 0.004), Math.cos(ang) * (R - 0.004), -0.002);
      const len = a0.distanceTo(a1);
      const m = add(sbox(w, len + 0.03, th, th * 0.45, 4), M.wheel, 0, 0, 0, spin);
      m.position.copy(a0).add(a1).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), a1.clone().sub(a0).normalize());
    }
    spoke(1.42, 0.05, 0.03); spoke(-1.42, 0.05, 0.03); spoke(2.55, 0.04, 0.028); spoke(-2.55, 0.04, 0.028);
    // column shroud + stalks (do not rotate with the wheel)
    const shroud = add(sbox(0.13, 0.12, 0.26, 0.04, 6), M.wheel, 0, -0.012, -0.17, mount);
    add(new T.CylinderGeometry(0.05, 0.05, 0.03, 24), M.black, 0, 0, -0.045, mount).rotation.x = Math.PI / 2;
    function stalk(side) {
      const piv = new T.Group(); piv.position.set(side * 0.05, 0.012, -0.095); mount.add(piv);
      const g = new T.Group(); g.rotation.z = -side * (Math.PI / 2 - 0.12); g.rotation.y = side * 0.1; piv.add(g);
      add(new T.CylinderGeometry(0.0065, 0.008, 0.09, 12), M.black, 0, 0.045, 0, g);
      add(new T.CylinderGeometry(0.0115, 0.0115, 0.05, 16), M.black, 0, 0.115, 0, g);
      add(new T.CylinderGeometry(0.012, 0.012, 0.004, 16), new T.MeshStandardMaterial({ color: 0xbfc3c7, roughness: 0.5 }), 0, 0.1, 0, g);
      add(new T.SphereGeometry(0.0115, 14, 10), M.black, 0, 0.14, 0, g);
      return piv;
    }
    K.stalkR = stalk(1); K.stalkL = stalk(-1);
    // ignition key
    const key = add(new T.CylinderGeometry(0.014, 0.014, 0.01, 16), M.satin, 0.068, -0.03, -0.11, mount); key.rotation.z = Math.PI / 2;
    add(sbox(0.004, 0.03, 0.02, 0.0015, 2), M.black, 0.088, -0.03, -0.11, mount);

    // ---------- body shell: pillars, roof, doors ----------
    const WS = { bz: -1.31, by: 0.9, tz: -0.62, ty: 1.5, bx: 0.76, tx: 0.68 }; // windshield frame
    // windshield glass
    const wsGeo = gridSurf(12, 6, (u, v, o) => {
      const hw = WS.bx + (WS.tx - WS.bx) * v;
      const x = (u * 2 - 1) * hw, bow = 0.06 * (1 - Math.pow(u * 2 - 1, 2));
      o.set(x, WS.by + (WS.ty - WS.by) * v, WS.bz + (WS.tz - WS.bz) * v - bow);
    });
    const ws = add(wsGeo, M.glass); ws.renderOrder = 5;
    // black frit band at the bottom and the top of the glass
    const fritMat = new T.MeshBasicMaterial({ color: 0x050505, side: T.DoubleSide });
    add(gridSurf(12, 1, (u, v, o) => { const x = (u * 2 - 1) * WS.bx, bow = 0.06 * (1 - Math.pow(u * 2 - 1, 2)); const vv = v * 0.045; o.set(x, WS.by + 0.6 * vv - 0.01, WS.bz + 0.69 * vv - bow - 0.001); }), fritMat);
    function beam(a, b, w, d, mat, r) {
      const len = a.distanceTo(b);
      const m = add(sbox(w, len, d, r || Math.min(w, d) * 0.35, 4), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true;
      return m;
    }
    const V = (x, y, z) => new T.Vector3(x, y, z);
    for (const s of [1, -1]) {
      beam(V(s * 0.775, 0.86, -1.33), V(s * 0.69, 1.53, -0.58), 0.085, 0.11, M.trim);           // A pillar
      beam(V(s * 0.79, 0.95, 0.62), V(s * 0.72, 1.53, 0.62), 0.07, 0.13, M.trim);               // B pillar
      beam(V(s * 0.79, 0.95, 2.5), V(s * 0.72, 1.53, 2.5), 0.07, 0.16, M.trim);                 // D pillar
      beam(V(s * 0.705, 1.515, -0.62), V(s * 0.705, 1.515, 2.55), 0.11, 0.07, M.head, 0.02).rotation.set(Math.PI / 2, 0, 0); // roof rail
      // beltline cap
      beam(V(s * 0.775, 0.955, -1.25), V(s * 0.775, 0.955, 2.55), 0.05, 0.035, M.dashDark, 0.012);
      // side glass
      const sg = add(new T.PlaneGeometry(3.8, 0.56), M.glass, s * 0.765, 1.23, 0.65); sg.rotation.y = Math.PI / 2; sg.rotation.x = 0; sg.renderOrder = 5;
      sg.rotation.order = 'YXZ'; sg.rotation.z = 0; sg.rotation.x = 0;
      // white outer frame seen around the window
      beam(V(s * 0.815, 0.90, -1.37), V(s * 0.73, 1.57, -0.60), 0.02, 0.07, M.body);
      beam(V(s * 0.815, 0.925, -1.30), V(s * 0.815, 0.925, 2.6), 0.03, 0.05, M.body, 0.01);
      // quarter triangle where the mirror is mounted
      const tri = new T.Shape(); tri.moveTo(0, 0); tri.lineTo(0.16, 0); tri.lineTo(0.16, 0.13); tri.lineTo(0, 0);
      const tg = add(new T.ShapeGeometry(tri), new T.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.7, side: T.DoubleSide }), s * 0.772, 0.965, -1.2); tg.rotation.y = -Math.PI / 2;
    }
    for (const s of [1, -1]) {
      const gh = new T.Group(); gh.position.set(s * 0.7, 1.47, -0.3); cab.add(gh);
      add(sbox(0.022, 0.03, 0.2, 0.01, 3), M.head, -s * 0.03, -0.02, 0, gh);
      for (const z of [-0.1, 0.1]) add(sbox(0.045, 0.035, 0.04, 0.012, 3), M.head, -s * 0.012, -0.012, z, gh);
    }
    // roof headliner
    const roofOut = add(new T.BoxGeometry(1.66, 0.05, 3.5), M.body, 0, 1.62, 0.95); roofOut.castShadow = true;
    for (const s of [1, -1]) { const sd = add(new T.BoxGeometry(0.03, 0.95, 4.1), M.body, s * 0.83, 0.47, 0.6); sd.castShadow = true; }
    const roof = add(gridSurf(10, 10, (u, v, o) => { const x = (u * 2 - 1) * 0.72; o.set(x, 1.535 + 0.03 * (1 - Math.pow(u * 2 - 1, 2)), -0.66 + 3.3 * v); }), M.head);
    // windshield header + sun visors
    beam(V(-0.7, 1.525, -0.62), V(0.7, 1.525, -0.62), 0.09, 0.1, M.head, 0.03);
    for (const s of [1, -1]) {
      const vz = add(sbox(0.42, 0.014, 0.15, 0.006, 3), M.head, s * 0.36, 1.515, -0.51); vz.rotation.x = 0.12;
    }
    // dome light
    add(sbox(0.12, 0.012, 0.07, 0.005, 2), new T.MeshStandardMaterial({ color: 0xe8e4d6, roughness: 0.4 }), 0, 1.552, -0.2);
    // floor, firewall, rear
    add(new T.BoxGeometry(1.6, 0.04, 4.2), M.carpet, 0, -0.02, 0.6);
    add(new T.BoxGeometry(1.6, 0.9, 0.04), M.carpet, 0, 0.4, -1.1);
    add(new T.BoxGeometry(1.6, 0.95, 0.04), M.trim, 0, 0.48, 2.62);
    beam(V(-0.75, 1.5, 2.6), V(0.75, 1.5, 2.6), 0.09, 0.1, M.head, 0.03);
    const rg = add(new T.PlaneGeometry(1.5, 0.52), M.glass, 0, 1.22, 2.62); rg.renderOrder = 5;
    // rear side walls below the beltline
    for (const s of [1, -1]) add(new T.BoxGeometry(0.03, 0.95, 1.95), M.trim, s * 0.775, 0.475, 1.62);

    // doors
    const doorTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#6a6d6f'; g.fillRect(0, 0, w, h);
      // fabric insert
      g.fillStyle = '#8a8c8b'; g.beginPath();
      g.moveTo(60, 70); g.quadraticCurveTo(250, 40, 470, 62); g.lineTo(476, 118); g.quadraticCurveTo(250, 128, 56, 122); g.closePath(); g.fill();
      for (let i = 0; i < 2500; i++) { g.fillStyle = 'rgba(60,60,60,0.12)'; g.fillRect(60 + rnd() * 410, 55 + rnd() * 68, 2, 1); }
      // speaker grille
      for (let a = 0; a < 420; a++) { const r = Math.sqrt(rnd()) * 34, t = rnd() * 6.283; g.fillStyle = 'rgba(15,15,15,0.8)'; g.fillRect(96 + Math.cos(t) * r, 196 + Math.sin(t) * r * 0.9, 2, 2); }
      g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(96, 196, 38, 35, 0, 0, 7); g.stroke();
      // pocket shadow
      g.fillStyle = 'rgba(20,20,20,0.35)'; g.beginPath(); g.moveTo(180, 205); g.lineTo(480, 200); g.lineTo(480, 212); g.lineTo(180, 214); g.fill();
    });
    doorTex.flipY = true;
    function door(s) {
      const g = new T.Group(); g.scale.x = s; cab.add(g);
      const mat = M.door.clone(); mat.map = doorTex;
      const geo = gridSurf(48, 40, (u, v, o) => {
        const z = -1.2 + 1.8 * u, y = 0.03 + 0.93 * v;
        const zf = smooth(-1.15, -0.85, z) * (1 - smooth(0.38, 0.58, z));
        let b = 0.012;
        b += 0.075 * Math.exp(-Math.pow((y - 0.585) / 0.06, 2)) * zf;                 // armrest
        b += 0.03 * Math.exp(-Math.pow((y - 0.9) / 0.07, 2));                          // top roll
        b += 0.045 * (1 - smooth(0.2, 0.3, y)) * smooth(-0.75, -0.6, z) * (1 - smooth(0.4, 0.55, z)); // pocket
        b -= 0.012 * Math.exp(-Math.pow((y - 0.75) / 0.05, 2)) * zf;                 // insert dip
        o.set(0.775 - b, y, z);
      });
      const m = new T.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
      // handle recess + chrome lever
      const rec = new T.Mesh(sbox(0.012, 0.055, 0.12, 0.005, 3), M.black); rec.position.set(0.752, 0.76, -0.5); g.add(rec);
      const lev = new T.Mesh(sbox(0.012, 0.028, 0.075, 0.005, 3), M.satin); lev.position.set(0.745, 0.762, -0.49); g.add(lev);
      // window switches on the armrest
      const sw = new T.Mesh(sbox(0.05, 0.012, 0.16, 0.005, 3), M.black); sw.position.set(0.69, 0.635, -0.35); sw.rotation.z = 0.15; g.add(sw);
      for (let i = 0; i < 2; i++) { const b = new T.Mesh(sbox(0.022, 0.008, 0.03, 0.003, 2), M.dashDark); b.position.set(0.688, 0.644, -0.39 + i * 0.07); b.rotation.z = 0.15; g.add(b); }
      // pull grip
      const grip = new T.Mesh(sbox(0.03, 0.03, 0.2, 0.012, 4), M.dashDark); grip.position.set(0.70, 0.60, 0.05); g.add(grip);
      return g;
    }
    door(1); door(-1);

    // ---------- outside mirrors ----------
    K.mirrorMats = {};
    function sideMirror(s, name) {
      const g = new T.Group(); g.position.set(s * 0.96, 1.06, -1.0); cab.add(g);
      const sh = add(sbox(0.2, 0.25, 0.1, 0.045, 6), M.body, 0, 0, -0.02, g); sh.rotation.y = s * 0.28;
      add(sbox(0.14, 0.04, 0.05, 0.015, 3), M.rubber, -s * 0.12, -0.07, -0.02, g);
      const mat = new T.MeshBasicMaterial({ color: 0x8f989e });
      const mm = add(new T.PlaneGeometry(0.165, 0.21), mat, 0.0, 0, 0.034, g); mm.rotation.y = s * 0.28 - s * 0.0;
      add(sbox(0.18, 0.225, 0.006, 0.002, 2), M.rubber, 0, 0, 0.03, g).rotation.y = s * 0.28;
      K.mirrorMats[name] = { mat: mat, obj: mm };
    }
    sideMirror(1, 'R'); sideMirror(-1, 'L');
    // inside mirror + rosary
    const im = new T.Group(); im.position.set(0, 1.43, -0.66); cab.add(im);
    add(new T.CylinderGeometry(0.009, 0.012, 0.09, 10), M.black, 0, 0.045, -0.03, im).rotation.x = -0.5;
    const ih = add(sbox(0.31, 0.075, 0.03, 0.012, 4), M.black, 0, 0, 0, im); ih.rotation.set(0.06, -0.24, 0);
    const imat = new T.MeshBasicMaterial({ color: 0x8f989e });
    const imm = add(new T.PlaneGeometry(0.295, 0.062), imat, 0, 0, 0.0162, ih);
    K.mirrorMats.C = { mat: imat, obj: imm };
    const ros = new T.Group(); ros.position.set(0, 0.035, -0.02); im.add(ros); K.rosary = ros;
    (function () {
      const wood = new T.MeshStandardMaterial({ color: 0x7a5234, roughness: 0.45 });
      const N = 44, beads = new T.InstancedMesh(new T.SphereGeometry(0.0062, 10, 8), wood, N + 6);
      const m4 = new T.Matrix4();
      const Lh = 0.2, hw = 0.016;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), a = t * 2 - 1;        // -1..1 along the loop
        const y = -Lh * (1 - Math.pow(Math.abs(a), 1.6)) - 0.01, x = a * hw * (1.2 - 0.9 * (1 - Math.abs(a)));
        m4.makeTranslation(x, y, (Math.abs(a) < 0.5 ? 0.002 : 0));
        beads.setMatrixAt(i, m4);
      }
      for (let i = 0; i < 6; i++) { m4.makeTranslation(0, -Lh - 0.018 - i * 0.0105, 0); beads.setMatrixAt(N + i, m4); }
      ros.add(beads);
      add(new T.BoxGeometry(0.007, 0.05, 0.005), wood, 0, -Lh - 0.105, 0, ros);
      add(new T.BoxGeometry(0.03, 0.007, 0.005), wood, 0, -Lh - 0.095, 0, ros);
      // small cloth pouch on its own string
      add(new T.CylinderGeometry(0.0008, 0.0008, 0.12, 4), M.black, 0.012, -0.06, 0.006, ros);
      const pouch = add(new T.SphereGeometry(0.02, 14, 10), new T.MeshStandardMaterial({ color: 0xb9bfae, roughness: 1, bumpMap: fineGrain, bumpScale: 0.001 }), 0.012, -0.142, 0.006, ros);
      pouch.scale.set(0.8, 1.25, 0.7);
      add(new T.ConeGeometry(0.008, 0.016, 8), pouch.material, 0.012, -0.116, 0.006, ros);
    })();

    // ---------- wipers lying at the base of the windshield ----------
    for (const o of [{ x: 0.52, l: 0.5 }, { x: -0.1, l: 0.52 }]) {
      const w = new T.Group(); w.position.set(o.x, 0.915, -1.325); w.rotation.set(0, 0, 0.06); cab.add(w);
      add(new T.BoxGeometry(o.l, 0.012, 0.012), M.rubber, -o.l / 2, 0.012, 0, w);
      add(new T.BoxGeometry(o.l * 0.9, 0.02, 0.006), M.rubber, -o.l / 2, 0.0, 0.004, w);
      add(new T.CylinderGeometry(0.014, 0.014, 0.02, 10), M.rubber, 0, 0.005, 0, w);
    }
    // hood edge
    const hood = add(sbox(1.5, 0.1, 0.5, 0.045, 6), M.body, 0, 0.80, -1.62); hood.rotation.x = 0.2;

    // ---------- seats ----------
    function seat(x) {
      const g = new T.Group(); g.position.set(x, 0, 0); cab.add(g);
      add(sbox(0.5, 0.15, 0.5, 0.06, 8), M.fabric, 0, 0.44, 0.2, g).rotation.x = 0.06;
      const b = add(sbox(0.5, 0.64, 0.14, 0.06, 8), M.fabric, 0, 0.82, 0.5, g); b.rotation.x = 0.2;
      add(sbox(0.27, 0.18, 0.11, 0.05, 6), M.fabric, 0, 1.24, 0.6, g).rotation.x = 0.12;
      add(new T.CylinderGeometry(0.006, 0.006, 0.12, 6), M.satin, -0.06, 1.14, 0.585, g);
      add(new T.CylinderGeometry(0.006, 0.006, 0.12, 6), M.satin, 0.06, 1.14, 0.585, g);
      add(sbox(0.46, 0.26, 0.46, 0.04, 4), M.dashDark, 0, 0.22, 0.22, g);
      b.castShadow = true;
    }
    seat(-DRV_X); seat(DRV_X);
    add(sbox(1.3, 0.16, 0.5, 0.06, 6), M.fabric, 0, 0.44, 1.65);
    add(sbox(1.3, 0.62, 0.14, 0.06, 6), M.fabric, 0, 0.82, 1.95).rotation.x = 0.2;
    // seat belt on the driver's B pillar
    beam(V(0.735, 1.4, 0.56), V(0.66, 0.5, 0.5), 0.045, 0.003, M.black, 0.001);
    // floor console with the automatic selector
    add(sbox(0.2, 0.3, 0.6, 0.04, 6), M.dashDark, 0, 0.2, -0.05);
    const sel = new T.Group(); sel.position.set(0, 0.35, -0.2); cab.add(sel); K.selector = sel;
    add(new T.CylinderGeometry(0.007, 0.007, 0.13, 8), M.chrome, 0, 0.065, 0, sel);
    add(sbox(0.04, 0.05, 0.06, 0.018, 5), M.black, 0, 0.15, 0, sel);
    add(plate(0.08, 0.2, 0.02, 0.004, 0.002), M.piano, 0, 0.351, -0.05).rotation.x = -Math.PI / 2;
    // handbrake
    const hb = add(sbox(0.035, 0.035, 0.26, 0.015, 4), M.black, 0.0, 0.39, 0.22); hb.rotation.x = 0.25;

    // ---------- driver's legs and torso ----------
    function limb(a, b, r1, r2, mat) {
      const len = a.distanceTo(b);
      const m = add(capsule(r1, r2, len, 14), mat);
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    }
    limb(V(DRV_X - 0.1, 0.60, 0.25), V(DRV_X - 0.13, 0.635, -0.2), 0.085, 0.065, M.pants);
    limb(V(DRV_X + 0.1, 0.60, 0.25), V(DRV_X + 0.13, 0.635, -0.2), 0.085, 0.065, M.pants);
    limb(V(DRV_X - 0.13, 0.635, -0.2), V(DRV_X - 0.14, 0.16, -0.58), 0.062, 0.045, M.pants);
    K.shinR = limb(V(DRV_X + 0.13, 0.635, -0.2), V(DRV_X + 0.14, 0.18, -0.58), 0.062, 0.045, M.pants);
    const torso = add(sbox(0.42, 0.5, 0.22, 0.1, 8), M.pants, DRV_X, 0.82, 0.3); torso.rotation.x = 0.15;
    // pedals
    K.pedalGas = add(sbox(0.05, 0.13, 0.012, 0.005, 2), M.rubber, DRV_X + 0.15, 0.14, -0.72); K.pedalGas.rotation.x = -0.6;
    K.pedalBrake = add(sbox(0.11, 0.06, 0.012, 0.005, 2), M.rubber, DRV_X - 0.02, 0.2, -0.7); K.pedalBrake.rotation.x = -0.6;

    cab.traverse((o) => { if (o.isMesh && o.material && o.material.envMap === null && env) { /* scene.environment is used */ } });
    K.group = cab;
    return cab;
  };

  // ---------- cluster face drawing ----------
  const CL = { sp: { x: 450, y: 250, r: 168 }, ta: { x: 770, y: 262, r: 92 }, fu: { x: 180, y: 300, r: 70 }, te: { x: 930, y: 300, r: 60 } };
  K.CL = CL;
  // angle (canvas, radians, 0 = right, clockwise positive) for a 0..1 value on each dial
  K.spAng = (t) => Math.PI * (0.86 + 1.0 * t);     // speedo sweep 180°: from lower left to right
  K.taAng = (t) => Math.PI * (0.75 + 1.5 * t);
  function drawCluster(g, w, h) {
    g.fillStyle = '#060607'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(CL.sp.x, CL.sp.y, 20, CL.sp.x, CL.sp.y, 260); gr.addColorStop(0, '#131416'); gr.addColorStop(1, '#070708');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // speedometer 0..180
    g.strokeStyle = '#f2f2ee'; g.fillStyle = '#f2f2ee'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= 180; v += 5) {
      const a = K.spAng(v / 180), big = v % 20 === 0, mid = v % 10 === 0;
      const r1 = CL.sp.r, r0 = r1 - (big ? 24 : mid ? 16 : 9);
      g.lineWidth = big ? 5 : mid ? 3 : 1.6;
      g.beginPath(); g.moveTo(CL.sp.x + Math.cos(a) * r0, CL.sp.y + Math.sin(a) * r0); g.lineTo(CL.sp.x + Math.cos(a) * r1, CL.sp.y + Math.sin(a) * r1); g.stroke();
      if (big) { g.font = '600 27px Arial'; g.fillText(String(v), CL.sp.x + Math.cos(a) * (r1 + 24), CL.sp.y + Math.sin(a) * (r1 + 22)); }
    }
    g.font = '18px Arial'; g.fillStyle = '#c9c9c4'; g.fillText('km/h', CL.sp.x + 70, CL.sp.y + 62);
    // odometer
    g.fillStyle = '#0d120d'; g.fillRect(CL.sp.x - 58, CL.sp.y + 44, 100, 26); g.strokeStyle = '#2a2d2a'; g.lineWidth = 1; g.strokeRect(CL.sp.x - 58, CL.sp.y + 44, 100, 26);
    g.fillStyle = '#9fb59a'; g.font = '20px "PT Mono", monospace'; g.fillText('287415', CL.sp.x - 8, CL.sp.y + 58);
    // tachometer: light face
    const tg = g.createRadialGradient(CL.ta.x - 20, CL.ta.y - 20, 10, CL.ta.x, CL.ta.y, CL.ta.r); tg.addColorStop(0, '#e9edf0'); tg.addColorStop(1, '#b9c1c8');
    g.fillStyle = tg; g.beginPath(); g.arc(CL.ta.x, CL.ta.y, CL.ta.r, 0, 7); g.fill();
    g.strokeStyle = '#8c949b'; g.lineWidth = 3; g.stroke();
    for (let v = 0; v <= 7; v += 0.5) {
      const a = K.taAng(v / 7), big = v % 1 === 0, r1 = CL.ta.r - 6, r0 = r1 - (big ? 14 : 8);
      g.strokeStyle = v >= 6 ? '#c21f17' : '#15171a'; g.lineWidth = big ? 4 : 2;
      g.beginPath(); g.moveTo(CL.ta.x + Math.cos(a) * r0, CL.ta.y + Math.sin(a) * r0); g.lineTo(CL.ta.x + Math.cos(a) * r1, CL.ta.y + Math.sin(a) * r1); g.stroke();
      if (big) { g.fillStyle = v >= 6 ? '#c21f17' : '#15171a'; g.font = '600 21px Arial'; g.fillText(String(v), CL.ta.x + Math.cos(a) * (r1 - 30), CL.ta.y + Math.sin(a) * (r1 - 30)); }
    }
    g.fillStyle = '#3a4046'; g.font = '12px Arial'; g.fillText('x1000 r/min', CL.ta.x, CL.ta.y + 44);
    // fuel + temperature arcs
    function arc(c, a0, a1, lab0, lab1) {
      g.strokeStyle = '#e9e9e4'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, c.r - 12, a0, a1); g.stroke();
      for (let i = 0; i <= 4; i++) { const a = a0 + ((a1 - a0) * i) / 4; g.lineWidth = i % 2 ? 2 : 4; g.beginPath(); g.moveTo(c.x + Math.cos(a) * (c.r - 24), c.y + Math.sin(a) * (c.r - 24)); g.lineTo(c.x + Math.cos(a) * (c.r - 12), c.y + Math.sin(a) * (c.r - 12)); g.stroke(); }
      g.fillStyle = '#e9e9e4'; g.font = '600 20px Arial';
      g.fillText(lab0, c.x + Math.cos(a0) * (c.r + 4), c.y + Math.sin(a0) * (c.r + 4)); g.fillText(lab1, c.x + Math.cos(a1) * (c.r + 4), c.y + Math.sin(a1) * (c.r + 4));
    }
    arc(CL.fu, Math.PI * 0.72, Math.PI * 1.28, 'E', 'F');
    arc(CL.te, Math.PI * -0.28, Math.PI * 0.28, 'H', 'C');
    // dim unlit warning icons
    g.fillStyle = '#1c1d1f';
    for (let i = 0; i < 6; i++) g.fillRect(292 + (i % 3) * 0 + 0, 0, 0, 0);
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(286, 150 + i * 36, 9, 0, 7); g.fill(); }
  }
})();
