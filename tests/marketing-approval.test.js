'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const gate = require('../lib/marketing-approval');
const post = {
  postId: 'post-1', revisionId: 'rev-1', copy: 'Primo contenuto',
  mediaRefs: ['asset-1'], destinations: ['linkedin/company-1']
};

test('approval required for exact post revision', () => {
  const pending = gate.requestApproval(post, 'author');
  assert.equal(gate.canPublish(pending, post), false);
  const approved = gate.decideApproval(pending, post, 'reviewer', 'approve');
  assert.equal(gate.canPublish(approved, post), true);
  assert.equal(gate.assertPublishable(approved, post), true);
});

test('changes to copy, assets and destinations invalidate approval', () => {
  const approved = gate.decideApproval(gate.requestApproval(post, 'author'), post, 'reviewer', 'approve');
  for (const change of [{ copy: 'Modificato' }, { mediaRefs: ['asset-2'] },
    { destinations: ['instagram/profile-1'] }, { revisionId: 'rev-2' }]) {
    assert.equal(gate.canPublish(approved, { ...post, ...change }), false);
  }
});

test('request cannot be approved after revision changed', () => {
  const pending = gate.requestApproval(post, 'author');
  assert.throws(() => gate.decideApproval(pending, { ...post, copy: 'Nuovo' }, 'reviewer', 'approve'));
});

test('rejection and revision requests always block publishing', () => {
  for (const decision of ['reject', 'revise']) {
    const result = gate.decideApproval(gate.requestApproval(post, 'author'), post, 'reviewer', decision);
    assert.equal(gate.canPublish(result, post), false);
  }
});

test('missing or fabricated approval is rejected', () => {
  assert.equal(gate.canPublish(null, post), false);
  assert.throws(() => gate.assertPublishable({}, post));
  assert.throws(() => gate.requestApproval({ ...post, destinations: [] }, 'author'));
});
