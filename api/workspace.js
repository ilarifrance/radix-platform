// /api/workspace — shared RADIX registry (clients, projects, documents, approvals, activity).
module.exports = require('./_product').radixOnly(require('./_registry-handler'));
