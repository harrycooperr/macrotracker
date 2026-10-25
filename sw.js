/* Cache only the static app shell. API requests and personal data never enter this cache. */
const CACHE='macrolog-shell-v2-20261025';
const FILES=['./','./index.html','./MacroLog-Pro.html','./core.js','./app.js','./styles.css','./upgrade.css'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('macrolog-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!FILES.some(f=>new URL(f,self.registration.scope).href===url.href))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{if(response.ok){const c=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,c));}return response;}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match(new URL('index.html',self.registration.scope).href))));
  }else event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});

