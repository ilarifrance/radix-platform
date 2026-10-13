module.exports = {
  calculatePriority: function(opportunity, nowIso) {
    if (!opportunity || typeof opportunity !== 'object' || !Number.isFinite(Date.parse(nowIso))) return { score: 0, reason: 'Invalid input' };
    const { stage, status, value, lastContactAt, nextActionAt, createdAt } = opportunity;
    if (status === 'won' || status === 'lost') return { score: 0, reason: 'Closed deal' };
    let score = 0;
    const now = new Date(nowIso);
    const daysSinceLastContact = Math.floor((now - new Date(lastContactAt)) / (1000 * 60 * 60 * 24));
    const daysSinceNextAction = Math.floor((now - new Date(nextActionAt)) / (1000 * 60 * 60 * 24));
    const daysSinceCreated = Math.floor((now - new Date(createdAt)) / (1000 * 60 * 60 * 24));
    if (stage === 'won' || stage === 'lost') return { score: 0, reason: 'Closed deal' };
    if (stage === 'prospect') score += 10;
    if (stage === 'qualified') score += 20;
    if (stage === 'proposal') score += 30;
    if (stage === 'negotiation') score += 40;
    if (value > 10000) score += 10;
    if (daysSinceLastContact > 30) score -= 10;
    if (daysSinceNextAction > 7) score -= 10;
    if (daysSinceCreated > 90) score -= 10;
    if (score < 0) score = 0;
    return { score, reason: `Stage: ${stage}, Value: ${value}, Inactivity: ${daysSinceLastContact} days, Next Action: ${daysSinceNextAction} days` };
  },
  rankOpportunities: function(opportunities, nowIso) {
    if (!Array.isArray(opportunities) || !Number.isFinite(Date.parse(nowIso))) return [];
    return opportunities
      .map(opportunity => ({
        ...opportunity,
        ...module.exports.calculatePriority(opportunity, nowIso)
      }))
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score;
        const statusA = String(a.status ?? ''), statusB = String(b.status ?? '');
        if (statusA !== statusB) return statusA.localeCompare(statusB);
        const idA = String(a.id ?? ''), idB = String(b.id ?? '');
        return idA.localeCompare(idB, 'en', { numeric: true });
      });
  }
};
