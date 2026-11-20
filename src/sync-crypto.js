// Chiffrement de bout en bout du fichier de synchronisation (principe SQPV V19.3, renforcé).
// AES-256-GCM, clé dérivée de la phrase secrète par PBKDF2-SHA-256, gzip avant chiffrement,
// en-tête authentifié (AAD) : toute modification de l'en-tête ou du contenu est refusée.
// Aucune phrase secrète n'est conservée : seule une clé non exportable peut l'être, par l'appelant.
const enc = new TextEncoder(), dec = new TextDecoder();
export const APP = 'sgc-organisation', PROTOCOL = 1;
export const KDF_ITERATIONS = 600000;
export const MIN_ITERATIONS = 100000, MAX_ITERATIONS = 5000000;
export const MAX_PLAIN_BYTES = 40 * 1024 * 1024;      // contenu déchiffré et décompressé
export const MAX_FILE_BYTES = 60 * 1024 * 1024;       // fichier chiffré (texte JSON)
export const MIN_PASSPHRASE = 12;

export function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
export function unb64(s) {
  if (typeof s !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) throw cryptoError('FORMAT', 'Fichier de synchronisation invalide (base64).');
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
function cryptoError(code, message) { const e = new Error(message); e.code = code; return e; }

async function transform(u8, stream, limit) {
  const writer = stream.writable.getWriter();
  writer.write(u8).catch(() => {}); writer.close().catch(() => {});
  const reader = stream.readable.getReader(), parts = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (limit && size > limit) { await reader.cancel().catch(() => {}); throw cryptoError('TOO_LARGE', 'Contenu synchronisé trop volumineux.'); }
    parts.push(value);
  }
  const out = new Uint8Array(size); let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.byteLength; }
  return out;
}

export function randomSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }

export async function deriveKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  if (typeof passphrase !== 'string' || !passphrase) throw cryptoError('BADPASS', 'Phrase secrète manquante.');
  checkKdf({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt });
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function checkKdf(kdf) {
  if (!kdf || typeof kdf !== 'object' || Object.keys(kdf).sort().join() !== 'hash,iterations,name,salt' || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256'
    || !Number.isSafeInteger(kdf.iterations) || kdf.iterations < MIN_ITERATIONS || kdf.iterations > MAX_ITERATIONS) throw cryptoError('FORMAT', 'Paramètres de dérivation de clé invalides.');
  if (unb64(kdf.salt).length !== 16) throw cryptoError('FORMAT', 'Sel de dérivation invalide.');
}

// Données additionnelles authentifiées : tout l'en-tête, sous forme canonique.
function aad(h) { return enc.encode(JSON.stringify([h.app, h.proto, h.cipher, h.kdf.name, h.kdf.hash, h.kdf.iterations, h.kdf.salt, h.iv, h.gz])); }

export async function encryptJSON(value, key, kdf) {
  checkKdf(kdf);
  let raw = enc.encode(JSON.stringify(value));
  if (raw.byteLength > MAX_PLAIN_BYTES) throw cryptoError('TOO_LARGE', 'Données trop volumineuses pour la synchronisation (40 Mio maximum).');
  raw = await transform(raw, new CompressionStream('gzip'));
  const h = { app: APP, proto: PROTOCOL, cipher: 'AES-256-GCM', kdf: { name: kdf.name, hash: kdf.hash, iterations: kdf.iterations, salt: kdf.salt }, iv: b64(crypto.getRandomValues(new Uint8Array(12))), gz: true };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: unb64(h.iv), additionalData: aad(h), tagLength: 128 }, key, raw));
  const text = JSON.stringify({ ...h, ct: b64(ct) });
  if (text.length > MAX_FILE_BYTES) throw cryptoError('TOO_LARGE', 'Fichier chiffré trop volumineux.');
  return text;
}

// Analyse stricte de l'enveloppe, sans déchiffrer : sert aussi à lire le sel avant de dériver la clé.
export function parseEnvelope(text) {
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) throw cryptoError('TOO_LARGE', 'Fichier de synchronisation absent ou trop volumineux.');
  let f; try { f = JSON.parse(text); } catch { throw cryptoError('FORMAT', 'Fichier de synchronisation illisible.'); }
  if (!f || typeof f !== 'object' || Array.isArray(f) || Object.keys(f).sort().join() !== 'app,cipher,ct,gz,iv,kdf,proto') throw cryptoError('FORMAT', 'Enveloppe de synchronisation invalide.');
  if (f.app !== APP) throw cryptoError('FORMAT', 'Ce fichier n’appartient pas à SGC Organisation.');
  if (f.proto !== PROTOCOL || f.cipher !== 'AES-256-GCM' || f.gz !== true) throw cryptoError('FORMAT', 'Version de synchronisation non prise en charge.');
  checkKdf(f.kdf);
  if (unb64(f.iv).length !== 12) throw cryptoError('FORMAT', 'Vecteur d’initialisation invalide.');
  if (unb64(f.ct).length < 17) throw cryptoError('FORMAT', 'Contenu chiffré invalide.');
  return f;
}

export async function decryptJSON(envelope, key) {
  const f = typeof envelope === 'string' ? parseEnvelope(envelope) : envelope;
  let raw;
  try { raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv), additionalData: aad(f), tagLength: 128 }, key, unb64(f.ct))); }
  catch { throw cryptoError('BADPASS', 'Phrase secrète incorrecte, ou fichier modifié en dehors de l’application.'); }
  raw = await transform(raw, new DecompressionStream('gzip'), MAX_PLAIN_BYTES);
  try { return JSON.parse(dec.decode(raw)); } catch { throw cryptoError('FORMAT', 'Contenu déchiffré illisible.'); }
}

// Petit secret local (jeton GitHub) chiffré avec la même clé : jamais en clair dans le navigateur.
export async function sealSecret(secret, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('sgc-secret-v1') }, key, enc.encode(secret)));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function openSecret(sealed, key) {
  try { return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv), additionalData: enc.encode('sgc-secret-v1') }, key, unb64(sealed.ct))); }
  catch { throw cryptoError('BADPASS', 'Phrase secrète incorrecte pour cet appareil.'); }
}
