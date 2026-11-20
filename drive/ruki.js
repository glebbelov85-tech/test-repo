// Руки водителя: кисти с пальцами, рукава с тремя полосами, перехват руля, сигнал, поворотник.
// Локальные оси кисти: Y вдоль пальцев, Z из тыльной стороны, большой палец у правой руки на −X.
(function () {
  'use strict';
  const T = THREE, K = window.KABINA;
  const R = (window.RUKI = {});
  const D = Math.PI / 180;

  // ---- кисть: цельная сетка из kist.js со скелетом (ладонь, 4 пальца по 3 фаланги, большой палец) ----
  const KI = window.KIST;
  function b64(str, Type) { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Type(u.buffer); }
  let handGeo = null;
  function geo() {
    if (handGeo) return handGeo;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(b64(KI.pos, Float32Array), 3));
    g.setAttribute('normal', new T.BufferAttribute(b64(KI.nor, Int8Array), 3, true));
    const c8 = b64(KI.col, Uint8Array), c = new Float32Array(c8.length);
    for (let i = 0; i < c8.length; i++) c[i] = Math.pow(c8[i] / 255, 2.2) * 0.8;
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(b64(KI.skinI, Uint8Array)), 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(b64(KI.skinW, Uint8Array), 4, true));
    g.setIndex(new T.BufferAttribute(b64(KI.idx, KI.idx32 ? Uint32Array : Uint16Array), 1));
    return (handGeo = g);
  }
  // позы: 12 сгибов пальцев (указательный..мизинец, по 3 сустава), разведение, большой палец [отведение, противопоставление, сгиб, сгиб]
  const POSE = {
    grip: [0.8, 1.65, 0.9, 0.82, 1.68, 0.9, 0.85, 1.7, 0.9, 0.9, 1.7, 0.95, 0.35, 0.1, 0.35, 0.45, 0.5],
    open: [0.1, 0.14, 0.1, 0.08, 0.12, 0.1, 0.1, 0.14, 0.1, 0.14, 0.18, 0.12, 1.5, 0.25, -0.1, 0.1, 0.1],
    point: [0.12, 0.2, 0.12, 0.3, 0.4, 0.25, 0.75, 1.0, 0.5, 0.85, 1.05, 0.55, 1.0, 0.0, 0.25, 0.3, 0.3],
    relax: [0.45, 0.6, 0.35, 0.45, 0.62, 0.35, 0.5, 0.65, 0.38, 0.55, 0.7, 0.4, 1.0, 0.1, 0.0, 0.2, 0.2],
  };
  R.POSE = POSE;

  function makeHand(side, skin, nail) {
    const root = new T.Group();
    const h = new T.Group(); h.scale.x = side; root.add(h);
    const bones = KI.bones.map((b) => { const o = new T.Bone(); o.name = b.name; return o; });
    const m4 = new T.Matrix4(), sc = new T.Vector3();
    KI.bones.forEach((b, i) => {
      const r = b.r; m4.makeBasis(new T.Vector3(r[0], r[1], r[2]), new T.Vector3(r[3], r[4], r[5]), new T.Vector3(r[6], r[7], r[8]));
      bones[i].quaternion.setFromRotationMatrix(m4); bones[i].position.set(b.p[0], b.p[1], b.p[2]);
      if (b.parent >= 0) bones[b.parent].add(bones[i]);
    });
    const mesh = new T.SkinnedMesh(geo(), skin);
    mesh.add(bones[0]); h.add(mesh);
    h.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    mesh.frustumCulled = false; mesh.castShadow = true;
    const by = {}; bones.forEach((b) => (by[b.name] = b));
    const t0q = by.t0.quaternion.clone(), e = new T.Euler(), q = new T.Quaternion();
    for (let i = 0; i < 4; i++) by['f' + i + '0'].rotation.order = 'ZXY';
    // ногти
    function addNail(bone, L, r) {
      const g = new T.CylinderGeometry(r * 0.99, r * 0.86, L * 0.5, 10, 1, true, -0.95, 1.9);
      const n = new T.Mesh(g, nail); n.position.set(0, L * 0.66, r * 0.07); n.scale.z = 0.92; bone.add(n);
    }
    for (let i = 0; i < 4; i++) addNail(by['f' + i + '2'], KI.fingers[i].L[2], KI.fingers[i].r[2]);
    addNail(by.t2, KI.thumb.L[2], KI.thumb.r[2]);
    function setPose(p) {
      for (let i = 0; i < 4; i++) {
        by['f' + i + '0'].rotation.set(-p[i * 3], 0, KI.splay[i] * p[12]);
        by['f' + i + '1'].rotation.x = -p[i * 3 + 1]; by['f' + i + '2'].rotation.x = -p[i * 3 + 2];
      }
      e.set(-p[14], 0, p[13], 'ZXY'); by.t0.quaternion.copy(t0q).multiply(q.setFromEuler(e));
      by.t1.rotation.x = -p[15]; by.t2.rotation.x = -p[16];
    }
    setPose(POSE.grip);
    return { root: root, setPose: setPose };
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
    const skin = new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, skinning: true, roughness: 0.58 });
    const nail = new T.MeshStandardMaterial({ color: 0xe6bcae, roughness: 0.25 });
    const sleeveM = new T.MeshStandardMaterial({ map: sleeveTex(), roughness: 0.9, side: T.DoubleSide });
    const cuffTex = K.canvasTex(128, 16, (g, w, h) => { g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d1e21'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 2, h); }, { repeat: [3, 1] });
    const cuffM = new T.MeshStandardMaterial({ map: cuffTex, roughness: 1 });
    const mount = K.wheelMount;
    mount.updateMatrix();
    const mq = mount.quaternion.clone(), mp = mount.position.clone();
    const L1 = 0.31, L2 = 0.275;
    let GRIP_Y = 0.0876, GRIP_Z = 0.028;
    R.tune = function (y, z) { GRIP_Y = y; GRIP_Z = z; };

    const hands = [];
    for (const side of [1, -1]) {
      const hand = makeHand(side, skin, nail);
      cab.add(hand.root);
      const fore = new T.Group(); cab.add(fore);
      const fm = new T.Mesh(tubeGeo(0.054, 0.037, L2 - 0.03, 0.035), sleeveM); fm.castShadow = true; fore.add(fm);
      const cf = new T.Mesh(tubeGeo(0.0365, 0.0315, 0.045, 0.0), cuffM); cf.position.y = L2 - 0.034; cf.scale.z = 0.86; fore.add(cf);
      const up = new T.Group(); cab.add(up);
      const um = new T.Mesh(tubeGeo(0.072, 0.058, L1 + 0.02, 0.03), sleeveM); um.castShadow = true; up.add(um);
      const el = new T.Mesh(new T.SphereGeometry(0.058, 16, 12), new T.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.9 })); fore.add(el);
      const sh = new T.Mesh(new T.SphereGeometry(0.085, 16, 12), el.material); up.add(sh);
      hands.push({
        side: side, hand: hand, fore: fore, up: up,
        shoulder: new T.Vector3(K.DRV_X + side * 0.215, 1.0, 0.2),
        home: side * 58 * D, phi: side * 58 * D,
        min: side > 0 ? 8 * D : -102 * D, max: side > 0 ? 102 * D : -8 * D,
        mode: 'wheel', blend: null, idle: 0,
        cur: { p: new T.Vector3(), q: new T.Quaternion(), pose: POSE.grip.slice() },
      });
    }
    R.hands = hands;
    const RH = hands[0], LH = hands[1];

    // --- target poses (in the wheel mount frame) ---
    const vX = new T.Vector3(), vY = new T.Vector3(), vZ = new T.Vector3(), m4 = new T.Matrix4(), tp = new T.Vector3(), tq = new T.Quaternion();
    function setBasis(out) { m4.makeBasis(vX, vY, vZ); out.q.setFromRotationMatrix(m4); }
    const BETA = 38 * D, CB = Math.cos(BETA), SB = Math.sin(BETA);
    function gripPose(h, th, out) {
      // ладонь лежит на ободе сверху-снаружи, пальцы уходят за обод, запястье к водителю
      const s = Math.sin(th), c = Math.cos(th);
      vZ.set(s * CB, c * CB, SB); vY.set(s * SB, c * SB, -CB);
      vX.crossVectors(vY, vZ).normalize();
      out.p.set(s * K.WHEEL_R, c * K.WHEEL_R, 0).addScaledVector(vZ, GRIP_Z).addScaledVector(vY, -GRIP_Y);
      setBasis(out); out.pose = POSE.grip;
    }
    function hornPose(h, press, out) {
      vZ.set(0, 0.12, 1).normalize(); vY.set(-h.side * 0.5, 0.86, 0).normalize();
      vX.crossVectors(vY, vZ).normalize(); vY.crossVectors(vZ, vX).normalize();
      out.p.set(h.side * 0.045, -0.085, 0.045 - press * 0.008);
      setBasis(out); out.pose = POSE.open;
    }
    function stalkPose(h, dy, out) {
      vY.set(0.22, 0.25, -1).normalize(); vZ.set(0.45, 0.9, 0.2).normalize();
      vX.crossVectors(vY, vZ).normalize(); vZ.crossVectors(vX, vY).normalize();
      out.p.set(0.215, 0.022 + dy, -0.09).addScaledVector(vY, -0.16).addScaledVector(vZ, 0.012);
      setBasis(out); out.pose = POSE.point;
    }
    const tgt = { p: new T.Vector3(), q: new T.Quaternion(), pose: POSE.grip };
    function target(h, st) {
      if (h.mode === 'horn') hornPose(h, st.hornPress, tgt);
      else if (h.mode === 'stalk') stalkPose(h, st.stalkDy, tgt);
      else gripPose(h, st.wheel + h.phi, tgt);
      // to cabin coordinates
      tgt.p.applyQuaternion(mq).add(mp); tgt.q.premultiply(mq);
      return tgt;
    }
    function startBlend(h, dur, lift) {
      h.blend = { t: 0, dur: dur, lift: lift, p: h.cur.p.clone(), q: h.cur.q.clone(), pose: h.cur.pose.slice() };
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
          if (b.t >= 1) { h.blend = null; h.cur.p.copy(t.p); h.cur.q.copy(t.q); for (let i = 0; i < 17; i++) h.cur.pose[i] = t.pose[i]; }
          else {
            const e = b.t * b.t * (3 - 2 * b.t), up = Math.sin(Math.PI * b.t);
            h.cur.p.lerpVectors(b.p, t.p, e).addScaledVector(axisCab, b.lift * up);
            h.cur.q.copy(b.q).slerp(t.q, e);
            for (let i = 0; i < 17; i++) { const v = b.pose[i] + (t.pose[i] - b.pose[i]) * e; h.cur.pose[i] = v + (POSE.relax[i] - v) * up * 0.6; }
          }
        } else { h.cur.p.copy(t.p); h.cur.q.copy(t.q); for (let i = 0; i < 17; i++) h.cur.pose[i] = t.pose[i]; }
        h.hand.root.position.copy(h.cur.p); h.hand.root.quaternion.copy(h.cur.q);
        h.hand.setPose(h.cur.pose);

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
