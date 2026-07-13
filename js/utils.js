// ==========================================
// Orbit v3 - Utility Functions
// ==========================================

import { t } from './i18n.js';

export function generateId() {
  return crypto.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export function formatDate(isoString) {
  if (!isoString) return '';
  const dateOnly = String(isoString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[1]}/${dateOnly[2]}/${dateOnly[3]}`;
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

const KEYBOARD_ACTIVATION_KEYS = new Set(['Enter', ' ']);
const INTERACTIVE_TARGET_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]'
].join(',');

export function keyboardActivationAttrs(onActivate, options = {}) {
  const attrs = {
    role: options.role || 'button',
    tabindex: options.tabindex ?? '0',
    onKeydown: (event) => {
      if (!KEYBOARD_ACTIVATION_KEYS.has(event.key)) return;
      if (
        event.target !== event.currentTarget &&
        event.target instanceof Element &&
        event.target.closest(INTERACTIVE_TARGET_SELECTOR)
      ) {
        return;
      }

      event.preventDefault();
      onActivate?.(event);
    }
  };

  if (options.label) attrs['aria-label'] = options.label;
  if (options.pressed !== undefined) attrs['aria-pressed'] = String(Boolean(options.pressed));
  if (options.checked !== undefined) attrs['aria-checked'] = String(Boolean(options.checked));
  return attrs;
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
  biweekly: { labelKey: 'frequency.biweekly', color: '#22D3EE' },
  monthly: { labelKey: 'frequency.monthly', color: '#A78BFA' },
  custom: { labelKey: 'frequency.custom', color: '#FB923C' }
};

export const WEEKDAY_KEYS = [
  { value: 'sun', labelKey: 'weekday.sun' },
  { value: 'mon', labelKey: 'weekday.mon' },
  { value: 'tue', labelKey: 'weekday.tue' },
  { value: 'wed', labelKey: 'weekday.wed' },
  { value: 'thu', labelKey: 'weekday.thu' },
  { value: 'fri', labelKey: 'weekday.fri' },
  { value: 'sat', labelKey: 'weekday.sat' }
];

export function formatWeekdayList(weekdays = []) {
  const selected = Array.isArray(weekdays) ? weekdays : [];
  return WEEKDAY_KEYS
    .filter(day => selected.includes(day.value))
    .map(day => t(day.labelKey))
    .join('・');
}

export function formatRoutineFrequency(goal) {
  if (!goal?.frequency) return '';
  const config = FREQUENCY_CONFIG[goal.frequency];
  const base = goal.frequency === 'custom'
    ? (goal.frequencyCustom || t('frequency.custom'))
    : t(config?.labelKey || 'frequency.custom');
  const weekdays = formatWeekdayList(goal.frequencyWeekdays);
  return weekdays ? `${base} (${weekdays})` : base;
}

export function isRoutineScheduledForDate(goal, date = new Date()) {
  const selected = Array.isArray(goal?.frequencyWeekdays) ? goal.frequencyWeekdays : [];
  if (selected.length === 0) return true;
  const weekday = WEEKDAY_KEYS[date.getDay()]?.value;
  return selected.includes(weekday);
}

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

function parseCompactDate(rawValue) {
  const digits = (rawValue || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length !== 8) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function formatCompactDateDisplay(rawValue) {
  const digits = (rawValue || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
}

export function normalizeDateInput(rawValue) {
  if (!rawValue) return null;
  const digits = String(rawValue).replace(/\D/g, '');
  return parseCompactDate(digits);
}

export function registerEscapeClose(closeHandler) {
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHandler();
    }
  };
  document.addEventListener('keydown', onKeydown);
  return () => document.removeEventListener('keydown', onKeydown);
}

export function createDatePicker(initialValue, onChange) {
  const compactValue = initialValue ? initialValue.replaceAll('-', '') : '';
  const nativeInput = el('input', {
    type: 'date',
    className: 'native-date-input-hidden',
    value: initialValue || '',
    tabindex: '-1',
    'aria-hidden': 'true'
  });
  const input = el('input', {
    type: 'text',
    className: 'form-input form-date-input date-picker-text-input',
    value: formatCompactDateDisplay(compactValue),
    maxLength: '10',
    inputMode: 'numeric',
    placeholder: 'YYYY/MM/DD',
    autocomplete: 'off',
    onInput: (event) => {
      const sanitized = event.target.value.replace(/\D/g, '').slice(0, 8);
      event.target.value = formatCompactDateDisplay(sanitized);
      const parsed = parseCompactDate(sanitized);
      nativeInput.value = parsed || '';
      event.target.setCustomValidity(sanitized && !parsed ? t('common.dateInputHelp') : '');
      onChange?.(parsed);
    },
    onBlur: (event) => {
      const parsed = parseCompactDate(event.target.value);
      event.target.value = formatCompactDateDisplay(event.target.value);
      event.target.setCustomValidity(event.target.value && !parsed ? t('common.dateInputHelp') : '');
    }
  });

  nativeInput.addEventListener('change', () => {
    input.value = nativeInput.value ? formatDate(nativeInput.value) : '';
    input.setCustomValidity('');
    onChange?.(nativeInput.value || null);
  });

  const calendarBtn = el('button', {
    type: 'button',
    className: 'date-picker-calendar-btn',
    title: t('common.selectDate'),
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      nativeInput.value = parseCompactDate(input.value) || '';
      if (typeof nativeInput.showPicker === 'function') {
        nativeInput.showPicker();
      } else {
        nativeInput.focus();
        nativeInput.click();
      }
    }
  }, el('i', { 'data-lucide': 'calendar-days' }));

  const wrapper = el('div', { className: 'date-picker-field' }, input, calendarBtn, nativeInput);
  wrapper.getValue = () => parseCompactDate(input.value);
  return wrapper;
}
