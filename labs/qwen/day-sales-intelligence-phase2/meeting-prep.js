module.exports = function buildMeetingBrief(account, contacts, opportunities, activities) {
  const brief = {
    account: account || {},
    contacts: contacts || [],
    opportunities: opportunities || [],
    activities: activities || [],
    gaps: []
  };

  if (!account.id) brief.gaps.push('Account ID missing');
  if (!contacts.length) brief.gaps.push('No contacts');
  if (!opportunities.length) brief.gaps.push('No opportunities');
  if (!activities.length) brief.gaps.push('No activities');

  brief.opportunities = opportunities.map(opportunity => {
    const stage = opportunity.stage || 'unknown';
    const status = opportunity.status || 'unknown';
    const lastContact = opportunity.lastContactAt ? new Date(opportunity.lastContactAt) : null;
    const nextAction = opportunity.nextActionAt ? new Date(opportunity.nextActionAt) : null;

    return {
      id: opportunity.id,
      name: opportunity.name,
      stage,
      status,
      value: opportunity.value || 0,
      currency: opportunity.currency || 'unknown',
      lastContact: lastContact ? lastContact.toISOString().split('T')[0] : 'not recorded',
      nextAction: nextAction ? nextAction.toISOString().split('T')[0] : 'not scheduled',
      createdAt: opportunity.createdAt ? opportunity.createdAt.split('T')[0] : 'not recorded'
    };
  });

  brief.activities = activities.map(activity => {
    const date = activity.date ? new Date(activity.date) : null;
    return {
      id: activity.id,
      type: activity.type || 'unknown',
      date: date ? date.toISOString().split('T')[0] : 'not recorded',
      description: activity.description || 'no description'
    };
  });

  return brief;
};
