const V='v2';
const SHELL='shell-'+V, DATA='data-'+V, TILES='tiles-v1';
const MAX_TILES=3500; // ~50 MB at ~15 KB per tile
const SHELL_FILES=['./','index.html','style.css','app.js','hours.js','favorites.json','manifest.webmanifest','icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{})));
    const d=await caches.open(DATA); await Promise.all(['data/index.json','data/places-0.json','data/places-1.json','data/places-2.json','data/places-3.json'].map(u=>d.add(new Request(u,{cache:'reload'})).catch(()=>{})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(![SHELL,DATA,TILES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function trimTiles(c){
  const keys=await c.keys();
  if(keys.length>MAX_TILES) for(const k of keys.slice(0,keys.length-MAX_TILES)) await c.delete(k); // oldest first
}
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.hostname==='tile.openstreetmap.org'){
    e.respondWith((async()=>{
      const c=await caches.open(TILES);
      const hit=await c.match(req);
      if(hit){ // refresh position in the LRU order
        e.waitUntil((async()=>{await c.delete(req);await c.put(req,hit.clone())})());
        return hit;
      }
      try{const r=await fetch(req);
        if(r.ok||r.type==='opaque'){await c.put(req,r.clone());e.waitUntil(trimTiles(c))}
        return r}catch(err){return new Response('',{status:504})}
    })());
    return;
  }
  const isData=url.origin===location.origin&&url.pathname.includes('/data/');
  const isFav=url.origin===location.origin&&url.pathname.endsWith('/favorites.json');
  if(isData||isFav){ // stale-while-revalidate: instant from cache, update in background
    e.respondWith((async()=>{
      const c=await caches.open(isData?DATA:SHELL);
      const hit=await c.match(req,{ignoreSearch:true});
      const net=fetch(req).then(r=>{if(r.ok)c.put(req,r.clone());return r}).catch(()=>null);
      return hit||(await net)||new Response('[]',{status:504});
    })());
    return;
  }
  if(url.origin===location.origin||url.hostname==='unpkg.com'){
    e.respondWith((async()=>{
      const hit=await caches.match(req,{ignoreSearch:true});
      if(hit){e.waitUntil(fetch(req).then(async r=>{if(r.ok)(await caches.open(SHELL)).put(req,r)}).catch(()=>{}));return hit}
      try{const r=await fetch(req);
        if(r.ok){const c=await caches.open(SHELL);c.put(req,r.clone())}
        return r}catch(err){
        if(req.mode==='navigate')return (await caches.match('index.html'))||Response.error();
        return Response.error()}
    })());
  }
});
