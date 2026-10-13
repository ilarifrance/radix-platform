module.exports = function detectStalledDeals(opportunities, nowIso, staleDays=14) {
  if (!opportunities || !Array.isArray(opportunities)) return [];
  if (!nowIso || typeof nowIso !== 'string') return [];
  const now = new Date(nowIso);
  if (isNaN(now)) return [];
  
  const staleThreshold = staleDays * 24 * 60 * 60 * 1000;
  const result = [];
  
  for (const opp of opportunities) {
    if (!opp || typeof opp !== 'object' || !opp.id) continue;
    const { id, stage, status, lastContactAt, nextActionAt, createdAt } = opp;
    
    if (status === 'won' || status === 'lost') continue;
    
    let lastActivity;
    if (lastContactAt) {
      lastActivity = new Date(lastContactAt);
      if (isNaN(lastActivity)) continue;
    } else if (nextActionAt) {
      lastActivity = new Date(nextActionAt);
      if (isNaN(lastActivity)) continue;
    } else {
      lastActivity = new Date(createdAt);
      if (isNaN(lastActivity)) continue;
    }
    
    const daysInactive = Math.ceil((now - lastActivity) / (1000 * 60 * 60 * 24));
    if (daysInactive >= staleDays) {
      const reason = stage === 'prospect' ? 'No contact' : 'No action';
      const suggestedAction = stage === 'prospect' 
        ? 'Follow up with initial outreach' 
        : 'Schedule a follow-up meeting';
      result.push({ id, daysInactive, reason, suggestedAction });
    }
  }
  
  return result.sort((a, b) => b.daysInactive - a.daysInactive);
};
