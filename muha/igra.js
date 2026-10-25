"use strict";
// «Муха»: a fly-sized FPV drone in a giant copy of a real room.
// Flight model, input and OSD come from the drone game «Операторы дронов» (fpv/); the room is rebuilt from photos.
if(!window.THREE){document.body.innerHTML='<p style="padding:24px">Не загрузился 3D-движок (three.min.js). Обнови страницу.</p>';throw new Error('no three');}
const $=id=>document.getElementById(id);
const VERSION='1.0 от 25.10.2026'; // bump on every release so testers can tell builds apart
document.querySelectorAll('.ver').forEach(e=>e.textContent='Версия '+VERSION);
document.title='Муха · v'+VERSION.split(' ')[0];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const G=9.81;
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ---------- Scale: the room is built in real metres, then blown up K times ---------- */
const K=30;                     // 1 real metre = 30 game metres: the drone is about 1.5 cm in the real room
const RW=3.0, RD=4.0, RH=2.6;   // room: west-east width, north-south depth, height (real metres); window = north wall z=0
const NOV_SPD=2.2;              // novice mode flies faster: the room is huge
const CRASH_V=7;                // hits slower than this only bounce

/* ---------- Saved settings and results ---------- */
const KEY='muha.v1';
const DEF={mode:'nov',cam:'fpv',tilt:15,rate:560,expo:0.35,q:(matchMedia('(pointer:coarse)').matches?'0':'1'),fx:'1',pad:null,best:{},stars:{}};
let S=Object.assign({},DEF);
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s)S=Object.assign({},DEF,s,{best:Object.assign({},s.best||{}),stars:Object.assign({},s.stars||{})});}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

/* ---------- Renderer, scene, cameras ---------- */
const renderer=new THREE.WebGLRenderer({antialias:S.q!=='0',powerPreference:'high-performance'});
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x07090b);
scene.fog=new THREE.Fog(0x1a1712,80,330);
const camFPV=new THREE.PerspectiveCamera(80,1,0.03,500);
const camExt=new THREE.PerspectiveCamera(60,1,0.05,500);
const ANISO=Math.min(8,renderer.capabilities.getMaxAnisotropy());

let composer=null,renderPass=null;
const GRADE={uniforms:{tDiffuse:{value:null}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;'+
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}'+
    'void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;c=aces(c*0.72);c=c*c*(3.0-2.0*c)*0.3+c*0.7;'+
    'c=mix(c,c*vec3(1.03,1.0,0.95),0.5);'+
    'vec2 d=vUv-0.5;c*=1.0-dot(d,d)*0.6;'+
    'c=mix(12.92*c,1.055*pow(c,vec3(1.0/2.4))-0.055,step(0.0031308,c));gl_FragColor=vec4(c,1.0);}'};
function setTM(tm){if(renderer.toneMapping===tm)return;renderer.toneMapping=tm;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true;});}
function setupPost(){
  composer=null;setTM(THREE.ACESFilmicToneMapping);
  if(+S.q<1||!renderer.capabilities.isWebGL2||!THREE.EffectComposer||!THREE.UnrealBloomPass)return;
  try{
    const q=+S.q,RT=q>=2&&THREE.WebGLMultisampleRenderTarget?THREE.WebGLMultisampleRenderTarget:THREE.WebGLRenderTarget;
    const rt=new RT(innerWidth,innerHeight,{type:THREE.HalfFloatType});if(rt.samples!==undefined)rt.samples=q>=3?8:4;
    composer=new THREE.EffectComposer(renderer,rt);
    renderPass=new THREE.RenderPass(scene,camFPV);composer.addPass(renderPass);
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth/(q>=3?1:2),innerHeight/(q>=3?1:2)),0.45,0.5,1.0));
    composer.addPass(new THREE.ShaderPass(GRADE));
    setTM(THREE.NoToneMapping); // r128 tone-maps into render targets too, GRADE does it once at the end
  }catch(e){composer=null;}
}
function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);}
  for(const c of [camFPV,camExt]){c.aspect=w/h;c.updateProjectionMatrix();}
}
addEventListener('resize',resize);

/* ---------- Textures: photo patches from the real room + procedural ones ---------- */
const loader=new THREE.TextureLoader();
let loading=0;
function photo(name,rep){loading++;const t=loader.load('tex/'+name+'.jpg?v=1',()=>{if(--loading<=0)$('load').hidden=true;},undefined,()=>{if(--loading<=0)$('load').hidden=true;});
  t.encoding=THREE.sRGBEncoding;t.anisotropy=ANISO;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}return t;}
function canvasTex(w,h,draw,rep){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=ANISO;
  if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}
  return t;
}
function noiseFill(g,w,h,base,n,a){
  g.fillStyle=base;g.fillRect(0,0,w,h);
  for(let i=0;i<n;i++){const v=Math.random()*255|0;g.fillStyle=`rgba(${v},${v},${v},${Math.random()*a})`;const s=1+Math.random()*3;g.fillRect(Math.random()*w,Math.random()*h,s,s);}
}
// laminate: 6 planks of 20 cm across a 1.2 x 1.2 m tile, planks run north-south
function plankTex(pal,rep){return canvasTex(1024,1024,(g,w,h)=>{const pw=w/6;
  for(let i=0;i<6;i++){const off=((i*397)%5)/5*h;
    for(let k=-1;k<1;k++){const y0=off+k*h;
      g.fillStyle=pal[(i*3+k+5)%pal.length];g.fillRect(i*pw,y0,pw,h);
      for(let s=0;s<34;s++){g.strokeStyle=`rgba(50,25,8,${Math.random()*.13})`;g.lineWidth=1+Math.random()*2.5;g.beginPath();let x=i*pw+Math.random()*pw;g.moveTo(x,y0);
        for(let y=y0;y<=y0+h;y+=32){x+=(Math.random()-.5)*5;g.lineTo(clamp(x,i*pw,i*pw+pw),y);}g.stroke();}
      g.fillStyle='rgba(25,12,4,.55)';g.fillRect(i*pw,y0+h-3,pw,3);}
    g.fillStyle='rgba(25,12,4,.5)';g.fillRect(i*pw,0,2,h);}
},rep);}
const texFloor=plankTex(['#b9814a','#a8723f','#c08a52','#ad7742','#b47c46'],[RW/1.2,RD/1.2]);
const texFloorHall=plankTex(['#9a9a96','#a4a4a0','#8f908c','#a9a8a3','#959591'],[3.6/1.2,3.45/1.2]);
const texOboi=photo('oboi',[1/1.3,1/1.22]);
const texFleece=canvasTex(256,256,(g,w,h)=>noiseFill(g,w,h,'#5c5d60',6000,.14),[6,6]);
const texWood=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#8c5a32';g.fillRect(0,0,w,h);
  for(let s=0;s<60;s++){g.strokeStyle=`rgba(60,30,10,${Math.random()*.25})`;g.lineWidth=1+Math.random()*2;g.beginPath();let y=Math.random()*h;g.moveTo(0,y);for(let x=0;x<=w;x+=16){y+=(Math.random()-.5)*3;g.lineTo(x,y);}g.stroke();}},[2,2]);
const texBeige=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#dcd3c4';g.fillRect(0,0,w,h);
  for(let s=0;s<50;s++){g.strokeStyle=`rgba(150,130,100,${Math.random()*.15})`;g.lineWidth=1;g.beginPath();let x=Math.random()*w;g.moveTo(x,0);for(let y=0;y<=h;y+=16){x+=(Math.random()-.5)*2;g.lineTo(x,y);}g.stroke();}});
const texGlow=canvasTex(128,128,(g)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,250,210,.55)');r.addColorStop(1,'rgba(255,250,210,0)');g.fillStyle=r;g.fillRect(0,0,128,128);});
const texBlob=canvasTex(128,128,(g)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(0,0,0,.8)');r.addColorStop(.6,'rgba(0,0,0,.3)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);});
// night outside the window: dark sky, a few houses with lit windows
const texNight=canvasTex(512,512,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#04060c');gr.addColorStop(1,'#141a26');g.fillStyle=gr;g.fillRect(0,0,w,h);
  for(let i=0;i<60;i++){g.fillStyle=`rgba(255,255,255,${Math.random()*.6})`;g.fillRect(Math.random()*w,Math.random()*h*.4,1.5,1.5);}
  for(let b=0;b<5;b++){const x=b*110-10+Math.random()*30,bw=80+Math.random()*30,top=h*(.45+Math.random()*.2);g.fillStyle='#080a10';g.fillRect(x,top,bw,h-top);
    for(let y=top+10;y<h-10;y+=22)for(let xx=x+8;xx<x+bw-10;xx+=18)if(Math.random()<.22){g.fillStyle=Math.random()<.5?'#e8c070':'#9fc0e0';g.fillRect(xx,y,9,12);}}});
// TV picture: a simple bright cartoon landscape, redrawn a few times per second
const tvCan=document.createElement('canvas');tvCan.width=256;tvCan.height=160;const tvG=tvCan.getContext('2d');
const texTV=new THREE.CanvasTexture(tvCan);texTV.encoding=THREE.sRGBEncoding;
function drawTV(t){const g=tvG,w=256,h=160;
  const sky=g.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#3aa0ff');sky.addColorStop(1,'#bfe6ff');g.fillStyle=sky;g.fillRect(0,0,w,h);
  g.fillStyle='#ffd84a';g.beginPath();g.arc(200,34,18,0,7);g.fill();
  g.fillStyle='#fff';for(let i=0;i<3;i++){const x=((t*12+i*110)%(w+80))-40;g.beginPath();g.arc(x,30+i*12,12,0,7);g.arc(x+14,26+i*12,15,0,7);g.arc(x+30,30+i*12,11,0,7);g.fill();}
  g.fillStyle='#45b84a';g.beginPath();g.moveTo(0,h);for(let x=0;x<=w;x+=8)g.lineTo(x,112+Math.sin(x/30)*10);g.lineTo(w,h);g.fill();
  g.fillStyle='#2f8e3a';g.beginPath();g.moveTo(0,h);for(let x=0;x<=w;x+=8)g.lineTo(x,130+Math.sin(x/22+2)*8);g.lineTo(w,h);g.fill();
  const bx=40+((t*50)%180),by=118-Math.abs(Math.sin(t*4))*40;g.fillStyle='#ff4a6a';g.beginPath();g.arc(bx,by,10,0,7);g.fill();
  g.fillStyle='#fff';g.beginPath();g.arc(bx+3,by-3,3,0,7);g.fill();
  texTV.needsUpdate=true;}
drawTV(0);
const texLapScreen=canvasTex(256,170,(g,w,h)=>{g.fillStyle='#0d1420';g.fillRect(0,0,w,h);g.fillStyle='#16233a';g.fillRect(0,0,w,12);
  const cols=['#7cc6ff','#e0e6ee','#ffcf6a','#8fe39a','#c69cff'];
  for(let y=20;y<h-6;y+=7){let x=8+(Math.random()*3|0)*10;while(x<w-20&&Math.random()<.85){const l=8+Math.random()*40;g.fillStyle=cols[Math.random()*cols.length|0];g.globalAlpha=.8;g.fillRect(x,y,l,3);x+=l+5;}}g.globalAlpha=1;});
const texKeys=canvasTex(256,128,(g,w,h)=>{g.fillStyle='#1b1d22';g.fillRect(0,0,w,h);
  for(let r=0;r<5;r++)for(let c=0;c<14;c++){g.fillStyle='#0c0d10';g.fillRect(8+c*17.5,8+r*16,15,13);g.fillStyle='rgba(60,200,255,.85)';g.fillRect(12+c*17.5,12+r*16,6,2);}
  g.fillStyle='#24272d';g.fillRect(90,92,76,30);});
const texSynth=canvasTex(512,128,(g,w,h)=>{g.fillStyle='#16171a';g.fillRect(0,0,w,h);g.fillStyle='#f4f4f0';for(let i=0;i<24;i++)g.fillRect(14+i*20.3,50,18,72);
  g.fillStyle='#000';for(let i=0;i<23;i++)if([0,1,3,4,5].includes(i%7))g.fillRect(14+i*20.3+13,50,11,44);
  g.fillStyle='#e03030';g.fillRect(20,14,10,10);g.fillStyle='#3a8fe0';g.fillRect(40,14,10,10);g.fillStyle='#59606a';for(let i=0;i<10;i++)g.fillRect(180+i*28,16,18,8);});
const texPlaid=canvasTex(128,128,(g,w,h)=>{g.fillStyle='#f0f0ee';g.fillRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.55)';for(let i=0;i<8;i+=2){g.fillRect(i*16,0,16,h);g.fillRect(0,i*16,w,16);}},[3,3]);

/* ---------- Materials ---------- */
const M={
  oboi:new THREE.MeshStandardMaterial({map:texOboi,roughness:.85}),
  floor:new THREE.MeshStandardMaterial({map:texFloor,roughness:.45,metalness:0}),
  hallFloor:new THREE.MeshStandardMaterial({map:texFloorHall,roughness:.5,side:THREE.BackSide}),
  hallWall:new THREE.MeshStandardMaterial({color:0xe6e3dc,roughness:.9,side:THREE.BackSide}),
  hallWallF:new THREE.MeshStandardMaterial({color:0xe6e3dc,roughness:.9}),
  white:new THREE.MeshStandardMaterial({color:0xefeeea,roughness:.45}),
  pvc:new THREE.MeshStandardMaterial({color:0xf3f3f1,roughness:.3}),
  wood:new THREE.MeshStandardMaterial({map:texWood,roughness:.55}),
  beige:new THREE.MeshStandardMaterial({map:texBeige,roughness:.5}),
  alu:new THREE.MeshStandardMaterial({color:0xb8bcc0,roughness:.3,metalness:.8}),
  black:new THREE.MeshStandardMaterial({color:0x111214,roughness:.35,metalness:.2}),
  darkgrey:new THREE.MeshStandardMaterial({color:0x2a2c30,roughness:.5,metalness:.3}),
  plinth:new THREE.MeshStandardMaterial({color:0x4a3220,roughness:.6}),
  sheet:new THREE.MeshStandardMaterial({color:0x86a0bc,roughness:.9}),
  fleece:new THREE.MeshStandardMaterial({map:texFleece,roughness:1,side:THREE.DoubleSide}),
  pillow:new THREE.MeshStandardMaterial({color:0xe9e2d2,roughness:.95}),
  blind:new THREE.MeshStandardMaterial({color:0x9ea83e,roughness:.9,side:THREE.DoubleSide}),
  glass:new THREE.MeshStandardMaterial({color:0x6d8494,roughness:.05,metalness:.6,transparent:true,opacity:.35,depthWrite:false}),
  night:new THREE.MeshBasicMaterial({map:texNight}),
  tv:new THREE.MeshBasicMaterial({map:texTV,color:new THREE.Color(1.25,1.25,1.25)}),
  lapScreen:new THREE.MeshBasicMaterial({map:texLapScreen,color:new THREE.Color(1.2,1.2,1.2)}),
  keys:new THREE.MeshStandardMaterial({map:texKeys,roughness:.6,emissive:0xffffff,emissiveMap:texKeys,emissiveIntensity:.5}),
  synth:new THREE.MeshStandardMaterial({map:texSynth,roughness:.5}),
  plaid:new THREE.MeshStandardMaterial({map:texPlaid,roughness:.95,side:THREE.DoubleSide}),
  lamp:new THREE.MeshBasicMaterial({color:new THREE.Color(0xfff6e6).multiplyScalar(6)}),
  ceiling:new THREE.MeshStandardMaterial({color:0x121820,roughness:.12,metalness:.1}),
  ceilWhite:new THREE.MeshStandardMaterial({color:0xf5f5f2,roughness:.5}),
  blue:new THREE.MeshStandardMaterial({color:0x2f6fe0,roughness:.4}),
  teal:new THREE.MeshStandardMaterial({color:0x2a9a9a,roughness:.7}),
  gold:new THREE.MeshStandardMaterial({color:0xb08a3a,roughness:.35,metalness:.7}),
  frameW:new THREE.MeshStandardMaterial({color:0xf2f2f0,roughness:.4}),
  red:new THREE.MeshStandardMaterial({color:0xd8402a,roughness:.5}),
};
const pic=n=>new THREE.MeshStandardMaterial({map:photo(n),roughness:.7});

/* ---------- Room building helpers (real metres inside a group scaled by K) ---------- */
const room=new THREE.Group();room.scale.setScalar(K);scene.add(room);
const boxes=[];                  // solid AABBs in game metres: {min,max}
function solid(x0,x1,y0,y1,z0,z1){boxes.push({min:V3(x0*K,y0*K,z0*K),max:V3(x1*K,y1*K,z1*K)});}
function add(geo,mat,x,y,z,o){o=o||{};const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);
  if(o.rx)m.rotation.x=o.rx;if(o.ry)m.rotation.y=o.ry;if(o.rz)m.rotation.z=o.rz;
  m.castShadow=!o.noCast;m.receiveShadow=true;(o.par||room).add(m);return m;}
function box(x0,x1,y0,y1,z0,z1,mat,o){o=o||{};const m=add(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),mat,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,o);
  if(o.solid!==false)solid(x0,x1,y0,y1,z0,z1);return m;}
// flat wall with rectangular holes; UV = metres, so the wallpaper keeps its real size
function wallGeo(w,h,holes){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(w,0);s.lineTo(w,h);s.lineTo(0,h);s.closePath();
  for(const hl of holes||[]){const p=new THREE.Path();p.moveTo(hl[0],hl[1]);p.lineTo(hl[0],hl[3]);p.lineTo(hl[2],hl[3]);p.lineTo(hl[2],hl[1]);p.closePath();s.holes.push(p);}
  return new THREE.ShapeGeometry(s);}
// a soft surface (blanket, duvet): a grid whose height comes from fn(x,z) in metres
function softGeo(x0,x1,z0,z1,n,fn){const g=new THREE.PlaneGeometry(x1-x0,z1-z0,n,n);g.rotateX(-Math.PI/2);
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+(x0+x1)/2,z=p.getZ(i)+(z0+z1)/2;p.setY(i,fn(x,z));}
  g.translate((x0+x1)/2,0,(z0+z1)/2);g.computeVertexNormals();return g;}
const bump=(x,z,cx,cz,r,h)=>h*Math.exp(-((x-cx)*(x-cx)+(z-cz)*(z-cz))/(r*r));

const WIN=[0.8,0.85,2.0,2.15];   // window hole in the north wall: x0,y0,x1,y1
const DOOR=[2.05,2.85,2.05];     // doorway in the south wall: x0,x1,top
const HALL=[1.0,4.6,4.15,7.6];   // corridor behind the door: x0,x1,z0,z1
let ceiling=null;
const anim={};                   // moving bits: tv screen time, etc.

function buildRoom(){
  // floor (also under the door threshold)
  const fl=add(new THREE.PlaneGeometry(RW,RD+0.15),M.floor,RW/2,0,(RD+0.15)/2,{rx:-Math.PI/2,noCast:true});
  // walls: wallpaper from the photos
  add(wallGeo(RW,RH,[WIN]),M.oboi,0,0,0,{noCast:true});                                         // north, window
  add(wallGeo(RW,RH,[[RW-DOOR[1],0,RW-DOOR[0],DOOR[2]]]),M.oboi,RW,0,RD,{ry:Math.PI,noCast:true}); // south, door
  add(wallGeo(RD,RH),M.oboi,0,0,RD,{ry:Math.PI/2,noCast:true});                                    // west
  add(wallGeo(RD,RH),M.oboi,RW,0,0,{ry:-Math.PI/2,noCast:true});                                   // east
  // wall solids (20 cm thick, outside the room)
  solid(-0.3,0,0,RH,-0.5,4.2);solid(RW,RW+0.3,0,RH,-0.5,4.15);
  solid(0,WIN[0],0,RH,-0.5,0);solid(WIN[2],RW,0,RH,-0.5,0);solid(WIN[0],WIN[2],0,WIN[1],-0.5,0);solid(WIN[0],WIN[2],WIN[3],RH,-0.5,0);
  solid(0,DOOR[0],0,RH,RD,HALL[2]);solid(DOOR[1],4.8,0,RH,RD,HALL[2]);solid(DOOR[0],DOOR[1],DOOR[2],RH,RD,HALL[2]);
  // baseboards
  const pb=0.06,pt=0.015;
  box(0,RW,0,pb,0,pt,M.plinth);box(0,pt,0,pb,0,RD,M.plinth);box(RW-pt,RW,0,pb,0,RD,M.plinth);
  box(1.45,DOOR[0]-0.07,0,pb,RD-pt,RD,M.plinth);box(DOOR[1]+0.07,RW,0,pb,RD-pt,RD,M.plinth);
  // ceiling edge: thin white strip like in the photos
  const ce=0.02;box(0,RW,RH-ce,RH,0,0.01,M.ceilWhite,{noCast:true});box(0,RW,RH-ce,RH,RD-0.01,RD,M.ceilWhite,{noCast:true});
  box(0,0.01,RH-ce,RH,0,RD,M.ceilWhite,{noCast:true});box(RW-0.01,RW,RH-ce,RH,0,RD,M.ceilWhite,{noCast:true});

  /* window: white PVC frame in a 12 cm reveal, two panes, sill, green roller blind, night outside */
  const [wx0,wy0,wx1,wy1]=WIN,rv=0.12;
  box(wx0,wx0+0.005,wy0,wy1,-rv,0,M.white,{solid:false,noCast:true});box(wx1-0.005,wx1,wy0,wy1,-rv,0,M.white,{solid:false,noCast:true});
  box(wx0,wx1,wy1-0.005,wy1,-rv,0,M.white,{solid:false,noCast:true});
  const fz0=-rv-0.06,fz1=-rv+0.01,fw=0.06;
  box(wx0,wx1,wy0,wy0+fw,fz0,fz1,M.pvc);box(wx0,wx1,wy1-fw,wy1,fz0,fz1,M.pvc);
  box(wx0,wx0+fw,wy0,wy1,fz0,fz1,M.pvc);box(wx1-fw,wx1,wy0,wy1,fz0,fz1,M.pvc);
  box((wx0+wx1)/2-0.04,(wx0+wx1)/2+0.04,wy0,wy1,fz0,fz1+0.01,M.pvc);
  for(const hx of [(wx0+wx1)/2-0.06,(wx0+wx1)/2+0.06])box(hx-0.01,hx+0.01,1.45,1.6,fz1+0.01,fz1+0.04,M.pvc,{solid:false});
  add(new THREE.PlaneGeometry(wx1-wx0,wy1-wy0),M.glass,(wx0+wx1)/2,(wy0+wy1)/2,-rv-0.03,{noCast:true});
  solid(wx0,wx1,wy0,wy1,-0.5,-rv-0.02);
  add(new THREE.PlaneGeometry(3,2.2),M.night,(wx0+wx1)/2,1.5,-1.2,{noCast:true});
  box(wx0-0.08,wx1+0.08,wy0-0.03,wy0,-rv-0.02,0.16,M.pvc);                       // sill
  box(0.95,1.3,wy0,wy0+0.018,-0.1,0.12,M.black);                                  // closed laptop on the sill
  add(new THREE.CylinderGeometry(0.02,0.022,0.12,14),M.blue,1.62,wy0+0.06,0.06); solid(1.6,1.64,wy0,wy0+0.12,0.04,0.08);
  box(1.75,1.92,wy0,wy0+0.03,-0.02,0.1,M.darkgrey);
  box(wx0-0.02,wx1+0.02,wy1,wy1+0.08,0,0.07,M.blind);                             // blind cassette
  add(new THREE.PlaneGeometry(wx1-wx0-0.04,0.38),M.blind,(wx0+wx1)/2,wy1-0.19,0.035,{noCast:true});
  box(wx0+0.02,wx1-0.02,wy1-0.4,wy1-0.38,0.025,0.045,M.blind);solid(wx0,wx1,wy1-0.4,wy1,0.025,0.045);

  /* TV on a white stool by the west wall */
  box(0.06,0.5,0.42,0.45,0.5,1.0,M.white);
  box(0.06,0.5,0,0.42,0.5,0.52,M.white);box(0.06,0.5,0,0.42,0.98,1.0,M.white);
  box(0.06,0.5,0.15,0.17,0.52,0.98,M.white);                                       // lower shelf
  box(0.18,0.36,0.45,0.47,0.62,0.88,M.black);box(0.255,0.285,0.47,0.53,0.72,0.78,M.black);
  box(0.24,0.29,0.52,0.92,0.44,1.06,M.black);
  add(new THREE.PlaneGeometry(0.58,0.36),M.tv,0.2915,0.72,0.75,{ry:Math.PI/2,noCast:true});
  /* bed along the east wall: frame on short legs (a cave below), mattress, blanket, pillows, duvet */
  const bx0=1.35,bz0=0.55,bz1=2.65;
  for(const [lx,lz] of [[bx0+0.05,bz0+0.05],[RW-0.07,bz0+0.05],[bx0+0.05,bz1-0.05],[RW-0.07,bz1-0.05]])box(lx-0.03,lx+0.03,0,0.1,lz-0.03,lz+0.03,M.wood);
  box(bx0,RW,0.1,0.28,bz0,bz1,M.wood);
  box(bx0+0.02,RW,0.28,0.43,bz0+0.02,bz1-0.02,M.sheet,{solid:false});solid(bx0,RW,0.28,0.48,bz0,bz1);
  const blanket=softGeo(1.15,RW,1.05,2.85,56,(x,z)=>{
    const ins=x>bx0&&z<bz1, d=Math.max(bx0-x,z-bz1,0);
    const top=0.46+0.015*Math.sin(x*9)*Math.cos(z*7)+bump(x,z,1.8,1.4,0.25,0.04)+bump(x,z,2.4,2.2,0.3,0.03);
    return ins?top:Math.max(0.12,top-d*5);});
  add(blanket,M.fleece,0,0,0);
  for(const px of [1.75,2.5])add(new THREE.SphereGeometry(0.5,24,14),M.pillow,px,0.5,0.8,{}).scale.set(0.34,0.12,0.2);
  solid(1.45,2.9,0.43,0.6,0.62,0.98);
  const duvet=softGeo(2.05,RW,0.95,1.75,40,(x,z)=>0.45+bump(x,z,2.55,1.3,0.3,0.16)+bump(x,z,2.8,1.15,0.2,0.08)+0.02*Math.sin(x*14+z*9));
  add(duvet,new THREE.MeshStandardMaterial({map:photo('duvet'),roughness:.85,side:THREE.DoubleSide}),0,0,0);
  solid(2.25,2.85,0.45,0.58,1.05,1.55);
  // things on the bed: toy synthesizer, badminton racket, neck pillow
  box(1.8,2.32,0.47,0.51,1.62,1.78,M.synth);
  const rk=new THREE.Group();rk.position.set(1.95,0.485,2.05);rk.rotation.y=0.7;room.add(rk);
  add(new THREE.TorusGeometry(0.1,0.008,8,32),M.blue,0,0,0,{rx:Math.PI/2,par:rk}).scale.set(1,1.35,1);
  add(new THREE.CylinderGeometry(0.012,0.012,0.3,8),M.blue,0,0,0.28,{rx:Math.PI/2,par:rk});
  const np=add(new THREE.TorusGeometry(0.1,0.05,12,28),M.black,2.45,0.52,1.85,{rx:Math.PI/2});np.scale.set(1,1.15,0.9);
  add(new THREE.CircleGeometry(0.06,20),M.teal,2.45,0.567,1.85,{rx:-Math.PI/2,noCast:true});solid(2.33,2.57,0.47,0.57,1.72,1.98);
  /* white nightstand in the north-east corner */
  box(2.55,2.97,0.42,0.45,0.08,0.5,M.white);
  for(const [lx,lz] of [[2.58,0.11],[2.94,0.11],[2.58,0.47],[2.94,0.47]])box(lx-0.02,lx+0.02,0,0.42,lz-0.02,lz+0.02,M.white);
  add(new THREE.CylinderGeometry(0.025,0.025,0.1,12),M.red,2.7,0.5,0.25);solid(2.67,2.73,0.45,0.55,0.22,0.28);
  /* table with the laptop by the east wall, near the door */
  const ts=new THREE.Shape(),tw=0.75,td=0.7,tr=0.14;
  ts.moveTo(-tw/2+tr,-td/2);ts.lineTo(tw/2-tr,-td/2);ts.quadraticCurveTo(tw/2,-td/2,tw/2,-td/2+tr);ts.lineTo(tw/2,td/2-tr);ts.quadraticCurveTo(tw/2,td/2,tw/2-tr,td/2);
  ts.lineTo(-tw/2+tr,td/2);ts.quadraticCurveTo(-tw/2,td/2,-tw/2,td/2-tr);ts.lineTo(-tw/2,-td/2+tr);ts.quadraticCurveTo(-tw/2,-td/2,-tw/2+tr,-td/2);
  const tgeo=new THREE.ExtrudeGeometry(ts,{depth:0.025,bevelEnabled:true,bevelThickness:0.006,bevelSize:0.006,bevelSegments:2,curveSegments:8});
  tgeo.rotateX(-Math.PI/2);
  const tx=2.6,tz=3.08;add(tgeo,M.wood,tx,0.7,tz);solid(tx-tw/2,tx+tw/2,0.7,0.731,tz-td/2,tz+td/2);
  for(const [lx,lz] of [[-1,-1],[1,-1],[-1,1],[1,1]])box(tx+lx*(tw/2-0.08)-0.02,tx+lx*(tw/2-0.08)+0.02,0,0.7,tz+lz*(td/2-0.08)-0.02,tz+lz*(td/2-0.08)+0.02,M.wood);
  box(2.42,2.78,0.731,0.748,2.98,3.22,M.darkgrey);
  add(new THREE.PlaneGeometry(0.33,0.2),M.keys,2.6,0.7485,3.09,{rx:-Math.PI/2,noCast:true});
  const sc=new THREE.Group();sc.position.set(2.6,0.748,3.22);sc.rotation.x=0.28;room.add(sc);
  add(new THREE.BoxGeometry(0.36,0.24,0.008),M.darkgrey,0,0.12,0.004,{par:sc});
  add(new THREE.PlaneGeometry(0.33,0.21),M.lapScreen,0,0.122,-0.0005,{ry:Math.PI,par:sc,noCast:true});
  solid(2.42,2.78,0.748,0.98,3.2,3.32);
  box(2.32,2.38,0.731,0.732,2.85,2.93,M.frameW,{solid:false,noCast:true});       // playing card
  add(new THREE.CylinderGeometry(0.012,0.014,0.07,10),M.white,2.88,0.766,2.9);solid(2.87,2.89,0.73,0.8,2.89,2.91);
  /* children's drawings on the east wall (cut out of the photos) */
  box(RW-0.03,RW,1.57,2.13,2.05,2.45,M.gold);
  add(new THREE.PlaneGeometry(0.34,0.48),pic('hands'),RW-0.0305,1.85,2.25,{ry:-Math.PI/2,noCast:true});
  box(RW-0.025,RW,1.04,1.46,2.11,2.39,M.frameW);
  add(new THREE.PlaneGeometry(0.24,0.34),pic('sun'),RW-0.0255,1.25,2.25,{ry:-Math.PI/2,noCast:true});
  add(new THREE.PlaneGeometry(0.15,0.16),pic('blue'),RW-0.002,1.86,1.72,{ry:-Math.PI/2,noCast:true});
  /* wardrobe in the south-west corner: sliding door + open shelves */
  const wz0=3.4,wtop=2.5;
  box(0,1.45,wtop-0.03,wtop,wz0,RD,M.beige);box(0,1.45,0,0.06,wz0,RD,M.beige);
  box(1.43,1.45,0,wtop,wz0,RD,M.beige);
  box(0,0.85,0.06,wtop-0.03,wz0,wz0+0.025,M.beige);solid(0,0.85,0,wtop,wz0,RD);
  box(0,0.02,0.06,wtop-0.03,wz0-0.01,wz0+0.03,M.alu,{solid:false});box(0.84,0.87,0.06,wtop-0.03,wz0-0.012,wz0+0.03,M.alu,{solid:false});
  for(let i=0;i<4;i++)add(new THREE.CylinderGeometry(0.008,0.008,0.03,8),M.alu,0.2+i*0.13,1.3,wz0-0.012,{rx:Math.PI/2});
  for(const sy of [0.55,0.95,1.38,1.8,2.2])box(0.87,1.43,sy-0.02,sy,wz0+0.02,RD,M.beige);
  // shelf contents: headphones, a box, a bag, a mouse; a checked shirt hanging low
  const hp=add(new THREE.TorusGeometry(0.08,0.012,8,24,Math.PI),M.black,1.0,0.97,3.72,{ry:0.3});
  add(new THREE.CylinderGeometry(0.035,0.035,0.03,14),M.black,0.92,1.0,3.72,{rz:Math.PI/2});add(new THREE.CylinderGeometry(0.035,0.035,0.03,14),M.black,1.08,1.0,3.72,{rz:Math.PI/2});
  solid(0.88,1.12,0.95,1.06,3.67,3.77);
  box(1.17,1.35,0.95,1.06,3.55,3.75,M.frameW);
  box(1.0,1.3,1.38,1.43,3.6,3.78,M.black);
  box(1.2,1.26,1.8,1.82,3.6,3.66,M.darkgrey);
  add(new THREE.PlaneGeometry(0.3,0.5),M.plaid,1.05,0.3,3.44,{noCast:true});solid(0.9,1.2,0.06,0.55,3.43,3.46);
  /* doorway: wooden jambs and casing, corridor behind it */
  const [dx0,dx1,dtop]=DOOR;
  box(dx0-0.02,dx0,0,dtop+0.02,RD,HALL[2],M.wood,{solid:false});box(dx1,dx1+0.02,0,dtop+0.02,RD,HALL[2],M.wood,{solid:false});
  box(dx0-0.02,dx1+0.02,dtop,dtop+0.02,RD,HALL[2],M.wood,{solid:false});
  box(dx0-0.07,dx0,0,dtop+0.07,RD-0.015,RD,M.wood,{noCast:true});box(dx1,dx1+0.07,0,dtop+0.07,RD-0.015,RD,M.wood,{noCast:true});
  box(dx0-0.07,dx1+0.07,dtop,dtop+0.07,RD-0.015,RD,M.wood,{noCast:true});
  const [hx0,hx1,hz0,hz1]=HALL,hw=hx1-hx0,hd=hz1-hz0;
  const hidden=new THREE.MeshBasicMaterial({visible:false});
  add(new THREE.BoxGeometry(hw,RH,hd),[M.hallWall,M.hallWall,new THREE.MeshStandardMaterial({color:0xf2f2ef,roughness:.6,side:THREE.BackSide}),M.hallFloor,M.hallWall,hidden],(hx0+hx1)/2,RH/2,(hz0+hz1)/2,{noCast:true});
  add(wallGeo(hw,RH,[[dx0-hx0,0,dx1-hx0,dtop]]),M.hallWallF,hx0,0,hz0,{noCast:true});
  solid(hx0-0.2,hx0,0,RH,hz0,hz1+0.2);solid(hx1,hx1+0.2,0,RH,hz0,hz1+0.2);solid(hx0,hx1,0,RH,hz1,hz1+0.2);
  add(new THREE.PlaneGeometry(0.8,2.0),M.black,2.6,1.0,hz1-0.005,{ry:Math.PI,noCast:true});           // dark doorway far away
  add(new THREE.PlaneGeometry(0.8,2.0),M.white,hx0+0.005,1.0,5.6,{ry:Math.PI/2,noCast:true});           // white door on the left
  box(hx0+0.005,hx0+0.04,0.95,0.98,5.3,5.4,M.alu,{solid:false});
  add(new THREE.PlaneGeometry(0.9,2.05),new THREE.MeshBasicMaterial({color:0x08090b}),hx1-0.005,1.02,6.3,{ry:-Math.PI/2,noCast:true});
  box(hx1-0.02,hx1,0,0.06,hz0,hz1,M.plinth);box(hx0,hx0+0.02,0,0.06,hz0,hz1,M.plinth);
  /* ceiling lamp: a small bright round light near the middle */
  add(new THREE.CylinderGeometry(0.11,0.12,0.02,32),M.lamp,1.5,RH-0.01,1.7,{noCast:true});
  add(new THREE.CylinderGeometry(0.06,0.06,0.02,20),M.lamp,2.8,RH-0.01,5.9,{noCast:true});
}

/* glossy dark stretch ceiling: on medium+ quality the room is mirrored above it and the ceiling is see-through dark glass */
let mirror=null;
function buildCeiling(){
  ceiling=new THREE.Mesh(new THREE.PlaneGeometry(RW*K,RD*K),M.ceiling);ceiling.rotation.x=Math.PI/2;ceiling.position.set(RW*K/2,RH*K,RD*K/2);scene.add(ceiling);
  mirror=new THREE.Group();mirror.position.y=2*RH*K;mirror.scale.y=-1;
  const c=room.clone();c.traverse(o=>{o.castShadow=false;o.receiveShadow=false;});mirror.add(c);scene.add(mirror);
}
function applyCeiling(){
  const on=+S.q>=1;mirror.visible=on;
  Object.assign(M.ceiling,{transparent:on,opacity:on?0.78:1,depthWrite:!on});M.ceiling.color.setHex(on?0x0b1016:0x1a222b);M.ceiling.needsUpdate=true;
}

/* ---------- Lights ---------- */
const hemi=new THREE.HemisphereLight(0xfff2e0,0x403428,0.42);
const lampL=new THREE.SpotLight(0xfff0dc,1.6,0,1.3,0.9,0);
const tvL=new THREE.PointLight(0x8cc4ff,0.9,1.8*K,1.5);
const lapL=new THREE.PointLight(0x6ab0ff,0.6,0.9*K,1.5);
const hallL=new THREE.PointLight(0xffe2b8,0.9,4*K,1.2);
function buildLights(){
  scene.add(hemi);
  lampL.position.set(1.5*K,RH*K-0.6,1.7*K);lampL.target.position.set(1.5*K,0,1.9*K);scene.add(lampL,lampL.target);
  lampL.shadow.camera.near=4;lampL.shadow.camera.far=RH*K+20;lampL.shadow.bias=-0.0004;lampL.shadow.normalBias=0.05;
  tvL.position.set(0.45*K,0.72*K,0.75*K);lapL.position.set(2.6*K,0.9*K,3.0*K);hallL.position.set(2.8*K,2.35*K,5.9*K);
  scene.add(tvL,lapL,hallL);
}
const fxHi=[];
function applyQuality(){
  const q=+S.q;
  renderer.setPixelRatio(q>=3?Math.min(2,Math.max(1.5,devicePixelRatio||1)):Math.min(devicePixelRatio||1,[1,1.5,2][q]));
  renderer.shadowMap.enabled=q>=1;lampL.castShadow=q>=1;
  const ms=q>=3?4096:q>=2?2048:1024;if(lampL.shadow.mapSize.x!==ms){lampL.shadow.mapSize.set(ms,ms);if(lampL.shadow.map){lampL.shadow.map.dispose();lampL.shadow.map=null;}}
  for(const o of fxHi)o.visible=q>=1;
  applyCeiling();
  scene.traverse(o=>{if(o.material&&!Array.isArray(o.material))o.material.needsUpdate=true;});
  setupPost();resize();
}

/* dust floating in the lamp light: sells the tiny scale */
let dust=null;
function buildDust(){
  const n=900,p=new Float32Array(n*3);
  for(let i=0;i<n;i++){p[i*3]=Math.random()*RW*K;p[i*3+1]=Math.random()*RH*K;p[i*3+2]=Math.random()*RD*K;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
  dust=new THREE.Points(g,new THREE.PointsMaterial({map:texGlow,color:0xfff0d0,size:0.35,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
  scene.add(dust);fxHi.push(dust);
}

/* ---------- Fireflies: glowing points hidden around the room ---------- */
// real-metre spots: TV, behind the TV, under the stool, sill, behind the blind, nightstand, under the bed, synth, laptop, under the table, frame, shelf, top of the wardrobe, lamp, corridor
const FLY_SPOTS=[[0.27,1.0,0.75],[0.1,0.7,0.6],[0.28,0.08,0.75],[1.1,0.93,0.05],[1.4,2.0,-0.02],[2.75,0.52,0.3],[2.2,0.05,1.6],[2.05,0.56,1.7],[2.6,0.8,3.05],[2.6,0.3,3.08],[2.94,2.2,2.25],[1.15,1.1,3.72],[0.7,2.55,3.7],[1.5,2.42,1.7],[3.0,1.2,6.8]];
const FLIES=[];
function buildFlies(){
  const core=new THREE.SphereGeometry(0.12,10,8);
  for(const s of FLY_SPOTS){const g=new THREE.Group();g.position.set(s[0]*K,s[1]*K,s[2]*K);
    g.add(new THREE.Mesh(core,new THREE.MeshBasicMaterial({color:new THREE.Color(0xd8ff7a).multiplyScalar(3)})));
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:0xc8ff5a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));sp.scale.set(2.2,2.2,1);g.add(sp);
    g.userData={base:g.position.y,ph:Math.random()*6,got:false};g.visible=false;scene.add(g);FLIES.push(g);}
}

/* ---------- Drone (same model as the FPV game) ---------- */
const drone=new THREE.Group();const props=[];let blob=null;
function buildDrone(){
  const carbon=new THREE.MeshStandardMaterial({color:0x1b1d20,roughness:.45,metalness:.4});
  const arm=new THREE.BoxGeometry(0.032,0.01,0.27);
  for(const a of [Math.PI/4,-Math.PI/4]){const m=new THREE.Mesh(arm,carbon);m.rotation.y=a;m.castShadow=true;drone.add(m);}
  const plate=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.006,0.12),carbon);plate.position.y=0.04;drone.add(plate);
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.03,0.09),new THREE.MeshStandardMaterial({color:0xc8e04a,roughness:.4,metalness:.2}));body.position.y=0.022;body.castShadow=true;drone.add(body);
  const bat=new THREE.Mesh(new THREE.BoxGeometry(0.036,0.026,0.075),new THREE.MeshStandardMaterial({color:0x2f7fe0,roughness:.5}));bat.position.y=0.058;bat.castShadow=true;drone.add(bat);
  const cam=new THREE.Mesh(new THREE.BoxGeometry(0.024,0.024,0.02),carbon);cam.position.set(0,0.026,-0.058);cam.rotation.x=0.35;drone.add(cam);
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.002,0.002,0.07,6),new THREE.MeshStandardMaterial({color:0x111111}));ant.position.set(0,0.06,0.06);ant.rotation.x=-0.6;drone.add(ant);
  const motorM=new THREE.MeshStandardMaterial({color:0x8a9096,metalness:.85,roughness:.25});
  const bladeM=[new THREE.MeshStandardMaterial({color:0xff3a2a,roughness:.4}),new THREE.MeshStandardMaterial({color:0x202224,roughness:.4})];
  const discM=[new THREE.MeshBasicMaterial({color:0xff6a5a,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),new THREE.MeshBasicMaterial({color:0x9aa0a6,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false})];
  const blade=new THREE.BoxGeometry(0.125,0.003,0.016);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>{
    const x=sx*0.095,z=sz*0.095,k=sz<0?0:1;
    const mo=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.016,0.022,14),motorM);mo.position.set(x,0.012,z);mo.castShadow=true;drone.add(mo);
    const p=new THREE.Group();p.position.set(x,0.027,z);
    const b1=new THREE.Mesh(blade,bladeM[k]);const b2=b1.clone();b2.rotation.y=Math.PI/2;p.add(b1,b2);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(0.064,24),discM[k]);disc.rotation.x=-Math.PI/2;disc.position.set(x,0.028,z);drone.add(disc);
    drone.add(p);props.push({p,disc,blades:[b1,b2]});
  });
  for(const [z,c] of [[-0.075,0x30ff6a],[0.06,0xff3020]]){const l=new THREE.Mesh(new THREE.SphereGeometry(0.007,8,6),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(4)}));l.position.set(0,0.03,z);drone.add(l);}
  drone.scale.setScalar(1.6);
  drone.add(camFPV);scene.add(drone);
  blob=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texBlob,transparent:true,depthWrite:false}));blob.rotation.x=-Math.PI/2;blob.renderOrder=1;scene.add(blob);
}
function updFx(dt,now){
  const sp=D.armed?20+D.thrOut*90:0;D.propSpin+=sp*dt;
  const blur=clamp((sp-15)/40,0,1);
  props.forEach((o,i)=>{o.p.rotation.y=D.propSpin*(i===0||i===3?1:-1);o.blades.forEach(b=>b.visible=blur<0.9);o.disc.material.opacity=blur*0.35;});
  let gy=0;for(const b of boxes)if(D.pos.x>b.min.x&&D.pos.x<b.max.x&&D.pos.z>b.min.z&&D.pos.z<b.max.z&&b.max.y<=D.pos.y+0.05)gy=Math.max(gy,b.max.y);
  const h=D.pos.y-gy;blob.position.set(D.pos.x,gy+0.02,D.pos.z);blob.scale.setScalar(0.5+h*0.12);blob.material.opacity=clamp(1-h/8,0.1,1);
  blob.visible=S.cam!=='fpv'||h>0.3;
  if(dust&&dust.visible){dust.rotation.y=Math.sin(now/20000)*0.01;dust.position.y=Math.sin(now/5000)*0.6;}
  for(const f of FLIES)if(f.visible){const u=f.userData;f.position.y=u.base+Math.sin(now/600+u.ph)*0.25;f.children[1].material.opacity=0.7+0.3*Math.sin(now/180+u.ph);}
  anim.tvT=(anim.tvT||0)+dt;if(anim.tvT>1/12){anim.tvT=0;drawTV(now/1000);}
  tvL.intensity=0.8+0.15*Math.sin(now/300);
}

/* ---------- Input ---------- */
const inp={thr:0,yaw:0,pitch:0,roll:0,ly:0,src:'kbd'};
const keys=new Set();
addEventListener('keydown',e=>{
  if(e.repeat)return;keys.add(e.code);srcPref='kbd';
  if(!playing)return;
  if(e.code==='Space'){toggleArm();e.preventDefault();}
  if(e.code==='KeyC')cycleCam();
  if(e.code==='KeyR')resetDrone();
  if(e.code==='KeyB')swapBattery();
  if(e.code==='KeyM')cycleMode();
  if(e.code==='Escape')pause();
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>keys.clear());
let kbThr=0;
const touchSt={L:{x:0,y:-1,id:null},R:{x:0,y:0,id:null}};
function setupStick(el,side){
  const knob=el.querySelector('i');
  const st=touchSt[side];
  const upd=(e)=>{const r=el.getBoundingClientRect();const R=r.width/2;let x=(e.clientX-r.left-R)/R*1.15,y=-(e.clientY-r.top-R)/R*1.15;const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}st.x=x;st.y=y;draw();};
  const draw=()=>{knob.style.transform=`translate(${st.x*46}px,${-st.y*46}px)`;};
  st.draw=draw;
  el.addEventListener('pointerdown',e=>{st.id=e.pointerId;el.setPointerCapture(e.pointerId);upd(e);srcPref='touch';});
  el.addEventListener('pointermove',e=>{if(e.pointerId===st.id)upd(e);});
  const end=e=>{if(e.pointerId!==st.id)return;st.id=null;st.x=0;
    if(!(side==='L'&&S.mode!=='nov'))st.y=0;draw();};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  draw();
}
let srcPref='kbd', padPrevAxes=null;
let padIdx=-1, padPrevBtn=false;
addEventListener('gamepadconnected',e=>{padIdx=e.gamepad.index;padInfo();});
addEventListener('gamepaddisconnected',()=>{padIdx=-1;padInfo();});
function getPad(){const ps=navigator.getGamepads?navigator.getGamepads():[];if(padIdx>=0&&ps[padIdx])return ps[padIdx];for(const p of ps)if(p){padIdx=p.index;return p;}return null;}
function padInfo(){const p=getPad();const t=p?`Подключено: ${p.id.slice(0,60)}${S.pad?' · оси настроены':''}`:'Пульт не найден. Подключи его и пошевели стиками.';$('padState').textContent=t;$('padNote').textContent=p?t:'';}
function expo(v){const e=S.expo;return v*(1-e)+v*v*v*e;}
function readInput(dt){
  if(window.__M&&__M.hold){Object.assign(inp,__M.hold);return;} // test hook
  const p=getPad();
  let src='kbd';
  let thr,yaw,pitch,roll,ly;
  const usable=p&&(S.pad||p.mapping==='standard');
  if(usable){const moved=padPrevAxes&&p.axes.some((v,i)=>Math.abs(v-(padPrevAxes[i]||0))>0.25);padPrevAxes=[...p.axes];if(moved||p.buttons.some(b=>b.pressed))srcPref='pad';}
  if(usable&&srcPref==='pad'){
    src='pad';
    if(S.pad){const c=S.pad,ax=i=>p.axes[i]||0;
      const n=(k)=>{const a=c[k];let v=(ax(a.i)-a.c)/(a.s>0?(a.max-a.c):(a.c-a.min));return clamp(v*a.s,-1,1);};
      const t=c.thr;thr=clamp((ax(t.i)-t.min)/(t.max-t.min),0,1);yaw=n('yaw');pitch=n('pitch');roll=n('roll');ly=thr*2-1;
    }else{
      const dz=v=>Math.abs(v)<0.06?0:v;
      yaw=dz(p.axes[0]);ly=-dz(p.axes[1]);roll=dz(p.axes[2]);pitch=-dz(p.axes[3]);
      thr=ly>=0?0.39+ly*0.61:0.39*(1+ly);
    }
    const b=p.buttons.some(b=>b.pressed);
    if(b&&!padPrevBtn&&playing)toggleArm();
    else if(!b&&padPrevBtn&&S.pad&&D.armed&&playing)toggleArm();
    padPrevBtn=b;
  }else if(srcPref==='touch'){
    src='touch';
    yaw=touchSt.L.x;ly=touchSt.L.y;pitch=touchSt.R.y;roll=touchSt.R.x;thr=(ly+1)/2;
  }else{
    const k=c=>keys.has(c)?1:0;
    yaw=k('KeyD')-k('KeyA');pitch=k('ArrowUp')-k('ArrowDown');roll=k('ArrowRight')-k('ArrowLeft');
    if(S.mode==='nov'){ly=k('KeyW')-k('KeyS');kbThr=(ly+1)/2;}
    else{kbThr=clamp(kbThr+(k('KeyW')-k('KeyS'))*dt*0.7,0,1);ly=kbThr*2-1;}
    thr=kbThr;
    const sm=1-Math.exp(-dt*8);
    yaw=inp.yaw+(yaw-inp.yaw)*sm;pitch=inp.pitch+(pitch-inp.pitch)*sm;roll=inp.roll+(roll-inp.roll)*sm;
  }
  Object.assign(inp,{thr,yaw,pitch,roll,ly,src});
}

/* ---------- Flight model (from the FPV game) ---------- */
const MAXACC=2.6*G;
const R_DRONE=0.17;
const BAT={cells:4,cap:1300};
const D={pos:new THREE.Vector3(),vel:new THREE.Vector3(),q:new THREE.Quaternion(),w:new THREE.Vector3(),heading:0,
  armed:false,landed:true,crashed:0,crashReason:'',used:0,amps:0,vcell:4.2,flightTime:0,thrOut:0,propSpin:0};
const _v=new THREE.Vector3(),_v2=new THREE.Vector3(),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_e=new THREE.Euler(0,0,0,'YXZ'),UP=new THREE.Vector3(0,1,0);
function ocv(c){const pts=[[0,3.3],[.08,3.5],[.2,3.68],[.5,3.82],[.8,4.0],[1,4.2]];
  for(let i=1;i<pts.length;i++)if(c<=pts[i][0]){const [a,va]=pts[i-1],[b,vb]=pts[i];return va+(vb-va)*(c-a)/(b-a);}return 4.2;}
function charge(){return clamp(1-D.used/BAT.cap,0,1);}
// start: on the table next to the laptop, nose to the window
const START={pos:V3(2.3*K,0.731*K,3.3*K),heading:0};
const trail=[];let trailT=0;     // recent safe positions: a novice comes back in the air after a crash
function resetDrone(full){
  D.pos.copy(START.pos);D.vel.set(0,0,0);D.w.set(0,0,0);D.heading=START.heading;D.q.setFromEuler(_e.set(0,D.heading,0));
  D.armed=false;D.landed=true;D.crashed=0;D.thrOut=0;trail.length=0;
  if(full!==false){D.used=0;D.flightTime=0;}
  kbThr=0;touchSt.L.y=S.mode==='nov'?0:-1;touchSt.L.draw&&touchSt.L.draw();
  updArm();
}
function respawnAir(){
  const p=trail.length>4?trail[trail.length-5]:null;
  if(!p||S.mode!=='nov'){resetDrone(false);return;}
  D.pos.copy(p.pos);D.heading=p.h;D.q.setFromEuler(_e.set(0,D.heading,0));D.vel.set(0,0,0);D.w.set(0,0,0);
  D.crashed=0;D.landed=false;D.armed=charge()>0.01;trail.length=0;updArm();toast('Ещё попытка: дрон снова в воздухе');
}
function toggleArm(){
  if(D.crashed)return;
  if(D.armed){D.armed=false;updArm();toast('Моторы сняты с взвода');return;}
  const low=S.mode==='nov'?inp.ly<=0.15:inp.thr<0.08;
  if(!low){toast('Сначала газ вниз!','bad');return;}
  if(charge()<=0.01){toast('АКБ пустой. Сядь и нажми АКБ','bad');return;}
  D.armed=true;updArm();toast('Взведено. Взлетай!');
}
function updArm(){const a=$('armed');a.textContent=D.armed?'ARMED':'DISARM';a.classList.toggle('on',D.armed);const b=$('bArm');b.textContent=D.armed?'СНЯТЬ':'ВЗВЕСТИ';b.classList.toggle('on',D.armed);}
function swapBattery(){
  if(D.armed||!D.landed){toast('АКБ меняют только на земле и без взвода','bad');return;}
  D.used=0;toast('Новый АКБ: 16.8 В');
}
let noiseKick=0;
function crash(reason){
  if(D.crashed)return;
  D.crashed=1.3;D.crashReason=reason;D.armed=false;updArm();noiseKick=1;
  if(navigator.vibrate)try{navigator.vibrate(120);}catch(e){}
}
function tiltDeg(){_v.set(0,1,0).applyQuaternion(D.q);return Math.acos(clamp(_v.y,-1,1))*57.3;}
function step(dt){
  if(D.crashed){D.crashed-=dt;D.vel.multiplyScalar(0.9);if(D.crashed<=0)respawnAir();return;}
  const c=charge();
  D.vcell=ocv(c)-D.amps*0.008;
  const power=c>0?clamp(0.82+0.18*(ocv(c)-3.3)/0.9,0,1):0;
  let thrust=0;
  const body=_v2.set(0,1,0).applyQuaternion(D.q);
  if(S.mode==='acro'){
    const r=S.rate/57.3;
    const target=_v.set(-expo(inp.pitch)*r,-expo(inp.yaw)*r*0.8,-expo(inp.roll)*r);
    D.w.lerp(target,1-Math.exp(-dt*30));
    const ang=D.w.length()*dt;
    if(ang>0){_q.setFromAxisAngle(_v.copy(D.w).normalize(),ang);D.q.multiply(_q);}
    thrust=D.armed?clamp(inp.thr,0,1)*MAXACC*power:0;
  }else if(S.mode==='angle'){
    D.heading-=expo(inp.yaw)*3.2*dt;
    const max=45/57.3;
    _q2.setFromEuler(_e.set(-expo(inp.pitch)*max,D.heading,-expo(inp.roll)*max));
    D.q.slerp(_q2,1-Math.exp(-dt*10));
    thrust=D.armed?clamp(inp.thr,0,1)*MAXACC*power:0;
  }else{ // novice: hold altitude and brake by itself
    D.heading-=inp.yaw*2.2*dt;
    const k=NOV_SPD;
    const vzDes=inp.ly*2.5*Math.sqrt(k);
    const fwd=inp.pitch*5*k,right=inp.roll*5*k;
    const sh=Math.sin(D.heading),ch=Math.cos(D.heading);
    const vdx=-sh*fwd+ch*right, vdz=-ch*fwd-sh*right;
    let ax=(vdx-D.vel.x)*2.2, az=(vdz-D.vel.z)*2.2;
    const amax=G*Math.tan(30/57.3),am=Math.hypot(ax,az);if(am>amax){ax*=amax/am;az*=amax/am;}
    let ay=G+(vzDes-D.vel.y)*3;
    const sp=D.vel.length();ax+=D.vel.x*(0.25+0.02*sp);az+=D.vel.z*(0.25+0.02*sp);ay+=D.vel.y*(0.25+0.02*sp);
    ay=Math.max(ay,1);
    _v.set(ax,ay,az);
    const need=_v.length();
    _v.normalize();
    _q2.setFromUnitVectors(UP,_v);_q.setFromEuler(_e.set(0,D.heading,0));_q2.multiply(_q);
    D.q.slerp(_q2,1-Math.exp(-dt*9));
    thrust=D.armed?Math.min(need/Math.max(body.dot(_v),0.3),MAXACC*power):0;
    if(D.landed&&inp.ly<=0.05)thrust=D.armed?G*0.4:0;
  }
  D.q.normalize();
  D.thrOut=thrust/MAXACC;
  D.amps=D.armed?2+62*Math.pow(D.thrOut,1.5):0.3;
  D.used+=D.amps*dt/3.6;
  if(D.armed)D.flightTime+=dt;
  body.set(0,1,0).applyQuaternion(D.q);
  const sp=D.vel.length();
  D.vel.x+=(body.x*thrust-D.vel.x*(0.25+0.02*sp))*dt;
  D.vel.y+=(body.y*thrust-G-D.vel.y*(0.25+0.02*sp))*dt;
  D.vel.z+=(body.z*thrust-D.vel.z*(0.25+0.02*sp))*dt;
  D.pos.addScaledVector(D.vel,dt);
  collide();
}
function settle(){ // resting on a surface: level out on the legs
  _q.setFromEuler(_e.set(0,new THREE.Euler().setFromQuaternion(D.q,'YXZ').y,0));D.q.slerp(_q,0.2);
  if(S.mode!=='acro')D.heading=new THREE.Euler().setFromQuaternion(D.q,'YXZ').y;
  D.w.multiplyScalar(0.5);
}
function collide(){
  const p=D.pos;
  if(p.y<0){
    const vy=-D.vel.y, hs=Math.hypot(D.vel.x,D.vel.z), tl=tiltDeg();
    if(vy>CRASH_V)return crash('удар о пол');
    if(tl>55&&(hs>1.5||D.armed))return crash('дрон лёг на бок');
    p.y=0;D.vel.y=0;D.vel.x*=0.8;D.vel.z*=0.8;D.landed=true;settle();
  }else if(p.y>0.03)D.landed=false;
  const sp=D.vel.length();
  const top=RH*K-R_DRONE;if(p.y>top){p.y=top;if(sp>CRASH_V)return crash('удар о потолок');D.vel.y=Math.min(D.vel.y,0)*-0.3;}
  p.x=clamp(p.x,-6,4.8*K);p.z=clamp(p.z,-0.5*K,7.8*K);
  for(const b of boxes){
    if(p.x>b.min.x-R_DRONE&&p.x<b.max.x+R_DRONE&&p.y>b.min.y-R_DRONE&&p.y<b.max.y+R_DRONE&&p.z>b.min.z-R_DRONE&&p.z<b.max.z+R_DRONE){
      const o=[[p.x-(b.min.x-R_DRONE),'x',-1],[(b.max.x+R_DRONE)-p.x,'x',1],[p.y-(b.min.y-R_DRONE),'y',-1],[(b.max.y+R_DRONE)-p.y,'y',1],[p.z-(b.min.z-R_DRONE),'z',-1],[(b.max.z+R_DRONE)-p.z,'z',1]].sort((a,b)=>a[0]-b[0])[0];
      const vn=D.vel[o[1]]*o[2]; // speed into the surface
      if(-vn>CRASH_V)return crash(o[1]==='y'&&o[2]>0?'жёсткая посадка':'столкновение');
      p[o[1]]+=o[0]*o[2];
      if(vn<0)D.vel[o[1]]*=-0.3;
      if(o[1]==='y'&&o[2]>0){D.vel.y=Math.max(D.vel.y,0);D.vel.x*=0.9;D.vel.z*=0.9;D.landed=true;if(tiltDeg()<40)settle();}
    }
  }
}

/* ---------- Cameras ---------- */
const CAMS=['fpv','chase','los'], CAMN={fpv:'FPV',chase:'СЗАДИ',los:'ИЗ УГЛА'};
function cycleCam(){S.cam=CAMS[(CAMS.indexOf(S.cam)+1)%3];save();$('ocam').textContent=CAMN[S.cam];}
const MODEN={nov:'НОВИЧОК',angle:'ANGLE',acro:'ACRO'};
function cycleMode(){
  const order=['nov','angle','acro'];
  if(D.armed){toast('Режим меняют без взвода','bad');return;}
  S.mode=order[(order.indexOf(S.mode)+1)%3];save();resetDrone(false);toast('Режим: '+MODEN[S.mode]);
}
const chasePos=new THREE.Vector3(0,2,14);
function placeCameras(dt){
  camFPV.position.set(0,0.035,-0.06);
  camFPV.rotation.set(S.tilt/57.3,0,0);
  if(S.cam==='chase'){
    const yaw=new THREE.Euler().setFromQuaternion(D.q,'YXZ').y;
    _v.set(Math.sin(yaw)*2.6,1.0,Math.cos(yaw)*2.6).add(D.pos);
    _v.y=clamp(_v.y,0.3,RH*K-0.5);
    chasePos.lerp(_v,1-Math.exp(-dt*5));
    camExt.position.copy(chasePos);camExt.fov=65;camExt.updateProjectionMatrix();
    camExt.lookAt(_v2.copy(D.pos).add(_v.set(0,0.2,0)));
  }else if(S.cam==='los'){
    // a camera in the top corner by the window, like a spider on the wall
    camExt.position.set(0.12*K,2.5*K,0.12*K);
    const d=camExt.position.distanceTo(D.pos);
    camExt.fov=clamp(60*25/Math.max(d,25),10,60);camExt.updateProjectionMatrix();
    camExt.lookAt(D.pos);
  }
}

/* ---------- OSD, noise, toasts ---------- */
let toastT=0;
function toast(t,cls){const e=$('toast');e.textContent=t;e.className=cls||'';toastT=2.4;}
const nctx=$('noise').getContext('2d');const nimg=nctx.createImageData(160,90);
function drawNoise(dt){
  noiseKick=Math.max(0,noiseKick-dt*0.7);
  let k=S.fx==='1'&&S.cam==='fpv'?0.04+noiseKick*0.8+(D.vcell<3.5?0.1:0):0;
  $('noise').style.opacity=k.toFixed(3);$('scan').style.display=S.fx==='1'&&S.cam==='fpv'&&!$('osd').hidden?'':'none';
  if(k<0.01)return;
  const a=nimg.data;for(let i=0;i<a.length;i+=4){const v=Math.random()*255|0;a[i]=a[i+1]=a[i+2]=v;a[i+3]=255;}
  const bar=(performance.now()/7|0)%90;for(let y=bar;y<Math.min(90,bar+4);y++)for(let x=0;x<160;x++){const i=(y*160+x)*4;a[i]=a[i+1]=a[i+2]=255;}
  nctx.putImageData(nimg,0,0);
}
function fmtT(s){s=Math.max(0,s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');}
function updOSD(dt){
  const c=charge();
  $('omode').textContent=MODEN[S.mode];
  $('otime').textContent=game.kind==='fire'?fmtT(game.t):fmtT(D.flightTime);
  $('obat').textContent=(D.vcell*BAT.cells).toFixed(1)+'V';
  const cell=$('ocell');cell.textContent=D.vcell.toFixed(2)+' В/банка';cell.className=D.vcell<3.5?'bad':D.vcell<3.65?'warnc':'';
  $('ofly').textContent=game.kind==='fire'?'✦ '+game.got+'/'+FLIES.length:'';
  // altitude and speed in the real room: centimetres
  $('oalt').textContent=Math.round(D.pos.y/K*100);
  $('ospd').textContent=Math.round(D.vel.length()/K*100);
  _e.setFromQuaternion(D.q,'YXZ');
  const hor=$('hor');hor.style.transform=`translateY(${clamp(_e.x*57.3*4,-160,160)}px) rotate(${_e.z*57.3}deg)`;
  hor.style.display=S.cam==='fpv'?'':'none';$('cross').style.display=S.cam==='fpv'?'':'none';
  let w='';
  if(D.crashed)w='БАМ!<br><small style="font-size:.6em">'+D.crashReason+'</small>';
  else if(c<=0.01)w='АКБ ПУСТОЙ';
  else if(ocv(c)<3.5)w='САДИСЬ: АКБ';
  $('warn').innerHTML=w;
  const ly=S.mode==='nov'?inp.ly:inp.thr*2-1;
  $('sL').style.left=(50+inp.yaw*45)+'%';$('sL').style.top=(50-ly*45)+'%';
  $('sR').style.left=(50+inp.roll*45)+'%';$('sR').style.top=(50-inp.pitch*45)+'%';
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').textContent='';}
}

/* ---------- Hints: always say what to press next ---------- */
function ctl(){return inp.src==='pad'?'pad':(inp.src==='touch'||matchMedia('(pointer:coarse)').matches)?'touch':'kbd';}
const WORDS={
  arm:{touch:'кнопку ВЗВЕСТИ внизу',kbd:'Пробел',pad:'кнопку или тумблер на пульте'},
  up:{touch:'левый стик вверх',kbd:'клавишу W',pad:'газ вверх'},
  fwd:{touch:'правый стик вверх',kbd:'стрелку ↑',pad:'правый стик вверх'},
  yaw:{touch:'левый стик вбок',kbd:'A или D',pad:'левый стик вбок'},
};
const say=k=>WORDS[k][ctl()];
let hlId=null;
function highlight(id){if(id===hlId)return;if(hlId)$(hlId).classList.remove('hl');hlId=id;if(id)$(id).classList.add('hl');}
function hint(){
  if(D.crashed)return ['',null];
  if(!D.armed&&D.landed)return [`Взведи моторы: нажми <b>${say('arm')}</b>`+(S.mode==='nov'?'':'. Газ должен быть внизу'),'bArm'];
  if(D.landed&&D.flightTime<20)return [S.mode==='nov'?`Взлетай: <b>${say('up')}</b>`:`Плавно добавь газ: <b>${say('up')}</b>, висение около 40%`,'stL'];
  if(game.kind==='fire')return [`Светлячки: <b>${game.got} из ${FLIES.length}</b>. Жёлтая стрелка ведёт к ближайшему. Вперёд: ${say('fwd')}, поворот: ${say('yaw')}`,null];
  if(D.flightTime<14)return [`Лети куда хочешь! Вперёд: <b>${say('fwd')}</b>, поворот: <b>${say('yaw')}</b>. Загляни под кровать и на шкаф`,'stR'];
  return ['',null];
}
function setTask(h){const e=$('task');e.hidden=!h;if(h&&e._h!==h){e._h=h;e.innerHTML=h;}}
// OSD pointer to the nearest firefly, also off screen
let guideP=null;
function updGuide(cam){
  const el=$('guide');
  if(!guideP||!playing){el.hidden=true;return;}
  el.hidden=false;
  const v=_v.copy(guideP).project(cam);
  const behind=_v2.copy(guideP).applyMatrix4(cam.matrixWorldInverse).z>0;
  let x=v.x,y=v.y;if(behind){x=-x;y=-y;}
  const on=!behind&&Math.abs(x)<0.9&&Math.abs(y)<0.85;
  if(!on){const m=Math.max(Math.abs(x),Math.abs(y))||1;x=x/m*0.88;y=y/m*0.8;}
  el.style.left=((x+1)/2*100)+'%';el.style.top=((1-y)/2*100)+'%';
  el.querySelector('b').style.transform=on?'':`rotate(${Math.atan2(-y,x)}rad)`;
  el.querySelector('b').textContent=on?'◇':'➤';
  el.querySelector('span').textContent=Math.round(D.pos.distanceTo(guideP)/K*100)+' см';
}

/* ---------- Game modes: free flight and firefly hunt ---------- */
let playing=false;
const game={kind:'free',t:0,got:0,done:false};
const GAMES={
  free:{tag:'ПОЛЁТ',name:'Свободный полёт',desc:'Никаких заданий: облети всю комнату, заберись под кровать, в шкаф и в коридор.'},
  fire:{tag:'ИГРА',name:'Светлячки',desc:'По комнате спрятаны 15 светлячков: на телевизоре, под кроватью, в шкафу, у лампы… Собери всех как можно быстрее.'},
};
function startGame(kind){
  game.kind=kind;game.t=0;game.got=0;game.done=false;
  for(const f of FLIES){f.userData.got=false;f.visible=kind==='fire';}
  resetDrone();playing=true;showScreen(null);
  $('osd').hidden=false;$('touch').hidden=false;$('ocam').textContent=CAMN[S.cam];
  audioInit();
}
function gameTick(dt){
  if(game.kind!=='fire'||game.done){guideP=null;return;}
  if(D.armed||!D.landed)game.t+=dt;
  let best=null,bd=1e9;
  for(const f of FLIES){if(f.userData.got)continue;const d=f.position.distanceTo(D.pos);
    if(d<1.7){f.userData.got=true;f.visible=false;game.got++;beep(1320,0.08);setTimeout(()=>beep(1760,0.1),90);
      toast(game.got<FLIES.length?`Светлячок! ${game.got} из ${FLIES.length}`:'Все светлячки собраны!');continue;}
    if(d<bd){bd=d;best=f;}}
  guideP=best?best.position:null;
  if(game.got>=FLIES.length){game.done=true;setTimeout(finish,1200);}
}
function finish(){
  playing=false;D.armed=false;updArm();highlight(null);
  const t=game.t,stars=t<240?3:t<420?2:1,prev=S.best.fire;
  if(prev==null||t<prev)S.best.fire=t;S.stars.fire=Math.max(S.stars.fire||0,stars);save();
  $('rTitle').textContent='Все светлячки собраны!';
  $('rStars').innerHTML='★'.repeat(stars)+'<i>'+'★'.repeat(3-stars)+'</i>';
  $('rVal').textContent=fmtT(t);
  $('rText').textContent=(prev==null||t<prev?'Новый рекорд! ':'Рекорд: '+fmtT(prev)+'. ')+'3 звезды: быстрее 4 минут, 2 звезды: быстрее 7 минут.';
  $('osd').hidden=true;$('touch').hidden=true;showScreen('sRes');
}
function exitToMenu(){playing=false;D.armed=false;updArm();highlight(null);guideP=null;$('osd').hidden=true;$('touch').hidden=true;for(const f of FLIES)f.visible=false;renderMenu();showScreen('sMenu');}
function pause(){if(!playing)return;playing=false;showScreen('sPause');}

/* ---------- Sound: motor hum and beeps (WebAudio, no files) ---------- */
let AC=null,motorOsc=null,motorGain=null;
function audioInit(){
  if(AC)return;try{AC=new (window.AudioContext||window.webkitAudioContext)();
  motorOsc=AC.createOscillator();motorOsc.type='sawtooth';const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=1600;
  motorGain=AC.createGain();motorGain.gain.value=0;motorOsc.connect(f);f.connect(motorGain);motorGain.connect(AC.destination);motorOsc.start();}catch(e){AC=null;}
}
function beep(f,d){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=0.08;o.connect(g);g.connect(AC.destination);o.start();g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+d);o.stop(AC.currentTime+d+0.02);}
// a tiny drone whines higher than a big one: buzzing like a fly
function updAudio(){if(!motorGain)return;const on=playing&&D.armed;motorGain.gain.setTargetAtTime(on?0.02+D.thrOut*0.04:0,AC.currentTime,0.05);motorOsc.frequency.setTargetAtTime(170+D.thrOut*520,AC.currentTime,0.05);}

/* ---------- Screens ---------- */
const SCREENS=['sMenu','sSet','sHelp','sPad','sPause','sRes'];
let backTo='sMenu';
function showScreen(id){for(const s of SCREENS)$(s).hidden=s!==id;}
function renderMenu(){
  const list=$('taskList');list.innerHTML='';
  for(const id of ['free','fire']){const t=GAMES[id],st=S.stars[id]||0;
    const b=document.createElement('button');b.className='task';
    b.innerHTML=`<span class="tag">${t.tag}</span><b>${t.name}</b><span>${t.desc}</span>`+
      (id==='fire'?`<span class="stars" style="font-size:18px;letter-spacing:3px">${'★'.repeat(st)}<i>${'★'.repeat(3-st)}</i></span><span class="best">${S.best.fire!=null?'Рекорд: '+fmtT(S.best.fire):''}</span>`:'');
    b.onclick=()=>startGame(id);list.appendChild(b);}
  padInfo();
}
const MODENOTE={nov:'Новичок: дрон сам держит высоту и тормозит. Левый стик вверх — набор высоты, в середине — висит.',angle:'Angle: дрон сам выравнивается, но газ твой. Висение примерно на 40% газа.',acro:'Acro: как настоящий FPV. Стики задают скорость вращения, сам дрон не выравнивается.'};
function renderSettings(){
  document.querySelectorAll('.seg').forEach(seg=>{const k=seg.dataset.k;seg.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',String(S[k])===b.dataset.v);});});
  document.querySelectorAll('input[type=range]').forEach(r=>r.value=S[r.dataset.k]);
  $('vTilt').textContent=S.tilt;$('vRate').textContent=S.rate;$('vExpo').textContent=(+S.expo).toFixed(2);
  $('modeNote').textContent=MODENOTE[S.mode];
}
document.querySelectorAll('.seg').forEach(seg=>seg.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=seg.dataset.k;
  if(k==='mode'&&D.armed){toast('Режим меняют без взвода','bad');return;}
  S[k]=b.dataset.v;save();if(k==='q')applyQuality();if(k==='mode')resetDrone(false);if(k==='cam')$('ocam').textContent=CAMN[S.cam];renderSettings();}));
document.querySelectorAll('input[type=range]').forEach(r=>r.addEventListener('input',()=>{S[r.dataset.k]=+r.value;save();renderSettings();}));
$('mSet').onclick=()=>{backTo='sMenu';renderSettings();showScreen('sSet');};
$('pSet').onclick=()=>{backTo='sPause';renderSettings();showScreen('sSet');};
$('setBack').onclick=()=>showScreen(backTo);
$('mHelp').onclick=()=>showScreen('sHelp');$('helpBack').onclick=()=>showScreen('sMenu');
$('mPad').onclick=()=>{padInfo();showScreen('sPad');};$('padBack').onclick=()=>{cal=null;renderMenu();showScreen('sMenu');};
$('pResume').onclick=()=>{showScreen(null);playing=true;};
$('pRestart').onclick=()=>startGame(game.kind);
$('pMenu').onclick=exitToMenu;
$('rAgain').onclick=()=>startGame('fire');$('rFree').onclick=()=>startGame('free');$('rMenu').onclick=exitToMenu;
$('bArm').addEventListener('pointerdown',e=>{e.preventDefault();toggleArm();});
$('bCam').addEventListener('pointerdown',e=>{e.preventDefault();cycleCam();});
$('bPause').addEventListener('pointerdown',e=>{e.preventDefault();pause();});
$('bBat').addEventListener('pointerdown',e=>{e.preventDefault();swapBattery();});

/* ---------- Controller axis wizard ---------- */
let cal=null;
const CALSTEPS=[['rest','Отпусти стики, газ опусти вниз. Жди…'],['thr','Газ ВВЕРХ до упора и держи'],['yaw','Левый стик ВПРАВО (рыскание) и держи'],['pitch','Правый стик ВВЕРХ (тангаж) и держи'],['roll','Правый стик ВПРАВО (крен) и держи']];
$('calGo').onclick=()=>{if(!getPad()){padInfo();return;}cal={i:0,t:0,rest:null,res:{}};};
$('calReset').onclick=()=>{S.pad=null;save();cal=null;$('calSteps').textContent='Оси сброшены, используются стандартные.';padInfo();};
function calTick(dt){
  const p=getPad();
  $('calAxes').textContent=p?p.axes.map((a,i)=>`ось ${i}: ${a.toFixed(2)}`).join('   '):'';
  if(!cal||!p)return;
  const [k,txt]=CALSTEPS[cal.i];
  $('calSteps').textContent=`Шаг ${cal.i+1} из ${CALSTEPS.length}. ${txt}`;
  const ax=[...p.axes];
  if(k==='rest'){cal.t+=dt;if(cal.t>2){cal.rest=ax;cal.i++;cal.t=0;}return;}
  const used=Object.values(cal.res).map(r=>r.i);
  let bi=-1,bd=0;ax.forEach((v,i)=>{const d=Math.abs(v-cal.rest[i]);if(!used.includes(i)&&d>bd){bd=d;bi=i;}});
  if(bd>0.5){cal.t+=dt;if(cal.t>1){
    const c=cal.rest[bi],v=ax[bi];
    if(k==='thr')cal.res.thr={i:bi,min:c,max:v};
    else cal.res[k]={i:bi,c,s:v>c?1:-1,min:-1,max:1};
    cal.i++;cal.t=0;beep(880,0.06);
    if(cal.i>=CALSTEPS.length){S.pad=cal.res;save();cal=null;$('calSteps').textContent='Готово! Оси сохранены.';padInfo();}
  }}else cal.t=0;
}

/* ---------- Main loop ---------- */
let last=performance.now();
const FPSW={t:0,n:0,tried:{}};
function fpsWatch(dt){
  if(!playing||+S.q<2||FPSW.tried[S.q])return;FPSW.t+=dt;FPSW.n++;
  if(FPSW.t<6)return;const fps=FPSW.n/FPSW.t;FPSW.t=0;FPSW.n=0;
  if(fps<28){FPSW.tried[S.q]=1;S.q=String(+S.q-1);save();applyQuality();toast('Графика снижена до «'+['Низкая','Средняя','Высокая'][+S.q]+'»: так плавнее');}
}
function frame(now){
  requestAnimationFrame(frame);
  let dt=Math.min((now-last)/1000,0.05);last=now;
  readInput(dt);
  if(!$('sPad').hidden)calTick(dt);
  if(playing){
    const n=Math.ceil(dt/(1/240));const h=dt/n;
    for(let i=0;i<n;i++)step(h);
    trailT+=dt;if(trailT>0.3&&!D.crashed&&!D.landed&&D.armed){trailT=0;trail.push({pos:D.pos.clone(),h:D.heading});if(trail.length>20)trail.shift();}
    gameTick(dt);
    const [ht,ui]=hint();setTask(ht);highlight(ui);
  }
  drone.position.copy(D.pos);drone.quaternion.copy(D.q);
  placeCameras(dt);
  let cam=S.cam==='fpv'?camFPV:camExt;
  if(!playing&&$('osd').hidden){ // menu backdrop: slow look around the giant room
    const a=now/14000;camExt.position.set(1.5*K+Math.sin(a)*0.9*K,1.2*K+Math.sin(a*0.7)*0.3*K,2.1*K+Math.cos(a)*1.1*K);camExt.fov=70;camExt.updateProjectionMatrix();
    camExt.lookAt(1.5*K-Math.sin(a)*0.8*K,0.9*K,2.0*K-Math.cos(a)*1.2*K);cam=camExt;drone.visible=true;}
  else drone.visible=S.cam!=='fpv';
  updFx(dt,now);
  if(composer){renderPass.camera=cam;composer.render(dt);}else renderer.render(scene,cam);
  if(playing||!$('osd').hidden){updOSD(dt);drawNoise(dt);updGuide(cam);}
  updAudio();fpsWatch(dt);
}

/* ---------- Boot ---------- */
buildRoom();buildLights();buildCeiling();buildDust();buildFlies();buildDrone();
setupStick($('stL'),'L');setupStick($('stR'),'R');
applyQuality();resetDrone();renderMenu();showScreen('sMenu');
$('ocam').textContent=CAMN[S.cam];
if(!loading)$('load').hidden=true;
requestAnimationFrame(frame);
window.__M={renderer,D,inp,S,scene,startGame,toggleArm,step,camExt,camFPV,game,FLIES,boxes,K,applyQuality,get playing(){return playing;}};
