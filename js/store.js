// ==========================================
// Orbit v3 - データストア (LocalStorage)
// ==========================================

import { generateId } from './utils.js';

const AREAS_KEY = 'orbit_areas';
const GOALS_KEY = 'orbit_goals';
const REVIEWS_KEY = 'orbit_reviews';
const VERSION_KEY = 'orbit_version';
const LAST_MODIFIED_KEY = 'orbit_last_modified';
const DASHBOARD_LAYOUT_KEY = 'orbit_dashboard_layout';
const LOCAL_USER_CHANGES_KEY = 'orbit_local_user_changes';
const RECOVERY_BACKUP_KEY = 'orbit_recovery_backup';
const FREE_ITEM_LIMIT = 4;
const PREMIUM_UNLOCK_KEY = 'orbit_premium_unlocked';
const SAMPLE_CHOICE_KEY = 'orbit_sample_choice';
const DATA_VERSION = '3.1';
const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_AREAS = 1000;
const MAX_IMPORT_GOALS = 5000;
const MAX_IMPORT_REVIEWS = 1000;
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_DASHBOARD_LAYOUT = ['areas', 'routines', 'projects', 'due_soon', 'stale', 'status', 'priority', 'recent'];

function loadData(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveData(key, data, { userChange = true, immediateSync = false } = {}) {
  localStorage.setItem(key, JSON.stringify(data));
  localStorage.setItem(LAST_MODIFIED_KEY, Date.now().toString());
  if (userChange) localStorage.setItem(LOCAL_USER_CHANGES_KEY, 'true');
  window.dispatchEvent(new CustomEvent('orbitDataChanged', {
    detail: { immediateSync }
  }));
}

export function getLastModified() {
  return parseInt(localStorage.getItem(LAST_MODIFIED_KEY) || '0', 10);
}

export function hasLocalUserChanges() {
  const marker = localStorage.getItem(LOCAL_USER_CHANGES_KEY);
  if (marker !== null) return marker === 'true';

  // Existing installations predate the marker, so treat their data as valuable.
  return getLastModified() > 0 && localStorage.getItem(AREAS_KEY) !== null;
}

export function markDataSynced(expectedModified = null) {
  if (expectedModified !== null && getLastModified() !== expectedModified) return false;
  localStorage.setItem(LOCAL_USER_CHANGES_KEY, 'false');
  return true;
}

function isExpiredTrashItem(item, now = Date.now()) {
  if (!item?.deletedAt) return false;
  const deletedAt = Date.parse(item.deletedAt);
  return Number.isFinite(deletedAt) && now - deletedAt >= TRASH_RETENTION_MS;
}

export function purgeExpiredTrash() {
  const now = Date.now();
  const areas = loadData(AREAS_KEY);
  const goals = loadData(GOALS_KEY);
  const purgedGoalIds = goals
    .filter(goal => isExpiredTrashItem(goal, now))
    .map(goal => goal.id)
    .filter(Boolean);
  const nextAreas = areas.filter(area => !isExpiredTrashItem(area, now));
  const nextGoals = goals.filter(goal => !isExpiredTrashItem(goal, now));

  if (nextAreas.length !== areas.length) saveData(AREAS_KEY, nextAreas);
  if (nextGoals.length !== goals.length) saveData(GOALS_KEY, nextGoals);
  if (purgedGoalIds.length > 0) removeGoalReferencesFromReviews(purgedGoalIds);
}

export function saveRecoveryBackup(data) {
  localStorage.setItem(RECOVERY_BACKUP_KEY, JSON.stringify({
    savedAt: new Date().toISOString(),
    data
  }));
}

export function isPremiumUnlocked() {
  return localStorage.getItem(PREMIUM_UNLOCK_KEY) === 'true';
}

export function setPremiumUnlocked(unlocked) {
  const nextValue = unlocked ? 'true' : 'false';
  if (localStorage.getItem(PREMIUM_UNLOCK_KEY) === nextValue) return;
  localStorage.setItem(PREMIUM_UNLOCK_KEY, nextValue);
  window.dispatchEvent(new Event('orbitPremiumChanged'));
}

export function getFreeItemLimit() {
  return FREE_ITEM_LIMIT;
}

export function canAddArea() {
  return isPremiumUnlocked() || getBillableAreaCount() < FREE_ITEM_LIMIT;
}

export function canAddGoal(category) {
  return isPremiumUnlocked() || getBillableGoalCount(category) < FREE_ITEM_LIMIT;
}

export function getBillableAreaCount() {
  return getAllAreas().filter(area => !area.archived && !area.isSample).length;
}

export function getBillableGoalCount(category) {
  return getAllGoals().filter(goal => goal.category === category && !goal.archived && !goal.isSample).length;
}

export function hasSampleData() {
  return getAllAreas(true).some(area => area.isSample && !area.deletedAt) ||
    getAllGoals(true).some(goal => goal.isSample && !goal.deletedAt);
}

export function hasAnyOrbitData() {
  return loadData(AREAS_KEY).length > 0 || loadData(GOALS_KEY).length > 0 || loadData(REVIEWS_KEY).length > 0;
}

export function shouldAskSampleChoice() {
  return !localStorage.getItem(SAMPLE_CHOICE_KEY) && !hasAnyOrbitData();
}

export function markSampleChoice(choice) {
  localStorage.setItem(SAMPLE_CHOICE_KEY, choice);
}

export function deleteSampleData() {
  saveData(AREAS_KEY, getAllAreas(true).filter(area => !area.isSample), { immediateSync: true });
  saveData(GOALS_KEY, getAllGoals(true).filter(goal => !goal.isSample), { immediateSync: true });
}

// ===== Migration from v2 =====

export function migrateIfNeeded() {
  const ver = localStorage.getItem(VERSION_KEY);
  if (ver === '3.1') return;

  const oldReviews = loadData(REVIEWS_KEY);
  let reviewsMigrated = false;

  // v3データ（areaReviewsがある）から v3.1（categoryReviews）への変換
  if (oldReviews.length > 0) {
    const firstReview = oldReviews[0];
    if (firstReview.areaReviews && !firstReview.categoryReviews) {
      const areas = loadData(AREAS_KEY);
      const migratedReviews = oldReviews.map(r => {
        const textParts = [];
        for (const [areaId, text] of Object.entries(r.areaReviews || {})) {
          if (!text) continue;
          const area = areas.find(a => a.id === areaId);
          const areaName = area ? area.name : '未分類';
          textParts.push(`[${areaName}]\n${text}`);
        }
        return {
          id: r.id,
          yearMonth: r.yearMonth,
          categoryReviews: {
            routines: '',
            projects: textParts.join('\n\n'),
            resources: ''
          },
          overallReview: r.overallReview || '',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        };
      });
      saveData(REVIEWS_KEY, migratedReviews);
      reviewsMigrated = true;
    }
  }

  // v2データ（routinesReviewなどがある）から直接 v3.1（categoryReviews）への変換
  if (!reviewsMigrated && oldReviews.length > 0 && oldReviews[0].routinesReview !== undefined) {
    const migratedReviews = oldReviews.map(r => ({
      id: r.id,
      yearMonth: r.yearMonth,
      categoryReviews: {
        routines: r.routinesReview || '',
        projects: r.projectsReview || '',
        resources: r.resourcesReview || ''
      },
      overallReview: r.overallReview || '',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
    saveData(REVIEWS_KEY, migratedReviews);
  }

  // Goal移行（v2からv3）
  const oldGoals = loadData(GOALS_KEY);
  if (oldGoals.length > 0 && oldGoals[0].area && !oldGoals[0].areaId) {
    const defaultArea = {
      id: generateId(),
      name: '未分類',
      description: '自動マイグレーションで作成されたArea',
      color: '#6366F1',
      icon: 'star',
      order: 0,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const areas = loadData(AREAS_KEY);
    if (areas.length === 0) {
      saveData(AREAS_KEY, [defaultArea]);
    }
    const areaId = areas.length > 0 ? areas[0].id : defaultArea.id;

    const migratedGoals = oldGoals.map(g => ({
      ...g,
      areaId: areaId,
      category: g.area || 'projects',
      area: undefined
    }));
    migratedGoals.forEach(g => delete g.area);
    saveData(GOALS_KEY, migratedGoals);
  }

  localStorage.setItem(VERSION_KEY, '3.1');
}

// ===== Areas =====

export function getAllAreas(includeDeleted = false) {
  return loadData(AREAS_KEY)
    .filter(area => includeDeleted || !area.deletedAt)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getActiveAreas() {
  return getAllAreas().filter(a => !a.archived);
}

export function getDeletedAreas() {
  return getAllAreas(true).filter(area => area.deletedAt);
}

export function getAreaById(id, includeDeleted = false) {
  return getAllAreas(includeDeleted).find(a => a.id === id) || null;
}

export function addArea({ name, description = '', color, icon, startDate = null, completedDate = null }) {
  if (!canAddArea()) {
    throw new Error('FREE_LIMIT_AREA_REACHED');
  }
  const areas = getAllAreas();
  const now = new Date().toISOString();
  const archived = !!completedDate;
  const area = {
    id: generateId(),
    name,
    description,
    color,
    icon,
    startDate,
    completedDate,
    order: areas.length,
    archived,
    createdAt: now,
    updatedAt: now
  };
  areas.push(area);
  saveData(AREAS_KEY, areas, { immediateSync: true });
  return area;
}

export function updateArea(id, updates) {
  const areas = getAllAreas(true);
  const idx = areas.findIndex(a => a.id === id);
  if (idx === -1) return null;
  const currentArea = areas[idx];
  const merged = { ...currentArea, ...updates, updatedAt: new Date().toISOString() };
  if (updates.completedDate !== undefined) {
    merged.archived = !!updates.completedDate;
  }
  areas[idx] = merged;
  saveData(AREAS_KEY, areas);
  return areas[idx];
}

export function deleteArea(id, options = {}) {
  const deletedAt = new Date().toISOString();
  const calendarDeletedGoalIds = new Set(options.calendarDeletedGoalIds || []);
  const areas = getAllAreas(true);
  const areaIndex = areas.findIndex(a => a.id === id);
  if (areaIndex === -1) return null;

  areas[areaIndex] = {
    ...areas[areaIndex],
    deletedAt,
    deletedPreviousArchived: areas[areaIndex].archived,
    archived: true,
    updatedAt: deletedAt
  };

  const goals = getAllGoals(true).map(goal => {
    if (goal.areaId !== id || goal.deletedAt) return goal;
    return {
      ...goal,
      deletedAt,
      deletedByAreaId: id,
      deletedPreviousArchived: goal.archived,
      deletedPreviousStatus: goal.status,
      archived: true,
      googleCalendarEventId: calendarDeletedGoalIds.has(goal.id) ? null : goal.googleCalendarEventId,
      googleCalendarEventLink: calendarDeletedGoalIds.has(goal.id) ? null : goal.googleCalendarEventLink,
      googleCalendarRequested: calendarDeletedGoalIds.has(goal.id) ? false : goal.googleCalendarRequested,
      updatedAt: deletedAt
    };
  });

  saveData(AREAS_KEY, areas);
  saveData(GOALS_KEY, goals);
  return areas[areaIndex];
}

export function restoreArea(id) {
  const areas = getAllAreas(true);
  const areaIndex = areas.findIndex(a => a.id === id);
  if (areaIndex === -1) return null;
  const restoredAt = new Date().toISOString();

  areas[areaIndex] = {
    ...areas[areaIndex],
    deletedAt: null,
    archived: areas[areaIndex].deletedPreviousArchived ?? false,
    deletedPreviousArchived: undefined,
    updatedAt: restoredAt
  };

  const goals = getAllGoals(true).map(goal => {
    if (goal.deletedByAreaId !== id) return goal;
    return {
      ...goal,
      deletedAt: null,
      deletedByAreaId: null,
      archived: goal.deletedPreviousArchived ?? false,
      status: goal.deletedPreviousStatus || goal.status,
      deletedPreviousArchived: undefined,
      deletedPreviousStatus: undefined,
      updatedAt: restoredAt
    };
  });

  saveData(AREAS_KEY, areas);
  saveData(GOALS_KEY, goals);
  return areas[areaIndex];
}

// ===== Goals =====

export function getAllGoals(includeDeleted = false) {
  return loadData(GOALS_KEY).filter(goal => includeDeleted || !goal.deletedAt);
}

export function getGoalsByAreaAndCategory(areaId, category, includeArchived = false) {
  return getAllGoals().filter(g =>
    g.areaId === areaId &&
    g.category === category &&
    (includeArchived || !g.archived)
  );
}

export function getGoalsByArea(areaId, includeArchived = false) {
  return getAllGoals().filter(g => g.areaId === areaId && (includeArchived || !g.archived));
}

export function getActiveGoals() {
  return getAllGoals().filter(g => !g.archived);
}

export function getArchivedGoals() {
  return getAllGoals().filter(g => g.archived);
}

export function getDeletedGoals() {
  return getAllGoals(true).filter(goal => goal.deletedAt);
}

export function getGoalById(id) {
  return getAllGoals().find(g => g.id === id) || null;
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getTodayDateKey() {
  return getLocalDateKey();
}

export function getRoutineCompletionDates(goal) {
  return Array.from(new Set(goal?.routineCompletions || []))
    .filter(Boolean)
    .sort();
}

export function getRoutineCompletionDaysInMonth(goal, yearMonth) {
  return getRoutineCompletionDates(goal)
    .filter(value => value.startsWith(`${yearMonth}-`))
    .map(value => Number(value.slice(8, 10)))
    .filter(Number.isFinite);
}

export function isRoutineCompletedOn(goal, dateKey = getTodayDateKey()) {
  return getRoutineCompletionDates(goal).includes(dateKey);
}

export function toggleRoutineCompletion(goalId, dateKey = getTodayDateKey()) {
  const goal = getGoalById(goalId);
  if (!goal || goal.category !== 'routines') return null;

  const completions = getRoutineCompletionDates(goal);
  const nextCompletions = completions.includes(dateKey)
    ? completions.filter(value => value !== dateKey)
    : [...completions, dateKey].sort();

  return updateGoal(goalId, { routineCompletions: nextCompletions });
}

export function addGoal({ title, description, areaId, category, status = 'active', priority = 'medium', dueDate = null, startDate = null, completedDate = null, subtasks = [], frequency = null, frequencyCustom = null, frequencyWeekdays = [], routineStartTime = null, routineDurationMinutes = null }) {
  if (!canAddGoal(category)) {
    throw new Error(`FREE_LIMIT_${category.toUpperCase()}_REACHED`);
  }
  const goals = getAllGoals(true);
  const now = new Date().toISOString();
  if (completedDate && category !== 'routines') {
    status = 'completed';
  }
  const archived = status === 'completed';
  const goal = {
    id: generateId(),
    title,
    description: description || '',
    areaId,
    category,
    status,
    priority,
    archived,
    dueDate: dueDate || null,
    startDate: startDate || null,
    completedDate: completedDate || null,
    subtasks: subtasks || [],
    frequency: frequency || null,
    frequencyCustom: frequencyCustom || null,
    frequencyWeekdays: Array.isArray(frequencyWeekdays) ? frequencyWeekdays : [],
    routineStartTime: routineStartTime || null,
    routineDurationMinutes: routineDurationMinutes || null,
    createdAt: now,
    updatedAt: now
  };
  goals.push(goal);
  saveData(GOALS_KEY, goals, { immediateSync: true });
  return goal;
}

export function updateGoal(id, updates) {
  const goals = getAllGoals(true);
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return null;
  const currentGoal = goals[idx];
  const merged = { ...currentGoal, ...updates, updatedAt: new Date().toISOString() };
  const isRoutine = merged.category === 'routines';
  
  if (updates.completedDate !== undefined && !isRoutine) {
    if (updates.completedDate) {
      merged.status = 'completed';
      merged.archived = true;
    } else {
      if (merged.status === 'completed') {
        merged.status = 'active';
      }
      merged.archived = false;
    }
  } else {
    if (merged.status === 'completed') {
      merged.archived = true;
    } else {
      if (updates.archived !== undefined) {
        merged.archived = updates.archived;
      } else {
        merged.archived = false;
      }
    }
  }
  
  goals[idx] = merged;
  saveData(GOALS_KEY, goals);
  return goals[idx];
}

export function deleteGoal(id, options = {}) {
  const goals = getAllGoals(true);
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return null;
  const deletedAt = new Date().toISOString();
  const calendarDeleted = !!options.calendarDeleted;
  goals[idx] = {
    ...goals[idx],
    deletedAt,
    deletedPreviousArchived: goals[idx].archived,
    deletedPreviousStatus: goals[idx].status,
    archived: true,
    googleCalendarEventId: calendarDeleted ? null : goals[idx].googleCalendarEventId,
    googleCalendarEventLink: calendarDeleted ? null : goals[idx].googleCalendarEventLink,
    googleCalendarRequested: calendarDeleted ? false : goals[idx].googleCalendarRequested,
    updatedAt: deletedAt
  };
  saveData(GOALS_KEY, goals);
  return goals[idx];
}

export function restoreGoal(id) {
  const goals = getAllGoals(true);
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return null;
  goals[idx] = {
    ...goals[idx],
    deletedAt: null,
    deletedByAreaId: null,
    archived: goals[idx].deletedPreviousArchived ?? false,
    status: goals[idx].deletedPreviousStatus || goals[idx].status,
    deletedPreviousArchived: undefined,
    deletedPreviousStatus: undefined,
    updatedAt: new Date().toISOString()
  };
  saveData(GOALS_KEY, goals);
  return goals[idx];
}

export function archiveGoal(id) {
  return updateGoal(id, { archived: true, status: 'completed' });
}

export function unarchiveGoal(id) {
  return updateGoal(id, { archived: false, status: 'active' });
}

// ===== Subtasks =====

export function toggleSubtask(goalId, subtaskId) {
  const goal = getGoalById(goalId);
  if (!goal) return null;
  const subtasks = (goal.subtasks || []).map(s =>
    s.id === subtaskId ? { ...s, completed: !s.completed } : s
  );
  return updateGoal(goalId, { subtasks });
}

// ===== Monthly Reviews =====

export function getAllReviews() {
  return loadData(REVIEWS_KEY);
}

export function getReviewsByGoalId(goalId) {
  return getAllReviews()
    .filter(review => review.goals && review.goals[goalId])
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}

export function getReviewByYearMonth(yearMonth) {
  return getAllReviews().find(r => r.yearMonth === yearMonth) || null;
}

export function saveReview({ yearMonth, categoryReviews, overallReview, goals }) {
  const reviews = getAllReviews();
  const existing = reviews.findIndex(r => r.yearMonth === yearMonth);
  const now = new Date().toISOString();

  const reviewData = {
    yearMonth,
    categoryReviews: categoryReviews || {},
    overallReview: overallReview || '',
    goals: goals || {},
    updatedAt: now
  };

  if (existing !== -1) {
    reviews[existing] = { ...reviews[existing], ...reviewData };
  } else {
    reviews.push({ id: generateId(), ...reviewData, createdAt: now });
  }
  saveData(REVIEWS_KEY, reviews);
}

function removeGoalReferencesFromReviews(goalIds) {
  const idSet = new Set(goalIds);
  if (idSet.size === 0) return;

  let changed = false;
  const reviews = getAllReviews().map(review => {
    if (!review.goals || typeof review.goals !== 'object') return review;

    const nextGoals = { ...review.goals };
    let reviewChanged = false;
    for (const goalId of idSet) {
      if (Object.prototype.hasOwnProperty.call(nextGoals, goalId)) {
        delete nextGoals[goalId];
        reviewChanged = true;
        changed = true;
      }
    }

    return reviewChanged ? { ...review, goals: nextGoals, updatedAt: new Date().toISOString() } : review;
  });

  if (changed) saveData(REVIEWS_KEY, reviews);
}

// ===== Dashboard Layout =====

export function getDashboardLayout() {
  const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw).filter(w => w !== 'summary');
      const missing = DEFAULT_DASHBOARD_LAYOUT.filter(w => !parsed.includes(w));
      return [...parsed, ...missing];
    } catch {
      return [...DEFAULT_DASHBOARD_LAYOUT];
    }
  }
  return [...DEFAULT_DASHBOARD_LAYOUT];
}

export function saveDashboardLayout(layout) {
  saveData(DASHBOARD_LAYOUT_KEY, layout);
}

// ===== Stats =====

export function getStats() {
  const goals = getAllGoals();
  const active = goals.filter(g => !g.archived);
  const archived = goals.filter(g => g.archived);
  const areas = getActiveAreas();

  const byArea = {};
  areas.forEach(a => {
    const areaGoals = active.filter(g => g.areaId === a.id);
    byArea[a.id] = {
      total: areaGoals.length,
      routines: areaGoals.filter(g => g.category === 'routines').length,
      projects: areaGoals.filter(g => g.category === 'projects').length,
      resources: areaGoals.filter(g => g.category === 'resources').length,
    };
  });

  return {
    total: goals.length,
    active: active.length,
    archived: archived.length,
    byArea,
    byStatus: {
      active: active.filter(g => g.status === 'active').length,
      'on-hold': active.filter(g => g.status === 'on-hold').length,
      completed: active.filter(g => g.status === 'completed').length,
    },
    byPriority: {
      high: active.filter(g => g.priority === 'high').length,
      medium: active.filter(g => g.priority === 'medium').length,
      low: active.filter(g => g.priority === 'low').length,
    },
    recentGoals: [...goals].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5)
  };
}

// ===== Due Soon =====

export function getDueSoonGoals(withinDays = 3) {
  const active = getActiveGoals();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return active
    .filter(g => g.status !== 'completed')
    .filter(g => g.dueDate)
    .map(g => {
      const due = new Date(g.dueDate);
      due.setHours(0, 0, 0, 0);
      return { ...g, daysLeft: Math.ceil((due - now) / (1000 * 60 * 60 * 24)) };
    })
    .filter(g => g.daysLeft >= 0 && g.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function getOverdueGoals() {
  const active = getActiveGoals();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return active
    .filter(g => g.status !== 'completed')
    .filter(g => g.dueDate)
    .map(g => {
      const due = new Date(g.dueDate);
      due.setHours(0, 0, 0, 0);
      return { ...g, daysLeft: Math.ceil((due - now) / (1000 * 60 * 60 * 24)) };
    })
    .filter(g => g.daysLeft < 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ===== Export / Import =====

export function exportData() {
  const data = {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    areas: getAllAreas(true),
    goals: getAllGoals(true),
    reviews: getAllReviews(),
    language: localStorage.getItem('orbit_language') || 'ja',
    dashboardLayout: getDashboardLayout()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orbit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRecordArray(name, value, maxItems, requiredFields = []) {
  if (!Array.isArray(value)) return [`${name} must be an array.`];
  if (value.length > maxItems) return [`${name} has too many items.`];
  const errors = [];
  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`${name}[${index}] must be an object.`);
      return;
    }
    requiredFields.forEach(field => {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        errors.push(`${name}[${index}].${field} is required.`);
      }
    });
  });
  return errors;
}

function findDuplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  items.forEach(item => {
    if (!item?.id) return;
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  });
  return [...duplicates];
}

function validateImportData(data) {
  if (!isPlainObject(data)) {
    return { valid: false, errors: ['Backup must be a JSON object.'] };
  }

  const version = String(data.version || '');
  const allowedVersions = new Set(['3.0', DATA_VERSION]);
  const errors = [];

  if (!allowedVersions.has(version)) {
    errors.push(`Unsupported backup version: ${version || 'missing'}.`);
  }

  const areas = data.areas;
  const goals = data.goals;
  const reviews = data.reviews;

  errors.push(...validateRecordArray('areas', areas, MAX_IMPORT_AREAS, ['id', 'name']));
  errors.push(...validateRecordArray('goals', goals, MAX_IMPORT_GOALS, ['id', 'title', 'areaId', 'category']));
  errors.push(...validateRecordArray('reviews', reviews, MAX_IMPORT_REVIEWS, ['id']));

  if (Array.isArray(areas) && Array.isArray(goals) && Array.isArray(reviews)) {
    findDuplicateIds(areas).forEach(id => errors.push(`Duplicate area id: ${id}.`));
    findDuplicateIds(goals).forEach(id => errors.push(`Duplicate goal id: ${id}.`));
    findDuplicateIds(reviews).forEach(id => errors.push(`Duplicate review id: ${id}.`));

    const areaIds = new Set(areas.map(area => area.id));
    goals.forEach((goal, index) => {
      if (!['routines', 'projects', 'resources'].includes(goal.category)) {
        errors.push(`goals[${index}].category is invalid.`);
      }
      if (!areaIds.has(goal.areaId)) {
        errors.push(`goals[${index}].areaId does not exist.`);
      }
      if (goal.subtasks !== undefined && !Array.isArray(goal.subtasks)) {
        errors.push(`goals[${index}].subtasks must be an array.`);
      }
      if (goal.routineCompletions !== undefined && !Array.isArray(goal.routineCompletions)) {
        errors.push(`goals[${index}].routineCompletions must be an array.`);
      }
    });

    const goalIds = new Set(goals.map(goal => goal.id));
    reviews.forEach((review, index) => {
      if (review.goals !== undefined && !isPlainObject(review.goals)) {
        errors.push(`reviews[${index}].goals must be an object.`);
        return;
      }
      Object.keys(review.goals || {}).forEach(goalId => {
        if (!goalIds.has(goalId)) {
          errors.push(`reviews[${index}] references an unknown goal id.`);
        }
      });
    });
  }

  if (data.dashboardLayout !== undefined && !Array.isArray(data.dashboardLayout)) {
    errors.push('dashboardLayout must be an array.');
  }

  const safeAreas = Array.isArray(areas) ? areas : [];
  const safeGoals = Array.isArray(goals) ? goals : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  return {
    valid: errors.length === 0,
    errors,
    normalized: {
      ...data,
      areas: safeAreas,
      goals: safeGoals,
      reviews: safeReviews,
      version: DATA_VERSION
    },
    summary: {
      areas: safeAreas.length,
      goals: safeGoals.length,
      reviews: safeReviews.length
    }
  };
}

function confirmImportPreview(summary) {
  const isJapanese = (localStorage.getItem('orbit_language') || 'ja') === 'ja';
  const message = isJapanese
    ? [
        'インポート内容の確認',
        `Area: ${summary.areas}件`,
        `目標: ${summary.goals}件`,
        `振り返り: ${summary.reviews}件`,
        '',
        '読み込み前に現在のデータを自動バックアップします。',
        'この内容で読み込みますか？'
      ].join('\n')
    : [
        'Import preview',
        `Areas: ${summary.areas}`,
        `Goals: ${summary.goals}`,
        `Reviews: ${summary.reviews}`,
        '',
        'A recovery backup of the current data will be saved before importing.',
        'Continue?'
      ].join('\n');
  return confirm(message);
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      reject(new Error('Import file is too large.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const validation = validateImportData(data);
        if (!validation.valid) {
          reject(new Error(validation.errors.join('\n')));
          return;
        }
        if (!confirmImportPreview(validation.summary)) {
          reject(new Error('IMPORT_CANCELLED'));
          return;
        }
        saveRecoveryBackup(getFullData());
        restoreFullData(validation.normalized);
        resolve(validation.normalized);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}

export function getFullData() {
  return {
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    lastModified: getLastModified(),
    areas: getAllAreas(true),
    goals: getAllGoals(true),
    reviews: getAllReviews(),
    language: localStorage.getItem('orbit_language') || 'ja',
    dashboardLayout: getDashboardLayout()
  };
}

export function restoreFullData(data) {
  if (data.areas) localStorage.setItem(AREAS_KEY, JSON.stringify(data.areas));
  if (data.goals) localStorage.setItem(GOALS_KEY, JSON.stringify(data.goals));
  if (data.reviews) localStorage.setItem(REVIEWS_KEY, JSON.stringify(data.reviews));
  if (data.language) localStorage.setItem('orbit_language', data.language);
  if (data.dashboardLayout) localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(data.dashboardLayout));
  if (data.lastModified) {
    localStorage.setItem(LAST_MODIFIED_KEY, data.lastModified.toString());
  } else {
    localStorage.setItem(LAST_MODIFIED_KEY, Date.now().toString());
  }
  localStorage.setItem(VERSION_KEY, DATA_VERSION);
  localStorage.setItem(LOCAL_USER_CHANGES_KEY, 'false');
}

export function createSampleData() {
  if (hasSampleData()) return;

  const workAreaId = generateId();
  const healthAreaId = generateId();
  const learnAreaId = generateId();
  const now = new Date().toISOString();

  const sampleAreas = [
    {
      id: workAreaId,
      name: '仕事',
      description: 'キャリアアップや日々のタスク管理',
      color: '#8B5CF6',
      icon: 'briefcase',
      order: 0,
      archived: false,
      isSample: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: healthAreaId,
      name: '健康',
      description: '運動や食事、睡眠などのライフサイクル',
      color: '#10B981',
      icon: 'heart',
      order: 1,
      archived: false,
      isSample: true,
      createdAt: now,
      updatedAt: now
    },
    {
      id: learnAreaId,
      name: '自己開発',
      description: '読書、資格取得、新しい技術の学習など',
      color: '#3B82F6',
      icon: 'book-open',
      order: 2,
      archived: false,
      isSample: true,
      createdAt: now,
      updatedAt: now
    }
  ];

  const goal1Id = generateId();
  const goal2Id = generateId();
  const goal3Id = generateId();
  const goal4Id = generateId();

  const twoWeeksLater = new Date();
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
  const twoWeeksLaterStr = twoWeeksLater.toISOString().split('T')[0];

  const oneMonthLater = new Date();
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
  const oneMonthLaterStr = oneMonthLater.toISOString().split('T')[0];

  const sampleGoals = [
    {
      id: goal1Id,
      title: '技術書の読書（1日30分）',
      description: '毎朝起きたあとに本を読む習慣をつける',
      areaId: learnAreaId,
      category: 'routines',
      status: 'active',
      priority: 'medium',
      archived: false,
      isSample: true,
      dueDate: null,
      subtasks: [],
      frequency: 'daily',
      frequencyCustom: null,
      createdAt: now,
      updatedAt: now
    },
    {
      id: goal2Id,
      title: 'ジムでウェイトトレーニング',
      description: '健康維持と体力作りのため',
      areaId: healthAreaId,
      category: 'routines',
      status: 'active',
      priority: 'high',
      archived: false,
      isSample: true,
      dueDate: null,
      subtasks: [],
      frequency: 'custom',
      frequencyCustom: '週3回',
      createdAt: now,
      updatedAt: now
    },
    {
      id: goal3Id,
      title: 'ポートフォリオサイトの作成',
      description: '自己紹介と制作実績をまとめるサイトを公開する',
      areaId: workAreaId,
      category: 'projects',
      status: 'active',
      priority: 'high',
      archived: false,
      isSample: true,
      dueDate: twoWeeksLaterStr,
      subtasks: [
        { id: generateId(), text: 'ワイヤーフレームとデザインの作成', completed: true },
        { id: generateId(), text: 'HTML/CSS/JSでのコーディング', completed: false },
        { id: generateId(), text: 'サーバーへのデプロイと動作確認', completed: false }
      ],
      frequency: null,
      frequencyCustom: null,
      createdAt: now,
      updatedAt: now
    },
    {
      id: goal4Id,
      title: '健康診断の受診予約',
      description: '年に一度の定期健診を予約して受ける',
      areaId: healthAreaId,
      category: 'projects',
      status: 'active',
      priority: 'medium',
      archived: false,
      isSample: true,
      dueDate: oneMonthLaterStr,
      subtasks: [
        { id: generateId(), text: 'クリニックの選定と空き状況確認', completed: false },
        { id: generateId(), text: 'Webまたは電話での予約完了', completed: false }
      ],
      frequency: null,
      frequencyCustom: null,
      createdAt: now,
      updatedAt: now
    }
  ];

  const existingAreas = getAllAreas(true);
  const existingGoals = getAllGoals(true);
  saveData(AREAS_KEY, [...existingAreas, ...sampleAreas], { userChange: false });
  saveData(GOALS_KEY, [...existingGoals, ...sampleGoals], { userChange: false });
  localStorage.setItem(LOCAL_USER_CHANGES_KEY, 'false');
}
