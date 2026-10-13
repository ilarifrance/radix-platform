module.exports = function buildForecastScenarios(opportunities) {
  const scenarios = {
    conservative: {},
    base: {},
    optimistic: {}
  };

  const stageWeights = {
    prospect: 0.1,
    qualified: 0.2,
    proposal: 0.3,
    negotiation: 0.4
  };

  const probabilityConfig = {
    conservative: 0.3,
    base: 0.5,
    optimistic: 0.7
  };

  const groupedByCurrency = {};

  opportunities.forEach(opportunity => {
    if (opportunity.status === 'won' || opportunity.status === 'lost') return;

    const { currency, value, stage } = opportunity;
    const weight = stageWeights[stage] || 0;

    if (!groupedByCurrency[currency]) {
      groupedByCurrency[currency] = { conservative: 0, base: 0, optimistic: 0 };
    }

    groupedByCurrency[currency].conservative += value * probabilityConfig.conservative * weight;
    groupedByCurrency[currency].base += value * probabilityConfig.base * weight;
    groupedByCurrency[currency].optimistic += value * probabilityConfig.optimistic * weight;
  });

  for (const [currency, totals] of Object.entries(groupedByCurrency)) {
    scenarios.conservative[currency] = totals.conservative;
    scenarios.base[currency] = totals.base;
    scenarios.optimistic[currency] = totals.optimistic;
  }

  return scenarios;
};
