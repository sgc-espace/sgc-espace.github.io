// Export des échéances au format iCalendar (.ics, RFC 5545) pour l'agenda du téléphone ou du PC.
// Chaque échéance devient un évènement « toute la journée » avec un rappel à 9 h (heure de l'appareil)
// le jour indiqué par son délai de rappel. Identifiant stable : réimporter met à jour au lieu de dupliquer
// dans les agendas qui respectent l'UID. Aucune donnée n'est envoyée : le fichier est seulement téléchargé.
const pad = n => String(n).padStart(2, '0');
const enc = new TextEncoder();
export function icsText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// Pliage des lignes à 75 octets UTF-8 sans couper un caractère.
export function fold(line) {
  const out = []; let cur = '', size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length, limit = out.length ? 74 : 75;
    if (size + n > limit) { out.push(cur); cur = ''; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const ymd = date => date.replaceAll('-', '');
function addDays(date, days) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function utcStamp(d) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; }
// 9 h locale (fuseau de l'appareil qui exporte) le jour du rappel, exprimée en UTC.
export function alarmAt(dueDate, reminderDays) {
  const day = addDays(dueDate, -Math.max(0, Number(reminderDays) || 0)), [y, m, d] = day.split('-').map(Number);
  return utcStamp(new Date(y, m - 1, d, 9, 0, 0));
}
const STATUS = { open: 'À faire', in_progress: 'En cours', done: 'Terminée', cancelled: 'Annulée' };

export function deadlinesToICS(deadlines, { companyName = () => '', now = new Date() } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sterling Gate Consulting//SGC Organisation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:SGC Échéances'];
  const stamp = utcStamp(now);
  for (const d of deadlines) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate || '')) continue;
    const company = d.companyId ? companyName(d.companyId) : '';
    const summary = company ? `${d.title} · ${company}` : d.title;
    const description = [d.category && `Catégorie : ${d.category}`, `État : ${STATUS[d.status] || d.status}`, d.description, d.notes && `Notes : ${d.notes}`, 'Source : SGC Organisation'].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${d.id}@sgc-organisation`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d.dueDate)}`, `DTEND;VALUE=DATE:${ymd(addDays(d.dueDate, 1))}`,
      `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(description)}`, ...(d.category ? [`CATEGORIES:${icsText(d.category)}`] : []),
      `STATUS:${d.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT');
    if (d.status !== 'done' && d.status !== 'cancelled') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Échéance : ${summary}`)}`, `TRIGGER;VALUE=DATE-TIME:${alarmAt(d.dueDate, d.reminderDays)}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
