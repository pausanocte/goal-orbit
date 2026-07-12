// ==========================================
// Orbit v3 - 目標モーダルコンポーネント
// ==========================================

import { el, STATUS_CONFIG, PRIORITY_CONFIG, FREQUENCY_CONFIG, CATEGORY_CONFIG, generateId, createDatePicker, registerEscapeClose } from '../utils.js';
import { t, formatYearMonthI18n } from '../i18n.js';
import { addGoal, updateGoal, getGoalById, getActiveAreas, canAddGoal, getReviewsByGoalId, getRoutineCompletionDates, toggleRoutineCompletion } from '../store.js';
import { openAreaModal } from './area-modal.js';
import { canCreateCalendarEvent, upsertGoalCalendarEvent } from '../services/calendar-api.js';

let modalOverlay = null;
let removeEscapeClose = null;

function createGoalReviewHistory(goal) {
  const reviews = getReviewsByGoalId(goal.id);
  const section = el('div', { className: 'form-field goal-review-history' },
    el('label', { className: 'form-label' }, '振り返り履歴')
  );

  if (reviews.length === 0) {
    section.appendChild(
      el('div', { className: 'glass-card', style: 'padding: 12px; color: var(--text-secondary); font-size: 0.82rem;' }, 'この項目の振り返りはまだありません。')
    );
    return section;
  }

  const list = el('div', { style: 'display: flex; flex-direction: column; gap: 10px;' });
  reviews.forEach(review => {
    const reviewGoal = review.goals?.[goal.id];
    const achieved = !!reviewGoal?.achieved;
    const commentText = reviewGoal?.comment?.trim() || 'コメントなし';

    list.appendChild(
      el('div', { className: 'glass-card', style: 'padding: 12px; border: 1px solid var(--border-subtle);' },
        el('div', { style: 'display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 6px;' },
          el('strong', { style: 'font-size: 0.86rem; color: var(--text-primary);' }, formatYearMonthI18n(review.yearMonth)),
          el('span', {
            className: 'status-badge',
            style: `font-size: 0.72rem; color: ${achieved ? '#34D399' : '#F59E0B'}; border-color: ${achieved ? '#34D399' : '#F59E0B'};`
          }, achieved ? '達成' : '未達成')
        ),
        el('p', { style: 'margin: 0; color: var(--text-secondary); font-size: 0.82rem; white-space: pre-wrap;' }, commentText)
      )
    );
  });

  section.appendChild(list);
  return section;
}

function getCurrentYearMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getRoutineHistoryStartMonth(goal, dates) {
  if (goal.startDate) return goal.startDate.slice(0, 7);
  if (dates.length > 0) return dates[0].slice(0, 7);
  return getCurrentYearMonthKey();
}

function getYearMonthRange(startYearMonth, endYearMonth) {
  const [startYear, startMonth] = startYearMonth.split('-').map(Number);
  const [endYear, endMonth] = endYearMonth.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  const months = [];

  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function createRoutineCompletionHistory(goal) {
  const dates = getRoutineCompletionDates(goal);
  const section = el('div', { className: 'form-field routine-completion-history' },
    el('label', { className: 'form-label' }, t('routine.completionHistory')),
    el('small', { className: 'routine-history-help' }, t('routine.completionHistoryHelp'))
  );

  const byMonth = new Map();
  dates.forEach(dateKey => {
    const yearMonth = dateKey.slice(0, 7);
    const day = Number(dateKey.slice(8, 10));
    if (!Number.isFinite(day)) return;
    if (!byMonth.has(yearMonth)) byMonth.set(yearMonth, []);
    byMonth.get(yearMonth).push(day);
  });
  const currentYearMonth = getCurrentYearMonthKey();
  const startYearMonth = getRoutineHistoryStartMonth(goal, dates);
  getYearMonthRange(startYearMonth, currentYearMonth).forEach(yearMonth => {
    if (!byMonth.has(yearMonth)) byMonth.set(yearMonth, []);
  });

  const list = el('div', { className: 'routine-history-list' });
  Array.from(byMonth.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([yearMonth, days]) => {
      list.appendChild(createRoutineMonthCalendar(goal.id, yearMonth, days, () => {
        const currentGoal = getGoalById(goal.id);
        if (!currentGoal) return;
        section.replaceWith(createRoutineCompletionHistory(currentGoal));
        if (window.lucide) window.lucide.createIcons();
      }));
    });

  section.appendChild(list);
  return section;
}

function createRoutineMonthCalendar(goalId, yearMonth, days, onChanged) {
  const [year, month] = yearMonth.split('-').map(Number);
  const completedDays = new Set(days);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekdayKeys = [
    'weekday.sun',
    'weekday.mon',
    'weekday.tue',
    'weekday.wed',
    'weekday.thu',
    'weekday.fri',
    'weekday.sat'
  ];

  const grid = el('div', { className: 'routine-calendar-grid' });
  weekdayKeys.forEach(key => {
    grid.appendChild(el('span', { className: 'routine-calendar-weekday' }, t(key)));
  });

  for (let index = 0; index < firstWeekday; index += 1) {
    grid.appendChild(el('span', { className: 'routine-calendar-day empty' }, ''));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${yearMonth}-${String(day).padStart(2, '0')}`;
    const completed = completedDays.has(day);
    grid.appendChild(
      el('button', {
        type: 'button',
        className: `routine-calendar-day${completed ? ' completed' : ''}`,
        title: completed ? t('routine.removeCompletedDay') : t('routine.addCompletedDay'),
        onClick: (event) => {
          event.stopPropagation();
          toggleRoutineCompletion(goalId, dateKey);
          onChanged();
        }
      }, String(day))
    );
  }

  return el('div', { className: 'routine-history-month glass-card' },
    el('div', { className: 'routine-history-month-header' },
      el('strong', {}, formatYearMonthI18n(yearMonth)),
      el('span', {}, t('routine.completedCount', completedDays.size))
    ),
    grid
  );
}

export function openGoalModal(goalId, defaultArea = null, onSave = null) {
  closeGoalModal();

  const isEdit = !!goalId;
  const goal = isEdit ? getGoalById(goalId) : null;
  
  // デフォルト値の設定
  const initialAreaId = goal?.areaId || defaultArea?.areaId || (getActiveAreas()[0]?.id || '');
  const initialCategory = goal?.category || defaultArea?.category || 'routines';

  if (!goalId && !canAddGoal(initialCategory)) {
    alert(`${t('limit.goalReached', t(CATEGORY_CONFIG[initialCategory].labelKey))}\n${t('limit.unlockHint')}`);
    return;
  }

  modalOverlay = el('div', { className: 'modal-overlay', onClick: (e) => {
    if (e.target === modalOverlay) closeGoalModal();
  }});

  const modal = el('div', { className: 'modal' });

  // ヘッダー
  const header = el('div', { className: 'modal-header' },
    el('h2', { className: 'modal-title' }, isEdit ? t('modal.editTitle') : t('modal.addTitle')),
    el('button', { className: 'modal-close', onClick: closeGoalModal },
      el('i', { 'data-lucide': 'x' })
    )
  );
  modal.appendChild(header);

  // フォーム
  const form = el('form', { className: 'modal-form', onSubmit: async (e) => {
    e.preventDefault();
    await handleSubmit(e.target, isEdit, goalId, onSave, {
      startDatePicker,
      completedDatePicker,
      dueDatePicker
    });
  }});

  // タイトル
  form.appendChild(createField(t('modal.title'),
    el('input', {
      type: 'text',
      name: 'title',
      className: 'form-input',
      placeholder: t('modal.titlePlaceholder'),
      value: goal?.title || '',
      required: 'required'
    })
  ));

  // 説明
  const descTextarea = el('textarea', {
    name: 'description',
    className: 'form-input form-textarea',
    placeholder: t('modal.descPlaceholder'),
    rows: '3'
  });
  descTextarea.value = goal?.description || '';
  form.appendChild(createField(t('modal.description'), descTextarea));

  // Area (動的)
  const areaSelect = el('select', { name: 'areaId', className: 'form-input', style: 'flex: 1;' });
  
  function populateAreas(selectedId) {
    areaSelect.innerHTML = '';
    const currentAreas = getActiveAreas();
    currentAreas.forEach(area => {
      const opt = el('option', { value: area.id }, area.name);
      if (selectedId === area.id) opt.selected = true;
      areaSelect.appendChild(opt);
    });
  }
  populateAreas(initialAreaId);

  const addAreaBtn = el('button', {
    type: 'button',
    className: 'btn btn-ghost btn-sm',
    style: 'margin-left: 8px; flex-shrink: 0; padding: 10px 14px;',
    onClick: () => {
      openAreaModal(null, (newArea) => {
        if (newArea && newArea.id) {
          populateAreas(newArea.id);
        }
      });
    }
  },
    el('i', { 'data-lucide': 'plus' }),
    el('span', {}, '新規作成')
  );

  const areaContainer = el('div', { style: 'display: flex; align-items: center; width: 100%;' },
    areaSelect,
    addAreaBtn
  );
  form.appendChild(createField(t('modal.area'), areaContainer));

  // Category
  const categorySelect = el('select', { 
    name: 'category', 
    className: 'form-input', 
    onChange: () => updateDynamicFields() 
  });
  Object.keys(CATEGORY_CONFIG).forEach(catKey => {
    const opt = el('option', { value: catKey }, t(CATEGORY_CONFIG[catKey].labelKey));
    if (initialCategory === catKey) opt.selected = true;
    categorySelect.appendChild(opt);
  });
  form.appendChild(createField(t('modal.category'), categorySelect));

  // ステータス
  const statusSelect = el('select', { name: 'status', className: 'form-input' });
  for (const [key, config] of Object.entries(STATUS_CONFIG)) {
    const opt = el('option', { value: key }, t(config.labelKey));
    if ((goal?.status || 'active') === key) opt.selected = true;
    statusSelect.appendChild(opt);
  }
  form.appendChild(createField(t('modal.status'), statusSelect));

  // 優先度
  const prioritySelect = el('select', { name: 'priority', className: 'form-input' });
  for (const [key, config] of Object.entries(PRIORITY_CONFIG)) {
    const opt = el('option', { value: key }, t(config.labelKey));
    if ((goal?.priority || 'medium') === key) opt.selected = true;
    prioritySelect.appendChild(opt);
  }
  form.appendChild(createField(t('modal.priority'), prioritySelect));

  // 動的フィールドコンテナ
  const dynamicContainer = el('div', { className: 'modal-dynamic-fields' });
  form.appendChild(dynamicContainer);

  // サブタスク用の一時データ
  let tempSubtasks = goal?.subtasks ? [...goal.subtasks] : [];

  // 日付ピッカーの値を保持する変数
  let startDateValue = goal?.startDate || null;
  let completedDateValue = goal?.completedDate || null;
  let dueDateValue = goal?.dueDate || null;
  let startDatePicker = null;
  let completedDatePicker = null;
  let dueDatePicker = null;

  function updateDynamicFields() {
    dynamicContainer.innerHTML = '';
    const selectedCategory = categorySelect.value;

    if (selectedCategory === 'projects' || selectedCategory === 'routines') {
      startDatePicker = createDatePicker(startDateValue, (v) => { startDateValue = v; });
      completedDatePicker = createDatePicker(completedDateValue, (v) => { completedDateValue = v; });

      const datesContainer = el('div', { style: 'display: flex; gap: 16px; margin-bottom: 16px;' });
      
      datesContainer.appendChild(el('div', { style: 'flex: 1; min-width: 0;' },
        el('label', { className: 'form-label' }, t('modal.startDate')),
        startDatePicker
      ));

      datesContainer.appendChild(el('div', { style: 'flex: 1; min-width: 0;' },
        el('label', { className: 'form-label' }, t('modal.completedDate')),
        completedDatePicker
      ));

      dynamicContainer.appendChild(datesContainer);
    } else {
      startDatePicker = null;
      completedDatePicker = null;
    }

    if (selectedCategory === 'projects') {
      // 期限日
      dueDatePicker = createDatePicker(dueDateValue, (v) => { dueDateValue = v; });
      dynamicContainer.appendChild(createField(t('modal.dueDate'), dueDatePicker));

      // サブタスク
      const subtaskSection = el('div', { className: 'form-field' },
        el('label', { className: 'form-label' }, t('modal.subtasks'))
      );

      const subtaskList = el('div', { className: 'subtask-edit-list' });
      function renderSubtasks() {
        subtaskList.innerHTML = '';
        tempSubtasks.forEach((st, idx) => {
          const row = el('div', { className: 'subtask-edit-row' },
            el('input', {
              type: 'checkbox',
              className: 'subtask-checkbox',
              checked: st.completed ? 'checked' : undefined,
              onChange: () => { tempSubtasks[idx].completed = !tempSubtasks[idx].completed; }
            }),
            el('span', { className: `subtask-edit-text${st.completed ? ' completed' : ''}` }, st.text),
            el('button', {
              type: 'button',
              className: 'icon-btn subtask-remove-btn',
              onClick: () => { tempSubtasks.splice(idx, 1); renderSubtasks(); }
            }, el('i', { 'data-lucide': 'x' }))
          );
          subtaskList.appendChild(row);
        });
        if (window.lucide) window.lucide.createIcons();
      }
      renderSubtasks();
      subtaskSection.appendChild(subtaskList);

      // 追加入力
      const addRow = el('div', { className: 'subtask-add-row' });
      const addInput = el('input', {
        type: 'text',
        className: 'form-input subtask-add-input',
        placeholder: t('modal.subtaskPlaceholder')
      });
      const addBtn = el('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        onClick: () => {
          const text = addInput.value.trim();
          if (text) {
            tempSubtasks.push({ id: generateId(), text, completed: false });
            addInput.value = '';
            renderSubtasks();
          }
        }
      },
        el('i', { 'data-lucide': 'plus' }),
        el('span', {}, t('modal.addSubtask'))
      );
      addInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
      });
      addRow.appendChild(addInput);
      addRow.appendChild(addBtn);
      subtaskSection.appendChild(addRow);

      dynamicContainer.appendChild(subtaskSection);
    }

    if (selectedCategory === 'routines') {
      // 頻度
      const freqSelect = el('select', { name: 'frequency', className: 'form-input', onChange: () => {
        const customField = dynamicContainer.querySelector('.freq-custom-field');
        if (customField) customField.style.display = freqSelect.value === 'custom' ? 'block' : 'none';
      }});
      freqSelect.appendChild(el('option', { value: '' }, '---'));
      for (const [key, config] of Object.entries(FREQUENCY_CONFIG)) {
        const opt = el('option', { value: key }, t(config.labelKey));
        if (goal?.frequency === key) opt.selected = true;
        freqSelect.appendChild(opt);
      }
      dynamicContainer.appendChild(createField(t('modal.frequency'), freqSelect));

      // カスタム頻度入力
      const customField = el('div', { className: 'form-field freq-custom-field', style: `display: ${goal?.frequency === 'custom' ? 'block' : 'none'}` });
      const customInput = el('input', {
        type: 'text',
        name: 'frequencyCustom',
        className: 'form-input',
        placeholder: t('modal.frequencyCustomPlaceholder'),
        value: goal?.frequencyCustom || ''
      });
      customField.appendChild(customInput);
      dynamicContainer.appendChild(customField);
    }

    if (window.lucide) window.lucide.createIcons();
  }

  updateDynamicFields();

  // 隠しフィールド: サブタスクデータ
  if (isEdit && goal) {
    if (goal.category === 'routines') {
      form.appendChild(createRoutineCompletionHistory(goal));
    }
    form.appendChild(createGoalReviewHistory(goal));
  }

  const subtasksHidden = el('input', { type: 'hidden', name: 'subtasksData', value: '' });
  form.appendChild(subtasksHidden);

  const calendarCheckbox = el('input', {
    type: 'checkbox',
    name: 'addToCalendar',
    id: 'goal-add-to-calendar',
    checked: goal?.googleCalendarEventId ? 'checked' : undefined
  });
  form.appendChild(
    el('label', {
      className: 'form-field calendar-sync-option',
      htmlFor: 'goal-add-to-calendar'
    },
      el('span', { className: 'calendar-sync-checkbox' }, calendarCheckbox),
      el('span', { className: 'calendar-sync-copy' },
        el('strong', {}, t('calendar.addToCalendar')),
        el('small', {}, t('calendar.addToCalendarHelp'))
      )
    )
  );

  // ボタン
  const buttons = el('div', { className: 'modal-buttons' },
    el('button', { type: 'button', className: 'btn btn-ghost', onClick: closeGoalModal }, t('modal.cancel')),
    el('button', { type: 'submit', className: 'btn btn-primary', onClick: () => {
      subtasksHidden.value = JSON.stringify(tempSubtasks);
    }}, isEdit ? t('modal.update') : t('modal.add'))
  );
  form.appendChild(buttons);

  modal.appendChild(form);
  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);
  removeEscapeClose = registerEscapeClose(closeGoalModal);

  requestAnimationFrame(() => {
    modalOverlay.classList.add('active');
    modal.classList.add('active');
  });

  if (window.lucide) window.lucide.createIcons();
  form.querySelector('input[name="title"]').focus();
}

export function closeGoalModal() {
  if (modalOverlay) {
    removeEscapeClose?.();
    removeEscapeClose = null;
    modalOverlay.classList.remove('active');
    const modal = modalOverlay.querySelector('.modal');
    if (modal) modal.classList.remove('active');
    setTimeout(() => {
      modalOverlay?.remove();
      modalOverlay = null;
    }, 200);
  }
}

async function handleSubmit(form, isEdit, goalId, onSave, pickers = {}) {
  const data = {
    title: form.title.value.trim(),
    description: form.description.value.trim(),
    areaId: form.areaId.value,
    category: form.category.value,
    status: form.status.value,
    priority: form.priority.value,
  };

  if (!data.title || !data.areaId) return;

  if (data.category === 'projects' || data.category === 'routines') {
    data.startDate = pickers.startDatePicker ? pickers.startDatePicker.getValue() : null;
    data.completedDate = pickers.completedDatePicker ? pickers.completedDatePicker.getValue() : null;
  } else {
    data.startDate = null;
    data.completedDate = null;
  }

  // Projects: 期限日 + サブタスク
  if (data.category === 'projects') {
    data.dueDate = pickers.dueDatePicker ? pickers.dueDatePicker.getValue() : null;
    try {
      data.subtasks = JSON.parse(form.subtasksData?.value || '[]');
    } catch {
      data.subtasks = [];
    }
    data.frequency = null;
    data.frequencyCustom = null;
  }
  // Routines: 頻度
  else if (data.category === 'routines') {
    data.frequency = form.frequency?.value || null;
    data.frequencyCustom = form.frequencyCustom?.value?.trim() || null;
    data.dueDate = null;
    data.subtasks = [];
  }
  // Resources: 追加フィールドなし
  else {
    data.dueDate = null;
    data.subtasks = [];
    data.frequency = null;
    data.frequencyCustom = null;
  }

  if (data.status === 'completed' && !data.completedDate) {
    alert(t('common.completedDateInputHelp'));
    return;
  }

  if (form.addToCalendar?.checked && !data.dueDate && !data.startDate && !data.completedDate) {
    alert(t('calendar.dateRequired'));
    return;
  }

  let savedGoal = null;
  if (isEdit) {
    savedGoal = updateGoal(goalId, data);
  } else {
    try {
      savedGoal = addGoal(data);
    } catch (err) {
      if (err?.message === `FREE_LIMIT_${data.category.toUpperCase()}_REACHED`) {
        alert(`${t('limit.goalReached', t(CATEGORY_CONFIG[data.category].labelKey))}\n${t('limit.unlockHint')}`);
        return;
      }
      throw err;
    }
  }

  if (form.addToCalendar?.checked && savedGoal) {
    if (!canCreateCalendarEvent(savedGoal)) {
      alert(t('calendar.dateRequired'));
      return;
    }

    try {
      const event = await upsertGoalCalendarEvent(savedGoal);
      updateGoal(savedGoal.id, {
        googleCalendarEventId: event.id || savedGoal.googleCalendarEventId || null,
        googleCalendarEventLink: event.htmlLink || savedGoal.googleCalendarEventLink || null
      });
    } catch (err) {
      console.error('Calendar sync failed', err);
      alert(`${t('calendar.addFailed')}\n\n${err.message || ''}`);
    }
  }

  closeGoalModal();
  if (onSave) onSave();
}

function createField(label, input) {
  return el('div', { className: 'form-field' },
    el('label', { className: 'form-label' }, label),
    input
  );
}
