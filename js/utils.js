// ==========================================
// Orbit v3 - Utility Functions
// ==========================================

export function generateId() {
  return crypto.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getDaysUntilDue(dueDate) {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}

export function getSubtaskProgress(subtasks) {
  if (!subtasks || subtasks.length === 0) return null;
  const completed = subtasks.filter(s => s.completed).length;
  return { completed, total: subtasks.length, percent: Math.round((completed / subtasks.length) * 100) };
}

export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) {
        element.dataset[dk] = dv;
      }
    } else if (key.startsWith('on') && key.length > 2) {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'style') {
      element.setAttribute('style', value);
    } else if (['checked', 'selected', 'disabled', 'value'].includes(key)) {
      element[key] = value;
    } else if (value !== undefined && value !== null) {
      element.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }
  return element;
}

export function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

export const CATEGORY_CONFIG = {
  routines: { labelKey: 'cat.routines', icon: 'repeat', color: '#F59E0B' },
  projects: { labelKey: 'cat.projects', icon: 'rocket', color: '#8B5CF6' },
  resources: { labelKey: 'cat.resources', icon: 'book-open', color: '#10B981' }
};

export const STATUS_CONFIG = {
  active: { labelKey: 'status.active', color: 'var(--status-active-color)' },
  'on-hold': { labelKey: 'status.onHold', color: 'var(--status-on-hold-color)' },
  completed: { labelKey: 'status.completed', color: 'var(--status-completed-color)' }
};

export const PRIORITY_CONFIG = {
  high: { labelKey: 'priority.high', color: 'var(--priority-high-color)' },
  medium: { labelKey: 'priority.medium', color: 'var(--priority-medium-color)' },
  low: { labelKey: 'priority.low', color: 'var(--priority-low-color)' }
};

export const FREQUENCY_CONFIG = {
  daily: { labelKey: 'frequency.daily', color: '#F472B6' },
  weekly: { labelKey: 'frequency.weekly', color: '#38BDF8' },
  monthly: { labelKey: 'frequency.monthly', color: '#A78BFA' },
  custom: { labelKey: 'frequency.custom', color: '#FB923C' }
};

export const AREA_COLORS = [
  '#F59E0B', '#8B5CF6', '#10B981', '#F87171', '#6366F1',
  '#EC4899', '#14B8A6', '#F97316', '#3B82F6', '#A855F7',
  '#EF4444', '#06B6D4', '#84CC16', '#E11D48', '#8B5CF6'
];

export const AREA_ICONS = [
  'heart', 'briefcase', 'graduation-cap', 'home', 'wallet',
  'users', 'brain', 'dumbbell', 'palette', 'globe',
  'shield', 'star', 'book', 'music', 'code'
];

export function createDatePicker(initialValue, onChange) {
  let currentYear = '';
  let currentMonth = '';
  let currentDay = '';

  if (initialValue) {
    const parts = initialValue.split('-');
    currentYear = parts[0] || '';
    currentMonth = parts[1] ? String(parseInt(parts[1], 10)) : '';
    currentDay = parts[2] ? String(parseInt(parts[2], 10)) : '';
  }

  const container = el('div', {
    className: 'date-picker-dropdowns',
    style: 'display:flex; align-items:stretch; gap:8px; width:100%;'
  });

  const yearSelect = el('select', {
    className: 'form-input date-select date-select-year',
    'aria-label': 'Year'
  });
  yearSelect.appendChild(el('option', { value: '' }, 'YYYY'));

  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 5; y <= thisYear + 5; y++) {
    const opt = el('option', { value: String(y) }, `${y}`);
    if (String(y) === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  const monthSelect = el('select', {
    className: 'form-input date-select date-select-month',
    'aria-label': 'Month'
  });
  monthSelect.appendChild(el('option', { value: '' }, 'MM'));
  for (let m = 1; m <= 12; m++) {
    const opt = el('option', { value: String(m) }, String(m).padStart(2, '0'));
    if (String(m) === currentMonth) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  const daySelect = el('select', {
    className: 'form-input date-select date-select-day',
    'aria-label': 'Day'
  });

  function populateDays() {
    const prevDay = daySelect.value;
    daySelect.innerHTML = '';
    daySelect.appendChild(el('option', { value: '' }, 'DD'));
    const y = parseInt(yearSelect.value, 10) || thisYear;
    const m = parseInt(monthSelect.value, 10) || 1;
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const opt = el('option', { value: String(d) }, String(d).padStart(2, '0'));
      if (String(d) === prevDay || String(d) === currentDay) opt.selected = true;
      daySelect.appendChild(opt);
    }
    if (prevDay && parseInt(prevDay, 10) > daysInMonth) {
      daySelect.value = '';
    }
  }
  populateDays();

  function emitChange() {
    const y = yearSelect.value;
    const m = monthSelect.value;
    const d = daySelect.value;
    if (y && m && d) {
      onChange?.(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      return;
    }
    onChange?.(null);
  }

  yearSelect.addEventListener('change', () => {
    populateDays();
    emitChange();
  });
  monthSelect.addEventListener('change', () => {
    populateDays();
    emitChange();
  });
  daySelect.addEventListener('change', emitChange);

  container.appendChild(yearSelect);
  container.appendChild(monthSelect);
  container.appendChild(daySelect);

  container.getValue = () => {
    const y = yearSelect.value;
    const m = monthSelect.value;
    const d = daySelect.value;
    if (y && m && d) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  };

  return container;
}
