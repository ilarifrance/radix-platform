module.exports = function calculateActivityHealth(activities, nowIso) {
  if (!Array.isArray(activities) || typeof nowIso !== 'string') return { overdue: [], due: [], upcoming: [], completed: [] };

  const now = new Date(nowIso);
  const result = { overdue: [], due: [], upcoming: [], completed: [] };

  for (const activity of activities) {
    if (!activity || typeof activity !== 'object' || !activity.date || typeof activity.date !== 'string') continue;

    const date = new Date(activity.date);
    if (isNaN(date.getTime())) continue;

    if (date < now) {
      result.overdue.push(activity);
    } else if (date === now) {
      result.due.push(activity);
    } else if (date > now && date <= now.setDate(now.getDate() + 7)) {
      result.upcoming.push(activity);
    } else {
      result.completed.push(activity);
    }
  }

  return result;
};
