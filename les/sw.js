const CACHE='les-v1';
const CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','three.min.js','fonts.css','fonts/pt-mono-cyrillic-400-normal.woff2','fonts/pt-mono-latin-400-normal.woff2','fonts/rubik-cyrillic-400-normal.woff2','fonts/rubik-cyrillic-500-normal.woff2','fonts/rubik-cyrillic-700-normal.woff2','fonts/rubik-latin-400-normal.woff2','fonts/rubik-latin-500-normal.woff2','fonts/rubik-latin-700-normal.woff2','fonts/russo-one-cyrillic-400-normal.woff2','fonts/russo-one-latin-400-normal.woff2'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(u=>fetch(u).then(r=>c.put(u,r)).catch(()=>{})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Page: network first with a 4 s timeout, cache as fallback. Engine, fonts, icons: cache first.
const STATIC=/(three\.min\.js|\.woff2|fonts\.css|\.png)$/;
const put=(req,r)=>{if(r&&r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{})}return r};
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET'||!req.url.startsWith(self.location.origin))return;
  const cached=()=>caches.match(req,{ignoreSearch:true}).then(m=>m||caches.match('index.html'));
  if(STATIC.test(new URL(req.url).pathname)){e.respondWith(caches.match(req).then(m=>m||fetch(req).then(r=>put(req,r))));return}
  e.respondWith(new Promise(res=>{let done=false;
    const t=setTimeout(()=>cached().then(m=>{if(m&&!done){done=true;res(m)}}),4000);
    fetch(req).then(r=>{put(req,r);if(!done){done=true;clearTimeout(t);res(r)}})
      .catch(()=>cached().then(m=>{if(!done){done=true;clearTimeout(t);res(m||Response.error())}}));
  }))});
