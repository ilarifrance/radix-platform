'use strict';
// Read-only contract checks for the isolated Agency design preview.
// Run with: node --test tests/agency-catalog.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const catalog = JSON.parse(read('agency/catalog.json'));
const agencyHtml = read('agency/index.html');
const mainHtml = read('index.html');
const rosterStart = mainHtml.indexOf('var AGENTS = [');
const rosterEnd = mainHtml.indexOf('var AGENT_ALIASES', rosterStart);
assert.ok(rosterStart >= 0 && rosterEnd > rosterStart, 'Existing RADIX agent roster must be discoverable');
const rosterIds = new Set([...mainHtml.slice(rosterStart, rosterEnd).matchAll(/\bid:\s*"([^"]+)"/g)].map(m => m[1]));

test('Agency catalog is explicitly a design preview', () => {
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.mode, 'design_preview');
  assert.equal(catalog.divisions.length, 13);
  assert.equal(Object.keys(catalog.roles).length, 14);
  assert.match(agencyHtml, /DESIGN PREVIEW/);
  assert.match(agencyHtml, /nessuna azione esterna/i);
});

test('Agency divisions are unique, complete and use existing roles', () => {
  const divisionIds = new Set();
  const usedAgents = new Set();
  for (const division of catalog.divisions) {
    assert.match(division.id, /^[a-z][a-z0-9-]*$/);
    assert.equal(divisionIds.has(division.id), false, 'Duplicate division: ' + division.id);
    divisionIds.add(division.id);
    for (const key of ['label', 'description']) {
      assert.ok(typeof division[key] === 'string' && division[key].trim(), division.id + '.' + key);
    }
    for (const key of ['stages', 'deliverables', 'agentIds']) {
      assert.ok(Array.isArray(division[key]) && division[key].length, division.id + '.' + key);
    }
    assert.equal(new Set(division.agentIds).size, division.agentIds.length, 'Duplicate role in ' + division.id);
    for (const agentId of division.agentIds) {
      assert.ok(rosterIds.has(agentId), 'Unknown existing RADIX agent: ' + agentId);
      assert.ok(catalog.roles[agentId], 'Missing catalog label for ' + agentId);
      usedAgents.add(agentId);
    }
  }
  assert.deepEqual(new Set(Object.keys(catalog.roles)), usedAgents);
  assert.deepEqual([...divisionIds].sort(), ['strategy', 'campaigns', 'ped', 'creative', 'web', 'seo-geo', 'paid', 'email', 'video', 'analytics', 'assets', 'approvals', 'team'].sort());
});

test('Agency preview script parses without executing external actions', () => {
  const scripts = [...agencyHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0][1], { filename: 'agency/index.html' });
  assert.match(scripts[0][1], /fetch\('\.\/catalog\.json'/);
  assert.match(scripts[0][1], /textContent/);
  assert.doesNotMatch(scripts[0][1], /\bfetch\s*\(\s*['"`]\/api\//);
});

test('Approval, spend, send and production releases are explicitly gated', () => {
  assert.match(agencyHtml, /Ogni post richiede approvazione/);
  assert.match(agencyHtml, /Budget PPC, invio email e deploy produzione/);
  assert.match(agencyHtml, /heartbeat verificato/);
  assert.match(agencyHtml, /Nessun dato reale collegato/);
});

test('Agency offers an explicit PED workbench link while keeping other divisions in preview-only navigation', () => {
  assert.match(agencyHtml, /id="divisionActions"/);
  assert.match(agencyHtml, /if\(d\.id==='ped'\)/);
  assert.match(agencyHtml, /link\.href='\.\/ped\.html'/);
  assert.match(agencyHtml, /division-link secondary/);
  assert.match(agencyHtml, /detailTitle'\)\.focus\(\)/);
  const ped = read('agency/ped.html');
  assert.match(ped, /DESIGN PREVIEW/);
  assert.match(ped, /disabled[^>]*>Genera proposta/);
});
