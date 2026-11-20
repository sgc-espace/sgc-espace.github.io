// Sauvegardes chiffrées (lot 3, S1/S4) : même enveloppe que la synchronisation (AES-256-GCM,
// PBKDF2-SHA-256, en-tête authentifié). Le fichier contient la sauvegarde complète habituelle
// (format 5 + empreinte) ; sans la phrase, il est illisible. La phrase n'est jamais enregistrée.
import { deriveKey, randomSalt, encryptJSON, decryptJSON, parseEnvelope, KDF_ITERATIONS, MIN_PASSPHRASE } from './sync-crypto.js';

const fail = (code, message) => { const e = new Error(message); e.code = code; return e; };

export async function backupKeyFromPassphrase(passphrase, confirm = passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE) throw fail('INPUT', `Phrase de sauvegarde trop courte : ${MIN_PASSPHRASE} caractères minimum.`);
  if (passphrase !== confirm) throw fail('INPUT', 'Les deux phrases de sauvegarde ne sont pas identiques.');
  const kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: randomSalt() };
  return { key: await deriveKey(passphrase, kdf.salt, kdf.iterations), kdf };
}

export async function encryptBackupText(text, { key, kdf }) {
  if (typeof text !== 'string' || !text) throw fail('INPUT', 'Sauvegarde vide.');
  const out = await encryptJSON({ kind: 'sgc-backup', backup: text }, key, kdf);
  const check = await decryptJSON(out, key); // relecture avant de proposer le fichier
  if (check.backup !== text) throw fail('FORMAT', 'Contrôle du fichier chiffré impossible.');
  return out;
}

// Vrai seulement pour une enveloppe chiffrée SGC ; une sauvegarde en clair renvoie faux.
export function isEncryptedBackup(text) {
  if (typeof text !== 'string' || !text.includes('"cipher"')) return false;
  try { parseEnvelope(text); return true; } catch { return false; }
}

// Accepte une sauvegarde chiffrée ou le fichier de synchronisation du dépôt (sgc-data.enc).
export async function decryptBackupText(text, { key = null, passphrase = '' } = {}) {
  const env = parseEnvelope(text);
  const k = key || await deriveKey(passphrase, env.kdf.salt, env.kdf.iterations);
  const obj = await decryptJSON(env, k);
  if (!obj || typeof obj !== 'object' || !['sgc-backup', 'sgc-sync'].includes(obj.kind) || typeof obj.backup !== 'string') throw fail('FORMAT', 'Contenu chiffré invalide : ce n’est pas une sauvegarde SGC.');
  return obj.backup;
}
export const envelopeKdf = text => parseEnvelope(text).kdf;
