// Horloge des modifications tolérante aux petits écarts entre appareils synchronisés.
// Si la dernière modification connue (faite sur un autre appareil dont l'horloge avance un peu)
// est dans le futur de moins de 10 minutes, la nouvelle modification est datée juste après elle :
// l'ordre est conservé et l'utilisateur n'est pas bloqué. Au-delà, l'heure réelle est gardée et
// le domaine refuse comme avant (horloge réellement fausse).
export const SKEW_MS = 10 * 60 * 1000;
function* stamps(state) {
  for (const k of ['companies', 'tasks', 'notes', 'deadlines']) for (const r of state?.[k] || []) yield r.updatedAt;
  for (const r of state?.routines?.models || []) yield r.updatedAt;
  for (const r of state?.routines?.weeks || []) yield r.updatedAt;
}
export function latestStamp(state) { let max = ''; for (const s of stamps(state)) if (typeof s === 'string' && s > max) max = s; return max || null; }
export function editNow(state, real = Date.now()) {
  const latest = latestStamp(state), t = latest ? Date.parse(latest) : NaN;
  if (Number.isFinite(t) && t >= real && t - real <= SKEW_MS) return new Date(t + 1).toISOString();
  return new Date(real).toISOString();
}
