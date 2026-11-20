'use strict';
// «Домик Зайки» 3.0 — семь новых комнат. Подключается после igra.js.
const ROOM_FR = () => (landscape ? { cy: 3.85, halfW: 8.3, halfH: 5.1 } : { cy: 6.1, halfW: 4.8, halfH: 7.7 });
const VIOLET = '#b25de0';
const rugAt = (hex, z = 1.6) => { const rug = mesh(new T.CylinderGeometry(6.8, 6.8, 0.06, 40), M(hex, 1), 0, 0.03, z); rug.castShadow = false; rug.receiveShadow = true; rug.scale.z = 0.42; world.add(rug); };

// ===== 6. Прятки =====
ROOMS.pryatki = {
  intro: 'pryatki_intro',
  voice: ['pryatki_intro', 'gde_zaika', 'kuku', 'nikogo'],
  setup(g) {
    const n = g.n = [2, 3, 4][g.lvl];
    setFrame(landscape ? { cy: 3.0, halfW: 8.0, halfH: 4.6 } : { cy: n > 2 ? 5.2 : 4.2, halfW: 4.8, halfH: 7.7 });
    lights(world); meadow(world);
    let P, sc;
    if (landscape) { sc = n === 4 ? 0.93 : 1.2; const w = n === 4 ? 3.75 : 5.0; P = [...Array(n)].map((_, i) => [(i - (n - 1) / 2) * w, 0, 0.8]); }
    else { sc = 0.95; const Ty = 4.3; if (n > 2) terrace(Ty, -1.2); P = [[-2.2, 0, 1.2], [2.2, 0, 1.2], [-2.3, Ty, -2.9], [2.3, Ty, -2.9]].slice(0, n); if (n === 3) P[2][0] = 0; }
    g.sc = sc; g.P = P;
    g.bushes = P.map((p, i) => {
      const b = mkKust(); b.position.set(p[0], p[1], p[2]); b.userData.cy = 1.5 * sc;
      hitBox(b, 3.7, 4.2, 2.4, 0, 1.9, 0); world.add(b); popIn(b, sc, i * 110);
      pickable(b, () => g.tap && g.tap(i));
      return b;
    });
    const zk = g.zk = actor(mkZaika()); zk.scale.setScalar(0.8 * sc); zk.position.set(0, -20, 0); world.add(zk); speaker = zk;
    g.hid = i => V(P[i][0], P[i][1] + 0.05 * sc, P[i][2] - 1.3 * sc);
    g.prev = -1; g.up = false;
  },
  round(g) {
    const n = g.n, sc = g.sc, zk = g.zk;
    let k; do k = rnd(n); while (k === g.prev); g.prev = k;
    let busy = false, ready = false;
    g.bushes.forEach(unhalo);
    (async () => {
      if (g.up) { zk.userData.wave = false; await tw(zk.position, { y: zk.position.y - 5 * sc }, 380, 'in'); g.up = false; }
      if (!g.alive()) return;
      g.bushes.forEach(b => wobble(b, 0.07, 600)); SFX.whoosh();
      await wait(450); if (!g.alive()) return;
      const h = g.hid(k); zk.position.set(h.x, h.y - 5 * sc, h.z); zk.rotation.y = 0;
      await tw(zk.position, { y: h.y }, 520, 'back');
      ready = true;
    })();
    g.tap = async i => {
      if (busy || !ready) return;
      const b = g.bushes[i]; wobble(b, 0.1);
      if (i === k) {
        busy = true; g.bushes.forEach(unhalo); SFX.boing();
        const h = g.hid(k);
        await tw(zk.position, { y: h.y + 1.75 * sc }, 380, 'back');
        zk.userData.wave = true; g.up = true;
        g.solved(V(h.x, h.y + 3.6 * sc, h.z + 1.5), 'kuku', zk);
      } else {
        const hint = g.miss();
        if (hint) { halo(g.bushes[k], 1.6, 1.5); hop(zk, 0.7 * sc, 520); }
        Voice.say(['nikogo', hint ? 'podskazka' : 'gde_zaika'], null);
      }
    };
    g.repeat = () => Voice.say('gde_zaika', null);
    g.say('gde_zaika', null);
    Idle.set(() => { Voice.say('gde_zaika', null); if (ready && !busy) hop(zk, 0.6 * sc, 520); });
  },
};
ICONS.pryatki = g => {
  const z = mkZaika(); z.scale.setScalar(0.5); z.position.set(0.2, 0.85, -0.5); g.add(z);
  const b = mkKust(); b.scale.setScalar(0.62); b.position.set(0, 0, 0.1); g.add(b);
  g.userData.tick = t => { z.position.y = 0.75 + Math.max(0, Math.sin(t * 1.3)) * 0.35; };
};

// ===== 7. Пирамидка =====
const RING_COLS = ['#f0352b', '#ff8a1c', '#ffd21f', '#35b24a', '#2a6df4', VIOLET];
ROOMS.piramidka = {
  intro: 'piramidka_intro',
  voice: ['piramidka_intro', 'kol_bolshoe', 'kol_ne', 'piramidka_gotova'],
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
    const n = [3, 4, 5][g.lvl], k = g.k;
    g.rings.forEach(r => { unpick(r); world.remove(r); }); g.rings = [];
    if (g.stack) world.remove(g.stack);
    const st = g.stack = grp(g.px, 0, g.pz); world.add(st);
    const wood = M('#e0b074', 0.6), th = 0.56 * k, poleH = 0.3 + n * th + 0.45;
    st.add(cyl(wood, 1.75 * k, 1.85 * k, 0.3, 0, 0.15, 0, 32)); st.add(cyl(wood, 0.15, 0.19, poleH, 0, poleH / 2, 0, 14));
    popIn(st, 1);
    const cols = shuffle(RING_COLS);
    const slots = shuffle(landscape ? [[-0.4, 6.0], [2.9, 6.0], [6.2, 6.0], [1.2, 2.4], [4.6, 2.4]] : [[-2.5, 9.9], [2.5, 9.9], [-2.5, 6.5], [2.5, 6.5], [0, 8.2]]).slice(0, n);
    const order = [];
    for (let i = 0; i < n; i++) {
      const rad = 1.3 - i * (0.7 / (n - 1)), r = mkKoltso(rad, cols[i]), U = r.userData;
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
      idx++; busy = false;
      if (idx < n) { Idle.poke(); return; }
      Idle.off();
      const cap = ball(M('#ff5d8a', 0.3), 0.36 * k, 0, poleH + 0.1, 0); st.add(cap); popIn(cap, 0.36 * k);
      g.rings.forEach(x => { st.attach(x); });
      hop(st, 0.5, 450);
      g.solved(V(g.px, poleH + 0.5, g.pz + 1), 'piramidka_gotova');
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
    const n = [2, 3, 4][g.lvl];
    setFrame(ROOM_FR()); lights(world); meadow(world);
    g.cols = shuffle(Object.keys(COLORS)).slice(0, n);
    const z = g.zaika = actor(mkZaika()); let xs, sc;
    if (landscape) {
      z.position.set(-6.6, 0, 0.5); z.scale.setScalar(1.25); z.rotation.y = 0.35;
      xs = { 2: [-1.0, 4.6], 3: [-2.2, 1.8, 5.8], 4: [-3.3, -0.3, 2.7, 5.7] }[n]; sc = { 2: 1.5, 3: 1.3, 4: 1.05 }[n]; g.home = V(1.9, 6.1, 1.5);
    } else {
      terrace(4.2, -1.2); z.position.set(-2.6, 4.2, -2.9); z.scale.setScalar(1.05); z.rotation.y = 0.3;
      xs = { 2: [-2.3, 2.3], 3: [-3.1, 0, 3.1], 4: [-3.55, -1.18, 1.18, 3.55] }[n]; sc = { 2: 1.35, 3: 1.05, 4: 0.82 }[n]; g.home = V(1.9, 8.6, 1.2);
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
    let c; do c = pick(g.cols); while (c === g.prev); g.prev = c;
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
    const n = [2, 3, 4][g.lvl];
    lights(world);
    let P, k;
    if (landscape) {
      setFrame({ cy: 3.5, halfW: 8.1, halfH: 4.9 }); meadow(world);
      const w = n === 4 ? 4.1 : 5.0; k = n === 4 ? 1 : 1.15; P = [...Array(n)].map((_, i) => [(i - (n - 1) / 2) * w, 0, 0.6]); g.home = V(0, 5.9, 1.5);
    } else {
      setFrame({ cy: n > 2 ? 5.7 : 4.6, halfW: 4.8, halfH: 7.7 }); meadow(world);
      const Ty = 4.0; if (n > 2) terrace(Ty, -1.2); k = 1.05;
      P = [[-2.35, 0, 1.2], [2.35, 0, 1.2], [-2.35, Ty, -2.9], [2.35, Ty, -2.9]].slice(0, n); if (n === 3) P[2][0] = 0;
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
    let who; do who = pick(g.set); while (who === g.prev); g.prev = who;
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
    const few = pick([[1], [1, 2], [2, 3]][g.lvl]), many = pick([[5, 6], [5, 6, 7], [6, 7]][g.lvl]);
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
    const n = g.n = [2, 3, 4][g.lvl], z = g.zaika = actor(mkZaika());
    if (landscape) {
      z.position.set(-6.6, 0, 0.5); z.scale.setScalar(1.22); z.rotation.y = 0.35; g.sp = V(-3.3, 3.45, 1.2);
      g.P = { 2: [[1.8, 3.9], [5.6, 3.9]], 3: [[0.7, 3.9], [3.7, 3.9], [6.7, 3.9]], 4: [[0.3, 3.9], [2.65, 3.9], [5.0, 3.9], [7.35, 3.9]] }[n]; g.ts = n === 4 ? 0.95 : 1.2;
    } else {
      z.position.set(-2.9, 0, 0.8); z.scale.setScalar(1.05); z.rotation.y = 0.3; g.sp = V(1.7, 3.0, 1.4);
      g.P = { 2: [[-2.3, 8.6], [2.3, 8.6]], 3: [[-2.3, 10.1], [2.3, 10.1], [0, 6.7]], 4: [[-2.3, 10.3], [2.3, 10.3], [-2.3, 6.8], [2.3, 6.8]] }[n]; g.ts = 1.2;
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
    let target; do target = pick(keys); while (target === g.prev); g.prev = target;
    const pool = shuffle(keys.filter(k => k !== target)), fam = k => TOY[k][0];
    let ds = [];
    if (g.lvl < 2) { const used = new Set([fam(target)]); for (const k of pool) { if (ds.length >= n - 1) break; if (!used.has(fam(k))) { used.add(fam(k)); ds.push(k); } } }
    else { ds = pool.filter(k => fam(k) === fam(target)).slice(0, 1); for (const k of pool) { if (ds.length >= n - 1) break; if (!ds.includes(k)) ds.push(k); } }
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
  voice: ['muzyka_intro', 'muzyka_najmi', 'muzyka_krasivo'],
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
        if (i === g.want && g.hit) g.hit();
      });
    });
    g.tick = t => xy.userData.bars.forEach((b, i) => { b.userData.mat.emissiveIntensity = i === g.want ? 0.3 + Math.sin(t * 7) * 0.22 : 0; });
  },
  round(g) {
    const bars = g.xy.userData.bars, need = [3, 4, 5][g.lvl];
    // короткая мелодия: вверх, вниз или «качели»
    const type = rnd(3), st = type === 1 ? need - 1 + rnd(7 - need) : rnd(7 - need), seq = [];
    for (let i = 0; i < need; i++) seq.push(type === 0 ? st + i : type === 1 ? st - i : Math.min(5, st + (i % 2 ? 2 : 0) + (i > 1 ? 1 : 0)));
    let idx = 0;
    const light = () => { bars.forEach(unhalo); g.want = seq[idx]; const b = bars[g.want]; halo(b, 0.62, 0.3); b.userData.halo.rotation.x = Math.PI / 2; };
    g.hit = () => {
      hop(g.zaika, 0.35, 260); idx++;
      if (idx < need) { Idle.poke(); light(); return; }
      bars.forEach(unhalo); g.want = -1; g.hit = null;
      g.solved(g.xy.position.clone().add(V(0, 1.2, 1.5)), 'muzyka_krasivo');
    };
    light();
    g.repeat = () => Voice.say('muzyka_najmi');
    g.say('muzyka_najmi');
    Idle.set(() => { Voice.say('muzyka_najmi'); const b = bars[g.want]; b && hop(b, 0.2, 300); });
  },
};
ICONS.muzyka = g => {
  const x = mkKsilofon(4); x.scale.setScalar(0.5); x.rotation.x = 1.0; x.position.set(0, 1.35, 0.1); g.add(x);
  const bars = x.userData.bars;
  g.userData.tick = t => { const k = Math.floor(t * 1.6) % 4; bars.forEach((b, i) => { b.userData.mat.emissiveIntensity = i === k ? 0.4 : 0; }); };
};
