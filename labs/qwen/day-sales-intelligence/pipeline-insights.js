module.exports = function summarizePipeline(opportunities, nowIso) {
  if (!opportunities || !nowIso) return {};

  const result = {
    byStage: {},
    byCurrency: {},
    agingBuckets: {},
    missingNextAction: 0
  };

  const now = new Date(nowIso);
  const today = now.toISOString().split('T')[0];

  opportunities.forEach(opportunity => {
    if (!opportunity.stage || !opportunity.status || !opportunity.value || !opportunity.currency || !opportunity.lastContactAt || !opportunity.nextActionAt || !opportunity.createdAt) return;

    const stage = opportunity.stage;
    const status = opportunity.status;
    const value = parseFloat(opportunity.value);
    const currency = opportunity.currency;
    const lastContactAt = new Date(opportunity.lastContactAt);
    const nextActionAt = new Date(opportunity.nextActionAt);
    const createdAt = new Date(opportunity.createdAt);

    if (nextActionAt < now) result.missingNextAction++;

    const agingBucket = getAgingBucket(lastContactAt, now);
    if (!result.agingBuckets[agingBucket]) result.agingBuckets[agingBucket] = 0;
    result.agingBuckets[agingBucket]++;

    if (!result.byStage[stage]) result.byStage[stage] = { total: 0, byStatus: {} };
    if (!result.byStage[stage].byStatus[status]) result.byStage[stage].byStatus[status] = 0;
    result.byStage[stage].byStatus[status]++;
    result.byStage[stage].total += value;

    if (!result.byCurrency[currency]) result.byCurrency[currency] = { total: 0, byStage: {} };
    if (!result.byCurrency[currency].byStage[stage]) result.byCurrency[currency].byStage[stage] = 0;
    result.byCurrency[currency].byStage[stage]++;
    result.byCurrency[currency].total += value;
  });

  return result;
};

function getAgingBucket(date, now) {
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return '0-7';
  if (diffDays < 30) return '8-30';
  if (diffDays < 90) return '31-90';
  return '90+';
}
