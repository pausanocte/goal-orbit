// ==========================================
// Orbit v3 - アーカイブコンポーネント
// ==========================================

import { el, clearElement, PRIORITY_CONFIG, FREQUENCY_CONFIG, formatDate, formatRoutineFrequency, getSubtaskProgress } from '../utils.js';
import { t } from '../i18n.js';
import { getArchivedGoals, unarchiveGoal, deleteGoal, getAllAreas, getAreaById, updateArea, deleteArea } from '../store.js';
import { openGoalModal } from './goal-modal.js?v=20260714-7';

export function renderArchives(container, onRefresh) {
  clearElement(container);

  // ページヘッダー
  const header = el('div', { className: 'page-header' },
    el('div', {},
      el('h1', { className: 'page-title' },
        el('i', { 'data-lucide': 'archive' }),
        el('span', {}, ` ${t('archives.title')}`)
      ),
      el('p', { className: 'page-subtitle' }, t('archives.subtitle'))
    )
  );
  container.appendChild(header);

  // フィルター
  let currentAreaFilter = 'all';
  const filterBar = el('div', { className: 'filter-bar' });
  const filterGroup = el('div', { className: 'filter-group' },
    el('span', { className: 'filter-label' }, t('archives.areaFilter'))
  );

  const allAreas = getAllAreas();
  const areaFilters = [
    { value: 'all', label: t('area.all') },
    ...allAreas.map(a => ({ value: a.id, label: a.name }))
  ];

  areaFilters.forEach(f => {
    const btn = el('button', {
      className: `filter-chip${currentAreaFilter === f.value ? ' active' : ''}`,
      onClick: () => {
        currentAreaFilter = f.value;
        renderArchiveList();
        filterGroup.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
      }
    }, f.label);
    filterGroup.appendChild(btn);
  });
  filterBar.appendChild(filterGroup);
  container.appendChild(filterBar);

  // アーカイブリスト
  const archivedAreasSection = el('div', { className: 'glass-card', style: 'margin-bottom: 16px;' });
  container.appendChild(archivedAreasSection);

  const listContainer = el('div', { className: 'goals-grid' });
  container.appendChild(listContainer);

  function renderArchiveList() {
    clearElement(archivedAreasSection);
    clearElement(listContainer);

    const archivedAreas = getAllAreas()
      .filter(area => area.archived)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    archivedAreasSection.appendChild(
      el('div', { className: 'card-header-flex', style: 'margin-bottom: 12px;' },
        el('h2', { className: 'card-title', style: 'margin-bottom: 0;' },
          el('i', { 'data-lucide': 'folder-archive' }),
          el('span', {}, ' アーカイブ済みArea')
        )
      )
    );

    if (archivedAreas.length === 0) {
      archivedAreasSection.appendChild(
        el('div', { className: 'empty-state small' },
          el('p', {}, 'アーカイブ済みのAreaはありません')
        )
      );
    } else {
      const archivedAreaList = el('div', { className: 'goals-grid' });
      archivedAreas.forEach((area, index) => {
        archivedAreaList.appendChild(createArchivedAreaCard(area, index, onRefresh));
      });
      archivedAreasSection.appendChild(archivedAreaList);
    }

    let archived = getArchivedGoals();
    if (currentAreaFilter !== 'all') {
      archived = archived.filter(g => g.areaId === currentAreaFilter);
    }
    archived.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (archived.length === 0) {
      listContainer.appendChild(
        el('div', { className: 'empty-state' },
          el('i', { 'data-lucide': 'archive' }),
          el('p', {}, t('archives.noArchives')),
          el('p', { className: 'empty-state-sub' }, t('archives.noArchivesSub'))
        )
      );
    } else {
      archived.forEach((goal, index) => {
        const card = createArchiveCard(goal, index, onRefresh);
        listContainer.appendChild(card);
      });
    }

    if (window.lucide) window.lucide.createIcons();
  }

  renderArchiveList();
  if (window.lucide) window.lucide.createIcons();
}

function createArchivedAreaCard(area, index, onRefresh) {
  const card = el('div', {
    className: 'goal-card archived-card',
    style: `animation-delay: ${index * 0.05}s; border-top: 3px solid ${area.color}`
  });

  const cardHeader = el('div', { className: 'goal-card-header' },
    el('div', {
      className: 'status-badge',
      style: `color: ${area.color}; border-color: ${area.color}`
    }, 'Area'),
    el('div', { className: 'goal-card-actions' },
      el('button', {
        className: 'icon-btn',
        title: '復元',
        onClick: () => {
          updateArea(area.id, { completedDate: null });
          onRefresh();
        }
      },
        el('i', { 'data-lucide': 'undo-2' })
      ),
      el('button', {
        className: 'icon-btn',
        title: '完全削除',
        onClick: () => {
          if (confirm(`「${area.name}」を完全に削除しますか？`)) {
            deleteArea(area.id);
            onRefresh();
          }
        }
      },
        el('i', { 'data-lucide': 'trash-2' })
      )
    )
  );
  card.appendChild(cardHeader);

  card.appendChild(el('h3', { className: 'goal-card-title' }, area.name));

  if (area.description) {
    card.appendChild(el('p', { className: 'goal-card-desc' }, area.description));
  }

  card.appendChild(
    el('div', { className: 'goal-card-meta' },
      el('span', { className: 'goal-card-date' },
        el('i', { 'data-lucide': 'calendar' }),
        el('span', {}, `${t('common.start')}: ${area.startDate ? formatDate(area.startDate) : '-'}`)
      ),
      el('span', { className: 'goal-card-date' },
        el('i', { 'data-lucide': 'clock' }),
        el('span', {}, `${t('common.completed')}: ${area.completedDate ? formatDate(area.completedDate) : '-'}`)
      )
    )
  );

  return card;
}

function createArchiveCard(goal, index, onRefresh) {
  const area = getAreaById(goal.areaId);
  const areaName = area ? area.name : t('common.unknown');
  const areaColor = area ? area.color : '#6366F1';
  
  const priorityConf = PRIORITY_CONFIG[goal.priority] || { labelKey: 'priority.medium', color: '#FBBF24' };

  const card = el('div', {
    className: 'goal-card archived-card',
    style: `animation-delay: ${index * 0.05}s; border-top: 3px solid ${areaColor}; cursor: pointer;`,
    onClick: () => openGoalModal(goal.id, { areaId: goal.areaId, category: goal.category }, onRefresh)
  });

  // ヘッダー
  const cardHeader = el('div', { className: 'goal-card-header' },
    el('div', {
      className: 'status-badge',
      style: `color: ${areaColor}; border-color: ${areaColor}`
    }, areaName),
    el('div', { className: 'goal-card-actions' },
      el('button', {
        className: 'icon-btn',
        title: t('archives.restore'),
        onClick: (e) => {
          e.stopPropagation();
          unarchiveGoal(goal.id);
          onRefresh();
        }
      },
        el('i', { 'data-lucide': 'undo-2' })
      ),
      el('button', {
        className: 'icon-btn',
        title: t('archives.permanentDelete'),
        onClick: (e) => {
          e.stopPropagation();
          if (confirm(t('archives.confirmDelete', goal.title))) {
            deleteGoal(goal.id);
            onRefresh();
          }
        }
      },
        el('i', { 'data-lucide': 'trash-2' })
      )
    )
  );
  card.appendChild(cardHeader);

  // タイトル
  card.appendChild(el('h3', { className: 'goal-card-title' }, goal.title));

  // 説明
  if (goal.description) {
    card.appendChild(el('p', { className: 'goal-card-desc' }, goal.description));
  }

  // Projects: サブタスク進捗
  if (goal.category === 'projects' && goal.subtasks && goal.subtasks.length > 0) {
    const progress = getSubtaskProgress(goal.subtasks);
    card.appendChild(
      el('div', { className: 'subtask-progress' },
        el('div', { className: 'subtask-progress-bar' },
          el('div', { className: 'subtask-progress-fill', style: `width: ${progress.percent}%` })
        ),
        el('span', { className: 'subtask-progress-text' }, t('subtasks.progress', progress.completed, progress.total))
      )
    );
  }

  // Routines: 頻度バッジ
  if (goal.category === 'routines' && goal.frequency) {
    const freqConf = FREQUENCY_CONFIG[goal.frequency] || { labelKey: 'frequency.daily', color: '#F472B6' };
    const freqText = formatRoutineFrequency(goal) || t(freqConf.labelKey);
    card.appendChild(
      el('div', { className: 'goal-card-frequency' },
        el('div', { className: 'frequency-badge', style: `color: ${freqConf.color}; border-color: ${freqConf.color}` },
          el('i', { 'data-lucide': 'repeat' }),
          el('span', {}, freqText)
        )
      )
    );
  }

  // メタ情報
  card.appendChild(
    el('div', { className: 'goal-card-meta' },
      el('div', {
        className: `priority-badge priority-${goal.priority}`,
        style: `color: ${priorityConf.color}; border-color: ${priorityConf.color}`
      },
        el('i', { 'data-lucide': 'flag' }),
        el('span', {}, t(priorityConf.labelKey))
      ),
      el('span', { className: 'goal-card-date' },
        el('i', { 'data-lucide': 'clock' }),
        el('span', {}, formatDate(goal.updatedAt))
      )
    )
  );

  return card;
}
