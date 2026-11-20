// Fusion à trois voies (base commune, cet appareil, dépôt) par élément identifié — principe SQPV,
// sans perte silencieuse : chaque vrai conflit garde la version la plus récente ET consigne l'autre.
import { canonicalJSON } from './backup.js';
import { validateState } from './domain.js';

export const COLLECTIONS = [
  { path: ['companies'], label: 'Société', name: r => r.name },
  { path: ['tasks'], label: 'Tâche', name: r => r.title },
  { path: ['notes'], label: 'Note', name: r => r.title || String(r.content || '').slice(0, 60) },
  { path: ['deadlines'], label: 'Échéance', name: r => r.title },
  { path: ['routines', 'models'], label: 'Modèle de routine', name: r => r.title },
  { path: ['routines', 'weeks'], label: 'Semaine de routine', name: r => `${r.title} · ${r.startDate}` }
];
const get = (state, path) => path.reduce((o, k) => o?.[k], state) || [];
export const same = (a, b) => canonicalJSON(a ?? null) === canonicalJSON(b ?? null);
export const dataOf = state => { if (!state) return null; const { revision, ...rest } = state; return rest; };
export const sameData = (a, b) => same(dataOf(a), dataOf(b));
const newer = (l, r) => String(r?.updatedAt || '') > String(l?.updatedAt || '') ? 'remote' : 'local';

function mergeFields(b, l, r) {
  const out = {}; let conflict = false;
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (k === 'updatedAt') continue;
    const bv = b?.[k], lv = l[k], rv = r[k];
    if (same(lv, rv)) out[k] = lv; else if (same(bv, lv)) out[k] = rv; else if (same(bv, rv)) out[k] = lv; else { conflict = true; break; }
  }
  if (conflict) return null;
  out.updatedAt = l.updatedAt > r.updatedAt ? l.updatedAt : r.updatedAt;
  return out;
}

function mergeCollection(col, base, local, remote, opts, conflicts) {
  const index = list => new Map(list.map(x => [x.id, x]));
  const B = index(get(base, col.path)), L = index(get(local, col.path)), R = index(get(remote, col.path));
  const ids = [...new Set([...L.keys(), ...R.keys()])], out = [];
  const record = (kind, kept, lost, keptSide) => conflicts.push({ collection: col.path.join('.'), label: col.label, recordId: (kept || lost).id, name: String(col.name(kept || lost) || 'Sans titre'), kind, keptSide, lost: lost ?? null });
  for (const id of ids) {
    const b = B.get(id), l = L.get(id), r = R.get(id);
    if (l && r) {
      if (same(l, r)) { out.push(l); continue; }
      if (b && same(b, l)) { out.push(r); continue; }
      if (b && same(b, r)) { out.push(l); continue; }
      const fields = opts.fieldMerge ? mergeFields(b, l, r) : null;
      if (fields) { out.push(fields); continue; }
      const side = newer(l, r), kept = side === 'remote' ? r : l, lost = side === 'remote' ? l : r;
      out.push(kept); record('modifié des deux côtés', kept, lost, side);
    } else if (l) {
      if (!b) { out.push(l); continue; }                                   // ajouté ici
      if (same(b, l) && opts.applyDeletions) continue;                     // supprimé ailleurs, inchangé ici
      out.push(l); if (!same(b, l)) record('supprimé ailleurs, modifié ici : conservé', l, null, 'local');
      else record('suppression ailleurs annulée : encore utilisé', l, null, 'local');
    } else if (r) {
      if (!b) { out.push(r); continue; }                                   // ajouté ailleurs
      if (same(b, r) && opts.applyDeletions) continue;                     // supprimé ici, inchangé ailleurs
      out.push(r); if (!same(b, r)) record('supprimé ici, modifié ailleurs : conservé', r, null, 'remote');
      else record('suppression ici annulée : encore utilisé', r, null, 'remote');
    }
  }
  return out;
}

function attempt(base, local, remote, opts) {
  const conflicts = [], next = structuredClone(local);
  for (const col of COLLECTIONS) {
    const merged = mergeCollection(col, base, local, remote, opts, conflicts);
    if (col.path.length === 1) next[col.path[0]] = merged; else next[col.path[0]][col.path[1]] = merged;
  }
  return { state: validateState(next), conflicts };
}

// base : dernier état commun (ou null pour une première fusion). Retourne un état validé.
export function mergeStates(base, local, remote) {
  const plans = [{ fieldMerge: true, applyDeletions: true }, { fieldMerge: false, applyDeletions: true }, { fieldMerge: false, applyDeletions: false }];
  let lastError;
  for (const opts of plans) { try { return attempt(base, local, remote, opts); } catch (e) { lastError = e; } }
  const e = new Error(`Fusion impossible sans perte : ${lastError?.message || 'état incohérent'}. Aucune donnée n’a été modifiée.`); e.code = 'MERGE'; throw e;
}

// Réapplique la version écartée d'un conflit, comme nouvelle modification datée de maintenant.
export function reapplyLost(state, conflict, now = new Date().toISOString()) {
  if (!conflict?.lost) throw Error('Aucune autre version à rétablir pour ce conflit.');
  const path = conflict.collection.split('.'), next = structuredClone(state);
  const list = path.reduce((o, k) => o[k], next), i = list.findIndex(x => x.id === conflict.recordId);
  const restored = { ...structuredClone(conflict.lost), updatedAt: now };
  if (i >= 0) list[i] = restored; else list.push(restored);
  return validateState(next);
}
