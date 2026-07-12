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
  const input = el('input', {
    type: 'text',
    className: 'form-input form-date-input',
    value: formatCompactDateDisplay(compactValue),
    maxLength: '10',
    inputMode: 'numeric',
    placeholder: 'YYYY/MM/DD',
    autocomplete: 'off',
    onInput: (event) => {
      const sanitized = event.target.value.replace(/\D/g, '').slice(0, 8);
      event.target.value = formatCompactDateDisplay(sanitized);
      const parsed = parseCompactDate(sanitized);
      event.target.setCustomValidity(sanitized && !parsed ? t('common.dateInputHelp') : '');
      onChange?.(parsed);
    },
    onBlur: (event) => {
      const parsed = parseCompactDate(event.target.value);
      event.target.value = formatCompactDateDisplay(event.target.value);
      event.target.setCustomValidity(event.target.value && !parsed ? t('common.dateInputHelp') : '');
    }
  });

  input.getValue = () => parseCompactDate(input.value);
  return input;
}
