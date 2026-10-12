'use strict';
// RADIX Marketing Agency: standalone approval gate, no dependencies.
// This is a domain primitive, NOT a publishing integration.
const crypto = require('crypto');

const STATES = Object.freeze({
  DRAFT: 'draft', AWAITING: 'awaiting_approval', APPROVED: 'approved',
  NEEDS_REVISION: 'needs_revision', REJECTED: 'rejected'
});

function assertNonEmpty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(label + ' is required');
  return value.trim();
}

function normalizeRevision(revision) {
  if (!revision || typeof revision !== 'object' || Array.isArray(revision)) throw new TypeError('revision is required');
  const { postId, revisionId, copy, mediaRefs, destinations } = revision;
  return {
    postId: assertNonEmpty(postId, 'postId'),
    revisionId: assertNonEmpty(revisionId, 'revisionId'),
    copy: typeof copy === 'string' ? copy : '',
    mediaRefs: Array.isArray(mediaRefs) ? mediaRefs.map(String).sort() : [],
    destinations: Array.isArray(destinations) ? destinations.map(String).sort() : []
  };
}

function fingerprint(revision) {
  const normalized = normalizeRevision(revision);
  if (!normalized.destinations.length) throw new TypeError('destinations are required');
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function requestApproval(revision, requesterId, at = new Date().toISOString()) {
  return Object.freeze({
    postId: normalizeRevision(revision).postId,
    revisionId: normalizeRevision(revision).revisionId,
    fingerprint: fingerprint(revision),
    state: STATES.AWAITING,
    requesterId: assertNonEmpty(requesterId, 'requesterId'),
    requestedAt: at,
    reviewerId: null,
    decidedAt: null
  });
}

function decideApproval(request, revision, reviewerId, decision, at = new Date().toISOString()) {
  if (!request || request.state !== STATES.AWAITING) throw new Error('Post is not awaiting approval');
  if (request.fingerprint !== fingerprint(revision) || request.postId !== revision.postId ||
      request.revisionId !== revision.revisionId) throw new Error('Revision changed: request a new approval');
  const reviewer = assertNonEmpty(reviewerId, 'reviewerId');
  if (!['approve', 'reject', 'revise'].includes(decision)) throw new TypeError('Invalid decision');
  const state = decision === 'approve' ? STATES.APPROVED : decision === 'reject' ? STATES.REJECTED : STATES.NEEDS_REVISION;
  return Object.freeze({ ...request, state, reviewerId: reviewer, decidedAt: at });
}

function canPublish(request, revision) {
  if (!request || request.state !== STATES.APPROVED || !request.reviewerId || !request.decidedAt) return false;
  try {
    return request.postId === revision.postId &&
      request.revisionId === revision.revisionId &&
      request.fingerprint === fingerprint(revision);
  } catch {
    return false;
  }
}

function assertPublishable(request, revision) {
  if (!canPublish(request, revision)) throw new Error('Publishing blocked: exact post revision lacks approval');
  return true;
}

module.exports = { STATES, fingerprint, requestApproval, decideApproval, canPublish, assertPublishable };
