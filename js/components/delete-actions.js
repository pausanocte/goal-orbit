// ==========================================
// Orbit - Safe Delete Actions
// ==========================================

import { el } from '../utils.js';
import { t } from '../i18n.js';
import { deleteArea, deleteGoal, getGoalsByArea, restoreArea, restoreGoal } from '../store.js';

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

export async function confirmAndTrashGoal(goal, onRefresh) {
  if (!goal) return false;
  const confirmed = confirm(tr(
    'delete.confirmGoal',
    '「{0}」をゴミ箱へ移動しますか？30日間は復元できます。',
    goal.title
  ));
  if (!confirmed) return false;

  deleteGoal(goal.id);
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

  deleteArea(area.id);
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
