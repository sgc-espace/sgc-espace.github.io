// Installation/mise à jour du code uniquement, aucune écriture IndexedDB.
export function setupPWA({canUpdate}) {
  const $=id=>document.getElementById(id);
  let registration,prompt,reloadRequested=false;
  const info=text=>{$('pwa-status').textContent=text;};
  function connection(){$('connection-state').textContent=navigator.onLine?'':'Hors ligne : vos modifications restent sur cet appareil.';}
  function offer(){if(registration?.waiting){$('pwa-update').hidden=false;info('Nouvelle version prête. Sauvegardez puis activez lorsque vos formulaires sont fermés.');}}
  function request(worker,type){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Délai de réponse dépassé.')),10000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage({type},[channel.port2]);});}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;$('install-app').disabled=false;info('Installation proposée par ce navigateur.');});
  window.addEventListener('appinstalled',()=>{prompt=null;$('install-app').disabled=true;info('Le navigateur signale une installation. Vérifiez son lancement depuis l’écran d’accueil.');});
  window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
  $('pwa-guide').onclick=()=>$('pwa-guide-dialog').showModal();
  $('pwa-guide-close').onclick=()=>$('pwa-guide-dialog').close();
  $('install-app').onclick=async()=>{if(!prompt)return;try{await prompt.prompt();const r=await prompt.userChoice;info(r.outcome==='accepted'?'Demande acceptée par le navigateur. Vérifiez l’icône sur votre appareil.':'Installation non effectuée.');prompt=null;$('install-app').disabled=true;}catch{info('Installation non confirmée. Utilisez le menu de Chrome sur votre appareil.');}};
  $('pwa-check').onclick=async()=>{if(!registration)return;try{await registration.update();offer();info(registration.waiting?'Nouvelle version disponible.':'Vérification effectuée ; aucune version prête détectée.');}catch{info('Serveur indisponible ou hors ligne. La version déjà chargée et les données locales ne sont pas effacées.');}};
  $('pwa-activate').onclick=async()=>{
    if(!canUpdate()){info('Terminez l’enregistrement et fermez les formulaires ou panneaux avant de mettre à jour.');return;}
    registration=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href)||registration;
    if(!registration?.waiting){info('Aucune mise à jour en attente.');return;}
    $('pwa-activate').disabled=true;
    try{reloadRequested=true;const result=await request(registration.waiting,'SGC_ACTIVATE');if(!result.ok){reloadRequested=false;info(result.reason);}}
    catch(e){reloadRequested=false;info(`Activation non confirmée : ${e.message}`);}
    finally{$('pwa-activate').disabled=false;}
  };
  $('pwa-reload').onclick=()=>{if(canUpdate())location.reload();else info('Enregistrez et fermez vos formulaires avant de recharger.');};
  if(!('serviceWorker' in navigator)||!isSecureContext){info('Service worker indisponible. Utilisez une origine HTTPS autorisée ou le loopback de test.');return;}
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    $('pwa-update').hidden=true;
    if(reloadRequested&&canUpdate())location.reload();
    else if(reloadRequested){reloadRequested=false;$('pwa-reload').hidden=false;info('Code mis à jour. Fermez les formulaires avant de recharger ; aucune saisie n’a été effacée.');}
  });
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(r=>{
    registration=r;offer();
    r.addEventListener('updatefound',()=>{const installing=r.installing;installing?.addEventListener('statechange',()=>{
      if(installing.state==='installed'){offer();if(!r.waiting)info('Ressources hors ligne préparées. Faites une réouverture hors ligne de contrôle.');}
      if(installing.state==='redundant')info('Préparation de version échouée. La version active précédente reste conservée, si présente.');
    });});
    if(r.active&&!r.waiting)info(matchMedia('(display-mode: standalone)').matches?'Mode application détecté sur cet appareil.':'PWA préparée. Installation à confirmer sur votre appareil.');
  }).catch(()=>info('Préparation hors ligne impossible. Ne comptez pas sur le hors-ligne avant un chargement complet réussi.'));
  new MutationObserver(()=>{document.querySelector('meta[name="theme-color"]').content=document.documentElement.dataset.theme==='dark'?'#101626':'#2D348B';}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}
