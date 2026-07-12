import { getGoogleAccessToken } from './drive-api.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function addOneDay(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getGoalCalendarDate(goal) {
  return goal.dueDate || goal.startDate || goal.completedDate || null;
}

function buildGoalEvent(goal) {
  const date = getGoalCalendarDate(goal);
  if (!date) throw new Error('CALENDAR_DATE_REQUIRED');

  return {
    summary: goal.title,
    description: [
      goal.description || '',
      '',
      'Created from Orbit.'
    ].join('\n').trim(),
    start: { date },
    end: { date: addOneDay(date) },
    extendedProperties: {
      private: {
        orbitGoalId: goal.id,
        orbitCategory: goal.category
      }
    }
  };
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
  return Boolean(getGoalCalendarDate(goal));
}

export async function upsertGoalCalendarEvent(goal) {
  const event = buildGoalEvent(goal);
  if (goal.googleCalendarEventId) {
    return calendarRequest(`/calendars/primary/events/${encodeURIComponent(goal.googleCalendarEventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(event)
    });
  }

  return calendarRequest('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event)
  });
}
