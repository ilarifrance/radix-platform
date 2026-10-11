'use strict';
/**
 * RADIX Sales Intelligence: pure advisory lead qualification.
 * Scores are suggestions only, not CRM stage transitions or authorization decisions.
 * Five dimensions each scored 0..10. Incomplete input is never considered qualified.
 */
const DIMENSIONS = Object.freeze(['fit','urgency','budget','authority','engagement']);
function qualifyLead(lead) {
  const reasons = [];
  const missingFields = [];
  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) {
    return {score:0, qualificationStage:'insufficient_data', reasons:['Invalid lead record'],missingFields:[...DIMENSIONS]};
  }
  let total = 0;
  for (const key of DIMENSIONS) {
    const value = lead[key];
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      missingFields.push(key);
      reasons.push('Missing or invalid ' + key);
    } else {
      total += value;
    }
  }
  if (missingFields.length) {
    return {score:Math.round(total*2),qualificationStage:'insufficient_data',reasons,missingFields};
  }
  const score=Math.round(total*2);
  return {score,qualificationStage:score>=80?'qualified':score>=50?'nurture':'prospect',
    reasons:score>=80?['High explicit qualification signals']:score>=50?['Partial qualification signals']:['Limited qualification signals'],
    missingFields};
}
module.exports={qualifyLead,DIMENSIONS};
