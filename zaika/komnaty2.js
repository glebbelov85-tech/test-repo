'use strict';
// «Домик Зайки» 3.0 — семь новых комнат. Подключается после igra.js.
const ROOM_FR = () => (landscape ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 6.1, halfW: 4.8, halfH: 7.7 });
const VIOLET = '#b25de0';
const rugAt = (hex, z = 1.6) => { const rug = mesh(new T.CylinderGeometry(6.8, 6.8, 0.06, 40), M(hex, 1), 0, 0.03, z); rug.castShadow = false; rug.receiveShadow = true; rug.scale.z = 0.42; world.add(rug); };

// ===== 6. Прятки =====
ROOMS.pryatki = {
  intro: 'pryatki_intro',
  voice: ['pryatki_intro', 'pryatki_smotri', 'gde_zaika', 'kuku', 'nikogo'],
  setup(g) {
    // Зайка прячется за кустик у всех на глазах, потом кустики меняются местами: надо следить
    const n = g.n = [3, 3, 4][g.lvl];
    g.swaps = [1, 3, 5][g.lvl]; g.ms = [700, 560, 430][g.lvl];
    let sc, w;
    if (landscape) { setFrame({ cy: 3.0, halfW: 8.0, halfH: 4.6 }); sc = n === 4 ? 0.93 : 1.15; w = n === 4 ? 3.75 : 4.9; }
    else { setFrame({ cy: 2.8, halfW: 4.8, halfH: 7.7 }); sc = n === 4 ? 0.6 : 0.78; w = n === 4 ? 2.35 : 3.1; }
    lights(world); meadow(world);
    g.sc = sc; g.bz = 0.8;
    g.bushes = [...Array(n)].map((_, i) => {
      const b = mkKust(); b.position.set((i - (n - 1) / 2) * w, 0, g.bz); b.userData.cy = 1.5 * sc;
      hitBox(b, 3.7, 4.2, 2.4, 0, 1.9, 0); world.add(b); popIn(b, sc, i * 110);
      pickable(b, () => g.tap && g.tap(b));
      return b;
    });
    const zk = g.zk = actor(mkZaika()); zk.scale.setScalar(0.62 * sc); zk.position.set(0, -20, 0); world.add(zk); speaker = zk;
    g.cur = null; g.up = false;
    g.tick = () => { if (g.cur) { zk.position.x = g.cur.position.x; zk.position.z = g.cur.position.z - 1.3 * sc; } };
  },
  round(g) {
    const sc = g.sc, zk = g.zk, hidY = -0.25 * sc, upY = 1.9 * sc;
    let busy = false, ready = false;
    g.bushes.forEach(unhalo);
    const alive = () => g.alive() && current.g === g;
    (async () => {
      if (g.up) { zk.userData.wave = false; await tw(zk.position, { y: -5 * sc }, 380, 'in'); g.up = false; if (!alive()) return; }
      let nb; do nb = pick(g.bushes); while (nb === g.cur); g.cur = nb;
      zk.position.y = -5 * sc; zk.rotation.y = 0;
      SFX.boing(); await tw(zk.position, { y: upY }, 480, 'back'); if (!alive()) return;
      zk.userData.wave = true;
      await g.say('pryatki_smotri', zk); if (!alive()) return;
      zk.userData.wave = false;
      await tw(zk.position, { y: hidY }, 420, 'in'); if (!alive()) return;
      await wait(250);
      for (let s = 0; s < g.swaps; s++) {
        const [a, b] = shuffle(g.bushes), ax = a.position.x, bx = b.position.x;
        SFX.whoosh();
        await twf(g.ms, e => { const q = Math.sin(e * Math.PI) * 1.5; a.position.x = ax + (bx - ax) * e; b.position.x = bx + (ax - bx) * e; a.position.z = g.bz + q; b.position.z = g.bz - q; }, 'inout');
        if (!alive()) return;
        a.position.z = b.position.z = g.bz; await wait(140);
      }
      ready = true;
      Voice.say('gde_zaika', null);
      Idle.set(() => { Voice.say('gde_zaika', null); });
    })();
    g.tap = async b => {
      if (busy || !ready) return;
      wobble(b, 0.1);
      if (b === g.cur) {
        busy = true; g.bushes.forEach(unhalo); SFX.boing();
        await tw(zk.position, { y: upY }, 380, 'back');
        zk.userData.wave = true; g.up = true;
        g.solved(V(zk.position.x, 3.8 * sc, zk.position.z + 1.5), 'kuku', zk);
      } else {
        const hint = g.miss();
        if (hint) { halo(g.cur, 1.6, 1.5); tw(zk.position, { y: 0.5 * sc }, 400, 'back'); }
        Voice.say(['nikogo', hint ? 'podskazka' : 'gde_zaika'], null);
      }
    };
    g.repeat = () => { if (ready) Voice.say('gde_zaika', null); };
  },
};
ICONS.pryatki = g => {
  const z = mkZaika(); z.scale.setScalar(0.5); z.position.set(0.2, 0.85, -0.5); g.add(z);
  const b = mkKust(); b.scale.setScalar(0.62); b.position.set(0, 0, 0.1); g.add(b);
  g.userData.tick = t => { z.position.y = 0.75 + Math.max(0, Math.sin(t * 1.3)) * 0.35; };
};

// ===== 7. Пирамидка =====
const RING_COLS = Object.keys(COLORS); // шесть цветов, для каждого есть запись «Это красный»
// Название колечка: размер и цвет («Самое большое… красное колечко»), пока записей нет — «Это красный»
const ringSay = (c, i, n) => Voice.have.has('kol_' + c) ? [i === 0 ? 'kol_samoe_b' : i === n - 1 ? 'kol_samoe_m' : 'kol_pomenshe', 'kol_' + c] : ['eto_' + c];
ROOMS.piramidka = {
  intro: 'piramidka_intro',
  voice: ['piramidka_intro', 'kol_bolshoe', 'kol_ne', 'piramidka_gotova', 'kol_samoe_b', 'kol_pomenshe', 'kol_samoe_m', ...Object.keys(COLORS).flatMap(c => ['eto_' + c, 'kol_' + c])],
  setup(g) {
    setFrame(ROOM_FR()); lights(world);
    interior(world, { wall: '#d6f0e2', dot: '#bfe4d0', floorHue: 30, floorL: 65 }); rugAt('#ffcf7a');
    const z = g.zaika = actor(mkZaika());
    if (landscape) { z.position.set(-7.0, 0, 0.4); z.scale.setScalar(1.15); g.px = -3.9; g.k = 1; }
    else { z.position.set(-3.4, 0, 0.6); z.scale.setScalar(0.98); g.px = 1.3; g.k = 0.8; }
    z.rotation.y = 0.35; world.add(z);
    g.pz = 1.2; g.rings = []; g.stack = null;
    g.tick = t => g.rings.forEach(r => { const U = r.userData; if (!U.used) { r.position.y = U.by + Math.sin(t * 1.5 + U.ph) * 0.12; r.rotation.y = Math.sin(t * 1.1 + U.ph) * 0.25; } });
  },
  round(g) {
    const n = [4, 5, 6][g.lvl], k = g.k * (n === 6 && landscape ? 0.85 : 1);
    g.rings.forEach(r => { unpick(r); world.remove(r); }); g.rings = [];
    if (g.stack) world.remove(g.stack);
    const st = g.stack = grp(g.px, 0, g.pz); world.add(st);
    const wood = M('#e0b074', 0.6), th = 0.56 * k, poleH = 0.3 + n * th + 0.45;
    st.add(cyl(wood, 1.75 * k, 1.85 * k, 0.3, 0, 0.15, 0, 32)); st.add(cyl(wood, 0.15, 0.19, poleH, 0, poleH / 2, 0, 14));
    popIn(st, 1);
    const cols = shuffle(RING_COLS);
    const slots = shuffle(landscape ? [[-0.6, 6.1], [2.5, 6.1], [5.6, 6.1], [0.6, 2.5], [3.7, 2.5], [6.8, 2.5]] : n === 6 ? [[-2.5, 10.4], [2.5, 10.4], [-2.5, 7.7], [2.5, 7.7], [-2.5, 5.0], [2.5, 5.0]] : [[-2.5, 9.9], [2.5, 9.9], [-2.5, 6.5], [2.5, 6.5], [0, 8.2]]).slice(0, n);
    const order = [];
    for (let i = 0; i < n; i++) {
      const rad = 1.3 - i * (0.7 / (n - 1)), r = mkKoltso(rad, COLORS[cols[i]]), U = r.userData; U.c = cols[i];
      U.r = rad; U.by = slots[i][1]; U.ph = Math.random() * 6; U.cy = 0;
      r.position.set(slots[i][0], U.by, 1.0); hitBox(r, rad * 2 + 0.9, rad * 2 + 0.9, 1.2);
      world.add(r); g.rings.push(r); order.push(r); popIn(r, k, 150 + i * 90);
      pickable(r, () => tap(r));
    }
    let idx = 0, busy = false;
    const tap = async r => {
      if (busy || r.userData.used) return;
      const want = order[idx];
      if (r !== want) {
        const hint = g.miss(); wobble(r, 0.25);
        if (hint) halo(want, want.userData.r + 0.55);
        Voice.say(hint ? ['podskazka', 'kol_bolshoe'] : 'kol_ne');
        return;
      }
      busy = true; r.userData.used = true; unpick(r); g.rings.forEach(unhalo); g.wrong = 0; SFX.plop();
      const top = V(g.px, poleH + 1.2, g.pz);
      tw(r.rotation, { x: Math.PI / 2, y: 0, z: 0 }, 380, 'inout');
      await arc(r, top, 420, 0.8);
      await tw(r.position, { y: 0.3 + 0.3 * k + idx * th }, 240, 'in');
      SFX.thunk(); squash(st, 260); tone(392 + idx * 70, 0, 0.25, 'triangle', 0.12);
      const name = ringSay(r.userData.c, idx, n);
      idx++; busy = false;
      if (idx < n) { Voice.say(name); Idle.poke(); return; }
      Idle.off();
      const cap = ball(M('#ff5d8a', 0.3), 0.36 * k, 0, poleH + 0.1, 0); st.add(cap); popIn(cap, 0.36 * k);
      g.rings.forEach(x => { st.attach(x); });
      hop(st, 0.5, 450);
      g.solved(V(g.px, poleH + 0.5, g.pz + 1), [...name, 'piramidka_gotova']);
    };
    g.repeat = () => Voice.say('kol_bolshoe');
    g.say('kol_bolshoe');
    Idle.set(() => { Voice.say('kol_bolshoe'); if (!busy && order[idx]) nudge(order[idx]); });
  },
};
ICONS.piramidka = g => {
  const st = grp(0, 0, 0.1);
  st.add(cyl(M('#e0b074', 0.6), 0.95, 1.0, 0.18, 0, 0.09, 0, 24)); st.add(cyl(M('#e0b074', 0.6), 0.09, 0.11, 2.3, 0, 1.15, 0, 10));
  [[0.78, '#f0352b'], [0.6, '#ffd21f'], [0.44, '#35b24a'], [0.3, '#2a6df4']].forEach(([r, c], i) => { const m = mesh(new T.TorusGeometry(r, 0.21, 10, 28), M(c, 0.3), 0, 0.4 + i * 0.4, 0); m.rotation.x = Math.PI / 2; st.add(m); });
  st.add(ball(M('#ff5d8a', 0.3), 0.2, 0, 2.3, 0));
  g.add(st); g.userData.tick = t => { st.rotation.z = Math.sin(t * 1.4) * 0.05; };
};

// ===== 8. Ведёрки =====
ROOMS.vedra = {
  intro: 'vedra_intro',
  voice: ['vedra_intro', 'v_vedro', 'vedro_ne', ...Object.keys(COLORS).map(c => 'eto_' + c)],
  setup(g) {
    const n = [3, 4, 5][g.lvl];
    setFrame(ROOM_FR()); lights(world); meadow(world);
    g.cols = shuffle(Object.keys(COLORS)).slice(0, n);
    const z = g.zaika = actor(mkZaika()); let xs, sc;
    if (landscape) {
      z.position.set(-6.6, 0, 0.5); z.scale.setScalar(1.25); z.rotation.y = 0.35;
      xs = { 2: [-1.0, 4.6], 3: [-2.2, 1.8, 5.8], 4: [-3.3, -0.3, 2.7, 5.7], 5: [-3.6, -1.15, 1.3, 3.75, 6.2] }[n]; sc = { 2: 1.5, 3: 1.3, 4: 1.05, 5: 0.92 }[n]; g.home = V(1.9, 6.1, 1.5);
    } else {
      terrace(4.2, -1.2); z.position.set(-2.6, 4.2, -2.9); z.scale.setScalar(1.05); z.rotation.y = 0.3;
      xs = { 2: [-2.3, 2.3], 3: [-3.1, 0, 3.1], 4: [-3.55, -1.18, 1.18, 3.55], 5: [-3.8, -1.9, 0, 1.9, 3.8] }[n]; sc = { 2: 1.35, 3: 1.05, 4: 0.82, 5: 0.66 }[n]; g.home = V(1.9, 8.6, 1.2);
    }
    world.add(z); g.sc = sc;
    g.buckets = g.cols.map((c, i) => {
      const b = mkVedro2(COLORS[c]); b.position.set(xs[i], 0, 1.2); b.userData.c = c; b.userData.cy = 0.75 * sc;
      hitBox(b, 2.1, 2.1, 2.1, 0, 0.75, 0); world.add(b); popIn(b, sc, i * 110);
      pickable(b, () => g.tap && g.tap(b));
      return b;
    });
    g.ball = null; g.old = []; g.prev = null;
    g.tick = t => { const b = g.ball; if (b && !b.userData.held && !b.userData.busy) { b.position.y = g.home.y + Math.sin(t * 1.8) * 0.15; b.rotation.z = Math.sin(t * 1.2) * 0.2; } };
  },
  round(g) {
    const sc = g.sc;
    g.old.forEach(b => tws(b, 0.001, 250, 'in').then(() => world.remove(b))); g.old = [];
    const c = bag(g, 'c', g.cols);
    const ball = g.ball = mkMyach(COLORS[c]), bs = Math.max(0.95, sc * 0.92);
    ball.position.copy(g.home); ball.userData.cy = 0; hitBox(ball, 1.9, 1.9, 1.6); world.add(ball); popIn(ball, bs, 150);
    let busy = false;
    const tryB = async b => {
      if (busy) return false;
      if (b.userData.c === c) {
        busy = true; ball.userData.busy = true; unpick(ball); g.buckets.forEach(unhalo);
        tws(ball, Math.min(bs, sc * 0.95), 300);
        await arc(ball, V(b.position.x, 2.4 * sc, b.position.z), 420, 1.3);
        await tw(ball.position, { y: 0.95 * sc }, 200, 'in');
        SFX.thunk(); squash(b, 300); g.ball = null; g.old.push(ball);
        g.solved(V(b.position.x, 2.1 * sc, b.position.z + 0.6));
        return true;
      }
      const hint = g.miss(); wobble(b, 0.1);
      const tb = g.buckets.find(x => x.userData.c === c);
      if (hint && tb) halo(tb, 1.25, 0.75);
      Voice.say(['vedro_ne', hint ? 'podskazka' : null]);
      return false;
    };
    g.tap = b => { tryB(b); };
    pickable(ball, null, {
      onDrop: () => { const b = nearestScr(g.buckets, ball, 0.24); if (!b) return false; const ok = b.userData.c === c; tryB(b); return ok; },
      onTap: () => { hop(ball, 0.4); Voice.say(['eto_' + c, 'v_vedro']); },
    });
    g.repeat = () => Voice.say(['eto_' + c, 'v_vedro']);
    g.say(['eto_' + c, 'v_vedro']);
    Idle.set(() => { Voice.say(['eto_' + c, 'v_vedro']); if (g.ball === ball && !busy) nudge(ball); });
  },
};
ICONS.vedra = g => {
  [['krasny', -0.85], ['siniy', 0.85]].forEach(([c, x]) => { const b = mkVedro2(COLORS[c]); b.scale.setScalar(0.72); b.position.set(x, 0, 0); g.add(b); });
  const m = mkMyach(COLORS.zhelty); m.scale.setScalar(0.7); m.position.set(0, 2.2, 0); g.add(m);
  g.userData.tick = t => { m.position.y = 2.2 + Math.abs(Math.sin(t * 2.2)) * 0.45; m.position.x = Math.sin(t * 1.1) * 0.85; };
};

// ===== 9. Кто что ест =====
const EDA = {
  zaika: ['morkovka', mkZaika, 0.92, mkMorkovka],
  mishka: ['med', mkMishka, 1.1, mkMed],
  ezhik: ['yabloko', mkEzhik, 1.3, mkYabloko],
  koshka: ['moloko', () => mkZver('koshka'), 1.3, mkMiska],
  sobaka: ['kost', () => mkZver('sobaka'), 1.25, mkKost],
};
ROOMS.eda = {
  intro: 'eda_intro',
  voice: ['eda_intro', 'ne_to', 'nyam', ...Object.values(EDA).map(e => 'kto_lubit_' + e[0])],
  setup(g) {
    const n = [3, 4, 5][g.lvl];
    lights(world);
    let P, k;
    if (landscape) {
      setFrame({ cy: 3.5, halfW: 8.1, halfH: 4.9 }); meadow(world);
      const w = { 3: 5.0, 4: 4.1, 5: 3.3 }[n]; k = { 3: 1.15, 4: 1, 5: 0.84 }[n]; P = [...Array(n)].map((_, i) => [(i - (n - 1) / 2) * w, 0, 0.6]); g.home = V(0, 5.9, 1.5);
    } else {
      setFrame({ cy: n > 2 ? 5.7 : 4.6, halfW: 4.8, halfH: 7.7 }); meadow(world);
      const Ty = 4.0; if (n > 2) terrace(Ty, -1.2); k = 1.05;
      P = [[-2.35, 0, 1.2], [2.35, 0, 1.2], [-2.35, Ty, -2.9], [2.35, Ty, -2.9]].slice(0, n); if (n === 3) P[2][0] = 0;
      if (n === 5) { P = [[-2.35, 0, 1.2], [2.35, 0, 1.2], [-3.1, Ty, -2.9], [0, Ty, -2.9], [3.1, Ty, -2.9]]; k = 0.88; }
      g.home = V(0, n > 2 ? 10.0 : 7.2, 1.0);
    }
    g.set = shuffle(Object.keys(EDA)).slice(0, n);
    g.an = g.set.map((who, i) => {
      const [, f, s0] = EDA[who], a = actor(f()), s = s0 * k, U = a.userData;
      U.who = who; U.cy = U.h * 0.5 * s; a.position.set(P[i][0], P[i][1], P[i][2]);
      a.rotation.y = (who === 'zaika' || who === 'mishka' ? 0 : 0.45) - P[i][0] * 0.05;
      hitBox(a, 2.6 / s0, 3.4 / s0, 2.4 / s0, 0, 1.6 / s0, 0); world.add(a); popIn(a, s, i * 110);
      pickable(a, () => g.tap && g.tap(a));
      return a;
    });
    g.food = null; g.prev = null;
    g.tick = t => { const f = g.food; if (f && !f.userData.held && !f.userData.busy) { f.position.y = g.home.y + Math.sin(t * 1.8) * 0.15; f.rotation.y = Math.sin(t * 1.2) * 0.5; } };
  },
  round(g) {
    g.an.forEach(unhalo);
    const who = bag(g, 'w', g.set);
    const name = EDA[who][0], q = 'kto_lubit_' + name;
    const food = g.food = EDA[who][3](); food.position.copy(g.home); food.userData.cy = 0;
    hitBox(food, 1.5, 1.5, 1.3); world.add(food); popIn(food, 1.55, 150);
    let busy = false;
    const tryA = async a => {
      if (busy) return false;
      const U = a.userData;
      if (U.who === who) {
        busy = true; food.userData.busy = true; unpick(food); g.an.forEach(unhalo);
        const s = a.scale.x, mp = a.position.clone().add(V(0, U.h * 0.5 * s, 1.0 * s));
        tws(food, 0.9, 380);
        await arc(food, mp, 420, 1.2);
        for (let i = 0; i < 2; i++) { SFX.munch(); squash(a, 240); tws(food, 0.5 - i * 0.4, 200); await wait(230); }
        world.remove(food); g.food = null; happy(a, false);
        g.solved(mp.clone().add(V(0, 0.8, 0.5)), 'nyam', a);
        return true;
      }
      const hint = g.miss(); headNo(a); wobble(a, 0.07);
      const ta = g.an.find(x => x.userData.who === who);
      if (hint && ta) halo(ta, 1.5 / EDA[who][2], ta.userData.h * 0.5);
      Voice.say(['ne_to', hint ? 'podskazka' : q], null);
      return false;
    };
    g.tap = a => { hop(a, 0.4); tryA(a); };
    pickable(food, null, {
      onDrop: () => { const a = nearestScr(g.an, food, 0.26); if (!a) return false; const ok = a.userData.who === who; tryA(a); return ok; },
      onTap: () => { hop(food, 0.4); Voice.say(q, null); },
    });
    g.repeat = () => Voice.say(q, null);
    g.say(q, null);
    Idle.set(() => { Voice.say(q, null); if (g.food === food && !busy) nudge(food); });
  },
};
ICONS.eda = g => {
  const c = mkMorkovka(); c.scale.setScalar(1.25); c.position.set(-0.85, 1.0, 0.2); c.rotation.z = 0.35; g.add(c);
  const m = mkMed(); m.scale.setScalar(1.45); m.position.set(0.75, 0.68, 0); g.add(m);
  g.userData.tick = t => { c.rotation.z = 0.35 + Math.sin(t * 1.6) * 0.15; c.position.y = 1.0 + Math.sin(t * 1.6) * 0.1; };
};

// ===== 10. Много и мало =====
const KUCHA = [[0, 0], ...[...Array(6)].map((_, i) => [Math.cos(i * Math.PI / 3) * 1.05, Math.sin(i * Math.PI / 3) * 1.05])];
ROOMS.mnogo = {
  intro: 'mnogo_intro',
  voice: ['mnogo_intro', 'gde_mnogo', 'gde_malo', 'tut_mnogo', 'tut_malo'],
  setup(g) {
    setFrame(ROOM_FR()); lights(world);
    interior(world, { wall: '#ffe3ef', dot: '#ffc9dd', floorHue: 28, floorL: 66 }); rugAt('#b9e6ff');
    const z = g.zaika = actor(mkZaika()); let xs, ty, ts;
    if (landscape) { z.position.set(-6.6, 0, 0.5); z.scale.setScalar(1.25); z.rotation.y = 0.35; xs = [-1.2, 4.7]; ty = 3.0; ts = 1.28; }
    else { z.position.set(0, 0, 2.2); z.scale.setScalar(1.08); xs = [-2.4, 2.4]; ty = 7.6; ts = 1.0; }
    world.add(z); g.ts = ts;
    g.trays = xs.map((x, i) => {
      const t = grp(x, ty, 0.3), top = grp(); top.rotation.x = 0.85; top.add(mkTarelka()); t.add(top);
      t.add(cyl(M('#c98a55', 0.6), 0.14, 0.2, ty / ts, 0, -ty / ts / 2 - 0.1, -0.5, 12));
      t.add(cyl(M('#c98a55', 0.6), 0.9, 1.0, 0.2, 0, -ty / ts + 0.1, -0.5, 24));
      t.userData.top = top; t.userData.cy = 0; hitBox(t, 3.7, 3.4, 2.4);
      world.add(t); popIn(t, ts, i * 150);
      pickable(t, () => g.tap && g.tap(t));
      return t;
    });
    g.items = []; g.n = 0; g.last = [];
  },
  round(g) {
    g.trays.forEach(unhalo);
    g.items.forEach(x => x.parent && x.parent.remove(x)); g.items = [];
    const few = pick([[1, 2], [2, 3], [3, 4, 5]][g.lvl]), many = g.lvl === 2 ? few + 2 : pick([[5, 6, 7], [5, 6]][g.lvl]); // на сложном разница всего в два
    let ask = g.n === 0 ? 'mnogo' : pick(['mnogo', 'malo']);
    if (g.last.length >= 2 && g.last.slice(-2).every(a => a === ask)) ask = ask === 'mnogo' ? 'malo' : 'mnogo';
    g.last.push(ask); g.n++;
    const side = rnd(2), kind = pick(['yabloko', 'morkovka', 'myach']), col = COLORS[pick(Object.keys(COLORS))];
    g.trays.forEach((t, i) => {
      const cnt = i === side ? many : few; t.userData.many = i === side;
      const sl = cnt === 1 ? [KUCHA[0]] : cnt < 4 ? shuffle(KUCHA.slice(1)).slice(0, cnt).map(p => [p[0] * 0.6, p[1] * 0.6]) : shuffle(KUCHA.slice(1)).slice(0, cnt - 1).concat([KUCHA[0]]);
      sl.forEach((p, j) => {
        const it = kind === 'yabloko' ? mkYabloko() : kind === 'morkovka' ? mkMorkovka() : mkMyach(col);
        const s = kind === 'yabloko' ? 0.95 : kind === 'morkovka' ? 0.8 : 0.68;
        it.position.set(p[0], kind === 'morkovka' ? 0.6 : 0.48, p[1]); if (kind !== 'myach') it.rotation.x = -0.85;
        t.userData.top.add(it); g.items.push(it); popIn(it, s, 200 + j * 70, 350);
      });
    });
    let busy = false;
    g.tap = t => {
      if (busy) return;
      const ok = t.userData.many === (ask === 'mnogo');
      hop(t, 0.3, 300);
      if (ok) { busy = true; g.trays.forEach(unhalo); g.solved(t.position.clone().add(V(0, 1.2, 1.5)), 'tut_' + ask); return; }
      const hint = g.miss(), tt = g.trays.find(x => x !== t);
      if (hint) halo(tt, 2.05);
      Voice.say(['tut_' + (ask === 'mnogo' ? 'malo' : 'mnogo'), hint ? 'podskazka' : null, 'gde_' + ask]);
    };
    g.repeat = () => Voice.say('gde_' + ask);
    g.say('gde_' + ask);
    Idle.set(() => Voice.say('gde_' + ask));
  },
};
ICONS.mnogo = g => {
  const mk = (x, n, s) => {
    const t = grp(x, 1.25, 0.2), top = grp(); top.rotation.x = 0.9; const pl = mkTarelka(); top.add(pl); t.add(top); t.scale.setScalar(s);
    (n === 1 ? [KUCHA[0]] : KUCHA.slice(0, n)).forEach(p => { const a = mkYabloko(); a.scale.setScalar(0.95); a.position.set(p[0], 0.48, p[1]); a.rotation.x = -0.9; top.add(a); });
    g.add(t); return t;
  };
  const a = mk(-0.95, 6, 0.5), b = mk(1.05, 1, 0.42);
  g.userData.tick = t => { a.position.y = 1.3 + Math.sin(t * 1.5) * 0.06; b.position.y = 1.2 + Math.sin(t * 1.5 + 2) * 0.06; };
};

// ===== 11. Найди такую же =====
const TOY = {
  myach_k: ['myach', () => mkMyach(COLORS.krasny), 1.25, 0],
  myach_s: ['myach', () => mkMyach(COLORS.siniy), 1.25, 0],
  myach_z: ['myach', () => mkMyach(COLORS.zeleny), 1.25, 0],
  krug: ['fig', () => mkFigura('krug'), 0.8, 0],
  kvadrat: ['fig', () => mkFigura('kvadrat'), 0.8, 0],
  zvezda: ['fig', () => mkFigura('zvezda'), 0.8, 0],
  serdce: ['fig', () => mkFigura('serdce'), 0.8, 0],
  yabloko: ['yabloko', mkYabloko, 1.75, -0.1],
  morkovka: ['morkovka', mkMorkovka, 1.25, -0.1],
  med: ['med', mkMed, 1.45, -0.05],
  utka: ['utka', () => mkZver('utka'), 0.72, -0.8],
  mishka: ['mishka', mkMishka, 0.55, -0.8],
  koltso: ['koltso', () => mkKoltso(0.52, VIOLET), 1, 0],
};
function mkToy(key) { const [, f, s, dy] = TOY[key], g = grp(), m = f(); m.scale.setScalar(s); m.position.y = dy; g.add(m); g.userData.key = key; g.userData.ph = Math.random() * 6; return g; }
ROOMS.para = {
  intro: 'para_intro',
  voice: ['para_intro', 'takaya_zhe', 'drugaya'],
  setup(g) {
    setFrame(ROOM_FR()); lights(world);
    interior(world, { wall: '#e9e2ff', dot: '#d3c6ff', floorHue: 30, floorL: 66 }); rugAt('#ffd9a0');
    const n = g.n = [3, 4, 6][g.lvl], z = g.zaika = actor(mkZaika());
    if (landscape) {
      z.position.set(-6.6, 0, 0.5); z.scale.setScalar(1.22); z.rotation.y = 0.35; g.sp = V(-3.3, 3.45, 1.2);
      g.P = { 2: [[1.8, 3.9], [5.6, 3.9]], 3: [[0.7, 3.9], [3.7, 3.9], [6.7, 3.9]], 4: [[0.3, 3.9], [2.65, 3.9], [5.0, 3.9], [7.35, 3.9]], 6: [[1.2, 6.0], [4.0, 6.0], [6.8, 6.0], [1.2, 3.0], [4.0, 3.0], [6.8, 3.0]] }[n]; g.ts = { 3: 1.2, 4: 0.95, 6: 1.0 }[n];
    } else {
      z.position.set(-2.9, 0, 0.8); z.scale.setScalar(1.05); z.rotation.y = 0.3; g.sp = V(1.7, 3.0, 1.4);
      g.P = { 2: [[-2.3, 8.6], [2.3, 8.6]], 3: [[-2.3, 10.1], [2.3, 10.1], [0, 6.7]], 4: [[-2.3, 10.3], [2.3, 10.3], [-2.3, 6.8], [2.3, 6.8]], 6: [[-2.3, 11.0], [2.3, 11.0], [-2.3, 8.3], [2.3, 8.3], [-2.3, 5.6], [2.3, 5.6]] }[n]; g.ts = n === 6 ? 1.0 : 1.2;
    }
    world.add(z);
    // тумба с образцом и полочки
    const col = cyl(M('#ffffff', 0.5), 0.75, 0.9, g.sp.y - 1.15, g.sp.x, (g.sp.y - 1.15) / 2, g.sp.z, 24); col.receiveShadow = true; world.add(col);
    world.add(cyl(M('#ffd54f', 0.35), 1.05, 1.05, 0.14, g.sp.x, g.sp.y - 1.1, g.sp.z, 28));
    g.P.forEach(([x, y]) => { const s = rbox(M('#c98a55', 0.6), 2.2 * g.ts / 1.2, 0.24, 1.5, 0.1, x, y - 0.86 * g.ts - 0.12, -2.7); s.receiveShadow = true; world.add(s); });
    g.toys = []; g.prev = null;
    g.tick = t => g.toys.forEach(x => { if (!x.userData.busy) x.rotation.y = Math.sin(t * 1.2 + x.userData.ph) * 0.55; });
  },
  round(g) {
    const n = g.n;
    g.toys.forEach(x => { unpick(x); world.remove(x); }); g.toys = [];
    const keys = Object.keys(TOY);
    const target = bag(g, 't', keys);
    const pool = shuffle(keys.filter(k => k !== target)), fam = k => TOY[k][0];
    let ds = [];
    if (g.lvl < 1) { const used = new Set([fam(target)]); for (const k of pool) { if (ds.length >= n - 1) break; if (!used.has(fam(k))) { used.add(fam(k)); ds.push(k); } } }
    else { ds = pool.filter(k => fam(k) === fam(target)).slice(0, g.lvl); /* похожие игрушки: такой же мячик другого цвета, другая фигурка */ for (const k of pool) { if (ds.length >= n - 1) break; if (!ds.includes(k)) ds.push(k); } }
    const sample = mkToy(target); sample.position.copy(g.sp); world.add(sample); g.toys.push(sample); popIn(sample, 1.3, 100);
    let busy = false;
    const cands = shuffle([target, ...ds]).map((key, i) => {
      const c = mkToy(key); c.position.set(g.P[i][0], g.P[i][1], -2.4); c.userData.cy = 0;
      hitBox(c, 2.0, 2.0, 1.6); world.add(c); g.toys.push(c); popIn(c, g.ts, 250 + i * 110);
      pickable(c, async () => {
        if (busy) return;
        if (key === target) {
          busy = true; c.userData.busy = true; cands.forEach(unhalo); SFX.plop();
          tws(c, 1.3, 400); tw(c.rotation, { y: 0 }, 300);
          await arc(c, g.sp.clone().add(V(landscape ? 2.1 : -1.9, 0.1, 0.3)), 480, 1.5);
          hop(c, 0.6); hop(sample, 0.6);
          g.solved(g.sp.clone().add(V(landscape ? 1 : -1, 1.2, 0.8)));
        } else {
          const hint = g.miss(); wobble(c, 0.25);
          const tc = cands.find(x => x.userData.key === target);
          if (hint && tc) halo(tc, 1.15);
          Voice.say(['drugaya', hint ? 'podskazka' : null]);
        }
      });
      return c;
    });
    g.repeat = () => { hop(sample, 0.4); Voice.say('takaya_zhe'); };
    g.say('takaya_zhe');
    Idle.set(() => { hop(sample, 0.4); Voice.say('takaya_zhe'); });
  },
};
ICONS.para = g => {
  const ds = [-0.9, 0.9].map((x, i) => { const d = mkZver('utka'); d.scale.setScalar(0.72); d.position.set(x, 0, 0.1); d.rotation.y = -x * 0.35; g.add(d); return d; });
  g.userData.tick = t => ds.forEach((d, i) => { d.position.y = Math.abs(Math.sin(t * 2 + i * 1.57)) * 0.25; });
};

// ===== 12. Музыка =====
const NOTY = [523.25, 587.33, 659.25, 698.46, 783.99, 880];
const NOTY_COL = [COLORS.krasny, COLORS.oranzhevy, COLORS.zhelty, COLORS.zeleny, COLORS.siniy, VIOLET];
function mkKsilofon(n = 6) {
  const g = grp(), wood = M('#c98a55', 0.6), bars = [];
  for (let i = 0; i < n; i++) {
    const len = 3.7 - i * 0.33, mat = M(NOTY_COL[i], 0.35, { emissive: C(NOTY_COL[i]), emissiveIntensity: 0 });
    const b = grp((i - (n - 1) / 2) * 1.36, 0, 0); b.add(rbox(mat, 1.14, 0.3, len, 0.12));
    for (const s of [-1, 1]) { const p = ball(M('#ffffff', 0.4), [0.1, 0.06, 0.1], 0, 0.16, s * (len / 2 - 0.32), true); p.castShadow = false; b.add(p); }
    b.userData.mat = mat; b.userData.len = len; g.add(b); bars.push(b);
  }
  for (const s of [-1, 1]) { const r = rbox(wood, n * 1.36 + 0.5, 0.24, 0.42, 0.1, 0, -0.28, s * 0.95); r.receiveShadow = true; g.add(r); }
  g.userData.bars = bars; return g;
}
function nota(i) { tone(NOTY[i], 0, 0.7, 'sine', 0.24); tone(NOTY[i] * 2, 0, 0.3, 'triangle', 0.07); tone(NOTY[i] * 3, 0, 0.12, 'sine', 0.04); }
ROOMS.muzyka = {
  intro: 'muzyka_intro',
  voice: ['muzyka_intro', 'muzyka_najmi', 'muzyka_krasivo', 'povtori'],
  setup(g) {
    setFrame(ROOM_FR()); lights(world);
    interior(world, { wall: '#d9f5ee', dot: '#b8e8dc', floorHue: 30, floorL: 66 }); rugAt('#ffb3c7');
    const z = g.zaika = actor(mkZaika()), xy = g.xy = mkKsilofon();
    let s;
    if (landscape) { z.position.set(-6.7, 0, 0.5); z.scale.setScalar(1.25); z.rotation.y = 0.35; xy.position.set(2.1, 3.5, 0.6); s = 1.0; }
    else { z.position.set(0, 0, 2.2); z.scale.setScalar(1.08); xy.position.set(0, 7.9, 0.2); s = 0.94; }
    xy.rotation.x = 1.0; xy.scale.setScalar(s); world.add(z, xy);
    for (const sx of [-1, 1]) world.add(cyl(M('#a86c3d', 0.7), 0.16, 0.22, xy.position.y + 0.6, xy.position.x + sx * 3.2 * s, (xy.position.y + 0.6) / 2, xy.position.z - 1.3, 12));
    g.want = -1;
    xy.userData.bars.forEach((b, i) => {
      hitBox(b, 1.34, 1.2, b.userData.len + 0.4); b.userData.cy = 0;
      pickable(b, () => {
        nota(i); hop(b, -0.14, 200);
        burst(b.getWorldPosition(new T.Vector3()).add(V(0, 0.6, 0.6)), 4, [NOTY_COL[i], '#ffffff'], { speed: 0.55, size: 0.9 });
        g.onBar && g.onBar(i);
      });
    });
    g.tick = t => xy.userData.bars.forEach((b, i) => { b.userData.mat.emissiveIntensity = i === g.want ? 0.3 + Math.sin(t * 7) * 0.22 : 0; });
  },
  round(g) {
    const bars = g.xy.userData.bars;
    if (g.lvl === 0) {
      // лёгкий уровень: нажимай на клавишу, которая светится
      const need = 4, seq = shuffle([0, 1, 2, 3, 4, 5]).slice(0, need); // четыре разные клавиши
      let idx = 0;
      const light = () => { bars.forEach(unhalo); g.want = seq[idx]; const b = bars[g.want]; halo(b, 0.62, 0.3); b.userData.halo.rotation.x = Math.PI / 2; };
      g.onBar = i => {
        if (i !== g.want) return;
        hop(g.zaika, 0.35, 260); idx++;
        if (idx < need) { Idle.poke(); light(); return; }
        bars.forEach(unhalo); g.want = -1; g.onBar = null;
        g.solved(g.xy.position.clone().add(V(0, 1.2, 1.5)), 'muzyka_krasivo');
      };
      light();
      g.repeat = () => Voice.say('muzyka_najmi');
      g.say('muzyka_najmi');
      Idle.set(() => { Voice.say('muzyka_najmi'); const b = bars[g.want]; b && hop(b, 0.2, 300); });
      return;
    }
    // средний и сложный: Зайка играет мелодию, а ты повтори по памяти
    const need = g.lvl + 1; let seq;
    do seq = shuffle([0, 1, 2, 3, 4, 5]).slice(0, need); while (seq.join() === g.prevSeq); g.prevSeq = seq.join();
    let idx = 0, listen = false, token = 0, help = false;
    g.want = -1; g.onBar = null;
    const play = async () => {
      const my = ++token; listen = false; bars.forEach(unhalo);
      await wait(350);
      for (const x of seq) {
        if (my !== token || !g.alive()) return;
        g.want = x; nota(x); hop(bars[x], -0.14, 200); hop(g.zaika, 0.3, 260);
        await wait(620); g.want = -1; await wait(130);
      }
      if (my !== token || !g.alive()) return;
      idx = 0; listen = true;
      if (help) { g.want = seq[0]; }
    };
    g.onBar = i => {
      if (!listen) return;
      if (i === seq[idx]) {
        idx++;
        if (idx < need) { if (help) g.want = seq[idx]; Idle.poke(); return; }
        listen = false; g.want = -1; g.onBar = null; token++;
        g.solved(g.xy.position.clone().add(V(0, 1.2, 1.5)), 'muzyka_krasivo');
      } else {
        const hint = g.miss(); if (hint) help = true; // после двух ошибок клавиши снова подсвечиваются
        listen = false; g.want = -1;
        Voice.say(hint ? ['podskazka', 'povtori'] : 'povtori').then(() => { if (g.alive() && g.onBar) play(); });
      }
    };
    g.repeat = () => { Voice.say('povtori').then(() => { if (g.alive() && g.onBar) play(); }); };
    Promise.resolve(g.say('povtori')).then(() => { if (g.alive() && g.onBar) play(); });
    Idle.set(() => g.repeat());
  },
};
ICONS.muzyka = g => {
  const x = mkKsilofon(4); x.scale.setScalar(0.5); x.rotation.x = 1.0; x.position.set(0, 1.35, 0.1); g.add(x);
  const bars = x.userData.bars;
  g.userData.tick = t => { const k = Math.floor(t * 1.6) % 4; bars.forEach((b, i) => { b.userData.mat.emissiveIntensity = i === k ? 0.4 : 0; }); };
};

// ===== Рисование (открывается с мольберта возле дома) =====
(() => {
  // ---------- мастерская рисования: кисти, размеры, заливка, штампы, раскраски, «назад» ----------
  const el = $('ris'), cv = $('rc'), ov = $('ro'), pal = $('pal'), rL = $('rL'), rR = $('rR'), cx = cv.getContext('2d'), ox = ov.getContext('2d');
  const INK = ['#f0352b', '#ff8a1c', '#ffd21f', '#c6e84a', '#35b24a', '#1fbfb0', '#4fc3f7', '#2a6df4', '#b25de0', '#ff6fae', '#ffc1d9', '#f6c9a0', '#8d5a34', '#9e9e9e', '#2b2b2b', '#ffffff'];
  const PAPER = '#fffdf5';
  let col = INK[0], tool = 'pen', stamp = 0, pic = 0, dpr = 1, size = 1, strokes = new Map(), hue = 0;
  const B = '#5d3a24';
  const ico = {
    home: `<svg viewBox="0 0 100 100"><path d="M14 48 L50 16 L86 48" fill="none" stroke="${B}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 44 V84 H76 V44" fill="#ffcc80" stroke="${B}" stroke-width="7" stroke-linejoin="round"/></svg>`,
    pen: `<svg viewBox="0 0 100 100"><path d="M24 76 L30 56 L68 18 L84 34 L46 72Z" fill="#ffd21f" stroke="${B}" stroke-width="6" stroke-linejoin="round"/><path d="M24 76 L30 56 L46 72Z" fill="${B}"/></svg>`,
    soft: `<svg viewBox="0 0 100 100"><path d="M60 40 L84 14" stroke="#c98a4b" stroke-width="10" stroke-linecap="round"/><path d="M52 40 L62 50" stroke="#b0bec5" stroke-width="12" stroke-linecap="round"/><path d="M50 44 Q30 46 20 80 Q48 74 56 52Z" fill="#4fc3f7" stroke="${B}" stroke-width="5" stroke-linejoin="round"/></svg>`,
    crayon: `<svg viewBox="0 0 100 100"><g transform="rotate(-45 50 50)"><path d="M22 40 H66 V60 H22Z" fill="#35b24a" stroke="${B}" stroke-width="5" stroke-linejoin="round"/><path d="M66 40 L84 50 L66 60Z" fill="#35b24a" stroke="${B}" stroke-width="5" stroke-linejoin="round"/><path d="M34 40 V60 M54 40 V60" stroke="#fff" stroke-width="4"/></g></svg>`,
    spray: `<svg viewBox="0 0 100 100"><rect x="30" y="38" width="30" height="48" rx="8" fill="#ff6fae" stroke="${B}" stroke-width="5"/><rect x="38" y="26" width="14" height="12" rx="3" fill="#cfd8dc" stroke="${B}" stroke-width="5"/><g fill="#ff6fae"><circle cx="70" cy="22" r="4"/><circle cx="80" cy="30" r="3.5"/><circle cx="74" cy="36" r="3"/><circle cx="84" cy="18" r="3"/><circle cx="64" cy="14" r="3"/></g></svg>`,
    rainbow: `<svg viewBox="0 0 100 100" fill="none" stroke-width="8" stroke-linecap="round"><path d="M14 74 A36 36 0 0 1 86 74" stroke="#f0352b"/><path d="M24 74 A26 26 0 0 1 76 74" stroke="#ffd21f"/><path d="M34 74 A16 16 0 0 1 66 74" stroke="#35b24a"/><path d="M44 74 A6 6 0 0 1 56 74" stroke="#2a6df4"/></svg>`,
    magic: `<svg viewBox="0 0 100 100"><path d="M18 84 L58 44" stroke="${B}" stroke-width="8" stroke-linecap="round"/><path d="M64 14 L69 31 L86 36 L69 41 L64 58 L59 41 L42 36 L59 31Z" fill="#ffd21f" stroke="${B}" stroke-width="4" stroke-linejoin="round"/><circle cx="84" cy="62" r="5" fill="#ff6fae"/><circle cx="34" cy="22" r="4" fill="#4fc3f7"/></svg>`,
    fill: `<svg viewBox="0 0 100 100"><path d="M28 44 L72 44 L64 84 L36 84Z" fill="#4fc3f7" stroke="${B}" stroke-width="6" stroke-linejoin="round"/><path d="M30 44 Q50 6 70 44" fill="none" stroke="${B}" stroke-width="6" stroke-linecap="round"/><path d="M80 54 q10 15 0 22 q-10 -7 0 -22z" fill="#f0352b"/></svg>`,
    erase: `<svg viewBox="0 0 100 100"><rect x="22" y="34" width="56" height="34" rx="8" transform="rotate(-25 50 50)" fill="#ffb3c7" stroke="${B}" stroke-width="6"/><path d="M20 84 H80" stroke="${B}" stroke-width="6" stroke-linecap="round"/></svg>`,
    undo: `<svg viewBox="0 0 100 100"><path d="M30 40 H62 A20 20 0 0 1 62 80 H40" fill="none" stroke="${B}" stroke-width="9" stroke-linecap="round"/><path d="M38 24 L20 40 L38 56Z" fill="${B}" stroke="${B}" stroke-width="6" stroke-linejoin="round"/></svg>`,
    clear: `<svg viewBox="0 0 100 100"><rect x="20" y="16" width="60" height="68" rx="6" fill="#fff" stroke="${B}" stroke-width="6"/><path d="M62 16 L80 34 H62Z" fill="#cfd8dc" stroke="${B}" stroke-width="5" stroke-linejoin="round"/></svg>`,
    next: `<svg viewBox="0 0 100 100"><rect x="14" y="20" width="72" height="60" rx="8" fill="#fff" stroke="${B}" stroke-width="6"/><circle cx="36" cy="42" r="8" fill="#ffd21f"/><path d="M20 74 L44 52 L58 64 L68 56 L82 72" fill="none" stroke="#35b24a" stroke-width="7" stroke-linejoin="round"/></svg>`,
  };
  // картинки-раскраски: рисуются контуром поверх красок. Координаты от -1 до 1. Первая — чистый лист.
  const PICS = [
    null,
    (x) => { x.arc(0, 0, 0.42, 0, 7); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; x.moveTo(Math.cos(a) * 0.55, Math.sin(a) * 0.55); x.lineTo(Math.cos(a) * 0.9, Math.sin(a) * 0.9); } },
    (x) => { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.moveTo(Math.cos(a) * 0.42 + 0.24, Math.sin(a) * 0.42 - 0.35); x.arc(Math.cos(a) * 0.42, Math.sin(a) * 0.42 - 0.35, 0.24, 0, 7); } x.moveTo(0.2, -0.35); x.arc(0, -0.35, 0.2, 0, 7); x.moveTo(0, 0.3); x.lineTo(0, 0.95); x.moveTo(0, 0.7); x.quadraticCurveTo(0.45, 0.35, 0.55, 0.7); x.quadraticCurveTo(0.3, 0.85, 0, 0.7); },
    (x) => { x.rect(-0.6, -0.1, 1.2, 1.0); x.moveTo(-0.8, -0.1); x.lineTo(0, -0.85); x.lineTo(0.8, -0.1); x.closePath(); x.rect(-0.12, 0.35, 0.34, 0.55); x.rect(-0.45, 0.1, 0.28, 0.28); x.moveTo(0.4, -0.5); x.lineTo(0.4, -0.8); x.lineTo(0.56, -0.8); x.lineTo(0.56, -0.34); },
    (x) => { x.ellipse(-0.1, 0, 0.62, 0.4, 0, 0, 7); x.moveTo(0.5, 0); x.lineTo(0.95, -0.38); x.lineTo(0.95, 0.38); x.closePath(); x.moveTo(-0.38, -0.1); x.arc(-0.44, -0.1, 0.06, 0, 7); x.moveTo(-0.15, -0.38); x.quadraticCurveTo(0.05, -0.75, 0.3, -0.33); x.moveTo(-0.1, -0.1); x.quadraticCurveTo(0.1, 0.05, -0.1, 0.2); },
    (x) => { x.arc(0, 0.25, 0.55, 0, 7); x.moveTo(-0.14, -0.3); x.ellipse(-0.3, -0.62, 0.16, 0.42, -0.15, 0, 7); x.moveTo(0.46, -0.3); x.ellipse(0.3, -0.62, 0.16, 0.42, 0.15, 0, 7); x.moveTo(-0.14, 0.15); x.arc(-0.2, 0.15, 0.06, 0, 7); x.moveTo(0.26, 0.15); x.arc(0.2, 0.15, 0.06, 0, 7); x.moveTo(0.07, 0.36); x.arc(0, 0.36, 0.07, 0, 7); x.moveTo(-0.2, 0.5); x.quadraticCurveTo(0, 0.66, 0.2, 0.5); },
    (x) => { x.ellipse(0, -0.25, 0.5, 0.6, 0, 0, 7); x.moveTo(-0.08, 0.35); x.lineTo(0.08, 0.35); x.lineTo(0, 0.44); x.closePath(); x.moveTo(0, 0.44); x.bezierCurveTo(0.25, 0.6, -0.25, 0.75, 0, 0.98); },
    (x) => { x.moveTo(0, -0.35); x.bezierCurveTo(-0.7, -0.85, -0.95, 0.2, 0, 0.8); x.bezierCurveTo(0.95, 0.2, 0.7, -0.85, 0, -0.35); },
    // бабочка
    (x) => { x.ellipse(-0.42, -0.3, 0.38, 0.32, -0.5, 0, 7); x.moveTo(0.8, -0.3); x.ellipse(0.42, -0.3, 0.38, 0.32, 0.5, 0, 7); x.moveTo(-0.08, 0.3); x.ellipse(-0.32, 0.3, 0.26, 0.22, 0.5, 0, 7); x.moveTo(0.58, 0.3); x.ellipse(0.32, 0.3, 0.26, 0.22, -0.5, 0, 7); x.moveTo(0.08, 0); x.ellipse(0, 0, 0.08, 0.55, 0, 0, 7); x.moveTo(-0.03, -0.52); x.quadraticCurveTo(-0.15, -0.85, -0.3, -0.88); x.moveTo(0.03, -0.52); x.quadraticCurveTo(0.15, -0.85, 0.3, -0.88); x.moveTo(-0.38, -0.3); x.arc(-0.45, -0.3, 0.1, 0, 7); x.moveTo(0.55, -0.3); x.arc(0.45, -0.3, 0.1, 0, 7); },
    // машинка
    (x) => { x.moveTo(-0.85, 0.3); x.lineTo(-0.85, -0.05); x.quadraticCurveTo(-0.85, -0.15, -0.7, -0.15); x.lineTo(-0.45, -0.15); x.lineTo(-0.25, -0.5); x.lineTo(0.35, -0.5); x.lineTo(0.55, -0.15); x.lineTo(0.75, -0.15); x.quadraticCurveTo(0.88, -0.15, 0.88, 0); x.lineTo(0.88, 0.3); x.closePath(); x.moveTo(-0.33, -0.18); x.lineTo(-0.18, -0.42); x.lineTo(0.02, -0.42); x.lineTo(0.02, -0.18); x.closePath(); x.moveTo(0.1, -0.18); x.lineTo(0.1, -0.42); x.lineTo(0.3, -0.42); x.lineTo(0.44, -0.18); x.closePath(); x.moveTo(-0.27, 0.32); x.arc(-0.45, 0.32, 0.18, 0, 7); x.moveTo(0.65, 0.32); x.arc(0.47, 0.32, 0.18, 0, 7); },
  ];
  // где можно рисовать: между левой и правой панелями и над цветами
  const area = () => { const a = rL.getBoundingClientRect(), b = rR.getBoundingClientRect(), c = pal.getBoundingClientRect(); const x0 = a.right, x1 = Math.max(x0 + 100, b.left); return { x: x0, y: 0, w: x1 - x0, h: Math.max(100, c.top) }; };
  function outline() {
    ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, ov.width, ov.height);
    const f = PICS[pic]; if (!f) return;
    const a = area(), k = Math.min(a.w, a.h) * 0.43 * dpr;
    ox.setTransform(k, 0, 0, k, (a.x + a.w / 2) * dpr, a.h / 2 * dpr);
    ox.beginPath(); f(ox); ox.lineWidth = 0.035; ox.lineJoin = ox.lineCap = 'round'; ox.strokeStyle = '#4a3426'; ox.stroke();
  }
  function fitRis(keep) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    let old = null;
    if (keep && cv.width && (cv.width !== w || cv.height !== h)) { old = document.createElement('canvas'); old.width = cv.width; old.height = cv.height; old.getContext('2d').drawImage(cv, 0, 0); }
    if (cv.width !== w || cv.height !== h || !keep) { cv.width = ov.width = w; cv.height = ov.height = h; cx.fillStyle = PAPER; cx.fillRect(0, 0, w, h); }
    if (old) { const k = Math.min(w / old.width, h / old.height); cx.drawImage(old, (w - old.width * k) / 2, 0, old.width * k, old.height * k); undo.length = 0; }
    outline();
  }
  const wipe = () => { cx.fillStyle = PAPER; cx.fillRect(0, 0, cv.width, cv.height); };
  // «назад»: до 8 снимков листа
  const undo = [];
  function snap() { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); undo.push(c); if (undo.length > 8) undo.shift(); upd(); }
  function back() { const c = undo.pop(); if (!c) { SFX.boing(); return; } cx.drawImage(c, 0, 0); SFX.whoosh(); upd(); }
  // размеры: маленький, средний, большой
  const unit = () => Math.min(innerWidth, innerHeight) * dpr;
  const width = () => unit() * [0.016, 0.032, 0.062][size] * (tool === 'erase' ? 2.2 : tool === 'soft' ? 1.7 : 1);
  const stampSize = () => unit() * [0.045, 0.07, 0.11][size];
  // кисти
  const tint = new Map(); // мягкая кисть: круглое пятнышко с мягким краем
  function softDab(c) { if (tint.has(c)) return tint.get(c); const s = 64, t = document.createElement('canvas'); t.width = t.height = s; const x = t.getContext('2d'), g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, c); g.addColorStop(0.45, c); g.addColorStop(1, c + '00'); x.fillStyle = g; x.fillRect(0, 0, s, s); tint.set(c, t); return t; }
  const crayP = new Map(); // восковой мелок: шершавая текстура
  function crayon(c) { if (crayP.has(c)) return crayP.get(c); const s = 48, t = document.createElement('canvas'); t.width = t.height = s; const x = t.getContext('2d'); x.fillStyle = c; for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) { const r = Math.random(); if (r < 0.28) continue; x.globalAlpha = r < 0.5 ? 0.45 : 1; x.fillRect(i, j, 1, 1); } const p = cx.createPattern(t, 'repeat'); crayP.set(c, p); return p; }
  const BRIGHT = ['#ffd21f', '#ff6fae', '#4fc3f7', '#35b24a', '#ff8a1c', '#b25de0', '#ffffff'];
  function star4(x, y, r, c, a) { cx.save(); cx.translate(x, y); cx.rotate(a); cx.fillStyle = c; cx.beginPath(); for (let k = 0; k < 8; k++) { const q = k % 2 ? r * 0.32 : r, an = k * Math.PI / 4; cx.lineTo(Math.cos(an) * q, Math.sin(an) * q); } cx.fill(); cx.restore(); }
  function spray(x, y) { const w = width(), R = w * 1.7; cx.fillStyle = col; for (let i = 0; i < 26; i++) { const a = Math.random() * 7, d = Math.sqrt(Math.random()) * R; cx.beginPath(); cx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.8 * dpr, w * 0.07), 0, 7); cx.fill(); } }
  const line = (p, q, style, w) => { cx.strokeStyle = style; cx.lineWidth = w; cx.lineCap = cx.lineJoin = 'round'; cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(q[0], q[1]); cx.stroke(); };
  // кусочек мазка от точки s.p до q
  function segment(s, q) {
    const p = s.p, w = width(), L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (tool === 'pen') line(p, q, col, w);
    else if (tool === 'erase') line(p, q, PAPER, w);
    else if (tool === 'crayon') { cx.globalAlpha = 0.9; line(p, q, crayon(col), w * 1.15); cx.globalAlpha = 1; }
    else if (tool === 'rainbow') { hue = (hue + L * 0.35 / dpr) % 360; line(p, q, `hsl(${hue},92%,56%)`, w); }
    else if (tool === 'soft' || tool === 'spray' || tool === 'magic') {
      const gap = tool === 'soft' ? w * 0.18 : tool === 'spray' ? w * 0.6 : w * 1.4; s.acc = (s.acc === undefined ? gap : s.acc) + L; if (s.acc < gap) return false;
      const n = Math.min(120, Math.floor(s.acc / gap)); s.acc = Math.min(s.acc - n * gap, gap);
      for (let i = 1; i <= n; i++) {
        const k = i / n, x = p[0] + (q[0] - p[0]) * k, y = p[1] + (q[1] - p[1]) * k;
        if (tool === 'soft') { cx.globalAlpha = 0.28; const d = softDab(col); cx.drawImage(d, x - w / 2, y - w / 2, w, w); cx.globalAlpha = 1; }
        else if (tool === 'spray') spray(x, y);
        else { star4(x + rr(-w, w) * 0.6, y + rr(-w, w) * 0.6, w * rr(0.5, 1.0), Math.random() < 0.4 ? col : BRIGHT[rnd(BRIGHT.length)], rr(0, 1)); cx.fillStyle = BRIGHT[rnd(BRIGHT.length)]; cx.beginPath(); cx.arc(x + rr(-w, w), y + rr(-w, w), w * 0.14, 0, 7); cx.fill(); }
      }
    }
    return true;
  }
  // штампы: звёздочка, сердечко, цветок, кружок, облачко, лапка, бабочка, месяц
  const STAMPS = [
    (x, s) => { for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, q = k % 2 ? s * 0.45 : s; x.lineTo(Math.sin(a) * q, -Math.cos(a) * q); } },
    (x, s) => { x.moveTo(0, s * 0.9); x.bezierCurveTo(-s * 1.5, -s * 0.1, -s * 0.6, -s * 1.2, 0, -s * 0.4); x.bezierCurveTo(s * 0.6, -s * 1.2, s * 1.5, -s * 0.1, 0, s * 0.9); },
    (x, s) => { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; x.moveTo(Math.cos(a) * s * 0.55 + s * 0.42, Math.sin(a) * s * 0.55); x.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.42, 0, 7); } },
    (x, s) => { x.arc(0, 0, s * 0.85, 0, 7); },
    (x, s) => { for (const [a, b, r] of [[-0.55, 0.15, 0.42], [0, -0.2, 0.55], [0.55, 0.12, 0.45], [0.1, 0.3, 0.4]]) { x.moveTo(a * s + r * s, b * s); x.arc(a * s, b * s, r * s, 0, 7); } },
    (x, s) => { for (const [a, b, r] of [[0, 0.3, 0.5], [-0.62, -0.25, 0.22], [-0.24, -0.62, 0.22], [0.24, -0.62, 0.22], [0.62, -0.25, 0.22]]) { x.moveTo(a * s + r * s, b * s); x.arc(a * s, b * s, r * s, 0, 7); } },
    (x, s) => { for (const [a, b, r] of [[-0.48, -0.3, 0.45], [0.48, -0.3, 0.45], [-0.36, 0.42, 0.32], [0.36, 0.42, 0.32], [0, 0, 0.16], [0, 0.3, 0.14], [0, -0.3, 0.14]]) { x.moveTo(a * s + r * s, b * s); x.arc(a * s, b * s, r * s, 0, 7); } },
    (x, s) => { x.moveTo(0.1 * s, -s); x.bezierCurveTo(-1.25 * s, -0.7 * s, -1.25 * s, 0.7 * s, 0.1 * s, s); x.bezierCurveTo(-0.55 * s, 0.5 * s, -0.55 * s, -0.5 * s, 0.1 * s, -s); },
  ];
  function putStamp(p) {
    const s = stampSize(); cx.save(); cx.translate(p[0], p[1]); cx.rotate(rr(-0.3, 0.3)); cx.fillStyle = col; cx.beginPath(); STAMPS[stamp](cx, s); cx.fill();
    if (stamp === 2) { cx.fillStyle = col === '#ffd21f' ? '#ff8a1c' : '#ffd21f'; cx.beginPath(); cx.arc(0, 0, s * 0.3, 0, 7); cx.fill(); }
    cx.restore(); tone(660 + stamp * 70, 0, 0.1, 'triangle', 0.09);
  }
  // заливка: закрашивает область до контура картинки или до другой краски
  function fill(px, py) {
    const w = cv.width, h = cv.height; px |= 0; py |= 0; if (px < 0 || py < 0 || px >= w || py >= h) return false;
    const img = cx.getImageData(0, 0, w, h), d = img.data, od = ox.getImageData(0, 0, w, h).data;
    const i0 = (py * w + px) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
    const n = parseInt(col.slice(1), 16), fr = n >> 16, fg = (n >> 8) & 255, fb = n & 255;
    if (Math.abs(r0 - fr) + Math.abs(g0 - fg) + Math.abs(b0 - fb) < 12) return false;
    const seen = new Uint8Array(w * h);
    const can = (x, y) => { const q = y * w + x, i = q * 4; return !seen[q] && od[i + 3] < 110 && Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 90; };
    if (!can(px, py)) return false;
    const st = [px, py];
    while (st.length) {
      const y = st.pop(), x = st.pop(); if (!can(x, y)) continue;
      let xl = x, xr = x; while (xl > 0 && can(xl - 1, y)) xl--; while (xr < w - 1 && can(xr + 1, y)) xr++;
      for (let i = xl; i <= xr; i++) { const q = y * w + i, k = q * 4; seen[q] = 1; d[k] = fr; d[k + 1] = fg; d[k + 2] = fb; d[k + 3] = 255; }
      for (const ny of [y - 1, y + 1]) { if (ny < 0 || ny >= h) continue; let run = false; for (let i = xl; i <= xr; i++) { if (can(i, ny)) { if (!run) { st.push(i, ny); run = true; } } else run = false; } }
    }
    // пиксели на самой границе тоже подкрашиваем, чтобы не оставалось белой каёмки у контура
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const q = y * w + x; if (seen[q] || !(seen[q - 1] || seen[q + 1] || seen[q - w] || seen[q + w])) continue; const k = q * 4; if (Math.abs(d[k] - r0) + Math.abs(d[k + 1] - g0) + Math.abs(d[k + 2] - b0) < 200) { d[k] = fr; d[k + 1] = fg; d[k + 2] = fb; } }
    cx.putImageData(img, 0, 0); SFX.plop(); return true;
  }
  // брызгалка шипит, пока палец стоит на месте
  let sprayT = 0;
  function sprayLoop() { sprayT = 0; if (tool !== 'spray' || !strokes.size) return; for (const s of strokes.values()) spray(s.p[0], s.p[1]); sprayT = requestAnimationFrame(sprayLoop); }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); const p = [e.clientX * dpr, e.clientY * dpr];
    if (tool === 'fill') { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); if (fill(p[0], p[1])) { undo.push(c); if (undo.length > 8) undo.shift(); upd(); } return; }
    if (!strokes.size) snap();
    const s = { p }; strokes.set(e.pointerId, s);
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    if (tool === 'stamp') { putStamp(p); return; }
    if (tool === 'pen' || tool === 'erase' || tool === 'rainbow' || tool === 'crayon') { const w = width(); cx.fillStyle = tool === 'erase' ? PAPER : tool === 'rainbow' ? `hsl(${hue},92%,56%)` : tool === 'crayon' ? crayon(col) : col; cx.beginPath(); cx.arc(p[0], p[1], w / 2, 0, 7); cx.fill(); }
    else segment(s, [p[0] + 0.01, p[1]]);
    if (tool === 'spray' && !sprayT) sprayT = requestAnimationFrame(sprayLoop);
  });
  cv.addEventListener('pointermove', e => {
    const s = strokes.get(e.pointerId); if (!s) return;
    const q = [e.clientX * dpr, e.clientY * dpr];
    if (tool === 'stamp') { if (Math.hypot(q[0] - s.p[0], q[1] - s.p[1]) > stampSize() * 2.1) { putStamp(q); s.p = q; } return; }
    segment(s, q); s.p = q;
  });
  const up = e => strokes.delete(e.pointerId);
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  // ---------- кнопки ----------
  const inks = [], tools = {}, sizes = [];
  const add = (where, html, fn, bg) => { const b = document.createElement('div'); b.className = 'btn'; if (bg) b.style.background = bg; b.innerHTML = html; tapBtn(b, () => fn(b)); where.appendChild(b); return b; };
  const setTool = t => { tool = t; Object.keys(tools).forEach(k => tools[k].classList.toggle('tsel', k === t)); upd(); };
  const stampIco = () => `<svg viewBox="-1.3 -1.3 2.6 2.6"><path d="${(() => { const pts = []; const rec = { moveTo: (x, y) => pts.push(`M${x.toFixed(2)} ${y.toFixed(2)}`), lineTo: (x, y) => pts.push(`${pts.length ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`), bezierCurveTo: (a, b, c, d, e, f) => pts.push(`C${a.toFixed(2)} ${b.toFixed(2)} ${c.toFixed(2)} ${d.toFixed(2)} ${e.toFixed(2)} ${f.toFixed(2)}`), arc: (x, y, r) => pts.push(`M${(x + r).toFixed(2)} ${y.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(x - r).toFixed(2)} ${y.toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(x + r).toFixed(2)} ${y.toFixed(2)}`) }; STAMPS[stamp](rec, 1); return pts.join(''); })()}" fill="${col === '#ffffff' ? '#ff6fae' : col}" stroke="${B}" stroke-width="0.12" stroke-linejoin="round"/></svg>`;
  // левая панель: домой и инструменты
  add(rL, ico.home, () => { SFX.tap(); go((current && current.back) || goHome); }).classList.add('home');
  const tsel = (k, snd) => () => { setTool(k); tone(snd, 0, 0.1, 'triangle', 0.08); };
  tools.pen = add(rL, ico.pen, tsel('pen', 520));
  tools.soft = add(rL, ico.soft, tsel('soft', 560));
  tools.crayon = add(rL, ico.crayon, tsel('crayon', 600));
  tools.spray = add(rL, ico.spray, tsel('spray', 640));
  tools.rainbow = add(rL, ico.rainbow, tsel('rainbow', 680));
  tools.magic = add(rL, ico.magic, tsel('magic', 720));
  tools.stamp = add(rL, stampIco(), bb => { if (tool === 'stamp') stamp = (stamp + 1) % STAMPS.length; setTool('stamp'); tone(660 + stamp * 70, 0, 0.1, 'triangle', 0.08); });
  tools.fill = add(rL, ico.fill, tsel('fill', 480));
  tools.erase = add(rL, ico.erase, tsel('erase', 440));
  // правая панель: размер, «назад», другая картинка, чистый лист
  [0, 1, 2].forEach(i => { const b = add(rR, '', () => { size = i; upd(); tone(700 - i * 140, 0, 0.1, 'sine', 0.1); }); b.classList.add('size'); sizes.push(b); });
  const bUndo = add(rR, ico.undo, back);
  add(rR, ico.next, () => { snap(); pic = (pic + 1) % PICS.length; wipe(); outline(); SFX.plop(); });
  add(rR, ico.clear, () => { snap(); wipe(); SFX.whoosh(); });
  // нижняя полоса: цвета
  INK.forEach((c, i) => { const b = add(pal, '', () => { col = c; if (tool === 'erase') setTool('pen'); upd(); tone(440 + i * 40, 0, 0.12, 'triangle', 0.1); }, c); b.classList.add('ink'); inks.push(b); });
  function upd() {
    inks.forEach((b, i) => b.classList.toggle('sel', INK[i] === col));
    const dc = col === '#ffffff' ? '#e0e0e0' : col;
    sizes.forEach((b, i) => { const r = [9, 17, 28][i]; b.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="${dc}" stroke="${B}" stroke-width="4"/></svg>`; b.classList.toggle('tsel', i === size); b.classList.toggle('dim', tool === 'fill'); });
    tools.stamp.innerHTML = stampIco();
    bUndo.classList.toggle('dim', !undo.length);
  }
  setTool('pen');
  // маленькая копия рисунка для стены в домике (null, если лист пустой)
  window.risSnap = () => {
    const a = area(), W = 320, H = 240, c = document.createElement('canvas'), x = c.getContext('2d'); c.width = W; c.height = H;
    const sx = a.x * dpr, sw = a.w * dpr, sh = a.h * dpr, k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    const t = document.createElement('canvas'); t.width = 32; t.height = 24; const tx = t.getContext('2d'); tx.drawImage(cv, sx, 0, sw, sh, 0, 0, 32, 24);
    const d = tx.getImageData(0, 0, 32, 24).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 235)) ink++;
    if (ink < 3) return null;
    x.drawImage(cv, sx, 0, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh); x.drawImage(ov, sx, 0, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh); return c;
  };
  window.openRis = back => {
    clearWorld(); scene.background = new T.Color(C(PAPER));
    current = { name: 'ris', rebuild: () => fitRis(true), back: typeof back === 'function' ? back : null };
    el.classList.add('on'); if (!pic) pic = 1 + rnd(PICS.length - 1);
    undo.length = 0; fitRis(false); upd();
  };
  window.__ris = { setTool, get tool() { return tool; }, setSize: i => { size = i; upd(); }, setCol: c => { col = c; upd(); }, back, undo };
  addEventListener('resize', () => { if (current && current.name === 'ris') setTimeout(() => fitRis(true), 60); });
})();
