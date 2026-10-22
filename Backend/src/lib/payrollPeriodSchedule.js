import { getBogotaClock } from './cashSchedule.js';

export const PAYROLL_WEEKLY_TZ = 'America/Bogota';
export const PAYROLL_WEEKLY_LABEL = 'Se abre cada lunes 7:00 a.m. y se cierra cada domingo 7:00 a.m. (Bogotá).';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymdFromClock(clock) {
  return `${clock.year}-${pad2(clock.month)}-${pad2(clock.day)}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00.000-05:00`);
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  return ymdFromClock(getBogotaClock(d));
}

export function bogotaPeriodRange(startYmd, endYmd) {
  return {
    start: new Date(`${startYmd}T00:00:00.000-05:00`),
    end: new Date(`${endYmd}T23:59:59.999-05:00`)
  };
}

export function getWeeklyPeriodYmdRange(date = new Date()) {
  const clock = getBogotaClock(date);
  const daysFromMonday = (clock.weekday + 6) % 7;
  const todayYmd = ymdFromClock(clock);
  const startYmd = addDaysYmd(todayYmd, -daysFromMonday);
  const endYmd = addDaysYmd(startYmd, 6);
  return { startYmd, endYmd };
}

export function isWeeklyPeriodActiveWindow(date = new Date()) {
  const clock = getBogotaClock(date);
  const minutes = clock.hour * 60 + clock.minute;
  const sevenAm = 7 * 60;
  if (clock.weekday === 0) return minutes < sevenAm;
  if (clock.weekday === 1) return minutes >= sevenAm;
  return true;
}

export function shouldCloseCurrentWeeklyPeriod(date = new Date()) {
  const clock = getBogotaClock(date);
  return clock.weekday === 0 && (clock.hour * 60 + clock.minute) >= 7 * 60;
}

export function weeklyScheduleStatus(date = new Date()) {
  const range = getWeeklyPeriodYmdRange(date);
  return {
    timezone: PAYROLL_WEEKLY_TZ,
    label: PAYROLL_WEEKLY_LABEL,
    activeWindow: isWeeklyPeriodActiveWindow(date),
    startYmd: range.startYmd,
    endYmd: range.endYmd
  };
}
