/* Пульт кинофильтров: подключаемый блок для редактора и пробы.
 *
 *   <script src="shader.js"></script><script src="filtry.js"></script><script src="pult.js"></script>
 *   const pult = new KinoPult(document.querySelector('#panel'), {
 *     filtry: F,                       // экземпляр Filtry для живого предпросмотра (можно null: тогда только состояние)
 *     onChange: (state, why) => {...}  // каждое изменение; state в формате сцены
 *   });
 *
 *   pult.get()                 состояние в формате сцены: { look?, filter, filter2?, mix?, trans, atmos, atmosAmount,
 *                              light, lightAmount, grade, gradeAmount, fx: { amount, wind, bloom, rays, flare, grain, vign, ca, bars } }
 *                              Его можно целиком положить в отрезок, событие ({ at: 9, ...state }) или вариант выбора.
 *   pult.set(state, fade?)     показать на пульте (и применить к Filtry) состояние отрезка или события.
 *                              Понимает и короткие записи из старых сцен: { look: 'metel' } или { atmos: 'sneg' }.
 *   pult.event(at)             { at, ...get(), fade } — готовое событие для списка events
 *   pult.reset()               чистое видео
 *   pult.sunAt(x, y)           поставить солнце и центр эффектов (0..1, ноль снизу), например по клику на кадре
 *   pult.fade, pult.trans      длительность и вид смены облика (меняются и на вкладке «Плёнка»)
 *   pult.tab('style')          открыть вкладку: looks, style, atmos, light, grade, film
 *   pult.destroy()
 *
 * Блок занимает всю высоту контейнера: сверху «Слои», ниже вкладки с библиотекой (прокручивается только она).
 * Класс compact на pult.el прячет ползунки выключенных слоёв (для низкой панели).
 * Цвета берутся из CSS-переменных --kp-* с тёмными значениями по умолчанию, так что пульт можно перекрасить под редактор.
 */
(function () {
  'use strict';
  const KNOBS = [['bloom', 'Свечение'], ['rays', 'Лучи света'], ['flare', 'Блик объектива'], ['grain', 'Зерно плёнки'], ['vign', 'Виньетка'], ['ca', 'Цветная кайма'], ['bars', 'Киношные полосы']];
  const TABS = [['looks', 'Образы'], ['style', 'Стиль'], ['atmos', 'Атмосфера'], ['light', 'Свет'], ['grade', 'Цвет'], ['film', 'Плёнка']];
  const r2 = x => Math.round(x * 100) / 100;

  const CSS = `
.kpult { --kp-panel: var(--panel, #13151c); --kp-well: var(--well, #0f1117); --kp-line: var(--line, #262a36); --kp-line2: var(--line2, #353a49);
  --kp-ink: var(--ink, #eceae4); --kp-mute: var(--mute, #9499a8); --kp-acc: var(--acc, #ff9a3d); --kp-acc-ink: var(--acc-ink, #1a0f02);
  --kp-acc-soft: rgba(255, 154, 61, .14); --kp-bad: #ff6b6b; --kp-btn: #1b1e28; --kp-btn-h: #242836;
  height: 100%; min-height: 0; min-width: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr); background: var(--kp-panel); color: var(--kp-ink);
  font: 13px/1.35 'Golos Text', system-ui, -apple-system, 'Segoe UI', sans-serif; color-scheme: dark; -webkit-user-select: none; user-select: none; }
.kpult * { box-sizing: border-box; }
.kpult button { font: 500 13px inherit; font-family: inherit; color: var(--kp-ink); background: var(--kp-btn); border: 1px solid var(--kp-line2); border-radius: 8px; padding: 6px 10px; cursor: pointer; white-space: nowrap; }
.kpult button:hover { background: var(--kp-btn-h); }
.kpult button:focus-visible, .kpult input:focus-visible, .kpult select:focus-visible { outline: 2px solid var(--kp-acc); outline-offset: 1px; }
.kpult button.on { background: var(--kp-acc); color: var(--kp-acc-ink); border-color: var(--kp-acc); font-weight: 700; }
.kpult select { font: 500 13px inherit; font-family: inherit; color: var(--kp-ink); background: var(--kp-btn); border: 1px solid var(--kp-line2); border-radius: 8px; padding: 6px 8px; min-width: 0; }
.kpult input[type=range] { accent-color: var(--kp-acc); height: 22px; min-width: 0; width: 100%; margin: 0; }
.kpult h2 { font: 700 10px 'Unbounded', 'Arial Black', sans-serif; letter-spacing: .1em; text-transform: uppercase; color: var(--kp-mute); margin: 0; }
.kp-layers { padding: 10px 12px 8px; border-bottom: 1px solid var(--kp-line); display: grid; gap: 6px; }
.kp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.kp-look { flex: 1; min-width: 0; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kp-look span { font-weight: 400; color: var(--kp-mute); }
.kp-layer { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 4px 8px; align-items: center; background: var(--kp-well); border: 1px solid var(--kp-line); border-radius: 8px; padding: 6px 8px; }
.kp-layer.act { border-color: var(--kp-line2); }
.kpult .kp-lname { color: var(--kp-mute); background: none; border: 0; padding: 0; text-align: left; font-weight: 700; }
.kpult .kp-lname:hover { color: var(--kp-ink); background: none; }
.kp-layer.act .kp-lname { color: var(--kp-ink); }
.kp-vals { display: flex; gap: 4px; flex-wrap: nowrap; overflow: hidden; height: 24px; align-items: center; min-width: 0; }
.kp-vals em { font-style: normal; color: var(--kp-mute); }
.kp-val { display: inline-flex; align-items: center; gap: 2px; background: var(--kp-acc-soft); border: 1px solid rgba(255, 154, 61, .45); border-radius: 6px; padding: 2px 2px 2px 7px; min-width: 0; flex: 0 1 auto; }
.kp-val span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpult .kp-val button { border: 0; background: none; padding: 0 5px; color: var(--kp-mute); font-size: 15px; line-height: 1; }
.kpult .kp-val button:hover { color: var(--kp-bad); background: none; }
.kp-ctl { grid-column: 1 / -1; display: grid; grid-template-columns: 86px minmax(0, 1fr) 30px; gap: 8px; align-items: center; transition: opacity .15s; }
.kp-layer:not(.act) .kp-ctl, .kp-ctl.dis { opacity: .3; pointer-events: none; }
.kpult.compact .kp-layer:not(.act) .kp-ctl, .kpult.compact .kp-ctl.dis { display: none; }
.kp-ctl label { color: var(--kp-mute); font-size: 12px; }
.kp-ctl output { text-align: right; font: 11px ui-monospace, monospace; color: var(--kp-mute); font-variant-numeric: tabular-nums; }
.kp-tabs { display: grid; grid-template-columns: repeat(6, auto); border-bottom: 1px solid var(--kp-line); }
.kpult .kp-tabs button { border: 0; border-radius: 0; background: none; padding: 9px 2px; color: var(--kp-mute); border-bottom: 2px solid transparent; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.kpult .kp-tabs button:hover { color: var(--kp-ink); }
.kpult .kp-tabs button.on { color: var(--kp-acc); border-bottom-color: var(--kp-acc); background: none; font-weight: 700; }
.kp-lib { overflow-y: auto; min-height: 0; padding: 10px 12px 14px; }
.kp-pane { display: none; } .kp-pane.on { display: block; }
.kp-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.kp-tiles h2 { grid-column: 1 / -1; margin-top: 8px; } .kp-tiles h2:first-child { margin-top: 0; }
.kpult .kp-tile { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 6px; text-align: left; padding: 7px 8px; min-height: 36px; white-space: normal; }
.kp-tile .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kp-tile small { grid-column: 2 / -1; color: var(--kp-mute); font-size: 11px; line-height: 1.25; }
.kp-tile.on small { color: var(--kp-acc-ink); opacity: .8; }
.kp-tile .n2 { font: 700 10px 'Unbounded', sans-serif; background: var(--kp-acc-ink); color: var(--kp-acc); border-radius: 4px; padding: 1px 5px; }
.kp-note { color: var(--kp-mute); font-size: 12px; margin: 0 0 10px; }
.kp-seg { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 10px; }
.kpult .kp-seg button { border-radius: 0; } .kpult .kp-seg button:first-child { border-radius: 8px 0 0 8px; } .kpult .kp-seg button:last-child { border-radius: 0 8px 8px 0; border-left: 0; }
.kp-knobs { display: grid; gap: 4px; }
.kp-knobs .kp-ctl { grid-template-columns: 120px minmax(0, 1fr) 30px; }
`;

  class KinoPult {
    constructor(root, opt = {}) {
      if (typeof Filtry === 'undefined') throw new Error('KinoPult: сначала подключите filtry.js');
      this.root = root; this.F = opt.filtry || null; this.onChange = opt.onChange || null;
      this.fade = opt.fade != null ? opt.fade : 1.5; this.trans = opt.trans || 'pyatna';
      this.S = { look: '', edited: false, st1: null, st2: null, atm: [], light: null, grade: null, slot: 1 };
      this.V = { amount: 1, mix: 0.5, atmosAmount: 0.6, wind: 0, lightAmount: 1, gradeAmount: 1 };
      for (const [k] of KNOBS) this.V[k] = 0;
      if (!document.getElementById('kpult-css')) { const st = document.createElement('style'); st.id = 'kpult-css'; st.textContent = CSS; document.head.appendChild(st); }
      this._build();
      this._sync();
    }

    // ---------------- разметка ----------------
    _build() {
      const el = this.el = document.createElement('div'); el.className = 'kpult';
      const ctl = (id, label, min, max, step) => `<div class="kp-ctl" data-c="${id}"><label>${label}</label><input type="range" data-k="${id}" min="${min}" max="${max}" step="${step}"><output data-o="${id}"></output></div>`;
      el.innerHTML = `
<div class="kp-layers">
  <div class="kp-head"><h2>Слои</h2><div class="kp-look"></div><button data-a="reset" title="Выключить все слои">Сбросить всё</button></div>
  <div class="kp-layer" data-l="style"><button class="kp-lname" data-go="style">Стиль</button><div class="kp-vals"></div>${ctl('amount', 'Сила', 0, 1, .01)}${ctl('mix', 'Смесь 1 ↔ 2', .05, .95, .01)}</div>
  <div class="kp-layer" data-l="atmos"><button class="kp-lname" data-go="atmos">Атмосфера</button><div class="kp-vals"></div>${ctl('atmosAmount', 'Густота', 0, 1, .01)}${ctl('wind', 'Ветер', -1, 1, .01)}</div>
  <div class="kp-layer" data-l="light"><button class="kp-lname" data-go="light">Свет</button><div class="kp-vals"></div>${ctl('lightAmount', 'Сила', 0, 1, .01)}</div>
  <div class="kp-layer" data-l="grade"><button class="kp-lname" data-go="grade">Цвет</button><div class="kp-vals"></div>${ctl('gradeAmount', 'Сила', 0, 1, .01)}</div>
</div>
<div class="kp-tabs">${TABS.map(([k, n], i) => `<button data-t="${k}"${i ? '' : ' class="on"'}>${n}</button>`).join('')}</div>
<div class="kp-lib">
  <div class="kp-pane on" data-p="looks"><p class="kp-note">Образ заполняет все слои сразу. После этого любой слой можно поменять или убрать. Повторное нажатие выключает образ.</p><div class="kp-tiles" data-box="looks"></div></div>
  <div class="kp-pane" data-p="style"><div class="kp-seg"><button data-slot="1" class="on">Выбираю стиль 1</button><button data-slot="2">Выбираю стиль 2</button></div>
    <p class="kp-note">Два стиля смешиваются в одной картинке, доля задаётся ползунком «Смесь». Повторное нажатие выключает стиль.</p><div class="kp-tiles" data-box="style"></div></div>
  <div class="kp-pane" data-p="atmos"><p class="kp-note">Слои атмосферы складываются, одновременно до трёх. Повторное нажатие убирает слой.</p><div class="kp-tiles" data-box="atmos"></div></div>
  <div class="kp-pane" data-p="light"><p class="kp-note">Один свет на кадр. Повторное нажатие выключает свет.</p><div class="kp-tiles" data-box="light"></div></div>
  <div class="kp-pane" data-p="grade"><p class="kp-note">Одна цветокоррекция на кадр. Повторное нажатие выключает её.</p><div class="kp-tiles" data-box="grade"></div></div>
  <div class="kp-pane" data-p="film"><h2>Оптика и плёнка</h2><div class="kp-knobs" style="margin:8px 0 14px">${KNOBS.map(([k, n]) => ctl(k, n, 0, 1, .01)).join('')}</div>
    <h2>Смена облика</h2><div class="kp-knobs" style="margin-top:8px">${ctl('fade', 'Длительность, с', 0, 6, .1)}
    <div class="kp-ctl"><label>Вид перехода</label><select data-a="trans" style="grid-column:2 / -1">${Filtry.TRANS.map(t => `<option value="${t.key}">${t.name}</option>`).join('')}</select></div></div></div>
</div>`;
      this.root.appendChild(el);
      const q = s => el.querySelector(s), box = k => q(`[data-box="${k}"]`);
      const tile = (b, key, e, name, sub) => {
        const t = document.createElement('button'); t.className = 'kp-tile'; t.dataset.k = key;
        t.innerHTML = `<span>${e}</span><span class="nm">${name}</span><span class="tag"></span>${sub ? `<small>${sub}</small>` : ''}`;
        t.title = name + (sub ? ': ' + sub : ''); b.appendChild(t);
      };
      for (const k in Filtry.LOOKS) { const L = Filtry.LOOKS[k]; tile(box('looks'), k, L.e, L.name, L.mood); }
      let g = ''; for (const e of Filtry.EFFECTS) { if (!e.id) continue; if (e.grp !== g) { g = e.grp; const h = document.createElement('h2'); h.textContent = g; box('style').appendChild(h); } tile(box('style'), e.key, e.e, e.name); }
      for (const k in Filtry.ATMOS) tile(box('atmos'), k, Filtry.ATMOS[k].e, Filtry.ATMOS[k].name);
      for (const k in Filtry.LIGHTS) tile(box('light'), k, Filtry.LIGHTS[k].e, Filtry.LIGHTS[k].name);
      for (const k in Filtry.GRADES) tile(box('grade'), k, Filtry.GRADES[k].e, Filtry.GRADES[k].name);

      const pick = { looks: k => this.pickLook(k), style: k => this.pickStyle(k), atmos: k => this.pickAtmos(k), light: k => this.pickLight(k), grade: k => this.pickGrade(k) };
      el.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || !el.contains(b)) return;
        if (b.dataset.t) return this.tab(b.dataset.t);
        if (b.dataset.go) return this.tab(b.dataset.go);
        if (b.dataset.slot) { this.S.slot = +b.dataset.slot; return this._sync(); }
        if (b.dataset.a === 'reset') return this.reset();
        if (b.dataset.off) return this._off(b.dataset.off);
        const t = b.closest('.kp-tile'); if (t) pick[t.parentNode.dataset.box](t.dataset.k);
      });
      el.addEventListener('input', e => {
        const k = e.target.dataset.k;
        if (k) return this._slider(k, +e.target.value);
        if (e.target.dataset.a === 'trans') this.trans = e.target.value;
      });
      q('[data-a="trans"]').value = this.trans;
    }

    // ---------------- действия: каждая плитка - переключатель ----------------
    _edited(why) { if (this.S.look) this.S.edited = true; this._sync(); this._emit(why); }
    _emit(why) { this.onChange && this.onChange(this.get(), why); }
    _applyStyle(instant) {
      const S = this.S, F = this.F;
      if (!S.st1 && S.st2) { S.st1 = S.st2; S.st2 = null; }
      if (!F) return;
      if (S.st1 && S.st2) F.setBlend(S.st1, S.st2, this.V.mix); else F.setStyle(S.st1 || 'none', instant ? 0 : this.fade, this.trans);
      F.set({ amount: this.V.amount }, 0);
    }
    pickStyle(k) {
      const S = this.S, had2 = !!S.st2;
      if (S.st1 === k) S.st1 = null; else if (S.st2 === k) S.st2 = null;
      else if (S.slot === 2 && S.st1) S.st2 = k; else S.st1 = k;
      this._applyStyle(had2); this._edited('style');
    }
    pickAtmos(k) {
      const S = this.S; S.atm = S.atm.includes(k) ? S.atm.filter(x => x !== k) : S.atm.concat(k).slice(-3);
      this.F && this.F.setAtmos(S.atm.length ? S.atm : 'none', this.fade, this.V.atmosAmount); this._edited('atmos');
    }
    pickLight(k) {
      const S = this.S, V = this.V; S.light = S.light === k ? null : k;
      const L = Filtry.LIGHTS[S.light] || {}; V.rays = (L.rays || 0) * V.lightAmount; V.flare = (L.flare || 0) * V.lightAmount;
      this.F && this.F.setLight(S.light || 'none', this.fade, V.lightAmount); this._edited('light');
    }
    pickGrade(k) { const S = this.S; S.grade = S.grade === k ? null : k; this.F && this.F.setGrade(S.grade || 'none', this.fade, this.V.gradeAmount); this._edited('grade'); }
    pickLook(k) {
      if (this.S.look === k) k = 'chisto';                                 // повторное нажатие выключает образ
      if (!Filtry.LOOKS[k]) return;
      this._fromLook(k); this.F && this.F.setLook(k, this.fade); this._sync(); this._emit('look');
    }
    reset() { this.pickLook('chisto'); }
    _off(layer) {
      const [l, k] = layer.split(':');
      if (l === 'style') this.pickStyle(k); else if (l === 'atmos') this.pickAtmos(k); else if (l === 'light') this.pickLight(k); else if (l === 'grade') this.pickGrade(k);
    }
    _slider(k, x) {
      const F = this.F, S = this.S, V = this.V;
      if (k === 'fade') { this.fade = x; return this._sync(); }
      V[k] = x;
      if (F) {
        if (k === 'amount' || k === 'wind' || KNOBS.some(n => n[0] === k)) F.set({ [k]: x }, 0);
        else if (k === 'mix') { if (S.st1 && S.st2) F.setBlend(S.st1, S.st2, x); }
        else if (k === 'atmosAmount') { if (S.atm.length) F.setAtmos(S.atm, 0.3, x); }
        else if (k === 'lightAmount') { if (S.light) F.setLight(S.light, 0.2, x); }
        else if (k === 'gradeAmount') { if (S.grade) F.setGrade(S.grade, 0.2, x); }
      }
      this._edited(k);
    }
    sunAt(x, y) { if (this.F) { this.F.touch = [x, y]; this.F.set({ sunX: x, sunY: y }, 0); } }
    tab(t) {
      this.el.querySelectorAll('.kp-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      this.el.querySelectorAll('.kp-pane').forEach(p => p.classList.toggle('on', p.dataset.p === t));
      this.el.querySelector('.kp-lib').scrollTop = 0;
    }

    // ---------------- состояние ----------------
    _fromLook(k) {
      const L = Filtry.LOOKS[k], S = this.S, V = this.V, LI = Filtry.LIGHTS[L.light] || {}, la = L.lightAmt != null ? L.lightAmt : 1;
      S.look = k === 'chisto' ? '' : k; S.edited = false; S.st1 = L.style ? Filtry.info(Filtry.styleId(L.style)).key : null; S.st2 = null;
      if (S.st1 === 'none') S.st1 = null;
      S.atm = (L.atmos || []).map(a => Array.isArray(a) ? a[0] : a); S.light = L.light || null; S.grade = L.grade || null;
      const a0 = L.atmos && L.atmos[0];
      Object.assign(V, { amount: L.amount != null ? L.amount : 1, mix: 0.5, atmosAmount: Array.isArray(a0) ? a0[1] : 0.6, wind: L.wind || 0, lightAmount: la, gradeAmount: L.gradeAmt != null ? L.gradeAmt : 1 });
      const D = Filtry.DEFAULTS || {};
      for (const [n] of KNOBS) V[n] = L[n] != null ? L[n] : (n === 'rays' || n === 'flare' ? (LI[n] || 0) * la : (D[n] || 0));
    }
    get() {
      const S = this.S, V = this.V, o = {};
      if (S.look && !S.edited) o.look = S.look;
      o.filter = S.st1 || 'none';
      if (S.st1 && S.st2) { o.filter2 = S.st2; o.mix = r2(V.mix); }
      o.trans = this.trans;
      o.atmos = S.atm.length ? S.atm.slice() : 'none'; o.atmosAmount = r2(V.atmosAmount);
      o.light = S.light || 'none'; o.lightAmount = r2(V.lightAmount);
      o.grade = S.grade || 'none'; o.gradeAmount = r2(V.gradeAmount);
      o.fx = { amount: r2(V.amount), wind: r2(V.wind) }; for (const [n] of KNOBS) o.fx[n] = r2(V[n]);
      if (S.look && S.edited) o.lookBase = S.look;                        // для подписи «изменён»; движок это поле не читает
      return o;
    }
    _sig() { const o = this.get(); delete o.look; delete o.lookBase; delete o.trans; return JSON.stringify(o); }
    event(at) { return Object.assign({ at }, this.get(), { fade: this.fade }); }
    set(e, fade) {
      e = e || {}; const S = this.S, V = this.V;
      const base = e.look || e.lookBase;
      if (base && Filtry.LOOKS[base]) this._fromLook(base); else if (!e.keep) this._fromLook('chisto');
      const pure = S.look ? this._sig() : null;
      const key = x => { const id = Filtry.styleId(x); return id ? Filtry.info(id).key : null; };
      if (e.filter != null) { S.st1 = key(e.filter); S.st2 = e.filter2 && e.filter2 !== 'none' ? key(e.filter2) : null; if (e.mix != null) V.mix = e.mix; }
      if (e.trans) this.trans = e.trans;
      if (e.atmos != null) { const l = e.atmos === 'none' ? [] : (Array.isArray(e.atmos) ? e.atmos : [e.atmos]); S.atm = l.map(a => Array.isArray(a) ? a[0] : a).filter(a => Filtry.ATMOS[a]).slice(-3); }
      if (e.atmosAmount != null) V.atmosAmount = e.atmosAmount;
      if (e.light != null) { S.light = e.light === 'none' ? null : e.light; const L = Filtry.LIGHTS[S.light] || {}; V.rays = (L.rays || 0) * (e.lightAmount != null ? e.lightAmount : 1); V.flare = (L.flare || 0) * (e.lightAmount != null ? e.lightAmount : 1); }
      if (e.lightAmount != null) V.lightAmount = e.lightAmount;
      if (e.grade != null) S.grade = e.grade === 'none' ? null : e.grade;
      if (e.gradeAmount != null) V.gradeAmount = e.gradeAmount;
      if (e.fx) for (const k in e.fx) if (k in V) V[k] = e.fx[k];
      if (e.fade != null && fade == null) fade = e.fade;
      if (S.look) S.edited = this._sig() !== pure;                         // образ «изменён», только если слои отличаются от него
      if (this.F) this.F.apply(this.get(), fade != null ? fade : this.fade);
      this._sync();
    }

    // ---------------- показать ----------------
    _sync() {
      const S = this.S, V = this.V, el = this.el, q = s => el.querySelector(s);
      const st = [S.st1, S.st2].filter(Boolean), E = k => Filtry.EFFECTS.find(e => e.key === k) || { name: k };
      const chips = (l, items, empty) => {
        const b = q(`[data-l="${l}"] .kp-vals`); b.innerHTML = '';
        if (!items.length) { b.innerHTML = `<em>${empty}</em>`; return; }
        for (const [label, k] of items) { const c = document.createElement('span'); c.className = 'kp-val'; c.innerHTML = `<span>${label}</span><button data-off="${l}:${k}" title="Убрать: ${label}">×</button>`; b.appendChild(c); }
      };
      chips('style', st.map((k, i) => [(st.length > 1 ? (i + 1) + '. ' : '') + E(k).name, k]), 'нет');
      chips('atmos', S.atm.map(k => [Filtry.ATMOS[k].name, k]), 'нет');
      chips('light', S.light ? [[Filtry.LIGHTS[S.light].name, S.light]] : [], 'как снято');
      chips('grade', S.grade ? [[Filtry.GRADES[S.grade].name, S.grade]] : [], 'как снято');
      q('[data-l="style"]').classList.toggle('act', st.length > 0); q('[data-l="atmos"]').classList.toggle('act', S.atm.length > 0);
      q('[data-l="light"]').classList.toggle('act', !!S.light); q('[data-l="grade"]').classList.toggle('act', !!S.grade);
      q('[data-c="mix"]').classList.toggle('dis', st.length < 2);
      const L = Filtry.LOOKS[S.look], any = st.length || S.atm.length || S.light || S.grade;
      q('.kp-look').innerHTML = L ? L.name + (S.edited ? ' <span>(изменён)</span>' : '') : `<span>${any ? 'своя смесь' : 'чистое видео'}</span>`;
      const mark = (b, keys) => el.querySelectorAll(`[data-box="${b}"] .kp-tile`).forEach(t => {
        const i = keys.indexOf(t.dataset.k), n = b === 'style' && st.length > 1 && i >= 0; t.classList.toggle('on', i >= 0);
        const tag = t.querySelector('.tag'); tag.className = 'tag' + (n ? ' n2' : ''); tag.textContent = n ? i + 1 : '';
      });
      mark('looks', [S.look]); mark('style', st); mark('atmos', S.atm); mark('light', [S.light]); mark('grade', [S.grade]);
      el.querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('on', +b.dataset.slot === S.slot));
      const vals = Object.assign({ fade: this.fade }, V);
      el.querySelectorAll('input[data-k]').forEach(i => { const k = i.dataset.k, x = vals[k]; if (x == null) return; if (document.activeElement !== i) i.value = x; const o = el.querySelector(`[data-o="${k}"]`); if (o) o.textContent = k === 'fade' ? (+x).toFixed(1) : Math.round(x * 100); });
      q('[data-a="trans"]').value = this.trans;
    }
    destroy() { this.el.remove(); }
  }
  KinoPult.KNOBS = KNOBS;
  window.KinoPult = KinoPult;
})();
