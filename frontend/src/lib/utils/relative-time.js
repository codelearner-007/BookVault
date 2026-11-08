// "5 minutes ago", "yesterday", "3 weeks ago": how long before `now` an ISO timestamp was.
const UNITS = [
  { unit: 'year', seconds: 31_536_000 },
  { unit: 'month', seconds: 2_592_000 },
  { unit: 'week', seconds: 604_800 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
];
const JUST_NOW_SECONDS = 45;

const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function relativeTime(iso, now = Date.now()) {
  if (!iso) return '';
  const elapsed = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (elapsed < JUST_NOW_SECONDS) return formatter.format(0, 'second');
  const { unit, seconds } = UNITS.find((u) => elapsed >= u.seconds) ?? UNITS[UNITS.length - 1];
  return formatter.format(-Math.round(elapsed / seconds), unit);
}
