import {verifyDocuments} from './company-profile.js';
import { validateState, upgradeState } from './domain.js';
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function createBackup(state) {
  const data = upgradeState(state);
  await verifyDocuments(data);
  const canonical = canonicalJSON(data);
  const result = JSON.stringify({ app: 'sgc-organisation', formatVersion: 5, schemaVersion: data.schemaVersion, createdAt: new Date().toISOString(), counts: { companies: data.companies.length, tasks: data.tasks.length, models:data.routines.models.length, weeks:data.routines.weeks.length,notes:data.notes.length,deadlines:data.deadlines.length }, payloadBytes: encoder.encode(canonical).byteLength, checksum: await sha256(canonical), state: data }, null, 2);
  if (encoder.encode(result).byteLength > MAX_BACKUP_BYTES) throw new Error('Sauvegarde supérieure à 25 Mio.');
  return result;
}
export async function parseBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES || encoder.encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error('Sauvegarde absente ou supérieure à 25 Mio.');
  let e; try { e = JSON.parse(text); } catch { throw new Error('Sauvegarde JSON illisible.'); }
  const fields = ['app', 'formatVersion', 'schemaVersion', 'createdAt', 'counts', 'payloadBytes', 'checksum', 'state'];
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).length !== fields.length || fields.some(k => !Object.hasOwn(e, k))) throw new Error('Enveloppe de sauvegarde invalide.');
  if (e.app !== 'sgc-organisation' || !((e.formatVersion === 1 && e.schemaVersion === 1) || (e.formatVersion === 2 && e.schemaVersion === 2) || (e.formatVersion === 3 && e.schemaVersion === 3) || (e.formatVersion === 4 && e.schemaVersion === 4) || (e.formatVersion === 5 && e.schemaVersion === 5))) throw new Error('Application ou version de sauvegarde non supportée.');
  if (typeof e.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.createdAt) || !Number.isFinite(Date.parse(e.createdAt)) || new Date(e.createdAt).toISOString() !== e.createdAt) throw new Error('Date de sauvegarde invalide.');
  if(e.state?.schemaVersion !== e.schemaVersion) throw new Error('Versions incohérentes.');
  const data = validateState(e.state), canonical = canonicalJSON(data);
  if (!e.counts || typeof e.counts !== 'object' || Object.keys(e.counts).length !== (e.formatVersion===5?6:e.formatVersion===4?4:2) || e.counts.companies !== data.companies.length || e.counts.tasks !== data.tasks.length) throw new Error('Comptages de sauvegarde incohérents.');
  if(e.formatVersion>=4&&(e.counts.models!==data.routines.models.length||e.counts.weeks!==data.routines.weeks.length))throw new Error('Comptages routines incohérents.');
  if (e.payloadBytes !== encoder.encode(canonical).byteLength || typeof e.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(e.checksum) || e.checksum !== await sha256(canonical)) throw new Error('Intégrité de sauvegarde invalide.');
  if(e.formatVersion===5&&(e.counts.notes!==data.notes.length||e.counts.deadlines!==data.deadlines.length))throw Error('Comptages Notes/Échéances incohérents.');
  await verifyDocuments(data);
  return upgradeState(data);
}
