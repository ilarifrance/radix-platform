module.exports = function generateWeeklySalesReview(activities, opportunities, nowIso) {
  if (!Array.isArray(activities) || !Array.isArray(opportunities) || typeof nowIso !== 'string') return { error: 'Invalid input' };

  const now = new Date(nowIso);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (now.getDay() + 6) % 7);
  weekStart.setHours(0, 0, 0, 0);

  const weeklyActivities = activities.filter(a => {
    const aDate = new Date(a.date);
    return aDate >= weekStart && aDate <= now;
  });

  const weeklyOpportunities = opportunities.filter(o => {
    const oDate = new Date(o.createdAt);
    return oDate >= weekStart && oDate <= now;
  });

  const currencyMetrics = {};
  const teamMetrics = {};

  weeklyOpportunities.forEach(o => {
    if (!currencyMetrics[o.currency]) currencyMetrics[o.currency] = { total: 0, count: 0 };
    currencyMetrics[o.currency].total += o.value;
    currencyMetrics[o.currency].count += 1;

    if (!teamMetrics[o.team]) teamMetrics[o.team] = { total: 0, count: 0 };
    teamMetrics[o.team].total += o.value;
    teamMetrics[o.team].count += 1;
  });

  const result = {
    currencyMetrics,
    teamMetrics,
    explanation: 'Metrics represent opportunities created within the last week, grouped by currency and team. Activities are filtered to those within the same period.'
  };

  return result;
};
