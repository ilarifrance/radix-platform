'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePedGate } = require('../lib/marketing-strategy-ped-gate');
function fixture() {
  return {
    project: { id:'p1', currentStrategyRevisionId:'s2' },
    strategy: { projectId:'p1', revisionId:'s2', createdBy:'writer', createdAt:'2026-10-13T10:00:00Z' },
    strategyDecision: { projectId:'p1', strategyRevisionId:'s2', decision:'approve', reviewerId:'lead', decidedAt:'2026-10-13T10:10:00Z' },
    ped: { projectId:'p1', revisionId:'ped3', strategyRevisionId:'s2', state:'approved', createdBy:'editor', createdAt:'2026-10-13T10:15:00Z' },
    pedDecision: { projectId:'p1', pedRevisionId:'ped3', strategyRevisionId:'s2', decision:'approve', reviewerId:'lead', decidedAt:'2026-10-13T10:20:00Z' }
  };
}
test('approved revisions permit content drafting, never publication', () => {
  const r=evaluatePedGate(fixture());
  assert.equal(r.produceContent,true);
  assert.equal(r.publishAuthorized,false);
});
test('strategy approval predating revision is invalid', () => {
  const s=fixture();s.strategyDecision.decidedAt='2026-10-13T09:00:00Z';
  assert.equal(evaluatePedGate(s).produceContent,false);
});
test('PED creator cannot approve own revision', () => {
  const s=fixture();s.pedDecision.reviewerId='editor';
  assert.equal(evaluatePedGate(s).produceContent,false);
});
test('PED approval predating creation is invalid', () => {
  const s=fixture();s.pedDecision.decidedAt='2026-10-13T10:12:00Z';
  assert.equal(evaluatePedGate(s).produceContent,false);
});
test('PED revision predating strategy is invalid', () => {
  const s=fixture();s.ped.createdAt='2026-10-13T09:00:00Z';
  assert.equal(evaluatePedGate(s).reason,'ped_chronology_invalid');
});
test('new strategy revision invalidates PED', () => {
  const s=fixture();s.project.currentStrategyRevisionId='s3';
  assert.equal(evaluatePedGate(s).produceContent,false);
});
test('missing creation timestamps fail closed', () => {
  const s=fixture();delete s.ped.createdAt;
  assert.equal(evaluatePedGate(s).produceContent,false);
});
