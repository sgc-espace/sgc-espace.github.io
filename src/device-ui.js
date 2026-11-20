// Réglages propres à cet appareil : date de dernière sauvegarde et rappel, conservation du
// stockage, code PIN. Rien de tout cela n'entre dans les données métier ni dans les sauvegardes.
const KEY = 'sgc-organisation-backup-v1';
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const REMINDER_CHOICES = [3, 7, 14, 30];
export function readBackupInfo() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { lastBackupAt: typeof v.lastBackupAt === 'string' ? v.lastBackupAt : null, reminderDays: REMINDER_CHOICES.includes(v.reminderDays) ? v.reminderDays : 7, encrypt: v.encrypt !== false }; }
  catch { return { lastBackupAt: null, reminderDays: 7, encrypt: true }; }
}
function writeBackupInfo(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } }
export function markBackup(at = new Date().toISOString()) { return writeBackupInfo({ ...readBackupInfo(), lastBackupAt: at }); }
export function backupAgeDays(info = readBackupInfo(), now = Date.now()) { return info.lastBackupAt ? Math.floor((now - Date.parse(info.lastBackupAt)) / 86400000) : null; }
// Données non protégées contre l'effacement par le navigateur : rappel au plus tous les 3 jours.
export const effectiveReminderDays = (info, persisted) => persisted === false ? Math.min(info.reminderDays, 3) : info.reminderDays;
export function reminderDue(hasData, info = readBackupInfo(), now = Date.now(), persisted = null) { if (!hasData) return false; const age = backupAgeDays(info, now); return age === null || age >= effectiveReminderDays(info, persisted); }
const when = iso => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

export function reminderBanner(persisted = null) {
  const info = readBackupInfo(), age = backupAgeDays(info);
  const text = age === null ? 'Aucune sauvegarde externe enregistrée sur cet appareil.' : `Dernière sauvegarde il y a ${age} jour(s).`;
  return `<aside class="backup-reminder" role="note"><div><strong>${esc(text)}</strong><span>${persisted === false ? 'Vos données ne sont pas protégées contre l’effacement par le navigateur : sauvegardez souvent. ' : ''}La synchronisation ne remplace pas une copie externe : gardez un fichier récent hors du navigateur.</span></div><button class="primary" id="reminder-backup">Sauvegarder maintenant</button></aside>`;
}
export function protectionHTML(persisted) {
  if (persisted === true) return '<p class="protection ok"><strong>✓ Données protégées</strong><span>Le navigateur ne les effacera pas pour gagner de la place. Une sauvegarde externe reste nécessaire (perte ou panne de l’appareil).</span></p>';
  const why = persisted === false ? '<strong>⚠ Données non protégées</strong><span>Si l’appareil manque de place, le navigateur peut effacer les données de l’application. Installez l’application sur l’écran d’accueil puis rouvrez-la : la protection est en général accordée. En attendant, le rappel de sauvegarde passe à 3 jours au plus.</span>'
    : '<strong>Protection inconnue</strong><span>Ce navigateur n’indique pas si les données sont protégées. Gardez des sauvegardes fréquentes.</span>';
  return `<p class="protection warn">${why}</p><div class="actions"><button id="protection-install">Comment installer ?</button></div>`;
}
export function tokenBanner(v) {
  if (!v?.connected || !v.tokenExpires) return v?.connected && v.code === 'AUTH' ? '<aside class="backup-reminder token-banner" role="note"><div><strong>Synchronisation arrêtée : jeton GitHub refusé.</strong><span>Créez un nouveau jeton (mêmes réglages), puis « Remplacer le jeton » dans Sauvegarde.</span></div><button class="primary" id="token-banner-open">Remplacer le jeton</button></aside>' : '';
  const days = Math.ceil((new Date(v.tokenExpires + 'T23:59:59') - Date.now()) / 86400000);
  if (days > 14 && v.code !== 'AUTH') return '';
  const text = v.code === 'AUTH' || days < 0 ? 'Synchronisation arrêtée : jeton GitHub expiré ou refusé.' : `Votre jeton GitHub expire dans ${days} jour(s).`;
  return `<aside class="backup-reminder token-banner" role="note"><div><strong>${esc(text)}</strong><span>Créez un nouveau jeton (mêmes réglages, 90 jours), puis « Remplacer le jeton » dans Sauvegarde. Vos données restent sur cet appareil.</span></div><button class="primary" id="token-banner-open">Remplacer le jeton</button></aside>`;
}
export function encryptionHTML({ encrypt, syncKey, sessionKey }) {
  const how = !encrypt ? '<p class="protection warn"><strong>⚠ Sauvegardes non chiffrées</strong><span>Le fichier contient tout en clair (sociétés, RIB, pièces). Toute personne ou application qui y accède peut le lire.</span></p>'
    : syncKey ? '<p class="protection ok"><strong>🔒 Sauvegardes chiffrées avec votre phrase secrète de synchronisation</strong><span>Pour restaurer sur un autre appareil, cette même phrase sera demandée.</span></p>'
    : sessionKey ? '<p class="protection ok"><strong>🔒 Sauvegardes chiffrées</strong><span>Avec la phrase de sauvegarde saisie pendant cette session. Elle n’est pas enregistrée : notez-la en lieu sûr, elle sera demandée pour restaurer.</span></p>'
    : `<p class="helper">Pour chiffrer le fichier, saisissez une phrase (12 caractères minimum, 16 conseillés). Elle n’est jamais enregistrée : sans elle, le fichier ne peut pas être restauré. <strong>Sans phrase, la sauvegarde est en clair.</strong> Avec la synchronisation activée, le chiffrement est automatique.</p><div class="form-grid"><label>Phrase de sauvegarde<input id="backup-pass" type="password" autocomplete="new-password" minlength="12"></label><label>Confirmer la phrase<input id="backup-pass2" type="password" autocomplete="new-password"></label></div>`;
  return `<label class="check-label"><input type="checkbox" id="backup-encrypt" ${encrypt ? 'checked' : ''}><span>Chiffrer les sauvegardes et les copies de sécurité (recommandé)</span></label>${how}`;
}
export function backupInfoHTML() {
  const info = readBackupInfo();
  return `<p class="backup-last"><strong>Dernière sauvegarde téléchargée :</strong> ${info.lastBackupAt ? esc(when(info.lastBackupAt)) : 'aucune sur cet appareil'}</p><label>Me le rappeler après<select id="reminder-days">${REMINDER_CHOICES.map(d => `<option value="${d}" ${d === info.reminderDays ? 'selected' : ''}>${d} jours</option>`).join('')}</select></label>`;
}
export function lockCardHTML(lock) {
  const on = lock.isEnabled();
  return `<p class="eyebrow">Cet appareil</p><h3>Verrouillage par code PIN</h3><p class="helper">Le code protège l’écran si quelqu’un prend votre téléphone ou votre PC déverrouillé. Il ne chiffre pas les données du navigateur : gardez aussi le verrouillage de l’appareil.</p>
  <p><strong>État :</strong> ${on ? `activé · ${lock.minutes() === 0 ? 'verrouillage dès que l’app passe en arrière-plan' : `verrouillage après ${lock.minutes()} min d’inactivité`}` : 'désactivé'}</p>
  <form id="pin-form" class="form-grid" autocomplete="off">${on ? '<label>Code actuel<input name="current" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>' : ''}<label>${on ? 'Nouveau code' : 'Code PIN (4 à 8 chiffres)'}<input name="pin" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label><label>Confirmer le code<input name="confirm" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label><label>Verrouiller<select name="minutes">${[0, 1, 5, 15, 30].map(m => `<option value="${m}" ${m === lock.minutes() ? 'selected' : ''}>${m === 0 ? 'dès que l’app passe en arrière-plan' : `après ${m} min d’inactivité`}</option>`).join('')}</select></label>
  <p id="pin-error" class="warning" role="alert" hidden></p><div class="actions full"><button type="submit" class="primary">${on ? 'Changer le code' : 'Activer le code'}</button>${on ? '<button type="button" id="pin-remove">Désactiver le code</button><button type="button" id="pin-lock-now">Verrouiller maintenant</button>' : ''}</div></form>${lostDeviceHTML()}`;
}
export function lostDeviceHTML() {
  return `<details class="lost-device" id="lost-device"><summary>Appareil perdu ou volé ? Que faire</summary><ol class="steps">
  <li><strong>Couper l’accès au dépôt de données</strong> depuis un autre appareil : github.com → avatar → Settings → Developer settings → Personal access tokens → Fine-grained tokens → ouvrez le jeton de l’appareil perdu (par exemple « SGC sync téléphone ») → <strong>Delete</strong>. L’appareil perdu ne peut plus lire ni modifier le dépôt.</li>
  <li><strong>Changer la phrase secrète</strong> si elle a pu être vue ou notée sur l’appareil : sur un appareil à jour, Sauvegarde → Désactiver sur cet appareil, puis reconnectez-vous avec un nouveau jeton et « Phrase secrète oubliée ? » → nouvelle phrase → REMPLACER. Reconnectez ensuite vos autres appareils.</li>
  <li><strong>Protéger les données restées sur l’appareil</strong> : elles y sont lisibles si l’appareil est déverrouillé. Utilisez « Localiser mon appareil » (Google) pour le verrouiller ou l’effacer à distance.</li>
  <li><strong>Vérifier le dépôt</strong> : sur github.com, l’historique de sgc-donnees montre la date de chaque envoi ; un envoi après la perte signale une utilisation de l’appareil.</li>
  </ol><p class="helper">Conseil : un jeton différent par appareil, verrouillage de l’écran du téléphone, code PIN dans l’application et sauvegarde chiffrée récente rangée hors de l’appareil.</p></details>`;
}
export async function persistenceStatus() {
  try { return navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { return null; }
}
export async function requestPersistence() {
  try { if (await navigator.storage?.persisted?.()) return true; return await navigator.storage?.persist?.() ?? null; } catch { return null; }
}
export function setupDeviceUI({ lock, onBackup, refresh, status }) {
  const pinError = m => { const e = $('pin-error'); if (e) { e.textContent = m || ''; e.hidden = !m; } };
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'pin-form') return; e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f));
    try {
      if (!/^\d{4,8}$/.test(d.pin || '')) throw Error('Le code PIN doit contenir 4 à 8 chiffres.');
      if (d.pin !== d.confirm) throw Error('Les deux codes ne sont pas identiques.');
      if (lock.isEnabled()) await lock.removePin(d.current || '');
      await lock.setPin(d.pin, d.confirm, Number(d.minutes)); status('Code PIN enregistré sur cet appareil.'); refresh();
    } catch (x) { pinError(x.message); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'reminder-backup') await onBackup();
    if (b.id === 'pin-lock-now') lock.lockNow();
    if (b.id === 'pin-remove') { const f = $('pin-form'); try { await lock.removePin(f.elements.current.value); status('Code PIN désactivé sur cet appareil.'); refresh(); } catch (x) { pinError(x.message); } }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'backup-encrypt') { writeBackupInfo({ ...readBackupInfo(), encrypt: e.target.checked }); status(e.target.checked ? 'Les prochaines sauvegardes seront chiffrées.' : 'Attention : les prochaines sauvegardes seront en clair.'); refresh(); }
    if (e.target.id === 'reminder-days') { writeBackupInfo({ ...readBackupInfo(), reminderDays: Number(e.target.value) }); status('Rappel de sauvegarde mis à jour.'); }
    if (e.target.name === 'minutes' && e.target.form?.id === 'pin-form' && lock.isEnabled()) { lock.setMinutes(Number(e.target.value)); status('Délai de verrouillage mis à jour.'); }
  });
}
