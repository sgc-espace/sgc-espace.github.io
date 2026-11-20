import {selectTasks,localToday,dayAfter} from './task-views.js';

// Read-only snapshot. Every displayed population carries the exact source UUIDs.
export function dashboardModel(tasks, companies, filters = {}, granularity = 'week', today = localToday()) {
  const selected = selectTasks(tasks, {...filters, companies, today});
  const groups = [];
  const add = (key,label,items) => {
    const group = {key,label,count:items.length,ids:items.map(t=>t.id)};
    groups.push(group); return group;
  };
  const metrics = [
    add('all','Toutes les tâches',selected),
    add('todo','À faire',selected.filter(t=>t.status==='open')),
    add('progress','En cours',selected.filter(t=>t.status==='in_progress')),
    add('done','Terminées',selected.filter(t=>t.status==='done')),
    add('late','En retard',selected.filter(t=>t.status!=='done'&&t.dueDate&&t.dueDate<today)),
    add('today','À échéance aujourd’hui',selected.filter(t=>t.status!=='done'&&t.dueDate===today)),
    add('upcoming','À venir · 7 jours',selected.filter(t=>t.status!=='done'&&t.dueDate>today&&t.dueDate<=dayAfter(today,7))),
    add('undated','Sans date',selected.filter(t=>!t.dueDate))
  ];
  const priorities = [['high','Haute'],['normal','Normale'],['low','Basse']].map(([key,label])=>add('priority:'+key,label,selected.filter(t=>t.priority===key)));
  const entities = companies.filter(c=>!filters.companyId||c.id===filters.companyId).map(c=>({id:c.id,name:c.name}));
  if(!filters.companyId) entities.push({id:null,name:'Général · sans société'});
  const byCompany=new Map();
  for(const t of selected){if(!byCompany.has(t.companyId))byCompany.set(t.companyId,[]);byCompany.get(t.companyId).push(t);}
  const companyRows = entities.map(c=>{
    const items=byCompany.get(c.id)||[],done=items.filter(t=>t.status==='done');
    return {...add('company:'+(c.id||'general'),c.name,items),done:done.length,percentage:items.length?done.length/items.length*100:null};
  });
  const buckets = new Map();
  for(const t of selected.filter(t=>t.status==='done')) {
    const date=localToday(new Date(t.completedAt));
    let start=date;
    if(granularity==='month')start=date.slice(0,7)+'-01';
    if(granularity==='week')start=dayAfter(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
    if(!buckets.has(start))buckets.set(start,[]);
    buckets.get(start).push(t);
  }
  const series=[...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([start,items])=>add('completed:'+start,start,items));
  const withoutDates=selectTasks(tasks,{...filters,companies,today,dateFrom:'',dateTo:''}).filter(t=>!t.dueDate).length;
  return {metrics,priorities,companyRows,series,groups,ids:selected.map(t=>t.id),total:selected.length,done:metrics[3].count,
    percentage:selected.length?metrics[3].count/selected.length*100:null,
    undatedExcluded:filters.dateFrom||filters.dateTo?withoutDates:0,
    revision:null,today,granularity};
}
