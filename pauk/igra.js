// «Паук» — a small spider in Alexandr's real children's room (photos 19.11.2026).
// Room is built in real metres. The spider walks on any surface (floor, walls, ceiling) using ray probes
// against box colliders, shoots web to zip to a point or to pull things, and a cat hunts it.
'use strict';
const $=id=>document.getElementById(id);
const VERSION='0.1 от 19.11.2026'; // bump on every release so testers can tell builds apart
document.querySelectorAll('.ver').forEach(e=>e.textContent='Версия '+VERSION);
document.title='Паук · '+VERSION.split(' ')[0];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
const UP=V3(0,1,0);
const rnd=(a,b)=>a+Math.random()*(b-a);

/* ---------- Saved settings ---------- */
const KEY='pauk.v1';
const COARSE=matchMedia('(pointer:coarse)').matches;
const DEF={cat:'2',skin:'black',sens:1,camd:0.3,q:'1',snd:'1',best:null,secret:false};
let S=Object.assign({},DEF);
try{Object.assign(S,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

/* ---------- Renderer, scene, camera ---------- */
const Q=+S.q;
const renderer=new THREE.WebGLRenderer({antialias:Q>0,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,[1,1.5,2][Q]));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=Q>0;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.physicallyCorrectLights=false;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xdfe6ee);
const camera=new THREE.PerspectiveCamera(72,1,0.004,30);
const ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

/* ---------- Textures ---------- */
const loader=new THREE.TextureLoader();
let loading=0;
function doneLoad(){if(--loading<=0)$('load').hidden=true;}
function photo(name,rep){loading++;const t=loader.load('tex/'+name+'.jpg?v=0.1',doneLoad,undefined,doneLoad);
  t.encoding=THREE.sRGBEncoding;t.anisotropy=ANISO;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}return t;}
function canvasTex(w,h,draw,rep){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=ANISO;
  if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}return t;}
function noiseFill(g,w,h,base,n,a){g.fillStyle=base;g.fillRect(0,0,w,h);
  for(let i=0;i<n;i++){const v=Math.random()<.5?0:255;g.fillStyle=`rgba(${v},${v},${v},${Math.random()*a})`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);}}
// Oak laminate: long planks with grain, seen from 3 cm above, so it needs detail
const texFloor=canvasTex(1024,1024,(g,w,h)=>{const rows=6,ph=h/rows;
  const pal=['#b07a45','#a8723f','#b9834d','#9f6a39','#b47c47','#a4703f'];
  for(let r=0;r<rows;r++){let x=-Math.random()*w*0.6;
    while(x<w){const len=w*rnd(0.45,0.8);g.fillStyle=pal[(Math.random()*pal.length)|0];g.fillRect(x,r*ph,len,ph);
      for(let i=0;i<46;i++){const y=r*ph+Math.random()*ph;g.strokeStyle=`rgba(70,40,15,${rnd(.05,.18)})`;g.lineWidth=rnd(.6,2.2);
        g.beginPath();g.moveTo(x,y);let yy=y;for(let xx=x;xx<x+len;xx+=40){yy+=rnd(-1.5,1.5);g.lineTo(xx,yy);}g.stroke();}
      for(let k=0;k<2;k++){if(Math.random()<.5){const kx=x+Math.random()*len,ky=r*ph+Math.random()*ph;g.fillStyle='rgba(80,45,15,.25)';g.beginPath();g.ellipse(kx,ky,rnd(6,14),rnd(3,6),0,0,7);g.fill();}}
      g.fillStyle='rgba(40,22,8,.55)';g.fillRect(x,r*ph,2,ph);x+=len;}
    g.fillStyle='rgba(40,22,8,.6)';g.fillRect(0,r*ph,w,2);}
  const d=g.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const n=(Math.random()-.5)*10;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;}g.putImageData(d,0,0);
},[3.5,3.5]);
const texPaint=canvasTex(512,512,(g,w,h)=>noiseFill(g,w,h,'#a2abb5',9000,.06),[6,3]);
const texCeil=canvasTex(256,256,(g,w,h)=>noiseFill(g,w,h,'#f3f3f1',3000,.04),[8,8]);
const texClouds=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#4aa3d8';g.fillRect(0,0,w,h);g.fillStyle='rgba(255,255,255,.92)';
  for(let i=0;i<14;i++){const x=Math.random()*w,y=Math.random()*h;for(let k=0;k<5;k++){g.beginPath();g.ellipse(x+k*14,y+rnd(-5,5),rnd(14,26),rnd(9,14),0,0,7);g.fill();}}},[2,2]);
// the city play rug (safe zone): roads, grass, pond, houses
const texRug=canvasTex(1024,768,(g,w,h)=>{g.fillStyle='#7cc243';g.fillRect(0,0,w,h);
  g.fillStyle='#5aa8d8';g.beginPath();g.ellipse(250,520,150,90,0.2,0,7);g.fill();
  g.strokeStyle='#8c9aa3';g.lineWidth=70;g.lineJoin='round';g.beginPath();g.moveTo(60,60);g.lineTo(960,60);g.lineTo(960,700);g.lineTo(60,700);g.closePath();g.moveTo(520,60);g.lineTo(520,700);g.moveTo(60,380);g.lineTo(520,380);g.stroke();
  g.strokeStyle='#fff';g.lineWidth=5;g.setLineDash([22,18]);g.beginPath();g.moveTo(60,60);g.lineTo(960,60);g.lineTo(960,700);g.lineTo(60,700);g.closePath();g.moveTo(520,60);g.lineTo(520,700);g.moveTo(60,380);g.lineTo(520,380);g.stroke();g.setLineDash([]);
  const house=(x,y,c,r)=>{g.fillStyle=c;g.fillRect(x,y,90,70);g.fillStyle=r;g.beginPath();g.moveTo(x-8,y);g.lineTo(x+45,y-40);g.lineTo(x+98,y);g.fill();g.fillStyle='#fff';g.fillRect(x+15,y+20,18,18);g.fillRect(x+55,y+20,18,18);};
  house(150,170,'#f2c14e','#d64545');house(640,160,'#e8e8f0','#c43c6a');house(720,470,'#f29e4c','#9b3d3d');house(330,520,'#9fd2f2','#3d6fd6');
  g.strokeStyle='#2f6b2a';g.lineWidth=8;g.beginPath();g.arc(760,330,60,0,7);g.stroke();for(let a=0;a<12;a++){g.beginPath();g.moveTo(760,330);g.lineTo(760+60*Math.cos(a*.52),330+60*Math.sin(a*.52));g.stroke();}
  g.fillStyle='#3f8f3a';for(let i=0;i<40;i++){const x=Math.random()*w,y=Math.random()*h;g.beginPath();g.moveTo(x,y-14);g.lineTo(x-7,y+6);g.lineTo(x+7,y+6);g.fill();}
  const cars=['#e33','#36f','#fd3','#fff'];for(let i=0;i<14;i++){g.fillStyle=cars[i%4];const t=Math.random();g.fillRect(60+t*880,52,18,12);}
  g.strokeStyle='#e8f3d8';g.lineWidth=10;g.strokeRect(5,5,w-10,h-10);
});
const texBlanket=canvasTex(256,256,(g,w,h)=>{noiseFill(g,w,h,'#6f747a',5000,.12);g.strokeStyle='rgba(0,0,0,.12)';for(let i=0;i<10;i++){g.beginPath();g.moveTo(0,Math.random()*h);g.bezierCurveTo(80,Math.random()*h,170,Math.random()*h,w,Math.random()*h);g.stroke();}},[2,2]);
const texSheet=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#bfe2f2';g.fillRect(0,0,w,h);for(let i=0;i<26;i++){const x=Math.random()*w,y=Math.random()*h;g.fillStyle=['#fff','#f7c9d9','#1d2b44'][i%3];g.beginPath();g.arc(x,y,rnd(4,9),0,7);g.fill();}},[2,2]);
const texPink=canvasTex(128,128,(g,w,h)=>noiseFill(g,w,h,'#e6d4dc',2000,.08),[2,2]);
const texChairFab=canvasTex(128,128,(g,w,h)=>{g.fillStyle='#3a3530';g.fillRect(0,0,w,h);for(let i=0;i<600;i++){g.fillStyle=['#6a5d4c','#2a2622','#8a7a62'][i%3];g.fillRect(Math.random()*w,Math.random()*h,3,2);}},[2,2]);
const texKnit=canvasTex(128,128,(g,w,h)=>noiseFill(g,w,h,'#5d6166',4000,.2),[3,3]);
const texBag=canvasTex(256,256,(g,w,h)=>{noiseFill(g,w,h,'#1e2a44',6000,.12);g.strokeStyle='rgba(255,255,255,.05)';for(let i=0;i<w;i+=4){g.beginPath();g.moveTo(i,0);g.lineTo(i,h);g.stroke();}},[2,2]);
const texCard=canvasTex(256,256,(g,w,h)=>{noiseFill(g,w,h,'#c49a64',3000,.1);g.strokeStyle='#3a6';g.lineWidth=6;g.strokeRect(30,30,196,196);g.fillStyle='#2b8';g.fillRect(70,70,60,60);g.fillStyle='#e94';g.fillRect(140,120,50,70);});
const texDoor=canvasTex(256,512,(g,w,h)=>{g.fillStyle='#8a5a30';g.fillRect(0,0,w,h);for(let i=0;i<80;i++){g.strokeStyle=`rgba(50,25,8,${rnd(.08,.25)})`;g.beginPath();const x=Math.random()*w;g.moveTo(x,0);g.bezierCurveTo(x+rnd(-20,20),h/3,x+rnd(-20,20),h*2/3,x+rnd(-10,10),h);g.stroke();}
  g.strokeStyle='rgba(30,15,5,.55)';g.lineWidth=5;g.strokeRect(40,40,176,190);g.strokeRect(40,280,176,190);});
const texIcon=canvasTex(64,80,(g,w,h)=>{g.fillStyle='#b8902e';g.fillRect(0,0,w,h);g.fillStyle='#6b3b1c';g.fillRect(8,8,w-16,h-16);g.fillStyle='#d9b45a';g.beginPath();g.arc(32,30,12,0,7);g.fill();});
const texOutside=photo('okno');
const texGlow=canvasTex(128,128,(g)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,240,200,.5)');r.addColorStop(1,'rgba(255,240,200,0)');g.fillStyle=r;g.fillRect(0,0,128,128);});
const texBlob=canvasTex(128,128,(g)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(0,0,0,.75)');r.addColorStop(.6,'rgba(0,0,0,.3)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);});
const texSecret=canvasTex(512,128,(g,w,h)=>{g.fillStyle='#1a0f2e';g.fillRect(0,0,w,h);g.font='bold 54px "Russo One",Arial';g.textAlign='center';g.textBaseline='middle';
  g.shadowColor='#ffcc33';g.shadowBlur=18;g.fillStyle='#ffe27a';g.fillText('СЕКРЕТНАЯ ЗОНА',w/2,h/2+2);});
// grey tabby fur: stripes run around the body so a sphere's UV gives rings
const texTabby=canvasTex(512,256,(g,w,h)=>{g.fillStyle='#8b8580';g.fillRect(0,0,w,h);
  for(let i=0;i<2600;i++){g.fillStyle=`rgba(${Math.random()<.5?40:200},${Math.random()<.5?36:190},30,${rnd(.05,.15)})`;g.fillRect(Math.random()*w,Math.random()*h,1,rnd(3,8));}
  g.fillStyle='rgba(40,34,30,.75)';for(let x=10;x<w;x+=rnd(26,40)){g.beginPath();g.moveTo(x,0);for(let y=0;y<=h;y+=16)g.lineTo(x+Math.sin(y*.05+x)*8+rnd(-3,3),y);for(let y=h;y>=0;y-=16)g.lineTo(x+10+Math.sin(y*.05+x)*8,y);g.fill();}
  const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.75,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(235,230,220,.85)');g.fillStyle=gr;g.fillRect(0,0,w,h);});

/* ---------- Materials ---------- */
const std=(o)=>new THREE.MeshStandardMaterial(Object.assign({roughness:.8,metalness:0},o));
const M={
  floor:std({map:texFloor,roughness:.55}),
  paint:std({map:texPaint,roughness:.95}),
  ceil:std({map:texCeil,roughness:.95}),
  graffiti:std({map:photo('graffiti',[2.2,1.6]),roughness:.9}),
  clouds:std({map:texClouds,roughness:.9}),
  white:std({color:0xf2f2ef,roughness:.6}),
  whiteG:std({color:0xe9ece8,roughness:.45}),
  frame:std({color:0xf7f7f5,roughness:.4}),
  glass:new THREE.MeshPhysicalMaterial({color:0xdff0ff,roughness:.05,metalness:0,transparent:true,opacity:.18,depthWrite:false}),
  outside:new THREE.MeshBasicMaterial({map:texOutside,color:0xa8bccf}),
  blind:std({color:0x8a6a7c,roughness:.95}),
  green:std({color:0xc4e3a4,roughness:.55}),
  blueD:std({color:0x6aa6d8,roughness:.5}),
  blueSlide:std({color:0x5e8fc8,roughness:.45}),
  rug:std({map:texRug,roughness:.95}),
  blanket:std({map:texBlanket,roughness:1}),
  sheet:std({map:texSheet,roughness:1}),
  pink:std({map:texPink,roughness:1}),
  mattress:std({color:0xf0ede2,roughness:.95}),
  chairFab:std({map:texChairFab,roughness:1}),
  chairWood:std({color:0x2c2018,roughness:.6}),
  knit:std({map:texKnit,roughness:1}),
  metal:std({color:0xaab0b5,roughness:.35,metalness:.8}),
  black:std({color:0x18191b,roughness:.5}),
  bag:std({map:texBag,roughness:.85}),
  bagIn:std({color:0xe07a2a,roughness:.9}),
  zip:std({color:0xd9b44a,roughness:.3,metalness:.7}),
  door:std({map:texDoor,roughness:.6}),
  card:std({map:texCard,roughness:.9}),
  posters:std({map:photo('postery'),roughness:.7}),
  omsk:std({map:photo('omsk'),roughness:.7}),
  mir:std({map:photo('mir'),roughness:.7}),
  risunok:std({map:photo('risunok'),roughness:.8}),
  icon:std({map:texIcon,roughness:.5,metalness:.3}),
  beige:std({color:0xe8d9b8,roughness:.8}),
  radiator:std({color:0xf4f4f2,roughness:.35}),
  plasticBox:new THREE.MeshPhysicalMaterial({color:0xeef3f6,roughness:.2,transparent:true,opacity:.45}),
  lamp:new THREE.MeshBasicMaterial({color:0xfff6e0}),
  book:std({color:0xe8e0cc,roughness:.8}),
  secret:new THREE.MeshBasicMaterial({map:texSecret}),
  crystal:std({color:0x9b7bff,emissive:0x6a3cff,emissiveIntensity:1.2,roughness:.1,metalness:.2,transparent:true,opacity:.9}),
  gold:std({color:0xffcc44,emissive:0x7a5200,emissiveIntensity:.6,roughness:.25,metalness:1}),
  red:std({color:0xd8342e,roughness:.4}),
  laptop:std({color:0x222428,roughness:.4,metalness:.4}),
};

/* ---------- Colliders: oriented boxes in real metres ----------
   Every surface the spider can walk on is a box. Rays against them drive walking, zipping, aiming and the camera. */
const SOL=[];
function solidC(cx,cy,cz,hx,hy,hz,q,tag){const b={c:[cx,cy,cz],h:[hx,hy,hz],q:q||null,qi:q?q.clone().invert():null,tag:tag||''};SOL.push(b);return b;}
function solid(x0,x1,y0,y1,z0,z1,tag){return solidC((x0+x1)/2,(y0+y1)/2,(z0+z1)/2,Math.abs(x1-x0)/2,Math.abs(y1-y0)/2,Math.abs(z1-z0)/2,null,tag);}
const _ro=new THREE.Vector3(),_rd=new THREE.Vector3(),_rn=new THREE.Vector3();
const HIT={t:0,p:new THREE.Vector3(),n:new THREE.Vector3(),b:null};
function rayLocal(o,d,c,h,maxT){ // slab test in the box frame; returns t of entry and the entry face (axis, sign) or -1
  let tmin=-1e9,tmax=1e9,ax=-1,sg=0;
  for(let a=0;a<3;a++){const oa=o[a]-c[a],da=d[a];
    if(Math.abs(da)<1e-9){if(oa<-h[a]||oa>h[a])return -1;continue;}
    let t1=(-h[a]-oa)/da,t2=(h[a]-oa)/da;if(t1>t2){const s=t1;t1=t2;t2=s;}
    if(t1>tmin){tmin=t1;ax=a;sg=da>0?-1:1;}
    if(t2<tmax)tmax=t2;if(tmin>tmax)return -1;}
  if(tmin<1e-6||tmin>maxT||ax<0)return -1;
  rayLocal.ax=ax;rayLocal.sg=sg;return tmin;}
const _o=[0,0,0],_d=[0,0,0],_c0=[0,0,0];
function castRay(o,d,maxT,skip){ // o,d Vector3 (d normalized). Fills HIT; returns true on hit
  let best=maxT,found=null,bax=0,bsg=0;
  for(let i=0;i<SOL.length;i++){const b=SOL[i];if(b.off||(skip&&skip(b)))continue;
    let t;
    if(b.q){_ro.set(o.x-b.c[0],o.y-b.c[1],o.z-b.c[2]).applyQuaternion(b.qi);_rd.copy(d).applyQuaternion(b.qi);
      _o[0]=_ro.x;_o[1]=_ro.y;_o[2]=_ro.z;_d[0]=_rd.x;_d[1]=_rd.y;_d[2]=_rd.z;t=rayLocal(_o,_d,_c0,b.h,best);}
    else{_o[0]=o.x;_o[1]=o.y;_o[2]=o.z;_d[0]=d.x;_d[1]=d.y;_d[2]=d.z;t=rayLocal(_o,_d,b.c,b.h,best);}
    if(t>=0&&t<best){best=t;found=b;bax=rayLocal.ax;bsg=rayLocal.sg;}}
  if(!found)return false;
  HIT.t=best;HIT.b=found;HIT.p.copy(d).multiplyScalar(best).add(o);
  HIT.n.set(0,0,0);HIT.n.setComponent(bax,bsg);if(found.q)HIT.n.applyQuaternion(found.q);
  return true;}
// sphere vs boxes: pushes p out, returns the sum of contact normals (length 0 when free)
const _sn=new THREE.Vector3(),_sl=new THREE.Vector3(),_cp=new THREE.Vector3();
function sphereResolve(p,r){_sn.set(0,0,0);
  for(const b of SOL){if(b.off)continue;
    if(b.q)_sl.set(p.x-b.c[0],p.y-b.c[1],p.z-b.c[2]).applyQuaternion(b.qi);else _sl.set(p.x-b.c[0],p.y-b.c[1],p.z-b.c[2]);
    _cp.set(clamp(_sl.x,-b.h[0],b.h[0]),clamp(_sl.y,-b.h[1],b.h[1]),clamp(_sl.z,-b.h[2],b.h[2]));
    const dx=_sl.x-_cp.x,dy=_sl.y-_cp.y,dz=_sl.z-_cp.z,d2=dx*dx+dy*dy+dz*dz;
    if(d2>=r*r)continue;
    let n;
    if(d2>1e-12){const d=Math.sqrt(d2);n=V3(dx/d,dy/d,dz/d);const push=r-d;if(b.q)n.applyQuaternion(b.q);p.addScaledVector(n,push);}
    else{ // centre inside: push out along the smallest overlap axis
      const ox=b.h[0]-Math.abs(_sl.x),oy=b.h[1]-Math.abs(_sl.y),oz=b.h[2]-Math.abs(_sl.z);
      if(oy<=ox&&oy<=oz)n=V3(0,Math.sign(_sl.y)||1,0);else if(ox<=oz)n=V3(Math.sign(_sl.x)||1,0,0);else n=V3(0,0,Math.sign(_sl.z)||1);
      const push=Math.min(ox,oy,oz)+r;if(b.q)n.applyQuaternion(b.q);p.addScaledVector(n,push);}
    _sn.add(n);}
  return _sn;}

/* ---------- Mesh helpers ---------- */
const world=new THREE.Group();scene.add(world);
function add(geo,mat,x,y,z,o){o=o||{};const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);
  if(o.ry)m.rotation.y=o.ry;if(o.rx)m.rotation.x=o.rx;if(o.rz)m.rotation.z=o.rz;
  m.castShadow=!o.noCast&&Q>0;m.receiveShadow=Q>0;(o.par||world).add(m);return m;}
function box(x0,x1,y0,y1,z0,z1,mat,o){o=o||{};const m=add(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),mat,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,o);
  if(o.sol!==false)solid(x0,x1,y0,y1,z0,z1,o.tag);return m;}
function deco(x0,x1,y0,y1,z0,z1,mat,o){o=Object.assign({sol:false},o||{});return box(x0,x1,y0,y1,z0,z1,mat,o);}
function plane(w,h,mat,x,y,z,ry,rx){return add(new THREE.PlaneGeometry(w,h),mat,x,y,z,{ry,rx,noCast:true});}
function wallGeo(w,h,holes){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(w,0);s.lineTo(w,h);s.lineTo(0,h);s.closePath();
  for(const o of holes||[]){const p=new THREE.Path();p.moveTo(o[0],o[1]);p.lineTo(o[0],o[3]);p.lineTo(o[2],o[3]);p.lineTo(o[2],o[1]);p.closePath();s.holes.push(p);}
  const g=new THREE.ShapeGeometry(s);const uv=g.attributes.uv,pos=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)/w,pos.getY(i)/h);return g;}

/* ---------- The room (measured by Alexandr 19.11.2026) ----------
   x: west (door, world map) 0 → east (wardrobe, Omsk map) 4.7 — the window wall is 4.7 m.
   z: north (two windows, desk) 0 → south (graffiti wallpaper, beds) 4.1 — 3.3 m from the wardrobe to that wall + the 0.8 m wardrobe.
   y: floor 0 → ceiling 2.6 (not measured, typical). */
const W=4.7, D=4.1, H=2.6;
const RUG={x0:1.9,x1:3.5,z0:1.85,z1:3.15};          // «сэйф зона»: the city rug with the construction set
const PACK={x0:0.66,x1:0.98,y0:0.48,y1:0.90,z0:0.39,z1:0.56,t:0.025}; // backpack on the chair by the left window (secret zone inside)
const FOOT=[];   // floor rectangles the cat cannot walk through
const PLAT=[];   // tops the cat can jump onto: {x0,x1,z0,z1,y,name}
const ITEM_DEFS=[];
function foot(x0,x1,z0,z1){FOOT.push({x0,x1,z0,z1});}
function plat(name,x0,x1,z0,z1,y){PLAT.push({name,x0,x1,z0,z1,y});}

// Duplo-like bricks: one instanced mesh for bodies and one for studs, each brick is also a collider
const BR=[];const BRC=[0xe53935,0x1e88e5,0xfdd835,0x43a047,0xfb8c00,0xf48fb1,0x8e24aa,0xffffff,0x26c6da];
function brick(x,y,z,lx,lz,col){const hgt=0.038;BR.push({x,y,z,lx,lz,col:col!=null?col:BRC[(Math.random()*BRC.length)|0],h:hgt});
  solid(x-lx/2,x+lx/2,y,y+hgt,z-lz/2,z+lz/2,'brick');return y+hgt;}
function buildBricks(){
  const n=BR.length;if(!n)return;
  const bg=new THREE.BoxGeometry(1,1,1);bg.translate(0,0.5,0);
  const bm=new THREE.InstancedMesh(bg,std({roughness:.35}),n);
  let studs=0;BR.forEach(b=>studs+=Math.round(b.lx/0.032)*Math.round(b.lz/0.032));
  const sg=new THREE.CylinderGeometry(0.0095,0.0095,0.009,14);sg.translate(0,0.0045,0);
  const sm=new THREE.InstancedMesh(sg,std({roughness:.35}),studs);
  const m=new THREE.Matrix4(),c=new THREE.Color();let si=0;
  BR.forEach((b,i)=>{m.makeScale(b.lx-0.0015,b.h-0.001,b.lz-0.0015);m.setPosition(b.x,b.y,b.z);bm.setMatrixAt(i,m);c.setHex(b.col);bm.setColorAt(i,c);
    const nx=Math.round(b.lx/0.032),nz=Math.round(b.lz/0.032);
    for(let a=0;a<nx;a++)for(let k=0;k<nz;k++){m.makeTranslation(b.x-b.lx/2+0.016+a*0.032,b.y+b.h,b.z-b.lz/2+0.016+k*0.032);sm.setMatrixAt(si,m);sm.setColorAt(si,c);si++;}});
  bm.castShadow=sm.castShadow=Q>0;bm.receiveShadow=sm.receiveShadow=Q>0;world.add(bm);world.add(sm);}

function buildRoom(){
  /* shell: walls are real boxes so window recesses get depth and the sun comes through the holes */
  const T=0.3;
  add(new THREE.PlaneGeometry(W,D),M.floor,W/2,0,D/2,{rx:-Math.PI/2,noCast:true});solid(-T,W+T,-0.3,0,-T,D+T,'floor');
  add(new THREE.PlaneGeometry(W,D),M.ceil,W/2,H,D/2,{rx:Math.PI/2,noCast:true});solid(-T,W+T,H,H+0.3,-T,D+T,'ceil');
  const WL={x0:0.3,x1:1.6},WR={x0:3.0,x1:4.05},SILL=0.86,TOP=2.3;
  // north wall with two window holes
  box(-T,WL.x0,0,H,-T,0,M.paint);box(WL.x1,WR.x0,0,H,-T,0,M.paint);box(WR.x1,W+T,0,H,-T,0,M.paint);
  for(const w of [WL,WR]){box(w.x0,w.x1,0,SILL-0.03,-T,0,M.paint);box(w.x0,w.x1,TOP,H,-T,0,M.paint);
    // sill, glass, frame, outside view, roller blind
    box(w.x0-0.08,w.x1+0.08,SILL-0.03,SILL,-0.26,0.08,M.whiteG);
    box(w.x0,w.x1,SILL,TOP,-0.25,-0.24,M.glass,{noCast:true}).castShadow=false;
    const mx=(w.x0+w.x1)/2;
    deco(w.x0,w.x1,SILL,SILL+0.06,-0.24,-0.2,M.frame);deco(w.x0,w.x1,TOP-0.06,TOP,-0.24,-0.2,M.frame);
    deco(w.x0,w.x0+0.06,SILL,TOP,-0.24,-0.2,M.frame);deco(w.x1-0.06,w.x1,SILL,TOP,-0.24,-0.2,M.frame);deco(mx-0.035,mx+0.035,SILL,TOP,-0.24,-0.2,M.frame);
    plane(w.x1-w.x0+1.2,(TOP-SILL)+1.0,M.outside,mx,(SILL+TOP)/2,-0.7);
    deco(w.x0,w.x1,TOP-0.05,TOP,-0.06,-0.01,M.frame);
    const blind=deco(w.x0+0.04,w.x1-0.04,1.95,TOP-0.05,-0.035,-0.03,M.blind);blind.castShadow=Q>0;}
  // east wall, south wall (graffiti), west wall with the door
  box(W,W+T,0,H,-T,D+T,M.paint);
  box(-T,W+T,0,H,D,D+T,M.paint);plane(W,H,M.graffiti,W/2,H/2,D-0.001,Math.PI);
  const DZ0=3.1,DZ1=3.9,DH=2.05;
  box(-T,0,0,H,-T,DZ0,M.paint);box(-T,0,0,H,DZ1,D+T,M.paint);box(-T,0,DH,H,DZ0,DZ1,M.paint);
  box(-0.06,-0.02,0,DH,DZ0,DZ1,M.door);                                                     // closed wooden door
  deco(-0.02,0.01,0,DH+0.06,DZ0-0.07,DZ0,M.door);deco(-0.02,0.01,0,DH+0.06,DZ1,DZ1+0.07,M.door);deco(-0.02,0.01,DH,DH+0.07,DZ0,DZ1,M.door);
  add(new THREE.SphereGeometry(0.025,12,8),M.metal,0.0,1.0,DZ0+0.12);
  plane(1.0,H,M.clouds,0.002,H/2,0.5,Math.PI/2);                                             // cloud wallpaper strip
  plane(1.6,0.92,M.mir,0.004,1.42,1.95,Math.PI/2);                                           // world map
  // skirting boards
  deco(0,W,0,0.06,0,0.012,M.beige);deco(0,W,0,0.06,D-0.012,D,M.beige);deco(W-0.012,W,0,0.06,0,D,M.beige);deco(0,0.012,0,0.06,0,DZ0-0.07,M.beige);
  // ceiling lamp
  const lampM=add(new THREE.CylinderGeometry(0.22,0.24,0.06,32),M.lamp,2.35,H-0.03,2.05,{noCast:true});lampM.castShadow=false;solid(2.13,2.57,H-0.06,H,1.83,2.27,'lamp');

  /* desk between the windows: green drawer unit, white top, hutch with the lamp, posters above */
  box(1.65,2.95,0.72,0.75,0.02,0.62,M.white);
  box(1.67,2.07,0,0.72,0.05,0.60,M.green);foot(1.62,2.12,0,0.65);
  for(let i=0;i<5;i++){deco(1.69,2.05,0.03+i*0.14,0.15+i*0.14,0.60,0.605,M.green);deco(1.83,1.91,0.13+i*0.14,0.14+i*0.14,0.605,0.615,M.black);}
  for(const z of [0.07,0.57]){const l=add(new THREE.CylinderGeometry(0.018,0.016,0.72,10),M.white,2.9,0.36,z);solid(2.88,2.92,0,0.72,z-0.02,z+0.02);}
  box(1.75,2.85,0.75,1.25,0.02,0.04,M.white);box(1.75,1.77,0.75,1.25,0.02,0.30,M.white);box(2.83,2.85,0.75,1.25,0.02,0.30,M.white);
  box(1.75,2.85,1.23,1.25,0.02,0.30,M.white);box(2.35,2.37,0.75,1.23,0.02,0.30,M.white);box(2.37,2.83,0.99,1.01,0.02,0.30,M.white);
  const led=deco(1.8,2.32,1.215,1.225,0.2,0.26,M.lamp);led.castShadow=false;
  plane(0.72,0.7,M.posters,2.3,1.68,0.002);
  // things on the desk
  box(1.85,2.15,0.75,0.77,0.32,0.55,M.book);box(1.87,2.12,0.77,0.785,0.34,0.52,std({color:0x7fc8a0}));
  box(2.4,2.62,0.75,0.765,0.36,0.58,std({color:0xe8b4c8}));
  box(2.62,2.68,0.75,0.86,0.05,0.12,M.white);
  box(2.47,2.6,0.75,0.8,0.08,0.16,std({color:0xdddddd}));
  plat('desk',1.7,2.92,0.33,0.6,0.75);

  /* kneeling chair at the desk */
  box(2.42,2.78,0.5,0.56,0.84,1.1,M.knit);box(2.42,2.78,0.3,0.36,1.16,1.34,M.knit);box(2.45,2.75,0.7,0.95,0.76,0.81,M.knit);
  deco(2.58,2.62,0.0,0.5,0.95,0.99,M.metal);deco(2.44,2.48,0,0.04,0.7,1.4,M.metal);deco(2.72,2.76,0,0.04,0.7,1.4,M.metal);deco(2.58,2.62,0.56,0.76,0.8,0.84,M.metal);
  plat('kneel',2.44,2.76,0.86,1.08,0.56);

  /* dark chair by the left window with the backpack on it */
  box(0.6,1.05,0.44,0.48,0.35,0.8,M.chairFab);box(0.6,1.05,0.48,0.95,0.33,0.37,M.chairWood);
  for(const [x,z] of [[0.62,0.37],[1.03,0.37],[0.62,0.78],[1.03,0.78]])box(x-0.015,x+0.015,0,0.44,z-0.015,z+0.015,M.chairWood);
  plat('chair',0.62,1.03,0.6,0.78,0.48);
  // radiator under the left window
  box(0.55,1.35,0.12,0.7,0.02,0.09,M.radiator);for(let i=0;i<9;i++)deco(0.56+i*0.088,0.62+i*0.088,0.12,0.7,0.09,0.11,M.radiator);
  plat('sillL',0.24,1.64,-0.22,0.06,0.86);

  /* right window: beige heater, toy box, Lego robot and astronaut lamp on the sill */
  box(3.2,3.85,0.25,0.6,0.0,0.03,M.beige);
  box(3.3,3.85,0,0.2,0.18,0.5,M.plasticBox);foot(3.26,3.89,0.14,0.54);plat('toys',3.3,3.85,0.18,0.5,0.2);
  for(let i=0;i<10;i++)deco(3.33+Math.random()*0.45,3.38+Math.random()*0.45,0.0,0.06+Math.random()*0.1,0.2+Math.random()*0.25,0.25+Math.random()*0.25,std({color:BRC[i%BRC.length],roughness:.4}));
  let ry=SILL;ry=brick(3.87,ry,-0.07,0.064,0.064,0x1e88e5);ry=brick(3.87,ry,-0.07,0.064,0.064,0xe53935);ry=brick(3.87,ry,-0.07,0.064,0.064,0x43a047);ry=brick(3.87,ry,-0.07,0.064,0.064,0x1e88e5);ry=brick(3.87,ry,-0.07,0.064,0.064,0x1e88e5);brick(3.87,ry,-0.07,0.096,0.032,0xfdd835);
  brick(3.82,SILL+0.076,-0.03,0.032,0.032,0x1e88e5);brick(3.92,SILL+0.076,-0.03,0.032,0.032,0x1e88e5);
  add(new THREE.SphereGeometry(0.04,16,12),M.white,3.18,SILL+0.16,-0.08);add(new THREE.CylinderGeometry(0.03,0.04,0.1,12),M.white,3.18,SILL+0.08,-0.08);solid(3.14,3.22,SILL,SILL+0.2,-0.12,-0.04);
  add(new THREE.SphereGeometry(0.028,16,12),M.black,3.18,SILL+0.165,-0.045);
  box(3.35,3.65,SILL,SILL+0.03,-0.2,-0.02,std({color:0xc84070}));                         // tablet box
  plat('sillR',2.94,3.75,-0.22,0.06,0.86);

  /* wardrobe in the north-east corner, white box on top */
  box(4.15,4.7,0,2.0,0.05,0.85,M.white);foot(4.1,4.7,0,0.9);
  deco(4.145,4.15,0.4,1.98,0.448,0.452,M.black);deco(4.145,4.15,0.39,0.4,0.06,0.84,M.black);deco(4.145,4.15,0.2,0.205,0.06,0.84,M.black);
  box(4.25,4.65,2.0,2.15,0.15,0.75,M.white);
  /* Omsk region map and the small icon on the east wall above the big bed */
  plane(0.62,0.86,M.omsk,W-0.003,1.55,3.0,-Math.PI/2);
  plane(0.09,0.12,M.icon,W-0.003,2.12,2.95,-Math.PI/2);
  deco(W-0.01,W,0.95,1.03,1.62,1.7,M.white);

  /* big bed along the east wall, head at the graffiti wall: raised frame, space under it */
  box(3.75,4.7,0.18,0.38,2.0,4.1,M.whiteG);
  for(const [x,z] of [[3.78,2.03],[4.67,2.03],[3.78,4.0],[4.67,4.0]])box(x-0.03,x+0.03,0,0.18,z-0.03,z+0.03,M.whiteG);
  box(3.77,4.68,0.38,0.5,2.02,4.03,M.sheet);
  deco(3.76,4.69,0.5,0.53,2.02,3.3,M.blanket);
  box(3.85,4.6,0.5,0.6,3.6,3.98,std({color:0xf1f0ec,roughness:1}));
  box(3.75,4.7,0,0.85,4.03,4.1,M.whiteG);
  foot(3.7,4.7,1.95,4.1);plat('bedA',3.8,4.65,2.05,3.55,0.53);

  /* children's bed with blue drawers along the graffiti wall, slide at its west end */
  box(2.15,3.7,0,0.32,3.25,4.1,M.white);foot(2.1,3.75,3.2,4.1);
  for(const x0 of [2.25,2.95])deco(x0,x0+0.65,0.04,0.28,3.245,3.25,M.blueD);
  box(2.18,3.67,0.32,0.44,3.28,4.04,M.mattress);deco(2.4,3.4,0.44,0.47,3.32,4.0,M.pink);
  box(2.15,2.18,0.32,0.82,3.25,4.1,M.white);box(3.67,3.7,0.32,0.78,3.25,4.1,M.white);box(2.18,3.67,0.32,0.72,4.04,4.1,M.white);
  box(3.1,3.67,0.44,0.62,3.25,3.28,M.white);
  plane(0.7,0.55,M.risunok,2.95,1.45,D-0.003,Math.PI);
  plat('bedK',2.22,3.62,3.32,4.0,0.44);
  // slide: an inclined board between blue side walls
  const ang=Math.atan2(0.55,0.95),len=Math.hypot(0.95,0.55),qS=new THREE.Quaternion().setFromAxisAngle(V3(0,0,1),ang);
  const sl=add(new THREE.BoxGeometry(len,0.03,0.42),M.white,1.675,0.275,3.575);sl.quaternion.copy(qS);solidC(1.675,0.275,3.575,len/2,0.015,0.21,qS,'slide');
  for(const z of [3.35,3.8]){const sw=add(new THREE.BoxGeometry(len,0.16,0.025),M.blueSlide,1.675,0.33,z);sw.quaternion.copy(qS);solidC(1.675,0.33,z,len/2,0.08,0.0125,qS,'slide');}
  box(2.1,2.15,0,0.56,3.34,3.81,M.blueSlide);foot(1.15,2.15,3.3,3.85);

  /* rug = safe zone, with a Duplo castle on it */
  box(RUG.x0,RUG.x1,0,0.006,RUG.z0,RUG.z1,M.rug,{noCast:true});
  const cx=2.3,cz=2.6;
  for(let lv=0;lv<5;lv++){const y=0.006+lv*0.038,off=lv%2?0.032:0;
    for(let i=0;i<4;i++){brick(cx-0.16+off+i*0.064+0.032,y,cz-0.16,0.064,0.032);brick(cx-0.16+off+i*0.064+0.032,y,cz+0.16,0.064,0.032);}
    for(let i=0;i<3;i++){brick(cx-0.16,y,cz-0.112+off+i*0.064+0.032-0.016,0.032,0.064);brick(cx+0.16,y,cz-0.112+off+i*0.064+0.032-0.016,0.032,0.064);}}
  brick(cx,0.006,cz,0.064,0.064);brick(cx,0.044,cz,0.064,0.064);brick(cx,0.082,cz,0.032,0.032,0xfdd835);
  for(let i=0;i<9;i++){const x=rnd(2.0,2.9),z=rnd(2.0,3.05);if(Math.hypot(x-cx,z-cz)<0.26)continue;brick(x,0.006,z,Math.random()<.5?0.064:0.032,0.032);}
  // cardboard toy house by the west wall
  box(0.05,0.33,0,0.26,1.0,1.26,M.card);foot(0,0.38,0.95,1.3);
}

/* ---------- Backpack (secret zone inside) ----------
   Hollow box: thick fabric walls, a big unzipped gap in the top. Inside: a lamp, crystals, a golden fly and a sign. */
const SECRET={light:null,group:new THREE.Group(),found:false};
function buildBackpack(){
  const P=PACK,t=P.t;
  const ox0=0.72,ox1=0.92,oz0=0.43,oz1=0.52;                  // opening in the top
  box(P.x0,P.x1,P.y0,P.y0+t,P.z0,P.z1,M.bag);                 // bottom
  box(P.x0,P.x1,P.y0,P.y1,P.z0,P.z0+t,M.bag);                 // back (window side)
  box(P.x0,P.x1,P.y0,P.y1,P.z1-t,P.z1,M.bag);                 // front
  box(P.x0,P.x0+t,P.y0,P.y1,P.z0,P.z1,M.bag);box(P.x1-t,P.x1,P.y0,P.y1,P.z0,P.z1,M.bag);
  box(P.x0,ox0,P.y1-t,P.y1,P.z0,P.z1,M.bag);box(ox1,P.x1,P.y1-t,P.y1,P.z0,P.z1,M.bag);
  box(ox0,ox1,P.y1-t,P.y1,P.z0,oz0,M.bag);box(ox0,ox1,P.y1-t,P.y1,oz1,P.z1,M.bag);
  // orange lining on the inner faces so the inside reads as a room
  const lin=(x0,x1,y0,y1,z0,z1)=>deco(x0,x1,y0,y1,z0,z1,M.bagIn,{noCast:true});
  const i=0.002;
  lin(P.x0+t,P.x1-t,P.y0+t,P.y0+t+i,P.z0+t,P.z1-t);
  lin(P.x0+t,P.x1-t,P.y0+t,P.y1-t,P.z0+t,P.z0+t+i);lin(P.x0+t,P.x1-t,P.y0+t,P.y1-t,P.z1-t-i,P.z1-t);
  lin(P.x0+t,P.x0+t+i,P.y0+t,P.y1-t,P.z0+t,P.z1-t);lin(P.x1-t-i,P.x1-t,P.y0+t,P.y1-t,P.z0+t,P.z1-t);
  // zipper around the opening, front pocket, straps, handle
  deco(ox0-0.006,ox1+0.006,P.y1,P.y1+0.004,oz0-0.006,oz0,M.zip);deco(ox0-0.006,ox1+0.006,P.y1,P.y1+0.004,oz1,oz1+0.006,M.zip);
  deco(ox1+0.006,ox1+0.03,P.y1,P.y1+0.006,oz1-0.004,oz1+0.01,M.zip);
  box(P.x0+0.04,P.x1-0.04,P.y0+0.04,P.y0+0.22,P.z1,P.z1+0.045,M.bag);deco(P.x0+0.05,P.x1-0.05,P.y0+0.22,P.y0+0.225,P.z1,P.z1+0.046,M.zip);
  for(const x of [P.x0+0.07,P.x1-0.07])box(x-0.022,x+0.022,P.y0+0.04,P.y1-0.03,P.z0-0.014,P.z0,M.black);
  const hd=add(new THREE.TorusGeometry(0.035,0.007,6,16,Math.PI),M.black,(P.x0+P.x1)/2,P.y1,P.z0+0.02);
  // inside: the secret den
  const g=SECRET.group;world.add(g);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(0.2,0.05),M.secret);sign.position.set((P.x0+P.x1)/2,P.y1-0.09,P.z0+t+0.004);g.add(sign);
  for(let k=0;k<5;k++){const c=new THREE.Mesh(new THREE.OctahedronGeometry(0.012+Math.random()*0.01),M.crystal);c.position.set(rnd(P.x0+0.05,P.x1-0.05),P.y0+t+0.012,rnd(P.z0+0.05,P.z1-0.05));c.scale.y=1.8;g.add(c);}
  const cnd=new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.05,12),M.red);cnd.rotation.z=Math.PI/2;cnd.position.set(P.x0+0.07,P.y0+t+0.012,P.z1-0.05);g.add(cnd);
  const nb=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.012,0.08),std({color:0x5aa0e0}));nb.position.set(P.x1-0.09,P.y0+t+0.006,P.z0+0.07);g.add(nb);solid(P.x1-0.15,P.x1-0.03,P.y0+t,P.y0+t+0.012,P.z0+0.03,P.z0+0.11);
  if(Q>0){SECRET.light=new THREE.PointLight(0xffc070,0,0.5,1.5);SECRET.light.position.set((P.x0+P.x1)/2,P.y0+0.2,(P.z0+P.z1)/2);g.add(SECRET.light);}
  // faint glow at the gap: a hint for a careful look
  const hint=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:0xffd27a,transparent:true,opacity:.35,depthWrite:false}));hint.scale.set(0.12,0.05,1);hint.position.set((ox0+ox1)/2,P.y1+0.01,(oz0+oz1)/2);world.add(hint);SECRET.hint=hint;
}
function inPack(p){const P=PACK;return p.x>P.x0+0.01&&p.x<P.x1-0.01&&p.z>P.z0+0.01&&p.z<P.z1-0.01&&p.y>P.y0&&p.y<P.y1-0.005;}
function onRug(p){return p.x>RUG.x0&&p.x<RUG.x1&&p.z>RUG.z0&&p.z<RUG.z1&&p.y<0.3;}

/* ---------- Lights: daylight through the two windows + ceiling lamp + desk LED ---------- */
const hemi=new THREE.HemisphereLight(0xe8eef8,0x8a6a48,0.62);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1dc,1.25);sun.position.set(1.6,3.4,-3.2);sun.target.position.set(2.6,0,2.4);scene.add(sun);scene.add(sun.target);
if(Q>0){sun.castShadow=true;const s=Q>1?2048:1024;sun.shadow.mapSize.set(s,s);const c=sun.shadow.camera;c.left=-3.6;c.right=3.6;c.top=3.6;c.bottom=-3.6;c.near=0.5;c.far=10;sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.004;}
const lampL=new THREE.PointLight(0xfff0d8,0.55,6,1.6);lampL.position.set(2.35,H-0.12,2.05);scene.add(lampL);
const fill=new THREE.DirectionalLight(0xdfe8ff,0.25);fill.position.set(3,2,5);scene.add(fill);
if(Q>0){const ledL=new THREE.PointLight(0xfff4e0,0.5,1.3,2);ledL.position.set(2.05,1.15,0.25);scene.add(ledL);}

/* dust in the sun: sells the tiny scale */
let dust=null;
function buildDust(){const n=Q>0?900:300;const g=new THREE.BufferGeometry();const a=new Float32Array(n*3);
  for(let i=0;i<n;i++){a[i*3]=rnd(0.2,4.4);a[i*3+1]=rnd(0.05,2.4);a[i*3+2]=rnd(0.1,3.8);}
  g.setAttribute('position',new THREE.BufferAttribute(a,3));
  dust=new THREE.Points(g,new THREE.PointsMaterial({color:0xfff6e0,size:0.0025,transparent:true,opacity:.55,depthWrite:false}));scene.add(dust);}

/* ---------- Spider model: body, 8 eyes, 8 legs with 2-bone IK and a tetrapod gait ---------- */
const spider=new THREE.Group();spider.scale.setScalar(1.25);scene.add(spider);
const SKIN={black:{body:0x1c1b20,mark:0xff8a1f},red:{body:0x9e1c18,mark:0x111111},gold:{body:0xffc840,mark:0x8a4a00}};
const spMat=std({color:0x1c1b20,roughness:.45,metalness:.05});
const spMark=std({color:0xff8a1f,roughness:.5});
const spLeg=std({color:0x2a2830,roughness:.5});
const LEGS=[];
const L1=0.022,L2=0.026;
(function buildSpider(){
  const ab=new THREE.Mesh(new THREE.SphereGeometry(0.0145,24,16),spMat);ab.scale.set(1,0.82,1.3);ab.position.set(0,0.016,-0.017);spider.add(ab);
  for(let i=0;i<3;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(0.0032,10,8),spMark);s.position.set(0,0.0275-i*0.0012,-0.008-i*0.008);s.scale.set(1.6,0.4,1);spider.add(s);}
  const th=new THREE.Mesh(new THREE.SphereGeometry(0.0095,20,14),spMat);th.scale.set(1,0.75,1.1);th.position.set(0,0.013,0.006);spider.add(th);
  const eyeM=std({color:0x050505,roughness:.05,metalness:.6});
  const eyes=[[0.0032,0.0175,0.0155,0.0026],[-0.0032,0.0175,0.0155,0.0026],[0.0068,0.0185,0.0125,0.0015],[-0.0068,0.0185,0.0125,0.0015],[0.0022,0.0205,0.0115,0.0013],[-0.0022,0.0205,0.0115,0.0013],[0.0055,0.0195,0.009,0.0012],[-0.0055,0.0195,0.009,0.0012]];
  for(const e of eyes){const m=new THREE.Mesh(new THREE.SphereGeometry(e[3],12,8),eyeM);m.position.set(e[0],e[1],e[2]);spider.add(m);
    if(e[3]>0.002){const gl=new THREE.Mesh(new THREE.SphereGeometry(e[3]*0.3,6,4),new THREE.MeshBasicMaterial({color:0xffffff}));gl.position.set(e[0]+0.0008,e[1]+0.0011,e[2]+0.0018);spider.add(gl);}}
  for(const s of [-1,1]){const f=new THREE.Mesh(new THREE.ConeGeometry(0.0016,0.005,6),spMat);f.position.set(s*0.002,0.009,0.016);f.rotation.x=Math.PI*0.85;spider.add(f);}
  const cyl=new THREE.CylinderGeometry(1,0.8,1,6);cyl.translate(0,0.5,0);
  const ang=[38,72,108,146];
  for(const s of [-1,1])for(let k=0;k<4;k++){
    const a=ang[k]*Math.PI/180;
    const root=V3(s*0.006,0.014,0.010-k*0.0042);
    const rest=V3(s*Math.sin(a)*0.036,0,Math.cos(a)*0.038+0.004);
    const up=new THREE.Mesh(cyl,spLeg),lo=new THREE.Mesh(cyl,spLeg),kn=new THREE.Mesh(new THREE.SphereGeometry(0.0016,8,6),spMark);
    up.scale.set(0.0014,L1,0.0014);lo.scale.set(0.0011,L2,0.0011);
    spider.add(up);spider.add(lo);spider.add(kn);
    LEGS.push({root,rest,up,lo,kn,phase:((k%2)^(s>0?1:0))*0.5,foot:rest.clone()});}
  spider.traverse(o=>{if(o.isMesh){o.castShadow=Q>0;}});
})();
function setSkin(){const k=(S.skin==='gold'&&!S.secret)?'black':S.skin;const sk=SKIN[k]||SKIN.black;
  spMat.color.setHex(sk.body);spMark.color.setHex(sk.mark);spLeg.color.setHex(k==='gold'?0xd9a520:0x2a2830);
  spMat.metalness=k==='gold'?0.9:0.05;spMat.roughness=k==='gold'?0.25:0.45;spLeg.metalness=k==='gold'?0.9:0;}
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_k=new THREE.Vector3(),_dir=new THREE.Vector3(),_perp=new THREE.Vector3(),_qq=new THREE.Quaternion();
function segTo(mesh,A,B){_dir.subVectors(B,A);const l=_dir.length();mesh.position.copy(A);_qq.setFromUnitVectors(UP,_dir.divideScalar(l||1));mesh.quaternion.copy(_qq);}
let gaitPh=0;
function animLegs(moveAmt,dt,air){
  for(const L of LEGS){
    const ph=(gaitPh+L.phase)*Math.PI*2;
    const f=L.foot.copy(L.rest);
    if(air){f.y=-0.004;f.x*=0.8;f.z*=0.85;}
    else{f.z+=Math.sin(ph)*0.009*moveAmt;f.y=Math.max(0,Math.cos(ph))*0.008*moveAmt;}
    _a.copy(L.root);_dir.subVectors(f,_a);let d=_dir.length();const maxd=L1+L2-0.001;if(d>maxd){_dir.multiplyScalar(maxd/d);d=maxd;f.copy(_a).add(_dir);}
    _dir.divideScalar(d);
    const a=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-a*a));
    _perp.copy(UP).addScaledVector(_dir,-_dir.y).normalize();
    _k.copy(_a).addScaledVector(_dir,a).addScaledVector(_perp,h);
    segTo(L.up,_a,_k);segTo(L.lo,_k,f);L.kn.position.copy(_k);}}
const blob=new THREE.Mesh(new THREE.PlaneGeometry(0.09,0.09),new THREE.MeshBasicMaterial({map:texBlob,transparent:true,depthWrite:false,opacity:.6}));
blob.renderOrder=2;scene.add(blob);

/* ---------- Spider movement on any surface ---------- */
const START={p:V3(2.75,0.006,2.35),f:V3(0,0,-1)};
const SP={p:V3(),n:V3(0,1,0),f:V3(0,0,-1),mode:'surf',v:V3(),zipP:V3(),zipN:V3(),zipSpd:0,hp:3,inv:0,held:null,pitch:-0.28,safe:false,inPack:false,healT:0,airT:0};
const spQ=new THREE.Quaternion();
const _m4=new THREE.Matrix4(),_x=new THREE.Vector3(),_tq=new THREE.Quaternion(),_v=new THREE.Vector3(),_v2=new THREE.Vector3(),_neg=new THREE.Vector3();
function resetSpider(){SP.p.copy(START.p);SP.n.set(0,1,0);SP.f.copy(START.f);SP.mode='surf';SP.v.set(0,0,0);SP.hp=3;SP.inv=0;SP.held=null;SP.pitch=-0.28;
  orientTarget();spQ.copy(_tq);camSnap=true;}
function orientTarget(){_x.crossVectors(SP.n,SP.f).normalize();_m4.makeBasis(_x,SP.n,SP.f);_tq.setFromRotationMatrix(_m4);return _tq;}
function surfTo(n,p){ // switch to a new surface: rotate heading with the surface
  const d=SP.n.dot(n);
  if(d<-0.99)_qq.setFromAxisAngle(SP.f,Math.PI);else _qq.setFromUnitVectors(SP.n,n);
  SP.f.applyQuaternion(_qq);SP.n.copy(n);SP.p.copy(p);
  SP.f.addScaledVector(SP.n,-SP.f.dot(SP.n));if(SP.f.lengthSq()<1e-6){SP.f.set(1,0,0).addScaledVector(SP.n,-SP.n.x);}SP.f.normalize();
  SP.mode='surf';}
const SPEED=0.42,RUN=0.85;
let moveAmt=0;
function stepSpider(dt,inp){
  // heading: look left/right turns the spider around its own up
  if(inp.yaw){_qq.setFromAxisAngle(SP.n,-inp.yaw);SP.f.applyQuaternion(_qq).normalize();}
  SP.pitch=clamp(SP.pitch-inp.pitch,-1.2,1.0);
  if(SP.inv>0)SP.inv-=dt;
  let moved=0;
  if(SP.mode==='surf'){
    _x.crossVectors(SP.f,SP.n);                          // right
    _v.copy(SP.f).multiplyScalar(inp.my).addScaledVector(_x,inp.mx);
    let l=_v.length();if(l>1){_v.divideScalar(l);l=1;}
    const spd=(inp.run?RUN:SPEED)*l;
    if(spd>0.001){
      _v.normalize();const step=spd*dt;
      // 1) wall ahead → climb it
      _a.copy(SP.p).addScaledVector(SP.n,0.012);
      if(castRay(_a,_v,step+0.022)&&HIT.n.dot(SP.n)<0.7){surfTo(HIT.n.clone(),HIT.p.clone());moved=step;}
      else{
        _b.copy(SP.p).addScaledVector(_v,step);
        _a.copy(_b).addScaledVector(SP.n,0.03);_neg.copy(SP.n).negate();
        if(castRay(_a,_neg,0.06)){ // 2) still on a surface (maybe a small step or a slope)
          if(HIT.n.dot(SP.n)<0.9995)surfTo(HIT.n.clone(),HIT.p.clone());else SP.p.copy(HIT.p);moved=step;}
        else{ // 3) edge: wrap around it onto the side face
          _a.copy(_b).addScaledVector(SP.n,-0.01);_neg.copy(_v).negate();
          if(castRay(_a,_neg,0.07)){surfTo(HIT.n.clone(),HIT.p.clone());moved=step;}
          else{SP.mode='air';SP.v.copy(_v).multiplyScalar(spd).addScaledVector(SP.n,0.15);SP.airT=0;}
        }}
    }
    if(inp.jump){SP.mode='air';SP.airT=0;SP.v.copy(SP.n).multiplyScalar(1.35);
      if(spd>0.001)SP.v.addScaledVector(_v,spd*1.6);if(SP.n.y>0.7)SP.v.y+=0.25;
      sfx('jump');}
  }
  else if(SP.mode==='air'){
    SP.airT+=dt;SP.v.y-=9.8*dt;if(SP.v.y<-6)SP.v.y=-6;
    // falling orientation: belly down
    _qq.setFromUnitVectors(SP.n,UP);_tq.identity().slerp(_qq,Math.min(1,dt*4));SP.n.applyQuaternion(_tq).normalize();SP.f.applyQuaternion(_tq);SP.f.addScaledVector(SP.n,-SP.f.dot(SP.n)).normalize();
    // steer a little in the air
    _x.crossVectors(SP.f,UP);
    const d=SP.v.length()*dt;
    if(d>1e-6){_v.copy(SP.v).normalize();
      if(castRay(SP.p,_v,d+0.004)){surfTo(HIT.n.clone(),HIT.p.clone());SP.v.set(0,0,0);if(SP.airT>0.25)sfx('land');}
      else SP.p.addScaledVector(SP.v,dt);}
  }
  else if(SP.mode==='zip'){
    _v.subVectors(SP.zipP,SP.p);const dist=_v.length();
    SP.zipSpd=Math.min(4.2,SP.zipSpd+dt*14);
    const st=SP.zipSpd*dt;
    if(dist<=st+0.004){surfTo(SP.zipN.clone(),SP.zipP.clone());sfx('land');webs.length=0;}
    else{_v.divideScalar(dist);SP.p.addScaledVector(_v,st);moved=st;
      // face the travel direction a bit
      _qq.setFromUnitVectors(SP.n,SP.zipN);_tq.identity().slerp(_qq,Math.min(1,dt*6));SP.n.applyQuaternion(_tq).normalize();SP.f.applyQuaternion(_tq);SP.f.addScaledVector(SP.n,-SP.f.dot(SP.n)).normalize();}
  }
  // out of the room (should not happen): back to the rug
  if(SP.p.x<-0.4||SP.p.x>W+0.4||SP.p.z<-0.4||SP.p.z>D+0.4||SP.p.y<-0.3||SP.p.y>H+0.3){resetPos();}
  moveAmt=lerp(moveAmt,clamp(moved/dt/SPEED,0,1.6),Math.min(1,dt*10));
  gaitPh+=moved/0.034;
  // pose
  orientTarget();spQ.slerp(_tq,Math.min(1,dt*(SP.mode==='surf'?16:8)));
  spider.position.copy(SP.p);spider.quaternion.copy(spQ);
  animLegs(Math.min(1,moveAmt),dt,SP.mode!=='surf');
  spider.visible=!(SP.inv>0&&Math.floor(SP.inv*12)%2===0);
  // blob shadow on the surface
  if(SP.mode==='surf'){blob.visible=true;blob.position.copy(SP.p).addScaledVector(SP.n,0.0012);_qq.setFromUnitVectors(V3(0,0,1),SP.n);blob.quaternion.copy(_qq);}
  else{_neg.set(0,-1,0);if(castRay(SP.p,_neg,1.5)){blob.visible=true;blob.position.copy(HIT.p).addScaledVector(HIT.n,0.0012);_qq.setFromUnitVectors(V3(0,0,1),HIT.n);blob.quaternion.copy(_qq);}else blob.visible=false;}
  SP.safe=onRug(SP.p)&&SP.mode==='surf';
  SP.inPack=inPack(SP.p);
}
function resetPos(){SP.p.copy(START.p);SP.n.set(0,1,0);SP.f.copy(START.f);SP.mode='surf';SP.v.set(0,0,0);camSnap=true;toast('Паук вернулся на ковёр');}

/* ---------- Camera: behind the spider, «up» follows the surface ---------- */
const CAM={pos:V3(),up:V3(0,1,0),aim:V3()};let camSnap=true;
const _piv=new THREE.Vector3(),_des=new THREE.Vector3(),_back=new THREE.Vector3();
function updCamera(dt){
  const n=SP.mode==='air'?UP:SP.n;
  CAM.up.lerp(n,camSnap?1:Math.min(1,dt*5)).normalize();
  // aim direction = heading pitched toward the surface normal
  const c=Math.cos(SP.pitch),s=Math.sin(SP.pitch);
  CAM.aim.copy(SP.f).multiplyScalar(c).addScaledVector(SP.n,s).normalize();
  _piv.copy(SP.p).addScaledVector(SP.n,0.05);
  const dist=S.camd;
  // the camera stays behind the spider; when aiming up it does not dive under it, it just looks up
  const pc=Math.min(SP.pitch,-0.08);
  _back.copy(SP.f).multiplyScalar(-Math.cos(pc)).addScaledVector(SP.n,-Math.sin(pc)).normalize();
  let dd=dist;
  if(castRay(_piv,_back,dist+0.02))dd=Math.max(0.03,HIT.t-0.015);
  _des.copy(_piv).addScaledVector(_back,dd);
  if(camSnap){CAM.pos.copy(_des);camSnap=false;}else CAM.pos.lerp(_des,Math.min(1,dt*14));
  // never let the smoothed camera sit behind a wall
  _v.subVectors(CAM.pos,_piv);const l=_v.length();if(l>1e-4){_v.divideScalar(l);if(castRay(_piv,_v,l+0.01))CAM.pos.copy(_piv).addScaledVector(_v,Math.max(0.02,HIT.t-0.012));}
  camera.position.copy(CAM.pos);
  _m4.lookAt(CAM.pos,_v2.copy(CAM.pos).add(CAM.aim),CAM.up);camera.quaternion.setFromRotationMatrix(_m4);
}

/* ---------- Web strands ---------- */
const webs=[];  // {a:fn→Vector3, b:fn→Vector3, life, t}
const webMat=new THREE.MeshBasicMaterial({color:0xf4f8ff,transparent:true,opacity:.9});
const webPool=[];for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,5),webMat);m.visible=false;m.frustumCulled=false;scene.add(m);webPool.push(m);}
const webTip=new THREE.Vector3();
function addWeb(a,b,life){webs.push({a,b,life:life||0.35,t:0});if(webs.length>4)webs.shift();}
function updWebs(dt){
  webPool.forEach(m=>m.visible=false);
  for(let i=webs.length-1;i>=0;i--){const w=webs[i];w.t+=dt;if(w.life>0&&w.t>w.life){webs.splice(i,1);continue;}}
  webs.forEach((w,i)=>{const m=webPool[i];const A=w.a(),B=w.b();const grow=Math.min(1,w.t/0.07);
    webTip.copy(A).lerp(B,grow);_dir.subVectors(webTip,A);const l=_dir.length();if(l<1e-4)return;
    m.visible=true;m.position.copy(A).addScaledVector(_dir,0.5);_qq.setFromUnitVectors(UP,_dir.divideScalar(l));m.quaternion.copy(_qq);m.scale.set(0.0007,l,0.0007);});
}
const spMouth=()=>_a.copy(SP.p).addScaledVector(SP.n,0.012).addScaledVector(SP.f,0.012).clone();

/* ---------- Things to pull: loose bricks, pencil, ball, toy car, sock, teddy ---------- */
const ITEMS=[];
function item(kind,mesh,x,y,z,r,o){o=o||{};mesh.traverse(m=>{if(m.isMesh){m.castShadow=Q>0;m.receiveShadow=Q>0;}});
  const it={kind,mesh,r,pos:V3(x,y+r,z),vel:V3(),rest:true,state:'free',big:!!o.big,name:o.name||kind,spin:V3()};mesh.position.copy(it.pos);scene.add(mesh);ITEMS.push(it);return it;}
function buildItems(){
  const bk=(c)=>{const g=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(0.064,0.038,0.032),std({color:c,roughness:.35}));g.add(b);
    for(let i=0;i<2;i++)for(let k=0;k<1;k++){const s=new THREE.Mesh(new THREE.CylinderGeometry(0.0095,0.0095,0.009,12),b.material);s.position.set(-0.016+i*0.032,0.023,0);g.add(s);}return g;};
  item('brick',bk(0xe53935),1.75,0,2.1,0.022,{name:'кубик'});
  item('brick',bk(0x43a047),1.2,0,1.5,0.022,{name:'кубик'});
  item('brick',bk(0xfdd835),3.2,0,1.4,0.022,{name:'кубик'});
  item('brick',bk(0x1e88e5),2.4,0,1.2,0.022,{name:'кубик'});
  item('brick',bk(0xfb8c00),0.9,0,2.8,0.022,{name:'кубик'});
  item('brick',bk(0xf48fb1),2.7,0.75,0.45,0.022,{name:'кубик'});
  const pen=new THREE.Group();const pb=new THREE.Mesh(new THREE.CylinderGeometry(0.004,0.004,0.15,8),M.red);pb.rotation.z=Math.PI/2;pen.add(pb);
  const pt=new THREE.Mesh(new THREE.ConeGeometry(0.004,0.014,8),std({color:0xe8c8a0}));pt.rotation.z=-Math.PI/2;pt.position.x=0.082;pen.add(pt);
  item('pencil',pen,2.15,0,1.0,0.008,{name:'ручку'});
  const ball=new THREE.Mesh(new THREE.SphereGeometry(0.032,20,14),std({color:0x2e7dd8,roughness:.35}));item('ball',ball,0.8,0,3.2,0.032,{name:'мячик'});
  const car=new THREE.Group();const cb=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.022,0.035),std({color:0xe53935,roughness:.3,metalness:.3}));cb.position.y=0.006;car.add(cb);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(0.035,0.018,0.03),std({color:0xbfe3ff,roughness:.1}));cab.position.set(-0.005,0.024,0);car.add(cab);
  for(const [x,z] of [[0.022,0.018],[-0.022,0.018],[0.022,-0.018],[-0.022,-0.018]]){const w=new THREE.Mesh(new THREE.CylinderGeometry(0.009,0.009,0.006,12),M.black);w.rotation.x=Math.PI/2;w.position.set(x,-0.004,z);car.add(w);}
  item('car',car,1.55,0,2.5,0.02,{name:'машинку'});
  const sock=new THREE.Mesh(new THREE.SphereGeometry(0.04,14,10),std({color:0x9aa0a8,roughness:1}));sock.scale.set(1.8,0.35,0.8);item('sock',sock,3.45,0,1.7,0.016,{name:'носок'});
  const bear=new THREE.Group();const bm=std({color:0x7a4a2a,roughness:1});
  const bb=new THREE.Mesh(new THREE.SphereGeometry(0.05,16,12),bm);bb.scale.set(1,1.15,0.9);bear.add(bb);
  const bh=new THREE.Mesh(new THREE.SphereGeometry(0.036,16,12),bm);bh.position.y=0.07;bear.add(bh);
  for(const s of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.013,10,8),bm);e.position.set(s*0.026,0.1,0);bear.add(e);
    const a=new THREE.Mesh(new THREE.SphereGeometry(0.018,10,8),bm);a.position.set(s*0.05,0.01,0.01);a.scale.set(1,1.5,1);bear.add(a);
    const l=new THREE.Mesh(new THREE.SphereGeometry(0.02,10,8),bm);l.position.set(s*0.028,-0.05,0.02);bear.add(l);
    const ey=new THREE.Mesh(new THREE.SphereGeometry(0.004,8,6),M.black);ey.position.set(s*0.012,0.078,0.031);bear.add(ey);}
  const sn=new THREE.Mesh(new THREE.SphereGeometry(0.012,10,8),std({color:0xc8a07a}));sn.position.set(0,0.065,0.032);bear.add(sn);
  item('bear',bear,3.45,0.44,3.75,0.06,{big:true,name:'мишку'});
}
const _iv=new THREE.Vector3();
function updItems(dt){
  for(const it of ITEMS){
    if(it.state==='held'){it.mesh.position.copy(SP.p).addScaledVector(SP.n,0.04+it.r).addScaledVector(SP.f,-0.004);it.mesh.quaternion.copy(spQ);it.pos.copy(it.mesh.position);continue;}
    if(it.state==='pulled'){const tgt=_iv.copy(SP.p).addScaledVector(SP.n,0.03);_v.subVectors(tgt,it.pos);const d=_v.length();const st=(it.big?1.6:2.8)*dt;
      if(d<0.05+it.r*0.5){webs.length=0;if(it.big){it.state='free';it.rest=false;it.vel.set(0,0.3,0);toast('Мишка слишком большой, его не унести');}
        else{it.state='held';SP.held=it;sfx('grab');}}
      else{it.pos.addScaledVector(_v,Math.min(1,st/d));it.mesh.position.copy(it.pos);it.mesh.rotation.y+=dt*6;}continue;}
    if(it.rest)continue;
    it.vel.y-=9.8*dt;it.pos.addScaledVector(it.vel,dt);
    const nrm=sphereResolve(it.pos,it.r);
    if(nrm.lengthSq()>0){nrm.normalize();const vn=it.vel.dot(nrm);if(vn<0){it.vel.addScaledVector(nrm,-vn*(it.kind==='ball'?1.7:1.3));it.vel.multiplyScalar(it.kind==='ball'?0.9:0.6);
        if(-vn>0.6)sfx('tap');}
      if(nrm.y>0.7&&it.vel.lengthSq()<0.004){it.rest=true;it.vel.set(0,0,0);}}
    if(it.state==='thrown'&&it.vel.lengthSq()<1)it.state='free';
    it.mesh.position.copy(it.pos);it.mesh.rotation.x+=it.vel.z*dt*20;it.mesh.rotation.z-=it.vel.x*dt*20;
    if(it.pos.y<-0.5){it.pos.set(2.6,0.1,1.5);it.vel.set(0,0,0);}
  }
}

/* ---------- Flies ---------- */
const FLY_SPOTS=[[0.95,1.75,-0.17],[3.55,1.5,-0.17],[2.3,1.62,0.12],[2.35,2.42,2.05],[4.42,2.3,0.45],[4.2,0.09,3.0],[2.55,0.16,0.35],[2.95,1.55,3.95],
  [0.12,1.45,1.9],[0.18,2.2,3.5],[0.3,2.5,3.8],[1.4,0.12,3.55],[4.6,1.85,3.0],[3.9,1.05,-0.05]];
const FLIES=[];let flyEaten=0;
const flyBody=std({color:0x15161a,roughness:.3,metalness:.4}),flyWing=new THREE.MeshBasicMaterial({color:0xddeeff,transparent:true,opacity:.45,side:THREE.DoubleSide,depthWrite:false});
const flyEye=std({color:0x8a1a10,roughness:.3});
function makeFly(gold){const g=new THREE.Group();const bm=gold?M.gold:flyBody;
  const b=new THREE.Mesh(new THREE.SphereGeometry(0.004,10,8),bm);b.scale.set(1,0.9,1.6);g.add(b);
  const h=new THREE.Mesh(new THREE.SphereGeometry(0.003,10,8),gold?M.gold:flyEye);h.position.z=0.006;g.add(h);
  const wg=new THREE.PlaneGeometry(0.008,0.004);wg.translate(0.004,0,0);
  const w1=new THREE.Mesh(wg,flyWing),w2=new THREE.Mesh(wg,flyWing);w1.position.y=0.003;w2.position.y=0.003;w2.rotation.y=Math.PI;g.add(w1);g.add(w2);g.userData.w=[w1,w2];
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:gold?0xffd060:0xfff4c0,transparent:true,opacity:gold?.8:.28,depthWrite:false}));glow.scale.set(0.05,0.05,1);g.add(glow);
  scene.add(g);return g;}
function buildFlies(){FLY_SPOTS.forEach((s,i)=>FLIES.push({home:V3(s[0],s[1],s[2]),pos:V3(),mesh:makeFly(false),ph:i*1.7,eaten:false,pull:false}));
  const P=PACK;FLIES.push({home:V3((P.x0+P.x1)/2,P.y0+0.08,(P.z0+P.z1)/2),pos:V3(),mesh:makeFly(true),ph:0,eaten:false,pull:false,gold:true});}
function resetFlies(){flyEaten=0;FLIES.forEach(f=>{f.eaten=false;f.pull=false;f.mesh.visible=true;f.mesh.scale.setScalar(f.gold?1.6:1);});}
function updFlies(dt,t){
  const sp=_a.copy(SP.p).addScaledVector(SP.n,0.015);
  for(const f of FLIES){if(f.eaten)continue;
    if(f.pull){_v.subVectors(sp,f.pos);const d=_v.length();if(d<0.02){eatFly(f);continue;}f.pos.addScaledVector(_v,Math.min(1,3.2*dt/d));}
    else{const r=f.gold?0.03:0.045;f.pos.set(f.home.x+Math.sin(t*1.3+f.ph)*r,f.home.y+Math.sin(t*2.3+f.ph)*0.02,f.home.z+Math.cos(t*1.7+f.ph)*r);
      if(f.pos.distanceTo(sp)<0.04)eatFly(f);}
    f.mesh.position.copy(f.pos);f.mesh.rotation.y=Math.atan2(Math.cos(t*1.3+f.ph),-Math.sin(t*1.7+f.ph));
    const fl=Math.sin(t*90)*0.9;f.mesh.userData.w[0].rotation.z=fl;f.mesh.userData.w[1].rotation.z=-fl;}
}

/* ---------- The cat: grey tabby built from primitives ---------- */
const cat=new THREE.Group();scene.add(cat);
const catMat=std({map:texTabby,roughness:.95});
const catWhite=std({color:0xe8e4dc,roughness:1});
const CATP={legs:[],tail:[],head:null,body:null,earL:null,earR:null,pupils:[]};
(function buildCat(){
  const sph=(r,m,x,y,z,sx,sy,sz,par)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),m);o.position.set(x,y,z);o.scale.set(sx||1,sy||1,sz||1);(par||cat).add(o);return o;};
  CATP.body=new THREE.Group();cat.add(CATP.body);
  sph(0.1,catMat,0,0.2,-0.02,0.95,0.9,2.1,CATP.body).rotation.y=Math.PI/2;
  sph(0.085,catMat,0,0.22,0.13,1,1,1.1,CATP.body);
  sph(0.06,catWhite,0,0.19,0.18,1,1,0.8,CATP.body);
  const head=new THREE.Group();head.position.set(0,0.3,0.22);CATP.body.add(head);CATP.head=head;
  sph(0.07,catMat,0,0,0,1.1,0.95,1,head).rotation.y=Math.PI/2;
  sph(0.038,catWhite,0,-0.022,0.05,1.2,0.8,0.9,head);
  sph(0.008,std({color:0xd88a8a,roughness:.6}),0,-0.002,0.072,1.3,0.8,1,head);
  for(const s of [-1,1]){
    const ear=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.055,4),catMat);ear.position.set(s*0.04,0.06,-0.005);ear.rotation.z=-s*0.3;ear.rotation.y=Math.PI/4;head.add(ear);
    const inn=new THREE.Mesh(new THREE.ConeGeometry(0.018,0.035,4),std({color:0xd8a0a0,roughness:1}));inn.position.set(s*0.04,0.055,0.006);inn.rotation.z=-s*0.3;inn.rotation.y=Math.PI/4;head.add(inn);
    if(s<0)CATP.earL=ear;else CATP.earR=ear;
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.016,16,12),std({color:0x9ad03a,emissive:0x2a4a00,emissiveIntensity:.6,roughness:.05}));eye.position.set(s*0.03,0.012,0.055);eye.scale.set(1,1,0.6);head.add(eye);
    const pup=new THREE.Mesh(new THREE.SphereGeometry(0.0165,12,8),M.black);pup.scale.set(0.25,0.95,0.62);pup.position.set(s*0.03,0.012,0.058);head.add(pup);CATP.pupils.push(pup);
    for(let w=0;w<3;w++){const wh=new THREE.Mesh(new THREE.CylinderGeometry(0.0006,0.0006,0.09,3),std({color:0xffffff}));wh.rotation.z=Math.PI/2+s*(w-1)*0.15;wh.position.set(s*0.06,-0.02-w*0.006,0.055);head.add(wh);}
  }
  const lg=new THREE.CylinderGeometry(0.022,0.018,0.2,10);lg.translate(0,-0.1,0);
  for(const [x,z] of [[-0.05,0.14],[0.05,0.14],[-0.05,-0.13],[0.05,-0.13]]){const g=new THREE.Group();g.position.set(x,0.2,z);CATP.body.add(g);
    const l=new THREE.Mesh(lg,catMat);g.add(l);const paw=new THREE.Mesh(new THREE.SphereGeometry(0.024,10,8),catWhite);paw.position.y=-0.195;paw.scale.set(1,0.6,1.3);g.add(paw);CATP.legs.push(g);}
  let par=CATP.body,prev=null;
  for(let i=0;i<9;i++){const g=new THREE.Group();g.position.set(0,i?0:0.24,i?0.035:-0.22);par.add(g);
    const s=new THREE.Mesh(new THREE.SphereGeometry(0.02-i*0.0008,10,8),i===8?std({color:0x3a3430,roughness:1}):catMat);s.scale.set(1,1,1.4);g.add(s);CATP.tail.push(g);par=g;}
  CATP.tail[0].rotation.x=Math.PI*0.85;
  cat.traverse(o=>{if(o.isMesh){o.castShadow=Q>0;}});
  const cb=new THREE.Mesh(new THREE.PlaneGeometry(0.4,0.6),new THREE.MeshBasicMaterial({map:texBlob,transparent:true,depthWrite:false,opacity:.5}));cb.rotation.x=-Math.PI/2;cb.position.y=0.002;cat.add(cb);
})();

/* ---------- Navigation grid on the floor (10 cm cells) ---------- */
const CELL=0.1,NX=Math.ceil(W/CELL),NZ=Math.ceil(D/CELL);
const block=new Uint8Array(NX*NZ);   // 1 = furniture, 2 = rug (safe zone, the cat refuses to step on it)
function buildGrid(){const R=0.13;
  for(let i=0;i<NX;i++)for(let k=0;k<NZ;k++){const x=(i+0.5)*CELL,z=(k+0.5)*CELL;let b=0;
    if(x<R||x>W-R||z<R||z>D-R)b=1;
    for(const f of FOOT)if(x>f.x0-R&&x<f.x1+R&&z>f.z0-R&&z<f.z1+R){b=1;break;}
    if(!b&&x>RUG.x0-0.08&&x<RUG.x1+0.08&&z>RUG.z0-0.08&&z<RUG.z1+0.08)b=2;
    block[i+k*NX]=b;}}
const cellOf=(x,z)=>[clamp(Math.floor(x/CELL),0,NX-1),clamp(Math.floor(z/CELL),0,NZ-1)];
function nearestFree(x,z){const [ci,ck]=cellOf(x,z);if(!block[ci+ck*NX])return [ci,ck];
  for(let r=1;r<20;r++){let best=null,bd=1e9;
    for(let i=ci-r;i<=ci+r;i++)for(let k=ck-r;k<=ck+r;k++){if(i<0||k<0||i>=NX||k>=NZ)continue;if(Math.max(Math.abs(i-ci),Math.abs(k-ck))!==r)continue;
      if(!block[i+k*NX]){const d=(i-ci)*(i-ci)+(k-ck)*(k-ck);if(d<bd){bd=d;best=[i,k];}}}
    if(best)return best;}
  return [ci,ck];}
const flow=new Float32Array(NX*NZ);let flowKey=-1;
function buildFlow(ti,tk){const key=ti+tk*NX;if(key===flowKey)return;flowKey=key;
  flow.fill(1e9);const q=[key];flow[key]=0;let h=0;
  const nb=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.41],[1,-1,1.41],[-1,1,1.41],[-1,-1,1.41]];
  while(h<q.length){const c=q[h++];const ci=c%NX,ck=(c/NX)|0;
    for(const [di,dk,w] of nb){const i=ci+di,k=ck+dk;if(i<0||k<0||i>=NX||k>=NZ)continue;const j=i+k*NX;if(block[j])continue;
      if(di&&dk&&(block[ci+di+ck*NX]||block[ci+(ck+dk)*NX]))continue;
      const v=flow[c]+w;if(v<flow[j]-1e-6){flow[j]=v;q.push(j);}}}}
function flowDir(x,z,out){const [ci,ck]=cellOf(x,z);let best=flow[ci+ck*NX],bi=ci,bk=ck;
  for(let di=-1;di<=1;di++)for(let dk=-1;dk<=1;dk++){const i=ci+di,k=ck+dk;if(i<0||k<0||i>=NX||k>=NZ)continue;const v=flow[i+k*NX];if(v<best){best=v;bi=i;bk=k;}}
  out.set((bi+0.5)*CELL-x,0,(bk+0.5)*CELL-z);return best;}

/* ---------- Cat brain ----------
   Levels: -1 = floor, otherwise an index in PLAT (bed, desk, sills, chairs). The cat reaches 0.42 m above its level,
   jumps between floor and tops, never steps on the rug and cannot get into the backpack, under the big bed or onto the ceiling. */
const CAT_REACH=0.42;
const C={pos:V3(0.6,0,3.4),yaw:0,level:-1,state:'wander',t:0,goal:V3(),lost:0,cool:0,stuckT:0,jump:null,crouch:0,pounce:null,speed:0,watchT:0,meowT:3,seen:false,toy:null,scaredT:0,sleepT:0,anim:0,swipe:0,webCool:0};
const CATLV=()=>({1:{run:0.75,see:1.8,wind:0.55},2:{run:1.0,see:2.4,wind:0.45},3:{run:1.25,see:3.2,wind:0.35}}[S.cat]||{run:1,see:2.4,wind:0.45});
let catOn=true;
function levelY(l){return l<0?0:PLAT[l].y;}
function inRect(p,r,m){return p.x>r.x0-m&&p.x<r.x1+m&&p.z>r.z0-m&&p.z<r.z1+m;}
function resetCat(){C.pos.set(0.6,0,3.4);C.level=-1;C.state='wander';C.t=0;C.lost=0;C.cool=2;C.jump=null;C.pounce=null;C.yaw=Math.PI/2;C.toy=null;C.webCool=0;pickWander();cat.visible=catOn;}
function pickWander(){
  if(Math.random()<0.3&&PLAT.length){const l=(Math.random()*PLAT.length)|0;const p=PLAT[l];C.goal.set(rnd(p.x0+0.1,p.x1-0.1),p.y,rnd(p.z0+0.05,p.z1-0.05));C.goalLevel=l;}
  else{for(let i=0;i<30;i++){const x=rnd(0.3,W-0.3),z=rnd(0.3,D-0.3);const [ci,ck]=cellOf(x,z);if(!block[ci+ck*NX]){C.goal.set(x,0,z);break;}}C.goalLevel=-1;}
  C.t=rnd(5,9);}
// where can the cat get the spider from? → {level, x, z} or null
function spiderAccess(){
  if(SP.inPack||SP.safe)return null;
  const p=SP.p;
  let best=null;
  for(let l=-1;l<PLAT.length;l++){const y=levelY(l);if(p.y<y-0.03||p.y>y+CAT_REACH)continue;
    if(l<0){const [ci,ck]=nearestFree(p.x,p.z);const fx=(ci+0.5)*CELL,fz=(ck+0.5)*CELL;if(Math.hypot(fx-p.x,fz-p.z)>0.24||block[ci+ck*NX])continue;
      if(!best||y>=levelY(best.level))best={level:-1,x:fx,z:fz};}
    else{const r=PLAT[l];if(!inRect(p,r,0.16))continue;
      if(!best||y>levelY(best.level))best={level:l,x:clamp(p.x,r.x0,r.x1),z:clamp(p.z,r.z0,r.z1)};}}
  return best;}
function canSee(){const head=_a.set(C.pos.x,C.pos.y+0.32,C.pos.z);_v.subVectors(SP.p,head);const d=_v.length();if(d<1e-3)return true;_v.divideScalar(d);
  return !castRay(head,_v,d-0.02,b=>b.tag==='brick');}
function startJump(to,level){const from=C.pos.clone();C.jump={from,to:to.clone(),level,t:0,dur:0.42+Math.abs(to.y-from.y)*0.25};C.state=C.state==='hunt'?'hunt':C.state;sfx('catjump');}
const _g=new THREE.Vector3(),_fd=new THREE.Vector3();
// moves the cat toward (x,z) on level `lv`; returns distance left on the same level, or -1 while still changing level
function goTo(lv,x,z,spd,dt){
  if(C.jump)return -1;
  if(C.level!==lv){
    if(C.level>=0){ // jump down next to the platform, toward the goal
      const r=PLAT[C.level];const ox=clamp(x,r.x0-0.35,r.x1+0.35),oz=clamp(z,r.z0-0.35,r.z1+0.35);
      const [ci,ck]=nearestFree(ox,oz);startJump(V3((ci+0.5)*CELL,0,(ck+0.5)*CELL),-1);return -1;}
    // on the floor: walk to a free cell next to the platform, then jump up
    const r=PLAT[lv];const ex=clamp(C.pos.x,r.x0,r.x1),ez=clamp(C.pos.z,r.z0,r.z1);
    const tx=clamp(x,r.x0,r.x1),tz=clamp(z,r.z0,r.z1);
    const [ci,ck]=nearestFree(lerp(ex,tx,0.5),lerp(ez,tz,0.5));
    const ax=(ci+0.5)*CELL,az=(ck+0.5)*CELL;
    const dd=Math.hypot(ax-C.pos.x,az-C.pos.z);
    const near=Math.hypot(ex-C.pos.x,ez-C.pos.z)<0.4;
    if(dd<0.12||near){const lx=clamp(C.pos.x,r.x0+0.06,r.x1-0.06),lz=clamp(C.pos.z,r.z0+0.04,r.z1-0.04);startJump(V3(lx,r.y,lz),lv);return -1;}
    walkFloor(ax,az,spd,dt);return -1;}
  if(lv<0){walkFloor(x,z,spd,dt);return Math.hypot(x-C.pos.x,z-C.pos.z);}
  const r=PLAT[lv];const tx=clamp(x,r.x0,r.x1),tz=clamp(z,r.z0,r.z1);
  _g.set(tx-C.pos.x,0,tz-C.pos.z);const d=_g.length();if(d>0.02)steer(_g,spd,dt);
  C.pos.x=clamp(C.pos.x,r.x0,r.x1);C.pos.z=clamp(C.pos.z,r.z0,r.z1);return d;}
function walkFloor(x,z,spd,dt){const [ti,tk]=nearestFree(x,z);buildFlow(ti,tk);
  const v=flowDir(C.pos.x,C.pos.z,_fd);
  if(v<1.5){_fd.set(x-C.pos.x,0,z-C.pos.z);}
  if(_fd.lengthSq()>1e-6)steer(_fd,spd,dt);}
function steer(dir,spd,dt){dir.normalize();const want=Math.atan2(dir.x,dir.z);let dy=want-C.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;
  C.yaw+=clamp(dy,-dt*7,dt*7);const k=Math.max(0.2,Math.cos(dy));C.speed=lerp(C.speed,spd*k,Math.min(1,dt*6));
  C.pos.x+=Math.sin(C.yaw)*C.speed*dt;C.pos.z+=Math.cos(C.yaw)*C.speed*dt;
  if(C.level<0){const [ci,ck]=cellOf(C.pos.x,C.pos.z);if(block[ci+ck*NX]===2&&C.state!=='scared'){C.pos.x-=Math.sin(C.yaw)*C.speed*dt;C.pos.z-=Math.cos(C.yaw)*C.speed*dt;}}}
function faceTo(x,z,dt){const want=Math.atan2(x-C.pos.x,z-C.pos.z);let dy=want-C.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;C.yaw+=clamp(dy,-dt*6,dt*6);}
function catMsg(t){$('catMsg').textContent=t||'';}
function updCat(dt,t){
  if(!catOn){cat.visible=false;return;}
  const L=CATLV();
  C.cool-=dt;C.webCool-=dt;C.meowT-=dt;C.speed*=C.jump?1:1;
  let pose='walk';
  // jumping between levels overrides everything
  if(C.jump){const j=C.jump;j.t+=dt;const u=Math.min(1,j.t/j.dur);
    C.pos.lerpVectors(j.from,j.to,u);C.pos.y=lerp(j.from.y,j.to.y,u)+Math.sin(u*Math.PI)*(0.22+Math.abs(j.to.y-j.from.y)*0.3);
    faceTo(j.to.x,j.to.z,dt*2);
    if(u>=1){C.level=j.level;C.pos.y=levelY(j.level);C.jump=null;}
    pose='jump';}
  else if(C.state==='stuck'){C.stuckT-=dt;pose='stuck';catMsg('Кот запутался в паутине!');if(C.stuckT<=0){C.state='hunt';C.cool=0.8;catMsg('');}}
  else if(C.state==='scared'){C.scaredT-=dt;_g.set(C.pos.x-SP.p.x,0,C.pos.z-SP.p.z);const away=V3(C.pos.x+_g.x*3,0,C.pos.z+_g.z*3);goTo(-1,clamp(away.x,0.3,W-0.3),clamp(away.z,0.3,D-0.3),1.3,dt);pose='run';
    if(C.scaredT<=0){C.state='wander';pickWander();catMsg('');}}
  else if(C.state==='toy'){const it=C.toy;pose='run';
    if(!it||it.state==='held'||it.state==='pulled'){C.state='hunt';}
    else{const lv=it.pos.y<0.12?-1:C.level;const d=goTo(lv,it.pos.x,it.pos.z,1.1,dt);C.t-=dt;
      if(d>=0&&d<0.15&&it.rest){it.rest=false;it.vel.set(Math.sin(C.yaw)*0.9,0.4,Math.cos(C.yaw)*0.9);C.swipe=0.3;sfx('tap');}
      if(C.t<=0){C.state='hunt';C.toy=null;catMsg('');}}}
  else if(C.state==='sleep'){pose='sleep';C.sleepT-=dt;catMsg('Кот спит… тише');
    if(C.sleepT<=0||(SP.p.distanceTo(C.pos)<0.35)){C.state='wander';catMsg('');meow();}}
  else if(C.state==='crouch'){pose='crouch';C.crouch-=dt;faceTo(SP.p.x,SP.p.z,dt);
    if(C.crouch<=0){const acc=spiderAccess();
      if(acc&&acc.level===C.level){const tgt=SP.p.clone();const dir=_g.set(tgt.x-C.pos.x,0,tgt.z-C.pos.z);const dl=dir.length();
        const land=V3(tgt.x-dir.x/dl*0.17,levelY(C.level),tgt.z-dir.z/dl*0.17);
        if(C.level>=0){const r=PLAT[C.level];land.x=clamp(land.x,r.x0,r.x1);land.z=clamp(land.z,r.z0,r.z1);}
        else{const [ci,ck]=cellOf(land.x,land.z);if(block[ci+ck*NX]){land.x=C.pos.x+dir.x/dl*Math.max(0,dl-0.2);land.z=C.pos.z+dir.z/dl*Math.max(0,dl-0.2);}}
        C.pounce={from:C.pos.clone(),to:land,tgt,t:0};C.state='pounce';sfx('pounce');}
      else C.state='hunt';}}
  else if(C.state==='pounce'){pose='jump';const P=C.pounce;P.t+=dt;const u=Math.min(1,P.t/0.3);
    C.pos.lerpVectors(P.from,P.to,u);C.pos.y=P.from.y+Math.sin(u*Math.PI)*0.12;
    if(u>=1){C.swipe=0.35;
      const paw=V3(C.pos.x+Math.sin(C.yaw)*0.17,C.pos.y,C.pos.z+Math.cos(C.yaw)*0.17);
      const acc=spiderAccess();
      const dxz=Math.hypot(SP.p.x-paw.x,SP.p.z-paw.z);
      if(acc&&dxz<0.12&&SP.inv<=0&&SP.mode!=='zip')hitSpider();
      C.state='hunt';C.cool=0.9;}}
  else if(C.state==='wander'){pose='walk';C.t-=dt;
    const d=goTo(C.goalLevel,C.goal.x,C.goal.z,0.32,dt);
    if(d>=0&&d<0.1){pose='sit';C.speed=0;}
    if(C.t<=0){if(Math.random()<0.25&&S.cat!=='3'){C.state='sleep';C.sleepT=rnd(7,12);}else pickWander();}
    // notice the spider
    const dist=C.pos.distanceTo(SP.p);
    if(running&&SP.inv<=0&&(dist<0.8||(dist<L.see&&canSee()))&&spiderAccess()){C.state='hunt';C.lost=0;meow();catMsg('Кот заметил паука!');setTimeout(()=>{if(C.state==='hunt')catMsg('');},1500);}}
  else if(C.state==='hunt'||C.state==='watch'){
    const acc=spiderAccess();
    if(!acc){C.lost+=dt;C.state='watch';pose='sit';
      // sit under the spider, look up, swish the tail
      const [ci,ck]=nearestFree(SP.p.x,SP.p.z);const wx=(ci+0.5)*CELL,wz=(ck+0.5)*CELL;
      const d=goTo(-1,wx,wz,0.6,dt);if(d>=0&&d<0.2){C.speed=0;faceTo(SP.p.x,SP.p.z,dt);}else pose='walk';
      if(C.meowT<0){C.meowT=rnd(3,6);meow(0.6);}
      if(C.lost>6){C.state='wander';pickWander();catMsg('Коту надоело ждать');setTimeout(()=>catMsg(''),1800);}}
    else{C.state='hunt';C.lost=Math.max(0,C.lost-dt*2);pose='run';
      const d=goTo(acc.level,acc.x,acc.z,L.run,dt);
      if(d>=0){const dd=Math.hypot(SP.p.x-C.pos.x,SP.p.z-C.pos.z);
        if(dd<0.42&&C.cool<=0){C.state='crouch';C.crouch=L.wind;C.speed=0;sfx('growl');}
        else if(d<0.15){C.speed=0;faceTo(SP.p.x,SP.p.z,dt);pose='sit';}}}}
  // distraction: a thrown item lands near the cat
  if(C.state==='hunt'||C.state==='wander'||C.state==='watch'){for(const it of ITEMS){if(it.state==='thrown'&&!it.big&&it.pos.distanceTo(C.pos)<1.2&&Math.random()<dt*3){C.state='toy';C.toy=it;C.t=3.5;catMsg('Кот отвлёкся на '+it.name+'!');break;}}}
  // a thrown thing that hits the cat scares it
  for(const it of ITEMS){if(it.state==='thrown'&&it.vel.lengthSq()>2&&it.pos.distanceTo(_a.set(C.pos.x,C.pos.y+0.2,C.pos.z))<0.2){cancelJump();C.state='scared';C.scaredT=4;it.state='free';it.vel.multiplyScalar(-0.3);sfx('hiss');catMsg('Кот испугался и убежал!');}}
  // pose and animation
  cat.position.copy(C.pos);cat.rotation.y=C.yaw;
  C.anim+=dt*(2+C.speed*9);
  const legSw=pose==='run'||pose==='walk'?Math.sin(C.anim)*Math.min(0.7,C.speed*1.1):0;
  CATP.legs.forEach((g,i)=>{g.rotation.x=(i===0||i===3?1:-1)*legSw;});
  let bodyY=0,bodyX=0,headX=0;
  if(pose==='sit'){bodyX=-0.35;bodyY=-0.03;CATP.legs[2].rotation.x=-1.2;CATP.legs[3].rotation.x=-1.2;headX=-0.3;}
  if(pose==='crouch'){bodyY=-0.08;bodyX=0.05;CATP.body.position.x=Math.sin(t*30)*0.006;}else CATP.body.position.x=0;
  if(pose==='sleep'){bodyY=-0.1;bodyX=0;CATP.legs.forEach(g=>g.rotation.x=1.4);headX=0.5;}
  if(pose==='jump'){CATP.legs[0].rotation.x=-0.9;CATP.legs[1].rotation.x=-0.9;CATP.legs[2].rotation.x=0.9;CATP.legs[3].rotation.x=0.9;}
  if(pose==='stuck'){bodyY=-0.04;CATP.body.rotation.z=Math.sin(t*25)*0.12;}else CATP.body.rotation.z=0;
  if(C.swipe>0){C.swipe-=dt;CATP.legs[0].rotation.x=-1.6*Math.sin((0.35-C.swipe)/0.35*Math.PI);}
  CATP.body.position.y=lerp(CATP.body.position.y,bodyY,Math.min(1,dt*8));
  CATP.body.rotation.x=lerp(CATP.body.rotation.x,bodyX,Math.min(1,dt*8));
  if(C.state==='watch'||C.state==='crouch'||C.state==='hunt'){_g.set(SP.p.x-C.pos.x,0,SP.p.z-C.pos.z);const up=Math.atan2(SP.p.y-C.pos.y-0.3,_g.length());headX=-clamp(up,-0.6,1.0);}
  CATP.head.rotation.x=lerp(CATP.head.rotation.x,headX,Math.min(1,dt*6));
  const swish=C.state==='hunt'||C.state==='watch'||C.state==='crouch'?2.6:1;
  CATP.tail.forEach((g,i)=>{if(i)g.rotation.x=-0.14+Math.sin(t*1.5*swish-i*0.5)*0.03;g.rotation.y=Math.sin(t*1.2*swish-i*0.45)*0.12*swish*(pose==='sleep'?0.2:1);});
  const pupW=C.state==='crouch'||C.state==='pounce'||C.state==='hunt'?0.9:0.25;CATP.pupils.forEach(p=>p.scale.x=lerp(p.scale.x,pupW,dt*5));
  const earB=C.state==='scared'||C.state==='stuck'?1.1:0;CATP.earL.rotation.x=lerp(CATP.earL.rotation.x,-earB,dt*6);CATP.earR.rotation.x=lerp(CATP.earR.rotation.x,-earB,dt*6);
}
function cancelJump(){if(C.jump){C.pos.copy(C.jump.to);C.level=C.jump.level;C.jump=null;}if(C.pounce){C.pos.y=levelY(C.level);C.pounce=null;}}
function webCat(){if(C.webCool>0){toast('Кот ещё не отошёл от паутины');return;}
  cancelJump();C.state='stuck';C.stuckT=2.6;C.webCool=6;sfx('hiss');}

/* ---------- Sound: tiny WebAudio synth, no files ---------- */
let AC=null,buzzG=null,master=null;
function audioInit(){if(AC||S.snd==='0')return;try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=0.7;master.connect(AC.destination);
  const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=190;const lfo=AC.createOscillator();lfo.frequency.value=23;const lg=AC.createGain();lg.gain.value=25;lfo.connect(lg);lg.connect(o.frequency);
  const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=900;f.Q.value=1.2;buzzG=AC.createGain();buzzG.gain.value=0;o.connect(f);f.connect(buzzG);buzzG.connect(master);o.start();lfo.start();}catch(e){AC=null;}}
function env(g,t0,a,peak,dur){g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(peak,t0+a);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);}
function tone(f0,f1,dur,type,vol,delay){if(!AC)return;const t0=AC.currentTime+(delay||0);const o=AC.createOscillator(),g=AC.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f0,t0);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t0+dur);env(g,t0,0.01,vol,dur);o.connect(g);g.connect(master);o.start(t0);o.stop(t0+dur+0.05);}
let noiseBuf=null;
function noise(dur,f0,f1,q,vol,type){if(!AC)return;if(!noiseBuf){noiseBuf=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
  const t0=AC.currentTime;const s=AC.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=AC.createBiquadFilter();f.type=type||'bandpass';f.Q.value=q;f.frequency.setValueAtTime(f0,t0);f.frequency.exponentialRampToValueAtTime(f1,t0+dur);
  const g=AC.createGain();env(g,t0,0.01,vol,dur);s.connect(f);f.connect(g);g.connect(master);s.start(t0);s.stop(t0+dur+0.05);}
function sfx(n){if(!AC)return;switch(n){
  case 'jump':tone(500,900,0.09,'triangle',0.05);break;
  case 'land':noise(0.06,900,400,1,0.08,'lowpass');break;
  case 'web':noise(0.16,4200,700,2,0.18);tone(1400,500,0.12,'sine',0.03);break;
  case 'grab':tone(800,1300,0.08,'triangle',0.06);break;
  case 'tap':noise(0.05,2500,1500,2,0.1);break;
  case 'eat':tone(320,140,0.06,'square',0.04);tone(300,120,0.06,'square',0.04,0.09);break;
  case 'hurt':tone(220,60,0.35,'sawtooth',0.12);noise(0.2,1200,300,1,0.15,'lowpass');break;
  case 'catjump':noise(0.12,500,200,1,0.06,'lowpass');break;
  case 'pounce':noise(0.18,700,250,1,0.12,'lowpass');break;
  case 'growl':{const t0=AC.currentTime;const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=85;const a=AC.createOscillator();a.frequency.value=28;const ag=AC.createGain();ag.gain.value=0.5;
    const g=AC.createGain();env(g,t0,0.05,0.07,0.55);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=500;a.connect(ag);ag.connect(g.gain);o.connect(f);f.connect(g);g.connect(master);o.start();a.start();o.stop(t0+0.6);a.stop(t0+0.6);break;}
  case 'hiss':noise(0.7,5000,3000,0.8,0.12,'highpass');break;
  case 'win':[523,659,784,1047].forEach((f,i)=>tone(f,f,0.25,'triangle',0.07,i*0.12));break;
  case 'secret':[784,988,1175,1568,1976].forEach((f,i)=>tone(f,f*1.01,0.4,'sine',0.05,i*0.09));break;
  case 'lose':[392,330,262].forEach((f,i)=>tone(f,f*0.97,0.35,'triangle',0.07,i*0.18));break;}}
function meow(v){if(!AC)return;v=v||1;const t0=AC.currentTime,d=0.65;const o=AC.createOscillator();o.type='sawtooth';
  o.frequency.setValueAtTime(480,t0);o.frequency.linearRampToValueAtTime(820,t0+d*0.35);o.frequency.linearRampToValueAtTime(430,t0+d);
  const f=AC.createBiquadFilter();f.type='bandpass';f.Q.value=3;f.frequency.setValueAtTime(900,t0);f.frequency.linearRampToValueAtTime(1800,t0+d*0.4);f.frequency.linearRampToValueAtTime(800,t0+d);
  const g=AC.createGain();env(g,t0,0.06,0.09*v,d);o.connect(f);f.connect(g);g.connect(master);o.start(t0);o.stop(t0+d+0.05);}

/* ---------- Aim: what the crosshair points at ---------- */
const ZIP_R=4.5,PULL_R=3.6;
const AIM={kind:null,t:0,p:V3(),n:V3(),obj:null};
const _ao=new THREE.Vector3(),_oc=new THREE.Vector3();
function sphereT(o,d,c,r,tmin,tmax){_oc.subVectors(c,o);const t=_oc.dot(d);if(t<tmin||t>tmax)return -1;const p2=_oc.lengthSq()-t*t;return p2<r*r?t:-1;}
function computeAim(){
  const d=CAM.aim,o=camera.position;const tmin=o.distanceTo(_piv)+0.01;
  AIM.kind=null;AIM.obj=null;
  _ao.copy(o).addScaledVector(d,tmin);
  let wallT=1e9;
  if(castRay(_ao,d,ZIP_R)){wallT=HIT.t+tmin;AIM.kind='zip';AIM.p.copy(HIT.p);AIM.n.copy(HIT.n);AIM.t=wallT;}
  const assist=COARSE?1.8:1;let best=Math.min(wallT,PULL_R+tmin);
  for(const f of FLIES){if(f.eaten||f.pull)continue;const t=sphereT(o,d,f.pos,0.03*assist,tmin,best);if(t>=0){best=t;AIM.kind='fly';AIM.obj=f;}}
  if(!SP.held)for(const it of ITEMS){if(it.state!=='free')continue;const t=sphereT(o,d,it.pos,(it.r+0.025)*assist,tmin,best);if(t>=0){best=t;AIM.kind='item';AIM.obj=it;}}
  if(catOn){const cc=_a.set(C.pos.x,C.pos.y+0.22,C.pos.z+0);const t=sphereT(o,d,cc,0.2,tmin,best);if(t>=0){best=t;AIM.kind='cat';AIM.obj=cat;}
    const hc=_b.set(C.pos.x+Math.sin(C.yaw)*0.22,C.pos.y+0.3,C.pos.z+Math.cos(C.yaw)*0.22);const t2=sphereT(o,d,hc,0.11,tmin,best);if(t2>=0){best=t2;AIM.kind='cat';AIM.obj=cat;}}
  const cr=$('cross');cr.className=AIM.kind==='zip'?'zip':AIM.kind==='cat'?'cat':(AIM.kind==='fly'||AIM.kind==='item')?'pull':'';
  let tip='';
  if(SP.held)tip='В лапах '+SP.held.name+' · '+(COARSE?'ПРИТЯНУТЬ':'ПКМ')+' — бросить';
  else if(AIM.kind==='fly')tip='Притянуть муху';else if(AIM.kind==='item')tip='Притянуть '+AIM.obj.name;else if(AIM.kind==='cat')tip='Склеить кота паутиной';
  $('aimTip').textContent=tip;}
function clearLine(from,to){_v.subVectors(to,from);const d=_v.length();if(d<1e-4)return true;_v.divideScalar(d);return !castRay(from,_v,d-0.012);}
let webCD=0;
function doZip(){if(webCD>0||SP.mode==='zip')return;
  if(AIM.kind!=='zip'&&!(AIM.kind&&AIM.kind!=='cat')){toast('Слишком далеко для паутины');return;}
  if(AIM.kind!=='zip'){ // aiming at a fly or an item: zip to the surface behind it
    if(!castRay(_ao,CAM.aim,ZIP_R)){toast('Слишком далеко для паутины');return;}AIM.p.copy(HIT.p);AIM.n.copy(HIT.n);}
  const m=spMouth();_v.subVectors(AIM.p,m);const d=_v.length();_v.divideScalar(d);
  let P=AIM.p.clone(),N=AIM.n.clone();
  if(castRay(m,_v,d-0.005)){P=HIT.p.clone();N=HIT.n.clone();}
  if(P.distanceTo(SP.p)<0.03)return;
  SP.mode='zip';SP.zipP.copy(P).addScaledVector(N,0.001);SP.zipN.copy(N);SP.zipSpd=1.2;webCD=0.25;
  webs.length=0;addWeb(spMouth,()=>P,-1);sfx('web');}
function doPull(){if(webCD>0)return;webCD=0.25;
  if(SP.held){const it=SP.held;SP.held=null;it.state='thrown';it.rest=false;it.pos.copy(spMouth()).addScaledVector(CAM.aim,0.03).addScaledVector(SP.n,0.03);
    it.vel.copy(CAM.aim).multiplyScalar(3.4).addScaledVector(UP,0.9);sfx('web');return;}
  const m=spMouth();
  if(AIM.kind==='fly'){const f=AIM.obj;if(!clearLine(m,f.pos)){toast('Мешает препятствие');return;}f.pull=true;addWeb(spMouth,()=>f.pos,0.5);sfx('web');return;}
  if(AIM.kind==='item'){const it=AIM.obj;if(!clearLine(m,it.pos)){toast('Мешает препятствие');return;}it.state='pulled';it.rest=false;addWeb(spMouth,()=>it.pos,it.big?1.5:0.7);sfx('web');return;}
  if(AIM.kind==='cat'){const cc=V3(C.pos.x,C.pos.y+0.22,C.pos.z);addWeb(spMouth,()=>V3(C.pos.x,C.pos.y+0.22,C.pos.z),0.6);sfx('web');webCat();if(C.state==='stuck')catMsg('Кот запутался в паутине!');return;}
  if(AIM.kind==='zip'){const P=AIM.p.clone();addWeb(spMouth,()=>P,0.25);sfx('web');toast('Это не сдвинуть. Притянуться к месту — синяя кнопка / ЛКМ');return;}
  toast('Нечего притянуть');}
function hitSpider(){if(SP.inv>0)return;SP.hp--;SP.inv=1.8;sfx('hurt');
  $('hurt').style.opacity=1;setTimeout(()=>$('hurt').style.opacity=0,260);
  if(SP.held){const it=SP.held;SP.held=null;it.state='free';it.rest=false;it.vel.set(rnd(-.5,.5),0.6,rnd(-.5,.5));}
  _v.set(SP.p.x-C.pos.x,0,SP.p.z-C.pos.z).normalize();SP.mode='air';SP.v.copy(_v).multiplyScalar(1.3);SP.v.y=1.4;SP.airT=0;
  if(SP.hp<=0)setTimeout(()=>endGame(false),400);else toast('Кот задел паука! Осталось '+SP.hp+' ♥');}
function eatFly(f){f.eaten=true;f.pull=false;f.mesh.visible=false;sfx('eat');
  if(f.gold){SP.hp=Math.min(3,SP.hp+1);toast('Золотая муха! +1 ♥');return;}
  flyEaten++;
  if(flyEaten>=FLY_SPOTS.length){if(mode==='hunt')setTimeout(()=>endGame(true),300);else toast('Все мухи пойманы!');}
  else toast('Муха поймана: '+flyEaten+' из '+FLY_SPOTS.length);}

/* ---------- Input: keyboard + mouse, touch, gamepad ---------- */
const keys=new Set();
const IN={lookX:0,lookY:0,zip:false,pull:false,jump:false,runT:false};
addEventListener('keydown',e=>{if(e.repeat)return;keys.add(e.code);
  if(!running)return;
  if(e.code==='Space'){IN.jump=true;e.preventDefault();}
  if(e.code==='KeyQ')IN.zip=true;if(e.code==='KeyE'||e.code==='KeyF')IN.pull=true;
  if(e.code==='KeyR')resetPos();
  if(e.code==='Escape'||e.code==='KeyP'){if(!paused)pause();}});
addEventListener('keyup',e=>keys.delete(e.code));
const cv=renderer.domElement;
let locked=false;
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===cv;if(!locked&&running&&!paused&&!COARSE)pause();});
cv.addEventListener('mousedown',e=>{audioInit();if(!running||paused||COARSE)return;
  if(!locked){cv.requestPointerLock&&cv.requestPointerLock();return;}
  if(e.button===0)IN.zip=true;if(e.button===2)IN.pull=true;});
cv.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{if(locked){IN.lookX+=e.movementX;IN.lookY+=e.movementY;}});
// touch: left stick + right-side look pad + buttons
const stick={id:null,x:0,y:0,cx:0,cy:0};
const stEl=$('stL'),knob=stEl.querySelector('i');
stEl.addEventListener('touchstart',e=>{audioInit();const t=e.changedTouches[0];const r=stEl.getBoundingClientRect();stick.id=t.identifier;stick.cx=r.left+r.width/2;stick.cy=r.top+r.height/2;moveStick(t);e.preventDefault();},{passive:false});
function moveStick(t){let dx=t.clientX-stick.cx,dy=t.clientY-stick.cy;const l=Math.hypot(dx,dy),R=58;if(l>R){dx*=R/l;dy*=R/l;}stick.x=dx/R;stick.y=dy/R;knob.style.transform=`translate(${dx}px,${dy}px)`;}
addEventListener('touchmove',e=>{for(const t of e.changedTouches){if(t.identifier===stick.id)moveStick(t);if(t.identifier===look.id){IN.lookX+=(t.clientX-look.x)*1.6;IN.lookY+=(t.clientY-look.y)*1.6;look.x=t.clientX;look.y=t.clientY;}}},{passive:false});
function endTouch(e){for(const t of e.changedTouches){if(t.identifier===stick.id){stick.id=null;stick.x=stick.y=0;knob.style.transform='';}if(t.identifier===look.id)look.id=null;}}
addEventListener('touchend',endTouch);addEventListener('touchcancel',endTouch);
const look={id:null,x:0,y:0};
$('lookPad').addEventListener('touchstart',e=>{audioInit();const t=e.changedTouches[0];look.id=t.identifier;look.x=t.clientX;look.y=t.clientY;e.preventDefault();},{passive:false});
const tbtn=(id,fn)=>$(id).addEventListener('touchstart',e=>{audioInit();fn();e.preventDefault();e.stopPropagation();},{passive:false});
tbtn('bZip',()=>IN.zip=true);tbtn('bPull',()=>IN.pull=true);tbtn('bJump',()=>IN.jump=true);
tbtn('bRun',()=>{IN.runT=!IN.runT;$('bRun').classList.toggle('on',IN.runT);});
tbtn('bPause',()=>pause());$('bPause').onclick=()=>pause();
let padPrev=[];
function readPad(dt,inp){const ps=navigator.getGamepads?navigator.getGamepads():[];let p=null;for(const q of ps)if(q){p=q;break;}if(!p)return;
  const dz=v=>Math.abs(v)<0.15?0:v;
  if(dz(p.axes[0])||dz(p.axes[1])){inp.mx=dz(p.axes[0]);inp.my=-dz(p.axes[1]);}
  inp.yaw+=dz(p.axes[2]||0)*dt*2.8*S.sens;inp.pitch+=dz(p.axes[3]||0)*dt*2.2*S.sens;
  const b=i=>p.buttons[i]&&p.buttons[i].pressed,e=i=>b(i)&&!padPrev[i];
  if(e(0))IN.jump=true;if(e(7)||e(5))IN.zip=true;if(e(6)||e(4)||e(2))IN.pull=true;if(b(1)||b(10))inp.run=true;if(e(9))pause();
  padPrev=p.buttons.map(x=>x.pressed);}
function readInput(dt){
  const inp={mx:0,my:0,run:false,jump:false,yaw:0,pitch:0};
  inp.my=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  inp.mx=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  if(keys.has('ArrowLeft'))inp.yaw-=dt*2.2;if(keys.has('ArrowRight'))inp.yaw+=dt*2.2;
  inp.run=keys.has('ShiftLeft')||keys.has('ShiftRight')||IN.runT;
  if(stick.id!==null){inp.mx=stick.x;inp.my=-stick.y;if(Math.hypot(stick.x,stick.y)>0.95&&!COARSE)inp.run=true;}
  const k=0.0026*S.sens;inp.yaw+=IN.lookX*k;inp.pitch+=IN.lookY*k;IN.lookX=IN.lookY=0;
  readPad(dt,inp);
  inp.jump=IN.jump;IN.jump=false;
  return inp;}

/* ---------- UI screens ---------- */
let running=false,paused=false,mode='hunt',tGame=0;
function show(id){['sMenu','sSet','sHelp','sPause','sRes'].forEach(s=>$(s).hidden=s!==id);}
let toastT=0;function toast(t){const el=$('toast');el.textContent=t;el.style.opacity=1;toastT=2.2;}
function fmt(t){t=Math.floor(t);return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');}
function menu(){running=false;paused=false;show('sMenu');$('hud').hidden=true;$('touch').hidden=true;catMsg('');
  $('secretBadge').hidden=!S.secret;
  const tl=$('taskList');tl.innerHTML='';
  const card=(tag,title,txt,best,fn)=>{const b=document.createElement('button');b.className='task';b.innerHTML=`<span class="tag">${tag}</span><b>${title}</b><span>${txt}</span>${best?`<span class="best">${best}</span>`:''}`;b.onclick=fn;tl.appendChild(b);};
  card('С КОТОМ · 3 ♥','Охота на мух','Поймай все 14 мух в комнате. Кот охотится на тебя, прячься выше, под кроватью или на ковре.',S.best?'Лучшее время: '+fmt(S.best):'',()=>startGame('hunt'));
  card('БЕЗ КОТА','Прогулка','Исследуй комнату: стены, потолок, шкаф, стол. Найди секретную зону.','',()=>startGame('free'));}
function startGame(m){audioInit();mode=m;catOn=m==='hunt';
  resetSpider();resetFlies();resetCat();resetItems();tGame=0;webs.length=0;
  running=true;paused=false;show(null);$('hud').hidden=false;$('touch').hidden=!COARSE;
  toast(m==='hunt'?'Лови мух! Кот где-то рядом…':'Прогулка: кота нет, ищи секрет');
  if(!COARSE&&cv.requestPointerLock)cv.requestPointerLock();}
function pause(){if(!running)return;paused=true;show('sPause');if(locked)document.exitPointerLock();}
function resume(){paused=false;show(null);if(!COARSE&&cv.requestPointerLock)cv.requestPointerLock();}
function endGame(win){if(!running)return;running=false;if(locked)document.exitPointerLock();$('hud').hidden=true;$('touch').hidden=true;catMsg('');
  show('sRes');
  if(win){sfx('win');const t=tGame;const stars=(t<240&&SP.hp===3)?3:(t<420||SP.hp>=2)?2:1;
    if(!S.best||t<S.best){S.best=t;save();}
    $('rTitle').textContent='Все мухи пойманы!';$('rStars').innerHTML='★'.repeat(stars)+'<i>'+'★'.repeat(3-stars)+'</i>';$('rVal').textContent=fmt(t);
    $('rText').textContent='Сердец осталось: '+SP.hp+'. Лучшее время: '+fmt(S.best)+'.'+(S.secret?'':' А секретную зону ты нашёл? Посмотри внимательно на рюкзак.');}
  else{sfx('lose');$('rTitle').textContent='Кот поймал паука';$('rStars').innerHTML='<i>★★★</i>';$('rVal').textContent='Мух: '+flyEaten+' из '+FLY_SPOTS.length;
    $('rText').textContent='Совет: кот достаёт только низко. Бегай по стенам повыше и по потолку, а на ковре с конструктором можно отдохнуть и вылечиться.';}}
$('pResume').onclick=resume;$('pRestart').onclick=()=>startGame(mode);$('pMenu').onclick=menu;$('pSet').onclick=()=>{setFrom='sPause';openSet();};
$('rAgain').onclick=()=>startGame(mode);$('rMenu').onclick=menu;
let setFrom='sMenu';
$('mSet').onclick=()=>{setFrom='sMenu';openSet();};$('mHelp').onclick=()=>show('sHelp');$('helpBack').onclick=()=>show('sMenu');
$('setBack').onclick=()=>show(setFrom);
function openSet(){show('sSet');syncSet();}
function syncSet(){document.querySelectorAll('.seg').forEach(seg=>{const k=seg.dataset.k;seg.querySelectorAll('button').forEach(b=>b.classList.toggle('on',String(S[k])===b.dataset.v));});
  document.querySelectorAll('input[type=range]').forEach(r=>{r.value=S[r.dataset.k];});$('vSens').textContent=(+S.sens).toFixed(1);
  $('skinNote').textContent=S.secret?'':'Золотой паук откроется, когда найдёшь секретную зону.';}
document.querySelectorAll('.seg').forEach(seg=>seg.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=seg.dataset.k,v=b.dataset.v;
  if(k==='skin'&&v==='gold'&&!S.secret){toast('Сначала найди секретную зону');return;}
  const old=S[k];S[k]=v;save();syncSet();
  if(k==='skin')setSkin();
  if(k==='q'&&old!==v){toast('Перезагружаю с новой графикой…');setTimeout(()=>location.reload(),600);}
  if(k==='snd'){if(v==='1')audioInit();else if(AC){AC.close();AC=null;}}}));
document.querySelectorAll('input[type=range]').forEach(r=>r.addEventListener('input',()=>{S[r.dataset.k]=+r.value;save();syncSet();}));

/* ---------- Items reset ---------- */
let ITEM0=null;
function resetItems(){if(!ITEM0)ITEM0=ITEMS.map(it=>it.pos.clone());ITEMS.forEach((it,i)=>{it.pos.copy(ITEM0[i]);it.vel.set(0,0,0);it.rest=true;it.state='free';it.mesh.position.copy(it.pos);it.mesh.rotation.set(0,0,0);});SP.held=null;}

/* ---------- Build and main loop ---------- */
buildRoom();buildBackpack();buildBricks();buildItems();buildFlies();buildGrid();buildDust();setSkin();
resetSpider();resetCat();resetItems();
if(loading<=0)$('load').hidden=true;
menu();
let last=performance.now(),secretShown=false,tAll=0;
function frame(now){requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;if(dt>0.05)dt=0.05;if(dt<=0)return;tAll+=dt;
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').style.opacity=0;}
  if(running&&!paused){
    tGame+=dt;webCD-=dt;
    const inp=readInput(dt);
    if(IN.zip){IN.zip=false;doZip();}if(IN.pull){IN.pull=false;doPull();}
    stepSpider(dt,inp);
    updItems(dt);updFlies(dt,tAll);updCat(dt,tAll);updWebs(dt);
    if(SP.safe&&SP.hp<3){SP.healT+=dt;if(SP.healT>5){SP.healT=0;SP.hp++;toast('Отдохнул на ковре: +1 ♥');}}else SP.healT=0;
    if(SP.inPack){if(SECRET.light)SECRET.light.intensity=lerp(SECRET.light.intensity,1.6,dt*3);
      if(!secretShown){secretShown=true;sfx('secret');toast('★ СЕКРЕТНАЯ ЗОНА! Ты внутри рюкзака. Золотой паук открыт');if(!S.secret){S.secret=true;save();}}}
    else if(SECRET.light)SECRET.light.intensity=lerp(SECRET.light.intensity,0,dt*3);
    updCamera(dt);computeAim();
    // HUD
    $('hearts').innerHTML='♥'.repeat(Math.max(0,SP.hp))+'<i>'+'♥'.repeat(Math.max(0,3-SP.hp))+'</i>';
    $('flies').innerHTML='Мухи: <b>'+flyEaten+'</b> / '+FLY_SPOTS.length;
    $('htime').textContent=fmt(tGame);$('safe').hidden=!(SP.safe||SP.inPack);$('safe').textContent=SP.inPack?'СЕКРЕТНАЯ ЗОНА':'БЕЗОПАСНО · кот не достанет';
    $('hheld').textContent=catOn?({wander:'кот гуляет',sleep:'кот спит',hunt:'КОТ ОХОТИТСЯ',watch:'кот ждёт внизу',crouch:'КОТ ГОТОВИТСЯ К ПРЫЖКУ',pounce:'ПРЫЖОК!',stuck:'кот в паутине',scared:'кот убегает',toy:'кот играет'}[C.state]||''):'';
    // fly buzz louder when a fly is near the camera
    if(buzzG){let nd=9;for(const f of FLIES)if(!f.eaten)nd=Math.min(nd,f.pos.distanceTo(camera.position));buzzG.gain.value=lerp(buzzG.gain.value,clamp(0.05-nd*0.06,0,0.05),0.1);}
  }else if(!running){
    // menu: slow orbit around the room
    const a=tAll*0.08;camera.position.set(2.35+Math.cos(a)*1.3,1.25+Math.sin(a*0.7)*0.25,2.05+Math.sin(a)*1.2);camera.up.set(0,1,0);camera.lookAt(2.35,0.5,2.05);
    updFlies(dt,tAll);if(catOn||true){cat.visible=true;}updCatIdle(dt,tAll);
    if(buzzG)buzzG.gain.value=0;
  }
  if(dust){dust.rotation.y=Math.sin(tAll*0.05)*0.02;dust.position.y=Math.sin(tAll*0.3)*0.01;}
  if(SECRET.hint)SECRET.hint.material.opacity=0.2+Math.sin(tAll*2.4)*0.15;
  renderer.render(scene,camera);
}
// in the menu the cat just strolls around
function updCatIdle(dt,t){const keep=running;const sv=catOn;catOn=true;if(C.state==='hunt'||C.state==='watch'||C.state==='crouch'||C.state==='pounce'){C.state='wander';pickWander();}updCat(dt,t);catOn=sv;}
requestAnimationFrame(frame);
window.__P={SP,C,FLIES,ITEMS,SOL,startGame,castRay,HIT,IN,keys,PLAT,spiderAccess,get running(){return running;}};
// test hook: run the simulation with fixed steps (headless browsers are slow)
window.__P.sim=(n,dt,inp,noCat)=>{for(let i=0;i<n;i++){tAll+=dt;const k=Object.assign({mx:0,my:0,run:false,jump:false,yaw:0,pitch:0},inp);if(i>0)k.jump=false;
  stepSpider(dt,k);updItems(dt);updFlies(dt,tAll);if(!noCat)updCat(dt,tAll);updWebs(dt);updCamera(dt);}computeAim();
  return {p:SP.p.toArray().map(v=>+v.toFixed(3)),n:SP.n.toArray().map(v=>+v.toFixed(2)),f:SP.f.toArray().map(v=>+v.toFixed(2)),mode:SP.mode,aim:AIM.kind,cat:C.state,hp:SP.hp};};
window.__P.zip=()=>{computeAim();doZip();};window.__P.pull=()=>{computeAim();doPull();};
window.__P.setSP=(p,n,f,pitch)=>{SP.p.set(...p);SP.n.set(...n).normalize();SP.f.set(...f).normalize();SP.mode='surf';if(pitch!=null)SP.pitch=pitch;camSnap=true;updCamera(0.016);computeAim();};
