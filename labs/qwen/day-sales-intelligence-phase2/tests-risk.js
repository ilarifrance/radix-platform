module.exports = function() {
  const assert = require('assert');

  const riskFactors = require('./deal-risk-factors.js');

  describe('deal-risk-factors', () => {
    describe('calculateRiskScore', () => {
      it('should return 0 for a new opportunity with no data', () => {
        const opportunity = {};
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 0);
      });

      it('should return 0 for an opportunity with no risk factors', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'prospect', status: 'open' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 0);
      });

      it('should return 100 for a lost opportunity', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'lost', status: 'lost' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 100);
      });

      it('should return 100 for a won opportunity with no next action', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'won', status: 'won' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 100);
      });

      it('should return 50 for a negotiation stage with no next action', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'negotiation', status: 'open' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 50);
      });

      it('should return 75 for a negotiation stage with next action in the past', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'negotiation', status: 'open',
          nextActionAt: new Date(Date.now() - 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 75);
      });

      it('should return 25 for a negotiation stage with next action in the future', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'negotiation', status: 'open',
          nextActionAt: new Date(Date.now() + 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 25);
      });

      it('should return 75 for a proposal stage with no next action', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'proposal', status: 'open' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 75);
      });

      it('should return 50 for a proposal stage with next action in the past', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'proposal', status: 'open',
          nextActionAt: new Date(Date.now() - 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 50);
      });

      it('should return 25 for a proposal stage with next action in the future', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'proposal', status: 'open',
          nextActionAt: new Date(Date.now() + 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 25);
      });

      it('should return 50 for a qualified stage with no next action', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'qualified', status: 'open' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 50);
      });

      it('should return 25 for a qualified stage with next action in the future', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'qualified', status: 'open',
          nextActionAt: new Date(Date.now() + 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 25);
      });

      it('should return 75 for a prospect stage with no next action', () => {
        const opportunity = { id: '1', name: 'Test Deal', stage: 'prospect', status: 'open' };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 75);
      });

      it('should return 50 for a prospect stage with next action in the past', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'prospect', status: 'open',
          nextActionAt: new Date(Date.now() - 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 50);
      });

      it('should return 25 for a prospect stage with next action in the future', () => {
        const opportunity = {
          id: '1', name: 'Test Deal', stage: 'prospect', status: 'open',
          nextActionAt: new Date(Date.now() + 86400000).toISOString()
        };
        assert.strictEqual(riskFactors.calculateRiskScore(opportunity), 25);
      });
    });
  });
};
