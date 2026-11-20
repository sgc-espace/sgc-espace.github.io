import {validateOrganiser} from './organiser.js';
import {validateRoutines} from './routines.js';
import {isCivilDate} from './civil-date.js';
export {isCivilDate} from './civil-date.js';
import {validateProfile} from './company-profile.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPANY = ['id', 'name', 'contact', 'email', 'phone', 'notes', 'createdAt', 'updatedAt'];
const TASK = ['id', 'title', 'companyId', 'dueDate', 'priority', 'status', 'notes', 'createdAt', 'updatedAt', 'completedAt'];
function fail(message) { throw new Error(message); }
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} : objet attendu.`);
  if (Object.keys(value).some(k => !keys.includes(k))) fail(`${label} : champ inconnu.`);
}
function complete(value, keys, label) {
  object(value, keys, label);
  if (keys.some(k => !Object.hasOwn(value, k))) fail(`${label} : champ manquant.`);
}
function text(value, label, max = 10000, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label} : texte invalide.`);
  return value;
}
function id(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('Identifiant UUID invalide.'); return value; }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('Horodatage ISO invalide.');
  return value;
}
export function emptyState() { return { schemaVersion: 5, revision: 0, companies: [], tasks: [], routines: {models: [], weeks: []}, notes: [], deadlines: [] }; }
function checkCompany(c) {
  complete(c, Object.hasOwn(c,'profile') ? [...COMPANY,'profile'] : COMPANY, 'Société'); if(Object.hasOwn(c,'profile')) validateProfile(c.profile); id(c.id); text(c.name, 'Nom', 200, true);
  for (const k of ['contact', 'email', 'phone']) text(c[k], k, 300);
  text(c.notes, 'Notes'); timestamp(c.createdAt); timestamp(c.updatedAt);
  if (c.updatedAt < c.createdAt) fail('Société : chronologie invalide.');
}
function checkTask(t, companies) {
  complete(t, TASK, 'Tâche'); id(t.id); text(t.title, 'Titre', 300, true); text(t.notes, 'Notes');
  if (t.companyId !== null && (!companies.has(t.companyId) || !UUID.test(t.companyId))) fail('Société liée introuvable.');
  if (t.dueDate !== '' && !isCivilDate(t.dueDate)) fail('Date civile invalide.');
  if (!['low', 'normal', 'high'].includes(t.priority)) fail('Priorité invalide.');
  if (!['open', 'in_progress', 'done'].includes(t.status)) fail('Statut invalide.');
  timestamp(t.createdAt); timestamp(t.updatedAt);
  if (t.updatedAt < t.createdAt) fail('Tâche : chronologie invalide.');
  if (t.status !== 'done' && t.completedAt !== null) fail('Tâche ouverte avec date de terminaison.');
  if (t.status === 'done') {
    timestamp(t.completedAt);
    if (t.completedAt < t.createdAt || t.completedAt > t.updatedAt) fail('Date de terminaison incohérente.');
  }
}
export function validateState(state) {
  complete(state, state.schemaVersion===5?['schemaVersion','revision','companies','tasks','routines','notes','deadlines']:state.schemaVersion===4?['schemaVersion','revision','companies','tasks','routines']:['schemaVersion','revision','companies','tasks'], 'État');
  if (![1,2,3,4,5].includes(state.schemaVersion)) fail('Version du schéma non supportée.');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0 || state.revision >= Number.MAX_SAFE_INTEGER) fail('Révision invalide.');
  if (!Array.isArray(state.companies) || !Array.isArray(state.tasks) || state.companies.length > 10000 || state.tasks.length > 100000) fail('Collections invalides ou trop volumineuses.');
  const seen = new Set(), companies = new Set();
  for (const c of state.companies) { if(state.schemaVersion===1&&Object.hasOwn(c,'profile')) fail('Fiche enrichie incompatible avec schéma 1.'); checkCompany(c); if (seen.has(c.id)) fail('Identifiant dupliqué.'); seen.add(c.id); companies.add(c.id); }
  for (const t of state.tasks) { if(state.schemaVersion<3&&t.status==='in_progress') fail('Statut En cours incompatible avec cet ancien schéma.'); checkTask(t, companies); if (seen.has(t.id)) fail('Identifiant dupliqué.'); seen.add(t.id); }
  if(state.schemaVersion>=4)validateRoutines(state.routines,companies,seen);
  if(state.schemaVersion===5)validateOrganiser(state,companies,seen);
  return structuredClone(state);
}
export function createCompany(input, { id: companyId, now }) {
  object(input, ['name', 'contact', 'email', 'phone', 'notes', 'profile'], 'Saisie société');
  const c = { id: id(companyId), name: typeof input.name === 'string' ? input.name.trim() : input.name, contact: input.contact ?? '', email: input.email ?? '', phone: input.phone ?? '', notes: input.notes ?? '', createdAt: timestamp(now), updatedAt: now };
  if(Object.hasOwn(input,'profile'))c.profile=structuredClone(input.profile); checkCompany(c); return c;
}
export function updateCompany(existing, input, { now }, state) {
  validateState(state);
  object(input, ['name', 'contact', 'email', 'phone', 'notes', 'profile'], 'Modification société');
  timestamp(now);
  const persisted = state.companies.find(c => c.id === existing.id);
  if (!persisted || JSON.stringify(persisted) !== JSON.stringify(existing)) fail('Société absente ou version périmée.');
  if (now < existing.updatedAt) fail('Horloge antérieure à la dernière modification.');
  const company = { ...existing, ...input, updatedAt: now };
  if (typeof company.name === 'string') company.name = company.name.trim();
  checkCompany(company);
  return company;
}
export function createTask(input, { id: taskId, now }, state) {
  validateState(state); object(input, ['title', 'companyId', 'dueDate', 'priority', 'notes'], 'Saisie tâche');
  const t = { id: id(taskId), title: typeof input.title === 'string' ? input.title.trim() : input.title, companyId: input.companyId ?? null, dueDate: input.dueDate ?? '', priority: input.priority ?? 'normal', status: 'open', notes: input.notes ?? '', createdAt: timestamp(now), updatedAt: now, completedAt: null };
  validateState({ ...state, tasks: [...state.tasks, t] }); return t;
}
export function updateTask(existing, input, { now }, state) {
  validateState(state); object(input, ['title', 'companyId', 'dueDate', 'priority', 'status', 'notes'], 'Modification tâche'); timestamp(now);
  const persisted = state.tasks.find(t => t.id === existing.id);
  if (!persisted || JSON.stringify(persisted) !== JSON.stringify(existing)) fail('Tâche absente ou version périmée.');
  if (now < existing.updatedAt) fail('Horloge antérieure à la dernière modification.');
  const t = { ...existing, ...input, updatedAt: now };
  if (typeof t.title === 'string') t.title = t.title.trim();
  t.completedAt = t.status === 'done' ? (existing.status === 'done' ? existing.completedAt : now) : null;
  validateState({ ...state, tasks: state.tasks.map(x => x.id === t.id ? t : x) }); return t;
}

export function upgradeState(state) { const copy=validateState(state); if(copy.schemaVersion<4)copy.routines={models:[],weeks:[]}; if(copy.schemaVersion<5){copy.notes=[];copy.deadlines=[];} copy.schemaVersion=5; return copy; }
export function deleteCompany(state,companyId){
 const s=validateState(state),company=s.companies.find(c=>c.id===companyId);
 if(!company)throw Error('Société introuvable.');
 if(s.notes?.some(n=>n.companyId===companyId)||s.deadlines?.some(d=>d.companyId===companyId)||s.tasks.some(t=>t.companyId===companyId)||s.routines?.models.some(m=>m.companyId===companyId)||s.routines?.weeks.some(w=>w.companyId===companyId))throw Error('Suppression bloquée : cette société possède des tâches, notes, échéances ou routines liées. Les données et historiques sont conservés.');
 const next={...s,companies:s.companies.filter(c=>c.id!==companyId)};return validateState(next);
}
export function convertNoteToTask(state,noteId,{now,id:taskId}){
 const s=validateState(state),note=s.notes.find(n=>n.id===noteId);if(!note||note.deletedAt)throw Error('Note absente ou dans la corbeille.');if(note.taskId)throw Error('Cette note est déjà convertie.');if(now<note.updatedAt)throw Error('Horloge antérieure.');const task=createTask({title:note.title||note.content.split(/\r?\n/)[0].slice(0,300),companyId:note.companyId,notes:note.content},{id:taskId,now},s);return validateState({...s,tasks:[...s.tasks,task],notes:s.notes.map(n=>n.id===noteId?{...n,taskId:task.id,updatedAt:now}:n)});
}
