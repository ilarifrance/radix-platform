module.exports = function analyzeStakeholderCoverage(opportunity, contacts) {
  if (!opportunity || !contacts || !Array.isArray(contacts)) return [];

  const { stage, status } = opportunity;
  const requiredRoles = ['decision-maker', 'champion', 'technical', 'finance'];
  const roleMap = { 'decision-maker': 'Decision Maker', 'champion': 'Champion', 'technical': 'Technical', 'finance': 'Finance' };
  const gaps = [];

  if (status === 'won' || status === 'lost') return gaps;

  const roleSet = new Set(contacts.map(c => c.role).filter(Boolean));
  const missingRoles = requiredRoles.filter(r => !roleSet.has(r));

  if (missingRoles.length > 0) {
    gaps.push({
      opportunityId: opportunity.id,
      missingRoles: missingRoles.map(r => roleMap[r]),
      stage,
      recommendation: `Missing key stakeholders: ${missingRoles.map(r => roleMap[r]).join(', ')}. Ensure all roles are covered for effective deal management.`
    });
  }

  return gaps;
};
