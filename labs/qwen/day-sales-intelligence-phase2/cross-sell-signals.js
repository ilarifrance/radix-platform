module.exports = function findCrossSellCandidates(accounts, catalogue) {
  const crossSellCandidates = [];

  for (const account of accounts) {
    for (const opportunity of account.opportunities) {
      if (opportunity.stage === 'won' && opportunity.status === 'won') {
        const relatedCategories = catalogue
          .filter(item => item.categories.some(cat => opportunity.name.includes(cat)))
          .map(item => item.id);

        for (const item of catalogue) {
          if (!relatedCategories.includes(item.id)) {
            crossSellCandidates.push({
              opportunityId: opportunity.id,
              accountId: account.id,
              item: item,
              reason: 'Missing related category'
            });
          }
        }
      }
    }
  }

  return crossSellCandidates;
};
