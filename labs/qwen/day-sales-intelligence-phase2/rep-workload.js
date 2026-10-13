module.exports = function summarizeRepWorkload(tasks, opportunities, nowIso) {
  const now = new Date(nowIso);
  const overdueTasks = tasks.filter(t => t.dueAt < now);
  const upcomingTasks = tasks.filter(t => t.dueAt >= now && t.dueAt < now.setDate(now.getDate() + 7));
  const activeDeals = opportunities.filter(o => ['proposal', 'negotiation', 'won', 'lost'].includes(o.stage) && o.status === 'open');

  const overdue = overdueTasks.map(t => t.summary).sort();
  const upcoming = upcomingTasks.map(t => t.summary).sort();
  const activeDealsSummary = activeDeals.map(o => ({
    id: o.id,
    name: o.name,
    stage: o.stage,
    value: o.value,
    currency: o.currency,
    nextActionAt: o.nextActionAt
  })).sort((a, b) => a.nextActionAt < b.nextActionAt ? -1 : 1);

  return {
    owner: {
      overdue,
      upcoming,
      activeDeals: activeDealsSummary
    }
  };
};
