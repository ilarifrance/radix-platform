module.exports = function checkContactEligibility(contact, channel, nowIso) {
  if (!contact || !contact.lastContactAt || !contact.nextActionAt) return 'not-allowed';
  const lastContact = new Date(contact.lastContactAt);
  const nextAction = new Date(contact.nextActionAt);
  const now = new Date(nowIso);
  if (now < nextAction) return 'not-allowed';
  if (now - lastContact < 24 * 60 * 60 * 1000) return 'not-allowed';
  if (channel === 'email' && contact.emailOptOut) return 'not-allowed';
  if (channel === 'phone' && contact.phoneOptOut) return 'not-allowed';
  if (channel === 'sms' && contact.smsOptOut) return 'not-allowed';
  if (channel === 'inPerson' && contact.inPersonOptOut) return 'not-allowed';
  return 'allowed';
};
