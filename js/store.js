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
const FREE_ITEM_LIMIT = 4;
const PREMIUM_UNLOCK_KEY = 'orbit_premium_unlocked';

const DEFAULT_DASHBOARD_LAYOUT = ['areas', 'routines', 'projects', 'due_soon', 'status', 'priority', 'recent'];

function loadData(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  localStorage.setItem(LAST_MODIFIED_KEY, Date.now().toString());
  window.dispatchEvent(new Event('orbitDataChanged'));
}

export function getLastModified() {
  return parseInt(localStorage.getItem(LAST_MODIFIED_KEY) || '0', 10);
}

export function isPremiumUnlocked() {
  return localStorage.getItem(PREMIUM_UNLOCK_KEY) === 'true';
}

export function setPremiumUnlocked(unlocked) {
  localStorage.setItem(PREMIUM_UNLOCK_KEY, unlocked ? 'true' : 'false');
  window.dispatchEvent(new Event('orbitDataChanged'));
}

export function getFreeItemLimit() {
  return FREE_ITEM_LIMIT;
}

export function canAddArea() {
  return isPremiumUnlocked() || getAllAreas().length < FREE_ITEM_LIMIT;
}

export function canAddGoal(category) {
  return isPremiumUnlocked() || getAllGoals().filter(g => g.category === category).length < FREE_ITEM_LIMIT;
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

export function getAllAreas() {
  return loadData(AREAS_KEY).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getActiveAreas() {
  return getAllAreas().filter(a => !a.archived);
}

export function getAreaById(id) {
  return getAllAreas().find(a => a.id === id) || null;
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
  saveData(AREAS_KEY, areas);
  return area;
}

export function updateArea(id, updates) {
  const areas = getAllAreas();
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

export function deleteArea(id) {
  saveData(AREAS_KEY, getAllAreas().filter(a => a.id !== id));
  // Delete all goals in this area
  saveData(GOALS_KEY, getAllGoals().filter(g => g.areaId !== id));
}

// ===== Goals =====

export function getAllGoals() {
  return loadData(GOALS_KEY);
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

export function getGoalById(id) {
  return getAllGoals().find(g => g.id === id) || null;
}

export function addGoal({ title, description, areaId, category, status = 'active', priority = 'medium', dueDate = null, startDate = null, completedDate = null, subtasks = [], frequency = null, frequencyCustom = null }) {
  if (!canAddGoal(category)) {
    throw new Error(`FREE_LIMIT_${category.toUpperCase()}_REACHED`);
  }
  const goals = getAllGoals();
  const now = new Date().toISOString();
  if (completedDate) {
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
    createdAt: now,
    updatedAt: now
  };
  goals.push(goal);
  saveData(GOALS_KEY, goals);
  return goal;
}

export function updateGoal(id, updates) {
  const goals = getAllGoals();
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return null;
  const currentGoal = goals[idx];
  const merged = { ...currentGoal, ...updates, updatedAt: new Date().toISOString() };
  
  if (updates.completedDate !== undefined) {
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

export function deleteGoal(id) {
  saveData(GOALS_KEY, getAllGoals().filter(g => g.id !== id));
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
    .filter(g => g.dueDate)
    .map(g => {
      const due = new Date(g.dueDate);
      due.setHours(0, 0, 0, 0);
      return { ...g, daysLeft: Math.ceil((due - now) / (1000 * 60 * 60 * 24)) };
    })
    .filter(g => g.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ===== Export / Import =====

export function exportData() {
  const data = {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    areas: getAllAreas(),
    goals: getAllGoals(),
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

export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        restoreFullData(data);
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsText(file);
  });
}

export function getFullData() {
  return {
    version: '3.1',
    exportedAt: new Date().toISOString(),
    lastModified: getLastModified(),
    areas: getAllAreas(),
    goals: getAllGoals(),
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
  localStorage.setItem(VERSION_KEY, '3.1');
}

export function initializeSampleDataIfNeeded() {
  const areas = loadData(AREAS_KEY);
  if (areas.length > 0) return;

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

  saveData(AREAS_KEY, sampleAreas);
  saveData(GOALS_KEY, sampleGoals);
}
