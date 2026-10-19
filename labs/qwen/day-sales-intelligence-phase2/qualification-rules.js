module.exports = function qualifyLead(lead) {
  if (!lead || typeof lead !== 'object') return { score: 0, qualificationStage: 'prospect', reasons: ['Invalid lead data'], missingFields: [] };

  const { fit, urgency, budget, authority, engagement } = lead;

  const score = Math.max(0, Math.min(100, (fit * 10) + (urgency * 10) + (budget * 10) + (authority * 10) + (engagement * 10)));

  const qualificationStage = score >= 80 ? 'qualified' : score >= 50 ? 'proposal' : 'prospect';

  const reasons = [];
  const missingFields = [];

  if (typeof fit !== 'number' || fit < 0 || fit > 10) {
    reasons.push('Invalid fit score');
    missingFields.push('fit');
  }

  if (typeof urgency !== 'number' || urgency < 0 || urgency > 10) {
    reasons.push('Invalid urgency score');
    missingFields.push('urgency');
  }

  if (typeof budget !== 'number' || budget < 0 || budget > 10) {
    reasons.push('Invalid budget score');
    missing
  }
};
