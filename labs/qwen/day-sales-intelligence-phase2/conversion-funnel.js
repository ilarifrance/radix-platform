module.exports = function buildConversionFunnel(leads, opportunities) {
  const stages = ['prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  const funnel = {};

  for (const stage of stages) {
    funnel[stage] = {
      total: 0,
      converted: 0,
      conversionRate: 0
    };
  }

  for (const lead of leads) {
    if (lead.stage && stages.includes(lead.stage)) {
      funnel[lead.stage].total++;
    }
  }

  for (const opp of opportunities) {
    if (opp.stage && stages.includes(opp.stage)) {
      funnel[opp.stage].total++;
      if (stages.indexOf(opp.stage) > 0) {
        funnel[stages[stages.indexOf(opp.stage) - 1]].converted++;
      }
    }
  }

  for (const stage of stages) {
    if (funnel[stage].total === 0) {
      funnel[stage].conversionRate = 0;
    } else {
      funnel[stage].conversionRate = (funnel[stage].converted / funnel[stage].total) * 100;
    }
  }

  for (let i = 1; i < stages.length; i++) {
    if (funnel[stages[i]].total !== funnel[stages[i - 1]].total) {
      console.warn(`Incompatible counts between ${stages[i - 1]} and ${stages[i]}`);
    }
  }

  return funnel;
};
