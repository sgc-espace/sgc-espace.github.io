// Écran Notes (1.5.0) : tri du plus récent au plus ancien, regroupement par société, recherche
// titre + contenu (accents et majuscules ignorés), corbeille et suppression définitive.
import { validateState } from './domain.js';
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const GENERAL = 'general';
// company : '' = toutes, 'general' = notes sans société, sinon identifiant de société.
export function selectNotes(state, { query = '', trash = false, company = '' } = {}) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  return state.notes.filter(n => !!n.deletedAt === trash
      && (!company || (company === GENERAL ? !n.companyId : n.companyId === company))
      && terms.every(t => norm(`${n.title} ${n.content}`).includes(t)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
// Groupes ordonnés par note la plus récente ; dans chaque groupe, du plus récent au plus ancien.
export function groupNotes(state, notes) {
  const names = new Map(state.companies.map(c => [c.id, c.name])), groups = new Map();
  for (const n of notes) {
    const key = n.companyId || GENERAL;
    if (!groups.has(key)) groups.set(key, { key, label: n.companyId ? names.get(n.companyId) || 'Société inconnue' : 'Générales', notes: [] });
    groups.get(key).notes.push(n);
  }
  return [...groups.values()];
}
export const noteTitle = n => n.title || String(n.content).split(/\r?\n/)[0].slice(0, 80) || 'Note sans titre';
export const notePreview = n => String(n.content).replace(/\s+/g, ' ').slice(0, 140);
// Suppression définitive : seulement depuis la corbeille. La tâche éventuellement créée est conservée.
export function purgeNote(state, id) {
  const n = state.notes.find(x => x.id === id);
  if (!n) throw Error('Note introuvable.');
  if (!n.deletedAt) throw Error('Placez d’abord la note dans la corbeille.');
  return validateState({ ...state, notes: state.notes.filter(x => x.id !== id) });
}
