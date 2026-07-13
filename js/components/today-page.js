// ==========================================
// Orbit - Today Page
// ==========================================

import { el, clearElement, formatDate, formatRoutineFrequency, isRoutineScheduledForDate } from '../utils.js';
import { t } from '../i18n.js';
import { getActiveGoals, getAreaById, getDueSoonGoals, isRoutineCompletedOn, toggleRoutineCompletion } from '../store.js';
import { openGoalModal } from './goal-modal.js?v=20260714-7';

const STALE_GOAL_DAYS = 14;

function uiText() {
  return {
    title: t('today.title'),
    subtitle: t('today.subtitle'),
    highPriority: t('today.highPriority'),
    dueSoonEmpty: t('today.dueSoonEmpty'),
    highPriorityEmpty: t('today.highPriorityEmpty'),
    routinesEmpty: t('today.routinesEmpty'),
    staleTitle: t('today.staleTitle'),
    staleEmpty: t('today.staleEmpty'),
    updatedDaysAgo: days => t('today.updatedDaysAgo', days),
    dueDate: t('dashboard.colDueDate'),
    frequency: t('dashboard.colFrequency')
  };
}

function getStaleGoals(goals) {
  const now = Date.now();
  const staleMs = STALE_GOAL_DAYS * 24 * 60 * 60 * 1000;

  return goals
    .filter(goal => !goal.archived)
    .filter(goal => {
      const updatedAt = Date.parse(goal.updatedAt || goal.createdAt || '');
      return Number.isFinite(updatedAt) && now - updatedAt >= staleMs;
    })
    .sort((a, b) => Date.parse(a.updatedAt || 0) - Date.parse(b.updatedAt || 0));
}

function createGoalListItem(goal, onRefresh, text) {
  const area = getAreaById(goal.areaId);
  const areaName = area ? area.name : t('common.unknown');
  const areaColor = area ? area.color : '#6366F1';

  const meta = [areaName];
  if (goal.dueDate) meta.push(`${text.dueDate}: ${formatDate(goal.dueDate)}`);
  if (goal.frequency) meta.push(`${text.frequency}: ${formatRoutineFrequency(goal)}`);
  if (goal.updatedAt) {
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(goal.updatedAt)) / (24 * 60 * 60 * 1000)));
    meta.push(text.updatedDaysAgo(days));
  }

  const completedToday = goal.category === 'routines' && isRoutineCompletedOn(goal);
  const content = el('button', {
    type: 'button',
    className: `recent-goal-item${completedToday ? ' routine-done' : ''}`,
    style: 'width: 100%; text-align: left; background: transparent;',
    onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, onRefresh)
  },
    el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
    el('div', { className: 'recent-goal-info' },
      el('span', { className: 'recent-goal-title' }, goal.title),
      el('span', { className: 'recent-goal-meta' }, meta.join(' - '))
    )
  );

  if (goal.category !== 'routines') return content;

  return el('div', { className: 'routine-check-row' },
    content,
    el('button', {
      type: 'button',
      className: `routine-check-btn${completedToday ? ' completed' : ''}`,
      onClick: (event) => {
        event.stopPropagation();
        toggleRoutineCompletion(goal.id);
        onRefresh();
      }
    },
      el('i', { 'data-lucide': completedToday ? 'check-circle-2' : 'circle' }),
      el('span', {}, completedToday ? t('routine.doneToday') : t('routine.markDone'))
    )
  );
}

function createSection(title, icon, goals, emptyText, onRefresh, text) {
  const card = el('div', { className: 'glass-card today-section-card' },
    el('h2', { className: 'card-title' },
      el('i', { 'data-lucide': icon }),
      el('span', {}, ` ${title}`)
    )
  );

  if (goals.length === 0) {
    card.appendChild(
      el('div', { className: 'empty-state small' },
        el('p', {}, emptyText)
      )
    );
    return card;
  }

  const list = el('div', { className: 'recent-goals-list' });
  goals.forEach(goal => list.appendChild(createGoalListItem(goal, onRefresh, text)));
  card.appendChild(list);
  return card;
}

export function renderTodayPage(container) {
  clearElement(container);
  const text = uiText();

  const activeGoals = getActiveGoals().filter(goal => goal.status !== 'completed');
  const dueSoon = getDueSoonGoals(7);
  const highPriority = activeGoals
    .filter(goal => goal.priority === 'high')
    .sort((a, b) => {
      const dueA = a.dueDate ? Date.parse(a.dueDate) : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueDate ? Date.parse(b.dueDate) : Number.MAX_SAFE_INTEGER;
      return dueA - dueB;
    })
    .slice(0, 8);
  const routines = activeGoals
    .filter(goal => goal.category === 'routines')
    .filter(goal => isRoutineScheduledForDate(goal))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 8);
  const staleGoals = getStaleGoals(activeGoals).slice(0, 8);

  const rerender = () => renderTodayPage(container);

  container.appendChild(
    el('div', { className: 'page-header' },
      el('div', {},
        el('h1', { className: 'page-title' }, text.title),
        el('p', { className: 'page-subtitle' }, text.subtitle)
      )
    )
  );

  const grid = el('div', { className: 'today-page-grid' });
  grid.appendChild(createSection(t('dashboard.dueSoon'), 'alarm-clock', dueSoon, text.dueSoonEmpty, rerender, text));
  grid.appendChild(createSection(text.highPriority, 'flag', highPriority, text.highPriorityEmpty, rerender, text));
  grid.appendChild(createSection(t('cat.routines'), 'repeat', routines, text.routinesEmpty, rerender, text));
  grid.appendChild(createSection(text.staleTitle, 'clock-3', staleGoals, text.staleEmpty, rerender, text));

  container.appendChild(grid);

  if (window.lucide) window.lucide.createIcons();
}
