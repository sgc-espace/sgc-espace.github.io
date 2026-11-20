// Transport GitHub Contents API (dépôt privé de données) — même méthode que SQPV.
// Le jeton n'est envoyé qu'à api.github.com, en HTTPS, pour le seul dépôt configuré.
import { b64 } from './sync-crypto.js';
export const API = 'https://api.github.com';
export const DATA_FILE = 'sgc-data.enc';
const enc = new TextEncoder(), dec = new TextDecoder();

function failure(code, message, status) { const e = new Error(message); e.code = code; e.status = status; return e; }
export function normalizeRepo(value) {
  const repo = String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo)) throw failure('INPUT', 'Dépôt invalide : écrivez-le sous la forme proprietaire/nom-du-depot.');
  return repo;
}
export function checkToken(token) {
  const t = String(token || '').trim();
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,255}$/.test(t)) throw failure('INPUT', 'Jeton GitHub invalide : collez le jeton complet (il commence par github_pat_).');
  return t;
}

export function createGitHubClient({ repo, token, fetchImpl = (...a) => fetch(...a) }) {
  repo = normalizeRepo(repo); token = checkToken(token);
  const url = suffix => `${API}/repos/${repo}${suffix}`;
  async function call(method, suffix, { accept = 'application/vnd.github+json', body } = {}) {
    let res;
    try {
      res = await fetchImpl(url(suffix), { method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    } catch { throw failure(navigator.onLine === false ? 'OFFLINE' : 'NETWORK', navigator.onLine === false ? 'Hors ligne : la synchronisation reprendra à la reconnexion.' : 'GitHub injoignable pour le moment.'); }
    if (res.status === 401) throw failure('AUTH', 'Jeton refusé par GitHub (expiré, révoqué ou mal copié).', 401);
    if (res.status === 403 || res.status === 429) {
      if (res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429) throw failure('RATE', 'Limite de requêtes GitHub atteinte : nouvel essai plus tard.', res.status);
      throw failure('AUTH', 'Accès refusé : le jeton doit avoir « Contents : Read and write » sur ce dépôt.', 403);
    }
    return res;
  }
  return {
    repo,
    async checkRepo() {
      const res = await call('GET', '');
      if (res.status === 404) throw failure('NOTFOUND', 'Dépôt introuvable avec ce jeton. Vérifiez le nom et l’accès du jeton à ce dépôt.', 404);
      if (!res.ok) throw failure('HTTP', `GitHub a répondu ${res.status}.`, res.status);
      const j = await res.json();
      return { private: j.private === true, fullName: String(j.full_name || repo), canPush: j.permissions ? j.permissions.push === true : null };
    },
    async read() {
      const res = await call('GET', `/contents/${DATA_FILE}`);
      if (res.status === 404) return { missing: true };
      if (!res.ok) throw failure('HTTP', `GitHub a répondu ${res.status} à la lecture.`, res.status);
      const j = await res.json();
      if (j.type !== 'file' || typeof j.sha !== 'string') throw failure('FORMAT', 'Le fichier de données du dépôt est invalide.');
      if (j.encoding === 'base64' && typeof j.content === 'string' && j.content) {
        const bin = atob(j.content.replace(/\s/g, ''));
        return { sha: j.sha, text: dec.decode(Uint8Array.from(bin, c => c.charCodeAt(0))) };
      }
      // Au-delà de 1 Mo, l'API ne renvoie plus le contenu : lecture en format brut.
      const raw = await call('GET', `/contents/${DATA_FILE}`, { accept: 'application/vnd.github.raw+json' });
      if (!raw.ok) throw failure('HTTP', `GitHub a répondu ${raw.status} à la lecture.`, raw.status);
      return { sha: j.sha, text: await raw.text() };
    },
    async write(text, sha, message) {
      const res = await call('PUT', `/contents/${DATA_FILE}`, { body: { message, content: b64(enc.encode(text)), ...(sha ? { sha } : {}) } });
      if (res.status === 409 || res.status === 422) throw failure('CONFLICT', 'Le fichier a changé pendant l’envoi.', res.status);
      if (res.status === 404) throw failure('NOTFOUND', 'Dépôt introuvable ou jeton sans accès en écriture.', 404);
      if (!res.ok) throw failure('HTTP', `GitHub a répondu ${res.status} à l’envoi.`, res.status);
      const j = await res.json();
      if (typeof j?.content?.sha !== 'string') throw failure('FORMAT', 'Réponse GitHub inattendue après l’envoi.');
      return { sha: j.content.sha };
    }
  };
}
