module.exports = function calculateSalesVelocity(opportunities, nowIso) {
  const stages = ['prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  const result = { count: 0, averageDealSize: {}, weightedWinRate: 0, daysPerStage: {} };

  const now = new Date(nowIso);
  const groupedByCurrency = {};

  opportunities.forEach(opportunity => {
    if (opportunity.status === 'open') {
      const currency = opportunity.currency;
      const stage = opportunity.stage;

      if (!groupedByCurrency[currency]) groupedByCurrency[currency] = { count: 0, totalValue: 0, stages: {} };

      groupedByCurrency[currency].count++;
      groupedByCurrency[currency].totalValue += opportunity.value;

      if (!groupedByCurrency[currency].stages[stage]) groupedByCurrency[currency].stages[stage] = 0;
      groupedByCurrency[currency].stages[stage]++;
    }
  });

  for (const currency in groupedByCurrency) {
    const group = groupedByCurrency[currency];
    result.averageDealSize[currency] = group.totalValue / group.count || 0;
    result.count += group.count;

    for (const stage of stages) {
      if (group.stages[stage]) {
        const days = Math.ceil((now - new Date(opportunity.createdAt)) / (1000 * 60 * 60 * 24));
        result.daysPerStage[stage] = (result.daysPerStage[stage] || 0) + days;
      }
    }
  }

  const totalWon = opportunities.filter(o => o.status === 'won').length;
  const totalOpen = opportunities.filter(o => o.status === 'open').length;
  result.weightedWinRate = totalOpen > 0 ? totalWon / totalOpen : 0;

  for (const stage in result.daysPerStage) {
    result.daysPerStage[stage] = Math.ceil(result.daysPerStage[stage] / (groupedByCurrency[currency].count || 1));
  }

  return result;
};
