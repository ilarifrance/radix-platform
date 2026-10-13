'use strict';
// Read-only domain checks for Marketing Agency project -> strategy -> PED.
// SECURITY: the input MUST come from authenticated, project-scoped server storage.
// This helper cannot authenticate identities, grant permissions or authorize publishing.
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const id = x => typeof x === 'string' && x.length > 0 && x === x.trim();
const same = (a, b) => id(a) && id(b) && a === b;
const utc = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x) &&
  Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 19) === x.slice(0, 19);
const result = (createPed, submitPed, produceContent, reason) => Object.freeze({
  createPed, submitPed, produceContent, reason,
  // Publishing ALWAYS requires a separate server-side post revision approval gate.
  publishAuthorized: false
});
function approvedStrategy(project, strategy, decision) {
  return plain(strategy) && plain(decision) &&
    same(strategy.projectId, project.id) &&
    same(strategy.revisionId, project.currentStrategyRevisionId) &&
    id(strategy.createdBy) &&
    same(decision.projectId, project.id) &&
    same(decision.strategyRevisionId, strategy.revisionId) &&
    decision.decision === 'approve' && id(decision.reviewerId) &&
    decision.reviewerId !== strategy.createdBy && utc(strategy.createdAt) &&
    utc(decision.decidedAt) && Date.parse(decision.decidedAt) >= Date.parse(strategy.createdAt);
}
function approvedPed(project, strategy, ped, decision) {
  return plain(decision) &&
    same(decision.projectId, project.id) &&
    same(decision.pedRevisionId, ped.revisionId) &&
    same(decision.strategyRevisionId, strategy.revisionId) &&
    decision.decision === 'approve' && id(decision.reviewerId) &&
    id(ped.createdBy) && decision.reviewerId !== ped.createdBy &&
    utc(ped.createdAt) && utc(decision.decidedAt) &&
    Date.parse(decision.decidedAt) >= Date.parse(ped.createdAt);
}
function evaluatePedGate({ project, strategy, strategyDecision, ped = null, pedDecision = null } = {}) {
  if (!plain(project) || !id(project.id) || !id(project.currentStrategyRevisionId))
    return result(false, false, false, 'project_context_missing');
  if (!plain(strategy) || !same(strategy.projectId, project.id) ||
      !same(strategy.revisionId, project.currentStrategyRevisionId))
    return result(false, false, false, 'strategy_not_current');
  if (!approvedStrategy(project, strategy, strategyDecision))
    return result(false, false, false, 'strategy_not_approved');
  if (ped === null) return result(true, false, false, 'ped_not_created');
  if (!plain(ped) || !same(ped.projectId, project.id) || !id(ped.revisionId) ||
      !same(ped.strategyRevisionId, strategy.revisionId))
    return result(false, false, false, 'ped_not_current');
  if (!utc(ped.createdAt) || Date.parse(ped.createdAt) < Date.parse(strategy.createdAt))
    return result(false, false, false, 'ped_chronology_invalid');
  if (ped.state === 'draft' || ped.state === 'changes_requested')
    return result(false, true, false, 'ped_editable');
  if (ped.state === 'approved' && approvedPed(project, strategy, ped, pedDecision))
    return result(false, false, true, 'ped_approved');
  return result(false, false, false, 'ped_not_approved');
}
module.exports = { evaluatePedGate };
