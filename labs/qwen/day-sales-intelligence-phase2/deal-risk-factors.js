module.exports = function scoreDealRisks(opportunity, nowIso) {
  const { id, name, stage, status, value, currency, lastContactAt, nextActionAt, createdAt } = opportunity;
  const now = new Date(nowIso);
  const lastContact = lastContactAt ? new Date(lastContactAt) : null;
  const nextAction = nextActionAt ? new Date(nextActionAt) : null;
  const created = new Date(createdAt);
  const riskFactors = [];

  if (status === 'open') {
    if (lastContact && now - lastContact > 30 * 24 * 60 * 60 * 1000) {
      riskFactors.push('Late followup');
    }
    if (!nextAction || now - nextAction > 30 * 24 * 60 * 60 * 1000) {
      riskFactors.push('No next action');
    }
    if (now - created > 90 * 24 * 60 * 60 * 1000) {
      riskFactors.push('Aging');
    }
  }

  if (!opportunity.stakeholders || opportunity.stakeholders.length === 0) {
    riskFactors.push('Missing stakeholder');
  }

  return riskFactors;
};
