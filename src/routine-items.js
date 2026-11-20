// Points de routine affichés avec les tâches (aucune copie : projection en lecture des semaines).
// Une seule source de vérité : la routine. Cocher un point passe par checkStep (historique compris).
import { monday } from './routines.js';
import { localToday, dayAfter } from './task-views.js';

export const STEP_LABEL = { todo: 'À faire', done: 'Fait', na: 'Non applicable' };
export const weekDue = startDate => dayAfter(startDate, 4); // vendredi de la semaine
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function item(w, s, today) {
  const dueDate = weekDue(w.startDate);
  return { kind: 'routine', id: `${w.id}:${s.id}`, weekId: w.id, stepId: s.id, companyId: w.companyId, routineTitle: w.title, label: s.label, status: s.status,
    reason: s.reason, comment: s.comment, completedAt: s.completedAt, startDate: w.startDate, dueDate, closed: w.closed,
    late: !w.closed && s.status === 'todo' && today > dueDate };
}
// Points actifs : toute la semaine en cours (et semaines futures déjà démarrées) des semaines non clôturées,
// plus les points encore « à faire » des semaines passées non clôturées (en retard).
export function activeRoutineItems(state, today = localToday()) {
  const current = monday(today), out = [];
  for (const w of state.routines?.weeks || []) {
    if (w.closed) continue;
    for (const s of w.steps) if (w.startDate >= current || s.status === 'todo') out.push(item(w, s, today));
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.companyId.localeCompare(b.companyId));
}
// Tous les points de toutes les semaines (clôturées comprises) : historique, recherche, période de terminaison.
export function allRoutineItems(state, today = localToday()) {
  return (state.routines?.weeks || []).flatMap(w => w.steps.map(s => item(w, s, today))).sort((a, b) => b.startDate.localeCompare(a.startDate));
}
export function routineInScope(it, scope, today = localToday()) {
  if (scope === 'all') return true;
  if (scope === 'open' || scope === 'todo') return it.status === 'todo';
  if (scope === 'done') return it.status === 'done';
  if (scope === 'today') return it.status === 'todo' && it.dueDate === today;
  if (scope === 'upcoming') return it.status === 'todo' && it.dueDate > today && it.dueDate <= dayAfter(today, 7);
  if (scope === 'history') return it.late;
  return false; // in_progress, undated : sans objet pour une routine
}
// Mêmes filtres que la liste des tâches. Une priorité choisie exclut les routines (elles n'en ont pas).
export function selectRoutineItems(state, { companyId = '', scope = 'all', query = '', companies = [], today = localToday(), dateFrom = '', dateTo = '', dateField = 'dueDate', priority = '' } = {}) {
  if (priority || (dateFrom && dateTo && dateFrom > dateTo)) return [];
  const source = scope === 'done' ? allRoutineItems(state, today) : activeRoutineItems(state, today);
  const name = id => companies.find(c => c.id === id)?.name || '';
  return source.filter(it => {
    const date = dateField === 'completedAt' ? (it.completedAt ? localToday(new Date(it.completedAt)) : '') : it.dueDate;
    return (!companyId || it.companyId === companyId) && routineInScope(it, scope, today)
      && (!(dateFrom || dateTo) || (date && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)))
      && (!query || norm(`${it.label} ${it.routineTitle} ${name(it.companyId)} ${it.reason} ${it.comment}`).includes(norm(query)));
  });
}
// Avancement de la semaine en cours par société (accueil) et semaines passées non clôturées.
export function routineOverview(state, { companyId = '', today = localToday() } = {}) {
  const current = monday(today), weeks = state.routines?.weeks || [];
  const rows = weeks.filter(w => w.startDate === current && (!companyId || w.companyId === companyId)).map(w => {
    const applicable = w.steps.filter(s => s.status !== 'na').length, done = w.steps.filter(s => s.status === 'done').length;
    return { weekId: w.id, companyId: w.companyId, closed: w.closed, done, applicable, todo: w.steps.filter(s => s.status === 'todo').length, percent: applicable ? Math.round(done / applicable * 100) : null };
  });
  const lateWeeks = weeks.filter(w => !w.closed && w.startDate < current && (!companyId || w.companyId === companyId)).map(w => ({ weekId: w.id, companyId: w.companyId, startDate: w.startDate, todo: w.steps.filter(s => s.status === 'todo').length }));
  const notStarted = (state.routines?.models || []).filter(m => m.enabled && (!companyId || m.companyId === companyId) && !weeks.some(w => w.companyId === m.companyId && w.startDate === current)).map(m => m.companyId);
  return { current, rows, lateWeeks, notStarted };
}

// Rapport des routines : sélection des semaines et des points selon les filtres choisis.
export const WEEK_STATES = { all: 'Ouvertes et clôturées', open: 'Ouvertes seulement', closed: 'Clôturées seulement' };
export const POINT_STATES = { all: 'Tous', todo: 'À faire', done: 'Faits', na: 'Non applicables' };
export function selectReportWeeks(state, { companyId = '', from = '', to = '', weekState = 'all', pointState = 'all' } = {}) {
  if (from && to && from > to) throw Error('Période invalide : la première semaine doit précéder la dernière.');
  if (!WEEK_STATES[weekState] || !POINT_STATES[pointState]) throw Error('Filtre de rapport invalide.');
  const lo = from ? monday(from) : '', hi = to ? monday(to) : '';
  const weeks = (state.routines?.weeks || []).filter(w => (!companyId || w.companyId === companyId) && (!lo || w.startDate >= lo) && (!hi || w.startDate <= hi)
    && (weekState === 'all' || (weekState === 'closed') === w.closed))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.companyId.localeCompare(b.companyId));
  const rows = weeks.map(w => ({ week: w, steps: w.steps.filter(s => pointState === 'all' || s.status === pointState) }));
  const points = rows.flatMap(r => r.steps), done = points.filter(s => s.status === 'done').length, na = points.filter(s => s.status === 'na').length;
  const applicable = points.length - na;
  return { rows, totals: { weeks: rows.length, companies: new Set(rows.map(r => r.week.companyId)).size, points: points.length, done, na, todo: points.length - done - na, percent: applicable ? Math.round(done / applicable * 100) : null } };
}
