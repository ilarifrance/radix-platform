'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../lib/marketing-approval');
const post = { postId: 'p1', revisionId: 'r1', copy: 'copy', mediaRefs: [], destinations: ['linkedin/account'] };
const request = () => gate.requestApproval(post, 'author', '2026-10-13T10:00:00Z');

test('valid reviewer approval remains valid for the exact revision', () => {
  assert.equal(gate.canPublish(gate.decideApproval(request(), post, 'reviewer', 'approve', '2026-10-13T10:01:00Z'), post), true);
});
test('requester cannot decide own request', () => {
  for (const decision of ['approve', 'reject', 'revise'])
    assert.throws(() => gate.decideApproval(request(), post, 'author', decision, '2026-10-13T10:01:00Z'), /Self-approval/);
});
test('forged approved record with same requester and reviewer is not publishable', () => {
  const pending = request();
  assert.equal(gate.canPublish({ ...pending, state: 'approved', reviewerId: 'author', decidedAt: '2026-10-13T10:01:00Z' }, post), false);
});
test('decision before request is rejected', () => {
  assert.throws(() => gate.decideApproval(request(), post, 'reviewer', 'approve', '2026-10-13T09:59:59Z'), /predates/);
});
test('forged approved record with backward timestamps is not publishable', () => {
  const pending = request();
  assert.equal(gate.canPublish({ ...pending, state: 'approved', reviewerId: 'reviewer', decidedAt: '2026-10-13T09:59:59Z' }, post), false);
});
test('invalid request and decision timestamps are rejected', () => {
  for (const at of ['2026-02-30T10:00:00Z', '2026-10-13', 'not-a-date'])
    assert.throws(() => gate.requestApproval(post, 'author', at), /timestamp/);
  assert.throws(() => gate.decideApproval(request(), post, 'reviewer', 'approve', '2026-02-30T10:00:00Z'), /timestamp/);
});
test('missing or invalid timestamp in forged approval is not publishable', () => {
  const pending = request();
  for (const changed of [{ requestedAt: null }, { decidedAt: '2026-02-30T10:00:00Z' }])
    assert.equal(gate.canPublish({ ...pending, state: 'approved', reviewerId: 'reviewer', decidedAt: '2026-10-13T10:01:00Z', ...changed }, post), false);
});
test('changed post revision cannot reuse approval', () => {
  const approved = gate.decideApproval(request(), post, 'reviewer', 'approve', '2026-10-13T10:01:00Z');
  assert.equal(gate.canPublish(approved, { ...post, copy: 'changed' }), false);
});
