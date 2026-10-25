/* gorod.js - летающий город «Взлёт» для игры «Операторы дронов».
   Перенесено из карты курса (centrspektr/kursy, engine/kosmos-kurs.js, снимок 24.10.2026): та же раскладка, здания модулей,
   кристалл, дороги, роботы, окраины и пол города. Здесь город строится в настоящем размере, по нему летает дрон игрока.
   GOROD.build(o) -> {g, R, tick(t,dt), solids, doors, start, road, setState(st), scale}
     o.mods  - модули курса [{id,n,t}] по порядку; o.mob - телефон (меньше деталей); o.q - графика 0..3
     o.state - {m1:'open'|'done'|'lock', ...}
   Сам город собран в единицах карты (платформа радиусом 62) и увеличен в SC раз: 1 единица = SC метров. */
window.GOROD=(function(){
'use strict';
const SC=2.5;                       // во сколько раз город крупнее, чем на карте: платформа около 155 м в радиусе
const PY=0, CZ=0, RI=62;            // верх платформы, её центр, радиус (в единицах карты)
const MC=['#7cf3ff','#ff7ce0','#ffd36e','#9dff7c','#ff9f5a','#a78bfa'];
const TOPH={k:6,kb:8,kt:8,kp:8,kc:11,1:10,2:11,3:13,4:19,5:8,6:28};
const OPEN_MODS=[1,4,6];            // модули-здания из кода (свой силуэт), у остальных готовые модели Kenney
const MODELI={2:'modeli/masterskaya.glb',3:'modeli/akkumulyatornaya.glb',5:'modeli/stadion.glb',k:'modeli/kiosk.glb'};
const FAS={1:'lenta',4:'steklo',6:'lamel'}, VYV={1:'ШКОЛА FPV',4:'ДИСПЕТЧЕР',6:'БАШНЯ АСА'};
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
let mob=false, HQ=1;                 // HQ - во сколько раз чётче рисуем текстуры (ПК)

function tex(draw,w,h){ w=Math.round(w*HQ); h=Math.round((h||w/HQ)*HQ); const n=document.createElement('canvas'); n.width=w; n.height=h; const x=n.getContext('2d'); if(HQ!==1) x.scale(HQ,HQ); draw(x,w/HQ,h/HQ); const t=new THREE.CanvasTexture(n); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t; }
const GLOW={};
function glowTex(c){ if(GLOW[c]) return GLOW[c]; return GLOW[c]=tex((x,s)=>{ const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); g.addColorStop(0,'#fff'); g.addColorStop(.12,c); g.addColorStop(.4,c+'55'); g.addColorStop(1,c+'00'); x.fillStyle=g; x.fillRect(0,0,s,s); },128); }
function spr(c,s,op){ const q=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex(c),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:op==null?1:op})); q.scale.setScalar(s); return q; }
function numTex(t,col){ return tex((x,s)=>{ x.font='400 '+(s*.56)+'px "Russo One", Rubik, sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  x.lineWidth=s*.07; x.strokeStyle='rgba(4,5,20,.85)'; x.strokeText(t,s/2,s/2+s*.03); x.fillStyle=col||'#fff'; x.fillText(t,s/2,s/2+s*.03); },128); }

function winTex(c){ const t=tex((x,w,h)=>{ x.fillStyle='#0b1022'; x.fillRect(0,0,w,h);
  for(let yy=5;yy<h;yy+=12) for(let xx=5;xx<w;xx+=11){ const on=Math.random()<.55; x.globalAlpha=on?.5+Math.random()*.5:1; x.fillStyle=on?(Math.random()<.35?c:'#ffe7a8'):'#151b36'; x.fillRect(xx,yy,6,7); }
  x.globalAlpha=1; },128,256); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; }
function facTex(c,k){ const t=tex((x,w,h)=>{ let i,xx,yy;
  if(k==='lenta'){ x.fillStyle='#10162e'; x.fillRect(0,0,w,h); for(yy=4;yy<h;yy+=16){ const g=x.createLinearGradient(0,0,w,0); g.addColorStop(0,'#1b2a52'); g.addColorStop(.5,Math.random()<.5?'#ffe7a8':c); g.addColorStop(1,'#1b2a52'); x.globalAlpha=.4+Math.random()*.6; x.fillStyle=g; x.fillRect(0,yy,w,8); x.globalAlpha=1; x.fillStyle='#0b1022'; for(xx=0;xx<w;xx+=16) x.fillRect(xx,yy,2,8); } }
  else if(k==='steklo'){ const g2=x.createLinearGradient(0,0,w,h); g2.addColorStop(0,'#1e3a6e'); g2.addColorStop(.5,'#3a6fb0'); g2.addColorStop(1,'#15244a'); x.fillStyle=g2; x.fillRect(0,0,w,h); x.strokeStyle='rgba(10,16,34,.9)'; x.lineWidth=2;
    for(xx=0;xx<=w;xx+=21){ x.beginPath(); x.moveTo(xx,0); x.lineTo(xx,h); x.stroke(); } for(yy=0;yy<=h;yy+=32){ x.beginPath(); x.moveTo(0,yy); x.lineTo(w,yy); x.stroke(); }
    for(i=0;i<30;i++){ x.fillStyle=Math.random()<.5?'rgba(255,231,168,.85)':c; x.fillRect(Math.floor(Math.random()*6)*21+2,Math.floor(Math.random()*8)*32+2,18,29); } }
  else { x.fillStyle='#0b1022'; x.fillRect(0,0,w,h); for(xx=6;xx<w;xx+=18) for(yy=0;yy<h;yy+=6){ const on=Math.random()<.6; x.fillStyle=on?(Math.random()<.3?c:'#ffe7a8'):'#141a33'; x.globalAlpha=on?.5+Math.random()*.5:1; x.fillRect(xx,yy,8,4); } x.globalAlpha=1; }
  },128,256); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; }
function vyvTex(c,s){ return tex((x,w,h)=>{ x.fillStyle='rgba(5,8,20,.92)'; x.fillRect(0,0,w,h); x.strokeStyle=c; x.lineWidth=6; x.strokeRect(5,5,w-10,h-10); x.font='400 50px "Russo One", Rubik, sans-serif'; x.fillStyle=c; x.textAlign='center'; x.textBaseline='middle'; x.shadowColor=c; x.shadowBlur=12; x.fillText(s,w/2,h/2+3,w-30); },384,112); }

/* здание открытого модуля (1 ярусы, 4 скошенные углы и стекло, 6 овальная башня): как в kosmos-kurs.js */
function rbBody(g,st,bw,bl,hh,o){ const s=o.s, gl=o.glow(1), top=o.top||null;
  function box(w,h,d,m,x,y,z){ const me=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); me.position.set(x||0,y,z||0); g.add(me); return me; }
  function cap(w,h,d,y){ const sm=o.side(h/hh); return box(w,h,d,top?[sm,sm,top,sm,sm,sm]:sm,0,y,0); }
  let sx=bw/2, sz=0; const sy=hh*.6; let hc=hh;
  if(st===1){
    let y=0; [[1.25,1.12,.22],[1.12,1.06,.28],[1,1,.5]].forEach((q,j)=>{ const h=hh*q[2], w=bw*q[0], d=bl*q[1]; if(j<2) box(w,h,d,o.side(q[2]),0,y+h/2,0); else cap(w,h,d,y+h/2);
      if(j<2) box(w+.3*s,.3*s,d+.3*s,gl,0,y+h,0); y+=h; });
    for(let yb=hh-1.2*s;yb>hh*.5+.5*s;yb-=3*s) box(bw+.6*s,.18*s,bl+.6*s,o.dark,0,yb,0); }
  else if(st===4){
    const a=bw/2, b=bl/2, k=bw*.22, sh=new THREE.Shape(); sh.moveTo(-a+k,-b); sh.lineTo(a-k,-b); sh.lineTo(a,-b+k); sh.lineTo(a,b-k); sh.lineTo(a-k,b); sh.lineTo(-a+k,b); sh.lineTo(-a,b-k); sh.lineTo(-a,-b+k); sh.closePath();
    const ch=1.4*s, hb=hh-ch, ge=new THREE.ExtrudeGeometry(sh,{depth:hb,bevelEnabled:false}); ge.rotateX(-Math.PI/2);
    const sm=o.side(1); sm.map.repeat.set(o.RX/bw,o.RY/hh); g.add(new THREE.Mesh(ge,[o.dark,sm]));
    const rg=new THREE.ExtrudeGeometry(sh,{depth:.25*s,bevelEnabled:false}); rg.rotateX(-Math.PI/2); const rm=o.glow(.7);
    for(let yr=hb/4;yr<hb-.5*s;yr+=hb/4){ const ring=new THREE.Mesh(rg,rm); ring.position.y=yr; ring.scale.set(1.03,1,1.03); g.add(ring); }
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(q=>{ box(.3*s,hb,.3*s,o.glow(.9),q[0]*(a-k/2),hb/2,q[1]*(b-k/2)).rotation.y=q[0]*q[1]*Math.PI/4; });
    cap(bw,ch,bl,hb+ch/2); box(bw+.3*s,.3*s,bl+.3*s,gl,0,hb,0); }
  else {
    const dh=1.6*s; hc=hh-dh; const cy=new THREE.CylinderGeometry(.5,.4,1,40,1,true), cm=o.side(1); cm.map.repeat.set(o.RX*4.5,o.RY*hc/hh); cm.side=THREE.DoubleSide;
    const tw=new THREE.Mesh(cy,cm); tw.scale.set(bw*.9,hc,bl*.9); tw.position.y=hc/2; g.add(tw);
    const tr=new THREE.Mesh(new THREE.TorusGeometry(.5,.012,6,64),o.glow(1)); tr.rotation.x=Math.PI/2; tr.scale.set(bw*.98,bl*.98,s*12); tr.position.y=hc*.75; g.add(tr);
    const tr2=tr.clone(); tr2.scale.set(bw*.86,bl*.86,s*12); tr2.position.y=hc*.4; g.add(tr2);
    for(let j=0;j<8;j++){ const an=j/8*Math.PI*2+.2; box(.22*s,hc*.9,.22*s,o.glow(.55,'#ffffff'),Math.sin(an)*bw*.43,hc*.48,Math.cos(an)*bl*.43); }
    const sk=new THREE.Mesh(new THREE.CylinderGeometry(.5,.45,1,40,1,true),o.glow(.5)); sk.scale.set(bw*.98,.5*s,bl*.98); sk.position.y=hc-.25*s; g.add(sk);
    cap(bw,dh,bl,hc+dh/2); box(bw+.3*s,.3*s,bl+.3*s,gl,0,hc,0); sx=bw*.46; sz=0; }
  const sg=new THREE.Mesh(new THREE.PlaneGeometry(bw*.8,bw*.24),o.sign); sg.position.set(sx+.35*s,sy,sz); sg.rotation.y=Math.PI/2; g.add(sg);
  const sg2=sg.clone(); sg2.position.x=-sg.position.x; sg2.rotation.y=-Math.PI/2; g.add(sg2);
  for(let m=0;m<3;m++){ const bx=(m-1)*bw*.25, by=hh*(.25+m*.17), bz=st===6?bl*.9*(.4+.1*by/hc)*Math.sqrt(1-bx*bx/(bw*bw*Math.pow(.9*(.4+.1*by/hc),2))):bl/2; box(1.4*s,.5*s,1*s,o.dark,bx,by,bz+.5*s); }
  const nz=-bl*.3, nx=st===6?bw*.9*(.4+.04*hh/hc)*Math.sqrt(1-nz*nz/(bl*bl*Math.pow(.9*(.4+.04*hh/hc),2))):bw/2; box(.5*s,hh*.35,.5*s,o.glow(.9,'#ff7ce0'),-nx-.1*s,hh*.4,nz); }

/* готовые модели Kenney (CC0): грузятся из modeli/, пока грузятся - стоит здание из кода */
const MCACHE={};
function getModel(url,cb){ if(!THREE.GLTFLoader) return; let c=MCACHE[url]; if(c&&c.sc){ cb(c.sc.clone(true)); return; } if(c){ c.q.push(cb); return; } c=MCACHE[url]={q:[cb]};
  new THREE.GLTFLoader().load(url,g=>{ c.sc=g.scene; c.q.splice(0).forEach(f=>f(c.sc.clone(true))); },null,()=>{ c.q=[]; }); }
function useModel(o,par,url,h,w,y0,done){ if(!url) return; getModel(url,m=>{ const bx=new THREE.Box3().setFromObject(m), sz=bx.getSize(V()), k=Math.min(h/(sz.y||1),w/(Math.max(sz.x,sz.z)||1));
  m.scale.setScalar(k); m.position.set(-(bx.min.x+bx.max.x)/2*k,y0-bx.min.y*k,-(bx.min.z+bx.max.z)/2*k);
  m.traverse(q=>{ if(q.isMesh){ const fix=mt=>{ mt=mt.clone(); if(mt.map) mt.map.encoding=THREE.sRGBEncoding; if(o.c&&mt.emissive){ mt.emissive.set(o.c).convertSRGBToLinear(); mt.emissiveIntensity=.22; } return mt; };
    q.material=Array.isArray(q.material)?q.material.map(fix):fix(q.material); q.castShadow=q.receiveShadow=true; } });
  (o.body||[]).forEach(q=>{ q.visible=false; }); o.anim=[]; par.add(m); o.model=m; done&&done(sz.x*k/2,sz.z*k/2,y0+sz.y*k); }); }

function mkDrone(col,led){
  const dg=new THREE.Group(), bc=new THREE.Color(col), fr=new THREE.MeshLambertMaterial({color:0x1a1f33,emissive:bc,emissiveIntensity:.15}), props=[];
  [Math.PI/4,-Math.PI/4].forEach(r=>{ const arm=new THREE.Mesh(new THREE.BoxGeometry(3.2,.12,.32),fr); arm.rotation.y=r; dg.add(arm); });
  dg.add(new THREE.Mesh(new THREE.BoxGeometry(.9,.22,1.3),fr));
  const can=new THREE.Mesh(new THREE.SphereGeometry(.5,12,8,0,6.283,0,Math.PI/2),new THREE.MeshLambertMaterial({color:bc,emissive:bc,emissiveIntensity:.35})); can.scale.set(1,.8,1.4); can.position.y=.1; dg.add(can);
  const cam=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.25),new THREE.MeshLambertMaterial({color:0x0b0f1e})); cam.position.set(0,.25,.75); dg.add(cam);
  [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(q=>{ const x0=q[0]*1.13, z0=q[1]*1.13, mo=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.28,10),new THREE.MeshLambertMaterial({color:0x8892b0})); mo.position.set(x0,.16,z0); dg.add(mo);
    const bl=new THREE.Mesh(new THREE.BoxGeometry(1.4,.03,.12),new THREE.MeshBasicMaterial({color:0xcfe8ff,transparent:true,opacity:.5})); bl.position.set(x0,.34,z0); dg.add(bl); props.push(bl); });
  const lt=spr(led||'#4ade80',1.6); lt.position.set(0,-.2,-.7); dg.add(lt);
  return {g:dg,lt,props}; }

function build(o){
  mob=!!o.mob; HQ=o.q>=2?2:1;
  const G=new THREE.Group(), anim=[], solids=[], doors=[], nodes=[], H=V(0,PY,RI-8);
  const mods=o.mods;
  const L0=(n,col,ei,x)=>{ const q={color:col==null?0x1b2240:col,emissive:new THREE.Color(n.c),emissiveIntensity:ei||.08}; for(const k in x) q[k]=x[k]; const m=new THREE.MeshLambertMaterial(q); n.mats.push(m); return m; };
  const glowM=(n,x)=>{ const m=new THREE.MeshBasicMaterial(Object.assign({color:new THREE.Color(n.c),transparent:true,opacity:.85},x||{})); n.mats.push(m); return m; };

  /* ---- здания модулей и киоски ---- */
  function building(n){ const b=new THREE.Group(), w=n.s*2.1, st=n.st0; b.position.set(n.p[0],PY,n.p[2]); G.add(b); n.bld=b; n.mats=[]; n.anim=[];
    const add=(geo,m,x,y,z,par)=>{ const me=new THREE.Mesh(geo,m); me.position.set(x||0,y||0,z||0); (par||b).add(me); return me; };
    const wt=winTex(n.c), win=rep=>{ const t=wt.clone(); t.needsUpdate=true; t.repeat.set(rep[0],rep[1]); return L0(n,0xffffff,.85,{map:t,emissive:0xffffff,emissiveMap:t}); };
    add(new THREE.CylinderGeometry(w*1.15,w*1.3,1,10),L0(n,0x1b2240,.1),0,.5,0);
    const k0=b.children.length;
    if(n.rb){ const bw=w*1.7, bl=w*3.6, hh=TOPH[st]-1; b.rotation.y=Math.atan2(n.p[0],n.p[2]-CZ);
      const ft=facTex(n.c,FAS[st]), rbg=new THREE.Group(); rbg.position.y=1; b.add(rbg);
      rbBody(rbg,st,bw,bl,hh,{s:1,RX:2,RY:hh/5,c:n.c,dark:L0(n,0x8892b0,.15),sign:new THREE.MeshBasicMaterial({map:vyvTex(n.c,VYV[st]),transparent:true,opacity:.9,side:THREE.DoubleSide}),
        side:f=>{ const t=ft.clone(); t.needsUpdate=true; t.repeat.set(2,Math.max(1,Math.round(hh*f/5))); return L0(n,0xffffff,.85,{map:t,emissive:0xffffff,emissiveMap:t}); },
        glow:(op,col)=>glowM(n,col?{color:new THREE.Color(col),opacity:op}:{opacity:op})});
      add(new THREE.BoxGeometry(bw+.24,.32,bl+.24),glowM(n,{opacity:1}),0,1+hh+.06,0);
      const rt=add(new THREE.PlaneGeometry(bw-.1,bl-.1),L0(n,0x2e5a2e,.2),0,1+hh+.5,0); rt.rotation.x=-Math.PI/2;
      const cl=[]; [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(q=>{ const lp=spr(n.c,1.6); lp.position.set(q[0]*bw/2,1+hh+.5,q[1]*bl/2); b.add(lp); cl.push(lp); });
      n.anim.push(t=>{ cl.forEach((lp,j)=>{ lp.material.opacity=Math.sin(t*2+j*1.6)>-.2?1:.15; }); });
      n.half=[bw*.62,bl*.56]; n.top=1+hh+.5; n.frontZ=-bl/2; }
    else if(st==='k'){ add(new THREE.CylinderGeometry(w*.45,w*.5,3.2,10),win([2,1]),0,2.6,0); add(new THREE.SphereGeometry(w*.5,16,10,0,6.283,0,Math.PI/2),L0(n,n.c,.5),0,4.2,0);
      const sg2=add(new THREE.TorusGeometry(w*.7,.1,6,32),glowM(n),0,4.6,0); sg2.rotation.x=Math.PI/2; n.anim.push(t=>{ sg2.rotation.z=t*1.5; }); n.half=[w*.7,w*.7]; n.top=4.8; }
    else if(st==='kb'){ add(new THREE.BoxGeometry(w*1.7,4,w*1.3),L0(n,0x3a2a12,.15),0,3,0); const rf=add(new THREE.CylinderGeometry(w*.75,w*.75,w*1.75,3),L0(n,n.c,.3),0,5+w*.37,0); rf.rotation.z=Math.PI/2; rf.rotation.y=Math.PI/2;
      add(new THREE.PlaneGeometry(w*.7,2.4),glowM(n,{opacity:.6,side:THREE.DoubleSide}),0,2.2,w*.66);
      const wr=new THREE.Group(); wr.position.set(0,7.6,0); b.add(wr); add(new THREE.BoxGeometry(.5,3.4,.3),glowM(n),0,-.6,0,wr);
      const hd=add(new THREE.TorusGeometry(.8,.28,6,16,Math.PI*1.5),glowM(n),0,1.6,0,wr); hd.rotation.z=-Math.PI*.25;
      n.anim.push(t=>{ wr.rotation.y=t*.9; wr.rotation.z=Math.sin(t*1.3)*.25; }); n.half=[w*.9,w*.7]; n.top=6.5; }
    else if(st==='kt'){ const ha=add(new THREE.CylinderGeometry(w*.9,w*.9,w*1.8,24,1,false,0,Math.PI),L0(n,0x3a1838,.2,{side:THREE.DoubleSide}),0,1,0); ha.rotation.z=Math.PI/2; ha.rotation.y=Math.PI/2;
      add(new THREE.PlaneGeometry(w*1.1,w*.7),glowM(n,{opacity:.5,side:THREE.DoubleSide}),0,1+w*.35,w*.9+.05);
      const tg1=add(new THREE.TorusGeometry(1.3,.12,6,24),glowM(n),-w*.5,2.4,w*1.6), tg2=add(new THREE.TorusGeometry(1.3,.12,6,24),glowM(n),w*.5,2.4,w*2.4);
      const md=mkDrone(n.c,'#ff4d6d'); md.g.scale.setScalar(.45); b.add(md.g);
      n.anim.push((t,dt)=>{ md.g.position.set(Math.sin(t*1.2)*w*1.1,w*1.3+2+Math.sin(t*2)*.4,Math.cos(t*1.2)*w*1.1); md.g.rotation.y=t*1.2+Math.PI/2; md.props.forEach(p=>p.rotation.y+=dt*40);
        tg1.material.color.setHSL((t*.1)%1,.9,.62); tg2.material.color.setHSL((t*.1+.4)%1,.9,.62); }); n.half=[w*.95,w*.95]; n.top=1+w*.9; }
    else if(st==='kp'){ add(new THREE.BoxGeometry(w*1.2,5.4,w*.8),L0(n,0x123a22,.15),0,3.7,0); add(new THREE.BoxGeometry(w*1.3,.4,w*.9),L0(n,n.c,.4),0,6.6,0);
      add(new THREE.BoxGeometry(w*.7,3.4,.1),L0(n,0x0b1022,.1),0,3.8,w*.4+.02); const fil=add(new THREE.PlaneGeometry(w*.56,3),glowM(n,{opacity:.9}),0,2.3,w*.4+.09); fil.geometry.translate(0,1.5,0);
      const cab=add(new THREE.TorusGeometry(1.1,.12,6,16,Math.PI),L0(n,0x9aa3c0,.1),w*.6+1.1,1.6,0); cab.rotation.z=Math.PI;
      n.anim.push(t=>{ const pct=o.progress?o.progress():0; fil.scale.y=Math.max(.06,pct)*(.92+.08*Math.sin(t*3)); fil.material.opacity=.6+.35*(.5+.5*Math.sin(t*2.4)); }); n.half=[w*.7,w*.5]; n.top=6.8; }
    else if(st==='kc'){ add(new THREE.CylinderGeometry(w*.7,w*.8,8,8),win([4,2]),0,5,0); add(new THREE.CylinderGeometry(w*.85,w*.7,.6,8),L0(n,n.c,.45),0,9.3,0);
      const at=new THREE.Sprite(new THREE.SpriteMaterial({map:numTex('@','#7cf3ff'),transparent:true,depthWrite:false})); at.scale.setScalar(4.4); at.position.y=11.4; b.add(at);
      n.anim.push(t=>{ at.position.y=11.4+Math.sin(t*1.6)*.3; }); n.half=[w*.85,w*.85]; n.top=9.6; }
    else if(st===2){ const hg=add(new THREE.CylinderGeometry(w,w,w*2,24,1,false,0,Math.PI),L0(n,0x2a3358,.15,{side:THREE.DoubleSide}),0,1,0); hg.rotation.z=Math.PI/2; hg.rotation.y=Math.PI/2;
      const dr=add(new THREE.PlaneGeometry(w*1.4,w*.9),glowM(n,{opacity:.55,side:THREE.DoubleSide}),0,1+w*.45,w+.05);
      add(new THREE.BoxGeometry(.6,10,.6),L0(n,0xffd36e,.3),w*1.15,6,-w*.6); const boom=new THREE.Group(); boom.position.set(w*1.15,11,-w*.6); b.add(boom);
      add(new THREE.BoxGeometry(7,.5,.5),L0(n,0xffd36e,.3),-2.5,0,0,boom); add(new THREE.BoxGeometry(.08,3,.08),glowM(n,{color:0xffffff}),-5.5,-1.5,0,boom);
      const gear=add(new THREE.TorusGeometry(1.6,.45,6,12),L0(n,n.c,.6),-w*.9,w*1.2+1.5,w*.4); n.anim.push(t=>{ gear.rotation.z=t*1.2; boom.rotation.y=Math.sin(t*.4)*.6; dr.material.opacity=.4+.25*Math.sin(t*2); }); }
    else if(st===3){ [[-w*.6,12,0],[w*.6,10,0],[0,8,w*.7]].forEach((q,j)=>{ const hh=q[1]; add(new THREE.CylinderGeometry(w*.38,w*.38,hh,20),L0(n,0x1d2547,.12),q[0],1+hh/2,q[2]);
      add(new THREE.CylinderGeometry(w*.18,w*.18,.8,12),L0(n,0xd6d3ff,.3),q[0],1+hh+.4,q[2]);
      for(let k=0;k<4;k++){ const band=add(new THREE.CylinderGeometry(w*.39,w*.39,hh*.14,20,1,true),glowM(n,{side:THREE.DoubleSide}),q[0],1+hh*(.15+k*.22),q[2]);
        n.anim.push(t=>{ band.material.opacity=((t*1.4+j*.7)%4>k)?.9:.12; }); } }); }
    else if(st===5){ add(new THREE.CylinderGeometry(w*1.6,w*1.75,3.2,36,1,true),L0(n,0x222a52,.12,{side:THREE.DoubleSide}),0,2.6,0);
      const fl=add(new THREE.CircleGeometry(w*1.55,36),L0(n,0x0f3b2c,.05),0,1.05,0); fl.rotation.x=-Math.PI/2;
      const gs=[]; for(let g=0;g<3;g++){ const ga=add(new THREE.TorusGeometry(1.6,.18,6,24,Math.PI),glowM(n),Math.cos(g*2.1)*w*.9,1.1,Math.sin(g*2.1)*w*.9); ga.rotation.y=g*2.1; gs.push(ga); }
      n.anim.push(t=>{ gs.forEach((ga,j)=>{ ga.material.color.setHSL((t*.1+j*.33)%1,.9,.6); }); }); }
    if(n.half==null){ n.half=[w*1.35,w*1.35]; n.top=TOPH[st]; }
    n.body=b.children.slice(k0);
    if(!n.rb&&MODELI[st]) useModel(n,b,MODELI[st],TOPH[st]-1,w*(st==='k'?2.2:2.8),1,(hx,hz,top)=>{ n.half=[hx*.9,hz*.9]; n.top=top; n.onModel&&n.onModel(); });
    b.traverse(q=>{ if(q.isMesh){ q.castShadow=q.receiveShadow=true; } });
    return b; }

  /* антенна на крыше модуля: мачта стоит, крутится тарелка, мигает красный огонь */
  function antenna(n){ const a=new THREE.Group(), m=L0(n,0xb8c2e0,.35); n.bld.add(a); n.ant=a;
    const ms=new THREE.Mesh(new THREE.CylinderGeometry(.07,.12,2.6,6),m); ms.position.y=1.3; a.add(ms);
    [.7,1.4].forEach((y,j)=>{ const cb=new THREE.Mesh(new THREE.BoxGeometry(1.1-j*.4,.07,.07),m); cb.position.y=y; cb.rotation.y=j*.8; a.add(cb); });
    const ds=new THREE.Mesh(new THREE.CylinderGeometry(.5,.08,.25,12,1,true),L0(n,0xd6dcf0,.3,{side:THREE.DoubleSide})); ds.position.set(.35,1.05,0); ds.rotation.z=-.9; a.add(ds);
    const tip=spr('#ff4d6d',1.2); tip.position.set(-.45,1.45,0); a.add(tip);
    const seat=()=>{ a.position.set(0,n.top,n.rb?n.frontZ*.6:0); }; seat(); n.onModel=seat;
    n.anim.push(t=>{ ds.rotation.y=t*1.2; tip.material.opacity=Math.sin(t*3+n.p[0])>.2?1:.1; }); }

  mods.forEach((m,i)=>{ const a=i*1.02, r=RI*.62-i*1.6, st0=i<6?i+1:6;
    const n={id:m.id,kind:'mod',mod:m,i,st0,rb:OPEN_MODS.indexOf(i+1)>=0,c:MC[i%MC.length],p:[Math.sin(a)*r,0,CZ+Math.cos(a)*r],s:2};
    building(n); antenna(n); nodes.push(n); });
  [{id:'prog',c:'#4ade80',st0:'kp',a:-.4},{id:'code',c:'#7cf3ff',st0:'kc',a:-.66},{id:'shp',c:'#ff9f5a',st0:'k',a:-.9},{id:'bug',c:'#facc15',st0:'kb',a:.4},{id:'trn',c:'#ff7ce0',st0:'kt',a:.66}].forEach(t=>{
    const r=RI-8; t.kind='tab'; t.s=t.st0==='k'?1.2:1.5; t.p=[Math.sin(t.a)*r,0,CZ+Math.cos(t.a)*r]; building(t); nodes.push(t); });

  /* ---- платформа: верх с сеткой, светящийся край, скала снизу, двигатели, площадка H ---- */
  const deckTop=tex((x,w)=>{ const c=w/2; x.fillStyle='#0d1330'; x.fillRect(0,0,w,w);
    const g=x.createRadialGradient(c,c,0,c,c,c); g.addColorStop(0,'rgba(124,243,255,.10)'); g.addColorStop(.7,'rgba(167,139,250,.06)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,w,w);
    x.strokeStyle='rgba(124,243,255,.22)'; x.lineWidth=1.2; const st=w/36; for(let i=0;i<=w;i+=st){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,w); x.stroke(); x.beginPath(); x.moveTo(0,i); x.lineTo(w,i); x.stroke(); }
    x.strokeStyle='rgba(124,243,255,.08)'; x.lineWidth=.6; for(let i=0;i<=w;i+=st/4){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,w); x.stroke(); x.beginPath(); x.moveTo(0,i); x.lineTo(w,i); x.stroke(); }
    x.strokeStyle='rgba(255,124,224,.35)'; x.lineWidth=3; [.3,.62].forEach(k=>{ x.beginPath(); x.arc(c,c,c*k,0,6.283); x.stroke(); });
    for(let i=0;i<140;i++){ x.fillStyle='rgba(255,231,168,'+(.3+Math.random()*.6)+')'; x.fillRect(Math.random()*w,Math.random()*w,2,2); } },mob?1024:2048);
  const deckMat=new THREE.MeshLambertMaterial({map:deckTop,emissive:0xffffff,emissiveMap:deckTop,emissiveIntensity:.55});
  const deck=new THREE.Mesh(new THREE.CylinderGeometry(RI,RI-2,2.4,96),[new THREE.MeshLambertMaterial({color:0x1b2246,emissive:0x7c5cff,emissiveIntensity:.12}),deckMat,new THREE.MeshLambertMaterial({color:0x111633})]);
  deck.position.set(0,PY-1.2,CZ); deck.receiveShadow=true; G.add(deck);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(RI,.35,8,160),new THREE.MeshBasicMaterial({color:0x7cf3ff,transparent:true,opacity:.9})); rim.rotation.x=Math.PI/2; rim.position.set(0,PY,CZ); G.add(rim);
  const rock=new THREE.ConeGeometry(RI-2,52,40,8,true), pos=rock.attributes.position; for(let i=0;i<pos.count;i++){ const y=pos.getY(i); if(y<-25){ pos.setX(i,pos.getX(i)*.9); pos.setZ(i,pos.getZ(i)*.9); continue; } if(y<25){ const f=1-Math.random()*.22; pos.setX(i,pos.getX(i)*f); pos.setZ(i,pos.getZ(i)*f); pos.setY(i,y+(Math.random()-.5)*4); } }
  rock.computeVertexNormals(); const rk=new THREE.Mesh(rock,new THREE.MeshLambertMaterial({color:0x2a2148,emissive:0x3b1d6e,emissiveIntensity:.25,flatShading:true,side:THREE.DoubleSide})); rk.rotation.x=Math.PI; rk.position.set(0,PY-2.4-26,CZ); G.add(rk);
  const eng=[]; [[0,0],[24,10],[-22,14],[8,-26],[-14,-22]].forEach((q,j)=>{ const e=spr(j%2?'#ff7ce0':'#7cf3ff',j?14:30); e.position.set(q[0],PY-14-j*5,CZ+q[1]); G.add(e); eng.push(e); });
  const under=spr('#a78bfa',1,.5); under.scale.set(260,160,1); under.position.set(0,PY-70,CZ); G.add(under);
  const pad=new THREE.Mesh(new THREE.CircleGeometry(6,64),new THREE.MeshBasicMaterial({map:tex((x,w)=>{ const c=w/2; x.strokeStyle='#7cf3ff'; x.lineWidth=w*.04; x.beginPath(); x.arc(c,c,c*.86,0,6.283); x.stroke();
    x.lineWidth=w*.012; x.beginPath(); x.arc(c,c,c*.7,0,6.283); x.stroke(); x.font='400 '+(w*.5)+'px "Russo One", Rubik, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillStyle='#7cf3ff'; x.fillText('H',c,c+w*.03); },512),transparent:true}));
  pad.rotation.x=-Math.PI/2; pad.position.set(H.x,PY+.05,H.z); G.add(pad);
  const lamps=[], NL=mob?40:72; for(let li=0;li<NL;li++){ const la=li/NL*6.283, lp=spr(li%2?'#ff7ce0':'#7cf3ff',2.2); lp.position.set(Math.sin(la)*(RI+.2),PY+.9,CZ+Math.cos(la)*(RI+.2)); G.add(lp); lamps.push(lp); }
  const hring=new THREE.Mesh(new THREE.TorusGeometry(7.5,.12,6,64),new THREE.MeshBasicMaterial({color:0x7cf3ff,transparent:true,opacity:.7})); hring.rotation.x=Math.PI/2; hring.position.set(H.x,PY+2.2,H.z); G.add(hring);
  const spin=[], mm=new THREE.MeshLambertMaterial({color:0x8892b0,emissive:0x2a3358,emissiveIntensity:.4});
  const post=(x,z,r,h)=>solids.push({x,z,hx:r,hz:r,ry:0,y0:0,y1:h});
  [[-.25,RI-4],[.25,RI-4],[2.6,RI-6],[3.6,RI-6]].forEach((q,j)=>{ const a=q[0], x=Math.sin(a)*q[1], z=CZ+Math.cos(a)*q[1], g=new THREE.Group(); g.position.set(x,PY,z); G.add(g);
    if(j<2){ const p=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,4,6),mm); p.position.y=2; g.add(p); const hd=new THREE.Group(); hd.position.y=4.2; g.add(hd);
      const dish=new THREE.Mesh(new THREE.CylinderGeometry(1.3,.15,.5,16,1,true),new THREE.MeshLambertMaterial({color:0xd6dcf0,emissive:0x7cf3ff,emissiveIntensity:.25,side:THREE.DoubleSide})); dish.rotation.x=-1.1; hd.add(dish); spin.push({o:hd,v:j?1.3:-1}); post(x,z,.4,5); }
    else { const tw=new THREE.Mesh(new THREE.CylinderGeometry(.25,.5,9,8),mm); tw.position.y=4.5; g.add(tw); const bh=new THREE.Group(); bh.position.y=9.4; g.add(bh);
      const bm=new THREE.Mesh(new THREE.ConeGeometry(1.2,9,16,1,true),new THREE.MeshBasicMaterial({color:0xffd36e,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide})); bm.rotation.z=Math.PI/2; bm.position.x=4.5; bh.add(bm);
      const bl=spr('#ffd36e',3); bh.add(bl); spin.push({o:bh,v:2.2}); post(x,z,.6,10); } });
  /* FPV-дроны учеников кружат над городом (на карте они крупные, здесь - чуть больше нашего дрона) */
  const drones=[]; for(let d=0;d<(mob?4:10);d++){ const q=mkDrone(MC[d%MC.length],d%2?'#ff4d6d':'#4ade80'); q.g.scale.setScalar(.22); G.add(q.g);
    q.r=14+Math.random()*(RI-24); q.a=Math.random()*6.283; q.sp=(.05+Math.random()*.07)*(Math.random()<.5?1:-1); q.y=PY+6+Math.random()*14; q.ph=Math.random()*6; drones.push(q); }

  /* ---- дороги: широкая светящаяся от H к модулю 1 и дальше от здания к зданию, к сервисам тропинки ---- */
  const ROADT=tex((x,w,h)=>{ x.fillStyle='#141a2e'; x.fillRect(0,0,w,h); for(let i=0;i<300;i++){ x.fillStyle='rgba(255,255,255,'+Math.random()*.05+')'; x.fillRect(Math.random()*w,Math.random()*h,2,2); }
    x.fillStyle='#ffffff'; x.fillRect(0,0,4,h); x.fillRect(w-4,0,4,h); x.globalAlpha=.8; x.fillRect(w/2-3,0,6,h*.5); },64,128); ROADT.wrapT=THREE.RepeatWrapping;
  function road(cv,col,wd){ const N2=64, P=[], U=[], I2=[], len=cv.getLength(), a3=V(0,0,0), t3=V(0,0,0);
    for(let i=0;i<=N2;i++){ const u=i/N2; cv.getPoint(u,a3); cv.getTangent(u,t3); t3.y=0; t3.normalize(); const nx=-t3.z*wd, nz=t3.x*wd;
      P.push(a3.x+nx,PY+.06,a3.z+nz, a3.x-nx,PY+.06,a3.z-nz); U.push(0,u*len/6, 1,u*len/6); if(i<N2){ const k=i*2; I2.push(k,k+1,k+2, k+1,k+3,k+2); } }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2)); g.setIndex(I2); g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:ROADT,side:THREE.DoubleSide,color:new THREE.Color(col).lerp(new THREE.Color('#ffffff'),.4)})); G.add(m); return m; }
  const gp=n=>V(n.p[0],PY,n.p[2]), rc=[];
  let prev=null; const modN=nodes.filter(n=>n.kind==='mod');
  modN.forEach(n=>{ const b=gp(n), a=prev?gp(prev):H.clone(), mid=a.clone().lerp(b,.5), out=V(mid.x,0,mid.z-CZ);
    if(prev&&out.lengthSq()>.01) mid.addScaledVector(out.normalize(),6);
    if(!prev) a.addScaledVector(b.clone().sub(a).normalize(),7);
    const cv=new THREE.QuadraticBezierCurve3(a,mid,b); rc.push(cv); n.road=road(cv,n.c,1.6); n.rcv=cv; prev=n; });
  nodes.forEach(n=>{ if(n.kind!=='tab') return; const b=gp(n), a=H.clone(); a.addScaledVector(b.clone().sub(a).normalize(),7); const mid=a.clone().lerp(b,.5); mid.z-=4; road(new THREE.QuadraticBezierCurve3(a,mid,b),n.c,.55); });

  /* ---- энергетический кристалл в центре, огоньки зарядки бегут к модулям, роботы-доставщики на дорогах ---- */
  const cg=new THREE.Group(); cg.position.set(0,PY,CZ); G.add(cg);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(4.2,5,1.2,8),new THREE.MeshLambertMaterial({color:0x1b2246,emissive:0x7c5cff,emissiveIntensity:.25})); base.position.y=.6; base.castShadow=base.receiveShadow=true; cg.add(base);
  const cm=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x7cf3ff,emissiveIntensity:.9,transparent:true,opacity:.88,flatShading:true});
  const cr=new THREE.Mesh(new THREE.OctahedronGeometry(3,0),cm); cr.scale.set(1,2.1,1); cr.position.y=8; cg.add(cr);
  const c2=new THREE.Mesh(new THREE.OctahedronGeometry(1.4,0),cm); c2.position.y=8; cg.add(c2);
  const cgl=spr('#7cf3ff',26); cgl.position.y=8; cg.add(cgl);
  const rings=[0,1].map(j=>{ const rg=new THREE.Mesh(new THREE.TorusGeometry(5+j*1.6,.08,4,64),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.6})); rg.position.y=8; cg.add(rg); return rg; });
  solids.push({x:0,z:CZ,hx:4.6,hz:4.6,ry:0,y0:0,y1:1.2},{x:0,z:CZ,hx:2.4,hz:2.4,ry:0,y0:1.6,y1:14.6});
  const lines=[], hc3=new THREE.Color(); modN.forEach(n=>{ const a=V(0,PY+.1,CZ), b=V(n.p[0],PY+.1,n.p[2]), dir=b.clone().sub(a), dl=dir.length()-6; dir.normalize(); a.addScaledVector(dir,5);
    const ln=new THREE.Mesh(new THREE.PlaneGeometry(.45,dl),new THREE.MeshBasicMaterial({color:new THREE.Color(n.c),transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false})); ln.rotation.x=-Math.PI/2; ln.rotation.z=-Math.atan2(dir.x,-dir.z); ln.position.copy(a).addScaledVector(dir,dl/2); ln.position.y=PY+.08; G.add(ln);
    for(let k=0;k<3;k++){ const sp=spr(n.c,1.8); G.add(sp); lines.push({sp,a:a.clone(),d:dir.clone(),l:dl,t:k/3,n}); } });
  const NS=mob?30:70, sparks=[]; for(let k=0;k<NS;k++){ const sp=spr(k%2?'#7cf3ff':'#ff7ce0',.6); cg.add(sp); sparks.push({sp,a:Math.random()*6.283,r:2+Math.random()*7,y:Math.random()*20,v:1+Math.random()*2}); }
  const bots=[]; rc.forEach((cv,j)=>{ if(j===0) return; for(let k=0;k<(mob?1:2);k++){ const g=new THREE.Group(), col=MC[(j+k)%MC.length];
    const bd=new THREE.Mesh(new THREE.BoxGeometry(1.1,.7,1.5),new THREE.MeshLambertMaterial({color:0xd6dcf0,emissive:new THREE.Color(col),emissiveIntensity:.25})); bd.position.y=.75; bd.castShadow=true; g.add(bd);
    const bx=new THREE.Mesh(new THREE.BoxGeometry(.8,.5,.8),new THREE.MeshLambertMaterial({color:0x8a6a3a})); bx.position.set(0,1.35,-.15); bx.castShadow=true; g.add(bx);
    [[-.55,.45],[.55,.45],[-.55,-.45],[.55,-.45]].forEach(q=>{ const wh=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.2,10),new THREE.MeshLambertMaterial({color:0x1a1f33})); wh.rotation.z=Math.PI/2; wh.position.set(q[0],.3,q[1]); g.add(wh); });
    const lamp=spr('#ff9f5a',1.4); lamp.position.set(0,1.9,.4); g.add(lamp);
    G.add(g); bots.push({g,cv,t:Math.random(),dir:k?-1:1,sp:.02+Math.random()*.015,lamp,ph:Math.random()*6}); } });

  /* ---- окраины: зарядные площадки, ветряки, антенны-вышки, энергостолбы, дроны-патрульные у края ---- */
  const tick=[]; const dk=new THREE.MeshLambertMaterial({color:0x1b2246,emissive:0x7c5cff,emissiveIntensity:.2});
  const add=(g,geo,m,x,y,z)=>{ const q=new THREE.Mesh(geo,m); q.position.set(x||0,y||0,z||0); q.castShadow=true; g.add(q); return q; };
  function mini(col){ const g=new THREE.Group(), fm=new THREE.MeshLambertMaterial({color:0x1a1f33,emissive:new THREE.Color(col),emissiveIntensity:.5}), pm=new THREE.MeshBasicMaterial({color:0xcfe8ff,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false});
    add(g,new THREE.BoxGeometry(.8,.25,.8),fm); [Math.PI/4,-Math.PI/4].forEach(r=>{ add(g,new THREE.BoxGeometry(2.2,.08,.16),fm).rotation.y=r; });
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(q=>{ const p=add(g,new THREE.CircleGeometry(.45,12),pm,q[0]*.78,.2,q[1]*.78); p.rotation.x=-Math.PI/2; });
    const lt=spr(col,1.2); lt.position.y=-.2; g.add(lt); return {g,lt}; }
  const KINDS=['zar','vet','ant','pyl','zar','ant','vet','pyl'], nOut=mob?8:12;
  for(let i=0;i<nOut;i++){ let a=1.0+i*4.1/(nOut-1); if(Math.abs(a-2.6)<.16||Math.abs(a-3.6)<.16) a+=.2;
    const r=i%2?RI-5:RI-10, g=new THREE.Group(), kd=KINDS[i%KINDS.length], col=MC[i%MC.length], ph=i*1.7, x0=Math.sin(a)*r, z0=CZ+Math.cos(a)*r; g.position.set(x0,PY,z0); g.rotation.y=a; G.add(g);
    if(kd==='zar'){ add(g,new THREE.CylinderGeometry(2.6,2.8,.35,6),dk,0,.18,0); const lm=[]; for(let j=0;j<4;j++){ const q=spr('#9dff7c',1.2); q.position.set(Math.sin(j/4*6.283+.8)*2.3,.55,Math.cos(j/4*6.283+.8)*2.3); g.add(q); lm.push(q); }
      add(g,new THREE.BoxGeometry(.5,2.6,.5),mm,3.3,1.3,0); const fg=new THREE.BoxGeometry(.34,2.3,.34); fg.translate(0,1.15,0); const fl=add(g,fg,new THREE.MeshBasicMaterial({color:0x9dff7c}),3.3,.15,0);
      const d=mini(col); g.add(d.g); solids.push({x:x0+Math.cos(a)*3.3,z:z0-Math.sin(a)*3.3,hx:.35,hz:.35,ry:0,y0:0,y1:2.7});
      tick.push(t=>{ const u=((t+ph)%10)/10, ch=Math.min(1,u/.6), up=u>.6?Math.sin((u-.6)/.4*Math.PI):0;
        for(let j=0;j<4;j++) lm[j].material.opacity=u<.6?(j<=ch*4?1:.15):(Math.sin(t*8+j)>0?.6:.1);
        fl.scale.y=Math.max(.05,u<.6?ch:1-up*.3); d.g.position.set(Math.sin(up*3)*up*2.5,.6+up*8,Math.cos(up*3)*up*2.5-up*2.5); d.g.rotation.y=t*(up?1.5:0);
        d.lt.material.opacity=u<.6?(Math.sin(t*4)>0?1:.3):1; }); }
    else if(kd==='vet'){ add(g,new THREE.CylinderGeometry(.14,.32,8,6),mm,0,4,0); add(g,new THREE.BoxGeometry(.6,.6,1.3),mm,0,8.1,0); const ro=new THREE.Group(); ro.position.set(0,8.1,.75); g.add(ro);
      const bm=new THREE.MeshLambertMaterial({color:0xd6dcf0,emissive:0x7cf3ff,emissiveIntensity:.25}); for(let j=0;j<3;j++){ const bl=new THREE.Mesh(new THREE.BoxGeometry(.28,3.4,.06),bm); bl.geometry.translate(0,1.7,0); bl.rotation.z=j*2.094; ro.add(bl); }
      const hl=spr('#ff4d6d',1.2); hl.position.y=8.6; g.add(hl); post(x0,z0,.4,8.5);
      tick.push(t=>{ ro.rotation.z=-(t+ph)*1.6; hl.material.opacity=Math.sin(t*2.5+ph)>.4?1:.12; }); }
    else if(kd==='ant'){ add(g,new THREE.CylinderGeometry(.1,.25,10,5),mm,0,5,0); [3,5.5,7.8].forEach((y,j)=>{ add(g,new THREE.BoxGeometry(1.8-j*.45,.08,.08),mm,0,y,0).rotation.y=j*.9; });
      const dh=new THREE.Group(); dh.position.y=6.6; g.add(dh); const ds=new THREE.Mesh(new THREE.CylinderGeometry(.9,.12,.35,12,1,true),new THREE.MeshLambertMaterial({color:0xd6dcf0,emissive:new THREE.Color(col),emissiveIntensity:.35,side:THREE.DoubleSide})); ds.position.x=.5; ds.rotation.z=-1; dh.add(ds);
      const tp=spr('#ff4d6d',1.6); tp.position.y=10.2; g.add(tp); post(x0,z0,.5,10.2);
      tick.push(t=>{ dh.rotation.y=(t+ph)*.9; tp.material.opacity=Math.sin(t*3+ph)>.3?1:.1; }); }
    else { add(g,new THREE.CylinderGeometry(.35,.6,4,6),dk,0,2,0); const orb=spr(col,3.2); orb.position.y=5.3; g.add(orb);
      const rg=new THREE.Mesh(new THREE.TorusGeometry(1.3,.08,6,28),new THREE.MeshBasicMaterial({color:new THREE.Color(col)})); rg.position.y=5.3; g.add(rg); post(x0,z0,.6,6.6);
      tick.push(t=>{ rg.rotation.x=(t+ph)*1.3; rg.rotation.y=(t+ph)*.8; orb.material.color.setHSL(((t+ph)*.06)%1,.8,.7); orb.scale.setScalar(3+Math.sin(t*2+ph)*.5); }); } }
  for(let d=0;d<(mob?2:3);d++){ const q=mini(MC[(d+2)%MC.length]); q.props=[]; q.g.scale.setScalar(.6); G.add(q.g); q.patrol=1; q.r=RI+2+d*1.5; q.a=d*2.1; q.sp=(.08+d*.02)*(d%2?-1:1); q.y=PY+3.5+d*1.5; q.ph=d*2; drones.push(q); }

  /* ---- пол города: газоны с деревьями, соты, домики на мощёных площадках, солнечные панели (одна сетка на тип) ---- */
  (function(){ const R2=Math.random; const rnd=(s=>()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; })(7);
    const obs=[[0,CZ,10],[H.x,H.z,8]]; nodes.forEach(n=>{ obs.push([n.p[0],n.p[2],n.rb?11:n.kind==='mod'?8:5.5]); });
    const seg=[]; rc.forEach(cv=>{ const p=cv.getPoints(24); for(let i=0;i<p.length-1;i++) seg.push([p[i].x,p[i].z,p[i+1].x,p[i+1].z,2.6]); });
    nodes.forEach(n=>{ if(n.kind==='tab') seg.push([H.x,H.z,n.p[0],n.p[2],1.6]); if(n.kind==='mod') seg.push([0,CZ,n.p[0],n.p[2],1.2]); });
    const dSeg=(x,z,s)=>{ const dx=s[2]-s[0], dz=s[3]-s[1], l=dx*dx+dz*dz||1, u=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/l)); return Math.hypot(x-s[0]-u*dx,z-s[1]-u*dz); };
    const free=(x,z,r)=>{ if(Math.hypot(x,z-CZ)>RI-12-r) return false; for(const q of obs) if(Math.hypot(x-q[0],z-q[1])<q[2]+r) return false; for(const g of seg) if(dSeg(x,z,g)<g[4]+r) return false; return true; };
    const MIX=['lawn','lawn','block','plaza','block','solar'];
    const spots=[]; for(let t=0;t<1500&&spots.length<(mob?18:28);t++){ const r=9+rnd()*(RI-20), a=rnd()*6.283, x=Math.sin(a)*r, z=CZ+Math.cos(a)*r, rr=t<600?4+rnd()*3:2.4+rnd()*2;
      if(!free(x,z,rr)) continue; let ok=true; spots.forEach(s=>{ if(Math.hypot(s.x-x,s.z-z)<s.r+rr+1.5) ok=false; }); if(!ok) continue; spots.push({x,z,r:rr,k:MIX[spots.length%MIX.length]}); obs.push([x,z,rr+.5]); }
    const Q=()=>({m:[],c:[]}); const lawn=Q(), tile=Q(), tree=Q(), trunk=Q(), ball=Q(), house=Q(), roofQ=Q(), pave=Q(), sol=Q(), bol=Q();
    const ob=new THREE.Object3D(); const put=(q,x,y,z,sx,sy,sz,ry,col,rx)=>{ ob.position.set(x,y,z); ob.rotation.set(rx||0,ry||0,0); ob.scale.set(sx,sy,sz); ob.updateMatrix(); q.m.push(ob.matrix.clone()); q.c.push(new THREE.Color(col||'#ffffff').convertSRGBToLinear()); };
    const GR=['#2f7d3a','#3c9147','#2a6e45','#4aa156'], TR=['#3fae5a','#2f8f4e','#57c46b','#7fd35b'], TL=['#2b4a8f','#355aa8','#2a3f7a','#3d6bc4'], HC=['#7cf3ff','#ff7ce0','#ffd36e','#9dff7c','#a78bfa','#ff9f5a'];
    spots.forEach((s,i)=>{ const y=PY+.05;
      if(s.k==='lawn'){ put(lawn,s.x,y,s.z,s.r,1,s.r*(.75+rnd()*.25),rnd()*6,GR[i%4]); const nt=1+Math.floor(rnd()*3);
        for(let k=0;k<nt;k++){ const a=rnd()*6.283, d=rnd()*s.r*.55, tx=s.x+Math.sin(a)*d, tz=s.z+Math.cos(a)*d, h=1.6+rnd()*1.4;
          put(trunk,tx,y+.4,tz,1,1,1,0,'#6b4a2e'); if(rnd()<.5) put(tree,tx,y+.7+h/2,tz,h*.42,h,h*.42,rnd()*6,TR[k%4]); else put(ball,tx,y+.8+h*.4,tz,h*.42,h*.42,h*.42,rnd()*6,TR[(k+1)%4]);
          solids.push({x:tx,z:tz,hx:h*.3,hz:h*.3,ry:0,y0:0,y1:.7+h}); } }
      else if(s.k==='plaza'){ const st=.62; for(let gx=-s.r;gx<=s.r;gx+=st*1.5) for(let gz=-s.r;gz<=s.r;gz+=st*1.732){ const px=gx, pz=gz+((Math.round(gx/(st*1.5))%2)?st*.866:0); if(Math.hypot(px,pz)>s.r) continue;
          put(tile,s.x+px,y,s.z+pz,.98,1,.98,0,rnd()<.12?HC[i%6]:TL[Math.floor(rnd()*4)]); }
        put(bol,s.x,y+.3,s.z,.7,.5,.7,0,HC[i%6]); }
      else if(s.k==='block'){ put(pave,s.x,y,s.z,s.r*1.5,1,s.r*1.5,s.x*.1,'#2b3150'); const nh=2+Math.floor(rnd()*3), ry=s.x*.1;
        for(let k2=0;k2<nh;k2++){ const a2=ry+k2/nh*6.283+.4, d2=s.r*.38, hx=s.x+Math.cos(a2)*d2, hz=s.z+Math.sin(a2)*d2, hw=1.1+rnd()*.8, hh=1+rnd()*2.2, col=HC[(i+k2)%6], hd=hw*(.8+rnd()*.5);
          put(house,hx,y+hh/2,hz,hw,hh,hd,ry,'#ffffff'); solids.push({x:hx,z:hz,hx:hw/2,hz:hd/2,ry,y0:0,y1:hh+.6}); if(rnd()<.6) put(roofQ,hx,y+hh+.3,hz,hw*.8,.6,hw*.8,ry+Math.PI/4,col); else put(bol,hx,y+hh+.1,hz,hw*.9,.15,hw*.9,ry,col); } }
      else { for(let k3=0;k3<6;k3++){ const cx=(k3%3-1)*1.6, cz=(Math.floor(k3/3)-.5)*1.4, ry3=s.x*.1; put(sol,s.x+cx*Math.cos(ry3)+cz*Math.sin(ry3),y+.5,s.z-cx*Math.sin(ry3)+cz*Math.cos(ry3),1.4,.08,1.1,ry3,'#ffffff',-.5); } }
      let best=null, bd=1e9; seg.forEach(g=>{ if(g[4]<2) return; const dx=g[2]-g[0], dz=g[3]-g[1], l=dx*dx+dz*dz||1, u=Math.max(0,Math.min(1,((s.x-g[0])*dx+(s.z-g[1])*dz)/l)), qx=g[0]+u*dx, qz=g[1]+u*dz, d=Math.hypot(s.x-qx,s.z-qz); if(d<bd){ bd=d; best=[qx,qz]; } });
      if(best&&bd<16){ const ux=(best[0]-s.x)/bd, uz=(best[1]-s.z)/bd, ang=Math.atan2(ux,uz); for(let dd=s.r+.3;dd<bd-2;dd+=.9) put(pave,s.x+ux*dd,y,s.z+uz*dd,.55,1,.7,ang,'#c9d3ff'); } });
    const mk=(q,geo,mat,shadow)=>{ if(!q.m.length) return; const im=new THREE.InstancedMesh(geo,mat,q.m.length); q.m.forEach((m,i)=>{ im.setMatrixAt(i,m); im.setColorAt(i,q.c[i]); }); im.instanceMatrix.needsUpdate=true; if(im.instanceColor) im.instanceColor.needsUpdate=true; im.castShadow=!!shadow; im.receiveShadow=true; G.add(im); };
    const gt=tex((x,w)=>{ x.fillStyle='#bfbfbf'; x.fillRect(0,0,w,w); for(let i=0;i<900;i++){ x.fillStyle='rgba(255,255,255,'+(R2()*.5)+')'; x.fillRect(R2()*w,R2()*w,1,3); } },128);
    const disc=new THREE.CircleGeometry(1,24); disc.rotateX(-Math.PI/2); const dp=disc.attributes.position; for(let i=1;i<dp.count;i++){ const f=.85+R2()*.2; dp.setX(i,dp.getX(i)*f); dp.setZ(i,dp.getZ(i)*f); }
    mk(lawn,disc,new THREE.MeshLambertMaterial({map:gt,emissive:0x16401c,emissiveIntensity:.6}));
    const hx=new THREE.CylinderGeometry(.6,.6,.1,6); hx.rotateY(Math.PI/6); mk(tile,hx,new THREE.MeshLambertMaterial({emissive:0x2a3a8a,emissiveIntensity:.6}));
    mk(tree,new THREE.ConeGeometry(1,1,7),new THREE.MeshLambertMaterial({emissive:0x0f3a1a,emissiveIntensity:.5}),1); mk(ball,new THREE.IcosahedronGeometry(1,0),new THREE.MeshLambertMaterial({emissive:0x0f3a1a,emissiveIntensity:.5,flatShading:true}),1);
    mk(trunk,new THREE.CylinderGeometry(.1,.14,.8,5),new THREE.MeshLambertMaterial({emissive:0x2a1a0a,emissiveIntensity:.4}),1);
    const wt=winTex('#7cf3ff'); wt.repeat.set(1,.5); mk(house,new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({map:wt,emissive:0xffffff,emissiveMap:wt,emissiveIntensity:.8}),1);
    mk(roofQ,new THREE.ConeGeometry(.75,1,4),new THREE.MeshLambertMaterial({emissive:0x333355,emissiveIntensity:.5}),1);
    const pg=new THREE.PlaneGeometry(1,1); pg.rotateX(-Math.PI/2); mk(pave,pg,new THREE.MeshLambertMaterial({emissive:0x222a55,emissiveIntensity:.5,transparent:true,opacity:.9}));
    const stx=tex((x,w)=>{ x.fillStyle='#16244a'; x.fillRect(0,0,w,w); x.strokeStyle='#7cf3ff'; x.globalAlpha=.55; x.lineWidth=2; for(let i=0;i<=w;i+=w/4){ x.beginPath(); x.moveTo(i,0); x.lineTo(i,w); x.stroke(); x.beginPath(); x.moveTo(0,i); x.lineTo(w,i); x.stroke(); } },64);
    mk(sol,new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({map:stx,emissive:0xffffff,emissiveMap:stx,emissiveIntensity:.7}),1);
    mk(bol,new THREE.CylinderGeometry(.18,.22,1.2,8),new THREE.MeshBasicMaterial({}));
  })();

  /* ---- вход в модуль: ворота-портал перед зданием, лицом к центру города ---- */
  function door(n){ const g=new THREE.Group(); G.add(g); const W=3.4, Hh=2.8, c=new THREE.Color(n.c);
    const frameM=new THREE.MeshLambertMaterial({color:0x1b2246,emissive:c,emissiveIntensity:.25}), edgeM=new THREE.MeshBasicMaterial({color:c.clone()});
    const bar=(w,h,d,x,y)=>{ const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),frameM); q.position.set(x,y,0); q.castShadow=true; g.add(q); return q; };
    bar(.45,Hh+.5,.6,-W/2-.22,(Hh+.5)/2); bar(.45,Hh+.5,.6,W/2+.22,(Hh+.5)/2); bar(W+.9,.45,.6,0,Hh+.5+.22);
    const edge=(w,h,x,y)=>{ for(const zf of [.31,-.31]){ const q=new THREE.Mesh(new THREE.PlaneGeometry(w,h),edgeM); q.position.set(x,y,zf); if(zf<0) q.rotation.y=Math.PI; g.add(q); } };
    edge(.08,Hh,-W/2,Hh/2); edge(.08,Hh,W/2,Hh/2); edge(W,.08,0,Hh);
    /* поле портала: бегущие полосы цвета модуля, при закрытом модуле - красное с замком */
    const fc=document.createElement('canvas'); fc.width=256; fc.height=256; const fx=fc.getContext('2d'), ft=new THREE.CanvasTexture(fc); ft.encoding=THREE.sRGBEncoding;
    const field=new THREE.Mesh(new THREE.PlaneGeometry(W,Hh),new THREE.MeshBasicMaterial({map:ft,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending})); field.position.y=Hh/2; g.add(field);
    /* вывеска над воротами: номер и название модуля */
    const sc=document.createElement('canvas'); sc.width=1024; sc.height=256; const sx=sc.getContext('2d'), stx=new THREE.CanvasTexture(sc); stx.encoding=THREE.sRGBEncoding; stx.anisotropy=8;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(W+1.6,(W+1.6)/4),new THREE.MeshBasicMaterial({map:stx,transparent:true,side:THREE.DoubleSide})); sign.position.y=Hh+1.6; g.add(sign);
    const lamp=spr(n.c,4,.6); lamp.position.y=.2; g.add(lamp);
    const d={n,mid:n.id,g,W:W*SC,H:Hh*SC,pos:V(),nrm:V(),ry:0,state:'open',field,ft,fx,sign,sx,stx};
    d.draw=(t)=>{ const s=d.state, col=s==='lock'?'#ff3a4a':n.c; fx.clearRect(0,0,256,256);
      const gr=fx.createLinearGradient(0,0,0,256); gr.addColorStop(0,col+'10'); gr.addColorStop(.5,col+(s==='lock'?'50':'38')); gr.addColorStop(1,col+'10'); fx.fillStyle=gr; fx.fillRect(0,0,256,256);
      fx.fillStyle=col; for(let i=0;i<9;i++){ const y=((i*29+t*(s==='lock'?18:60))%256); fx.globalAlpha=.25+.2*Math.sin(i*1.7+t*3); fx.fillRect(0,y,256,3); } fx.globalAlpha=1;
      if(s==='lock'){ fx.strokeStyle='#ffd0d4'; fx.lineWidth=12; fx.beginPath(); fx.arc(128,108,30,Math.PI,0); fx.stroke(); fx.fillStyle='#ffd0d4'; fx.fillRect(86,108,84,64); }
      ft.needsUpdate=true; };
    d.paint=()=>{ const s=d.state, col=s==='lock'?'#ff6a7a':n.c; sx.clearRect(0,0,1024,256); sx.fillStyle='rgba(5,8,20,.88)'; sx.fillRect(0,0,1024,256);
      sx.strokeStyle=col; sx.lineWidth=8; sx.strokeRect(6,6,1012,244); sx.fillStyle=col; sx.fillRect(6,6,250,244);
      sx.fillStyle='#05081a'; sx.font='400 150px "Russo One", Rubik, sans-serif'; sx.textAlign='center'; sx.textBaseline='middle'; sx.fillText(String(n.mod.n),131,136);
      sx.textAlign='left'; sx.fillStyle=col; sx.font='400 40px "Russo One", Rubik, sans-serif'; sx.fillText('МОДУЛЬ '+n.mod.n+(s==='done'?' · ПРОЙДЕН ✓':s==='lock'?' · ЗАКРЫТ':' · ВХОД'),290,80);
      sx.fillStyle='#ffffff'; let fs=64; sx.font='400 '+fs+'px "Russo One", Rubik, sans-serif'; while(sx.measureText(n.mod.t).width>700&&fs>34){ fs-=2; sx.font='400 '+fs+'px "Russo One", Rubik, sans-serif'; }
      sx.fillText(n.mod.t,290,170); stx.needsUpdate=true; edgeM.color.set(col); };
    d.seat=()=>{ const hb=n.half, bp=V(n.p[0],0,n.p[2]), toC=V(-n.p[0],0,CZ-n.p[2]).normalize(); let off;
      if(n.rb){ off=-n.frontZ+1.4; } else off=Math.max(hb[0],hb[1])*.85+1.6;
      const p=bp.clone().addScaledVector(toC,off); g.position.copy(p); g.rotation.y=Math.atan2(toC.x,toC.z);
      d.pos.copy(p).multiplyScalar(SC); d.pos.y=Hh/2*SC; d.nrm.copy(toC); d.ry=g.rotation.y; };
    d.seat(); n.door=d; const prevOn=n.onModel; n.onModel=()=>{ prevOn&&prevOn(); d.seat(); refreshSolids(); };
    d.paint(); d.draw(0); doors.push(d); return d; }
  modN.forEach(door);

  /* номера-маяки над модулями: видно издалека, куда лететь */
  modN.forEach(n=>{ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:numTex(String(n.mod.n),n.c),transparent:true,depthWrite:false})); s.scale.setScalar(5); n.bld.add(s); n.beacon=s;
    const h=spr(n.c,9,.55); n.bld.add(h); n.bhalo=h; const seat=()=>{ const y=(n.top||10)+6.5; s.position.set(0,y,n.rb?n.frontZ*.6:0); h.position.copy(s.position); }; seat(); const prevOn=n.onModel; n.onModel=()=>{ prevOn&&prevOn(); seat(); }; });

  /* ---- небо: звёздная оболочка, млечный путь, далёкая туманность ---- */
  const sky=new THREE.Group(); G.add(sky);
  (function(){ const SH=mob?2500:5000, P=new Float32Array(SH*3), Cc=new Float32Array(SH*3);
    for(let i=0;i<SH;i++){ const th=Math.random()*6.283, ph=Math.acos(2*Math.random()-1), rr=420+Math.random()*80, br=.25+Math.pow(Math.random(),3)*.75; P[i*3]=rr*Math.sin(ph)*Math.cos(th); P[i*3+1]=rr*Math.cos(ph)*.85; P[i*3+2]=rr*Math.sin(ph)*Math.sin(th); Cc[i*3]=br; Cc[i*3+1]=br*.93; Cc[i*3+2]=br; }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(P,3)); g.setAttribute('color',new THREE.BufferAttribute(Cc,3));
    const dot=tex((x,s)=>{ const gr=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'#fff'); gr.addColorStop(.3,'rgba(255,255,255,.6)'); gr.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=gr; x.fillRect(0,0,s,s); },32);
    sky.add(new THREE.Points(g,new THREE.PointsMaterial({size:2.6,vertexColors:true,transparent:true,depthWrite:false,map:dot,blending:THREE.AdditiveBlending,fog:false,sizeAttenuation:true})));
    const milky=K2=>{ const w=mob?1024:2048, h=w/2; return tex(x=>{ x.translate(w/2,h/2); x.rotate(-.05);
      const g1=x.createLinearGradient(0,-h*.42,0,h*.42); g1.addColorStop(0,'rgba(0,0,0,0)'); g1.addColorStop(.5,'rgba('+K2.a+',.22)'); g1.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g1; x.fillRect(-w,-h*.42,w*2,h*.84);
      const g2=x.createLinearGradient(0,-h*.16,0,h*.16); g2.addColorStop(0,'rgba(0,0,0,0)'); g2.addColorStop(.5,'rgba('+K2.b+',.18)'); g2.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g2; x.fillRect(-w,-h*.16,w*2,h*.32);
      const nn=mob?14000:32000; for(let i=0;i<nn;i++){ const u=(Math.random()+Math.random()+Math.random()-1.5)/1.5, yy=u*h*.32, xx=(Math.random()-.5)*w*1.4;
        const br=Math.random(); x.fillStyle=br<.03?'rgba(255,255,255,.95)':br<.2?'rgba(220,225,255,.7)':br<.6?'rgba(190,180,255,.4)':'rgba(255,190,230,.25)'; const d=br<.03?1.8:1; x.fillRect(xx,yy,d,d); }
      for(let i=0;i<140;i++){ const yy2=(Math.random()-.5)*h*.07+Math.sin(i*.37)*h*.03, xx2=(Math.random()-.5)*w*1.3; x.fillStyle='rgba(0,0,8,.18)'; x.beginPath(); x.ellipse(xx2,yy2,w*.02+Math.random()*w*.03,h*.012+Math.random()*h*.012,0,0,6.283); x.fill(); }
    },w,h); };
    const band=(K2,ry,tilt,op)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(900,450),new THREE.MeshBasicMaterial({map:milky(K2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,opacity:op,side:THREE.DoubleSide}));
      m.position.set(Math.sin(ry)*-380,40,Math.cos(ry)*-380); m.lookAt(0,40,0); m.rotateZ(tilt); sky.add(m); };
    band({a:'150,140,255',b:'255,220,240'},0,.25,1); band({a:'255,90,200',b:'255,200,250'},2.4,-.35,.7); band({a:'120,170,255',b:'210,230,255'},4.3,.1,.6);
    const neb=(c,x,y,z,s)=>{ const q=spr(c,s,.35); q.material.fog=false; q.position.set(x,y,z); sky.add(q); };
    neb('#a78bfa',-300,-60,-200,420); neb('#ff7ce0',280,-90,120,360); neb('#7cf3ff',60,-140,320,380);
  })();
  sky.scale.setScalar(1/SC*2.6); // небо держим далеко, но в пределах дальней плоскости камеры

  /* ---- свет города ---- */
  G.add(new THREE.AmbientLight(0x8a7fb0,.55)); const hemi=new THREE.HemisphereLight(0x9fb8ff,0x2a1850,.35); G.add(hemi);

  /* перевод цветов: город рисовали без sRGB, у нас вывод в sRGB с тональной компрессией - переводим, чтобы цвета остались как на карте */
  const done=new Set();
  function linearize(root){ root.traverse(q=>{ const ms=q.material?(Array.isArray(q.material)?q.material:[q.material]):[]; ms.forEach(m=>{ if(done.has(m)) return; done.add(m);
    if(m.color&&!(q.isInstancedMesh)) m.color.convertSRGBToLinear(); if(m.emissive) m.emissive.convertSRGBToLinear(); }); }); }
  linearize(G);

  G.scale.setScalar(SC);

  /* ---- твёрдые тела в метрах: повёрнутые коробки {x,z,hx,hz,ry,y0,y1} ---- */
  const base0=solids.slice();
  function refreshSolids(){ out.solids.length=0; out.ver=(out.ver||0)+1;
    base0.forEach(s=>out.solids.push(Object.assign({},s,{x:s.x*SC,z:s.z*SC,hx:s.hx*SC,hz:s.hz*SC,y0:s.y0*SC,y1:s.y1*SC})));
    nodes.forEach(n=>{ const ry=n.rb?n.bld.rotation.y:0; out.solids.push({x:n.p[0]*SC,z:n.p[2]*SC,hx:n.half[0]*SC,hz:n.half[1]*SC,ry,y0:0,y1:(n.top||TOPH[n.st0])*SC,kind:n.kind});
      const w=n.s*2.1; out.solids.push({x:n.p[0]*SC,z:n.p[2]*SC,hx:w*1.2*SC,hz:w*1.2*SC,ry:0,y0:0,y1:1*SC}); });
    doors.forEach(d=>{ const c=Math.cos(d.ry), s=Math.sin(d.ry), W=d.W/SC;
      [[-W/2-.22],[W/2+.22]].forEach(([lx])=>out.solids.push({x:(d.g.position.x+lx*c)*SC,z:(d.g.position.z-lx*s)*SC,hx:.25*SC,hz:.32*SC,ry:d.ry,y0:0,y1:(d.H/SC+.5)*SC}));
      out.solids.push({x:d.g.position.x*SC,z:d.g.position.z*SC,hx:(W/2+.45)*SC,hz:.32*SC,ry:d.ry,y0:(d.H/SC+.5)*SC,y1:(d.H/SC+1)*SC});
      if(d.state==='lock') out.solids.push({x:d.g.position.x*SC,z:d.g.position.z*SC,hx:W/2*SC,hz:.15*SC,ry:d.ry,y0:0,y1:d.H,lock:d.mid}); }); }

  const GT3=V(), TT=V();
  const out={g:G,scale:SC,R:RI*SC,solids:[],doors,nodes,
    start:{pos:V(H.x*SC,0,H.z*SC),heading:0},
    refreshSolids,
    setState(st){ doors.forEach(d=>{ d.state=st[d.mid]||'lock'; d.paint(); }); modN.forEach(n=>{ const s=st[n.id]||'lock'; n.beacon.material.opacity=s==='lock'?.35:1; n.bhalo.material.opacity=s==='lock'?.15:.55; }); refreshSolids(); },
    /* маршрут навигатора: точки по главной дороге от H до двери модуля (в метрах, на высоте h) */
    route(mid,h){ const pts=[V(H.x,0,H.z)]; for(const n of modN){ const cv=n.rcv, ps=cv.getPoints(16); if(n.id===mid){ /* к двери, а не в центр здания */ const dp=n.door.g.position, last=ps.findIndex(p=>p.distanceTo(V(n.p[0],0,n.p[2]))<p.distanceTo(dp)*0.9+(n.half?Math.max(n.half[0],n.half[1]):6));
          ps.slice(0,last>2?last:ps.length-4).forEach(p=>pts.push(p)); const dpos=n.door.g.position.clone(); pts.push(dpos.clone().addScaledVector(n.door.nrm,6)); pts.push(dpos); break; } ps.forEach(p=>pts.push(p)); }
      return pts.map(p=>V(p.x*SC,h,p.z*SC)); },
    tick(t,dt){
      nodes.forEach(n=>{ if(n.anim) for(const f of n.anim) f(t,dt); });
      modN.forEach(n=>{ if(n.beacon){ const k=1+.08*Math.sin(t*2.4+n.i); n.beacon.scale.setScalar(5*k); n.bhalo.scale.setScalar(9*k); } });
      doors.forEach(d=>{ if(d.state!=='done'||(t*10|0)%3===0) d.draw(t); });
      drones.forEach(q=>{ q.a+=dt*q.sp; const y=q.y+Math.sin(t*.7+q.ph)*2.5; q.g.position.set(Math.sin(q.a)*q.r,y,CZ+Math.cos(q.a)*q.r); q.g.rotation.set(-.22,q.a+(q.sp>0?Math.PI/2:-Math.PI/2),q.sp>0?-.18:.18,'YXZ');
        q.lt.material.opacity=(Math.sin(t*6+q.ph)>.3)?1:.15; if(q.props) for(const p of q.props) p.rotation.y+=dt*40; });
      eng.forEach((e,j)=>{ e.material.opacity=.7+.3*Math.sin(t*3+j); });
      rim.material.color.setHSL((.5+.08*Math.sin(t*.4))%1,.9,.7).convertSRGBToLinear();
      const nl=lamps.length, hd2=(t*14)%nl; for(let lk=0;lk<nl;lk++){ const dd=(hd2-lk+nl)%nl; lamps[lk].material.opacity=dd<6?1-dd/7:.18; }
      hc3.setHSL((t*.05)%1,.9,.6); cm.emissive.copy(hc3).convertSRGBToLinear(); cgl.material.color.copy(hc3); cr.rotation.y=t*.4; c2.rotation.y=-t*.9; c2.rotation.x=t*.5; cr.position.y=8+Math.sin(t*1.2)*.5;
      rings.forEach((rg,j)=>{ rg.rotation.x=t*(.5+j*.3); rg.rotation.y=t*(.3-j*.2); });
      lines.forEach(q=>{ q.t=(q.t+dt*.25)%1; q.sp.position.copy(q.a).addScaledVector(q.d,q.l*q.t); q.sp.material.opacity=Math.min(1,(1-q.t)*4); });
      sparks.forEach(q=>{ q.y+=dt*q.v; if(q.y>22){ q.y=0; q.a=Math.random()*6.283; } q.a+=dt*.4; q.sp.position.set(Math.cos(q.a)*q.r,q.y,Math.sin(q.a)*q.r); q.sp.material.opacity=Math.max(0,1-q.y/22); });
      for(const f of tick) f(t,dt);
      bots.forEach(q=>{ q.t+=dt*q.sp*q.dir; if(q.t>1){ q.t=1; q.dir=-1; } if(q.t<0){ q.t=0; q.dir=1; } q.cv.getPoint(q.t,q.g.position); q.cv.getTangent(q.t,TT); if(q.dir<0) TT.negate();
        q.g.position.addScaledVector(GT3.set(-TT.z,0,TT.x).normalize(),.9); q.g.rotation.y=Math.atan2(TT.x,TT.z); q.lamp.material.opacity=Math.sin(t*7+q.ph)>0?1:.2; });
      hring.rotation.z=t*.6; hring.scale.setScalar(1+.06*Math.sin(t*2));
      spin.forEach(q=>{ q.o.rotation.y=t*q.v; });
    }};
  refreshSolids();
  return out; }

return {build,SC};
})();
