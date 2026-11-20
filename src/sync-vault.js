// Coffre local de l'appareil pour la synchronisation, séparé de la base métier (dont le nom
// et la version physique restent inchangés). Contient : configuration, jeton CHIFFRÉ, clé
// non exportable (si l'utilisateur la mémorise), dernier état commun et conflits à vérifier.
// Jamais inclus dans les sauvegardes, exports ou fichiers synchronisés.
const DB = 'sgc-organisation-sync', STORE = 'kv';
function open() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Coffre de synchronisation indisponible.'));
    r.onblocked = () => reject(new Error('Coffre de synchronisation bloqué par une autre fenêtre.'));
  });
}
async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode); let result;
      t.oncomplete = () => resolve(result); t.onabort = () => reject(t.error || new Error('Écriture du coffre annulée.'));
      fn(t.objectStore(STORE), v => { result = v; });
    });
  } finally { db.close(); }
}
export const browserVault = {
  get(key) { return tx('readonly', (s, done) => { const q = s.get(key); q.onsuccess = () => done(q.result); }); },
  set(key, value) { return tx('readwrite', s => { s.put(value, key); }); },
  setMany(entries) { return tx('readwrite', s => { for (const [k, v] of Object.entries(entries)) v === undefined ? s.delete(k) : s.put(v, k); }); },
  del(key) { return tx('readwrite', s => { s.delete(key); }); },
  clear() { return tx('readwrite', s => { s.clear(); }); }
};
export function memoryVault() {
  const m = new Map(), copy = v => (v === undefined ? v : (v instanceof CryptoKey ? v : structuredClone(v)));
  return {
    async get(k) { return copy(m.get(k)); }, async set(k, v) { m.set(k, copy(v)); },
    async setMany(e) { for (const [k, v] of Object.entries(e)) v === undefined ? m.delete(k) : m.set(k, copy(v)); },
    async del(k) { m.delete(k); }, async clear() { m.clear(); }
  };
}
