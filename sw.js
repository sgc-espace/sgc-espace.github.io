/* SGC-PWA-01 : seules les ressources statiques connues sont mises en cache. */
importScripts('./pwa-assets.js');
const BUILD=self.SGC_BUILD;
const BASE=new URL('./',self.location.href);
const PREFIX='sgc-organisation-shell-'+encodeURIComponent(BASE.pathname)+'-';
const CACHE=PREFIX+BUILD.cacheName.replace('sgc-organisation-shell-','');
const FILES=new Map(Object.entries(BUILD.files).map(([p,h])=>[new URL(p,BASE).href,h]));
const INDEX=new URL('./index.html',BASE).href;
async function digest(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try {
    for(const [url,hash] of FILES){
      const response=await fetch(new Request(url,{cache:'reload',redirect:'error',credentials:'same-origin'}));
      if(!response.ok||response.redirected||await digest(await response.clone().arrayBuffer())!==hash)throw Error('Ressource manquante ou integrite invalide');
      await cache.put(url,response);
    }
  }catch(e){await caches.delete(CACHE);throw e;}
  // Pas de skipWaiting automatique : l'utilisateur choisit l'activation.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const own=(await caches.keys()).filter(name=>name.startsWith(PREFIX));
  const previous=own.filter(name=>name!==CACHE).slice(-1);
  await Promise.all(own.filter(name=>name!==CACHE&&!previous.includes(name)).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data?.type==='SGC_VERSION'){event.ports[0]?.postMessage({version:BUILD.version,cacheName:CACHE});return;}
  if(event.data?.type==='SGC_ACTIVATE')event.waitUntil((async()=>{
    const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(BASE.href));
    if(windows.length!==1||!windows.some(c=>c.id===event.source?.id)){event.ports[0]?.postMessage({ok:false,reason:'Fermez les autres fenêtres SGC avant la mise à jour.'});return;}
    event.ports[0]?.postMessage({ok:true});
    await self.skipWaiting();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  url.hash=''; // Les jetons éphémères de l’aperçu ne font pas partie de la ressource statique.
  if(url.origin!==BASE.origin)return;
  const navigation=event.request.mode==='navigate'&&(url.pathname===BASE.pathname||url.pathname===new URL(INDEX).pathname);
  const key=navigation?INDEX:url.href;
  if(!FILES.has(key))return; // Pas de cache d'API, de login ou de données distantes.
  event.respondWith((async()=>{
    const hit=await caches.match(key,{cacheName:CACHE});
    if(hit)return hit;
    // Pas de mélange silencieux de versions : vérifier avant de réparer une ressource.
    try{
      const r=await fetch(new Request(key,{cache:'reload',redirect:'error',credentials:'same-origin'}));
      if(r.ok&&!r.redirected&&await digest(await r.clone().arrayBuffer())===FILES.get(key)){return r;} // Ne jamais recréer un ancien cache depuis une requête en vol.
    }catch{}
    if(navigation){const fallback=await caches.match(new URL('./offline.html',BASE).href,{cacheName:CACHE});if(fallback)return fallback;}
    return new Response('SGC : ressource indisponible. Reconnectez-vous sans effacer les données.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  })());
});
