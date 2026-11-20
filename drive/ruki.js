// Руки водителя: кисти с пальцами, рукава с тремя полосами, перехват руля, сигнал, поворотник.
// Локальные оси кисти: Y вдоль пальцев, Z из тыльной стороны, большой палец у правой руки на −X.
(function () {
  'use strict';
  const T = THREE, K = window.KABINA;
  const R = (window.RUKI = {});
  const D = Math.PI / 180;

  function skinMat() {
    const tex = K.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#d9ab90'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) {
        const r = 4 + K.rnd() * 10; g.fillStyle = K.rnd() < 0.5 ? 'rgba(200,120,105,0.035)' : 'rgba(240,200,170,0.035)';
        g.beginPath(); g.arc(K.rnd() * w, K.rnd() * h, r, 0, 7); g.fill();
      }
      for (let i = 0; i < 1400; i++) { g.fillStyle = 'rgba(120,70,55,0.06)'; g.fillRect(K.rnd() * w, K.rnd() * h, 1, 1 + K.rnd() * 3); }
    }, { repeat: [2, 2] });
    return new T.MeshStandardMaterial({ color: 0xd9b8a6, map: tex, roughness: 0.62, metalness: 0 });
  }

  const FINGERS = [
    { x: -0.0305, y: 0.092, L: [0.043, 0.026, 0.021], r: 0.0098, splay: 0.07 },
    { x: -0.0100, y: 0.097, L: [0.047, 0.030, 0.022], r: 0.0100, splay: 0.01 },
    { x: 0.0100, y: 0.093, L: [0.043, 0.028, 0.021], r: 0.0094, splay: -0.05 },
    { x: 0.0285, y: 0.084, L: [0.033, 0.020, 0.019], r: 0.0083, splay: -0.12 },
  ];

  function makeHand(side, skin, nail) {
    const root = new T.Group();
    const h = new T.Group(); h.scale.x = side; root.add(h);
    const mesh = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); (parent || h).add(m); m.castShadow = true; return m; };
    // palm: narrower at the wrist, slightly cupped
    const pg = K.sbox(0.088, 0.104, 0.031, 0.0145, 8);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), t = (y + 0.052) / 0.104;
      pp.setXYZ(i, x * (0.74 + 0.26 * t) + 0.002 * (1 - t), y, z * (1.05 - 0.12 * t) + (z > 0 ? 0.002 * Math.sin(t * 3.1) : 0));
    }
    pg.computeVertexNormals();
    mesh(pg, skin, -0.001, 0.047, 0);
    // thumb base muscle and the edge of the palm
    mesh(new T.SphereGeometry(1, 16, 12), skin, -0.026, 0.036, -0.011).scale.set(0.02, 0.034, 0.014);
    mesh(new T.SphereGeometry(1, 16, 12), skin, 0.027, 0.04, -0.008).scale.set(0.013, 0.036, 0.012);
    // wrist
    const wr = mesh(K.capsule(0.0235, 0.0245, 0.05, 16), skin, 0, -0.045, 0); wr.scale.set(1.22, 1, 0.82);
    // fingers
    const fingers = [];
    FINGERS.forEach((f, fi) => {
      const g0 = new T.Group(); g0.position.set(f.x, f.y, 0.001); g0.rotation.z = f.splay; h.add(g0);
      mesh(new T.SphereGeometry(f.r * 1.12, 12, 10), skin, 0, -0.002, 0.004, g0); // knuckle
      const joints = []; let parent = g0, rr = f.r;
      for (let k = 0; k < 3; k++) {
        const j = new T.Group(); if (k > 0) j.position.y = f.L[k - 1]; parent.add(j);
        mesh(K.capsule(rr, rr * 0.9, f.L[k], 12), skin, 0, 0, 0, j);
        if (k === 2) { const n = mesh(new T.SphereGeometry(1, 12, 8), nail, 0, f.L[k] * 0.62, rr * 0.62, j); n.scale.set(rr * 0.74, f.L[k] * 0.4, rr * 0.3); n.castShadow = false; }
        joints.push(j); parent = j; rr *= 0.9;
      }
      fingers.push(joints);
    });
    // thumb
    const t0 = new T.Group(); t0.position.set(-0.031, 0.02, -0.006); h.add(t0);
    const TL = [0.037, 0.027, 0.023], tj = []; let tp = t0, tr = 0.0128;
    for (let k = 0; k < 3; k++) {
      const j = new T.Group(); if (k > 0) j.position.y = TL[k - 1]; tp.add(j);
      mesh(K.capsule(tr, tr * 0.88, TL[k], 12), skin, 0, 0, 0, j);
      if (k === 2) { const n = mesh(new T.SphereGeometry(1, 12, 8), nail, 0, TL[k] * 0.62, tr * 0.62, j); n.scale.set(tr * 0.78, TL[k] * 0.4, tr * 0.3); n.castShadow = false; }
      tj.push(j); tp = j; tr *= 0.88;
    }
    function setCurl(c, spread) {
      // c: 0 open hand .. 1 fist around the rim
      fingers.forEach((j, fi) => {
        const k = 1 + (fi - 1.5) * 0.05;
        j[0].rotation.x = -(0.10 + c * 0.98 * k);
        j[1].rotation.x = -(0.12 + c * 1.55);
        j[2].rotation.x = -(0.08 + c * 0.9);
        j[0].parent.rotation.z = FINGERS[fi].splay * (1 + (spread || 0) * 2.2 * (1 - c));
      });
      tj[0].rotation.set(-0.25 - 0.12 * c, 0, 0.78 - 0.4 * c);
      tj[1].rotation.z = 0.12 + 0.1 * c;
      tj[2].rotation.z = 0.08 + 0.5 * c;
    }
    setCurl(1);
    return { root: root, setCurl: setCurl };
  }

  function sleeveTex() {
    return K.canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(K.rnd() * w, K.rnd() * h, 1, 2); }
      // three white stripes running along the arm (u = around, v = along)
      for (let i = 0; i < 3; i++) {
        const x = w * 0.25 + (i - 1) * 27 - 7;
        g.fillStyle = '#e9e9e6'; g.fillRect(x, 0, 14, h);
        g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < h; y += 3) g.fillRect(x, y, 14, 1);
      }
    });
  }
  function tubeGeo(r0, r1, len, folds) {
    const g = new T.CylinderGeometry(r1, r0, len, 28, 24, true);
    g.translate(0, len / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = y / len;
      const k = 1 + folds * (Math.sin(t * 34 + Math.sin(a * 2) * 2.2) * 0.5 + Math.sin(t * 13 + a * 3) * 0.5) * (0.4 + 0.6 * t);
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    return g;
  }

  R.build = function (cab) {
    const skin = skinMat();
    const nail = new T.MeshStandardMaterial({ color: 0xe9c3b4, roughness: 0.32 });
    const sleeveM = new T.MeshStandardMaterial({ map: sleeveTex(), roughness: 0.9, side: T.DoubleSide });
    const cuffTex = K.canvasTex(128, 16, (g, w, h) => { g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d1e21'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2, h); }, { repeat: [3, 1] });
    const cuffM = new T.MeshStandardMaterial({ map: cuffTex, roughness: 1 });
    const mount = K.wheelMount;
    mount.updateMatrix();
    const mq = mount.quaternion.clone(), mp = mount.position.clone();
    const L1 = 0.31, L2 = 0.275;

    const hands = [];
    for (const side of [1, -1]) {
      const hand = makeHand(side, skin, nail);
      cab.add(hand.root);
      const fore = new T.Group(); cab.add(fore);
      const fm = new T.Mesh(tubeGeo(0.056, 0.039, L2 - 0.035, 0.035), sleeveM); fm.castShadow = true; fore.add(fm);
      const cf = new T.Mesh(tubeGeo(0.038, 0.033, 0.04, 0.0), cuffM); cf.position.y = L2 - 0.038; fore.add(cf);
      const up = new T.Group(); cab.add(up);
      const um = new T.Mesh(tubeGeo(0.072, 0.058, L1 + 0.02, 0.03), sleeveM); um.castShadow = true; up.add(um);
      const el = new T.Mesh(new T.SphereGeometry(0.058, 16, 12), new T.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.9 })); fore.add(el);
      const sh = new T.Mesh(new T.SphereGeometry(0.085, 16, 12), el.material); up.add(sh);
      hands.push({
        side: side, hand: hand, fore: fore, up: up,
        shoulder: new T.Vector3(K.DRV_X + side * 0.215, 1.0, 0.2),
        home: side * 58 * D, phi: side * 58 * D,
        min: side > 0 ? 6 * D : -116 * D, max: side > 0 ? 116 * D : -6 * D,
        mode: 'wheel', blend: null, idle: 0,
        cur: { p: new T.Vector3(), q: new T.Quaternion(), c: 1 },
      });
    }
    R.hands = hands;
    const RH = hands[0], LH = hands[1];

    // --- target poses (in the wheel mount frame) ---
    const vX = new T.Vector3(), vY = new T.Vector3(), vZ = new T.Vector3(), m4 = new T.Matrix4(), tp = new T.Vector3(), tq = new T.Quaternion();
    function setBasis(out) { m4.makeBasis(vX, vY, vZ); out.q.setFromRotationMatrix(m4); }
    function gripPose(h, th, out) {
      const s = Math.sin(th), c = Math.cos(th);
      // lean the hand's «outward» direction a little towards «up», the way a wrist really sits
      vY.set(s, c + 0.35, 0).normalize();
      vZ.set(s * 0.3, c * 0.3, 0.95).normalize();
      vX.crossVectors(vY, vZ).normalize(); vY.crossVectors(vZ, vX).normalize();
      out.p.set(s * K.WHEEL_R, c * K.WHEEL_R, 0).addScaledVector(vZ, 0.0295).addScaledVector(vY, -0.107);
      setBasis(out); out.c = 1; out.spread = 0;
    }
    function hornPose(h, press, out) {
      vZ.set(0, 0.12, 1).normalize(); vY.set(-h.side * 0.5, 0.86, 0).normalize();
      vX.crossVectors(vY, vZ).normalize(); vY.crossVectors(vZ, vX).normalize();
      out.p.set(h.side * 0.045, -0.085, 0.045 - press * 0.008);
      setBasis(out); out.c = 0.1; out.spread = 0.5;
    }
    function stalkPose(h, dy, out) {
      vY.set(0.22, 0.25, -1).normalize(); vZ.set(0.45, 0.9, 0.2).normalize();
      vX.crossVectors(vY, vZ).normalize(); vZ.crossVectors(vX, vY).normalize();
      out.p.set(0.215, 0.022 + dy, -0.09).addScaledVector(vY, -0.16).addScaledVector(vZ, 0.012);
      setBasis(out); out.c = 0.2; out.spread = 0.2;
    }
    const tgt = { p: new T.Vector3(), q: new T.Quaternion(), c: 1, spread: 0 };
    function target(h, st) {
      if (h.mode === 'horn') hornPose(h, st.hornPress, tgt);
      else if (h.mode === 'stalk') stalkPose(h, st.stalkDy, tgt);
      else gripPose(h, st.wheel + h.phi, tgt);
      // to cabin coordinates
      tgt.p.applyQuaternion(mq).add(mp); tgt.q.premultiply(mq);
      return tgt;
    }
    function startBlend(h, dur, lift) {
      h.blend = { t: 0, dur: dur, lift: lift, p: h.cur.p.clone(), q: h.cur.q.clone(), c: h.cur.c };
    }
    R.setMode = function (h, mode, dur) { if (h.mode !== mode) { h.mode = mode; startBlend(h, dur || 0.2, 0.03); if (mode === 'wheel') h.phi = h.home + (h.side > 0 ? 6 : -6) * D - R.lastWheel; if (mode === 'wheel') h.phi = clampTo(h, R.lastWheel + h.phi) - R.lastWheel; } };
    function clampTo(h, th) { return Math.max(h.min + 8 * D, Math.min(h.max - 8 * D, th)); }
    R.RH = RH; R.LH = LH; R.lastWheel = 0;

    const axisCab = new T.Vector3(0, 0, 1).applyQuaternion(mq);
    const elbow = new T.Vector3(), dir = new T.Vector3(), pole = new T.Vector3(), tmp = new T.Vector3(), wristP = new T.Vector3(), bx = new T.Vector3(), by = new T.Vector3(), bz = new T.Vector3();
    function aim(obj, from, to, ref) {
      by.subVectors(to, from).normalize(); bz.crossVectors(ref, by).normalize(); bx.crossVectors(by, bz).normalize();
      m4.makeBasis(bx, by, bz); obj.quaternion.setFromRotationMatrix(m4); obj.position.copy(from);
    }
    const ref = new T.Vector3();

    R.update = function (st, dt) {
      // st: { wheel (rad, clockwise +), wheelRate, hornPress 0..1, stalkDy }
      R.lastWheel = st.wheel;
      for (const h of hands) {
        const o = h === RH ? LH : RH;
        if (h.mode === 'wheel' && !h.blend) {
          const th = st.wheel + h.phi;
          const otherHolds = o.mode === 'wheel' && !o.blend;
          let regrip = null;
          if (th > h.max && (otherHolds || th > h.max + 50 * D)) regrip = h.min + 30 * D;
          else if (th < h.min && (otherHolds || th < h.min - 50 * D)) regrip = h.max - 30 * D;
          else {
            // drift back to the usual 10-and-2 grip when the wheel is quiet
            if (Math.abs(st.wheelRate) < 0.25 && Math.abs(th - h.home) > 26 * D) h.idle += dt; else h.idle = 0;
            if (h.idle > 0.9 && otherHolds) { regrip = h.home; h.idle = 0; }
          }
          if (regrip !== null) { h.phi = regrip - st.wheel; startBlend(h, 0.21, 0.04); }
        }
        const t = target(h, st);
        if (h.blend) {
          const b = h.blend; b.t += dt / b.dur;
          if (b.t >= 1) { h.blend = null; h.cur.p.copy(t.p); h.cur.q.copy(t.q); h.cur.c = t.c; }
          else {
            const e = b.t * b.t * (3 - 2 * b.t), up = Math.sin(Math.PI * b.t);
            h.cur.p.lerpVectors(b.p, t.p, e).addScaledVector(axisCab, b.lift * up);
            h.cur.q.copy(b.q).slerp(t.q, e);
            h.cur.c = b.c + (t.c - b.c) * e - 0.45 * up * Math.min(b.c, t.c);
          }
        } else { h.cur.p.copy(t.p); h.cur.q.copy(t.q); h.cur.c = t.c; }
        h.hand.root.position.copy(h.cur.p); h.hand.root.quaternion.copy(h.cur.q);
        h.hand.setCurl(h.cur.c, t.spread);

        // two-bone arm: shoulder -> elbow -> wrist
        tmp.set(0, 1, 0).applyQuaternion(h.cur.q);
        wristP.copy(h.cur.p).addScaledVector(tmp, -0.04);
        dir.subVectors(wristP, h.shoulder);
        let d = dir.length(); const dmax = L1 + L2 - 0.004;
        if (d > dmax) { d = dmax; }
        dir.normalize();
        const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
        pole.set(h.side * 0.75, -0.65, 0.15); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
        elbow.copy(h.shoulder).addScaledVector(dir, a).addScaledVector(pole, hh);
        ref.set(h.side * 0.3, 1, 0.55);
        aim(h.fore, elbow, wristP, ref);
        aim(h.up, h.shoulder, elbow, ref);
      }
    };
  };
})();
