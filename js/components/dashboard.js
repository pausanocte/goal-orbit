// ==========================================
// Orbit v3.3 - ダッシュボードコンポーネント
// ==========================================

import { el, clearElement, STATUS_CONFIG, PRIORITY_CONFIG, formatDate, formatRoutineFrequency, getSubtaskProgress, normalizeDateInput } from '../utils.js';
import { t } from '../i18n.js';
import { getStats, getDueSoonGoals, getActiveAreas, getAreaById, getActiveGoals, getAllGoals, updateGoal, toggleSubtask, getDashboardLayout, saveDashboardLayout, deleteGoal, isRoutineCompletedOn, toggleRoutineCompletion } from '../store.js';
import { openGoalModal } from './goal-modal.js';
import { openAreaModal } from './area-modal.js';

const DASHBOARD_SETTINGS_KEY = 'orbit_dashboard_settings';

let routinesSort = 'name';
let projectsSort = 'dueDate';
let routinesSortOrder = 'asc';
let projectsSortOrder = 'asc';
let routinesStatusFilter = ['active', 'on-hold'];
let projectsStatusFilter = ['active', 'on-hold'];
let activeWidgetDrag = null;
const DRAG_SCROLL_EDGE_PX = 96;
const DRAG_SCROLL_MAX_STEP = 18;
const STALE_GOAL_DAYS = 14;

function requestCompletedDate(currentValue = '') {
  const input = prompt(t('common.completedDatePrompt'), currentValue ? formatDate(currentValue) : '');
  if (input === null) return null;
  const normalized = normalizeDateInput(input);
  if (!normalized) {
    alert(t('common.completedDateInputHelp'));
    return undefined;
  }
  return normalized;
}

function createDeleteGoalButton(goal, onDeleted) {
  return el('button', {
    className: 'btn btn-ghost btn-sm dashboard-delete-goal-btn',
    title: t('common.delete'),
    onClick: (e) => {
      e.stopPropagation();
      if (confirm(t('area.confirmDelete', goal.title))) {
        deleteGoal(goal.id);
        onDeleted();
      }
    }
  },
    el('i', { 'data-lucide': 'trash-2', style: 'width: 14px; height: 14px;' })
  );
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

function createInlineDateEditor(goal, field, onSaved, options = {}) {
  const nativeInput = el('input', {
    type: 'date',
    className: 'native-date-input-hidden',
    value: goal[field] || '',
    tabindex: '-1',
    'aria-hidden': 'true',
    onChange: (e) => {
      e.stopPropagation();
      updateGoal(goal.id, { [field]: e.target.value || null });
      onSaved();
    },
    onClick: (e) => e.stopPropagation()
  });

  const input = el('input', {
    type: 'text',
    value: goal[field] ? formatDate(goal[field]) : '',
    className: 'inline-edit-date',
    placeholder: options.placeholder || 'YYYY/MM/DD',
    onChange: (e) => {
      e.stopPropagation();
      const normalized = normalizeDateInput(e.target.value);
      if (e.target.value && !normalized) {
        alert(t('common.dateInputHelp'));
        e.target.value = goal[field] ? formatDate(goal[field]) : '';
        return;
      }
      nativeInput.value = normalized || '';
      updateGoal(goal.id, { [field]: normalized });
      onSaved();
    },
    onClick: (e) => e.stopPropagation()
  });

  const calendarBtn = el('button', {
    type: 'button',
    className: 'inline-date-picker-btn',
    title: t('common.selectDate'),
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      nativeInput.value = normalizeDateInput(input.value) || '';
      if (typeof nativeInput.showPicker === 'function') {
        nativeInput.showPicker();
      } else {
        nativeInput.focus();
        nativeInput.click();
      }
    }
  }, el('i', { 'data-lucide': 'calendar-days' }));

  return el('div', { className: 'inline-date-picker' }, input, calendarBtn, nativeInput);
}

function loadDashboardSettings() {
  try {
    const raw = localStorage.getItem(DASHBOARD_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.routinesSort) routinesSort = parsed.routinesSort;
      if (parsed.projectsSort) projectsSort = parsed.projectsSort;
      if (parsed.routinesSortOrder) routinesSortOrder = parsed.routinesSortOrder;
      if (parsed.projectsSortOrder) projectsSortOrder = parsed.projectsSortOrder;
      if (parsed.routinesStatusFilter) routinesStatusFilter = parsed.routinesStatusFilter;
      if (parsed.projectsStatusFilter) projectsStatusFilter = parsed.projectsStatusFilter;
    }
  } catch (e) {
    console.error('Error loading dashboard settings', e);
  }
}

function saveDashboardSettings() {
  try {
    localStorage.setItem(DASHBOARD_SETTINGS_KEY, JSON.stringify({
      routinesSort,
      projectsSort,
      routinesSortOrder,
      projectsSortOrder,
      routinesStatusFilter,
      projectsStatusFilter
    }));
  } catch (e) {
    console.error('Error saving dashboard settings', e);
  }
}

function createStatusCheckbox(statusVal, labelText, filterArray, onChange) {
  const isChecked = filterArray.includes(statusVal);
  return el('label', { className: 'filter-checkbox-label', style: 'display: flex; align-items: center; gap: 4px; font-size: 0.8rem; cursor: pointer; color: var(--text-secondary); white-space: nowrap; user-select: none;' },
    el('input', {
      type: 'checkbox',
      checked: isChecked,
      style: 'cursor: pointer; accent-color: var(--accent-primary); width: 14px; height: 14px; margin: 0;',
      onChange: (e) => {
        if (e.target.checked) {
          if (!filterArray.includes(statusVal)) {
            filterArray.push(statusVal);
          }
        } else {
          const idx = filterArray.indexOf(statusVal);
          if (idx !== -1) {
            filterArray.splice(idx, 1);
          }
        }
        onChange();
      }
    }),
    el('span', {}, labelText)
  );
}

function sortRoutines(routines, sortBy, sortOrder, getAreaById) {
  return [...routines].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'name') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortBy === 'area') {
      const areaA = getAreaById(a.areaId)?.name || '';
      const areaB = getAreaById(b.areaId)?.name || '';
      cmp = areaA.localeCompare(areaB);
    } else if (sortBy === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1 };
      const valA = pMap[a.priority] ?? 2;
      const valB = pMap[b.priority] ?? 2;
      cmp = valA - valB;
    } else if (sortBy === 'frequency') {
      const fMap = { daily: 5, weekly: 4, biweekly: 3, monthly: 2, custom: 1 };
      const valA = fMap[a.frequency] ?? 0;
      const valB = fMap[b.frequency] ?? 0;
      cmp = valA - valB;
    }
    return sortOrder === 'desc' ? -cmp : cmp;
  });
}

function sortProjects(projects, sortBy, sortOrder, getAreaById, getSubtaskProgress) {
  return [...projects].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'dueDate') {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      cmp = new Date(a.dueDate) - new Date(b.dueDate);
    } else if (sortBy === 'name') {
      cmp = a.title.localeCompare(b.title);
    } else if (sortBy === 'area') {
      const areaA = getAreaById(a.areaId)?.name || '';
      const areaB = getAreaById(b.areaId)?.name || '';
      cmp = areaA.localeCompare(areaB);
    } else if (sortBy === 'progress') {
      const pctA = getSubtaskProgress(a.subtasks)?.percent ?? 0;
      const pctB = getSubtaskProgress(b.subtasks)?.percent ?? 0;
      cmp = pctA - pctB;
    } else if (sortBy === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1 };
      const valA = pMap[a.priority] ?? 2;
      const valB = pMap[b.priority] ?? 2;
      cmp = valA - valB;
    }
    return sortOrder === 'desc' ? -cmp : cmp;
  });
}

export function renderDashboard(container, onNavigate) {
  loadDashboardSettings();
  clearElement(container);

  const stats = getStats();
  const dueSoon = getDueSoonGoals(3);
  const activeAreas = getActiveAreas();
  const activeRoutines = getAllGoals().filter(g => g.category === 'routines' && routinesStatusFilter.includes(g.status));
  const activeProjects = getAllGoals().filter(g => g.category === 'projects' && projectsStatusFilter.includes(g.status));
  const staleGoals = getStaleGoals(getAllGoals()).slice(0, 5);
  const staleTitle = t('dashboard.stale') === 'dashboard.stale' ? '停滞中の目標' : t('dashboard.stale');
  const updatedDaysLabel = days => {
    const template = t('dashboard.updatedDaysAgo', days);
    return template === 'dashboard.updatedDaysAgo' ? `${days}日更新なし` : template;
  };

  // ページヘッダー（右側に「目標を追加」ボタンを配置）
  const header = el('div', { className: 'page-header' },
    el('div', {},
      el('h1', { className: 'page-title' }, t('dashboard.title')),
      el('p', { className: 'page-subtitle' }, t('dashboard.subtitle'))
    ),
    el('button', {
      className: 'btn btn-primary',
      onClick: () => {
        const defaultArea = activeAreas.length > 0 ? { areaId: activeAreas[0].id, category: 'routines' } : null;
        openGoalModal(null, defaultArea, () => renderDashboard(container, onNavigate));
      }
    },
      el('i', { 'data-lucide': 'plus' }),
      el('span', {}, t('area.addGoal'))
    )
  );
  container.appendChild(header);

  const gridContainer = el('div', { className: 'dashboard-widget-grid' });
  initDragAndDrop(gridContainer);
  
  // Areas ウィジェット
  const areasCol = el('div', { className: 'glass-card active-col' });
  const areasHeader = el('div', { className: 'card-header-flex', style: 'display: flex; justify-content: flex-start; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 12px;' },
    el('h2', { className: 'card-title', style: 'margin-bottom: 0; margin-right: 12px;' },
      el('i', { 'data-lucide': 'folder' }),
      el('span', {}, ' エリア')
    ),
    el('div', { className: 'header-controls', style: 'display: flex; align-items: center; gap: 16px; margin-left: auto;' },
      el('button', {
        className: 'btn btn-ghost btn-sm',
        style: 'padding: 4px 8px; font-size: 0.78rem;',
        onClick: (e) => {
          e.stopPropagation();
          openAreaModal(null, () => renderDashboard(container, onNavigate));
        }
      },
        el('i', { 'data-lucide': 'plus', style: 'width: 14px; height: 14px;' }),
        el('span', {}, '新規エリア')
      )
    )
  );
  const areasTitleLabel = areasHeader.querySelector('.card-title span');
  if (areasTitleLabel) areasTitleLabel.textContent = ` ${t('sidebar.areas')}`;
  const addAreaLabel = areasHeader.querySelector('.header-controls button span');
  if (addAreaLabel) addAreaLabel.textContent = t('sidebar.addArea');
  areasCol.appendChild(areasHeader);

  if (activeAreas.length === 0) {
    areasCol.appendChild(
      el('div', { className: 'empty-state small' },
        el('p', {}, 'エリアはありません')
      )
    );
    const emptyAreaMessage = areasCol.querySelector('.empty-state.small p');
    if (emptyAreaMessage) emptyAreaMessage.textContent = t('common.noAreas');
  } else {
    const areasGrid = el('div', { className: 'stats-grid', style: 'margin-bottom: 0; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); width: 100%; gap: 12px;' });
    activeAreas.forEach(area => {
      const areaStats = stats.byArea[area.id] || { total: 0, routines: 0, projects: 0, resources: 0 };
      const card = el('div', {
        className: 'stat-card area-card',
        style: 'cursor: pointer; margin-bottom: 0; padding: 16px;',
        onClick: () => onNavigate(`area-${area.id}`)
      },
        el('div', { className: 'stat-card-header', style: 'margin-bottom: 8px;' },
          el('div', {
            className: 'stat-card-icon',
            style: `background: ${area.color}26; color: ${area.color}; width: 32px; height: 32px; border-radius: var(--radius-sm);`
          },
            el('i', { 'data-lucide': area.icon || 'star', style: 'width: 16px; height: 16px;' })
          ),
          el('span', { className: 'stat-card-label', style: 'font-weight: 600; font-size: 0.95rem; color: var(--text-primary);' }, area.name)
        ),
        area.description ? el('p', { style: 'font-size: 0.76rem; color: var(--text-secondary); margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.4em; line-height: 1.2;' }, area.description) : el('div', { style: 'height: 2.4em;' }),
        el('div', { className: 'stat-card-breakdown', style: 'margin-top: 8px; padding-top: 8px;' },
          el('span', { className: 'breakdown-item' },
            el('i', { 'data-lucide': 'repeat', className: 'breakdown-icon' }),
            el('span', {}, `${t('dashboard.r')}: ${areaStats.routines}`)
          ),
          el('span', { className: 'breakdown-item' },
            el('i', { 'data-lucide': 'rocket', className: 'breakdown-icon' }),
            el('span', {}, `${t('dashboard.p')}: ${areaStats.projects}`)
          )
        )
      );
      card.style.setProperty('--area-color', area.color);
      card.style.setProperty('--area-color-subtle', `${area.color}26`);
      card.style.setProperty('--area-color-glow', `${area.color}15`);
      areasGrid.appendChild(card);
    });
    areasCol.appendChild(areasGrid);
  }

  const sortedRoutines = sortRoutines(activeRoutines, routinesSort, routinesSortOrder, getAreaById);

  // Routines 行
  const routinesCol = el('div', { className: 'glass-card active-col' });
  const routinesHeader = el('div', { className: 'card-header-flex', style: 'display: flex; justify-content: flex-start; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 12px;' },
    el('h2', { className: 'card-title', style: 'margin-bottom: 0; margin-right: 12px;' },
      el('i', { 'data-lucide': 'repeat' }),
      el('span', {}, ` ${t('cat.routines')}`)
    ),
    el('div', { className: 'header-controls', style: 'display: flex; align-items: center; gap: 10px; flex-wrap: wrap;' },
      el('div', { className: 'status-filter-group' },
        createStatusCheckbox('active', t('status.active'), routinesStatusFilter, () => { saveDashboardSettings(); renderDashboard(container, onNavigate); }),
        createStatusCheckbox('on-hold', t('status.onHold'), routinesStatusFilter, () => { saveDashboardSettings(); renderDashboard(container, onNavigate); }),
        createStatusCheckbox('completed', t('status.completed'), routinesStatusFilter, () => { saveDashboardSettings(); renderDashboard(container, onNavigate); })
      ),
      el('div', { className: 'sort-control', style: 'display: flex; align-items: center; gap: 4px;' },
        el('select', {
          className: 'form-input sort-select',
          style: 'max-width: 130px; padding: 4px 8px; font-size: 0.78rem;',
          onChange: (e) => {
            routinesSort = e.target.value;
            if (['priority', 'frequency'].includes(routinesSort)) {
              routinesSortOrder = 'desc';
            } else {
              routinesSortOrder = 'asc';
            }
            saveDashboardSettings();
            renderDashboard(container, onNavigate);
          }
        },
          el('option', { value: 'name', selected: routinesSort === 'name' }, t('area.sortName')),
          el('option', { value: 'area', selected: routinesSort === 'area' }, t('dashboard.sortArea')),
          el('option', { value: 'priority', selected: routinesSort === 'priority' }, t('area.sortPriority')),
          el('option', { value: 'frequency', selected: routinesSort === 'frequency' }, t('dashboard.sortFrequency'))
        ),
        el('button', {
          className: 'btn btn-ghost btn-sm',
          style: 'padding: 6px 8px; height: 30px; display: flex; align-items: center;',
          title: routinesSortOrder === 'asc' ? '昇順' : '降順',
          onClick: (e) => {
            e.stopPropagation();
            routinesSortOrder = routinesSortOrder === 'asc' ? 'desc' : 'asc';
            saveDashboardSettings();
            renderDashboard(container, onNavigate);
          }
        },
          el('i', { 'data-lucide': routinesSortOrder === 'asc' ? 'arrow-up' : 'arrow-down', style: 'width: 14px; height: 14px;' })
        )
      )
    )
  );
  routinesCol.appendChild(routinesHeader);
  
  if (sortedRoutines.length === 0) {
    routinesCol.appendChild(
      el('div', { className: 'empty-state small' },
        el('p', {}, t('dashboard.noRoutines'))
      )
    );
  } else {
    const list = el('div', { className: 'compact-list routines-list' });
    // 見出し（インデックス）行の追加
    const listHeader = el('div', { className: 'compact-list-header' },
      el('span', { className: 'header-col-title' }, t('dashboard.colGoalArea')),
      el('span', { className: 'header-col-freq' }, t('dashboard.colFrequency')),
      el('span', { className: 'header-col-start' }, t('common.startDate')),
      el('span', { className: 'header-col-end' }, t('common.endDate')),
      el('span', { className: 'header-col-routine' }, t('routine.today')),
      el('span', { className: 'header-col-status' }, t('dashboard.colStatus')),
      el('span', { className: 'header-col-priority' }, t('dashboard.colPriority')),
      el('span', { className: 'header-col-actions' }, '')
    );
    list.appendChild(listHeader);

    sortedRoutines.forEach(goal => {
      const area = getAreaById(goal.areaId);
      const areaName = area ? area.name : t('common.unknown');
      const areaColor = area ? area.color : '#6366F1';
      
      const freqText = formatRoutineFrequency(goal);
      const completedToday = isRoutineCompletedOn(goal);

      const statusConf = STATUS_CONFIG[goal.status] || STATUS_CONFIG.active;
      const statusSelect = el('select', {
        className: `status-badge status-${goal.status} inline-edit-select`,
        style: `color: ${statusConf.color}; border-color: ${statusConf.color}; justify-self: start; background: transparent; cursor: pointer; border-radius: 20px; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center;`,
        onChange: (e) => {
          e.stopPropagation();
          const nextStatus = e.target.value;
          updateGoal(goal.id, { status: nextStatus });
          renderDashboard(container, onNavigate);
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'active', selected: goal.status === 'active' }, t('status.active')),
        el('option', { value: 'on-hold', selected: goal.status === 'on-hold' }, t('status.onHold')),
        el('option', { value: 'completed', selected: goal.status === 'completed' }, t('status.completed'))
      );

      const priorityConf = PRIORITY_CONFIG[goal.priority] || PRIORITY_CONFIG.medium;
      const prioritySelect = el('select', {
        className: `priority-badge priority-${goal.priority} inline-edit-select`,
        style: `color: ${priorityConf.color}; border-color: ${priorityConf.color}; justify-self: start; background: transparent; cursor: pointer; border-radius: 20px; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center;`,
        onChange: (e) => {
          e.stopPropagation();
          updateGoal(goal.id, { priority: e.target.value });
          renderDashboard(container, onNavigate);
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'high', selected: goal.priority === 'high' }, t('priority.high')),
        el('option', { value: 'medium', selected: goal.priority === 'medium' }, t('priority.medium')),
        el('option', { value: 'low', selected: goal.priority === 'low' }, t('priority.low'))
      );

      const frequencySelect = el('select', {
        className: 'compact-item-frequency inline-edit-select',
        style: 'background: transparent; color: var(--text-secondary); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 2px 6px; font-size: 0.68rem; cursor: pointer; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center; width: 100px; justify-self: start;',
        onChange: (e) => {
          e.stopPropagation();
          const val = e.target.value;
          if (val === 'custom') {
            const customVal = prompt(t('dashboard.customFrequencyPrompt'), goal.frequencyCustom || '');
            if (customVal !== null) {
              updateGoal(goal.id, { frequency: 'custom', frequencyCustom: customVal });
            }
          } else {
            updateGoal(goal.id, {
              frequency: val,
              frequencyCustom: null,
              frequencyWeekdays: val === 'monthly' ? [] : (goal.frequencyWeekdays || [])
            });
          }
          renderDashboard(container, onNavigate);
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'daily', selected: goal.frequency === 'daily' }, t('frequency.daily')),
        el('option', { value: 'weekly', selected: goal.frequency === 'weekly' }, t('frequency.weekly')),
        el('option', { value: 'biweekly', selected: goal.frequency === 'biweekly' }, t('frequency.biweekly')),
        el('option', { value: 'monthly', selected: goal.frequency === 'monthly' }, t('frequency.monthly')),
        el('option', { value: 'custom', selected: goal.frequency === 'custom' }, freqText || t('frequency.custom'))
      );

      const item = el('div', {
        className: 'dashboard-compact-item',
        onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, () => renderDashboard(container, onNavigate))
      },
        el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
        el('div', { className: 'compact-item-info' },
          el('span', { className: 'compact-item-title' }, goal.title),
          el('span', { className: 'compact-item-meta' }, areaName)
        ),
        frequencySelect,
        createInlineDateEditor(goal, 'startDate', () => renderDashboard(container, onNavigate)),
        createInlineDateEditor(goal, 'completedDate', () => renderDashboard(container, onNavigate)),
        el('button', {
          type: 'button',
          className: `routine-check-btn compact${completedToday ? ' completed' : ''}`,
          title: completedToday ? t('routine.doneToday') : t('routine.markDone'),
          onClick: (event) => {
            event.stopPropagation();
            toggleRoutineCompletion(goal.id);
            renderDashboard(container, onNavigate);
          }
        },
          el('i', { 'data-lucide': completedToday ? 'check-circle-2' : 'circle' })
        ),
        statusSelect,
        prioritySelect,
        createDeleteGoalButton(goal, () => renderDashboard(container, onNavigate))
      );
      const wrapper = el('div', { className: 'dashboard-compact-item-wrapper' }, item);
      list.appendChild(wrapper);
    });
    routinesCol.appendChild(list);
  }

  const sortedProjects = sortProjects(activeProjects, projectsSort, projectsSortOrder, getAreaById, getSubtaskProgress);

  // Projects 行
  const projectsCol = el('div', { className: 'glass-card active-col' });
  const projectsHeader = el('div', { className: 'card-header-flex', style: 'display: flex; justify-content: flex-start; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 12px;' },
    el('h2', { className: 'card-title', style: 'margin-bottom: 0; margin-right: 12px;' },
      el('i', { 'data-lucide': 'rocket' }),
      el('span', {}, ` ${t('cat.projects')}`)
    ),
    el('div', { className: 'header-controls', style: 'display: flex; align-items: center; gap: 10px; flex-wrap: wrap;' },
      el('div', { className: 'status-filter-group' },
        createStatusCheckbox('active', t('status.active'), projectsStatusFilter, () => { saveDashboardSettings(); renderDashboard(container, onNavigate); }),
        createStatusCheckbox('on-hold', t('status.onHold'), projectsStatusFilter, () => { saveDashboardSettings(); renderDashboard(container, onNavigate); }),
        createStatusCheckbox('completed', t('status.completed'), projectsStatusFilter, () => { saveDashboardSettings(); renderDashboard(container, onNavigate); })
      ),
      el('div', { className: 'sort-control', style: 'display: flex; align-items: center; gap: 4px;' },
        el('select', {
          className: 'form-input sort-select',
          style: 'max-width: 130px; padding: 4px 8px; font-size: 0.78rem;',
          onChange: (e) => {
            projectsSort = e.target.value;
            if (['priority', 'progress'].includes(projectsSort)) {
              projectsSortOrder = 'desc';
            } else {
              projectsSortOrder = 'asc';
            }
            saveDashboardSettings();
            renderDashboard(container, onNavigate);
          }
        },
          el('option', { value: 'dueDate', selected: projectsSort === 'dueDate' }, t('area.sortDueDate')),
          el('option', { value: 'name', selected: projectsSort === 'name' }, t('area.sortName')),
          el('option', { value: 'area', selected: projectsSort === 'area' }, t('dashboard.sortArea')),
          el('option', { value: 'progress', selected: projectsSort === 'progress' }, t('dashboard.sortProgress')),
          el('option', { value: 'priority', selected: projectsSort === 'priority' }, t('area.sortPriority'))
        ),
        el('button', {
          className: 'btn btn-ghost btn-sm',
          style: 'padding: 6px 8px; height: 30px; display: flex; align-items: center;',
          title: projectsSortOrder === 'asc' ? '昇順' : '降順',
          onClick: (e) => {
            e.stopPropagation();
            projectsSortOrder = projectsSortOrder === 'asc' ? 'desc' : 'asc';
            saveDashboardSettings();
            renderDashboard(container, onNavigate);
          }
        },
          el('i', { 'data-lucide': projectsSortOrder === 'asc' ? 'arrow-up' : 'arrow-down', style: 'width: 14px; height: 14px;' })
        )
      )
    )
  );
  projectsCol.appendChild(projectsHeader);

  if (sortedProjects.length === 0) {
    projectsCol.appendChild(
      el('div', { className: 'empty-state small' },
        el('p', {}, t('dashboard.noProjects'))
      )
    );
  } else {
    const list = el('div', { className: 'compact-list projects-list' });
    // 見出し（インデックス）行の追加
    const listHeader = el('div', { className: 'compact-list-header' },
      el('span', { className: 'header-col-title' }, t('dashboard.colGoalArea')),
      el('span', { className: 'header-col-start' }, t('common.startDate')),
      el('span', { className: 'header-col-end' }, t('common.completedDate')),
      el('span', { className: 'header-col-due' }, t('dashboard.colDueDate')),
      el('span', { className: 'header-col-progress' }, t('dashboard.colProgress')),
      el('span', { className: 'header-col-status' }, t('dashboard.colStatus')),
      el('span', { className: 'header-col-priority' }, t('dashboard.colPriority')),
      el('span', { className: 'header-col-actions' }, '')
    );
    list.appendChild(listHeader);

    sortedProjects.forEach(goal => {
      const area = getAreaById(goal.areaId);
      const areaName = area ? area.name : t('common.unknown');
      const areaColor = area ? area.color : '#6366F1';
      
      const progress = getSubtaskProgress(goal.subtasks);
      const progressEl = progress 
        ? el('div', { className: 'compact-item-progress' },
            el('div', { className: 'subtask-progress-bar' },
              el('div', { className: 'subtask-progress-fill', style: `width: ${progress.percent}%` })
            ),
            el('span', { className: 'compact-progress-text' }, `${progress.percent}%`)
          )
        : el('span', {});

      const dueInput = createInlineDateEditor(goal, 'dueDate', () => renderDashboard(container, onNavigate));

      const statusConf = STATUS_CONFIG[goal.status] || STATUS_CONFIG.active;
      const statusSelect = el('select', {
        className: `status-badge status-${goal.status} inline-edit-select`,
        style: `color: ${statusConf.color}; border-color: ${statusConf.color}; justify-self: start; background: transparent; cursor: pointer; border-radius: 20px; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center;`,
        onChange: (e) => {
          e.stopPropagation();
          const nextStatus = e.target.value;
          if (nextStatus === 'completed' && !goal.completedDate) {
            const completedDate = requestCompletedDate(goal.completedDate);
            if (completedDate === undefined || completedDate === null) {
              e.target.value = goal.status;
              return;
            }
            updateGoal(goal.id, { status: nextStatus, completedDate });
          } else if (nextStatus !== 'completed' && goal.completedDate) {
            updateGoal(goal.id, { status: nextStatus, completedDate: null });
          } else {
            updateGoal(goal.id, { status: nextStatus });
          }
          renderDashboard(container, onNavigate);
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'active', selected: goal.status === 'active' }, t('status.active')),
        el('option', { value: 'on-hold', selected: goal.status === 'on-hold' }, t('status.onHold')),
        el('option', { value: 'completed', selected: goal.status === 'completed' }, t('status.completed'))
      );

      const priorityConf = PRIORITY_CONFIG[goal.priority] || PRIORITY_CONFIG.medium;
      const prioritySelect = el('select', {
        className: `priority-badge priority-${goal.priority} inline-edit-select`,
        style: `color: ${priorityConf.color}; border-color: ${priorityConf.color}; justify-self: start; background: transparent; cursor: pointer; border-radius: 20px; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center;`,
        onChange: (e) => {
          e.stopPropagation();
          updateGoal(goal.id, { priority: e.target.value });
          renderDashboard(container, onNavigate);
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'high', selected: goal.priority === 'high' }, t('priority.high')),
        el('option', { value: 'medium', selected: goal.priority === 'medium' }, t('priority.medium')),
        el('option', { value: 'low', selected: goal.priority === 'low' }, t('priority.low'))
      );

      const item = el('div', {
        className: 'dashboard-compact-item',
        onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, () => renderDashboard(container, onNavigate))
      },
        el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
        el('div', { className: 'compact-item-info' },
          el('span', { className: 'compact-item-title' }, goal.title),
          el('span', { className: 'compact-item-meta' }, areaName)
        ),
        createInlineDateEditor(goal, 'startDate', () => renderDashboard(container, onNavigate)),
        createInlineDateEditor(goal, 'completedDate', () => renderDashboard(container, onNavigate)),
        dueInput,
        progressEl,
        statusSelect,
        prioritySelect,
        createDeleteGoalButton(goal, () => renderDashboard(container, onNavigate))
      );
      const subtaskList = createDashboardSubtaskList(goal, () => renderDashboard(container, onNavigate));
      const wrapper = el('div', { className: 'dashboard-compact-item-wrapper' }, item);
      if (subtaskList) {
        wrapper.appendChild(subtaskList);
      }
      list.appendChild(wrapper);
    });
    projectsCol.appendChild(list);
  }



  // 期限間近セクション（あれば表示）
  let dueSection = null;
  if (dueSoon.length > 0) {
    dueSection = el('div', { className: 'glass-card due-soon-section' },
      el('h2', { className: 'card-title due-soon-title' },
        el('i', { 'data-lucide': 'alert-triangle' }),
        el('span', {}, ` ${t('dashboard.dueSoon')}`)
      )
    );

    const dueList = el('div', { className: 'due-soon-list' });
    dueSoon.forEach(goal => {
      const area = getAreaById(goal.areaId);
      const areaName = area ? area.name : t('common.unknown');
      const areaColor = area ? area.color : '#6366F1';

      let dueLabel = '';
      let dueClass = 'due-badge';
      if (goal.daysLeft < 0) {
        dueLabel = t('dashboard.overdue');
        dueClass += ' due-overdue';
      } else if (goal.daysLeft === 0) {
        dueLabel = t('dashboard.dueToday');
        dueClass += ' due-today';
      } else {
        dueLabel = t('dashboard.daysLeft', goal.daysLeft);
        dueClass += ' due-soon';
      }

      const item = el('div', {
        className: 'due-soon-item',
        onClick: () => onNavigate(area ? `area-${area.id}` : 'dashboard')
      },
        el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
        el('div', { className: 'recent-goal-info' },
          el('span', { className: 'recent-goal-title' }, goal.title),
          el('span', { className: 'recent-goal-meta' }, `${areaName} · ${formatDate(goal.dueDate)}`)
        ),
        el('div', { className: dueClass }, dueLabel)
      );
      dueList.appendChild(item);
    });
    dueSection.appendChild(dueList);
  }

  let staleSection = null;
  if (staleGoals.length > 0) {
    staleSection = el('div', { className: 'glass-card recent-section' },
      el('h2', { className: 'card-title' },
        el('i', { 'data-lucide': 'clock-3' }),
        el('span', {}, ` ${staleTitle}`)
      )
    );

    const staleList = el('div', { className: 'recent-goals-list' });
    staleGoals.forEach(goal => {
      const area = getAreaById(goal.areaId);
      const areaName = area ? area.name : t('common.unknown');
      const areaColor = area ? area.color : '#6366F1';
      const daysSinceUpdate = Math.max(0, Math.floor((Date.now() - Date.parse(goal.updatedAt || goal.createdAt || Date.now())) / (24 * 60 * 60 * 1000)));

      staleList.appendChild(
        el('div', {
          className: 'recent-goal-item',
          onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, () => renderDashboard(container, onNavigate))
        },
          el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
          el('div', { className: 'recent-goal-info' },
            el('span', { className: 'recent-goal-title' }, goal.title),
            el('span', { className: 'recent-goal-meta' }, `${areaName} · ${updatedDaysLabel(daysSinceUpdate)}`)
          ),
          el('div', { className: 'due-badge due-soon' }, updatedDaysLabel(daysSinceUpdate))
        )
      );
    });
    staleSection.appendChild(staleList);
  }

  // ステータス分布
  const statusSection = el('div', { className: 'glass-card' },
    el('h2', { className: 'card-title' }, t('dashboard.byStatus')),
    createBarChart(stats.byStatus, STATUS_CONFIG)
  );

  // 優先度分布
  const prioritySection = el('div', { className: 'glass-card' },
    el('h2', { className: 'card-title' }, t('dashboard.byPriority')),
    createBarChart(stats.byPriority, PRIORITY_CONFIG)
  );

  // 最近の目標
  const recentSection = el('div', { className: 'glass-card recent-section' },
    el('h2', { className: 'card-title' }, t('dashboard.recent'))
  );

  if (stats.recentGoals.length === 0) {
    recentSection.appendChild(
      el('div', { className: 'empty-state' },
        el('i', { 'data-lucide': 'plus-circle' }),
        el('p', {}, t('dashboard.noGoals')),
        el('p', { className: 'empty-state-sub' }, t('dashboard.noGoalsSub'))
      )
    );
  } else {
    const list = el('div', { className: 'recent-goals-list' });
    for (const goal of stats.recentGoals) {
      const area = getAreaById(goal.areaId);
      const areaName = area ? area.name : t('common.unknown');
      const areaColor = area ? area.color : '#6366F1';

      const item = el('div', {
        className: 'recent-goal-item',
        onClick: () => onNavigate(area ? `area-${area.id}` : 'dashboard')
      },
        el('div', { className: 'recent-goal-area-dot', style: `background: ${areaColor}` }),
        el('div', { className: 'recent-goal-info' },
          el('span', { className: 'recent-goal-title' }, goal.title),
          el('span', { className: 'recent-goal-meta' },
            `${areaName} · ${formatDate(goal.updatedAt)}${goal.archived ? ` · ${t('dashboard.archived')}` : ''}`)
        ),
        el('div', {
          className: `priority-badge priority-${goal.priority}`,
          style: `color: ${PRIORITY_CONFIG[goal.priority]?.color || '#FBBF24'}; border-color: ${PRIORITY_CONFIG[goal.priority]?.color || '#FBBF24'}`
        }, t(PRIORITY_CONFIG[goal.priority]?.labelKey || 'priority.medium'))
      );
      list.appendChild(item);
    }
    recentSection.appendChild(list);
  }

  // --- レイアウト適用 ---
  const widgetMap = {
    areas: areasCol,
    routines: routinesCol,
    projects: projectsCol,
    due_soon: dueSection,
    stale: staleSection,
    status: statusSection,
    priority: prioritySection,
    recent: recentSection
  };

  const layout = getDashboardLayout();
  layout.forEach(id => {
    const w = widgetMap[id];
    if (w) {
      w.dataset.widgetId = id;
      makeDraggable(w, gridContainer);
      gridContainer.appendChild(w);
    }
  });

  container.appendChild(gridContainer);

  if (window.lucide) window.lucide.createIcons();
}

function createBarChart(data, config) {
  const total = Object.values(data).reduce((s, v) => s + v, 0) || 1;
  const chart = el('div', { className: 'bar-chart' });

  for (const [key, value] of Object.entries(data)) {
    const conf = config[key];
    if (!conf) continue;
    const pct = Math.round((value / total) * 100);
    const row = el('div', { className: 'bar-chart-row' },
      el('div', { className: 'bar-chart-label' },
        el('span', { className: 'bar-chart-dot', style: `background: ${conf.color}` }),
        el('span', {}, t(conf.labelKey))
      ),
      el('div', { className: 'bar-chart-track' },
        el('div', { className: 'bar-chart-fill', style: `width: ${pct}%; background: ${conf.color}` })
      ),
      el('span', { className: 'bar-chart-count' }, String(value))
    );
    chart.appendChild(row);
  }
  return chart;
}

function createDashboardSubtaskList(goal, onRefresh) {
  if (!goal.subtasks || goal.subtasks.length === 0) return null;

  const stList = el('div', {
    className: 'subtask-list',
    style: 'padding: 4px 12px 10px 48px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid rgba(255, 255, 255, 0.02);'
  });

  goal.subtasks.forEach(st => {
    const stItem = el('div', {
      className: `subtask-item${st.completed ? ' completed' : ''}`,
      style: 'display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 2px 0;',
      onClick: (e) => {
        e.stopPropagation();
        toggleSubtask(goal.id, st.id);
        onRefresh();
      }
    },
      el('div', { className: `subtask-check${st.completed ? ' checked' : ''}` },
        st.completed ? el('i', { 'data-lucide': 'check' }) : null
      ),
      el('span', { className: 'subtask-text', style: 'font-size: 0.76rem; color: var(--text-secondary);' }, st.text)
    );
    stList.appendChild(stItem);
  });

  return stList;
}

function initDragAndDrop(gridContainer) {
  gridContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    
    const target = e.target.closest('.dashboard-widget');
    if (target && target !== dragging) {
      const box = target.getBoundingClientRect();
      const offset = (e.clientX - box.left) / box.width + (e.clientY - box.top) / box.height;
      // If we are hovering over the top-left portion, insert before, else insert after
      if (offset < 1) {
        gridContainer.insertBefore(dragging, target);
      } else {
        gridContainer.insertBefore(dragging, target.nextSibling);
      }
    }
  });
}

function updateDragAutoScroll() {
  if (!activeWidgetDrag) return;

  const pointerY = activeWidgetDrag.pointerY;
  if (typeof pointerY !== 'number') {
    activeWidgetDrag.scrollFrame = requestAnimationFrame(updateDragAutoScroll);
    return;
  }

  const scrollContainer = document.getElementById('main-content');
  if (!scrollContainer) {
    activeWidgetDrag.scrollFrame = requestAnimationFrame(updateDragAutoScroll);
    return;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  let scrollDelta = 0;

  if (pointerY < containerRect.top + DRAG_SCROLL_EDGE_PX) {
    const ratio = ((containerRect.top + DRAG_SCROLL_EDGE_PX) - pointerY) / DRAG_SCROLL_EDGE_PX;
    scrollDelta = -Math.max(4, Math.round(DRAG_SCROLL_MAX_STEP * ratio));
  } else if (pointerY > containerRect.bottom - DRAG_SCROLL_EDGE_PX) {
    const ratio = (pointerY - (containerRect.bottom - DRAG_SCROLL_EDGE_PX)) / DRAG_SCROLL_EDGE_PX;
    scrollDelta = Math.max(4, Math.round(DRAG_SCROLL_MAX_STEP * ratio));
  }

  if (scrollDelta !== 0) {
    scrollContainer.scrollBy(0, scrollDelta);
  }

  activeWidgetDrag.scrollFrame = requestAnimationFrame(updateDragAutoScroll);
}

function makeDraggable(widgetEl, container) {
  widgetEl.classList.add('dashboard-widget');
  
  // Prevent children from intercepting drag events
  const dragHandle = el('div', { className: 'widget-drag-handle', title: 'Drag to reorder' },
    el('i', { 'data-lucide': 'grip-horizontal', style: 'pointer-events: none;' })
  );
  
  // Find a DIRECT header if possible
  let header = [...widgetEl.children].find(c => 
    c.classList.contains('card-header-flex') || 
    c.classList.contains('card-title') || 
    c.tagName === 'H2'
  );
  
  if (header) {
    if (header.classList.contains('card-header-flex')) {
      header.appendChild(dragHandle);
    } else {
      const wrapper = el('div', { style: 'display: flex; align-items: center; margin-bottom: 12px; width: 100%;' });
      widgetEl.insertBefore(wrapper, header);
      header.style.marginBottom = '0'; // override
      wrapper.appendChild(header);
      wrapper.appendChild(dragHandle);
    }
  } else {
    // If no clear header (like summaryGrid), just prepend it safely
    const wrapper = el('div', { style: 'display: flex; align-items: center; margin-bottom: 8px; width: 100%;' });
    widgetEl.insertBefore(wrapper, widgetEl.firstChild);
    wrapper.appendChild(dragHandle);
  }

  const finishDrag = () => {
    if (!activeWidgetDrag || activeWidgetDrag.widget !== widgetEl) return;

    widgetEl.classList.remove('dragging');
    widgetEl.style.opacity = '1';
    widgetEl.style.pointerEvents = '';

    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (activeWidgetDrag.scrollFrame) {
      cancelAnimationFrame(activeWidgetDrag.scrollFrame);
    }

    const newLayout = Array.from(container.children)
      .map(child => child.dataset.widgetId)
      .filter(id => id);

    activeWidgetDrag = null;
    saveDashboardLayout(newLayout);
  };

  const onMouseMove = (e) => {
    if (!activeWidgetDrag || activeWidgetDrag.widget !== widgetEl) return;
    activeWidgetDrag.pointerY = e.clientY;

    const underPointer = document.elementFromPoint(e.clientX, e.clientY);
    const target = underPointer?.closest('.dashboard-widget');
    if (!target || target === widgetEl) return;

    const rect = target.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const insertBefore = relY < 0.5 || (Math.abs(relY - 0.5) < 0.2 && relX < 0.5);

    if (insertBefore) {
      container.insertBefore(widgetEl, target);
    } else {
      container.insertBefore(widgetEl, target.nextSibling);
    }
  };

  const onMouseUp = () => finishDrag();

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (activeWidgetDrag) return;

    activeWidgetDrag = {
      widget: widgetEl,
      pointerY: e.clientY,
      scrollFrame: requestAnimationFrame(updateDragAutoScroll)
    };
    widgetEl.classList.add('dragging');
    widgetEl.style.opacity = '0.5';
    widgetEl.style.pointerEvents = 'none';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  dragHandle.addEventListener('mouseup', (e) => {
    e.preventDefault();
  });
}
