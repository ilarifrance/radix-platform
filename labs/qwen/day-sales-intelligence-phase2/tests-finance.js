module.exports = function() {
  const assert = require('assert');

  const forecastScenarios = require('./forecast-scenarios.js');

  describe('forecast-scenarios.js', function() {
    it('should handle different currencies', function() {
      const opportunity1 = { id: 1, name: 'Opportunity 1', stage: 'qualified', status: 'open', value: 1000, currency: 'USD', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };
      const opportunity2 = { id: 2, name: 'Opportunity 2', stage: 'qualified', status: 'open', value: 2000, currency: 'EUR', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };
      const opportunity3 = { id: 3, name: 'Opportunity 3', stage: 'qualified', status: 'open', value: 3000, currency: 'JPY', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };

      const result = forecastScenarios([opportunity1, opportunity2, opportunity3]);
      assert.deepStrictEqual(result, {
        USD: 1000,
        EUR: 2000,
        JPY: 3000
      });
    });

    it('should handle won opportunities', function() {
      const opportunity1 = { id: 1, name: 'Opportunity 1', stage: 'won', status: 'won', value: 1000, currency: 'USD', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };
      const opportunity2 = { id: 2, name: 'Opportunity 2', stage: 'won', status: 'won', value: 2000, currency: 'EUR', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };

      const result = forecastScenarios([opportunity1, opportunity2]);
      assert.deepStrictEqual(result, {
        USD: 1000,
        EUR: 2000
      });
    });

    it('should handle lost opportunities', function() {
      const opportunity1 = { id: 1, name: 'Opportunity 1', stage: 'lost', status: 'lost', value: 1000, currency: 'USD', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };
      const opportunity2 = { id: 2, name: 'Opportunity 2', stage: 'lost', status: 'lost', value: 2000, currency: 'EUR', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };

      const result = forecastScenarios([opportunity1, opportunity2]);
      assert.deepStrictEqual(result, {
        USD: 1000,
        EUR: 2000
      });
    });

    it('should handle invalid input', function() {
      const opportunity1 = { id: 1, name: 'Opportunity 1', stage: 'invalid', status: 'open', value: 1000, currency: 'USD', lastContactAt: new Date(), nextActionAt: new Date(), createdAt: new Date() };

      const result = forecastScenarios([opportunity1]);
      assert.deepStrictEqual(result, {
        USD: 1000
      });
    });

    it('should handle no input', function() {
      const result = forecastScenarios([]);
      assert.deepStrictEqual(result, {});
    });
  });
};
