// ==========================================
// Orbit - Monthly Review
// ==========================================

import { el, clearElement, getCurrentYearMonth, formatDate, getSubtaskProgress } from '../utils.js';
import { t, getYearMonthOptionsI18n, formatYearMonthI18n } from '../i18n.js';
import { getReviewByYearMonth, saveReview, getAllReviews, getAreaById, getAllGoals, updateGoal, getRoutineCompletionDaysInMonth } from '../store.js';
import { openGoalModal } from './goal-modal.js';

const REVIEW_AUTOSAVE_DELAY_MS = 800;
let reviewLeaveHandler = null;

export function flushMonthlyReviewAutosave() {
  reviewLeaveHandler?.();
}

function getMonthEndDate(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

function isActiveInMonth(item, yearMonth) {
  const [year, month] = yearMonth.split('-');
  const startOfMonth = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endOfMonth = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  const start = item.startDate || '';
  const end = item.completedDate || '';

  if (start && start > endOfMonth) return false;

  if (end) {
    if (end < startOfMonth) return false;
  } else if (item.archived && item.updatedAt) {
    const updatedMonth = item.updatedAt.slice(0, 7);
    if (updatedMonth < yearMonth) return false;
  }

  return true;
}

function isCompletedInMonth(item, yearMonth) {
  return !!item.completedDate && item.completedDate.startsWith(`${yearMonth}-`);
}

export function renderMonthlyReview(container) {
  clearElement(container);
  reviewLeaveHandler = null;

  let selectedMonth = getCurrentYearMonth();
  let autosaveTimer = null;
  let autosaveLabel = null;
  let currentSaveContext = null;
  let saveSequence = 0;

  function setAutosaveLabel(message) {
    if (autosaveLabel) autosaveLabel.textContent = message;
  }

  function collectReviewPayload(form, reviewGoals) {
    const goalsData = {};
    const monthEndDate = getMonthEndDate(selectedMonth);

    reviewGoals.forEach(item => {
      const checkbox = document.getElementById(`achieved-${item.id}`);
      const commentArea = document.getElementById(`comment-${item.id}`);
      const achieved = checkbox ? checkbox.checked : false;
      const comment = commentArea ? commentArea.value.trim() : '';

      goalsData[item.id] = { achieved, comment };

      if (item.category === 'projects') {
        if (achieved && item.status !== 'completed') {
          updateGoal(item.id, {
            status: 'completed',
            completedDate: item.completedDate || monthEndDate
          });
        } else if (!achieved && item.status === 'completed') {
          updateGoal(item.id, {
            status: 'active',
            completedDate: null
          });
        }
      }
    });

    return {
      yearMonth: selectedMonth,
      categoryReviews: {},
      overallReview: form.overallReview.value.trim(),
      goals: goalsData
    };
  }

  function saveCurrentReview(showToastAfterSave = false) {
    if (!currentSaveContext) return;

    const { form, reviewGoals } = currentSaveContext;
    if (!form?.isConnected) return;

    const payload = collectReviewPayload(form, reviewGoals);
    saveReview(payload);
    renderPastReviews(pastReviewsSection);
    setAutosaveLabel(t('review.saved'));

    if (showToastAfterSave) {
      showToast(t('review.saved'));
    }
  }

  function flushAutosave(showToastAfterSave = false) {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    saveCurrentReview(showToastAfterSave);
  }

  function scheduleAutosave() {
    saveSequence += 1;
    const currentSequence = saveSequence;
    setAutosaveLabel('Saving...');

    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      if (currentSequence !== saveSequence) return;
      saveCurrentReview(false);
    }, REVIEW_AUTOSAVE_DELAY_MS);
  }

  const stickyHeader = el('div', { className: 'review-sticky-header' });

  const header = el('div', { className: 'page-header review-page-header' },
    el('div', {},
      el('h1', { className: 'page-title' },
        el('i', { 'data-lucide': 'calendar-check' }),
        el('span', {}, ` ${t('review.title')}`)
      ),
      el('p', { className: 'page-subtitle' }, t('review.subtitle'))
    )
  );

  const controlBar = el('div', { className: 'review-controls' });
  const monthSelect = el('select', {
    className: 'form-input month-select',
    onChange: (event) => {
      flushAutosave(false);
      selectedMonth = event.target.value;
      renderReviewForm();
    }
  });

  getYearMonthOptionsI18n().forEach(opt => {
    const option = el('option', { value: opt.value }, opt.label);
    if (opt.value === selectedMonth) option.selected = true;
    monthSelect.appendChild(option);
  });

  autosaveLabel = el('span', { className: 'review-autosave-status' }, t('review.saved'));

  controlBar.appendChild(
    el('div', { className: 'review-month-selector' },
      el('label', { className: 'form-label' }, t('review.selectMonth')),
      monthSelect
    )
  );
  controlBar.appendChild(autosaveLabel);

  stickyHeader.appendChild(header);
  stickyHeader.appendChild(controlBar);
  container.appendChild(stickyHeader);

  const reviewContainer = el('div', { className: 'review-form-container' });
  container.appendChild(reviewContainer);

  const pastReviewsSection = el('div', { className: 'glass-card past-reviews-section' },
    el('h2', { className: 'card-title' },
      el('i', { 'data-lucide': 'history' }),
      el('span', {}, ` ${t('review.pastReviews')}`)
    )
  );
  renderPastReviews(pastReviewsSection);
  container.appendChild(pastReviewsSection);

  function renderReviewForm() {
    clearElement(reviewContainer);

    const review = getReviewByYearMonth(selectedMonth);
    const monthLabel = formatYearMonthI18n(selectedMonth);
    const formCard = el('div', { className: 'glass-card review-form-card' });

    formCard.appendChild(
      el('h2', { className: 'card-title review-title' }, t('review.reviewOf', monthLabel))
    );

    const form = el('form', { className: 'review-form' });

    const allGoals = getAllGoals();
    const reviewGoals = allGoals.filter(goal => {
      if (goal.category === 'resources') return false;
      if (!isActiveInMonth(goal, selectedMonth)) return false;
      return !isCompletedInMonth(goal, selectedMonth);
    });

    const routines = reviewGoals.filter(goal => goal.category === 'routines');
    const projects = reviewGoals.filter(goal => goal.category === 'projects');

    const routinesSection = el('div', { className: 'review-category-section', style: 'margin-bottom: 24px;' },
      el('h3', { className: 'card-title', style: 'border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 16px;' },
        el('i', { 'data-lucide': 'repeat', style: 'color: #F59E0B;' }),
        el('span', {}, ` ${t('cat.routines')}`)
      )
    );

    if (routines.length === 0) {
      routinesSection.appendChild(
        el('p', { style: 'color: var(--text-tertiary); font-size: 0.88rem; padding-left: 8px;' }, 'この月に対象のRoutineはありません。')
      );
    } else {
      const grid = el('div', { style: 'display: grid; grid-template-columns: 1fr; gap: 12px;' });
      routines.forEach(goal => {
        grid.appendChild(createReviewGoalCard(goal, review));
      });
      routinesSection.appendChild(grid);
    }
    form.appendChild(routinesSection);

    const projectsSection = el('div', { className: 'review-category-section', style: 'margin-bottom: 24px;' },
      el('h3', { className: 'card-title', style: 'border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 16px;' },
        el('i', { 'data-lucide': 'rocket', style: 'color: #8B5CF6;' }),
        el('span', {}, ` ${t('cat.projects')}`)
      )
    );

    if (projects.length === 0) {
      projectsSection.appendChild(
        el('p', { style: 'color: var(--text-tertiary); font-size: 0.88rem; padding-left: 8px;' }, 'この月に対象のProjectはありません。')
      );
    } else {
      const grid = el('div', { style: 'display: grid; grid-template-columns: 1fr; gap: 12px;' });
      projects.forEach(goal => {
        grid.appendChild(createReviewGoalCard(goal, review));
      });
      projectsSection.appendChild(grid);
    }
    form.appendChild(projectsSection);

    const overallSection = el('div', { className: 'review-section', style: 'margin-top: 16px; border-top: 1px solid var(--border-subtle); padding-top: 16px;' },
      el('div', { className: 'review-section-header', style: 'margin-bottom: 10px;' },
        el('div', { className: 'review-section-dot', style: 'background: #6366F1' }),
        el('label', { className: 'form-label review-section-label' }, t('review.overallReview'))
      )
    );
    const overallTextarea = el('textarea', {
      name: 'overallReview',
      className: 'form-input form-textarea review-textarea',
      placeholder: t('review.overallPlaceholder'),
      rows: '4'
    });
    overallTextarea.value = review?.overallReview || '';
    overallSection.appendChild(overallTextarea);
    form.appendChild(overallSection);

    formCard.appendChild(form);
    reviewContainer.appendChild(formCard);

    currentSaveContext = { form, reviewGoals };
    reviewLeaveHandler = () => {
      if (autosaveTimer) {
        flushAutosave(false);
        return;
      }
      saveCurrentReview(false);
    };
    setAutosaveLabel(t('review.saved'));

    form.addEventListener('input', scheduleAutosave);
    form.addEventListener('change', scheduleAutosave);

    if (window.lucide) window.lucide.createIcons();
  }

  function createReviewGoalCard(goal, review) {
    const area = getAreaById(goal.areaId);
    const areaName = area ? area.name : t('common.unknown');
    const areaColor = area ? area.color : '#6366F1';

    let isAchieved = false;
    let commentText = '';

    if (review?.goals?.[goal.id]) {
      isAchieved = !!review.goals[goal.id].achieved;
      commentText = review.goals[goal.id].comment || '';
    } else if (goal.category === 'projects' && goal.status === 'completed') {
      isAchieved = true;
    }

    const checkbox = el('input', {
      type: 'checkbox',
      id: `achieved-${goal.id}`,
      checked: isAchieved,
      style: 'cursor: pointer; accent-color: var(--accent-primary); width: 16px; height: 16px; margin: 0;'
    });

    const checkLabel = el('label', {
      htmlFor: `achieved-${goal.id}`,
      style: 'display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 550; cursor: pointer; color: var(--text-primary); user-select: none;'
    }, checkbox, el('span', {}, '達成'));

    const textarea = el('textarea', {
      id: `comment-${goal.id}`,
      className: 'form-input form-textarea',
      placeholder: 'この項目の振り返りを書いてください...',
      rows: '2',
      style: 'margin-top: 8px; font-size: 0.82rem; resize: vertical; min-height: 48px;'
    });
    textarea.value = commentText;

    let metaText = '';
    if (goal.category === 'routines' && goal.frequency) {
      const frequencyMap = {
        daily: t('frequency.daily'),
        weekly: t('frequency.weekly'),
        monthly: t('frequency.monthly'),
        custom: goal.frequencyCustom || t('frequency.custom')
      };
      const doneDays = getRoutineCompletionDaysInMonth(goal, selectedMonth);
      const doneDaysText = doneDays.length > 0
        ? t('routine.completedCount', doneDays.length)
        : t('routine.noCompletedDaysInMonth');
      metaText = `${t('dashboard.colFrequency')}: ${frequencyMap[goal.frequency] || goal.frequency} / ${doneDaysText}`;
    } else if (goal.category === 'projects') {
      const progress = getSubtaskProgress(goal.subtasks);
      const progressPct = progress ? `${progress.percent}%` : '0%';
      const dueStr = goal.dueDate
        ? `${t('dashboard.colDueDate')}: ${formatDate(goal.dueDate)}`
        : `${t('dashboard.colDueDate')}: ${t('dashboard.noDueSoon')}`;
      metaText = `${t('dashboard.colProgress')}: ${progressPct} / ${dueStr}`;
    }

    return el('div', {
      className: 'glass-card',
      style: 'padding: 14px; border: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 4px; background: rgba(255, 255, 255, 0.015);'
    },
    el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;' },
      el('button', {
        type: 'button',
        style: 'display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; background: transparent; border: 0; padding: 0; cursor: pointer; text-align: left;',
        onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, () => renderMonthlyReview(container))
      },
        el('span', { style: `width: 8px; height: 8px; border-radius: 50%; background: ${areaColor}; flex-shrink: 0;` }),
        el('div', { style: 'min-width: 0;' },
          el('span', { style: 'font-size: 0.88rem; font-weight: 600; color: var(--text-primary); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }, goal.title),
          el('span', { style: 'font-size: 0.72rem; color: var(--text-secondary);' }, `${areaName} / ${metaText}`)
        )
      ),
      checkLabel
    ),
    textarea);
  }

  function renderPastReviews(section) {
    const existingList = section.querySelector('.past-reviews-list');
    if (existingList) existingList.remove();
    const existingEmpty = section.querySelector('.empty-state');
    if (existingEmpty) existingEmpty.remove();

    const reviews = getAllReviews().sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

    if (reviews.length === 0) {
      section.appendChild(
        el('div', { className: 'empty-state small' },
          el('p', {}, t('review.noReviews'))
        )
      );
    } else {
      const list = el('div', { className: 'past-reviews-list' });
      reviews.forEach(review => {
        const hasGoalsContent = review.goals && Object.values(review.goals).some(item => item.comment && item.comment.trim().length > 0);
        const hasOverall = review.overallReview && review.overallReview.trim().length > 0;
        const hasContent = hasGoalsContent || hasOverall;

        const item = el('div', {
          className: 'past-review-item',
          onClick: () => {
            flushAutosave(false);
            monthSelect.value = review.yearMonth;
            selectedMonth = review.yearMonth;
            renderReviewForm();
            reviewContainer.scrollIntoView({ behavior: 'smooth' });
          }
        },
        el('span', { className: 'past-review-month' }, formatYearMonthI18n(review.yearMonth)),
        el('span', { className: `past-review-status ${hasContent ? 'written' : ''}` },
          hasContent ? t('review.written') : t('review.notWritten')
        ));
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderReviewForm();
  if (window.lucide) window.lucide.createIcons();
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = el('div', { className: 'toast' },
    el('i', { 'data-lucide': 'check-circle' }),
    el('span', {}, message)
  );
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('active'));

  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 2500);

  if (window.lucide) window.lucide.createIcons();
}
