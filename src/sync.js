// Moteur de synchronisation chiffrée entre appareils (méthode SQPV : dépôt GitHub privé + jeton),
// adapté à SGC : écriture locale par la transaction atomique existante, contenu = sauvegarde
// complète validée (format 5 + empreinte), aucun choix silencieux à la première synchronisation.
import { createBackup, parseBackup } from './backup.js';
import { KDF_ITERATIONS, MIN_PASSPHRASE, deriveKey, randomSalt, encryptJSON, decryptJSON, parseEnvelope, sealSecret, openSecret } from './sync-crypto.js';
import { createGitHubClient, normalizeRepo, checkToken } from './sync-github.js';
import { mergeStates, reapplyLost, sameData, dataOf } from './sync-merge.js';

const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };
const countsOf = s => ({ companies: s.companies.length, tasks: s.tasks.length, notes: s.notes.length, deadlines: s.deadlines.length, weeks: s.routines.weeks.length });
const isEmpty = s => !s.companies.length && !s.tasks.length && !s.notes.length && !s.deadlines.length && !s.routines.models.length && !s.routines.weeks.length;

export function createSyncEngine({ vault, readState, writeState, isEditing = () => false, safetyCopy = async () => true,
  clientFactory = createGitHubClient, onUpdate = () => {}, now = () => new Date().toISOString(), timers = globalThis }) {
  const S = { status: 'off', message: '', code: '', config: null, key: null, client: null, busy: false, again: false, pending: null, conflicts: [], timer: null, poll: null };
  const emit = () => { try { onUpdate(view()); } catch { /* affichage seulement */ } };
  const setStatus = (status, message = '', code = '') => { S.status = status; S.message = message; S.code = code; emit(); };
  function view() {
    return { status: S.status, message: S.message, code: S.code, connected: !!S.config, unlocked: !!S.key, busy: S.busy, repo: S.config?.repo || '',
      lastSync: S.config?.lastSync || null, tokenExpires: S.config?.tokenExpires || '', remember: !!S.config?.remember, pending: S.pending, conflicts: S.conflicts };
  }
  function schedule(ms = 4000) { if (!S.client || !S.key) return; timers.clearTimeout(S.timer); S.timer = timers.setTimeout(() => syncNow({ silent: true }), ms); }
  function startPolling() { timers.clearInterval(S.poll); S.poll = timers.setInterval(() => { if (S.client && S.key && !(globalThis.document?.hidden)) syncNow({ silent: true }); }, 20000); }
  function stop() { timers.clearTimeout(S.timer); timers.clearInterval(S.poll); S.timer = S.poll = null; }

  async function makePayload(state) { return { kind: 'sgc-sync', savedAt: now(), device: S.config.deviceId, backup: await createBackup(state) }; }
  async function readPayload(p) {
    if (!p || typeof p !== 'object' || Object.keys(p).sort().join() !== 'backup,device,kind,savedAt' || p.kind !== 'sgc-sync' || typeof p.backup !== 'string' || typeof p.device !== 'string' || typeof p.savedAt !== 'string') throw fail('FORMAT', 'Contenu synchronisé invalide.');
    return { state: await parseBackup(p.backup), savedAt: p.savedAt, device: p.device };
  }
  async function activate(config, key, remember) {
    const token = await openSecret(config.token, key);
    S.client = clientFactory({ repo: config.repo, token }); S.key = key; S.config = config;
    await vault.setMany({ config, key: remember ? key : undefined });
    startPolling();
  }

  async function init() {
    try {
      S.config = (await vault.get('config')) || null; S.conflicts = (await vault.get('conflicts')) || [];
      if (!S.config) { setStatus('off'); return view(); }
      const key = await vault.get('key');
      if (!key) { setStatus('locked', 'Saisissez la phrase secrète pour reprendre la synchronisation sur cet appareil.'); return view(); }
      await activate(S.config, key, true); setStatus('idle', 'Prête'); schedule(1200);
    } catch (e) { S.key = null; S.client = null; setStatus('locked', 'Saisissez la phrase secrète pour reprendre la synchronisation.'); }
    return view();
  }

  async function connect({ repo, token, passphrase, confirm, remember = true, tokenExpires = '', reset = false }) {
    if (S.busy) throw fail('BUSY', 'Synchronisation déjà en cours.');
    repo = normalizeRepo(repo); token = checkToken(token);
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) throw fail('INPUT', `Phrase secrète trop courte : ${MIN_PASSPHRASE} caractères minimum (16 conseillés).`);
    if (tokenExpires && !/^\d{4}-\d{2}-\d{2}$/.test(tokenExpires)) throw fail('INPUT', 'Date d’expiration du jeton invalide.');
    S.busy = true; setStatus('sync', 'Vérification du dépôt…');
    try {
      const client = clientFactory({ repo, token }), info = await client.checkRepo();
      if (!info.private) throw fail('PUBLIC', 'Ce dépôt est PUBLIC : choisissez un dépôt privé pour vos données.');
      const remote = await client.read();
      let kdf, key;
      if (!remote.missing && !reset) {
        const env = parseEnvelope(remote.text); kdf = env.kdf;
        key = await deriveKey(passphrase, kdf.salt, kdf.iterations);
        await decryptJSON(env, key); // vérifie la phrase avant tout enregistrement
      } else {
        if (passphrase !== confirm) throw fail('INPUT', 'Les deux phrases secrètes ne sont pas identiques.');
        if (reset && remote.missing) throw fail('INPUT', 'Aucun fichier à réinitialiser dans ce dépôt.');
        kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: randomSalt() };
        key = await deriveKey(passphrase, kdf.salt, kdf.iterations);
      }
      if (!(await safetyCopy())) throw fail('SAFETY', 'Copie de sécurité de cet appareil non confirmée : synchronisation non activée.');
      const config = { repo, kdf, token: await sealSecret(token, key), deviceId: [...crypto.getRandomValues(new Uint8Array(4))].map(b => b.toString(16).padStart(2, '0')).join(''), tokenExpires, remember: !!remember, lastSync: null, sha: null };
      await vault.setMany({ base: undefined, conflicts: [] }); S.conflicts = []; S.pending = null;
      await activate(config, key, remember);
      if (reset) {
        const local = await readState();
        const text = await encryptJSON(await makePayload(local), key, kdf);
        const { sha } = await client.write(text, remote.sha, `reset ${config.deviceId} ${now()}`);
        S.config = { ...config, sha, lastSync: now() }; await vault.setMany({ config: S.config, base: dataOf(local) });
        S.busy = false;
        setStatus('ok', 'À jour · chiffrement réinitialisé. Reconnectez les autres appareils avec la nouvelle phrase.');
        return view();
      }
    } catch (e) {
      S.busy = false;
      if (!S.config) { S.client = null; S.key = null; setStatus('off', ''); } else setStatus('err', e.message);
      throw e;
    }
    S.busy = false;
    await syncNow({ force: true });
    return view();
  }

  async function unlock(passphrase, remember = S.config?.remember) {
    if (!S.config) throw fail('INPUT', 'Synchronisation non configurée.');
    const key = await deriveKey(passphrase, S.config.kdf.salt, S.config.kdf.iterations);
    await activate(S.config, key, remember); // openSecret refuse une mauvaise phrase
    setStatus('idle', 'Déverrouillée'); await syncNow({ force: true }); return view();
  }
  // Vérifie la phrase sans rien modifier (déverrouillage du code PIN oublié).
  async function verifyPassphrase(passphrase) {
    const config = S.config || (await vault.get('config'));
    if (!config) return false;
    try { await openSecret(config.token, await deriveKey(passphrase, config.kdf.salt, config.kdf.iterations)); return true; } catch { return false; }
  }

  async function syncNow({ force = false, mode = null, silent = false } = {}) {
    if (!S.client || !S.key) return view();
    if (S.busy) { S.again = true; return view(); }
    if (!force && isEditing()) { schedule(4000); return view(); }
    S.busy = true; if (!silent || S.status !== 'ok') setStatus('sync', 'Synchronisation…');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const cfg = S.config, base = await vault.get('base'), local = await readState(), remote = await S.client.read();
        let remoteState = null, remoteInfo = null;
        if (!remote.missing) {
          const env = parseEnvelope(remote.text);
          if (env.kdf.salt !== cfg.kdf.salt || env.kdf.iterations !== cfg.kdf.iterations) throw fail('KEYCHANGED', 'Le chiffrement a été réinitialisé sur un autre appareil : désactivez puis reconnectez cet appareil avec la nouvelle phrase secrète.');
          remoteInfo = await readPayload(await decryptJSON(env, S.key)); remoteState = remoteInfo.state;
        }
        let merged = local, conflicts = [];
        if (remoteState && !base) {
          const restored = !!(await vault.get('restorePending'));
          if (!mode) {
            S.pending = { reason: restored ? 'restore' : 'first', remote: countsOf(remoteState), local: countsOf(local), localEmpty: isEmpty(local), savedAt: remoteInfo.savedAt, device: remoteInfo.device };
            setStatus('ask', restored ? 'Sauvegarde restaurée : choisissez comment la synchroniser. Rien n’est envoyé ni supprimé sans votre choix.' : isEmpty(local) ? 'Le dépôt contient des données : vérifiez l’aperçu puis récupérez-les.' : 'Le dépôt et cet appareil contiennent des données : choisissez quoi faire.');
            return view();
          }
          if (mode === 'push' && !restored) throw fail('INPUT', 'Envoi forcé réservé à une restauration.');
          if (mode === 'replace') merged = remoteState; else if (mode === 'push') merged = local; else ({ state: merged, conflicts } = mergeStates(null, local, remoteState));
        } else if (remoteState) ({ state: merged, conflicts } = mergeStates(base, local, remoteState));
        merged = { ...merged, revision: local.revision };
        let committed = local;
        if (!sameData(merged, local)) {
          if (!force && isEditing()) { schedule(3000); return view(); }
          try { committed = await writeState(merged, local.revision); } catch (e) { if (attempt < 3) continue; throw e; }
        }
        let sha = remote.sha || null;
        if (!remoteState || !sameData(committed, remoteState)) {
          const text = await encryptJSON(await makePayload(committed), S.key, cfg.kdf);
          try { ({ sha } = await S.client.write(text, remote.sha, `sync ${cfg.deviceId} ${now()}`)); }
          catch (e) { if (e.code === 'CONFLICT' && attempt < 3) continue; throw e; }
        }
        const at = now(), all = [...conflicts.map(c => ({ ...c, id: crypto.randomUUID(), at })), ...S.conflicts].slice(0, 200);
        const config = { ...cfg, sha, lastSync: at };
        await vault.setMany({ base: dataOf(committed), config, conflicts: all, restorePending: undefined });
        S.config = config; S.conflicts = all; S.pending = null;
        setStatus('ok', conflicts.length ? `À jour · ${conflicts.length} conflit(s) à vérifier` : 'À jour');
        return view();
      }
      throw fail('CONFLICT', 'Modifications simultanées répétées : nouvel essai automatique bientôt.');
    } catch (e) {
      const code = e.code || '';
      if (code === 'BADPASS' || code === 'KEYCHANGED') { S.key = null; S.client = null; stop(); await vault.del('key').catch(() => {}); setStatus('locked', e.message, code); }
      else if (code === 'AUTH') setStatus('err', 'Jeton GitHub refusé : il a probablement expiré ou été révoqué. Créez un nouveau jeton (mêmes réglages) puis « Remplacer le jeton ». Vos données restent sur cet appareil.', code);
      else setStatus(code === 'OFFLINE' || code === 'NETWORK' ? 'offline' : 'err', e.message, code);
      return view();
    } finally {
      S.busy = false; emit();
      if (S.again) { S.again = false; schedule(1500); }
    }
  }

  // Remplacement du jeton expiré ou révoqué, sans toucher aux données ni à la phrase secrète.
  async function replaceToken({ token, tokenExpires = '', passphrase = '' }) {
    if (!S.config) throw fail('INPUT', 'Synchronisation non configurée.');
    token = checkToken(token);
    if (tokenExpires && !/^\d{4}-\d{2}-\d{2}$/.test(tokenExpires)) throw fail('INPUT', 'Date d’expiration du jeton invalide.');
    const key = S.key || await deriveKey(passphrase, S.config.kdf.salt, S.config.kdf.iterations);
    await openSecret(S.config.token, key); // vérifie la clé (phrase) avant de remplacer
    const client = clientFactory({ repo: S.config.repo, token }), info = await client.checkRepo();
    if (!info.private) throw fail('PUBLIC', 'Ce dépôt est PUBLIC : choisissez un dépôt privé pour vos données.');
    const config = { ...S.config, token: await sealSecret(token, key), tokenExpires };
    await activate(config, key, S.config.remember || !!S.key);
    setStatus('idle', 'Jeton remplacé'); await syncNow({ force: true }); return view();
  }
  async function setTokenExpires(date) {
    if (!S.config) return view();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('INPUT', 'Date invalide.');
    S.config = { ...S.config, tokenExpires: date }; await vault.set('config', S.config); emit(); return view();
  }
  // Après une restauration : la base commune est oubliée pour qu'aucun élément absent de la
  // sauvegarde ne soit pris pour une suppression à propager ; l'utilisateur choisit ensuite.
  async function afterRestore() {
    if (!S.config) return view();
    await vault.setMany({ base: undefined, restorePending: true });
    if (S.client && S.key) return syncNow({ force: true });
    return view();
  }
  async function cancelFirst() { S.pending = null; await disconnect(); }
  async function disconnect() { stop(); await vault.clear(); Object.assign(S, { config: null, key: null, client: null, pending: null, conflicts: [] }); setStatus('off'); return view(); }
  async function restoreConflict(id) {
    const c = S.conflicts.find(x => x.id === id); if (!c) throw fail('INPUT', 'Conflit introuvable.');
    const local = await readState();
    await writeState(reapplyLost(local, c, now()), local.revision);
    await dismissConflict(id); schedule(1000);
  }
  async function dismissConflict(id) { S.conflicts = S.conflicts.filter(x => x.id !== id); await vault.set('conflicts', S.conflicts); emit(); }

  return { init, afterRestore, replaceToken, setTokenExpires, connect, unlock, verifyPassphrase, syncNow, schedule, disconnect, cancelFirst, restoreConflict, dismissConflict, view, stop };
}
