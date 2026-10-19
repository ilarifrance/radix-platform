module.exports = function calculateGoalProgress(goals, wonDeals, period) {
  if (!Array.isArray(goals) || !Array.isArray(wonDeals) || typeof period !== 'string') {
    return { error: 'Invalid input' };
  }

  const goalMap = {};
  goals.forEach(goal => {
    if (!goal.currency || !goal.currency.code || !goal.period || !goal.amount) {
      return;
    }
    if (!goalMap[goal.currency.code]) {
      goalMap[goal.currency.code] = {};
    }
    if (!goalMap[goal.currency.code][goal.period]) {
      goalMap[goal.currency.code][goal.period] = { amount: 0, count: 0 };
    }
    goalMap[goal.currency.code][goal.period].amount += goal.amount;
  });

  const result = {};
  Object.keys(goalMap).forEach(currency => {
    result[currency] = {};
    Object.keys(goalMap[currency]).forEach(period => {
      const goal = goalMap[currency][period];
      let totalWon = 0;
      let totalWonValue = 0;
      wonDeals.forEach(deal => {
        if (deal.currency && deal.currency.code === currency && deal.stage === 'won' && deal.status === 'won') {
          totalWon++;
          totalWonValue += deal.value;
        }
      });
      const progress = totalWon / goal.count * 100;
      result[currency][period] = { totalWon, totalWonValue, progress };
    });
  });

  return result;
};
