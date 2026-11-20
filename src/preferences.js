// Préférences d'affichage séparées du schéma métier, aucune donnée professionnelle.
const KEY='sgc-organisation-ui-v2';
export function readPreferences() {
  try {
    const p=JSON.parse(localStorage.getItem(KEY)||'{}');
    return {theme:p.theme==='dark'?'dark':'light',effects:p.effects==='reduced'?'reduced':'full',taskMode:['list','kanban','calendar'].includes(p.taskMode)?p.taskMode:'list'};
  } catch {return {theme:'light',effects:'full'};}
}
export function savePreferences(p) {
  try {localStorage.setItem(KEY,JSON.stringify(p));return true;} catch {return false;}
}
