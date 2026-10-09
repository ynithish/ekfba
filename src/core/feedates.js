// Annual-fee dates, using the same status rules and calendar links as NLNLALD policy renewals.

/** Next card anniversary on or after `today` (both YYYY-MM-DD). Feb 29 falls on Feb 28 in other years. */
export function nextAnniversary(issueDate, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate || '');
  if (!m) return null;
  const [ty] = today.split('-').map(Number);
  const make = (y) => {
    const month = Number(m[2]);
    let day = Number(m[3]);
    const last = new Date(Date.UTC(y, month, 0)).getUTCDate();
    if (day > last) day = last;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  let d = make(ty);
  if (d < today) d = make(ty + 1);
  if (d <= issueDate) d = make(Number(issueDate.slice(0, 4)) + 1); // first fee falls one year after issue
  return d;
}

/** NLNLALD status vocabulary and thresholds. */
export function renewalStatus(days) {
  if (days === null || days === undefined) return { key: 'none', label: 'No date' };
  if (days < 0) return { key: 'urgent', label: 'Overdue' };
  if (days <= 7) return { key: 'urgent', label: 'Urgent' };
  if (days <= 60) return { key: 'soon', label: 'Renews soon' };
  return { key: 'ok', label: 'On track' };
}

export const REMINDER_OFFSETS = [60, 30, 7, 0];

const compact = (d) => d.replace(/-/g, '');
function addDays(date, n) {
  const t = new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000);
  return t.toISOString().slice(0, 10);
}

/** Google Calendar "add event" link for a fee reminder, or null if that reminder day has passed. */
export function feeCalendarLink(card, feeDate, offset, today) {
  if (!feeDate) return null;
  const start = addDays(feeDate, -offset);
  if (start < today) return null;
  const end = addDays(start, 1);
  const label = card.nickname || `${card.bank} ${card.name}`;
  const text = `Card annual fee: ${label}${offset ? ` due in ${offset} days` : ' due today'}`;
  const details = 'Check whether the fee-waiver spend was met, or ask the bank for a reversal. (EKFBA Card Manager)';
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(text)
    + '&dates=' + compact(start) + '/' + compact(end) + '&details=' + encodeURIComponent(details);
}
