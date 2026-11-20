// «За рулём»: вождение от первого лица. Физика газа и коробки, руль, голова, звук, управление.
(function () {
  'use strict';
  const T = THREE, K = window.KABINA, R = window.RUKI, W = window.MIR;
  const D2R = Math.PI / 180;

  // ======== НАСТРОЙКИ: сюда подставляются свой звук мотора и свой фон ========
  const CONFIG = {
    // Свой звук мотора: положи файл в drive/zvuk/ с одним из этих имён. Нужна ровная запись
    // работы двигателя на одних оборотах (лучше холостых), 2–6 секунд. Игра зациклит её и будет
    // менять высоту по оборотам. Пока файла нет, мотор синтезируется.
    motorFiles: ['zvuk/motor.wav', 'zvuk/motor.mp3', 'zvuk/motor.ogg', 'zvuk/motor.m4a'],
    startFile: 'zvuk/zapusk.wav',   // звук запуска (стартер и схватывание), играет при «Поехали»
    motorBaseRpm: 900,          // на каких оборотах записан файл (холостые твоей машины)
    // Свой фон за окном: круговая панорама 2:1 в drive/fon/nebo.jpg
    panorama: 'fon/nebo.jpg',
  };

  const P = { m: 1500, r: 0.31, fin: 4.1, gears: [2.8, 1.53, 1.0, 0.7], rev: 2.4, idle: 900, red: 6000, L: 2.7, dmax: 35 * D2R, lock: 450 * D2R };
  const MU = { asphalt: 0.8, street: 0.68, snow: 0.38 }, CRR = { asphalt: 0.014, street: 0.018, snow: 0.085 };

  const S = {
    x: 12.2, z: 100, psi: -Math.PI / 2, v: 0, rpm: P.idle, gear: 0, sel: 'D', gas: 0, brake: 0, steer: 0, wheelRate: 0,
    shiftT: 0, shiftLock: 0, slip: 0, aLong: 0, aLat: 0, pitch: 0, roll: 0, pitchV: 0, rollV: 0,
    signal: null, blink: 0, blinkOn: false, sigArm: 0, horn: false, hornPress: 0, act: null, stalk: 0,
    engine: 0, lookYaw: 0, lookPitch: -0.2, glance: 0, rosX: 0, rosXv: 0, rosZ: 0, rosZv: 0, odo: 0, running: false, t: 0,
  };
  const IN = { gas: 0, brake: 0, steer: 0, analogSteer: null, analogGas: null, analogBrake: null, horn: false, keys: {} };

  // ======== renderer / scene ========
  const holder = document.getElementById('game');
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  holder.appendChild(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(62, 1, 0.03, 2500);
  W.build(scene, renderer);
  W.tryPanorama(CONFIG.panorama);
  // image-based light from the sky itself: soft reflections on plastic, glass and chrome
  (function () {
    const es = new T.Scene();
    const sk = new T.Mesh(new T.SphereGeometry(50, 24, 12), W.sky.material); es.add(sk);
    const gr = new T.Mesh(new T.CircleGeometry(50, 24), new T.MeshBasicMaterial({ color: 0xdfe4ea })); gr.rotation.x = -Math.PI / 2; gr.position.y = -1.5; es.add(gr);
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.04).texture; pm.dispose();
  })();

  const car = new T.Group(); scene.add(car);
  const body = new T.Group(); body.position.y = 0.45; car.add(body);
  const cab = K.build(); body.add(cab);
  R.build(cab);
  const head = new T.Group(); cab.add(head); head.add(camera);
  // three r128 reads hex colours as linear: convert them once so that greys stay grey
  (function () {
    const seen = new Set();
    scene.traverse((o) => {
      if (o.isLight) { o.color.convertSRGBToLinear(); if (o.groundColor) o.groundColor.convertSRGBToLinear(); }
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) { if (seen.has(m)) continue; seen.add(m); if (m.color) m.color.convertSRGBToLinear(); if (m.emissive) m.emissive.convertSRGBToLinear(); if (m.uniforms) for (const k in m.uniforms) if (m.uniforms[k].value && m.uniforms[k].value.isColor) m.uniforms[k].value.convertSRGBToLinear(); }
      if (o.isMesh && o !== W.sky && cabHas(o)) { o.receiveShadow = true; }
    });
    scene.fog.color.convertSRGBToLinear();
    function cabHas(o) { for (let p = o; p; p = p.parent) if (p === cab) return true; return false; }
  })();
  camera.rotation.order = 'YXZ';

  // ======== mirrors ========
  const mirrors = [];
  function addMirror(name, w, h, fov, local, yaw) {
    const rt = new T.WebGLRenderTarget(w, h); rt.texture.encoding = T.sRGBEncoding;
    const cam = new T.PerspectiveCamera(fov, w / h, 0.5, 900);
    cam.position.copy(local); cam.rotation.set(-0.03, Math.PI + yaw, 0); cab.add(cam);
    const o = K.mirrorMats[name];
    const uv = o.obj.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    o.mat.map = rt.texture; o.mat.color.set(0xd6dde2); o.mat.needsUpdate = true;
    mirrors.push({ rt: rt, cam: cam });
  }
  addMirror('C', 512, 128, 13, new T.Vector3(0, 1.4, 0.4), 0);
  addMirror('R', 208, 264, 24, new T.Vector3(1.0, 1.06, -0.9), -0.12);
  addMirror('L', 208, 264, 24, new T.Vector3(-1.0, 1.06, -0.9), 0.12);
  let mirrorTick = 0;

  // ======== quality ========
  const isTouch = matchMedia('(pointer: coarse)').matches;
  let quality = +(localStorage.getItem('drive.q') || (isTouch ? 1 : 2));
  function applyQuality() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 2 ? 2 : quality === 1 ? 1.5 : 1));
    renderer.shadowMap.enabled = quality > 0; W.sun.castShadow = quality > 0;
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    document.querySelectorAll('#segQ button').forEach((b) => b.classList.toggle('on', +b.dataset.q === quality));
    resize();
  }
  function resize() {
    const w = holder.clientWidth || innerWidth, h = holder.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = w / h > 1.5 ? 66 : w / h > 1 ? 72 : 90; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ======== sound ========
  const A = { ctx: null, vol: 0.7 };
  function initAudio() {
    if (A.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (A.ctx = new AC());
    A.master = c.createGain(); A.master.gain.value = A.vol; A.master.connect(c.destination);
    const noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = (loop) => { const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = loop !== false; return s; };
    A.noise = noise;
    // --- engine: synthesised until a recording is found ---
    A.eng = c.createGain(); A.eng.gain.value = 0;
    A.engLP = c.createBiquadFilter(); A.engLP.type = 'lowpass'; A.engLP.frequency.value = 500; A.engLP.Q.value = 0.8;
    A.eng.connect(A.engLP); A.engLP.connect(A.master);
    A.osc = [];
    for (const o of [['sawtooth', 0.5, 0.5], ['sawtooth', 1, 0.3], ['square', 1.5, 0.12], ['triangle', 0.25, 0.5], ['sawtooth', 2.01, 0.07]]) {
      const os = c.createOscillator(); os.type = o[0]; const g = c.createGain(); g.gain.value = o[2]; os.connect(g); g.connect(A.eng); os.start(); A.osc.push({ os: os, k: o[1] });
    }
    A.intake = c.createGain(); A.intake.gain.value = 0; const inF = c.createBiquadFilter(); inF.type = 'bandpass'; inF.frequency.value = 380; inF.Q.value = 0.7;
    const n1 = noise(); n1.connect(inF); inF.connect(A.intake); A.intake.connect(A.master); n1.start(); A.intakeF = inF;
    // --- tyres and wind ---
    A.road = c.createGain(); A.road.gain.value = 0; const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 420; A.roadF = rf;
    const n2 = noise(); n2.connect(rf); rf.connect(A.road); A.road.connect(A.master); n2.start();
    // --- horn ---
    A.horn = c.createGain(); A.horn.gain.value = 0; const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2600;
    for (const f of [415, 522]) { const os = c.createOscillator(); os.type = 'square'; os.frequency.value = f; os.connect(hf); os.start(); }
    hf.connect(A.horn); A.horn.connect(A.master);
    // --- own engine recording, if the file is there ---
    (async function () {
      for (const url of CONFIG.motorFiles) {
        try {
          const r = await fetch(url); if (!r.ok) continue;
          const buf = await c.decodeAudioData(await r.arrayBuffer());
          const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
          A.sampleGain = c.createGain(); A.sampleGain.gain.value = 0;
          A.sampleF = c.createBiquadFilter(); A.sampleF.type = 'lowpass'; A.sampleF.frequency.value = 1800; A.sampleF.Q.value = 0.5;
          A.sampleBoost = c.createBiquadFilter(); A.sampleBoost.type = 'peaking'; A.sampleBoost.frequency.value = 220; A.sampleBoost.Q.value = 0.9; A.sampleBoost.gain.value = 0;
          s.connect(A.sampleBoost); A.sampleBoost.connect(A.sampleF); A.sampleF.connect(A.sampleGain); A.sampleGain.connect(A.master); s.start();
          A.sample = s; break;
        } catch (e) { /* try the next name */ }
      }
      try { const r = await fetch(CONFIG.startFile); if (r.ok) A.startBuf = await c.decodeAudioData(await r.arrayBuffer()); } catch (e) { /* no start sound */ }
      A.ready = true;
    })();
  }
  function click(freq, vol, dur) {
    if (!A.ctx) return; const c = A.ctx, s = A.noise(false), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3; g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(A.master); s.start(); s.stop(c.currentTime + dur + 0.02);
  }
  function audioUpdate(dt) {
    if (!A.ctx) return; const t = A.ctx.currentTime, f = (S.rpm / 60) * 2;
    for (const o of A.osc) o.os.frequency.setTargetAtTime(f * o.k * (1 + 0.004 * Math.sin(S.t * 31 + o.k)), t, 0.03);
    const load = S.gas, lvl = S.running ? 0.11 + 0.2 * load + 0.05 * (S.rpm / P.red) : 0;
    A.engLP.frequency.setTargetAtTime(260 + S.rpm * 0.22 + load * 1300, t, 0.05);
    const on = S.running && S.engine >= 1;
    if (A.sample) {
      // запись звучит на холостых как есть; выше по оборотам её высота растёт мягче, а сверху подмешивается синтез
      const r = S.rpm / CONFIG.motorBaseRpm, hiMix = Math.min(1, Math.max(0, (S.rpm - 1700) / 2400));
      A.sample.playbackRate.setTargetAtTime(Math.max(0.6, Math.min(2.7, 1 + (r - 1) * 0.62)), t, 0.04);
      A.sampleGain.gain.setTargetAtTime(on ? (0.55 + 0.45 * load) * (1 - 0.45 * hiMix) : 0, t, 0.06);
      A.sampleF.frequency.setTargetAtTime(1300 + load * 2600 + S.rpm * 0.3, t, 0.06);
      A.sampleBoost.gain.setTargetAtTime(load * 7, t, 0.08);
      A.eng.gain.setTargetAtTime(on ? lvl * (0.25 + 0.75 * hiMix) * 0.8 : 0, t, 0.06);
    } else A.eng.gain.setTargetAtTime(on ? lvl : 0, t, 0.06);
    A.intake.gain.setTargetAtTime(on ? load * 0.1 * (0.4 + S.rpm / P.red) : 0, t, 0.06); A.intakeF.frequency.setTargetAtTime(250 + S.rpm * 0.12, t, 0.1);
    const sp = Math.abs(S.v);
    A.road.gain.setTargetAtTime(Math.min(0.5, sp * 0.012 + S.slip * 0.15), t, 0.1); A.roadF.frequency.setTargetAtTime(260 + sp * 22, t, 0.2);
    A.horn.gain.setTargetAtTime(S.horn && S.hornPress > 0.55 ? 0.16 : 0, t, 0.012);
  }

  // ======== driving ========
  function torque(rpm) { const x = (rpm - 3400) / 3600; return 185 * (1 - 0.75 * x * x); }
  const approach = (cur, tgt, up, down) => (tgt > cur ? Math.min(tgt, cur + up) : Math.max(tgt, cur - down));
  function physics(dt) {
    // --- pedals: a key press is a foot that goes down gradually ---
    const gT = IN.analogGas !== null ? IN.analogGas : IN.gas, bT = IN.analogBrake !== null ? IN.analogBrake : IN.brake;
    S.gas = approach(S.gas, gT, dt * (IN.analogGas !== null ? 7 : 0.75 + 1.6 * S.gas), dt * 3.5);
    S.brake = approach(S.brake, bT, dt * (IN.analogBrake !== null ? 8 : 1.6 + 2.5 * S.brake), dt * 6);
    // --- steering ---
    const sp = Math.abs(S.v), mu = MU[W.surface(S.x, S.z)], crr = CRR[W.surface(S.x, S.z)];
    const smax = Math.max(0.07, Math.min(1, ((1.25 * mu * 9.81 * P.L) / Math.max(1, S.v * S.v)) / Math.tan(P.dmax)));
    const prev = S.steer;
    if (IN.analogSteer !== null) S.steer = approach(S.steer, IN.analogSteer * Math.max(smax, 0.25), dt * 2.6, dt * 2.6);
    else if (IN.steer) S.steer = approach(S.steer, IN.steer * smax, dt * (0.95 / (1 + sp / 25)) * (Math.sign(S.steer) === -IN.steer ? 1.8 : 1), dt * 1.2);
    else S.steer = approach(S.steer, 0, dt * Math.min(sp, 12) * 0.14, dt * Math.min(sp, 12) * 0.14);
    S.wheelRate = ((S.steer - prev) * P.lock) / dt;
    // --- gearbox ---
    const dirS = S.sel === 'R' ? -1 : 1, vd = S.v * dirS;
    const ratio = (S.sel === 'R' ? P.rev : P.gears[S.gear]) * P.fin, toRpm = (ratio * 60) / (2 * Math.PI * P.r);
    const rpmW = Math.max(0, vd) * toRpm;
    S.shiftLock -= dt;
    if (S.shiftT > 0) S.shiftT -= dt;
    else if (S.sel === 'D' && S.shiftLock <= 0) {
      const lowW = S.gear > 0 ? (rpmW / P.gears[S.gear]) * P.gears[S.gear - 1] : 0;
      if (S.gear < 3 && rpmW > 2050 + S.gas * 3400 && !S.slip) { S.gear++; S.shiftT = 0.42; S.shiftLock = 1.1; }
      else if (S.gear > 0 && (rpmW < 1150 + S.gas * 1300 || (S.gas > 0.86 && lowW < 4900))) { S.gear--; S.shiftT = 0.3; S.shiftLock = 0.9; }
    }
    const dip = S.shiftT > 0 ? Math.sin((Math.PI * S.shiftT) / 0.42) : 0;
    // --- engine speed through the torque converter ---
    const stall = P.idle + S.gas * (2300 - P.idle);
    let rpmT = Math.max(stall, rpmW + S.gas * 260) + S.slip * 1100;
    rpmT = Math.min(P.red, rpmT);
    S.rpm += (rpmT - S.rpm) * Math.min(1, dt * (rpmT > S.rpm ? 4.5 : 2.6));
    // --- forces ---
    const mult = 1 + 0.9 * Math.max(0, Math.min(1, 1 - rpmW / Math.max(S.rpm, 1)));
    let F = (torque(S.rpm) * S.gas * mult * ratio * 0.9) / P.r;
    if (S.engine < 1) F = 0;
    if (S.gas < 0.04 && S.engine >= 1) F += 1300 * Math.max(0, 1 - vd / 2.2);                 // automatic creep
    F -= (1 - S.gas) * (rpmW / P.red) * 1500 * (vd > 0.5 ? 1 : 0);           // engine braking
    F *= 1 - 0.75 * dip;
    const Fmax = mu * P.m * 9.81 * 0.52;
    const spin = F > Fmax; if (spin) F = Fmax * 0.9;
    S.slip = approach(S.slip, spin ? 1 : 0, dt * 4, dt * 3);
    const resist = P.m * 9.81 * crr + 0.62 * S.v * S.v + S.brake * mu * P.m * 9.81 * 1.05;
    const v0 = S.v;
    let a = (F * dirS) / P.m;
    S.v += a * dt;
    const dec = (resist / P.m) * dt;
    if (Math.abs(S.v) <= dec && Math.abs(F) < resist) S.v = 0; else S.v -= Math.sign(S.v) * dec;
    S.aLong = (S.v - v0) / dt;
    // --- turning: bicycle model with a grip limit ---
    let yaw = (S.v / P.L) * Math.tan(S.steer * P.dmax);
    const ayMax = mu * 9.81 * 0.95;
    if (Math.abs(yaw * S.v) > ayMax) yaw = (Math.sign(yaw) * ayMax) / Math.abs(S.v);
    S.aLat = yaw * S.v;
    const nx = S.x, nz = S.z, np = S.psi;
    S.psi -= yaw * dt;
    const fx = -Math.sin(S.psi), fz = -Math.cos(S.psi);
    S.x += fx * S.v * dt; S.z += fz * S.v * dt;
    // --- stay on the roads: fences and snow banks stop the car ---
    const m = W.DRIVE_MARGIN;
    if (!W.inside(S.x + fx * 1.9, S.z + fz * 1.9, m) || !W.inside(S.x - fx * 1.7, S.z - fz * 1.7, m)) {
      S.x = nx; S.z = nz; S.psi = np;
      if (Math.abs(S.v) > 1.5) { click(120, 0.9, 0.25); S.pitchV -= S.v * 0.02; }
      if (S.running && tipT <= 0) tip(isTouch ? 'Упёрся. Кнопка D/R слева вверху включает задний ход' : 'Упёрся. Клавиша R включает задний ход', 3);
      S.v *= -0.2;
    }
    S.odo += Math.abs(S.v) * dt;
    // --- body pitch and roll on springs ---
    const kp = 60, cp = 9;
    S.pitchV += ((S.aLong * 0.0075 - S.pitch) * kp - S.pitchV * cp) * dt; S.pitch += S.pitchV * dt;
    S.rollV += ((S.aLat * 0.007 - S.roll) * kp - S.rollV * cp) * dt; S.roll += S.rollV * dt;
    // --- rosary pendulum ---
    const w2 = 9.81 / 0.2;
    S.rosXv += (-w2 * S.rosX - 1.1 * S.rosXv - S.aLong / 0.2) * dt; S.rosX += S.rosXv * dt;
    S.rosZv += (-w2 * S.rosZ - 1.1 * S.rosZv - S.aLat / 0.2) * dt; S.rosZ += S.rosZv * dt;
    S.rosX = Math.max(-0.9, Math.min(0.9, S.rosX)); S.rosZ = Math.max(-0.9, Math.min(0.9, S.rosZ));
  }

  // ======== signals, horn and the right hand that works them ========
  function setSignal(s) {
    if (S.act) return;
    const next = S.signal === s ? null : s;
    S.act = { t: 0, next: next, dir: next === 'L' ? 1 : next === 'R' ? -1 : 0, done: false };
    R.setMode(R.RH, 'stalk', 0.2);
  }
  function toggleHazard() { S.signal = S.signal === 'H' ? null : 'H'; S.blink = 0; click(1800, 0.3, 0.04); S.stalk = 0; }
  function toggleGear() {
    if (Math.abs(S.v) > 1.2) { tip('Сначала остановись'); return; }
    S.sel = S.sel === 'D' ? 'R' : 'D'; S.gear = 0; K.setGear(S.sel); click(600, 0.5, 0.06);
    K.selector.rotation.x = S.sel === 'R' ? -0.3 : 0.15;
  }
  function controls(dt) {
    // turn signal: the hand reaches the stalk, flicks it, returns to the rim
    if (S.act) {
      const a = S.act; a.t += dt;
      if (!a.done && a.t > 0.24) { a.done = true; S.signal = a.next; S.blink = 0; S.sigArm = 0; click(900, 0.35, 0.05); }
      if (a.t > 0.44) { S.act = null; if (!S.horn) R.setMode(R.RH, 'wheel', 0.24); }
    }
    const stT = S.signal === 'L' ? 1 : S.signal === 'R' ? -1 : 0;
    S.stalk += (stT - S.stalk) * Math.min(1, dt * 30);
    K.stalkR.rotation.z = S.stalk * 0.13;
    // auto-cancel after the turn
    if (S.signal === 'L' || S.signal === 'R') {
      const d = S.signal === 'R' ? 1 : -1, w = S.steer * P.lock * d;
      if (w > 70 * D2R) S.sigArm = 1;
      if (S.sigArm && w < 12 * D2R) { S.signal = null; click(700, 0.3, 0.05); }
    }
    // blinking
    if (S.signal) {
      S.blink += dt; const on = S.blink % 0.74 < 0.37;
      if (on !== S.blinkOn) { S.blinkOn = on; click(on ? 2100 : 1500, 0.22, 0.03); }
    } else S.blinkOn = false;
    const L = S.blinkOn && (S.signal === 'L' || S.signal === 'H'), Rr = S.blinkOn && (S.signal === 'R' || S.signal === 'H');
    K.lampL.opacity = L ? 1 : 0.06; K.lampR.opacity = Rr ? 1 : 0.06;
    K.hazMat.emissiveIntensity = S.signal === 'H' && S.blinkOn ? 1.6 : 0.1;
    K.lampBrake.opacity = S.brake > 0.05 ? 0.9 : 0.06;
    hL.classList.toggle('on', L); hR.classList.toggle('on', Rr);
    // horn: palm onto the pad
    const wantHorn = IN.horn && !S.act;
    if (wantHorn && !S.horn) { S.horn = true; R.setMode(R.RH, 'horn', 0.15); }
    if (!wantHorn && S.horn) { S.horn = false; if (!S.act) R.setMode(R.RH, 'wheel', 0.22); }
    S.hornPress = approach(S.hornPress, S.horn && !R.RH.blend ? 1 : S.horn ? 0.7 : 0, dt * 7, dt * 9);
    K.hornPad.position.z = -0.028 - S.hornPress * 0.005;
  }

  // ======== per-frame visuals ========
  const eyeOff = new T.Vector3();
  function visuals(dt) {
    car.position.set(S.x, 0, S.z); car.rotation.y = S.psi;
    const sp = Math.abs(S.v), rough = W.surface(S.x, S.z) === 'asphalt' ? 0.35 : 1;
    const bump = (Math.sin(S.odo * 1.9) * 0.5 + Math.sin(S.odo * 4.7 + 1) * 0.3 + Math.sin(S.odo * 11.3) * 0.2) * Math.min(1, sp / 6) * rough;
    const idleShake = S.running ? Math.sin(S.t * (S.rpm / 60) * 6.283) * 0.0006 * (1.4 - S.rpm / P.red) : 0;
    body.position.y = 0.45 + bump * 0.006 + idleShake;
    body.rotation.x = S.pitch + bump * 0.0025; body.rotation.z = S.roll + Math.sin(S.odo * 3.1 + 2) * 0.003 * Math.min(1, sp / 6) * rough;
    const wheelAng = S.steer * P.lock;
    K.wheelSpin.rotation.z = -wheelAng;
    R.update({ wheel: wheelAng, wheelRate: S.wheelRate, hornPress: S.hornPress, stalkDy: S.act ? (S.act.t > 0.2 ? S.act.dir * 0.014 : 0) : 0 }, dt);
    // gauges
    const kmh = sp * 3.6;
    K.nSpeed.rotation.z = -(K.spAng(Math.min(1, kmh / 180)) + Math.PI / 2);
    K.nTach.rotation.z = -(K.taAng(Math.min(1, S.rpm / 7000)) + Math.PI / 2);
    K.rosary.rotation.set(S.rosX, 0, S.rosZ);
    K.pedalGas.rotation.x = -0.6 - S.gas * 0.35; K.pedalBrake.rotation.x = -0.6 - S.brake * 0.3;
    // head: mouse look + glance keys, plus the body being pushed around by acceleration
    const gl = (IN.keys.KeyZ ? 1 : 0) - (IN.keys.KeyC ? 1 : 0);
    S.glance += (gl * 1.25 - S.glance) * Math.min(1, dt * 7);
    const yaw = Math.max(-2.3, Math.min(2.3, S.lookYaw + S.glance)), pitch = S.lookPitch;
    camera.rotation.set(pitch - S.pitch * 0.6 + S.aLong * 0.0016, yaw, -S.roll * 0.5 - S.aLat * 0.0022);
    eyeOff.set(0, 0.09, -0.1).applyAxisAngle(T.Object3D.DefaultUp, yaw);
    head.position.set(K.EYE.x + eyeOff.x - S.aLat * 0.0035 - Math.sin(yaw) * 0.05, K.EYE.y - 0.09 + eyeOff.y + bump * 0.002, K.EYE.z + 0.1 + eyeOff.z + S.aLong * 0.004);
    hSpd.textContent = Math.round(kmh); hGear.textContent = S.sel === 'R' ? 'R' : 'D' + (S.gear + 1);
  }
  function renderMirrors() {
    if (quality < 1) return;
    const every = quality === 2 ? 1 : 3;
    if (mirrorTick++ % every) return;
    const m = mirrors[Math.floor(mirrorTick / every) % 3];
    cab.visible = false; const sh = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(m.rt); renderer.render(scene, m.cam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = sh; cab.visible = true;
  }

  // ======== input ========
  const hL = document.getElementById('hL'), hR = document.getElementById('hR'), hSpd = document.getElementById('hSpd'), hGear = document.getElementById('hGear');
  const tipEl = document.getElementById('tip'); let tipT = 0;
  function tip(s, sec) { tipEl.textContent = s; tipEl.hidden = false; tipEl.style.opacity = 1; tipT = sec || 2.5; }
  function keySet() {
    const k = IN.keys;
    IN.gas = k.KeyW || k.ArrowUp ? 1 : 0; IN.brake = k.KeyS || k.ArrowDown ? 1 : 0;
    IN.steer = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    IN.horn = !!(k.Space || k.KeyH) || IN.hornBtn;
  }
  addEventListener('keydown', (e) => {
    if (!S.running) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    IN.keys[e.code] = true; keySet();
    if (e.code === 'KeyQ') setSignal('L'); else if (e.code === 'KeyE') setSignal('R'); else if (e.code === 'KeyF') toggleHazard();
    else if (e.code === 'KeyR') toggleGear(); else if (e.code === 'KeyX') { S.lookYaw = 0; S.lookPitch = -0.2; }
  });
  addEventListener('keyup', (e) => { IN.keys[e.code] = false; keySet(); });
  addEventListener('blur', () => { IN.keys = {}; keySet(); });
  // mouse look
  const cv = renderer.domElement; let dragging = false;
  function look(dx, dy, k) { S.lookYaw = Math.max(-2.2, Math.min(2.2, S.lookYaw - dx * k)); S.lookPitch = Math.max(-0.75, Math.min(0.45, S.lookPitch - dy * k)); }
  cv.addEventListener('mousedown', () => { if (!S.running) return; dragging = true; if (!isTouch && cv.requestPointerLock) cv.requestPointerLock(); });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => { if (S.running && (document.pointerLockElement === cv || dragging)) look(e.movementX, e.movementY, 0.0024); });
  // touch: drag on the picture turns the head
  const touchLook = {};
  cv.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) touchLook[t.identifier] = { x: t.clientX, y: t.clientY }; e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { const p = touchLook[t.identifier]; if (p) { look(t.clientX - p.x, t.clientY - p.y, 0.005); p.x = t.clientX; p.y = t.clientY; } } e.preventDefault(); }, { passive: false });
  const endT = (e) => { for (const t of e.changedTouches) delete touchLook[t.identifier]; };
  cv.addEventListener('touchend', endT); cv.addEventListener('touchcancel', endT);
  // touch pads
  function pad(el, onMove, onEnd) {
    let id = null;
    const mv = (t) => { const r = el.getBoundingClientRect(); onMove((t.clientX - r.left) / r.width, (t.clientY - r.top) / r.height); };
    el.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; id = t.identifier; mv(t); e.preventDefault(); }, { passive: false });
    el.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === id) mv(t); e.preventDefault(); }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; onEnd(); } };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
  const knob = document.querySelector('#steer i'), gasI = document.querySelector('#pGas i'), brI = document.querySelector('#pBrake i');
  pad(document.getElementById('steer'), (u) => { const s = Math.max(-1, Math.min(1, (u - 0.5) * 2.3)); IN.analogSteer = Math.sign(s) * Math.pow(Math.abs(s), 1.4); knob.style.left = 50 + s * 38 + '%'; }, () => { IN.analogSteer = 0; knob.style.left = '50%'; });
  pad(document.getElementById('pGas'), (u, v) => { IN.analogGas = Math.max(0, Math.min(1, (1 - v) * 1.15)); gasI.style.height = IN.analogGas * 100 + '%'; }, () => { IN.analogGas = 0; gasI.style.height = 0; });
  pad(document.getElementById('pBrake'), (u, v) => { IN.analogBrake = Math.max(0, Math.min(1, (1 - v) * 1.15)); brI.style.height = IN.analogBrake * 100 + '%'; }, () => { IN.analogBrake = 0; brI.style.height = 0; });
  const btn = (id, fn) => document.getElementById(id).addEventListener('click', fn);
  btn('bL', () => setSignal('L')); btn('bR', () => setSignal('R')); btn('bHaz', toggleHazard);
  btn('bGear', () => { toggleGear(); document.getElementById('bGear').textContent = S.sel; });
  btn('bMenu', () => pause());
  const bh = document.getElementById('bHorn');
  bh.addEventListener('touchstart', (e) => { IN.hornBtn = true; keySet(); e.preventDefault(); }, { passive: false });
  bh.addEventListener('touchend', () => { IN.hornBtn = false; keySet(); });
  bh.addEventListener('mousedown', () => { IN.hornBtn = true; keySet(); }); bh.addEventListener('mouseup', () => { IN.hornBtn = false; keySet(); });
  // gamepad
  let padPrev = {};
  function gamepad() {
    const gp = navigator.getGamepads ? Array.from(navigator.getGamepads()).find((g) => g) : null;
    if (!gp) { if (padPrev.on) { IN.analogSteer = IN.analogGas = IN.analogBrake = null; padPrev = {}; } return; }
    padPrev.on = true;
    const dz = (v) => (Math.abs(v) < 0.08 ? 0 : v), b = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    IN.analogSteer = dz(gp.axes[0]); IN.analogGas = b(7); IN.analogBrake = b(6);
    if (gp.axes.length > 3) look(dz(gp.axes[2]) * 14, dz(gp.axes[3]) * 8, 0.0024);
    const press = (i, fn) => { const p = b(i) > 0.5; if (p && !padPrev[i]) fn(); padPrev[i] = p; };
    press(4, () => setSignal('L')); press(5, () => setSignal('R')); press(3, toggleHazard); press(1, toggleGear);
    IN.hornBtn = b(0) > 0.5; keySet();
  }

  // ======== menu ========
  const menu = document.getElementById('menu');
  function start() {
    initAudio(); if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    menu.hidden = true; S.running = true; document.getElementById('hud').hidden = false;
    if (S.engine === 0) {   // первый «Поехали»: заводим мотор
      S.engine = 0.001;
      const play = () => { if (A.startBuf) { const src = A.ctx.createBufferSource(), g = A.ctx.createGain(); g.gain.value = 0.9; src.buffer = A.startBuf; src.connect(g); g.connect(A.master); src.start(); } };
      if (A.ready) play(); else { let n = 0; const w = setInterval(() => { if (A.ready || ++n > 20) { clearInterval(w); play(); } }, 100); }
    }
    document.getElementById('touch').hidden = !isTouch;
    if (isTouch) { IN.analogSteer = 0; IN.analogGas = 0; IN.analogBrake = 0; tip('Заводим мотор… Веди пальцем по картинке, чтобы повернуть голову', 3); }
    else if (S.engine === 0) { tip('Заводим мотор…', 2); }
    document.getElementById('go').textContent = 'ПРОДОЛЖИТЬ';
  }
  function pause() { S.running = false; menu.hidden = false; if (document.exitPointerLock) document.exitPointerLock(); IN.keys = {}; keySet(); }
  document.getElementById('go').addEventListener('click', start);
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && S.running) pause(); else if (e.code === 'Enter' && !S.running) start(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && S.running && !isTouch && !dragging) { /* stay in the game, mouse is free */ } });
  document.querySelectorAll('#segQ button').forEach((b) => b.addEventListener('click', () => { quality = +b.dataset.q; localStorage.setItem('drive.q', quality); applyQuality(); }));
  const vol = document.getElementById('vol'); vol.value = +(localStorage.getItem('drive.vol') || 70); A.vol = vol.value / 100;
  vol.addEventListener('input', () => { A.vol = vol.value / 100; localStorage.setItem('drive.vol', vol.value); if (A.master) A.master.gain.value = A.vol; });
  if (isTouch) document.getElementById('keys').innerHTML = '<span>Слева внизу — руль</span><span>Справа — педали газа и тормоза: чем выше палец, тем сильнее</span><span>Веди пальцем по картинке — поворот головы</span><span>Сверху справа — поворотники, аварийка и сигнал</span>';

  // ======== loop ========
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (dt <= 0) return;
    S.t += dt;
    if (S.running && S.engine > 0 && S.engine < 1) {
      S.engine = Math.min(1, S.engine + dt / 1.25);
      if (S.engine >= 1 && W.gate.target === 0) { W.gate.target = 1; tip(isTouch ? 'Ворота открываются. Включи задний ход кнопкой D/R и выезжай назад' : 'Ворота открываются. Включи задний ход клавишей R и выезжай назад', 7); }
    }
    W.update(dt);
    if (S.running) { gamepad(); const n = Math.max(1, Math.ceil(dt / 0.012)); for (let i = 0; i < n; i++) physics(dt / n); controls(dt); }
    else { S.gas = approach(S.gas, 0, dt, dt * 3); S.rpm += (P.idle - S.rpm) * dt * 2; }
    visuals(dt);
    W.follow(car.position);
    W.snowUpdate(dt, car.position);
    audioUpdate(dt);
    if (tipT > 0) { tipT -= dt; if (tipT <= 0) tipEl.style.opacity = 0; }
    if (window.__hook) window.__hook(head, camera, cab);
    renderMirrors();
    renderer.render(scene, camera);
  }
  applyQuality();
  window.__D = { step: function (dt) { physics(dt); controls(dt); }, vis: visuals, S: S, IN: IN, P: P, K: K, R: R, W: W, start: start, setSignal: setSignal, toggleHazard: toggleHazard, toggleGear: toggleGear, camera: camera, renderer: renderer, scene: scene };
  requestAnimationFrame(frame);
})();
