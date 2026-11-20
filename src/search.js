// Recherche globale (lot 4, P2) : sociétés (y compris fiche détaillée), tâches, notes et échéances.
// Insensible aux accents et à la casse ; tous les mots saisis doivent être présents. Les pièces
// jointes ne sont pas fouillées (seuls leurs titres et noms de fichier le sont).
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SKIP = new Set(['base64', 'sha256', 'id', 'mime', 'size']);
function texts(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => texts(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!SKIP.has(k)) texts(v, out);
  return out;
}
export function searchAll(state, query, limit = 50) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  const names = new Map(state.companies.map(c => [c.id, c.name]));
  const company = id => (id && names.get(id)) || '';
  const match = (...fields) => { const hay = norm(fields.flat().filter(Boolean).join(' \u0001 ')); return terms.every(t => hay.includes(t)); };
  const pick = list => ({ total: list.length, items: list.slice(0, limit) });
  return {
    terms,
    companies: pick(state.companies.filter(c => match(c.name, c.contact, c.email, c.phone, c.notes, texts(c.profile)))),
    tasks: pick(state.tasks.filter(t => match(t.title, t.notes, company(t.companyId)))),
    notes: pick(state.notes.filter(n => match(n.title, n.content, company(n.companyId)))),
    deadlines: pick(state.deadlines.filter(d => match(d.title, d.category, d.description, d.notes, company(d.companyId), (d.links || []).map(l => l.label))))
  };
}
// Doublons de société (lot 4, P3) : même nom une fois accents, casse, ponctuation et espaces ignorés.
export const companyKey = name => norm(name).replace(/[^a-z0-9]+/g, ' ').trim();
export function findDuplicateCompany(companies, name, exceptId = null) {
  const key = companyKey(name);
  return key ? companies.find(c => c.id !== exceptId && companyKey(c.name) === key) || null : null;
}
