// ==========================================
// Orbit v3.1 - Area別ページコンポーネント
// ==========================================

import { el, clearElement, STATUS_CONFIG, PRIORITY_CONFIG, FREQUENCY_CONFIG, formatDate, formatRoutineFrequency, getDaysUntilDue, getSubtaskProgress, CATEGORY_CONFIG, normalizeDateInput } from '../utils.js';
import { t } from '../i18n.js';
import { getAreaById, getGoalsByAreaAndCategory, deleteGoal, archiveGoal, toggleSubtask, deleteArea, updateGoal, isRoutineCompletedOn, toggleRoutineCompletion } from '../store.js';
import { openGoalModal } from './goal-modal.js?v=20260714-8';
import { openAreaModal } from './area-modal.js';

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

function createGoalDateSummary(goal) {
  if (!goal.startDate && !goal.completedDate) return null;

  return el('div', {
    className: 'goal-card-date-range',
    style: 'display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; font-size: 0.74rem; color: var(--text-secondary);'
  },
    el('span', { className: 'goal-card-date' },
      el('i', { 'data-lucide': 'calendar' }),
      el('span', {}, `${t('common.start')}: ${goal.startDate ? formatDate(goal.startDate) : '-'}`)
    ),
    el('span', { className: 'goal-card-date' },
      el('i', { 'data-lucide': 'calendar-check-2' }),
      el('span', {}, `${t(goal.category === 'routines' ? 'common.end' : 'common.completed')}: ${goal.completedDate ? formatDate(goal.completedDate) : '-'}`)
    )
  );
}

export function renderAreaPage(container, areaId, onNavigate, onRefresh) {
  clearElement(container);

  const area = getAreaById(areaId);
  if (!area) {
    onNavigate('dashboard');
    return;
  }

  const savedSettingsRaw = localStorage.getItem(`orbit_area_settings_${areaId}`);
  let savedSettings = {};
  try {
    if (savedSettingsRaw) savedSettings = JSON.parse(savedSettingsRaw);
  } catch (e) {
    console.error('Error parsing area settings', e);
  }

  let currentTab = savedSettings.currentTab || 'routines';
  let currentFilter = savedSettings.currentFilter || 'all';
  let currentSort = savedSettings.currentSort || (currentTab === 'projects' ? 'dueDate' : 'updated');

  function saveAreaSettings() {
    try {
      localStorage.setItem(`orbit_area_settings_${areaId}`, JSON.stringify({ currentTab, currentFilter, currentSort }));
    } catch (e) {
      console.error('Error saving area settings', e);
    }
  }

  const headerContainer = el('div', { className: 'page-header' });
  container.appendChild(headerContainer);

  function renderHeader() {
    clearElement(headerContainer);

    const titleArea = el('div', {},
      el('h1', { className: 'page-title', style: `color: ${area.color}` },
        el('i', { 'data-lucide': area.icon || 'star' }),
        el('span', {}, ` ${area.name}`)
      ),
      el('p', { className: 'page-subtitle' }, area.description || '')
    );

    const actionArea = el('div', { className: 'page-header-actions' },
      el('button', {
        className: 'btn btn-ghost btn-sm',
        onClick: () => {
          openAreaModal(area.id, () => {
            renderHeader();
            onRefresh();
          });
        }
      },
        el('i', { 'data-lucide': 'edit' }),
        el('span', {}, t('area.editArea'))
      ),
      el('button', {
        className: 'btn btn-ghost btn-sm btn-danger',
        onClick: () => {
          if (confirm(t('area.confirmDeleteArea', area.name))) {
            deleteArea(area.id);
            onRefresh();
            onNavigate('dashboard');
          }
        }
      },
        el('i', { 'data-lucide': 'trash-2' }),
        el('span', {}, t('area.deleteArea'))
      ),
      el('button', {
        className: 'btn btn-primary',
        onClick: () => {
          openGoalModal(null, { areaId: area.id, category: currentTab }, () => {
            renderTabContent();
          });
        }
      },
        el('i', { 'data-lucide': 'plus' }),
        el('span', {}, t('area.addGoal'))
      )
    );

    headerContainer.appendChild(titleArea);
    headerContainer.appendChild(actionArea);
    if (window.lucide) window.lucide.createIcons();
  }

  renderHeader();

  // タブナビゲーション
  const tabNav = el('div', { className: 'area-tabs' });
  Object.keys(CATEGORY_CONFIG).forEach(catKey => {
    const cat = CATEGORY_CONFIG[catKey];
    const tabBtn = el('button', {
      className: `area-tab-btn${currentTab === catKey ? ' active' : ''}`,
      onClick: () => {
        currentTab = catKey;
        currentFilter = 'all';
        currentSort = catKey === 'projects' ? 'dueDate' : 'updated';
        saveAreaSettings();
        
        tabNav.querySelectorAll('.area-tab-btn').forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
        
        renderTabContent();
      }
    },
      el('i', { 'data-lucide': cat.icon }),
      el('span', {}, t(cat.labelKey))
    );
    tabNav.appendChild(tabBtn);
  });
  container.appendChild(tabNav);

  // フィルター・ソートバー
  const filterBar = el('div', { className: 'filter-bar' });
  container.appendChild(filterBar);

  // コンテンツ表示エリア
  const contentArea = el('div');
  container.appendChild(contentArea);

  function renderFilterBar() {
    clearElement(filterBar);

    // フィルターグループ
    const filterGroup = el('div', { className: 'filter-group' },
      el('span', { className: 'filter-label' }, t('area.filter'))
    );

    const filters = [
      { value: 'all', labelKey: 'area.all' },
      { value: 'active', labelKey: 'status.active' },
      { value: 'on-hold', labelKey: 'status.onHold' },
      { value: 'completed', labelKey: 'status.completed' },
    ];

    filters.forEach(f => {
      const btn = el('button', {
        className: `filter-chip${currentFilter === f.value ? ' active' : ''}`,
        onClick: () => {
          currentFilter = f.value;
          saveAreaSettings();
          renderTabContent();
        }
      }, t(f.labelKey));
      filterGroup.appendChild(btn);
    });
    filterBar.appendChild(filterGroup);

    // ソートセレクト
    const sortSelect = el('select', {
      className: 'form-input sort-select',
      onChange: (e) => {
        currentSort = e.target.value;
        saveAreaSettings();
        renderTabContent();
      }
    });

    const sortOptions = [
      { value: 'updated', labelKey: 'area.sortUpdated' },
      { value: 'created', labelKey: 'area.sortCreated' },
      { value: 'priority', labelKey: 'area.sortPriority' },
      { value: 'title', labelKey: 'area.sortName' },
    ];
    if (currentTab === 'projects') {
      sortOptions.unshift({ value: 'dueDate', labelKey: 'area.sortDueDate' });
    }

    sortOptions.forEach(s => {
      const opt = el('option', { value: s.value }, t(s.labelKey));
      if (s.value === currentSort) opt.selected = true;
      sortSelect.appendChild(opt);
    });

    // レイアウトトグルボタン
    const currentLayout = localStorage.getItem('orbit_view_layout') || 'grid';
    const layoutGroup = el('div', { className: 'layout-toggle-group' });
    
    const gridBtn = el('button', {
      className: `layout-btn${currentLayout === 'grid' ? ' active' : ''}`,
      onClick: () => {
        if (currentLayout !== 'grid') {
          localStorage.setItem('orbit_view_layout', 'grid');
          renderTabContent();
        }
      }
    }, el('i', { 'data-lucide': 'layout-grid' }), el('span', {}, t('area.viewGrid')));

    const listBtn = el('button', {
      className: `layout-btn${currentLayout === 'list' ? ' active' : ''}`,
      onClick: () => {
        if (currentLayout !== 'list') {
          localStorage.setItem('orbit_view_layout', 'list');
          renderTabContent();
        }
      }
    }, el('i', { 'data-lucide': 'list' }), el('span', {}, t('area.viewList')));

    layoutGroup.appendChild(gridBtn);
    layoutGroup.appendChild(listBtn);

    const rightControls = el('div', { className: 'filter-right-controls', style: 'display: flex; gap: 12px; align-items: center;' },
      sortSelect,
      layoutGroup
    );
    filterBar.appendChild(rightControls);
  }

  function renderTabContent() {
    renderFilterBar();
    clearElement(contentArea);

    const currentLayout = localStorage.getItem('orbit_view_layout') || 'grid';
    contentArea.className = currentLayout === 'grid' ? 'goals-grid' : 'goals-list-view';

    const goals = getGoalsByAreaAndCategory(area.id, currentTab, true);
    let filtered = [...goals];

    if (currentFilter !== 'all') {
      filtered = filtered.filter(g => g.status === currentFilter);
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    filtered.sort((a, b) => {
      switch (currentSort) {
        case 'updated': return new Date(b.updatedAt) - new Date(a.updatedAt);
        case 'created': return new Date(b.createdAt) - new Date(a.createdAt);
        case 'priority': return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'title': return a.title.localeCompare(b.title, 'ja');
        case 'dueDate': {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        default: return 0;
      }
    });

    if (filtered.length === 0) {
      contentArea.appendChild(
        el('div', { className: 'empty-state' },
          el('i', { 'data-lucide': 'target' }),
          el('p', {}, currentFilter === 'all' ? t('area.noGoals') : t('area.noGoalsFiltered')),
          el('p', { className: 'empty-state-sub' }, t('area.noGoalsSub'))
        )
      );
    } else {
      filtered.forEach((goal, index) => {
        const card = createGoalCard(goal, area, index, () => renderTabContent());
        contentArea.appendChild(card);
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderTabContent();
}

function createGoalCard(goal, area, index, onRefresh) {
  const statusConf = STATUS_CONFIG[goal.status] || { labelKey: 'status.active', color: '#22D3EE' };
  const priorityConf = PRIORITY_CONFIG[goal.priority] || { labelKey: 'priority.medium', color: '#FBBF24' };

  const currentLayout = localStorage.getItem('orbit_view_layout') || 'grid';
  const card = el('div', {
    className: `goal-card layout-${currentLayout}`,
    style: `animation-delay: ${index * 0.05}s; cursor: pointer;`,
    onClick: () => openGoalModal(goal.id, { areaId: area.id, category: goal.category }, onRefresh)
  });
  card.style.setProperty('--area-color', area.color || '#6366F1');

  // ステータス表示・編集要素の分岐
  const statusElement = currentLayout === 'list'
    ? el('select', {
        className: `status-badge status-${goal.status} inline-edit-select`,
        style: `color: ${statusConf.color}; border-color: ${statusConf.color}; justify-self: start; background: transparent; cursor: pointer; border-radius: 20px; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center;`,
        onChange: (e) => {
          e.stopPropagation();
          const nextStatus = e.target.value;
          if (goal.category === 'routines') {
            updateGoal(goal.id, { status: nextStatus });
          } else if (nextStatus === 'completed' && !goal.completedDate) {
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
          onRefresh();
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'active', selected: goal.status === 'active' }, t('status.active')),
        el('option', { value: 'on-hold', selected: goal.status === 'on-hold' }, t('status.onHold')),
        el('option', { value: 'completed', selected: goal.status === 'completed' }, t('status.completed'))
      )
    : el('div', {
        className: `status-badge status-${goal.status}`,
        style: `color: ${statusConf.color}; border-color: ${statusConf.color}`
      }, t(statusConf.labelKey));

  // カードヘッダー
  const cardHeader = el('div', { className: 'goal-card-header' },
    statusElement,
    el('div', { className: 'goal-card-actions' },
      createActionBtn('trash-2', t('common.delete'), () => {
        if (confirm(t('area.confirmDelete', goal.title))) {
          deleteGoal(goal.id);
          onRefresh();
        }
      })
    )
  );
  card.appendChild(cardHeader);

  // タイトルと説明のラッパー
  const infoWrapper = el('div', { className: 'goal-card-info' },
    el('h3', { className: 'goal-card-title' }, goal.title),
    goal.description ? el('p', { className: 'goal-card-desc' }, goal.description) : null
  );
  card.appendChild(infoWrapper);

  // ダイナミックコンテンツラッパー
  const dynamicWrapper = el('div', { className: 'goal-card-dynamic' });
  const dateSummary = createGoalDateSummary(goal);
  if (dateSummary) {
    dynamicWrapper.appendChild(dateSummary);
  }

  // CategoryがProjectsの場合: 期限日バッジ/日付入力
  if (goal.category === 'projects') {
    if (currentLayout === 'list') {
      const dueInput = el('input', {
        type: 'date',
        value: goal.dueDate || '',
        className: 'inline-edit-date',
        style: 'background: transparent; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-secondary); font-size: 0.72rem; padding: 2px 4px; outline: none; width: 110px; cursor: pointer; font-family: inherit; color-scheme: dark; justify-self: start;',
        onChange: (e) => {
          updateGoal(goal.id, { dueDate: e.target.value || null });
          onRefresh();
        },
        onClick: (e) => e.stopPropagation()
      });
      dynamicWrapper.appendChild(
        el('div', { className: 'goal-card-due' }, dueInput)
      );
    } else if (goal.dueDate) {
      const daysLeft = getDaysUntilDue(goal.dueDate);
      let dueBadgeClass = 'due-badge';
      let dueText = '';
      if (daysLeft < 0) {
        dueBadgeClass += ' due-overdue';
        dueText = t('dashboard.overdue');
      } else if (daysLeft === 0) {
        dueBadgeClass += ' due-today';
        dueText = t('dashboard.dueToday');
      } else if (daysLeft <= 3) {
        dueBadgeClass += ' due-soon';
        dueText = t('dashboard.daysLeft', daysLeft);
      } else {
        dueText = t('dashboard.daysLeft', daysLeft);
      }

      dynamicWrapper.appendChild(
        el('div', { className: 'goal-card-due' },
          el('div', { className: dueBadgeClass },
            el('i', { 'data-lucide': 'calendar' }),
            el('span', {}, `${formatDate(goal.dueDate)} (${dueText})`)
          )
        )
      );
    }
  }

  // CategoryがProjectsの場合: サブタスク進捗
  if (goal.category === 'projects' && goal.subtasks && goal.subtasks.length > 0) {
    const progress = getSubtaskProgress(goal.subtasks);
    const subtaskSection = el('div', { className: 'goal-card-subtasks' });

    // 進捗バー
    const progressBar = el('div', { className: 'subtask-progress' },
      el('div', { className: 'subtask-progress-bar' },
        el('div', { className: 'subtask-progress-fill', style: `width: ${progress.percent}%` })
      ),
      el('span', { className: 'subtask-progress-text' }, t('subtasks.progress', progress.completed, progress.total))
    );
    subtaskSection.appendChild(progressBar);

    // サブタスクリスト
    const stList = el('div', { className: 'subtask-list' });
    goal.subtasks.forEach(st => {
      const stItem = el('div', {
        className: `subtask-item${st.completed ? ' completed' : ''}`,
        onClick: (e) => {
          e.stopPropagation();
          toggleSubtask(goal.id, st.id);
          onRefresh();
        }
      },
        el('div', { className: `subtask-check${st.completed ? ' checked' : ''}` },
          st.completed ? el('i', { 'data-lucide': 'check' }) : null
        ),
        el('span', { className: 'subtask-text' }, st.text)
      );
      stList.appendChild(stItem);
    });
    subtaskSection.appendChild(stList);
    card.appendChild(subtaskSection);
  }

  // CategoryがRoutinesの場合: 頻度バッジ/頻度入力
  if (goal.category === 'routines') {
    const freqConf = FREQUENCY_CONFIG[goal.frequency] || { labelKey: 'frequency.daily', color: '#F472B6' };
    const freqText = formatRoutineFrequency(goal);
    const completedToday = isRoutineCompletedOn(goal);

    if (currentLayout === 'list') {
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
          onRefresh();
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'daily', selected: goal.frequency === 'daily' }, t('frequency.daily')),
        el('option', { value: 'weekly', selected: goal.frequency === 'weekly' }, t('frequency.weekly')),
        el('option', { value: 'biweekly', selected: goal.frequency === 'biweekly' }, t('frequency.biweekly')),
        el('option', { value: 'monthly', selected: goal.frequency === 'monthly' }, t('frequency.monthly')),
        el('option', { value: 'custom', selected: goal.frequency === 'custom' }, freqText || t('frequency.custom'))
      );
      dynamicWrapper.appendChild(
        el('div', { className: 'goal-card-frequency' }, frequencySelect)
      );
    } else if (goal.frequency) {
      dynamicWrapper.appendChild(
        el('div', { className: 'goal-card-frequency' },
          el('div', { className: 'frequency-badge', style: `color: ${freqConf.color}; border-color: ${freqConf.color}` },
            el('i', { 'data-lucide': 'repeat' }),
            el('span', {}, freqText)
          )
        )
      );
    }

    dynamicWrapper.appendChild(
      el('div', { className: 'routine-progress-chip' },
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
      )
    );
  }

  card.appendChild(dynamicWrapper);

  // 優先度表示・編集要素の分岐
  const priorityElement = currentLayout === 'list'
    ? el('select', {
        className: `priority-badge priority-${goal.priority} inline-edit-select`,
        style: `color: ${priorityConf.color}; border-color: ${priorityConf.color}; justify-self: start; background: transparent; cursor: pointer; border-radius: 20px; outline: none; appearance: none; -webkit-appearance: none; text-align: center; text-align-last: center;`,
        onChange: (e) => {
          e.stopPropagation();
          updateGoal(goal.id, { priority: e.target.value });
          onRefresh();
        },
        onClick: (e) => e.stopPropagation()
      },
        el('option', { value: 'high', selected: goal.priority === 'high' }, t('priority.high')),
        el('option', { value: 'medium', selected: goal.priority === 'medium' }, t('priority.medium')),
        el('option', { value: 'low', selected: goal.priority === 'low' }, t('priority.low'))
      )
    : el('div', {
        className: `priority-badge priority-${goal.priority}`,
        style: `color: ${priorityConf.color}; border-color: ${priorityConf.color}`
      },
        el('i', { 'data-lucide': 'flag' }),
        el('span', {}, t(priorityConf.labelKey))
      );

  // メタ情報
  const meta = el('div', { className: 'goal-card-meta' },
    priorityElement,
    el('span', { className: 'goal-card-date' },
      el('i', { 'data-lucide': 'clock' }),
      el('span', {}, formatDate(goal.updatedAt))
    )
  );
  card.appendChild(meta);

  return card;
}

function createActionBtn(icon, title, onClick) {
  return el('button', {
    className: 'icon-btn',
    title,
    onClick: (e) => {
      e.stopPropagation();
      onClick(e);
    }
  },
    el('i', { 'data-lucide': icon })
  );
}
