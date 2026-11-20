import { emptyState, validateState, upgradeState } from './domain.js';
const KEY = 'state';
function transaction(db, mode) {
  if (mode !== 'readwrite') return db.transaction('state', mode);
  try { return db.transaction('state', mode, { durability: 'strict' }); }
  catch (e) { if (e instanceof TypeError || e.name === 'NotSupportedError') return db.transaction('state', mode); throw e; }
}
function run(db, mode, operation) {
  return new Promise((resolve, reject) => {
    let tx, result, failure;
    try { tx = transaction(db, mode); } catch (e) { reject(e); return; }
    const fail = e => { failure = e; try { tx.abort(); } catch { /* already inactive */ } };
    tx.oncomplete = () => failure ? reject(failure) : resolve(result);
    tx.onabort = () => reject(failure || tx.error || new Error('Transaction annulée ; aucune confirmation de sauvegarde.'));
    tx.onerror = () => { /* IndexedDB aborts the transaction; onabort rejects. */ };
    try { operation(tx.objectStore('state'), value => { result = value; }, fail); } catch (e) { fail(e); }
  });
}
export async function openStore(dbName = 'sgc-organisation-lot1') {
  if (!globalThis.indexedDB) throw new Error('IndexedDB indisponible : données non enregistrables.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Ouverture du stockage impossible.'));
    request.onblocked = () => reject(new Error('Stockage bloqué par une autre fenêtre.'));
  });
  db.onversionchange = () => db.close();
  try {
    await run(db, 'readwrite', (store, done, fail) => {
      const read = store.get(KEY);
      read.onsuccess = () => { try { if (read.result === undefined) { store.add(emptyState(), KEY); } else validateState(read.result); done(); } catch (e) { fail(e); } };
    });
  } catch (e) { db.close(); throw e; }
  return {
    read() {
      return run(db, 'readonly', (store, done, fail) => {
        const req = store.get(KEY);
        req.onsuccess = () => { try { done(upgradeState(req.result)); } catch (e) { fail(e); } };
      });
    },
    async write(next, expectedRevision) {
      const candidate = upgradeState(next);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || candidate.revision !== expectedRevision) throw new Error('Révision candidate incohérente.');
      return run(db, 'readwrite', (store, done, fail) => {
        const read = store.get(KEY);
        read.onsuccess = () => {
          try {
            const current = validateState(read.result);
            if (current.revision !== expectedRevision) throw new Error('Conflit : données modifiées dans une autre fenêtre. Rechargez avant de réessayer.');
            const committed = validateState({ ...candidate, revision: expectedRevision + 1 });
            const put = store.put(committed, KEY);
            put.onsuccess = () => {
              const verify = store.get(KEY);
              verify.onsuccess = () => { try {
                const actual = validateState(verify.result);
                if (JSON.stringify(actual) !== JSON.stringify(committed)) throw new Error('Contrôle de relecture impossible.');
                done(actual);
              } catch (e) { fail(e); } };
            };
          } catch (e) { fail(e); }
        };
      });
    },
    close() { db.close(); }
  };
}
