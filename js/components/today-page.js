// ==========================================
// Orbit - Today Page
// ==========================================

import { el, clearElement, formatDate } from '../utils.js';
import { getLang } from '../i18n.js';
import { getActiveGoals, getAreaById, getDueSoonGoals } from '../store.js';
import { openGoalModal } from './goal-modal.js';

const STALE_GOAL_DAYS = 14;

function uiText() {
  return getLang() === 'ja'
    ? {
        title: '今日見る',
        subtitle: '今日確認したい目標をすばやく見返せます',
        highPriority: '高優先で進める目標',
        dueSoonEmpty: '直近で期限が近い目標はありません',
        highPriorityEmpty: '高優先の進行中目標はありません',
        routinesEmpty: '今日確認したいRoutineはありません',
        staleTitle: '停滞中の目標',
        staleEmpty: '長く更新していない目標はありません',
        updatedDaysAgo: days => `${days}日更新なし`,
        dueDate: '期限日',
        frequency: '頻度'
      }
    : {
        title: 'Today',
        subtitle: 'A focused view of the goals worth checking today',
        highPriority: 'High Priority',
        dueSoonEmpty: 'Nothing urgent right now',
        highPriorityEmpty: 'No high-priority active goals',
        routinesEmpty: 'No routines to check today',
        staleTitle: 'Stale Goals',
        staleEmpty: 'No stale goals right now',
        updatedDaysAgo: days => `No update for ${days} days`,
        dueDate: 'Due Date',
        frequency: 'Frequency'
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
  const areaName = area ? area.name : 'Unknown';
  const areaColor = area ? area.color : '#6366F1';

  const meta = [areaName];
  if (goal.dueDate) meta.push(`${text.dueDate}: ${formatDate(goal.dueDate)}`);
  if (goal.frequency) meta.push(`${text.frequency}: ${goal.frequencyCustom || goal.frequency}`);
  if (goal.updatedAt) {
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(goal.updatedAt)) / (24 * 60 * 60 * 1000)));
    meta.push(text.updatedDaysAgo(days));
  }

  return el('button', {
    type: 'button',
    className: 'recent-goal-item',
    style: 'width: 100%; text-align: left; background: transparent;',
    onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, onRefresh)
  },
    el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
    el('div', { className: 'recent-goal-info' },
      el('span', { className: 'recent-goal-title' }, goal.title),
      el('span', { className: 'recent-goal-meta' }, meta.join(' · '))
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
  grid.appendChild(createSection(getLang() === 'ja' ? '期限が近い目標' : 'Due Soon', 'alarm-clock', dueSoon, text.dueSoonEmpty, rerender, text));
  grid.appendChild(createSection(text.highPriority, 'flag', highPriority, text.highPriorityEmpty, rerender, text));
  grid.appendChild(createSection('Routines', 'repeat', routines, text.routinesEmpty, rerender, text));
  grid.appendChild(createSection(text.staleTitle, 'clock-3', staleGoals, text.staleEmpty, rerender, text));

  container.appendChild(grid);

  if (window.lucide) window.lucide.createIcons();
}
