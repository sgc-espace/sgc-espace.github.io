// Verrouillage de l'écran par code PIN (propre à cet appareil). Le code n'est conservé que sous
// forme d'empreinte PBKDF2. LIMITE : verrou d'interface, pas chiffrement des données locales.
const KEY = 'sgc-organisation-lock-v1', ITER = 150000, enc = new TextEncoder();
const $ = id => document.getElementById(id);
const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const PIN_PATTERN = /^\d{4,8}$/;
export function readLock() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.hash ? v : null; } catch { return null; } }
function writeLock(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); return true; } catch { return false; } }
export async function pinHash(pin, salt, iterations = ITER) {
  const m = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(salt), iterations, hash: 'SHA-256' }, m, 256)));
}
// Délai après erreurs : 5 essais libres puis 30 s, doublé à chaque échec, plafonné à 15 min.
export const delayAfter = failures => failures < 5 ? 0 : Math.min(30000 * 2 ** (failures - 5), 15 * 60000);

export function setupLock({ verifyPassphrase, hasSync }) {
  let locked = false, timer = null, hiddenAt = 0;
  const cfg = () => readLock(), minutes = () => cfg()?.minutes || 5;
  function overlay() {
    let el = $('lock-screen'); if (el) return el;
    el = document.createElement('div'); el.id = 'lock-screen'; el.className = 'lock-screen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'lock-title');
    el.innerHTML = `<form id="lock-form" class="lock-box" autocomplete="off"><img src="src/assets/sterling-gate-official.png" alt="Sterling Gate Consulting" width="3881" height="1687"><h2 id="lock-title">SGC Organisation verrouillée</h2><label>Code PIN<input id="lock-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" required></label><p id="lock-error" class="warning" role="alert" hidden></p><button type="submit" class="primary" id="lock-submit">Déverrouiller</button><details id="lock-forgot"><summary>Code oublié ?</summary><div id="lock-forgot-body"></div></details></form>`;
    document.body.appendChild(el); return el;
  }
  function forgotHTML() {
    return hasSync() ? `<p class="helper">Déverrouillez avec votre phrase secrète de synchronisation. Le code PIN sera supprimé ; vous pourrez en définir un nouveau.</p><label>Phrase secrète<input id="lock-pass" type="password" autocomplete="current-password"></label><button type="button" id="lock-pass-submit">Déverrouiller avec la phrase</button>`
      : `<p class="helper">Sans synchronisation configurée, le code ne peut pas être récupéré dans l’application. Vous pouvez effacer les données de ce site dans les paramètres du navigateur, puis restaurer votre dernière sauvegarde.</p>`;
  }
  function showError(msg) { const e = $('lock-error'); e.textContent = msg || ''; e.hidden = !msg; }
  function lock() {
    if (!cfg() || locked) return;
    locked = true; const el = overlay(); el.hidden = false; document.body.classList.add('app-locked');
    document.querySelector('.shell')?.setAttribute('inert', ''); document.querySelectorAll('dialog[open]').forEach(d => d.setAttribute('inert', ''));
    $('sync-pill')?.setAttribute('inert', '');
    $('lock-forgot-body').innerHTML = forgotHTML(); showError(''); $('lock-pin').value = ''; setTimeout(() => $('lock-pin')?.focus(), 0);
  }
  function unlock() {
    locked = false; const el = $('lock-screen'); if (el) el.hidden = true; document.body.classList.remove('app-locked');
    document.querySelector('.shell')?.removeAttribute('inert'); document.querySelectorAll('[inert]').forEach(d => d.removeAttribute('inert'));
    arm();
  }
  function arm() { clearTimeout(timer); if (cfg() && !locked) timer = setTimeout(lock, minutes() * 60000); }
  async function tryPin(pin) {
    const c = cfg(); if (!c) { unlock(); return; }
    const wait = (c.blockedUntil || 0) - Date.now();
    if (wait > 0) { showError(`Trop d’essais : réessayez dans ${Math.ceil(wait / 1000)} s.`); return; }
    if (await pinHash(pin, c.salt, c.iterations) === c.hash) { writeLock({ ...c, failures: 0, blockedUntil: 0 }); unlock(); return; }
    const failures = (c.failures || 0) + 1, delay = delayAfter(failures);
    writeLock({ ...c, failures, blockedUntil: delay ? Date.now() + delay : 0 });
    showError(delay ? `Code incorrect. Prochain essai dans ${Math.ceil(delay / 1000)} s.` : `Code incorrect (${failures} essai(s)).`);
    $('lock-pin').value = ''; $('lock-pin').focus();
  }
  document.addEventListener('submit', async e => { if (e.target.id !== 'lock-form') return; e.preventDefault(); const b = $('lock-submit'); b.disabled = true; try { await tryPin($('lock-pin').value); } finally { b.disabled = false; } });
  document.addEventListener('click', async e => {
    if (e.target.id !== 'lock-pass-submit') return;
    const b = e.target; b.disabled = true;
    try { if (await verifyPassphrase($('lock-pass').value)) { writeLock(null); unlock(); window.dispatchEvent(new CustomEvent('sgc-lock-changed')); } else showError('Phrase secrète incorrecte.'); }
    finally { b.disabled = false; }
  });
  // Contenu de « Code oublié ? » calculé à l'ouverture : la synchronisation peut se charger après le verrou.
  document.addEventListener('toggle', e => { if (e.target.id === 'lock-forgot' && e.target.open) $('lock-forgot-body').innerHTML = forgotHTML(); }, true);
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { if (!locked) arm(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (cfg() && hiddenAt && Date.now() - hiddenAt >= minutes() * 60000) lock();
  });
  if (cfg()) lock();

  return {
    isLocked: () => locked, isEnabled: () => !!cfg(), minutes, lockNow: lock,
    async setPin(pin, confirm, mins) {
      if (!PIN_PATTERN.test(pin)) throw Error('Le code PIN doit contenir 4 à 8 chiffres.');
      if (pin !== confirm) throw Error('Les deux codes ne sont pas identiques.');
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      if (!writeLock({ salt, iterations: ITER, hash: await pinHash(pin, salt), minutes: mins, failures: 0, blockedUntil: 0 })) throw Error('Enregistrement du code impossible sur ce navigateur.');
      arm();
    },
    async removePin(pin) { const c = cfg(); if (!c) return; if (await pinHash(pin, c.salt, c.iterations) !== c.hash) throw Error('Code actuel incorrect.'); writeLock(null); clearTimeout(timer); },
    setMinutes(mins) { const c = cfg(); if (c) { writeLock({ ...c, minutes: mins }); arm(); } }
  };
}
