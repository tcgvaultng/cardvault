/* CardVault Service Worker — offline-first
   Stratégies :
   - App shell (index.html, fonts) : cache-first (rapide + offline)
   - R2 images : stale-while-revalidate (sert cache, fetch en arrière-plan)
   - Manifest R2 : network-first (toujours frais si online, fallback cache)
   - Tout le reste : pass-through réseau */
const CACHE_VERSION='cardvault-v6';
const APP_SHELL=[
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Exo+2:wght@300;400;500;600;700&display=swap',
];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_VERSION).then(c=>c.addAll(APP_SHELL).catch(err=>console.warn('SW install partial:',err)))
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    /* Supprime les anciens caches */
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_VERSION).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  /* App shell : cache-first */
  if(url.origin===location.origin&&(url.pathname.endsWith('/index.html')||url.pathname.endsWith('/'))){
    e.respondWith(
      caches.open(CACHE_VERSION).then(c=>c.match(req).then(r=>{
        const fetchPromise=fetch(req).then(resp=>{if(resp&&resp.ok)c.put(req,resp.clone());return resp}).catch(()=>r);
        return r||fetchPromise;
      }))
    );
    return;
  }
  /* R2 images : stale-while-revalidate */
  if(/\.r2\.dev\//i.test(url.href)&&/\.(webp|png|jpe?g|svg)/i.test(url.pathname)){
    e.respondWith(
      caches.open(CACHE_VERSION).then(c=>c.match(req).then(cached=>{
        const fetchPromise=fetch(req).then(r=>{if(r&&r.ok)c.put(req,r.clone());return r}).catch(()=>cached);
        return cached||fetchPromise;
      }))
    );
    return;
  }
  /* Manifest R2 (JSON) : network-first */
  if(/\.r2\.dev\/.*\.json/i.test(url.href)){
    e.respondWith(
      fetch(req).then(r=>{
        if(r&&r.ok){const cl=r.clone();caches.open(CACHE_VERSION).then(c=>c.put(req,cl))}
        return r;
      }).catch(()=>caches.match(req))
    );
    return;
  }
  /* Fonts Google : cache-first long terme */
  if(/fonts\.(googleapis|gstatic)\.com/i.test(url.host)){
    e.respondWith(
      caches.open(CACHE_VERSION).then(c=>c.match(req).then(r=>r||fetch(req).then(resp=>{if(resp&&resp.ok)c.put(req,resp.clone());return resp})))
    );
    return;
  }
  /* Reste : passthrough réseau (sans cache) */
});

/* Permet au client de skipper l'attente */
self.addEventListener('message',e=>{
  if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();
});
