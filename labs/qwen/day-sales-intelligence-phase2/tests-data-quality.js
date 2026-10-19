module.exports = function dataQualityAudit(opportunities) {
  const assert = require('assert');

  const requiredFields = ['id', 'name', 'stage', 'status', 'value', 'currency', 'lastContactAt', 'nextActionAt', 'createdAt'];
  const validStages = ['prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  const validStatuses = ['open', 'won', 'lost'];

  assert(Array.isArray(opportunities), 'Opportunities must be an array');

  for (const opportunity of opportunities) {
    assert(opportunity && typeof opportunity === 'object', 'Each opportunity must be an object');

    for (const field of requiredFields) {
      assert(opportunity[field] !== undefined, `Missing required field: ${field}`);
      assert(typeof opportunity[field] === 'string', `Field ${field} must be a string`);
    }

    assert(validStages.includes(opportunity.stage), `Invalid stage: ${opportunity.stage}`);
    assert(validStatuses.includes(opportunity.status), `Invalid status: ${opportunity.status}`);
  }
};
