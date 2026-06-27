// ==========================================
// Orbit - Area追加/編集モーダルコンポーネント
// ==========================================

import { el, AREA_COLORS, AREA_ICONS, createDatePicker } from '../utils.js';
import { t } from '../i18n.js';
import { addArea, updateArea, getAreaById, canAddArea } from '../store.js';

let modalOverlay = null;

export function openAreaModal(areaId = null, onSave = null) {
  if (!areaId && !canAddArea()) {
    alert(`${t('limit.areaReached')}\n${t('limit.unlockHint')}`);
    return;
  }
  closeAreaModal();

  const isEdit = !!areaId;
  const area = isEdit ? getAreaById(areaId) : null;

  let selectedColor = area?.color || AREA_COLORS[0];
  let selectedIcon = area?.icon || AREA_ICONS[0];

  modalOverlay = el('div', { className: 'modal-overlay', onClick: (e) => {
    if (e.target === modalOverlay) closeAreaModal();
  }});

  const modal = el('div', { className: 'modal modal-area' });

  // ヘッダー
  const header = el('div', { className: 'modal-header' },
    el('h2', { className: 'modal-title' }, isEdit ? t('areaModal.editTitle') : t('areaModal.addTitle')),
    el('button', { className: 'modal-close', onClick: closeAreaModal },
      el('i', { 'data-lucide': 'x' })
    )
  );
  modal.appendChild(header);

  // フォーム
  const form = el('form', { className: 'modal-form', onSubmit: (e) => {
    e.preventDefault();
    const startDate = startDatePicker.getValue();
    const completedDate = completedDatePicker.getValue();
    handleSubmit(e.target, isEdit, areaId, selectedColor, selectedIcon, startDate, completedDate, onSave);
  }});

  // 名前
  form.appendChild(createField(t('areaModal.name'),
    el('input', {
      type: 'text',
      name: 'name',
      className: 'form-input',
      placeholder: t('areaModal.namePlaceholder'),
      value: area?.name || '',
      required: 'required'
    })
  ));

  // 説明
  const descTextarea = el('textarea', {
    name: 'description',
    className: 'form-input form-textarea',
    placeholder: t('areaModal.descPlaceholder'),
    rows: '3'
  });
  descTextarea.value = area?.description || '';
  form.appendChild(createField(t('areaModal.description'), descTextarea));

  // 開始日と完了日を横並びで配置
  let startDateValue = area?.startDate || null;
  let completedDateValue = area?.completedDate || null;

  const startDatePicker = createDatePicker(startDateValue, (v) => { startDateValue = v; });
  const completedDatePicker = createDatePicker(completedDateValue, (v) => { completedDateValue = v; });

  const datesContainer = el('div', { style: 'display: flex; gap: 16px; margin-bottom: 16px;' });
  
  datesContainer.appendChild(el('div', { style: 'flex: 1; min-width: 0;' },
    el('label', { className: 'form-label' }, t('areaModal.startDate')),
    startDatePicker
  ));

  datesContainer.appendChild(el('div', { style: 'flex: 1; min-width: 0;' },
    el('label', { className: 'form-label' }, t('areaModal.completedDate')),
    completedDatePicker
  ));

  form.appendChild(datesContainer);

  // カラー選択グリッド
  const colorGrid = el('div', { className: 'color-selector-grid' });
  AREA_COLORS.forEach(color => {
    const btn = el('button', {
      type: 'button',
      className: `color-select-btn${color === selectedColor ? ' active' : ''}`,
      style: `background-color: ${color};`,
      onClick: () => {
        form.querySelectorAll('.color-select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = color;
      }
    });
    colorGrid.appendChild(btn);
  });
  form.appendChild(createField(t('areaModal.color'), colorGrid));

  // アイコン選択グリッド
  const iconGrid = el('div', { className: 'icon-selector-grid' });
  AREA_ICONS.forEach(icon => {
    const btn = el('button', {
      type: 'button',
      className: `icon-select-btn${icon === selectedIcon ? ' active' : ''}`,
      onClick: () => {
        form.querySelectorAll('.icon-select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedIcon = icon;
      }
    }, el('i', { 'data-lucide': icon }));
    iconGrid.appendChild(btn);
  });
  form.appendChild(createField(t('areaModal.icon'), iconGrid));

  // ボタン
  const buttons = el('div', { className: 'modal-buttons' },
    el('button', { type: 'button', className: 'btn btn-ghost', onClick: closeAreaModal }, t('areaModal.cancel')),
    el('button', { type: 'submit', className: 'btn btn-primary' }, isEdit ? t('areaModal.update') : t('areaModal.add'))
  );
  form.appendChild(buttons);

  modal.appendChild(form);
  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);

  requestAnimationFrame(() => {
    modalOverlay.classList.add('active');
    modal.classList.add('active');
  });

  if (window.lucide) window.lucide.createIcons();
  form.querySelector('input[name="name"]').focus();
}

export function closeAreaModal() {
  if (modalOverlay) {
    modalOverlay.classList.remove('active');
    const modal = modalOverlay.querySelector('.modal');
    if (modal) modal.classList.remove('active');
    setTimeout(() => {
      modalOverlay?.remove();
      modalOverlay = null;
    }, 200);
  }
}

function handleSubmit(form, isEdit, areaId, color, icon, startDate, completedDate, onSave) {
  const name = form.name.value.trim();
  const description = form.description.value.trim();

  if (!name) return;

  let result = null;
  if (isEdit) {
    result = updateArea(areaId, { name, description, color, icon, startDate, completedDate });
  } else {
    try {
      result = addArea({ name, description, color, icon, startDate, completedDate });
    } catch (err) {
      if (err?.message === 'FREE_LIMIT_AREA_REACHED') {
        alert(`${t('limit.areaReached')}\n${t('limit.unlockHint')}`);
        return;
      }
      throw err;
    }
  }

  closeAreaModal();
  if (onSave) onSave(result);
}

function createField(label, input) {
  return el('div', { className: 'form-field' },
    el('label', { className: 'form-label' }, label),
    input
  );
}
