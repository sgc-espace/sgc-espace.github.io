// Projections UI : aucune écriture, date de référence injectable pour la recette.
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function dayAfter(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
export function inScope(task, scope, today = localToday()) {
  const open = task.status !== 'done';
  if(scope==='todo')return task.status==='open';
  if(scope==='in_progress')return task.status==='in_progress';
  if (scope === 'open') return open;
  if (scope === 'done') return task.status==='done';
  if (scope === 'undated') return open && !task.dueDate;
  if (scope === 'today') return open && task.dueDate === today;
  if (scope === 'upcoming') return open && task.dueDate > today && task.dueDate <= dayAfter(today,7);
  if (scope === 'history') return open && task.dueDate && task.dueDate < today;
  return true;
}
export function selectTasks(tasks, { companyId='', scope='all', query='', companies=[], today=localToday(), dateFrom='', dateTo='', dateField='dueDate', priority='' } = {}) {
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (dateFrom && dateTo && dateFrom > dateTo) return [];
  return tasks.filter(t => {
    const date = dateField === 'completedAt' ? (t.completedAt ? localToday(new Date(t.completedAt)) : '') : t.dueDate;
    return (!priority||t.priority===priority) && (!companyId || t.companyId===companyId) && inScope(t,scope,today)
      && (!(dateFrom || dateTo) || (date && (!dateFrom || date>=dateFrom) && (!dateTo || date<=dateTo)))
      && (!query || normalize(`${t.title} ${t.notes} ${companies.find(c=>c.id===t.companyId)?.name || 'Général'}`).includes(normalize(query)));
  });
}
