import { getGoogleAccessToken } from './drive-api.js';
import { formatRoutineFrequency } from '../utils.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_WEEKDAYS = {
  sun: 'SU',
  mon: 'MO',
  tue: 'TU',
  wed: 'WE',
  thu: 'TH',
  fri: 'FR',
  sat: 'SA'
};
const WEEKDAY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function addOneDay(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function compareDateValues(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function toDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toDateTimeValue(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const offsetMins = String(absoluteOffset % 60).padStart(2, '0');

  return `${toDateValue(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00${sign}${offsetHours}:${offsetMins}`;
}

function getGoalCalendarDate(goal) {
  if (goal.category === 'projects') return goal.dueDate || null;
  return goal.dueDate || goal.startDate || goal.completedDate || null;
}

function formatUntilDate(dateValue) {
  return String(dateValue || '').replaceAll('-', '');
}

function formatUntilDateTime(dateValue) {
  return new Date(`${dateValue}T23:59:59`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function getRoutineWeekdays(goal) {
  return Array.isArray(goal.frequencyWeekdays)
    ? goal.frequencyWeekdays.map(day => GOOGLE_WEEKDAYS[day]).filter(Boolean)
    : [];
}

function getStartWeekday(goal) {
  if (!goal.startDate) return null;
  const date = new Date(`${goal.startDate}T00:00:00`);
  return GOOGLE_WEEKDAYS[WEEKDAY_INDEX[date.getDay()]] || null;
}

function getRoutineCalendarWeekdays(goal) {
  const selected = getRoutineWeekdays(goal);
  if (selected.length > 0 || goal.frequency === 'daily' || goal.frequency === 'monthly' || goal.frequency === 'custom') {
    return selected;
  }
  const startWeekday = getStartWeekday(goal);
  return startWeekday ? [startWeekday] : [];
}

function getFirstRoutineOccurrenceDate(goal) {
  const selected = Array.isArray(goal.frequencyWeekdays) ? goal.frequencyWeekdays : [];
  if (!goal.startDate || selected.length === 0 || goal.frequency === 'monthly') return goal.startDate;

  const selectedIndexes = selected
    .map(day => WEEKDAY_INDEX.indexOf(day))
    .filter(index => index >= 0);
  if (selectedIndexes.length === 0) return goal.startDate;

  const cursor = new Date(`${goal.startDate}T00:00:00`);
  for (let offset = 0; offset < 7; offset += 1) {
    if (selectedIndexes.includes(cursor.getDay())) {
      return toDateValue(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return goal.startDate;
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function hasRoutineTime(goal) {
  return goal.category === 'routines' && /^\d{2}:\d{2}$/.test(goal.routineStartTime || '');
}

function buildRoutineTimedRange(goal, date) {
  const start = new Date(`${date}T${goal.routineStartTime}:00`);
  const duration = Number(goal.routineDurationMinutes || 30);
  const minutes = Number.isFinite(duration) && duration > 0 ? duration : 30;
  const end = new Date(start.getTime() + minutes * 60 * 1000);
  const timeZone = getLocalTimeZone();

  return {
    start: { dateTime: toDateTimeValue(start), timeZone },
    end: { dateTime: toDateTimeValue(end), timeZone }
  };
}

function buildRoutineRecurrence(goal) {
  if (goal.category !== 'routines' || !goal.frequency) return null;
  if (!goal.startDate || !goal.completedDate || compareDateValues(goal.startDate, goal.completedDate) > 0) {
    throw new Error('CALENDAR_ROUTINE_DATE_REQUIRED');
  }
  if (compareDateValues(getFirstRoutineOccurrenceDate(goal), goal.completedDate) > 0) {
    throw new Error('CALENDAR_ROUTINE_WEEKDAY_RANGE_REQUIRED');
  }

  const rules = [];
  const weekdays = getRoutineCalendarWeekdays(goal);

  if (goal.frequency === 'daily') {
    rules.push('FREQ=DAILY');
  } else if (goal.frequency === 'custom') {
    rules.push(weekdays.length > 0 ? 'FREQ=WEEKLY' : 'FREQ=DAILY');
  } else if (goal.frequency === 'weekly') {
    rules.push('FREQ=WEEKLY');
  } else if (goal.frequency === 'biweekly') {
    rules.push('FREQ=WEEKLY');
    rules.push('INTERVAL=2');
  } else if (goal.frequency === 'monthly') {
    rules.push('FREQ=MONTHLY');
  } else {
    rules.push('FREQ=WEEKLY');
  }

  if (weekdays.length > 0 && goal.frequency !== 'monthly') {
    rules.push(`BYDAY=${weekdays.join(',')}`);
  }
  rules.push(`UNTIL=${hasRoutineTime(goal) ? formatUntilDateTime(goal.completedDate) : formatUntilDate(goal.completedDate)}`);

  return [`RRULE:${rules.join(';')}`];
}

function buildGoalEvent(goal) {
  const recurrence = buildRoutineRecurrence(goal);
  const date = recurrence ? getFirstRoutineOccurrenceDate(goal) : getGoalCalendarDate(goal);
  if (!date) throw new Error('CALENDAR_DATE_REQUIRED');
  const frequencyText = formatRoutineFrequency(goal);
  const timedRange = recurrence && hasRoutineTime(goal) ? buildRoutineTimedRange(goal, date) : null;

  const event = {
    summary: goal.title,
    description: [
      goal.description || '',
      frequencyText ? `Frequency: ${frequencyText}` : '',
      '',
      'Created from Orbit.'
    ].filter(Boolean).join('\n').trim(),
    start: timedRange ? timedRange.start : { date },
    end: timedRange ? timedRange.end : { date: addOneDay(date) },
    extendedProperties: {
      private: {
        orbitGoalId: goal.id,
        orbitCategory: goal.category
      }
    }
  };

  if (recurrence) event.recurrence = recurrence;
  return event;
}

async function calendarRequest(path, options = {}) {
  const accessToken = getGoogleAccessToken();
  if (!accessToken) throw new Error('GOOGLE_LOGIN_REQUIRED');

  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || `CALENDAR_API_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function canCreateCalendarEvent(goal) {
  return !getCalendarValidationErrorKey(goal);
}

export function getCalendarValidationErrorKey(goal) {
  if (goal.category === 'routines' && goal.frequency) {
    if (!goal.startDate || !goal.completedDate || compareDateValues(goal.startDate, goal.completedDate) > 0) {
      return 'calendar.routineDateRequired';
    }
    if (compareDateValues(getFirstRoutineOccurrenceDate(goal), goal.completedDate) > 0) {
      return 'calendar.routineWeekdayRangeRequired';
    }
    return null;
  }
  if (goal.category === 'projects') {
    return goal.dueDate ? null : 'calendar.projectDueDateRequired';
  }
  return getGoalCalendarDate(goal) ? null : 'calendar.dateRequired';
}

export async function upsertGoalCalendarEvent(goal) {
  const event = buildGoalEvent(goal);
  if (goal.googleCalendarEventId) {
    const patchEvent = event.recurrence ? event : { ...event, recurrence: [] };
    return calendarRequest(`/calendars/primary/events/${encodeURIComponent(goal.googleCalendarEventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patchEvent)
    });
  }

  return calendarRequest('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event)
  });
}
