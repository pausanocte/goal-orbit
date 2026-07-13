// ==========================================
// Orbit - Safe Delete Actions
// ==========================================

import { el } from '../utils.js';
import { t } from '../i18n.js';
import { deleteArea, deleteGoal, getGoalsByArea, restoreArea, restoreGoal } from '../store.js';
import { deleteGoalCalendarEvent } from '../services/calendar-api.js';

function tr(key, fallback, ...args) {
  const value = t(key, ...args);
  if (value && value !== key) return value;
  return fallback.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)] ?? '');
}

function showUndoToast(message, undoLabel, onUndo) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = el('div', { className: 'toast toast-with-action' },
    el('i', { 'data-lucide': 'trash-2' }),
    el('span', {}, message),
    el('button', {
      type: 'button',
      className: 'toast-action-btn',
      onClick: () => {
        onUndo();
        toast.remove();
      }
    }, undoLabel)
  );

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('active'));
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 7000);
  if (window.lucide) window.lucide.createIcons();
}

async function maybeDeleteCalendarEvent(goal) {
  if (!goal?.googleCalendarEventId) return false;

  const shouldDelete = confirm(tr(
    'calendar.confirmDeleteWithGoal',
    'この目標に紐づくGoogleカレンダーの予定も削除しますか？'
  ));
  if (!shouldDelete) return false;

  try {
    await deleteGoalCalendarEvent(goal);
    return true;
  } catch (err) {
    console.error('Calendar delete failed', err);
    alert(`${tr('calendar.deleteFailed', 'Googleカレンダーから削除できませんでした。Googleログインの権限を確認してください。')}\n\n${err.message || ''}`);
    throw err;
  }
}

export async function confirmAndTrashGoal(goal, onRefresh) {
  if (!goal) return false;
  const confirmed = confirm(tr(
    'delete.confirmGoal',
    '「{0}」をゴミ箱へ移動しますか？30日間は復元できます。',
    goal.title
  ));
  if (!confirmed) return false;

  let calendarDeleted = false;
  try {
    calendarDeleted = await maybeDeleteCalendarEvent(goal);
  } catch {
    return false;
  }

  deleteGoal(goal.id, { calendarDeleted });
  onRefresh?.();
  showUndoToast(
    tr('delete.goalMovedToTrash', '目標をゴミ箱へ移動しました。'),
    tr('delete.undo', 'Undo'),
    () => {
      restoreGoal(goal.id);
      onRefresh?.();
    }
  );
  return true;
}

export async function confirmAndTrashArea(area, onRefresh) {
  if (!area) return false;
  const areaGoals = getGoalsByArea(area.id, true);
  const confirmed = confirm(tr(
    'delete.confirmArea',
    '「{0}」をゴミ箱へ移動しますか？配下の目標 {1} 件も一緒にゴミ箱へ移動します。',
    area.name,
    areaGoals.length
  ));
  if (!confirmed) return false;

  const calendarGoals = areaGoals.filter(goal => goal.googleCalendarEventId);
  const calendarDeletedGoalIds = [];
  if (calendarGoals.length > 0) {
    const shouldDeleteCalendar = confirm(tr(
      'calendar.confirmDeleteWithArea',
      'このArea内のGoogleカレンダー予定 {0} 件も削除しますか？',
      calendarGoals.length
    ));
    if (shouldDeleteCalendar) {
      try {
        for (const goal of calendarGoals) {
          await deleteGoalCalendarEvent(goal);
          calendarDeletedGoalIds.push(goal.id);
        }
      } catch (err) {
        console.error('Calendar delete failed', err);
        alert(`${tr('calendar.deleteFailed', 'Googleカレンダーから削除できませんでした。Googleログインの権限を確認してください。')}\n\n${err.message || ''}`);
        return false;
      }
    }
  }

  deleteArea(area.id, { calendarDeletedGoalIds });
  onRefresh?.();
  showUndoToast(
    tr('delete.areaMovedToTrash', 'Areaをゴミ箱へ移動しました。'),
    tr('delete.undo', 'Undo'),
    () => {
      restoreArea(area.id);
      onRefresh?.();
    }
  );
  return true;
}
