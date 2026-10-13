module.exports = function calculateAccountHealth(account, events, nowIso) {
  const now = new Date(nowIso);
  let score = 100;
  let explanation = '';

  // Overdue activity
  const overdueActivity = events.filter(e => {
    const eventDate = new Date(e.date);
    return eventDate < now && e.type === 'touchpoint';
  }).length;
  if (overdueActivity > 0) {
    score -= overdueActivity * 5;
    explanation += `Overdue touchpoints: ${overdueActivity}, `;
  }

  // Open opportunities
  const openOpportunities = account.opportunities.filter(o => o.status === 'open').length;
  if (openOpportunities > 0) {
    score -= openOpportunities * 10;
    explanation += `Open opportunities: ${openOpportunities}, `;
  }

  // Recent touchpoints
  const recentTouchpoints = events.filter(e => {
    const eventDate = new Date(e.date);
    return eventDate >= now && eventDate < now && e.type === 'touchpoint';
  }).length;
  if (recentTouchpoints < 2) {
    score -= 15;
    explanation += `Few recent touchpoints: ${recentTouchpoints}, `;
  }

  // Missing fields
  const missingFields = [];
  if (!account.name) missingFields.push('Name');
  if (!account.contact) missingFields.push('Contact');
  if (!account.industry) missingFields.push('Industry');
  if (!account.size) missingFields.push('Size');
  if (missingFields.length > 0) {
    score -= missingFields.length * 5;
    explanation += `Missing fields: ${missingFields.join(', ')}, `;
  }

  explanation = explanation.trim().replace(/, +/g, ', ') || 'Account health is optimal.';
  return { score, explanation };
};
