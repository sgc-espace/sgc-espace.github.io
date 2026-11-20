// Carte « Synchronisation chiffrée entre appareils » et pastille « Sync ✓ » (repris de SQPV).
// Le formulaire n'est jamais reconstruit pendant une saisie : seules les zones d'état sont mises à jour.
import { MIN_PASSPHRASE } from './sync-crypto.js';
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LABEL = { ok: 'À jour', sync: 'Synchronisation…', err: 'Erreur', offline: 'Hors ligne', ask: 'Action requise', locked: 'Verrouillée', idle: 'Prête', off: 'Inactive' };
const PILL = { ok: 'Sync ✓', sync: 'Sync…', err: 'Sync ✗', offline: 'Hors ligne', ask: 'Sync : action requise', locked: 'Sync : phrase requise', idle: 'Sync' };
const when = iso => iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';
const mode = v => !v.connected ? 'off' : v.status === 'locked' ? 'locked' : v.status === 'ask' ? 'ask' : 'on';

function daysLeft(date) { if (!date) return null; const d = new Date(date + 'T23:59:59'); return Math.ceil((d - Date.now()) / 86400000); }
function expiryHTML(v) {
  const n = daysLeft(v.tokenExpires); if (n === null) return '<span class="muted">Non renseignée</span>';
  const label = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(v.tokenExpires + 'T12:00:00'));
  return n < 0 ? `<strong class="sync-warning">Expiré le ${esc(label)} : créez un nouveau jeton</strong>` : n <= 14 ? `<strong class="sync-warning">${esc(label)} · dans ${n} jour(s) : prévoyez un nouveau jeton</strong>` : esc(label);
}
const stateRows = v => `<table class="sync-table"><tbody><tr><th scope="row">État</th><td><span id="sync-badge" class="sync-badge" data-state="${esc(v.status)}">${esc(LABEL[v.status] || v.status)}</span></td></tr><tr><th scope="row">Dépôt</th><td>${esc(v.repo)}</td></tr><tr><th scope="row">Dernière synchronisation</th><td id="sync-last">${esc(when(v.lastSync))}</td></tr><tr><th scope="row">Expiration du jeton</th><td>${expiryHTML(v)}</td></tr></tbody></table><p id="sync-message" class="sync-message" role="status" aria-live="polite">${v.message && v.status !== 'ok' ? esc(v.message) : ''}</p>`;
const intro = `<div class="section-title"><p class="eyebrow">PC · téléphone · tablette</p><h3>Synchronisation chiffrée entre appareils</h3><p class="helper">Vos appareils voient les mêmes données, à quelques secondes d’intervalle quand l’application est ouverte. Les données sont chiffrées <strong>dans l’appareil</strong> avant l’envoi : votre dépôt GitHub privé ne contient qu’un fichier illisible sans votre phrase secrète. Si le même élément est modifié sur deux appareils, la version la plus récente est gardée et l’autre reste récupérable dans « Conflits à vérifier ».</p></div>`;

function formHTML() {
  return `${intro}<details class="sync-steps"><summary>Installation (une seule fois par appareil)</summary><ol class="steps"><li>Sur github.com, créez un dépôt <strong>privé</strong> (par exemple sgc-donnees).</li><li>Settings → Developer settings → Personal access tokens → Fine-grained tokens : limité à ce seul dépôt, permission <strong>Contents : Read and write</strong>, expiration 90 jours. Un jeton par appareil.</li><li>Saisissez ci-dessous le dépôt, le jeton et votre phrase secrète. Une copie de sécurité de cet appareil est téléchargée avant la première synchronisation.</li></ol></details>
  <form id="sync-form" class="form-grid" autocomplete="off"><label class="full">Dépôt (propriétaire/nom)<input name="repo" required placeholder="proprietaire/sgc-donnees" spellcheck="false" autocapitalize="off"></label><label class="full">Jeton GitHub<input name="token" type="password" required autocomplete="off" spellcheck="false"></label><label>Expiration du jeton<input name="tokenExpires" type="date" required><small class="muted">Date affichée par GitHub à la création du jeton.</small></label><span></span><label>Phrase secrète<input name="passphrase" type="password" required minlength="${MIN_PASSPHRASE}" autocomplete="new-password"></label><label>Confirmer la phrase (premier appareil)<input name="confirm" type="password" autocomplete="new-password"></label><label class="check-label full"><input type="checkbox" name="remember" checked><span>Mémoriser la clé sur cet appareil (la phrase secrète elle-même n’est jamais enregistrée).</span></label>
  <details class="full sync-reset"><summary>Phrase secrète oubliée ?</summary><p class="helper">Personne ne peut déchiffrer le fichier sans elle. Vous pouvez remplacer le fichier du dépôt par les données de <strong>cet appareil</strong>, chiffrées avec une nouvelle phrase. Les autres appareils devront être reconnectés. Une copie de sécurité est téléchargée avant.</p><label class="check-label"><input type="checkbox" name="reset"><span>Réinitialiser le chiffrement avec la nouvelle phrase saisie ci-dessus</span></label><label>Tapez REMPLACER pour confirmer<input name="resetConfirm" autocomplete="off"></label></details>
  <p id="sync-form-error" class="warning" role="alert" hidden></p><div class="actions full"><button type="submit" class="primary" id="sync-connect">Activer la synchronisation</button></div></form>`;
}
function lockedHTML(v) { return `${intro}${stateRows(v)}<form id="sync-unlock" class="form-grid" autocomplete="off"><label class="full">Phrase secrète<input name="passphrase" type="password" required autocomplete="current-password"></label><label class="check-label full"><input type="checkbox" name="remember" ${v.remember ? 'checked' : ''}><span>Mémoriser la clé sur cet appareil</span></label><p id="sync-form-error" class="warning" role="alert" hidden></p><div class="actions full"><button type="submit" class="primary">Déverrouiller</button><button type="button" id="sync-disconnect">Désactiver sur cet appareil</button></div></form>`; }
function askHTML(v) {
  const p = v.pending, c = x => `${x.companies} société(s) · ${x.tasks} tâche(s) · ${x.notes} note(s) · ${x.deadlines} échéance(s) · ${x.weeks} semaine(s) de routine`;
  if (p.reason === 'restore') return `${intro}<div class="sync-ask" role="group" aria-labelledby="sync-ask-title"><h4 id="sync-ask-title">Vous venez de restaurer une sauvegarde</h4><p><strong>Sur cet appareil (restauré) :</strong> ${esc(c(p.local))}</p><p><strong>Dans le dépôt :</strong> ${esc(c(p.remote))}<br><small class="muted">Envoyé le ${esc(when(p.savedAt))} par l’appareil ${esc(p.device)}</small></p><p class="helper">Rien n’a encore été envoyé ni supprimé ailleurs. Choisissez :</p><div class="actions sync-choices"><button class="primary" id="sync-push">Envoyer la restauration à tous les appareils<small>Le dépôt est remplacé par cette sauvegarde. Les éléments plus récents seront supprimés des autres appareils.</small></button><button id="sync-merge">Fusionner<small>Garder la sauvegarde ET les éléments plus récents du dépôt. Rien n’est supprimé.</small></button><button id="sync-replace">Annuler la restauration<small>Reprendre les données du dépôt sur cet appareil.</small></button></div></div>`;
  return `${intro}<div class="sync-ask" role="group" aria-labelledby="sync-ask-title"><h4 id="sync-ask-title">Première synchronisation de cet appareil</h4><p><strong>Dans le dépôt :</strong> ${esc(c(p.remote))}<br><small class="muted">Envoyé le ${esc(when(p.savedAt))} par l’appareil ${esc(p.device)}</small></p><p><strong>Sur cet appareil :</strong> ${p.localEmpty ? 'aucune donnée' : esc(c(p.local))}</p><p class="helper">Une copie de sécurité de cet appareil vient d’être téléchargée. Rien n’a encore été modifié.</p><div class="actions"><button class="primary" id="sync-replace">Récupérer les données du dépôt${p.localEmpty ? '' : ' (remplace cet appareil)'}</button>${p.localEmpty ? '' : '<button id="sync-merge">Fusionner avec cet appareil</button>'}<button id="sync-cancel">Annuler</button></div></div>`;
}
function tokenHTML(v) {
  const expiry = v.tokenExpires ? '' : `<form id="sync-expiry-form" class="form-grid sync-expiry" autocomplete="off"><label>Date d’expiration du jeton actuel<input name="tokenExpires" type="date" required></label><div class="actions"><button type="submit">Enregistrer la date</button></div><p class="helper full">Indiquez-la pour être prévenu 14 jours avant. Elle figure sur github.com, dans la liste de vos jetons.</p></form>`;
  return `${expiry}<details class="sync-token" id="sync-token" ${v.code === 'AUTH' ? 'open' : ''}><summary>Remplacer le jeton GitHub</summary><form id="sync-token-form" class="form-grid" autocomplete="off"><ol class="steps full"><li>Sur github.com : avatar → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li><li>Dépôt <strong>${esc(v.repo)}</strong> seulement, permission <strong>Contents : Read and write</strong>, expiration 90 jours.</li><li>Collez-le ci-dessous. Vos données et votre phrase secrète ne changent pas.</li></ol><label class="full">Nouveau jeton<input name="token" type="password" required autocomplete="off" spellcheck="false"></label><label>Expiration du nouveau jeton<input name="tokenExpires" type="date" required></label><p id="sync-token-error" class="warning full" role="alert" hidden></p><div class="actions full"><button type="submit" class="primary">Remplacer le jeton</button></div></form></details>`;
}
function onHTML(v) { return `${intro}${stateRows(v)}<div class="actions"><button class="primary" id="sync-now">Synchroniser maintenant</button><button id="sync-disconnect">Désactiver sur cet appareil</button></div>${tokenHTML(v)}<div id="sync-conflicts"></div>`; }
function conflictsHTML(v) {
  if (!v.conflicts.length) return '';
  return `<details class="sync-conflicts" open><summary>Conflits à vérifier (${v.conflicts.length})</summary><ul>${v.conflicts.map(c => `<li><div><strong>${esc(c.label)} · ${esc(c.name)}</strong><small>${esc(c.kind)} · ${esc(when(c.at))} · version ${c.keptSide === 'remote' ? 'de l’autre appareil' : 'de cet appareil'} gardée</small></div><div class="actions">${c.lost ? `<button data-sync-restore="${esc(c.id)}">Rétablir l’autre version</button>` : ''}<button data-sync-dismiss="${esc(c.id)}">Marquer comme vu</button></div></li>`).join('')}</ul></details>`;
}

export function setupSyncUI({ engine, goBackup }) {
  let last = engine.view();
  function pill(v) {
    let el = $('sync-pill');
    document.body.classList.toggle('has-sync-pill', v.connected);
    if (!v.connected) { el?.remove(); return; }
    if (!el) { el = document.createElement('button'); el.id = 'sync-pill'; el.type = 'button'; el.className = 'sync-pill'; el.onclick = () => goBackup(); document.body.appendChild(el); }
    el.dataset.state = v.status; el.textContent = PILL[v.status] || 'Sync'; el.title = v.message || LABEL[v.status] || ''; el.setAttribute('aria-label', `Synchronisation : ${LABEL[v.status] || v.status}. Ouvrir les réglages.`);
  }
  function render(v = last) {
    last = v; pill(v);
    const card = $('sync-card'); if (!card) return;
    const m = mode(v);
    if (card.dataset.mode !== m) { card.dataset.mode = m; card.innerHTML = m === 'off' ? formHTML() : m === 'locked' ? lockedHTML(v) : m === 'ask' ? askHTML(v) : onHTML(v); }
    if ($('sync-badge')) { $('sync-badge').dataset.state = v.status; $('sync-badge').textContent = LABEL[v.status] || v.status; }
    if ($('sync-last')) $('sync-last').textContent = when(v.lastSync);
    if ($('sync-message')) $('sync-message').textContent = v.message && v.status !== 'ok' ? v.message : '';
    if ($('sync-conflicts')) $('sync-conflicts').innerHTML = conflictsHTML(v);
    if ($('sync-now')) $('sync-now').disabled = v.busy;
    if (v.code === 'AUTH' && $('sync-token')) $('sync-token').open = true;
    if (v.tokenExpires && $('sync-expiry-form')) card.dataset.mode = '';
  }
  const formError = msg => { const e = $('sync-form-error'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } };
  async function guarded(button, fn) { if (button) button.disabled = true; formError(''); try { await fn(); } catch (e) { formError(e.message); } finally { if (button && button.isConnected) button.disabled = false; } }

  document.addEventListener('submit', async e => {
    if (e.target.id === 'sync-form') {
      e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f));
      const reset = f.elements.reset.checked;
      if (reset && d.resetConfirm.trim() !== 'REMPLACER') { formError('Tapez REMPLACER pour confirmer la réinitialisation.'); return; }
      await guarded($('sync-connect'), async () => { await engine.connect({ repo: d.repo, token: d.token, passphrase: d.passphrase, confirm: d.confirm, tokenExpires: d.tokenExpires, remember: f.elements.remember.checked, reset }); });
    }
    if (e.target.id === 'sync-token-form' || e.target.id === 'sync-expiry-form') {
      e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)), b = f.querySelector('button[type=submit]'), err = $('sync-token-error');
      b.disabled = true; if (err) err.hidden = true;
      try {
        if (f.id === 'sync-expiry-form') await engine.setTokenExpires(d.tokenExpires);
        else await engine.replaceToken({ token: d.token, tokenExpires: d.tokenExpires });
        $('sync-card').dataset.mode = ''; render(engine.view());
      } catch (x) { if (err) { err.textContent = x.message; err.hidden = false; } else formError(x.message); }
      finally { if (b.isConnected) b.disabled = false; }
    }
    if (e.target.id === 'sync-unlock') {
      e.preventDefault(); const f = e.target;
      await guarded(f.querySelector('button[type=submit]'), async () => { await engine.unlock(f.elements.passphrase.value, f.elements.remember.checked); });
    }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'sync-now') await engine.syncNow({ force: true });
    if (b.id === 'sync-replace') await engine.syncNow({ force: true, mode: 'replace' });
    if (b.id === 'sync-push' && window.confirm('Remplacer le dépôt par cette sauvegarde ? Les éléments plus récents absents de la sauvegarde seront supprimés de tous les appareils.')) await engine.syncNow({ force: true, mode: 'push' });
    if (b.id === 'sync-merge') await engine.syncNow({ force: true, mode: 'merge' });
    if (b.id === 'sync-cancel') await engine.cancelFirst();
    if (b.id === 'sync-disconnect' && window.confirm('Désactiver la synchronisation sur cet appareil ? Les données de cet appareil sont conservées ; le fichier chiffré du dépôt n’est pas supprimé.')) await engine.disconnect();
    if (b.dataset.syncRestore) await guarded(b, () => engine.restoreConflict(b.dataset.syncRestore));
    if (b.dataset.syncDismiss) await engine.dismissConflict(b.dataset.syncDismiss);
  });
  addEventListener('online', () => engine.syncNow({ silent: true }));
  addEventListener('focus', () => engine.schedule(500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) engine.syncNow({ silent: true }); });
  return { render, goBackup };
}
