'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePedGate } = require('../lib/marketing-strategy-ped-gate');
const make = state => ({
  project: { id: 'p', currentStrategyRevisionId: 's1' },
  strategy: { projectId: 'p', revisionId: 's1', createdBy: 'author', createdAt: '2026-10-13T10:00:00Z' },
  strategyDecision: { projectId: 'p', strategyRevisionId: 's1', decision: 'approve', reviewerId: 'manager', decidedAt: '2026-10-13T10:10:00Z' },
  ped: { projectId: 'p', revisionId: 'ped1', strategyRevisionId: 's1', createdBy: 'editor', createdAt: '2026-10-13T10:05:00Z', state },
  pedDecision: { projectId: 'p', pedRevisionId: 'ped1', strategyRevisionId: 's1', decision: 'approve', reviewerId: 'manager', decidedAt: '2026-10-13T10:20:00Z' }
});
test('draft PED created before strategy approval cannot be submitted', () => {
  const outcome = evaluatePedGate(make('draft'));
  assert.equal(outcome.submitPed, false);
  assert.equal(outcome.reason, 'ped_chronology_invalid');
});
test('approved PED created before strategy approval cannot authorize production', () => {
  const outcome = evaluatePedGate(make('approved'));
  assert.equal(outcome.produceContent, false);
  assert.equal(outcome.reason, 'ped_chronology_invalid');
});
