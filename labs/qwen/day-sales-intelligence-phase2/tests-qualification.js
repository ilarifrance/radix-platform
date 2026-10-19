module.exports = function() {
  const assert = require('assert');

  const qualificationRules = require('./qualification-rules.js');

  describe('Qualification Rules Tests', () => {
    describe('Normal Cases', () => {
      it('should qualify opportunity with stage "qualified"', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'qualified', status: 'open' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), true);
      });

      it('should qualify opportunity with stage "won"', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'won', status: 'won' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), true);
      });

      it('should qualify opportunity with stage "proposal" and status "won"', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'proposal', status: 'won' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), true);
      });
    });

    describe('Missing Required Fields', () => {
      it('should not qualify opportunity missing "stage"', () => {
        const opportunity = { id: 1, name: 'Test' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), false);
      });

      it('should not qualify opportunity missing "status"', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'qualified' };
        assert.strictEqual(qualificationRules.isMERCHANTABILITY(opportunity), false);
      });
    });

    describe('Malformed Data', () => {
      it('should not qualify opportunity with invalid stage', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'invalid', status: 'open' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), false);
      });

      it('should not qualify opportunity with invalid status', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'qualified', status: 'invalid' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), false);
      });
    });

    describe('Edge Cases', () => {
      it('should not qualify opportunity with stage "prospect" and status "open"', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'prospect', status: 'open' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), false);
      });

      it('should not qualify opportunity with stage "negotiation" and status "lost"', () => {
        const opportunity = { id: 1, name: 'Test', stage: 'negotiation', status: 'lost' };
        assert.strictEqual(qualificationRules.isQualified(opportunity), false);
      });
    });
  });
};
