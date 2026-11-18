"use strict";
// «Спектр: зал»: the hall of the «Спектр» centre in real metres, from Alexandr's measurements and 35 photos (18.11.2026).
// Three ways to be there: walk, a mini drone (tinywhoop) or a fly-sized drone. Plus «Побег»: a night escape game on foot.
// Engine, flight model, input and OSD come from «Муха» (muha/).
if(!window.THREE){document.body.innerHTML='<p style="padding:24px">Не загрузился 3D-движок (three.min.js). Обнови страницу.</p>';throw new Error('no three');}
const $=id=>document.getElementById(id);
const VERSION='1.1 от 18.11.2026'; // bump on every release so testers can tell builds apart
document.querySelectorAll('.ver').forEach(e=>e.textContent='Версия '+VERSION);
document.title='Спектр: зал · v'+VERSION.split(' ')[0];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const G=9.81;
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ---------- Saved settings and results ---------- */
const KEY='spektr-zal.v1';
const DEF={scale:'drone',mode:'fly',cam:'fpv',tilt:15,rate:560,expo:0.35,q:(matchMedia('(pointer:coarse)').matches?'0':'1'),fx:'1',pad:null,best:{},stars:{}};
let S=Object.assign({},DEF);
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s)S=Object.assign({},DEF,s,{best:Object.assign({},s.best||{}),stars:Object.assign({},s.stars||{})});}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

/* ---------- Scale: the hall is built in real metres, then blown up K times ---------- */
// walk: 1:1, you are a person; drone: a 10 cm tinywhoop (K=3.4 so the drone model and physics stay the same); muha: 1.5 cm (K=30)
if(!['walk','drone','muha'].includes(S.scale))S.scale='drone';
const WALK=S.scale==='walk';
if(WALK)document.body.classList.add('walk');
const K={walk:1,drone:3.4,muha:30}[S.scale];
const NOV_SPD=S.scale==='muha'?2.2:1;
const CRASH_V=7;

/* ---------- Renderer, scene, cameras ---------- */
const renderer=new THREE.WebGLRenderer({antialias:S.q!=='0',powerPreference:'high-performance'});
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x07090b);
const camFPV=new THREE.PerspectiveCamera(WALK?75:80,1,WALK?0.05:0.06,500);
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
    if(THREE.DepthTexture){const dt=new THREE.DepthTexture(innerWidth,innerHeight);dt.type=THREE.UnsignedIntType;rt.depthTexture=dt;} // 24-bit depth: the default 16-bit one z-fights at room scale
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
function photo(name,rep){loading++;const t=loader.load('tex/'+name+'.jpg?v=1.0',()=>{if(--loading<=0)$('load').hidden=true;},undefined,()=>{if(--loading<=0)$('load').hidden=true;});
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
  ceilLiv:new THREE.MeshStandardMaterial({color:0x6a5040,roughness:.12,metalness:.1}),
  ceilKit:new THREE.MeshStandardMaterial({color:0x1d8a34,roughness:.12,metalness:.1}),
  ceilWhite:new THREE.MeshStandardMaterial({color:0xf5f5f2,roughness:.5}),
  blue:new THREE.MeshStandardMaterial({color:0x2f6fe0,roughness:.4}),
  teal:new THREE.MeshStandardMaterial({color:0x2a9a9a,roughness:.7}),
  gold:new THREE.MeshStandardMaterial({color:0xb08a3a,roughness:.35,metalness:.7}),
  frameW:new THREE.MeshStandardMaterial({color:0xf2f2f0,roughness:.4}),
  red:new THREE.MeshStandardMaterial({color:0xd8402a,roughness:.5}),
  hoopOn:new THREE.MeshStandardMaterial({color:0x40ff70,emissive:0x30ff60,emissiveIntensity:1.2,roughness:.5}),
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
const anim={};
/* ---------- The hall of «Спектр», real metres (measured by Alexandr 18.11.2026) ----------
   x: 0 = stage (west) wall → 11.5 = blackboard (east) wall; z: 0 = north wall (computer nook behind the columns) → 7.3 = south wall with 4 windows; height 2.9.
   Columns 0.45 m square on the line z 1.65..2.1 (5.2 m from the windows), at x 3.4 (3.4 m from the stage wall) and 2.9 m further east. */
const L=11.5, W=7.3, H=2.9;
const COLS=[[3.4,3.85],[6.75,7.2],[10.1,10.55]], CZ=[1.65,2.1]; // third column added 18.11 from Alexandr's note, exact place to be checked on his photos
const STAGE={x0:0,x1:2.5,z0:2.3,z1:7.0,h:0.45};

// polished granite tiles 0.6 m: beige and grey in a checker, texture = 2x2 tiles = 1.2 m
const texGranite=canvasTex(1024,1024,(g,w,h)=>{const t=w/2;
  const cols=[['#cfc6b4','#d8d0bf'],['#a7a7a2','#b3b2ac']];
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){const c=cols[(i+j)%2];g.fillStyle=c[0];g.fillRect(i*t,j*t,t,t);
    for(let k=0;k<2600;k++){const v=Math.random();g.fillStyle=v<.5?`rgba(255,255,255,${Math.random()*.25})`:v<.85?`rgba(60,55,50,${Math.random()*.25})`:'rgba(20,20,20,.35)';const s=1+Math.random()*3;g.fillRect(i*t+Math.random()*t,j*t+Math.random()*t,s,s);}
    g.strokeStyle='rgba(60,60,60,.5)';g.lineWidth=2;g.strokeRect(i*t+1,j*t+1,t-2,t-2);}
},[L/1.2,W/1.2]);
// computer nook floor: black/white/grey cube tiles
const texCubes=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#777';g.fillRect(0,0,w,h);const s=64,hh=s*0.866;
  for(let r=-1;r<h/(hh*2)+2;r++)for(let c=-1;c<w/s+2;c++){const x=c*s+(r%2?s/2:0),y=r*hh*2*0.75;
    g.fillStyle='#ece9e2';g.beginPath();g.moveTo(x,y);g.lineTo(x+s/2,y+hh/2);g.lineTo(x,y+hh);g.lineTo(x-s/2,y+hh/2);g.closePath();g.fill();
    g.fillStyle='#2a2a2c';g.beginPath();g.moveTo(x-s/2,y+hh/2);g.lineTo(x,y+hh);g.lineTo(x,y+hh*2);g.lineTo(x-s/2,y+hh*1.5);g.closePath();g.fill();
    g.fillStyle='#8d8b86';g.beginPath();g.moveTo(x+s/2,y+hh/2);g.lineTo(x,y+hh);g.lineTo(x,y+hh*2);g.lineTo(x+s/2,y+hh*1.5);g.closePath();g.fill();}
},[6,2]);
// suspended grid ceiling: 10 cm cells, dark gaps
const texGrid=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#202224';g.fillRect(0,0,w,h);const n=8,c=w/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const gr=g.createLinearGradient(i*c,j*c,i*c+c,j*c+c);gr.addColorStop(0,'#c9cacb');gr.addColorStop(1,'#9fa1a3');g.fillStyle=gr;g.fillRect(i*c+4,j*c+4,c-8,c-8);g.fillStyle='#3a3c3f';g.fillRect(i*c+12,j*c+12,c-24,c-24);}
},[L/0.8,W/0.8]);
const texPaint=canvasTex(512,512,(g,w,h)=>noiseFill(g,w,h,'#c4c6c8',5000,.05),[4,2]);
const texPaintE=canvasTex(512,512,(g,w,h)=>noiseFill(g,w,h,'#dcdee0',4000,.04),[4,2]);
const texTruss=canvasTex(512,64,(g,w,h)=>{g.fillStyle='#1a1b1d';g.fillRect(0,0,w,h);g.strokeStyle='#e8e8e8';g.lineWidth=6;
  g.strokeRect(3,3,w-6,h-6);for(let x=0;x<w;x+=64){g.beginPath();g.moveTo(x,6);g.lineTo(x+32,h-6);g.lineTo(x+64,6);g.stroke();}},[5,1]);
const texBoard=canvasTex(512,256,(g,w,h)=>{g.fillStyle='#1f2a26';g.fillRect(0,0,w,h);
  for(let i=0;i<40;i++){g.fillStyle=`rgba(220,230,225,${Math.random()*.06})`;g.beginPath();g.ellipse(Math.random()*w,Math.random()*h,20+Math.random()*80,8+Math.random()*30,Math.random()*3,0,7);g.fill();}
  g.strokeStyle='#b9a07a';g.lineWidth=8;g.strokeRect(0,0,w,h);});
const texHoop=canvasTex(256,16,(g,w,h)=>{for(let i=0;i<16;i++){g.fillStyle=i%2?'#f4f4f4':'#d8262a';g.fillRect(i*16,0,16,h);}});
// poster on the window piers: «Центр СПЕКТР» colours (drawn, no faces)
const texPoster=canvasTex(256,512,(g,w,h)=>{g.fillStyle='#fafafa';g.fillRect(0,0,w,h);
  const c=['#e52b2b','#f5b800','#2fa84f','#2a6fd6','#8a3fc7','#16a3c4'];
  for(let i=0;i<14;i++){g.fillStyle=c[i%6];g.save();g.translate(Math.random()*w,160+Math.random()*(h-180));g.rotate(Math.random()*3);g.fillRect(-30,-12,60+Math.random()*50,24);g.restore();}
  g.fillStyle='#fafafa';g.fillRect(30,230,w-60,200);g.fillStyle='#d8e6f5';for(let i=0;i<4;i++)g.fillRect(40+(i%2)*95,240+(i>>1)*95,85,85);
  g.fillStyle='#2a6fd6';g.font='bold 30px sans-serif';g.fillText('Центр',20,48);g.fillStyle='#e52b2b';g.font='bold 52px sans-serif';g.fillText('СПЕКТР',14,104);
  g.fillStyle='#555';g.font='16px sans-serif';g.fillText('открытое молодёжное',20,134);g.fillText('пространство',20,154);});
const texCoat=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#d6a24a';g.fillRect(0,0,w,h);g.fillStyle='#c0262b';g.beginPath();g.moveTo(40,30);g.lineTo(216,30);g.lineTo(216,140);g.quadraticCurveTo(216,230,128,246);g.quadraticCurveTo(40,230,40,140);g.closePath();g.fill();
  g.fillStyle='#e9c75a';g.beginPath();g.arc(128,120,52,0,7);g.fill();g.fillStyle='#c0262b';g.beginPath();g.arc(128,120,30,0,7);g.fill();});
const texWoodL=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#c9773a';g.fillRect(0,0,w,h);
  for(let s=0;s<60;s++){g.strokeStyle=`rgba(110,50,15,${Math.random()*.25})`;g.lineWidth=1+Math.random()*2;g.beginPath();let y=Math.random()*h;g.moveTo(0,y);for(let x=0;x<=w;x+=16){y+=(Math.random()-.5)*3;g.lineTo(x,y);}g.stroke();}},[1,1]);
const texDoorW=canvasTex(256,512,(g,w,h)=>{g.fillStyle='#a8642c';g.fillRect(0,0,w,h);
  for(let s=0;s<80;s++){g.strokeStyle=`rgba(70,30,8,${Math.random()*.25})`;g.lineWidth=1+Math.random()*2;g.beginPath();let x=Math.random()*w;g.moveTo(x,0);for(let y=0;y<=h;y+=16){x+=(Math.random()-.5)*3;g.lineTo(x,y);}g.stroke();}
  g.strokeStyle='rgba(60,25,5,.6)';g.lineWidth=6;g.strokeRect(30,30,w-60,200);g.strokeRect(30,270,w-60,210);});

Object.assign(M,{
  granite:new THREE.MeshStandardMaterial({map:texGranite,roughness:.22,metalness:.05}),
  cubes:new THREE.MeshStandardMaterial({map:texCubes,roughness:.35}),
  grid:new THREE.MeshStandardMaterial({map:texGrid,roughness:.8}),
  paint:new THREE.MeshStandardMaterial({map:texPaint,roughness:.9}),
  paintE:new THREE.MeshStandardMaterial({map:texPaintE,roughness:.9}),
  stageTop:new THREE.MeshStandardMaterial({color:0x2c2a28,roughness:.5}),
  truss:new THREE.MeshStandardMaterial({map:texTruss,roughness:.6}),
  blindW:new THREE.MeshStandardMaterial({color:0xf2f2ee,roughness:.9,emissive:0xfffcf2,emissiveIntensity:.85}),
  board:new THREE.MeshStandardMaterial({map:texBoard,roughness:.8}),
  hoop:new THREE.MeshStandardMaterial({map:texHoop,roughness:.5}),
  poster:new THREE.MeshStandardMaterial({map:texPoster,roughness:.6}),
  coat:new THREE.MeshStandardMaterial({map:texCoat,roughness:.5,metalness:.3}),
  woodL:new THREE.MeshStandardMaterial({map:texWoodL,roughness:.35}),
  doorW:new THREE.MeshStandardMaterial({map:texDoorW,roughness:.5}),
  doorWhite:new THREE.MeshStandardMaterial({color:0xe9e9e6,roughness:.5}),
  frameG:new THREE.MeshStandardMaterial({color:0x8d8b86,roughness:.6}),
  redL:new THREE.MeshStandardMaterial({color:0xd0202e,roughness:.35}),
  blueL:new THREE.MeshStandardMaterial({color:0x2c5fae,roughness:.35}),
  limeL:new THREE.MeshStandardMaterial({color:0xc4e07a,roughness:.4}),
  blueMesh:new THREE.MeshStandardMaterial({color:0x2a72d8,roughness:.6}),
  green:new THREE.MeshStandardMaterial({color:0x14805a,roughness:.9}),
  greyDesk:new THREE.MeshStandardMaterial({color:0x5d6064,roughness:.5}),
  case:new THREE.MeshStandardMaterial({color:0xf0f0f0,roughness:.3,transparent:true,opacity:.85}),
  screen:new THREE.MeshStandardMaterial({color:0x0b0d10,roughness:.15,metalness:.4}),
  ledPanel:new THREE.MeshBasicMaterial({color:new THREE.Color(0xffffff).multiplyScalar(2.2)}),
  selo:new THREE.MeshStandardMaterial({map:photo('selo'),roughness:.7}),
  vzlet:new THREE.MeshStandardMaterial({map:photo('vzlet'),roughness:.7}),
  knigi:new THREE.MeshStandardMaterial({map:photo('knigi',[1,1]),roughness:.6}),
  diplomy:new THREE.MeshStandardMaterial({map:photo('diplomy'),roughness:.5}),
  cushion:new THREE.MeshStandardMaterial({color:0x2d63c8,roughness:.8}),
  sofa:new THREE.MeshStandardMaterial({color:0x2b62b8,roughness:.4}),
  guitar:new THREE.MeshStandardMaterial({color:0xc58a3c,roughness:.3}),
});
M.knigi.map.wrapS=THREE.RepeatWrapping;

// a group placed at (x,z) turned by ry (multiples of 90°); solids are given in local coords and turned the same way
function place(x,z,ry){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry||0;room.add(g);return g;}
function lsolid(g,x0,x1,y0,y1,z0,z1){const c=Math.round(Math.cos(g.rotation.y)),s=Math.round(Math.sin(g.rotation.y));
  const P=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]].map(([x,z])=>[g.position.x+x*c+z*s,g.position.z-x*s+z*c]);
  solid(Math.min(...P.map(p=>p[0])),Math.max(...P.map(p=>p[0])),y0,y1,Math.min(...P.map(p=>p[1])),Math.max(...P.map(p=>p[1])));}
function lbox(g,x0,x1,y0,y1,z0,z1,mat,sol){add(new THREE.BoxGeometry(x1-x0,y1-y0,z1-z0),mat,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2,{par:g});if(sol)lsolid(g,x0,x1,y0,y1,z0,z1);}
function plane(w,h,mat,x,y,z,ry,par){const m=add(new THREE.PlaneGeometry(w,h),mat,x,y,z,{ry,noCast:true,par});return m;}

// office armchair (the red / blue / lime ones): faces +z locally
function chair(x,z,ry,mat){const g=place(x,z,ry);const fr=M.black;
  lbox(g,-0.27,0.27,0.44,0.52,-0.22,0.26,mat);             // seat
  add(new THREE.BoxGeometry(0.52,0.5,0.07),mat,0,0.78,-0.25,{par:g,rx:-0.12}); // back
  for(const sx of [-1,1]){lbox(g,sx*0.3-0.02,sx*0.3+0.02,0.62,0.66,-0.2,0.24,fr);lbox(g,sx*0.3-0.015,sx*0.3+0.015,0,0.64,0.2,0.24,fr);lbox(g,sx*0.3-0.015,sx*0.3+0.015,0,0.5,-0.24,-0.2,fr);
    lbox(g,sx*0.3-0.02,sx*0.3+0.02,0,0.03,-0.26,0.26,fr);}
  lsolid(g,-0.32,0.32,0,0.52,-0.27,0.27);lsolid(g,-0.3,0.3,0.52,1.05,-0.3,-0.2);return g;}
function officeChair(x,z,ry,mat){const g=place(x,z,ry);
  lbox(g,-0.24,0.24,0.46,0.53,-0.22,0.24,M.black);add(new THREE.BoxGeometry(0.46,0.55,0.05),mat,0,0.85,-0.24,{par:g,rx:-0.1});
  add(new THREE.CylinderGeometry(0.025,0.025,0.42,8),M.alu,0,0.25,0,{par:g});
  for(let i=0;i<5;i++)add(new THREE.BoxGeometry(0.03,0.03,0.3),M.black,Math.sin(i*1.257)*0.14,0.04,Math.cos(i*1.257)*0.14,{par:g,ry:i*1.257});
  lsolid(g,-0.28,0.28,0,0.53,-0.28,0.28);}
function speaker(x,z,ry,stand){const g=place(x,z,ry);const y=stand?1.35:0;
  if(stand){add(new THREE.CylinderGeometry(0.018,0.018,1.35,8),M.black,0,0.67,0,{par:g});for(let i=0;i<3;i++)add(new THREE.BoxGeometry(0.02,0.02,0.6),M.black,Math.sin(i*2.09)*0.24,0.12,Math.cos(i*2.09)*0.24,{par:g,ry:i*2.09,rx:0.45});lsolid(g,-0.03,0.03,0,1.35,-0.03,0.03);}
  lbox(g,-0.2,0.2,y,y+0.62,-0.17,0.17,M.black,true);add(new THREE.CircleGeometry(0.13,20),M.darkgrey,0,y+0.24,0.175,{par:g});}
function hoop(x,y,z,ry,r,hang){const t=add(new THREE.TorusGeometry(r,0.022,10,48),M.hoop,x,y,z,{ry});
  if(hang){for(const s of [-1,1])add(new THREE.CylinderGeometry(0.003,0.003,H-y-r*0.7,4),M.white,x+Math.cos(ry||0)*s*r*0.6,(H+y+r*0.7)/2,z-Math.sin(ry||0)*s*r*0.6,{noCast:true});}
  else{add(new THREE.CylinderGeometry(0.02,0.02,y-r,8),M.black,x,(y-r)/2,z);add(new THREE.CylinderGeometry(0.2,0.22,0.03,16),M.black,x,0.015,z);solid(x-0.04,x+0.04,0,y-r,z-0.04,z+0.04);}
  return t;}

const HOOPS=[];
function buildRoom(){
  // floor, nook floor, ceiling
  add(new THREE.PlaneGeometry(L,W),M.granite,L/2,0,W/2,{rx:-Math.PI/2,noCast:true});
  add(new THREE.PlaneGeometry(COLS[1][1]-COLS[0][0]+0.6,CZ[0]),M.cubes,(COLS[0][0]+COLS[1][1])/2,0.002,CZ[0]/2,{rx:-Math.PI/2,noCast:true});
  add(new THREE.PlaneGeometry(L,W),M.grid,L/2,H,W/2,{rx:Math.PI/2,noCast:true});
  // walls: thick boxes outside the room (the inner face is what you see)
  box(-0.3,0,0,H,-0.3,W+0.3,M.paint);box(L,L+0.3,0,H,-0.3,W+0.3,M.paintE);
  box(-0.3,L+0.3,0,H,-0.3,0,M.paint);box(-0.3,L+0.3,0,H,W,W+0.3,M.paint);
  // south wall: 4 windows with white roller blinds (bright daylight behind), white sills with blue mats
  for(const cx of [2.0,4.6,7.2,9.8]){
    box(cx-0.98,cx+0.98,0.84,0.87,W-0.25,W,M.white);
    box(cx-0.85,cx+0.85,0.87,0.93,W-0.24,W-0.02,M.cushion,{solid:false});
    plane(1.9,1.72,M.blindW,cx,1.72,W-0.03,Math.PI);
    box(cx-0.98,cx+0.98,2.58,2.66,W-0.12,W,M.white,{solid:false});
  }
  // posters on the piers between windows
  plane(0.5,1.0,M.poster,3.3,1.6,W-0.01,Math.PI);plane(0.5,1.0,M.poster,8.5,1.6,W-0.01,Math.PI);
  // columns: grey, wooden slats on the corners, small wooden plaques
  for(const [x0,x1] of COLS){box(x0,x1,0,H,CZ[0],CZ[1],M.paint);
    for(const [sx,sz] of [[x0-0.01,CZ[1]+0.01],[x1+0.01,CZ[1]+0.01],[x0-0.01,CZ[0]-0.01],[x1+0.01,CZ[0]-0.01]])box(sx-0.02,sx+0.02,0,H,sz-0.02,sz+0.02,M.woodL,{solid:false});
    box((x0+x1)/2-0.15,(x0+x1)/2+0.15,1.85,2.05,CZ[1],CZ[1]+0.015,M.beige,{solid:false});}

  // ===== stage (west end): dark top, white truss skirt, steps with white rails on the north side =====
  const S0=STAGE;box(S0.x0,S0.x1,0,S0.h,S0.z0,S0.z1,M.stageTop);
  plane(S0.z1-S0.z0,S0.h,M.truss,S0.x1+0.005,S0.h/2,(S0.z0+S0.z1)/2,Math.PI/2);
  box(0.8,1.8,0,0.15,1.75,2.3,M.stageTop);box(0.8,1.8,0,0.3,1.95,2.3,M.stageTop);
  for(const x of [0.8,1.8]){box(x-0.02,x+0.02,0,1.3,1.8,1.84,M.white,{solid:false});add(new THREE.BoxGeometry(0.04,0.04,0.9),M.white,x,1.05,2.1,{rx:0.6});}
  box(2.0,2.35,S0.h,S0.h+1.15,2.4,2.75,M.white);                        // lectern
  add(new THREE.PlaneGeometry(0.4,0.5),M.coat,0.01,2.2,4.65,{ry:Math.PI/2,noCast:true});   // coat of arms on the stage wall
  // flags and a tricolour corner on the stage
  add(new THREE.CylinderGeometry(0.012,0.012,1.9,6),M.alu,0.3,S0.h+0.95,6.6);
  for(const [c,y] of [[0xf4f4f4,2.15],[0x1f4fbf,1.95],[0xd8262a,1.75]])add(new THREE.BoxGeometry(0.01,0.2,0.6),new THREE.MeshStandardMaterial({color:c,roughness:.8,side:THREE.DoubleSide}),0.3,y,6.3);
  speaker(2.75,2.55,Math.PI/2,true);speaker(2.75,6.75,Math.PI/2,true);
  speaker(0.5,2.6,Math.PI/2,false);
  // subwoofers on the floor in front of the stage corners
  box(2.55,3.0,0,0.55,6.2,6.6,M.black);box(2.55,3.0,0,0.55,2.75,3.15,M.black);

  // ===== centre: two wooden conference tables + the desk with a keyboard in front of the stage =====
  const tableAt=(x0,x1,z0,z1,mat)=>{box(x0,x1,0.72,0.76,z0,z1,mat);for(const [lx,lz] of [[x0+0.05,z0+0.05],[x1-0.05,z0+0.05],[x0+0.05,z1-0.05],[x1-0.05,z1-0.05]])box(lx-0.025,lx+0.025,0,0.72,lz-0.025,lz+0.025,M.alu);};
  tableAt(4.3,5.2,3.1,4.6,M.woodL);tableAt(5.22,6.12,3.1,4.6,M.woodL);
  tableAt(3.0,4.2,3.4,4.0,M.woodL);box(3.3,3.75,0.76,0.785,3.55,3.7,M.black,{solid:false});
  officeChair(3.6,4.4,Math.PI,M.blueMesh);

  // ===== red / blue chairs along the windows, lime chairs under the blackboard =====
  for(let i=0;i<14;i++)chair(3.0+i*0.585,6.92,Math.PI,i%2?M.redL:M.blueL);
  for(let i=0;i<5;i++)chair(11.08,2.5+i*0.62,-Math.PI/2,M.limeL);
  // a few chairs facing the windows in front of the columns
  for(let i=0;i<4;i++)chair(4.3+i*0.6,2.6,0,i%2?M.blueL:M.redL);

  // ===== east wall: chalkboard, white door, double wooden door in the nook =====
  plane(2.4,1.2,M.board,L-0.01,1.6,3.75,-Math.PI/2);
  box(L-0.06,L,0.95,0.98,2.6,4.9,M.woodL,{solid:false});
  plane(0.9,2.05,M.doorWhite,L-0.01,1.025,5.85,-Math.PI/2);
  for(const z of [5.36,6.34])box(L-0.05,L,0,2.12,z-0.04,z+0.04,M.frameG,{solid:false});box(L-0.05,L,2.06,2.14,5.36,6.34,M.frameG,{solid:false});
  plane(1.4,2.1,M.doorW,L-0.01,1.05,0.9,-Math.PI/2);box(L-0.04,L,1.0,1.03,0.86,0.94,M.alu,{solid:false});

  // ===== computer nook (behind the columns, z 0..1.65) =====
  // three grey desks with PCs: 3.4 m along the north wall
  for(let i=0;i<3;i++){const x0=COLS[0][1]+0.15+i*1.13,x1=x0+1.1;
    box(x0,x1,0.72,0.75,0.02,0.62,M.greyDesk);box(x0+0.02,x0+0.05,0,0.72,0.05,0.6,M.greyDesk);box(x1-0.05,x1-0.02,0,0.72,0.05,0.6,M.greyDesk);
    box(x0+0.2,x0+0.75,0.85,1.18,0.15,0.18,M.screen);box(x0+0.44,x0+0.5,0.75,0.86,0.15,0.2,M.black,{solid:false});
    box(x0+0.82,x1-0.04,0.75,1.12,0.08,0.46,M.case);box(x0+0.25,x0+0.7,0.75,0.77,0.32,0.46,M.black,{solid:false});
    officeChair(x0+0.5,1.0,Math.PI,i===1?M.redL:M.blueMesh);}
  // banners above the desks (photos from the hall)
  plane(1.6,0.78,M.selo,4.75,1.75,0.01,0);plane(1.6,0.75,M.vzlet,6.55,1.75,0.01,0);
  // aluminium pendant lamps
  for(const x of [4.7,6.5]){add(new THREE.CylinderGeometry(0.003,0.003,0.6,4),M.black,x,H-0.3,0.8,{noCast:true});
    add(new THREE.CylinderGeometry(0.06,0.24,0.16,20,1,true),new THREE.MeshStandardMaterial({color:0xc8ccd0,metalness:.85,roughness:.25,side:THREE.DoubleSide}),x,H-0.66,0.8,{noCast:true});
    add(new THREE.CircleGeometry(0.22,20),M.lamp,x,H-0.735,0.8,{rx:Math.PI/2,noCast:true});}
  // book-wall partition at the west end of the nook, facing the hall
  const bk=place(2.95,1.2,Math.PI/2);lbox(bk,-0.55,0.55,0,2.0,-0.03,0.03,M.black,true);
  plane(1.08,1.98,M.knigi,0,1.0,0.035,0,bk);plane(1.08,1.98,M.knigi,0,1.0,-0.035,Math.PI,bk);
  // west end of the nook: diplomas, sound rack under a green cloth, wooden cabinet with a monitor
  plane(1.7,1.27,M.diplomy,1.25,1.75,0.01,0);
  box(0.25,0.95,0,0.95,0.15,0.75,M.green);box(1.75,2.45,0,1.0,0.05,0.6,M.wood);box(1.85,2.35,1.0,1.35,0.25,0.28,M.screen);
  box(2.2,2.65,0.75,0.95,0.15,0.45,M.white,{solid:false});    // printer boxes on top
  // east end of the nook: shelves with books and a guitar, blue sofa, coffee table
  box(7.6,9.4,0,2.1,0.02,0.4,M.wood);
  for(let i=1;i<5;i++)box(7.62,9.38,i*0.42,i*0.42+0.02,0.4,0.42,M.wood,{solid:false});
  plane(1.7,1.6,M.knigi,8.5,1.25,0.415,0);
  add(new THREE.CylinderGeometry(0.17,0.19,0.08,20),M.guitar,7.45,0.75,0.3,{rx:Math.PI/2});box(7.43,7.47,0.8,1.5,0.29,0.32,M.wood,{solid:false});
  box(7.7,9.3,0,0.42,0.5,1.25,M.sofa);box(7.7,9.3,0.42,0.85,0.5,0.7,M.sofa);
  box(8.1,8.9,0.4,0.43,1.35,1.6,M.woodL);box(8.15,8.2,0,0.4,1.4,1.45,M.alu,{solid:false});box(8.8,8.85,0,0.4,1.4,1.45,M.alu,{solid:false});
  // coat corner by the double door: hook rail, shoe shelves, red coat stand
  box(9.7,11.4,1.68,1.75,0.0,0.06,M.wood);for(let i=0;i<12;i++)box(9.8+i*0.13,9.82+i*0.13,1.6,1.7,0.04,0.12,M.alu,{solid:false});
  box(9.7,11.0,0.3,0.33,0.0,0.32,M.alu);box(9.7,11.0,0.0,0.03,0.0,0.32,M.alu);
  {const x=10.95,z=0.9;add(new THREE.CylinderGeometry(0.02,0.02,1.8,8),M.red,x,0.9,z);for(let i=0;i<4;i++)add(new THREE.BoxGeometry(0.02,0.02,0.4),M.red,x+Math.sin(i*1.57)*0.12,1.7,z+Math.cos(i*1.57)*0.12,{ry:i*1.57,rx:-0.5});solid(x-0.05,x+0.05,0,1.8,z-0.05,z+0.05);}

  // ===== ceiling: LED panels, projector, track spotlights near the stage =====
  for(const x of [1.6,4.4,7.2,10.0])for(const z of [2.9,5.4])add(new THREE.PlaneGeometry(0.58,0.58),M.ledPanel,x,H-0.005,z,{rx:Math.PI/2,noCast:true});
  for(const x of [4.6,7.6,10.4])add(new THREE.PlaneGeometry(0.58,0.58),M.ledPanel,x,H-0.005,0.85,{rx:Math.PI/2,noCast:true});
  box(5.2,5.6,H-0.32,H-0.18,4.3,4.65,M.white,{solid:false});box(5.38,5.42,H-0.18,H,4.45,4.5,M.alu,{solid:false});
  for(const z of [3.0,5.6]){box(2.8,3.0,H-0.04,H,z-0.6,z+0.6,M.black,{solid:false});for(let i=0;i<3;i++)add(new THREE.CylinderGeometry(0.035,0.04,0.12,10),M.black,2.9,H-0.12,z-0.4+i*0.4,{rx:0.5,rz:0.3});}

  // ===== FPV hoops: hanging from the grid + two on stands =====
  HOOPS.push(hoop(3.1,1.95,1.9,Math.PI/2,0.33,true));
  HOOPS.push(hoop(5.6,1.75,5.3,0,0.38,true));
  HOOPS.push(hoop(8.6,1.85,3.9,Math.PI/2,0.38,true));
  HOOPS.push(hoop(8.8,1.1,5.0,0,0.45,false));
  HOOPS.push(hoop(4.0,1.1,5.5,Math.PI/2,0.45,false));
}

function buildCeiling(){}
function applyCeiling(){}

/* ---------- Lights: daylight through the blinds + LED panels; at night only a flashlight ---------- */
const hemi=new THREE.HemisphereLight(0xffffff,0x8a8070,0.55);
const sunL=new THREE.DirectionalLight(0xfff6ea,0.35);
const ceilL=new THREE.SpotLight(0xffffff,1.15,9*K,1.35,0.8,1);
const pts=[];
const flash=new THREE.SpotLight(0xfff2d8,0,16*K,0.48,0.45,1.4);
function buildLights(){
  scene.add(hemi);
  sunL.position.set(L/2*K,2*K,(W+3)*K);sunL.target.position.set(L/2*K,0,W/2*K);scene.add(sunL,sunL.target);
  ceilL.position.set(5.5*K,(H-0.05)*K,4*K);ceilL.target.position.set(5.5*K,0,4.01*K);scene.add(ceilL,ceilL.target);
  ceilL.shadow.camera.near=0.2*K;ceilL.shadow.camera.far=(H+1)*K;ceilL.shadow.bias=-0.0004;ceilL.shadow.normalBias=0.02*K;
  for(const [x,z] of [[1.6,4.1],[9.6,4.1],[5.5,0.85],[10.4,1.2]]){const p=new THREE.PointLight(0xfff8f0,0.45,7*K,1.2);p.position.set(x*K,(H-0.25)*K,z*K);scene.add(p);pts.push(p);}
  camFPV.add(flash);flash.position.set(0,0,0);flash.target.position.set(0,0,-1);camFPV.add(flash.target);
}
// night for the escape game: lights off, a little moonlight through the blinds, the flashlight on
let night=false;
function setNight(on){
  night=on;hemi.intensity=on?0.035:0.55;hemi.color.setHex(on?0x8090c0:0xffffff);
  sunL.intensity=on?0.06:0.35;sunL.color.setHex(on?0x7f95d0:0xfff6ea);
  ceilL.intensity=on?0:1.15;for(const p of pts)p.intensity=on?0:0.45;
  M.ledPanel.color.setScalar(on?0.08:2.2);M.lamp.color.setRGB(on?0.1:6,on?0.1:5.8,on?0.1:5.5);
  M.blindW.emissiveIntensity=on?0.05:0.85;M.blindW.emissive.setHex(on?0x8ea6e0:0xfffcf2);
  flash.intensity=on?2.4:0;scene.background.setHex(on?0x020305:0x07090b);
}

/* ---------- Lights ---------- */
const fxHi=[];
function applyQuality(){
  const q=+S.q;
  renderer.setPixelRatio(q>=3?Math.min(2,Math.max(1.5,devicePixelRatio||1)):Math.min(devicePixelRatio||1,[1,1.5,2][q]));
  renderer.shadowMap.enabled=q>=1;ceilL.castShadow=q>=1;
  const ms=q>=3?4096:q>=2?2048:1024;if(ceilL.shadow.mapSize.x!==ms){ceilL.shadow.mapSize.set(ms,ms);if(ceilL.shadow.map){ceilL.shadow.map.dispose();ceilL.shadow.map=null;}}
  for(const o of fxHi)o.visible=q>=1&&!WALK;
  applyCeiling();
  scene.traverse(o=>{if(o.material&&!Array.isArray(o.material))o.material.needsUpdate=true;});
  setupPost();resize();
}

/* dust floating in the lamp light: sells the tiny scale */
let dust=null;
function buildDust(){
  const n=900,p=new Float32Array(n*3);
  for(let i=0;i<n;i++){p[i*3]=Math.random()*L*K;p[i*3+1]=Math.random()*H*K;p[i*3+2]=Math.random()*W*K;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
  dust=new THREE.Points(g,new THREE.PointsMaterial({map:texGlow,color:0xfff0d0,size:0.35*Math.max(K/30,0.15),transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
  scene.add(dust);fxHi.push(dust);
}

/* ---------- Fireflies: glowing points hidden around the room ---------- */
// real-metre spots in the hall: stage, speakers, hoops, tables, under the desks, PCs, lamps, shelves, sofa, coat hooks, blackboard, sills, blinds, projector
const FLY_SPOTS=[[1.2,0.9,4.6],[0.5,0.75,2.6],[2.75,2.15,2.55],[2.75,2.15,6.75],[3.1,1.95,1.9],[5.6,1.75,5.3],[8.6,1.85,3.9],[8.8,1.1,5.0],[4.0,1.1,5.5],
  [4.75,0.95,3.85],[3.6,0.3,3.7],[5.0,0.35,0.35],[6.2,1.3,0.12],[4.7,1.95,0.8],[8.5,2.25,0.2],[8.5,0.6,0.9],[10.3,1.5,0.15],[11.2,0.75,3.1],[11.3,1.05,3.75],
  [9.8,1.05,7.15],[2.0,2.4,7.1],[5.4,2.55,4.5],[7.2,2.7,2.9],[2.95,2.15,1.2],[0.6,1.1,0.45],[6.3,0.25,6.6],[2.17,1.75,2.57],[1.0,0.65,6.6]];
const GLOW={walk:0.3,drone:0.15,muha:0.075}[S.scale];
const FLIES=[];
function buildFlies(){
  const core=new THREE.SphereGeometry(GLOW*0.08*K,10,8);
  for(const s of FLY_SPOTS){if(WALK&&s[1]>2.2)continue;const g=new THREE.Group();g.position.set(s[0]*K,s[1]*K,s[2]*K);
    g.add(new THREE.Mesh(core,new THREE.MeshBasicMaterial({color:new THREE.Color(0xd8ff7a).multiplyScalar(3)})));
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:0xc8ff5a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));sp.scale.set(GLOW*K,GLOW*K,1);g.add(sp);
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
  blob.visible=!WALK&&(S.cam!=='fpv'||h>0.3);
  if(dust&&dust.visible){dust.rotation.y=Math.sin(now/20000)*0.01;dust.position.y=Math.sin(now/5000)*0.6;}
  for(const f of FLIES)if(f.visible){const u=f.userData;f.position.y=u.base+Math.sin(now/600+u.ph)*GLOW*0.1*K;f.children[1].material.opacity=0.7+0.3*Math.sin(now/180+u.ph);}
}

/* ---------- Input ---------- */
const inp={thr:0,yaw:0,pitch:0,roll:0,ly:0,src:'kbd'};
const keys=new Set();
addEventListener('keydown',e=>{
  if(e.repeat)return;keys.add(e.code);srcPref='kbd';
  if(!playing)return;
  if(e.code==='Space'){if(WALK)P.jumpReq=true;else toggleArm();e.preventDefault();}
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
    if(!(side==='L'&&!soft()))st.y=0;draw();};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  draw();
}
let srcPref='kbd', padPrevAxes=null, touchBoost=false;
function touchMode(){if(WALK){$('bArm').hidden=false;$('bArm').textContent='ПРЫЖОК';$('bBat').hidden=true;$('bBoost').hidden=false;$('bBoost').textContent='БЕГ';$('bCam').hidden=true;$('armed').style.display='none';
    $('stL').querySelector('span').textContent='ИДТИ';$('stR').querySelector('span').textContent='СМОТРЕТЬ';return;}
  const f=S.mode==='fly';$('bArm').hidden=f;$('bBat').hidden=f;$('bBoost').hidden=!f;$('armed').style.display=f?'none':'';}
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
  let thr,yaw,pitch,roll,ly,boost=false;
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
    if(WALK){boost=!!(p.buttons[4]&&p.buttons[4].pressed)||!!(p.buttons[10]&&p.buttons[10].pressed);const j=!!(p.buttons[0]&&p.buttons[0].pressed);if(j&&!padPrevBtn)P.jumpReq=true;padPrevBtn=j;}
    else if(S.mode==='fly'){boost=p.buttons.some(b=>b.pressed);padPrevBtn=boost;}else{
    const b=p.buttons.some(b=>b.pressed);
    if(b&&!padPrevBtn&&playing)toggleArm();
    else if(!b&&padPrevBtn&&S.pad&&D.armed&&playing)toggleArm();
    padPrevBtn=b;}
  }else if(srcPref==='touch'){
    src='touch';
    yaw=touchSt.L.x;ly=touchSt.L.y;pitch=touchSt.R.y;roll=touchSt.R.x;thr=(ly+1)/2;boost=touchBoost;
  }else{
    const k=c=>keys.has(c)?1:0;
    yaw=k('KeyD')-k('KeyA');pitch=k('ArrowUp')-k('ArrowDown');roll=k('ArrowRight')-k('ArrowLeft');boost=keys.has('ShiftLeft')||keys.has('ShiftRight');
    if(soft()){ly=k('KeyW')-k('KeyS');kbThr=(ly+1)/2;}
    else{kbThr=clamp(kbThr+(k('KeyW')-k('KeyS'))*dt*0.7,0,1);ly=kbThr*2-1;}
    thr=kbThr;
    const sm=1-Math.exp(-dt*8);
    yaw=inp.yaw+(yaw-inp.yaw)*sm;pitch=inp.pitch+(pitch-inp.pitch)*sm;roll=inp.roll+(roll-inp.roll)*sm;
  }
  Object.assign(inp,{thr,yaw,pitch,roll,ly,src,boost:!!boost});
}

/* ---------- Flight model (from the FPV game) ---------- */
const MAXACC=2.6*G;
const R_DRONE=0.17;
const BAT={cells:4,cap:1300};
const D={pos:new THREE.Vector3(),vel:new THREE.Vector3(),q:new THREE.Quaternion(),w:new THREE.Vector3(),heading:0,
  armed:false,landed:true,crashed:0,yawRate:0,boostK:0,crashReason:'',used:0,amps:0,vcell:4.2,flightTime:0,thrOut:0,propSpin:0};
const _v=new THREE.Vector3(),_v2=new THREE.Vector3(),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_e=new THREE.Euler(0,0,0,'YXZ'),UP=new THREE.Vector3(0,1,0);
function ocv(c){const pts=[[0,3.3],[.08,3.5],[.2,3.68],[.5,3.82],[.8,4.0],[1,4.2]];
  for(let i=1;i<pts.length;i++)if(c<=pts[i][0]){const [a,va]=pts[i-1],[b,vb]=pts[i];return va+(vb-va)*(c-a)/(b-a);}return 4.2;}
function charge(){return clamp(1-D.used/BAT.cap,0,1);}
// start: on the table next to the laptop, nose to the window
const START=WALK?{pos:V3(10.55*K,0,6.05*K),heading:Math.PI/2}:{pos:V3(5.2*K,0.761*K,3.85*K),heading:Math.PI/2}; // on foot by the white door; drones on the conference table, nose to the stage
const trail=[];let trailT=0;     // recent safe positions: a novice comes back in the air after a crash
function resetDrone(full){
  D.pos.copy(START.pos);D.vel.set(0,0,0);D.w.set(0,0,0);D.heading=START.heading;D.q.setFromEuler(_e.set(0,D.heading,0));
  D.armed=S.mode==='fly'||WALK;P.pitch=0;P.stamina=1;P.runLock=false;P.eye=EYE;D.landed=true;D.crashed=0;D.thrOut=0;D.yawRate=0;trail.length=0;
  if(full!==false){D.used=0;D.flightTime=0;}
  kbThr=0;touchSt.L.y=soft()?0:-1;touchSt.L.draw&&touchSt.L.draw();
  updArm();
}
function respawnAir(){
  const p=trail.length>4?trail[trail.length-5]:null;
  if(!p||S.mode!=='nov'){resetDrone(false);return;}
  D.pos.copy(p.pos);D.heading=p.h;D.q.setFromEuler(_e.set(0,D.heading,0));D.vel.set(0,0,0);D.w.set(0,0,0);
  D.crashed=0;D.landed=false;D.armed=charge()>0.01;trail.length=0;updArm();toast('Ещё попытка: дрон снова в воздухе');
}
function toggleArm(){
  if(WALK){P.jumpReq=true;return;}
  if(D.crashed||S.mode==='fly')return;
  if(D.armed){D.armed=false;updArm();toast('Моторы сняты с взвода');return;}
  const low=S.mode==='nov'?inp.ly<=0.15:inp.thr<0.08;
  if(!low){toast('Сначала газ вниз!','bad');return;}
  if(charge()<=0.01){toast('АКБ пустой. Сядь и нажми АКБ','bad');return;}
  D.armed=true;updArm();toast('Взведено. Взлетай!');
}
function updArm(){if(WALK)return;const a=$('armed');a.textContent=D.armed?'ARMED':'DISARM';a.classList.toggle('on',D.armed);const b=$('bArm');b.textContent=D.armed?'СНЯТЬ':'ВЗВЕСТИ';b.classList.toggle('on',D.armed);}
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
// «Плавный полёт»: no drone physics. The body glides toward the stick velocity with a soft lag (a little drift),
// banks into turns, Shift/boost button speeds it up. Bumps never crash.
const FLY={spd:7,up:4.5,boost:2.6,grip:1.7};
function stepFly(dt){
  const b=inp.boost?FLY.boost:1;
  D.boostK+=((inp.boost?1:0)-D.boostK)*(1-Math.exp(-dt*3));
  D.yawRate+=(-inp.yaw*1.9-D.yawRate)*(1-Math.exp(-dt*5));
  D.heading+=D.yawRate*dt;
  const fwd=inp.pitch*FLY.spd*b,right=inp.roll*FLY.spd*b,up=inp.ly*FLY.up*Math.sqrt(b);
  const sh=Math.sin(D.heading),ch=Math.cos(D.heading);
  _v.set(-sh*fwd+ch*right,up,-ch*fwd-sh*right);
  // horizontal velocity follows slower than vertical: that is the slight drift in turns
  const kh=1-Math.exp(-dt*FLY.grip*(inp.boost?0.8:1)),kv=1-Math.exp(-dt*3);
  D.vel.x+=(_v.x-D.vel.x)*kh;D.vel.z+=(_v.z-D.vel.z)*kh;D.vel.y+=(_v.y-D.vel.y)*kv;
  if(D.landed&&up<=0.05)D.vel.y=Math.min(D.vel.y,0);
  // lean: forward speed tips the nose, turning and sideways drift bank the body
  const vf=-sh*D.vel.x-ch*D.vel.z,vr=ch*D.vel.x-sh*D.vel.z;
  _q2.setFromEuler(_e.set(clamp(-vf*0.018,-0.35,0.35),D.heading,clamp(D.yawRate*0.22-vr*0.03,-0.5,0.5)));
  D.q.slerp(_q2,1-Math.exp(-dt*6));D.q.normalize();
  D.thrOut=clamp(0.35+D.vel.length()/30,0,1);D.amps=0;D.vcell=4.2;
  D.flightTime+=dt;
  D.pos.addScaledVector(D.vel,dt);
  collide();
}
function step(dt){
  if(WALK){stepWalk(dt);return;}
  if(S.mode==='fly'){stepFly(dt);return;}
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
    if(S.mode==='fly'){if(vy>2)thud(vy);p.y=0;D.vel.y=Math.max(0,D.vel.y);D.landed=true;}
    else{
    if(vy>CRASH_V)return crash('удар о пол');
    if(tl>55&&(hs>1.5||D.armed))return crash('дрон лёг на бок');
    p.y=0;D.vel.y=0;D.vel.x*=0.8;D.vel.z*=0.8;D.landed=true;settle();}
  }else if(p.y>0.03)D.landed=false;
  const sp=D.vel.length();
  const top=H*K-R_DRONE;if(p.y>top){p.y=top;if(S.mode==='fly'){if(D.vel.y>2)thud(D.vel.y);}else if(sp>CRASH_V)return crash('удар о потолок');D.vel.y=Math.min(D.vel.y,0)*-0.3;}
  p.x=clamp(p.x,R_DRONE,L*K-R_DRONE);p.z=clamp(p.z,R_DRONE,W*K-R_DRONE);
  for(const b of boxes){
    if(p.x>b.min.x-R_DRONE&&p.x<b.max.x+R_DRONE&&p.y>b.min.y-R_DRONE&&p.y<b.max.y+R_DRONE&&p.z>b.min.z-R_DRONE&&p.z<b.max.z+R_DRONE){
      const o=[[p.x-(b.min.x-R_DRONE),'x',-1],[(b.max.x+R_DRONE)-p.x,'x',1],[p.y-(b.min.y-R_DRONE),'y',-1],[(b.max.y+R_DRONE)-p.y,'y',1],[p.z-(b.min.z-R_DRONE),'z',-1],[(b.max.z+R_DRONE)-p.z,'z',1]].sort((a,b)=>a[0]-b[0])[0];
      const vn=D.vel[o[1]]*o[2]; // speed into the surface
      if(S.mode==='fly'){if(-vn>2.5)thud(-vn);}
      else if(-vn>CRASH_V)return crash(o[1]==='y'&&o[2]>0?'жёсткая посадка':'столкновение');
      p[o[1]]+=o[0]*o[2];
      if(vn<0)D.vel[o[1]]*=S.mode==='fly'?-0.15:-0.3;
      if(o[1]==='y'&&o[2]>0){D.vel.y=Math.max(D.vel.y,0);D.landed=true;if(S.mode!=='fly'){D.vel.x*=0.9;D.vel.z*=0.9;if(tiltDeg()<40)settle();}}
    }
  }
}

/* ---------- Walking (first person): feet at D.pos, mouse / right stick to look ---------- */
const EYE=1.6, PR=0.25, STEP=0.47, PH=1.75;
const P={pitch:0,onGround:true,stamina:1,jumpReq:false,eye:EYE,bob:0,stepT:0,runLock:false};
let lookDX=0,lookDY=0;
renderer.domElement.addEventListener('click',()=>{if(WALK&&playing&&!matchMedia('(pointer:coarse)').matches&&renderer.domElement.requestPointerLock)try{renderer.domElement.requestPointerLock();}catch(e){}});
addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer.domElement){lookDX+=e.movementX;lookDY+=e.movementY;}});
function blockedAt(x,y,z,r){r=r*K;for(const b of boxes)if(x>b.min.x-r&&x<b.max.x+r&&z>b.min.z-r&&z<b.max.z+r&&b.max.y>y+STEP*K&&b.min.y<y+PH*K)return true;return false;}
function groundAt(x,z,y,r){r=(r||PR)*K*0.6;let g=0;for(const b of boxes)if(x>b.min.x-r&&x<b.max.x+r&&z>b.min.z-r&&z<b.max.z+r&&b.max.y<=y+STEP*K)g=Math.max(g,b.max.y);return g;}
function stepWalk(dt){
  let fwd=0,str=0,turn=0,look=0,run=false;
  if(inp.src==='kbd'){const k=c=>keys.has(c)?1:0;
    fwd=k('KeyW')+k('ArrowUp')-k('KeyS')-k('ArrowDown');str=k('KeyD')-k('KeyA');turn=k('ArrowRight')+k('KeyE')-k('ArrowLeft')-k('KeyQ');run=keys.has('ShiftLeft')||keys.has('ShiftRight');}
  else{fwd=inp.ly;str=inp.yaw;turn=inp.roll;look=inp.pitch;run=inp.boost;}
  if(window.__M&&__M.walk){({fwd,str,turn,look,run}=Object.assign({fwd:0,str:0,turn:0,look:0,run:false},__M.walk));}
  D.heading-=turn*2.0*dt+lookDX*0.0024;
  P.pitch=clamp(P.pitch+look*1.6*dt-lookDY*0.0024,-1.35,1.35);lookDX=lookDY=0;
  // stamina only matters when something chases you
  const moving=Math.hypot(fwd,str)>0.1;
  if(run&&moving&&!P.runLock){P.stamina-=dt/(game.kind==='esc'?4.5:1e9);if(P.stamina<=0){P.stamina=0;P.runLock=true;}}
  else{P.stamina=Math.min(1,P.stamina+dt*0.16);if(P.stamina>0.35)P.runLock=false;}
  const sp=(run&&!P.runLock?3.6:1.6)*K;
  const sh=Math.sin(D.heading),ch=Math.cos(D.heading);
  _v.set(-sh*fwd+ch*str,0,-ch*fwd-sh*str);if(_v.length()>1)_v.normalize();_v.multiplyScalar(sp);
  const kh=1-Math.exp(-dt*(P.onGround?10:2));D.vel.x+=(_v.x-D.vel.x)*kh;D.vel.z+=(_v.z-D.vel.z)*kh;
  if(P.jumpReq&&P.onGround){D.vel.y=3.7*Math.sqrt(K);P.onGround=false;}P.jumpReq=false;
  D.vel.y-=G*K*dt;
  const p=D.pos;
  let nx=p.x+D.vel.x*dt;if(!blockedAt(nx,p.y,p.z,PR))p.x=nx;else D.vel.x=0;
  let nz=p.z+D.vel.z*dt;if(!blockedAt(p.x,p.y,nz,PR))p.z=nz;else D.vel.z=0;
  p.x=clamp(p.x,PR*K,(L-PR)*K);p.z=clamp(p.z,PR*K,(W-PR)*K);
  const g=groundAt(p.x,p.z,p.y);
  p.y+=D.vel.y*dt;
  if(p.y<=g){if(D.vel.y<-6*Math.sqrt(K))thud(-D.vel.y);p.y=g;D.vel.y=0;P.onGround=true;}else P.onGround=p.y-g<0.03*K;
  if(p.y+PH*K>H*K){p.y=H*K-PH*K;D.vel.y=Math.min(D.vel.y,0);}
  D.q.setFromEuler(_e.set(0,D.heading,0));
  // head bob and footsteps
  const hs=Math.hypot(D.vel.x,D.vel.z)/K;
  if(P.onGround&&hs>0.3){P.bob+=dt*hs*5.2;P.stepT+=dt*hs;if(P.stepT>0.72){P.stepT=0;footstep(hs);}}
  P.eye+=(EYE+Math.sin(P.bob)*0.035*Math.min(hs,3)/3-P.eye)*(1-Math.exp(-dt*12));
  D.flightTime+=dt;D.landed=P.onGround;
}

/* ---------- Escape game: night hall, the Shadow walks around, find 5 key cards and get out through the double door ---------- */
const GRID=0.25, GX=Math.ceil(L/GRID), GZ=Math.ceil(W/GRID);
let gridLow=null,gridTall=null;
function buildGrid(){
  gridLow=new Uint8Array(GX*GZ);gridTall=new Uint8Array(GX*GZ);const r=0.28;
  for(let i=0;i<GX;i++)for(let j=0;j<GZ;j++){const x=(i+0.5)*GRID,z=(j+0.5)*GRID;
    if(x<r||z<r||x>L-r||z>W-r){gridLow[i+j*GX]=1;continue;}
    for(const b of boxes){const x0=b.min.x/K,x1=b.max.x/K,z0=b.min.z/K,z1=b.max.z/K,y0=b.min.y/K,y1=b.max.y/K;
      if(x>x0-r&&x<x1+r&&z>z0-r&&z<z1+r){if(y1>STEP&&y0<1.7)gridLow[i+j*GX]=1;if(x>x0-0.05&&x<x1+0.05&&z>z0-0.05&&z<z1+0.05&&y1>1.3)gridTall[i+j*GX]=1;}}}
}
const cellOf=(x,z)=>[clamp(Math.floor(x/GRID),0,GX-1),clamp(Math.floor(z/GRID),0,GZ-1)];
let flow=null;
function bfs(tx,tz){ // distance field to the target cell
  const d=new Int32Array(GX*GZ).fill(-1),q=new Int32Array(GX*GZ);let h=0,t=0;
  const [ci,cj]=cellOf(tx,tz);let s=ci+cj*GX;
  if(gridLow[s]){let best=-1,bd=1e9;for(let k=0;k<GX*GZ;k++)if(!gridLow[k]){const dd=Math.hypot(k%GX-ci,(k/GX|0)-cj);if(dd<bd){bd=dd;best=k;}}s=best;}
  d[s]=0;q[t++]=s;
  while(h<t){const c=q[h++],i=c%GX,j=c/GX|0;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const ni=i+di,nj=j+dj;if(ni<0||nj<0||ni>=GX||nj>=GZ)continue;const n=ni+nj*GX;
      if(d[n]>=0||gridLow[n])continue;if(di&&dj&&(gridLow[i+di+j*GX]||gridLow[i+(j+dj)*GX]))continue;d[n]=d[c]+1;q[t++]=n;}}
  return d;
}
function sees(ax,az,bx,bz){const n=Math.ceil(Math.hypot(bx-ax,bz-az)/0.12);for(let k=1;k<n;k++){const x=ax+(bx-ax)*k/n,z=az+(bz-az)*k/n;const [i,j]=cellOf(x,z);if(gridTall[i+j*GX])return false;}return true;}

const KEY_SPOTS=[[4.75,0.8,3.6],[5.7,0.8,4.2],[3.4,0.8,3.6],[5.1,0.8,0.4],[6.25,0.8,0.25],[8.3,0.47,0.95],[8.5,0.47,1.47],[1.2,0.5,4.8],[0.6,1.0,0.45],[10.3,0.37,0.15],[11.1,0.56,4.35],[9.0,0.05,6.2],[2.17,1.65,2.57],[7.0,0.05,3.0],[3.6,0.05,0.6],[11.0,0.05,6.9],[2.0,0.97,7.15],[7.2,0.97,7.15]];
const EXIT={x:L-0.35,z:0.9};
const keysG=[];let shadow=null;
const SH={pos:new THREE.Vector3(),mode:'walk',goal:null,t:0,lastSeen:null,chaseT:0,flowT:0,catchT:0,step:0};
function buildEscape(){
  const card=new THREE.BoxGeometry(0.1,0.006,0.065),cm=new THREE.MeshBasicMaterial({color:new THREE.Color(0x4ad0ff).multiplyScalar(2)});
  for(let i=0;i<5;i++){const g=new THREE.Group();g.add(new THREE.Mesh(card,cm));
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texGlow,color:0x5ad0ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));sp.scale.set(0.45,0.45,1);g.add(sp);
    g.scale.setScalar(K);g.visible=false;scene.add(g);keysG.push(g);}
  // the Shadow: a tall thin black figure, long arms, two pale glowing eyes, smoke at the feet
  shadow=new THREE.Group();const blk=new THREE.MeshStandardMaterial({color:0x050506,roughness:1});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.32,1.5,10),blk);body.position.y=1.0;shadow.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.17,12,10),blk);head.scale.y=1.25;head.position.y=1.95;shadow.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:new THREE.Color(0xe8f4ff).multiplyScalar(3)});
  for(const s of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(0.025,8,6),eyeM);e.position.set(s*0.065,1.98,-0.15);shadow.add(e);
    const a=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.02,1.1,6),blk);a.position.set(s*0.26,1.15,-0.05);a.rotation.z=s*0.18;a.name='arm';shadow.add(a);}
  for(let i=0;i<6;i++){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texBlob,color:0x000000,transparent:true,opacity:.7,depthWrite:false}));sp.scale.set(0.8,0.5,1);sp.position.set((Math.random()-.5)*0.5,0.15+Math.random()*0.2,(Math.random()-.5)*0.5);shadow.add(sp);}
  shadow.scale.setScalar(K);shadow.visible=false;scene.add(shadow);
}
function startEscape(){
  if(!gridLow)buildGrid();
  const spots=KEY_SPOTS.slice().sort(()=>Math.random()-.5).slice(0,5);
  keysG.forEach((g,i)=>{const s=spots[i];g.position.set(s[0]*K,(s[1]+0.04)*K,s[2]*K);g.userData={got:false,base:g.position.y};g.visible=true;});
  SH.pos.set(1.3*K,0,1.1*K);SH.mode='walk';SH.goal=null;SH.chaseT=0;SH.flowT=0;SH.lastSeen=null;flow=null;
  shadow.visible=true;game.keys=0;setNight(true);P.stamina=1;
}
function endEscape(){for(const g of keysG)g.visible=false;shadow.visible=false;setNight(false);}
function freeCellNear(){for(let n=0;n<200;n++){const i=Math.random()*GX|0,j=Math.random()*GZ|0;if(!gridLow[i+j*GX])return [(i+0.5)*GRID,(j+0.5)*GRID];}return [5.5,4.5];}
function escTick(dt){
  const px=D.pos.x/K,pz=D.pos.z/K,ex=SH.pos.x/K,ez=SH.pos.z/K;
  // key cards
  for(const g of keysG){if(g.userData.got)continue;g.rotation.y+=dt*2;g.position.y=g.userData.base+Math.sin(performance.now()/300)*0.02*K;
    const dx=g.position.x/K-px,dz=g.position.z/K-pz,dy=g.position.y/K-D.pos.y/K;
    if(Math.hypot(dx,dz)<0.6&&dy>-0.3&&dy<EYE+0.5){g.userData.got=true;g.visible=false;game.keys++;chime();
      toast(game.keys<5?`Ключ-карта! ${game.keys} из 5`:'Все ключи! Беги к двойной двери у вешалок','');}}
  // exit
  if(game.keys>=5&&Math.hypot(px-EXIT.x,pz-EXIT.z)<0.9){game.done=true;finishEscape(true);return;}
  // the Shadow
  const dist=Math.hypot(px-ex,pz-ez);
  const see=dist<7.5&&sees(ex,ez,px,pz);
  const hear=dist<4&&Math.hypot(D.vel.x,D.vel.z)/K>2.5;
  if((see||hear)&&game.t>5){if(SH.mode!=='chase')growl();SH.mode='chase';SH.chaseT=4;SH.lastSeen=[px,pz];}
  else if(SH.mode==='chase'){SH.chaseT-=dt;if(SH.chaseT<=0){SH.mode='walk';SH.goal=null;}}
  let tx,tz;
  if(SH.mode==='chase'){[tx,tz]=see||hear?[px,pz]:SH.lastSeen;}
  else{if(!SH.goal||Math.hypot(SH.goal[0]-ex,SH.goal[1]-ez)<0.5){SH.goal=freeCellNear();flow=null;}[tx,tz]=SH.goal;}
  SH.flowT-=dt;if(!flow||SH.flowT<=0){flow=bfs(tx,tz);SH.flowT=SH.mode==='chase'?0.25:2;}
  // step toward the neighbour cell closer to the target (or straight at the player when close and visible)
  const spd=(SH.mode==='chase'?2.45+game.keys*0.08:1.0)*K;
  let dx,dz;
  if(SH.mode==='chase'&&see&&dist<1.5){dx=px-ex;dz=pz-ez;}
  else{const [ci,cj]=cellOf(ex,ez);let best=null,bd=flow[ci+cj*GX]>=0?flow[ci+cj*GX]:1e9;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const ni=ci+di,nj=cj+dj;if(ni<0||nj<0||ni>=GX||nj>=GZ)continue;const v=flow[ni+nj*GX];if(v>=0&&v<bd){bd=v;best=[ni,nj];}}
    if(best){dx=(best[0]+0.5)*GRID-ex;dz=(best[1]+0.5)*GRID-ez;}else{dx=tx-ex;dz=tz-ez;}}
  const m=Math.hypot(dx,dz);
  if(m>0.01){SH.pos.x+=dx/m*spd*dt;SH.pos.z+=dz/m*spd*dt;SH.yaw=Math.atan2(-dx,-dz);}
  SH.pos.y=groundAt(SH.pos.x,SH.pos.z,SH.pos.y+0.1*K,0.3);
  shadow.position.copy(SH.pos);shadow.rotation.y=SH.yaw||0;
  const sw=Math.sin(performance.now()/(SH.mode==='chase'?120:260));shadow.children.forEach(c=>{if(c.name==='arm')c.rotation.x=sw*0.5*(c.position.x>0?1:-1);});
  SH.step+=dt*spd/K;if(SH.step>0.8){SH.step=0;shadowStep(dist);}
  heartbeat(dist,dt);
  if(dist<0.65&&Math.abs(D.pos.y-SH.pos.y)/K<1.3){game.done=true;finishEscape(false);}
}
function finishEscape(won){
  playing=false;highlight(null);if(document.exitPointerLock)try{document.exitPointerLock();}catch(e){}
  const t=game.t;
  if(won){const stars=t<120?3:t<240?2:1,prev=S.best.esc;if(prev==null||t<prev)S.best.esc=t;S.stars.esc=Math.max(S.stars.esc||0,stars);save();
    $('rTitle').textContent='Ты сбежал!';$('rStars').innerHTML='★'.repeat(stars)+'<i>'+'★'.repeat(3-stars)+'</i>';$('rVal').textContent=fmtT(t);
    $('rText').textContent=(prev==null||t<prev?'Новый рекорд! ':'Рекорд: '+fmtT(prev)+'. ')+'3 звезды: быстрее 2 минут, 2 звезды: быстрее 4 минут.';}
  else{scream();$('rTitle').textContent='Тень поймала тебя';$('rStars').innerHTML='<i>★★★</i>';$('rVal').textContent=game.keys+' из 5';
    $('rText').textContent='Ключ-карт собрано. Тень видит тебя, если между вами нет колонны или стеллажа, и слышит бег рядом. Прячься за колоннами, береги силы для бега.';}
  endEscape();$('osd').hidden=true;$('touch').hidden=true;showScreen('sRes');
}

/* ---------- Hoops race for the drones: fly through the 5 hoops in order ---------- */
const hoopSt={i:0,prev:0};
function hoopTick(){
  const h=HOOPS[hoopSt.i];if(!h)return;
  const c=_v.copy(h.position).multiplyScalar(K),n=_v2.set(0,0,1).applyAxisAngle(UP,h.rotation.y);
  const off=D.pos.clone().sub(c),s=off.dot(n),lat=off.addScaledVector(n,-s).length();
  if(hoopSt.prev&&Math.sign(s)!==Math.sign(hoopSt.prev)&&lat<h.geometry.parameters.radius*K){
    hoopSt.i++;chime();HOOPS.forEach((o,k)=>o.material=k===hoopSt.i?M.hoopOn:M.hoop);
    if(hoopSt.i>=HOOPS.length){game.done=true;setTimeout(()=>finishRace(),600);return;}
    toast(`Кольцо ${hoopSt.i} из ${HOOPS.length}`);hoopSt.prev=0;return;}
  hoopSt.prev=Math.abs(s)<0.6*K?s:0;
}
function finishRace(){
  playing=false;D.armed=false;updArm();highlight(null);HOOPS.forEach(o=>o.material=M.hoop);
  const t=game.t,key='hoops_'+S.scale,stars=t<(S.scale==='muha'?150:40)?3:t<(S.scale==='muha'?300:80)?2:1,prev=S.best[key];
  if(prev==null||t<prev)S.best[key]=t;S.stars[key]=Math.max(S.stars[key]||0,stars);save();
  $('rTitle').textContent='Все кольца пройдены!';$('rStars').innerHTML='★'.repeat(stars)+'<i>'+'★'.repeat(3-stars)+'</i>';$('rVal').textContent=fmtT(t);
  $('rText').textContent=(prev==null||t<prev?'Новый рекорд!':'Рекорд: '+fmtT(prev));
  $('osd').hidden=true;$('touch').hidden=true;showScreen('sRes');
}

/* ---------- Cameras ---------- */
const CAMS=['fpv','chase','los'], CAMN={fpv:'FPV',chase:'СЗАДИ',los:'ИЗ УГЛА'};
function cycleCam(){if(WALK)return;S.cam=CAMS[(CAMS.indexOf(S.cam)+1)%3];save();$('ocam').textContent=CAMN[S.cam];}
const MODEN={fly:'ПЛАВНО',nov:'НОВИЧОК',angle:'ANGLE',acro:'ACRO'};
function soft(){return WALK||S.mode==='fly'||S.mode==='nov';}
function cycleMode(){
  if(WALK)return;
  const order=['fly','nov','angle','acro'];
  if(D.armed){toast('Режим меняют без взвода','bad');return;}
  S.mode=order[(order.indexOf(S.mode)+1)%4];save();resetDrone(false);touchMode();toast('Режим: '+MODEN[S.mode]);
}
const chasePos=new THREE.Vector3(0,2,14);
function placeCameras(dt){
  if(WALK){camFPV.position.set(0,P.eye*K/1.6,0);camFPV.rotation.set(P.pitch,0,0);return;}
  camFPV.position.set(0,0.035,-0.06);
  camFPV.rotation.set(S.tilt/57.3,0,0);
  if(S.cam==='chase'){
    const yaw=new THREE.Euler().setFromQuaternion(D.q,'YXZ').y;
    _v.set(Math.sin(yaw)*2.6,1.0,Math.cos(yaw)*2.6).add(D.pos);
    _v.y=clamp(_v.y,0.3,H*K-0.5);
    chasePos.lerp(_v,1-Math.exp(-dt*5));
    camExt.position.copy(chasePos);camExt.fov=65;camExt.updateProjectionMatrix();
    camExt.lookAt(_v2.copy(D.pos).add(_v.set(0,0.2,0)));
  }else if(S.cam==='los'){
    // a camera in the top corner above the white door, like a spider on the wall
    camExt.position.set((L-0.12)*K,(H-0.15)*K,(W-0.12)*K);
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
  let k=S.fx==='1'&&S.cam==='fpv'&&!WALK?0.04+noiseKick*0.8+(D.vcell<3.5?0.1:0):0;
  $('noise').style.opacity=k.toFixed(3);$('scan').style.display=S.fx==='1'&&S.cam==='fpv'&&!WALK&&!$('osd').hidden?'':'none';
  if(k<0.01)return;
  const a=nimg.data;for(let i=0;i<a.length;i+=4){const v=Math.random()*255|0;a[i]=a[i+1]=a[i+2]=v;a[i+3]=255;}
  const bar=(performance.now()/7|0)%90;for(let y=bar;y<Math.min(90,bar+4);y++)for(let x=0;x<160;x++){const i=(y*160+x)*4;a[i]=a[i+1]=a[i+2]=255;}
  nctx.putImageData(nimg,0,0);
}
function fmtT(s){s=Math.max(0,s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0');}
function updOSD(dt){
  const c=charge();
  $('omode').textContent=WALK?(game.kind==='esc'?'ПОБЕГ':'ПЕШКОМ'):MODEN[S.mode];
  $('otime').textContent=game.kind!=='free'?fmtT(game.t):fmtT(D.flightTime);
  const fl=S.mode==='fly'||WALK;$('obat').textContent=WALK?(game.kind==='esc'?'СИЛЫ '+'▮'.repeat(Math.round(P.stamina*8))+'▯'.repeat(8-Math.round(P.stamina*8)):(inp.boost?'» БЕГ':'')):fl?(inp.boost?'» УСКОР':''):(D.vcell*BAT.cells).toFixed(1)+'V';
  const cell=$('ocell');cell.textContent=fl?'':D.vcell.toFixed(2)+' В/банка';cell.className=D.vcell<3.5?'bad':D.vcell<3.65?'warnc':'';
  $('ofly').textContent=game.kind==='fire'?'✦ '+game.got+'/'+game.total:game.kind==='esc'?'КЛЮЧИ '+game.keys+'/5':game.kind==='hoops'?'КОЛЬЦО '+Math.min(hoopSt.i+1,HOOPS.length)+'/'+HOOPS.length:'';
  // altitude and speed in the real room: centimetres
  $('oalt').textContent=Math.round(D.pos.y/K*100);
  $('ospd').textContent=Math.round(D.vel.length()/K*100);
  _e.setFromQuaternion(D.q,'YXZ');
  const hor=$('hor');hor.style.transform=`translateY(${clamp(_e.x*57.3*4,-160,160)}px) rotate(${_e.z*57.3}deg)`;
  hor.style.display=S.cam==='fpv'&&!WALK?'':'none';$('cross').style.display=S.cam==='fpv'&&!WALK?'':'none';
  let w='';
  if(WALK)w='';else if(D.crashed)w='БАМ!<br><small style="font-size:.6em">'+D.crashReason+'</small>';
  else if(c<=0.01&&!fl)w='АКБ ПУСТОЙ';
  else if(ocv(c)<3.5&&!fl)w='САДИСЬ: АКБ';
  $('warn').innerHTML=w;
  const ly=soft()?inp.ly:inp.thr*2-1;
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
  boost:{touch:'кнопку УСКОР',kbd:'Shift',pad:'любую кнопку на пульте'},
};
const say=k=>WORDS[k][ctl()];
let hlId=null;
function highlight(id){if(id===hlId)return;if(hlId)$(hlId).classList.remove('hl');hlId=id;if(id)$(id).classList.add('hl');}
function hint(){
  if(WALK){const t=D.flightTime,c=ctl();
    const mv={kbd:'W A S D',touch:'левый стик',pad:'левый стик'}[c],lk={kbd:'мышь (кликни по экрану) или Q / E',touch:'правый стик',pad:'правый стик'}[c],rn={kbd:'Shift',touch:'кнопка БЕГ',pad:'кнопка LB'}[c],jp={kbd:'Пробел',touch:'кнопка ПРЫЖОК',pad:'кнопка A'}[c];
    if(game.kind==='esc')return [t<10?`Ночь. Где-то в зале бродит <b>Тень</b>. Найди <b>5 ключ-карт</b> (синие огоньки) и выйди через двойную дверь у вешалок. Бег: <b>${rn}</b>, силы кончаются!`:game.keys>=5?'Все ключи у тебя: <b>беги к двойной двери у вешалок!</b>':'',null];
    if(game.kind==='fire')return [`Светлячки: <b>${game.got} из ${game.total}</b>. Жёлтая стрелка ведёт к ближайшему. Высоко? Прыжок: <b>${jp}</b>`,null];
    if(t<14)return [`Иди: <b>${mv}</b>. Смотреть: <b>${lk}</b>. Бег: <b>${rn}</b>, прыжок: <b>${jp}</b>. На сцену можно подняться`,t<7?'stL':'stR'];
    return ['',null];}
  if(D.crashed)return ['',null];
  if(!D.armed&&D.landed)return [`Взведи моторы: нажми <b>${say('arm')}</b>`+(S.mode==='nov'?'':'. Газ должен быть внизу'),'bArm'];
  if(D.landed&&D.flightTime<20)return [soft()?`Взлетай: <b>${say('up')}</b>`:`Плавно добавь газ: <b>${say('up')}</b>, висение около 40%`,'stL'];
  if(game.kind==='hoops')return [`Кольца: лети в <b>зелёное</b> кольцо, жёлтая стрелка показывает куда. Вперёд: ${say('fwd')}, вверх: ${say('up')}`,null];
  if(game.kind==='fire')return [`Светлячки: <b>${game.got} из ${game.total}</b>. Жёлтая стрелка ведёт к ближайшему. Вперёд: ${say('fwd')}, поворот: ${say('yaw')}`+(S.mode==='fly'?`, ускорение: ${say('boost')}`:''),null];
  if(S.mode==='fly'&&D.flightTime<16)return [`Лети! Вперёд: <b>${say('fwd')}</b>, вверх: <b>${say('up')}</b>, поворот: <b>${say('yaw')}</b>, ускорение: <b>${say('boost')}</b>`,D.flightTime<6?'stL':'stR'];
  if(D.flightTime<14)return [`Лети куда хочешь! Вперёд: <b>${say('fwd')}</b>, поворот: <b>${say('yaw')}</b>. Пролети через кольца и под столами`,'stR'];
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
  {const d=D.pos.distanceTo(guideP)/K;el.querySelector('span').textContent=d>=2?d.toFixed(1)+' м':Math.round(d*100)+' см';}
}

/* ---------- Game modes: free flight and firefly hunt ---------- */
let playing=false;
const game={kind:'free',t:0,got:0,done:false};
const GAMES={
  free:{tag:'ПОЛЁТ',name:'Свободный полёт',desc:'Никаких заданий: облети зал, сцену, кольца, нишу с компьютерами и вешалки.'},
  walk:{tag:'ПРОГУЛКА',name:'Прогулка по залу',desc:'Просто походи по залу «Спектра»: сцена, колонны, компьютеры, книжная стена, доска. Можно подняться на сцену.'},
  fire:{tag:'ИГРА',name:'Светлячки',desc:'По всему залу спрятаны светящиеся светлячки: на колонках, в кольцах, под столами, на полках, у проектора. Собери всех как можно быстрее.'},
  hoops:{tag:'ГОНКА',name:'Кольца',desc:'Пролети все 5 колец по порядку на время. Следующее кольцо горит зелёным.'},
  esc:{tag:'ХОРРОР',name:'Побег',desc:'Ночь, свет выключен, у тебя только фонарик. По залу бродит Тень. Найди 5 ключ-карт и выберись через двойную дверь. Как в «SCP: Побег».'},
};
function startGame(kind){
  if(game.kind==='esc')endEscape();
  game.kind=kind;game.t=0;game.got=0;game.done=false;game.total=FLIES.length;game.keys=0;
  for(const f of FLIES){f.userData.got=false;f.visible=kind==='fire';}
  hoopSt.i=0;hoopSt.prev=0;HOOPS.forEach((o,k)=>o.material=kind==='hoops'&&k===0?M.hoopOn:M.hoop);
  resetDrone();if(kind==='esc')startEscape();playing=true;showScreen(null);
  $('osd').hidden=false;$('touch').hidden=false;$('ocam').textContent=CAMN[S.cam];touchMode();
  audioInit();
}
function gameTick(dt){
  if(game.done){guideP=null;return;}
  if(game.kind!=='free'&&(WALK||D.armed||!D.landed))game.t+=dt;
  if(game.kind==='esc'){escTick(dt);guideP=null;return;}
  if(game.kind==='hoops'){hoopTick();const h=HOOPS[hoopSt.i];guideP=h?(game._gp||(game._gp=new THREE.Vector3())).copy(h.position).multiplyScalar(K):null;return;}
  if(game.kind!=='fire'){guideP=null;return;}
  let best=null,bd=1e9;
  const pick=WALK?0.6:GLOW*0.8*K+R_DRONE*0.5;
  for(const f of FLIES){if(f.userData.got)continue;let d=f.position.distanceTo(D.pos);
    if(WALK){const dy=(f.position.y-D.pos.y)/K;d=Math.hypot(f.position.x-D.pos.x,f.position.z-D.pos.z)+(dy<-0.3||dy>EYE+0.55?9:0);}
    if(d<pick){f.userData.got=true;f.visible=false;game.got++;chime();
      toast(game.got<FLIES.length?`Светлячок! ${game.got} из ${FLIES.length}`:'Все светлячки собраны!');continue;}
    if(d<bd){bd=d;best=f;}}
  guideP=best?best.position:null;
  if(game.got>=FLIES.length){game.done=true;setTimeout(finish,1200);}
}
function finish(){
  playing=false;D.armed=false;updArm();highlight(null);
  const key='fire_'+S.scale,lim={walk:[120,240],drone:[150,300],muha:[600,960]}[S.scale];
  const t=game.t,stars=t<lim[0]?3:t<lim[1]?2:1,prev=S.best[key];
  if(prev==null||t<prev)S.best[key]=t;S.stars[key]=Math.max(S.stars[key]||0,stars);save();
  $('rTitle').textContent='Все светлячки собраны!';
  $('rStars').innerHTML='★'.repeat(stars)+'<i>'+'★'.repeat(3-stars)+'</i>';
  $('rVal').textContent=fmtT(t);
  $('rText').textContent=(prev==null||t<prev?'Новый рекорд! ':'Рекорд: '+fmtT(prev)+'. ')+`3 звезды: быстрее ${lim[0]/60} мин, 2 звезды: быстрее ${lim[1]/60} мин.`;
  $('osd').hidden=true;$('touch').hidden=true;showScreen('sRes');
}
function exitToMenu(){if(game.kind==='esc')endEscape();if(document.exitPointerLock)try{document.exitPointerLock();}catch(e){}playing=false;D.armed=false;updArm();highlight(null);guideP=null;$('osd').hidden=true;$('touch').hidden=true;for(const f of FLIES)f.visible=false;renderMenu();showScreen('sMenu');}
function pause(){if(!playing)return;playing=false;if(document.exitPointerLock)try{document.exitPointerLock();}catch(e){}showScreen('sPause');}
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&playing&&WALK&&!game.done)pause();});

/* ---------- Sound: motor hum and beeps (WebAudio, no files) ---------- */
let AC=null,motorOsc=null,motorGain=null,master=null,windGain=null,windF=null,humGain=null,lastThud=0;
function noiseBuf(sec){const b=AC.createBuffer(1,AC.sampleRate*sec,AC.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<d.length;i++){l=l*0.97+(Math.random()*2-1)*0.03;d[i]=l*6+(Math.random()*2-1)*0.15;}return b;}
function audioInit(){
  if(AC)return;try{AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain();master.gain.value=0.9;master.connect(AC.destination);
  // motor or wing buzz
  motorOsc=AC.createOscillator();motorOsc.type='sawtooth';const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=1600;
  motorGain=AC.createGain();motorGain.gain.value=0;motorOsc.connect(f);f.connect(motorGain);motorGain.connect(master);motorOsc.start();
  // air rushing past: looped soft noise through a band-pass that opens with speed
  const n=AC.createBufferSource();n.buffer=noiseBuf(2);n.loop=true;windF=AC.createBiquadFilter();windF.type='bandpass';windF.Q.value=0.7;windF.frequency.value=300;
  windGain=AC.createGain();windGain.gain.value=0;n.connect(windF);windF.connect(windGain);windGain.connect(master);n.start();
  // room tone: a quiet low hum like a fridge far away, louder near the kitchen
  humGain=AC.createGain();humGain.gain.value=0;humGain.connect(master);
  for(const [fr,v] of [[50,0.5],[100,0.3],[150,0.12]]){const o=AC.createOscillator();o.frequency.value=fr;const g=AC.createGain();g.gain.value=v;o.connect(g);g.connect(humGain);o.start();}
  }catch(e){AC=null;}
}
function beep(f,d){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=f;g.gain.value=0.08;o.connect(g);g.connect(master);o.start();g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+d);o.stop(AC.currentTime+d+0.02);}
// soft bump against a wall or furniture
function thud(v){if(!AC)return;const t=AC.currentTime;if(t-lastThud<0.25)return;lastThud=t;
  const s=AC.createBufferSource();s.buffer=noiseBuf(0.3);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=260;const g=AC.createGain();
  g.gain.setValueAtTime(clamp(v/10,0.05,0.5),t);g.gain.exponentialRampToValueAtTime(0.001,t+0.25);s.connect(f);f.connect(g);g.connect(master);s.start();
  const o=AC.createOscillator();o.frequency.setValueAtTime(110,t);o.frequency.exponentialRampToValueAtTime(45,t+0.18);const og=AC.createGain();og.gain.setValueAtTime(clamp(v/14,0.04,0.35),t);og.gain.exponentialRampToValueAtTime(0.001,t+0.2);o.connect(og);og.connect(master);o.start();o.stop(t+0.22);
  if(navigator.vibrate&&v>5)try{navigator.vibrate(30);}catch(e){}}
// footsteps on stone tiles
function footstep(v){if(!AC)return;const t=AC.currentTime,s=AC.createBufferSource();s.buffer=noiseBuf(0.12);const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=900+Math.random()*300;f.Q.value=1.2;const g=AC.createGain();
  g.gain.setValueAtTime(night?0.05:0.035*Math.min(v,3),t);g.gain.exponentialRampToValueAtTime(0.001,t+0.09);s.connect(f);f.connect(g);g.connect(master);s.start();}
// the Shadow: heavy dragging steps, a low growl when it spots you, heartbeat when it is close
function shadowStep(d){if(!AC||d>12)return;const t=AC.currentTime,s=AC.createBufferSource();s.buffer=noiseBuf(0.3);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=380;const g=AC.createGain();
  g.gain.setValueAtTime(clamp(0.22-d*0.018,0.01,0.22),t);g.gain.exponentialRampToValueAtTime(0.001,t+0.28);s.connect(f);f.connect(g);g.connect(master);s.start();}
function growl(){if(!AC)return;const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain(),f=AC.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(70,t);o.frequency.linearRampToValueAtTime(48,t+0.9);
  f.type='lowpass';f.frequency.value=420;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.16,t+0.1);g.gain.exponentialRampToValueAtTime(0.001,t+1.0);o.connect(f);f.connect(g);g.connect(master);o.start();o.stop(t+1.05);}
let hbT=0;function heartbeat(d,dt){if(!AC)return;hbT-=dt;if(d>7||hbT>0)return;hbT=0.35+d*0.12;const t=AC.currentTime;
  for(const k of [0,0.16]){const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=52;g.gain.setValueAtTime(0.0001,t+k);g.gain.exponentialRampToValueAtTime(0.3*(1-d/8),t+k+0.02);g.gain.exponentialRampToValueAtTime(0.001,t+k+0.14);o.connect(g);g.connect(master);o.start(t+k);o.stop(t+k+0.16);}}
function scream(){if(!AC)return;const t=AC.currentTime,s=AC.createBufferSource();s.buffer=noiseBuf(1.2);const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.setValueAtTime(1800,t);f.frequency.exponentialRampToValueAtTime(300,t+1.1);const g=AC.createGain();
  g.gain.setValueAtTime(0.5,t);g.gain.exponentialRampToValueAtTime(0.001,t+1.15);s.connect(f);f.connect(g);g.connect(master);s.start();}
// firefly pickup: a little rising bell chord
function chime(){if(!AC)return;[1047,1319,1568,2093].forEach((f,i)=>setTimeout(()=>beep(f,0.25),i*70));}
function updAudio(){if(!motorGain)return;const t=AC.currentTime,on=playing&&D.armed&&!WALK,sp=D.vel.length()*(30/K)*(WALK?0:1);
  if(S.mode==='fly'){ // a soft wing hum instead of motors
    motorOsc.type='triangle';motorGain.gain.setTargetAtTime(on?0.012+Math.min(sp,25)*0.0012:0,t,0.1);motorOsc.frequency.setTargetAtTime(150+sp*6+D.boostK*60,t,0.1);}
  else{motorOsc.type='sawtooth';motorGain.gain.setTargetAtTime(on?0.02+D.thrOut*0.04:0,t,0.05);motorOsc.frequency.setTargetAtTime(170+D.thrOut*520,t,0.05);}
  windGain.gain.setTargetAtTime(playing?clamp(sp/22,0,1)*0.09:0,t,0.12);windF.frequency.setTargetAtTime(250+sp*45,t,0.12);
  humGain.gain.setTargetAtTime(playing?(night?0.012:0.004):0,t,0.3);}

/* ---------- Screens ---------- */
const SCREENS=['sMenu','sSet','sHelp','sPad','sPause','sRes'];
let backTo='sMenu';
function showScreen(id){for(const s of SCREENS)$(s).hidden=s!==id;}
function renderMenu(){
  const list=$('taskList');list.innerHTML='';
  const ids=WALK?['walk','fire','esc']:['free','fire','hoops'];
  for(const id of ids){const t=GAMES[id],key=id==='free'||id==='walk'?id:id==='esc'?'esc':id+'_'+S.scale,st=S.stars[key]||0;
    const b=document.createElement('button');b.className='task';
    b.innerHTML=`<span class="tag">${t.tag}</span><b>${t.name}</b><span>${t.desc}</span>`+
      (id!=='free'&&id!=='walk'?`<span class="stars" style="font-size:18px;letter-spacing:3px">${'★'.repeat(st)}<i>${'★'.repeat(3-st)}</i></span><span class="best">${S.best[key]!=null?'Рекорд: '+fmtT(S.best[key]):''}</span>`:'');
    b.onclick=()=>startGame(id==='walk'?'free':id);list.appendChild(b);}
  padInfo();renderSettings();$('scaleNote').textContent=SCALENOTE[S.scale];
}
const SCALENOTE={walk:'Ты обычный человек ростом с себя. Ходишь, бегаешь, прыгаешь, поднимаешься на сцену. Здесь же игра «Побег».',drone:'Ты мини-дрон (тинивуп) около 10 см. Зал настоящего размера: 11,5 на 7,3 метра.',muha:'Ты дрон размером с муху, 1,5 см. Зал огромный, как стадион.'};
const MODENOTE={fly:'Плавный полёт: без физики дрона, летишь мягко и уверенно, как невидимое существо, с небольшим заносом в поворотах. Взводить не нужно, разбиться нельзя. Shift (или кнопка УСКОР) — ускорение.',nov:'Новичок: дрон сам держит высоту и тормозит. Левый стик вверх — набор высоты, в середине — висит.',angle:'Angle: дрон сам выравнивается, но газ твой. Висение примерно на 40% газа.',acro:'Acro: как настоящий FPV. Стики задают скорость вращения, сам дрон не выравнивается.'};
function renderSettings(){
  document.querySelectorAll('.seg').forEach(seg=>{const k=seg.dataset.k;seg.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',String(S[k])===b.dataset.v);});});
  document.querySelectorAll('input[type=range]').forEach(r=>r.value=S[r.dataset.k]);
  $('vTilt').textContent=S.tilt;$('vRate').textContent=S.rate;$('vExpo').textContent=(+S.expo).toFixed(2);
  $('modeNote').textContent=MODENOTE[S.mode];
}
document.querySelectorAll('.seg').forEach(seg=>seg.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=seg.dataset.k;
  if(k==='mode'&&D.armed){toast('Режим меняют без взвода','bad');return;}
  if(k==='scale'){if(S.scale!==b.dataset.v){S.scale=b.dataset.v;save();location.reload();}return;}
  S[k]=b.dataset.v;save();if(k==='q')applyQuality();if(k==='mode'){resetDrone(false);touchMode();}if(k==='cam')$('ocam').textContent=CAMN[S.cam];renderSettings();}));
document.querySelectorAll('input[type=range]').forEach(r=>r.addEventListener('input',()=>{S[r.dataset.k]=+r.value;save();renderSettings();}));
$('mSet').onclick=()=>{backTo='sMenu';renderSettings();showScreen('sSet');};
$('pSet').onclick=()=>{backTo='sPause';renderSettings();showScreen('sSet');};
$('setBack').onclick=()=>showScreen(backTo);
$('mHelp').onclick=()=>showScreen('sHelp');$('helpBack').onclick=()=>showScreen('sMenu');
$('mPad').onclick=()=>{padInfo();showScreen('sPad');};$('padBack').onclick=()=>{cal=null;renderMenu();showScreen('sMenu');};
$('pResume').onclick=()=>{showScreen(null);playing=true;};
$('pRestart').onclick=()=>startGame(game.kind);
$('pMenu').onclick=exitToMenu;
$('rAgain').onclick=()=>startGame(game.kind);$('rFree').onclick=()=>startGame('free');$('rMenu').onclick=exitToMenu;
$('bArm').addEventListener('pointerdown',e=>{e.preventDefault();toggleArm();});
$('bCam').addEventListener('pointerdown',e=>{e.preventDefault();cycleCam();});
$('bPause').addEventListener('pointerdown',e=>{e.preventDefault();pause();});
$('bBat').addEventListener('pointerdown',e=>{e.preventDefault();swapBattery();});
{const b=$('bBoost');b.addEventListener('pointerdown',e=>{e.preventDefault();touchBoost=true;srcPref='touch';b.classList.add('on');});
 for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>{touchBoost=false;b.classList.remove('on');});}

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
    trailT+=dt;if(!WALK&&trailT>0.3&&!D.crashed&&!D.landed&&D.armed){trailT=0;trail.push({pos:D.pos.clone(),h:D.heading});if(trail.length>20)trail.shift();}
    gameTick(dt);
    const [ht,ui]=hint();setTask(ht);highlight(ui);
  }
  drone.position.copy(D.pos);drone.quaternion.copy(D.q);
  placeCameras(dt);
  let cam=S.cam==='fpv'?camFPV:camExt;
  if(!playing&&$('osd').hidden){ // menu backdrop: slow look around the hall
    const a=now/16000;camExt.position.set(5.75*K+Math.sin(a)*3.2*K,1.5*K+Math.sin(a*0.7)*0.3*K,3.9*K+Math.cos(a)*1.9*K);camExt.fov=70;camExt.updateProjectionMatrix();
    camExt.lookAt(5.75*K-Math.sin(a)*3*K,1.0*K,3.9*K-Math.cos(a)*2*K);cam=camExt;drone.visible=true;}
  else drone.visible=WALK||S.cam!=='fpv';
  if(WALK&&(playing||!$('osd').hidden))cam=camFPV;
  updFx(dt,now);
  if(composer){renderPass.camera=cam;composer.render(dt);}else renderer.render(scene,cam);
  if(playing||!$('osd').hidden){updOSD(dt);drawNoise(dt);updGuide(cam);}
  updAudio();fpsWatch(dt);
}

/* ---------- Boot ---------- */
buildRoom();buildLights();buildDust();buildFlies();buildDrone();buildEscape();if(WALK)for(const c of drone.children)if(c!==camFPV)c.visible=false;
setupStick($('stL'),'L');setupStick($('stR'),'R');
applyQuality();resetDrone();renderMenu();showScreen('sMenu');
$('ocam').textContent=CAMN[S.cam];
if(!loading)$('load').hidden=true;
requestAnimationFrame(frame);
window.__M={renderer,D,inp,S,P,SH,HOOPS,hoopSt,setNight,escTick,scene,keysG,startGame,toggleArm,step,camExt,camFPV,game,FLIES,boxes,K,applyQuality,get playing(){return playing;}};
