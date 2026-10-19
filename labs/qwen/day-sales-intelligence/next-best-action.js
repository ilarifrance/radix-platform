module.exports = { recommendNextAction };

function recommendNextAction(opportunity, nowIso) {
  if (!opportunity) return { action: 'none', urgency: 'low', reason: 'Invalid opportunity' };
  const { id, name, stage, status, value, currency, lastContactAt, nextActionAt, createdAt } = opportunity;
  const now = new Date(nowIso);
  const lastContact = lastContactAt ? new Date(lastContactAt) : null;
  const nextAction = nextActionAt ? new Date(nextActionAt) : null;

  if (status === 'won' || status === 'lost') return { action: 'none', urgency: 'low', reason: 'Opportunity closed' };

  if (stage === 'prospect') {
    if (!lastContact) {
      return { action: 'reachOut', urgency: 'high', reason: 'No contact yet; initiate outreach' };
    } else if (now > new Date(lastContact.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      return { action: 'followUp', urgency: 'medium', reason: 'Last contact over a week ago; follow up' };
    }
  } else if (stage === 'qualified') {
    if (!lastContact) {
      return { action: 'scheduleCall', urgency: 'high', reason: 'No contact yet; schedule call' };
    } else if (now > new Date(lastContact.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      return { action: 'followUp', urgency: 'medium', reason: 'Last contact over a week ago; follow up' };
    }
  } else if (stage === 'proposal') {
    if (now > nextAction) {
      return { action: 'sendProposal', urgency: 'high', reason: 'Next action date passed; send proposal' };
    }
  } else if (stage === 'negotiation') {
    if (now > nextAction) {
      return { action: 'negotiate', urgency: 'high', reason: 'Next action date passed; negotiate' };
    }
  }

  return { action: 'none', urgency: 'low', reason: 'No action required' };
}
