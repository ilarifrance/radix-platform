module.exports = function auditCrmRecords(records, entityType) {
  if (!records || !Array.isArray(records)) return [];

  const warnings = [];

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    if (entityType === 'opportunity') {
      if (!record.id || typeof record.id !== 'string') {
        warnings.push({ type: 'missing', field: 'id', record });
      }
      if (!record.name || typeof record.name !== 'string' || record.name.trim().length < 3) {
        warnings.push({ type: 'invalid', field: 'name', record });
      }
      if (!record.stage || !['prospect', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].includes(record.stage)) {
        warnings.push({ type: 'invalid', field: 'stage', record });
      }
      if (!record.status || !['open', 'won', 'lost'].includes(record.status)) {
        warnings.push({
          type: 'invalid',
          field: 'status',
          record
        });
      }
      if (!record.value || typeof record.value !== 'number' || record.value <= 0) {
        warnings.push({ type: 'invalid', field: 'value', record });
      }
      if (!record.currency || typeof record.currency !== 'string' || !/^[A-Z]{3}$/.test(record.currency)) {
        warnings.push({ type: 'invalid', field: 'currency', record });
      }
      if (record.lastContactAt && typeof record.lastContactAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.lastContactAt)) {
        warnings.push({ type: 'invalid', field: 'lastContactAt', record });
      }
      if (record.nextActionAt && typeof record.nextActionAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.nextActionAt)) {
        warnings.push({ type: 'invalid', field: 'nextActionAt', record });
      }
      if (record.createdAt && typeof record.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.createdAt)) {
        warnings.push({ type: 'invalid', field: 'createdAt', record });
      }
    }
  }

  return warnings;
};
