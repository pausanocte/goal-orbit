// ==========================================
// Orbit - Today Page
// ==========================================

import { el, clearElement, formatDate, formatRoutineFrequency, isRoutineScheduledForDate } from '../utils.js';
import { t } from '../i18n.js';
import { getActiveGoals, getAreaById, getDueSoonGoals, getOverdueGoals, isRoutineCompletedOn, toggleRoutineCompletion } from '../store.js';
import { openGoalModal } from './goal-modal.js';

function uiText() {
  return {
    title: t('today.title'),
    subtitle: t('today.subtitle'),
    projectNextActions: t('today.projectNextActions'),
    projectNextActionsEmpty: t('today.projectNextActionsEmpty'),
    nextAction: t('today.nextAction'),
    dueDates: t('today.dueDates'),
    overdueEmpty: t('today.overdueEmpty'),
    dueSoonEmpty: t('today.dueSoonEmpty'),
    routinesEmpty: t('today.routinesEmpty'),
    dueDate: t('dashboard.colDueDate'),
    frequency: t('dashboard.colFrequency')
  };
}

function createGoalListItem(goal, onRefresh, text) {
  const area = getAreaById(goal.areaId);
  const areaName = area ? area.name : t('common.unknown');
  const areaColor = area ? area.color : '#6366F1';

  const meta = [areaName];
  if (goal.dueDate) meta.push(`${text.dueDate}: ${formatDate(goal.dueDate)}`);
  if (goal.frequency) meta.push(`${text.frequency}: ${formatRoutineFrequency(goal)}`);

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

function getNextAction(goal) {
  return (goal.subtasks || []).find(subtask => !subtask.completed) || null;
}

function createProjectActionItem(goal, onRefresh, text) {
  const area = getAreaById(goal.areaId);
  const areaName = area ? area.name : t('common.unknown');
  const areaColor = area ? area.color : '#6366F1';
  const nextAction = getNextAction(goal);
  const meta = [
    areaName,
    `${text.nextAction}: ${nextAction.text}`
  ];
  if (goal.dueDate) meta.push(`${text.dueDate}: ${formatDate(goal.dueDate)}`);

  return el('button', {
    type: 'button',
    className: 'recent-goal-item',
    style: 'width: 100%; text-align: left; background: transparent;',
    onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, onRefresh)
  },
    el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
    el('div', { className: 'recent-goal-info' },
      el('span', { className: 'recent-goal-title' }, goal.title),
      el('span', { className: 'recent-goal-meta' }, meta.join(' - '))
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

function createProjectActionSection(goals, emptyText, onRefresh, text) {
  const card = el('div', { className: 'glass-card today-section-card' },
    el('h2', { className: 'card-title' },
      el('i', { 'data-lucide': 'list-checks' }),
      el('span', {}, ` ${text.projectNextActions}`)
    )
  );

  if (goals.length === 0) {
    card.appendChild(el('div', { className: 'empty-state small' }, el('p', {}, emptyText)));
    return card;
  }

  const list = el('div', { className: 'recent-goals-list' });
  goals.forEach(goal => list.appendChild(createProjectActionItem(goal, onRefresh, text)));
  card.appendChild(list);
  return card;
}

function createDueGroup(title, icon, goals, emptyText, onRefresh, text) {
  const group = el('div', { className: 'today-due-group' },
    el('h3', { className: 'today-due-group-title' },
      el('i', { 'data-lucide': icon }),
      el('span', {}, ` ${title}`)
    )
  );

  if (goals.length === 0) {
    group.appendChild(el('p', { className: 'today-due-empty' }, emptyText));
    return group;
  }

  const list = el('div', { className: 'recent-goals-list' });
  goals.forEach(goal => list.appendChild(createGoalListItem(goal, onRefresh, text)));
  group.appendChild(list);
  return group;
}

function createDueSection(overdueGoals, dueSoonGoals, onRefresh, text) {
  return el('div', { className: 'glass-card today-section-card' },
    el('h2', { className: 'card-title' },
      el('i', { 'data-lucide': 'calendar-clock' }),
      el('span', {}, ` ${text.dueDates}`)
    ),
    createDueGroup(t('dashboard.overdue'), 'circle-alert', overdueGoals, text.overdueEmpty, onRefresh, text),
    createDueGroup(t('dashboard.dueSoon'), 'alarm-clock', dueSoonGoals, text.dueSoonEmpty, onRefresh, text)
  );
}

export function renderTodayPage(container) {
  clearElement(container);
  const text = uiText();

  const activeGoals = getActiveGoals().filter(goal => goal.status !== 'completed');
  const overdue = getOverdueGoals().slice(0, 8);
  const dueSoon = getDueSoonGoals(7);
  const projectNextActions = activeGoals
    .filter(goal => goal.category === 'projects')
    .filter(goal => getNextAction(goal))
    .sort((a, b) => {
      const dueA = a.dueDate ? Date.parse(a.dueDate) : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueDate ? Date.parse(b.dueDate) : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 8);
  const routines = activeGoals
    .filter(goal => goal.category === 'routines')
    .filter(goal => isRoutineScheduledForDate(goal))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 8);

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
  grid.appendChild(createSection(t('cat.routines'), 'repeat', routines, text.routinesEmpty, rerender, text));
  grid.appendChild(createProjectActionSection(projectNextActions, text.projectNextActionsEmpty, rerender, text));
  grid.appendChild(createDueSection(overdue, dueSoon, rerender, text));

  container.appendChild(grid);

  if (window.lucide) window.lucide.createIcons();
}
