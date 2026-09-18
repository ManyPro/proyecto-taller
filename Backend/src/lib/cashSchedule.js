const TZ = 'America/Bogota';
const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const CASH_SCHEDULE_LABEL = 'L-V 7:00 a.m. – 6:00 p.m. · Sábado 7:00 a.m. – 3:00 p.m.';

export function getBogotaClock(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    weekday: WEEKDAY_MAP[parts.weekday] ?? 0,
    hour,
    minute: Number(parts.minute),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

export function getScheduleForWeekday(weekday) {
  if (weekday >= 1 && weekday <= 5) return { openHour: 7, closeHour: 18 };
  if (weekday === 6) return { openHour: 7, closeHour: 15 };
  return null;
}

export function isWithinBusinessHours(date = new Date()) {
  const clock = getBogotaClock(date);
  const schedule = getScheduleForWeekday(clock.weekday);
  if (!schedule) return false;
  const minutes = clock.hour * 60 + clock.minute;
  return minutes >= schedule.openHour * 60 && minutes < schedule.closeHour * 60;
}

export function bogotaDayRange(date = new Date()) {
  const clock = getBogotaClock(date);
  const ymd = `${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`;
  return {
    start: new Date(`${ymd}T00:00:00.000-05:00`),
    end: new Date(`${ymd}T23:59:59.999-05:00`)
  };
}

export function scheduleStatus(date = new Date()) {
  const clock = getBogotaClock(date);
  const schedule = getScheduleForWeekday(clock.weekday);
  return {
    timezone: TZ,
    withinHours: isWithinBusinessHours(date),
    label: CASH_SCHEDULE_LABEL,
    weekday: clock.weekday,
    openHour: schedule?.openHour ?? null,
    closeHour: schedule?.closeHour ?? null
  };
}
