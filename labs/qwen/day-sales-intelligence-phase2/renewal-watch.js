module.exports = function identifyRenewalRisks(contracts, nowIso, thresholds) {
  const riskGroups = {};
  const now = new Date(nowIso);
  
  contracts.forEach(contract => {
    const { id, name, stage, status, value, currency, lastContactAt, nextActionAt, createdAt } = contract;
    const lastContact = lastContactAt ? new Date(lastContactAt) : null;
    const nextAction = nextActionAt ? new Date(nextActionAt) : null;
    const contractDate = new Date(createdAt);
    
    const daysSinceLastContact = lastContact ? Math.ceil((now - lastContact) / (1000 * 60 * 60 * 24)) : Infinity;
    const daysUntilNextAction = nextAction ? Math.ceil((nextAction - now) / (1000 * 60 * 60 * 24)) : Infinity;
    const daysSinceContract = Math.ceil((now - contractDate) / (1000 * 60 * 60 * 24));
    
    const risk = {
      id,
      name,
      stage,
      status,
      value,
      currency,
      daysSinceLastContact,
      daysUntilNextAction,
      daysSinceContract
    };
    
    const riskSeverity = {
      low: 0,
      medium: 1,
      high: 2
    };
    
    const riskLevel = riskSeverity.low;
    
    if (daysSinceLastContact > thresholds.contact && daysUntilNextAction < thresholds.action) {
      riskLevel = riskSeverity.high;
    } else if (daysSinceLastContact > thresholds.contact || daysUntilNextAction < thresholds.action) {
      riskLevel = riskSeverity.medium;
    }
    
    if (!riskGroups[currency]) {
      riskGroups[currency] = [];
    }
    
    riskGroups[currency].push(risk);
  });
  
  return riskGroups;
};
