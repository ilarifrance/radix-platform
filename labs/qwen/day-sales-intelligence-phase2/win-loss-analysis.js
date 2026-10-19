module.exports = function summarizeWinLoss(opportunities) {
  if (!opportunities || !Array.isArray(opportunities)) return [];

  const result = [];

  const filtered = opportunities.filter(opportunity => {
    return opportunity.status === 'won' || opportunity.status === 'lost';
  });

  const grouped = filtered.reduce((acc, opp) => {
    const key = `${opp.source}|${opp.segment}|${opp.stage}|${opp.reason}`;
    acc[key] = acc[key] || { count: 0, sampleSize: 0 };
    acc[key].count += 1;
    acc[key].sampleSize += opp.value || 0;
    return acc;
  }, {});

  for (const key in grouped) {
    const parts = key.split('|');
    const source = parts[0];
    const segment = parts[1];
    const stage = parts[2];
    const reason = parts[3];
    const entry = {
      source,
      segment,
      stage,
      reason,
      count: grouped[key].count,
      sampleSize: grouped[key].sampleSize
    };
    result.push(entry);
  }

  return result;
};
