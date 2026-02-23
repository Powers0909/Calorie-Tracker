const CACHE = "ct-ai-logger-v1";
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",(e)=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",(e)=>{const r=e.request;e.respondWith(caches.match(r).then(c=>c||fetch(r).then(res=>{const copy=res.clone();if(r.method==="GET"&&res.status===200&&r.url.startsWith(self.location.origin)){caches.open(CACHE).then(cache=>cache.put(r,copy))}return res}).catch(()=>c)))});
