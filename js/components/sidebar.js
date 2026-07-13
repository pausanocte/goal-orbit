// ==========================================
// Orbit v3 - サイドバーコンポーネント
// ==========================================

import { el } from '../utils.js';
import { t, toggleLang, getLang } from '../i18n.js';
import { exportData, importData, getActiveAreas, getAllGoals, getFreeItemLimit, isPremiumUnlocked } from '../store.js';
import { openAreaModal } from './area-modal.js';
import { appState, retryDriveSync } from '../app.js?v=20260714-6';
import { handleAuthClick, handleSignoutClick, isDriveAuthorized, getUserInfo } from '../services/drive-api.js?v=20260714-6';
import { isPremiumPurchaseConfigured, startPremiumPurchase } from '../services/premium-api.js?v=20260714-6';

export function renderSidebar(container, currentPage, onNavigate) {
  container.innerHTML = '';
  const lang = getLang();
  const freeItemLimit = getFreeItemLimit();
  const allGoals = getAllGoals();
  const usage = {
    areas: getActiveAreas().length,
    routines: allGoals.filter(goal => goal.category === 'routines').length,
    projects: allGoals.filter(goal => goal.category === 'projects').length,
    resources: allGoals.filter(goal => goal.category === 'resources').length
  };

  // 閉じるボタン
  const closeBtn = el('button', {
    className: 'sidebar-close-btn',
    title: 'サイドバーを閉じる',
    onClick: (e) => {
      e.stopPropagation();
      document.querySelector('.app-layout').classList.add('sidebar-collapsed');
    }
  },
    el('i', { 'data-lucide': 'chevron-left' })
  );

  // Drive Sync Section
  const syncSection = el('div', { className: 'sidebar-sync-section', style: 'margin-top: 12px; width: 100%; border-top: 1px dashed var(--border-subtle); padding-top: 12px;' });
  
  if (appState.syncStatus === 'init') {
    syncSection.appendChild(el('div', { style: 'font-size: 12px; color: var(--text-tertiary);' }, 'Loading Google APIs...'));
  } else if (appState.syncStatus === 'error' && !isDriveAuthorized()) {
    syncSection.appendChild(el('div', {
      style: 'font-size: 11px; color: var(--text-tertiary); line-height: 1.5; margin-bottom: 8px;'
    }, lang === 'ja' ? 'Google連携を読み込めませんでした。アプリはそのまま使えます。' : 'Google sync could not be loaded. You can keep using the app.'));
    syncSection.appendChild(el('button', {
      className: 'sidebar-action-btn',
      style: 'background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); justify-content: center; width: 100%;',
      onClick: () => window.location.reload()
    },
      el('i', { 'data-lucide': 'refresh-cw' }),
      el('span', {}, lang === 'ja' ? '再読み込み' : 'Reload')
    ));
  } else if (!isDriveAuthorized()) {
    const loginBtn = el('button', {
      className: 'sidebar-action-btn',
      style: 'background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-subtle); justify-content: center; width: 100%;',
      onClick: handleAuthClick
    }, 
      el('i', { 'data-lucide': 'cloud' }),
      el('span', {}, 'Enable Cloud Sync')
    );
    syncSection.appendChild(loginBtn);
  } else {
    // Authorized
    const userInfo = getUserInfo();
    let userRow = null;
    if (userInfo) {
      userRow = el('div', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 10px; width: 100%;' },
        userInfo.picture 
          ? el('img', { 
              src: userInfo.picture, 
              referrerpolicy: 'no-referrer',
              style: 'width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--border-light);' 
            }) 
          : el('i', { 'data-lucide': 'user', style: 'width: 24px; height: 24px; color: var(--text-secondary);' }),
        el('div', { style: 'display: flex; flex-direction: column; min-width: 0; flex: 1;' },
          userInfo.name ? el('span', { style: 'font-size: 11px; font-weight: 550; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }, userInfo.name) : null,
          el('span', { style: 'font-size: 9px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' }, userInfo.email)
        )
      );
    }

    const statusRow = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; width: 100%;' });
    
    let statusText = 'Synced';
    let statusIcon = 'check-circle';
    let statusColor = 'var(--text-secondary)';
    
    if (appState.syncStatus === 'syncing') {
      statusText = 'Syncing...';
      statusIcon = 'refresh-cw';
      statusColor = '#6366F1';
    } else if (appState.syncStatus === 'error') {
      statusText = 'Sync Error';
      statusIcon = 'alert-circle';
      statusColor = '#EF4444';
    } else if (appState.syncStatus === 'conflict') {
      statusText = 'Sync Paused';
      statusIcon = 'pause-circle';
      statusColor = '#F59E0B';
    }
    
    const indicator = el('div', { style: `display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${statusColor};` },
      el('i', { 'data-lucide': statusIcon, style: `width: 14px; height: 14px; ${appState.syncStatus === 'syncing' ? 'animation: spin 2s linear infinite;' : ''}` }),
      el('span', {}, statusText)
    );
    
    const actionBtn = el('button', {
      style: 'background: none; border: none; font-size: 11px; color: var(--text-tertiary); cursor: pointer; text-decoration: underline;',
      onClick: appState.syncStatus === 'conflict' ? retryDriveSync : handleSignoutClick
    }, appState.syncStatus === 'conflict' ? 'Choose' : 'Disconnect');
    
    if (userRow) syncSection.appendChild(userRow);
    statusRow.appendChild(indicator);
    statusRow.appendChild(actionBtn);
    syncSection.appendChild(statusRow);
  }

  // ロゴ
  const logo = el('div', { className: 'sidebar-logo', style: 'display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 20px; border-bottom: 1px solid var(--border-subtle); width: 100%;' },
    el('div', { style: 'display: flex; align-items: center; justify-content: space-between; width: 100%;' },
      el('div', { style: 'display: flex; align-items: center; gap: 12px;' },
        el('div', { className: 'sidebar-logo-icon' },
          el('i', { 'data-lucide': 'orbit' })
        ),
        el('span', { className: 'sidebar-logo-text' }, 'Orbit')
      ),
      closeBtn
    ),
    syncSection
  );
  container.appendChild(logo);

  // ナビゲーション
  const nav = el('nav', { className: 'sidebar-nav' });

  // メニューセクション
  const mainSection = el('div', { className: 'sidebar-section' },
    el('span', { className: 'sidebar-section-label' }, t('sidebar.menu'))
  );
  mainSection.appendChild(createNavItem({
    id: 'dashboard',
    label: t('sidebar.dashboard'),
    icon: 'layout-dashboard'
  }, currentPage, onNavigate));
  mainSection.appendChild(createNavItem({
    id: 'today',
    label: lang === 'ja' ? '今日見る' : 'Today',
    icon: 'sun-medium'
  }, currentPage, onNavigate));
  nav.appendChild(mainSection);

  // Areas セクション
  const areaSection = el('div', { className: 'sidebar-section' },
    el('span', { className: 'sidebar-section-label' }, t('sidebar.areas'))
  );

  // Area追加ボタン
  const addAreaBtn = el('button', {
    className: 'sidebar-add-area-btn',
    onClick: () => {
      openAreaModal(null, () => {
        // Area追加成功時にサイドバーおよび現在のページを再描画
        renderSidebar(container, currentPage, onNavigate);
        onNavigate(currentPage);
      });
    }
  },
    el('i', { 'data-lucide': 'plus' }),
    el('span', {}, t('sidebar.addArea'))
  );
  areaSection.appendChild(addAreaBtn);

  // 動的Areaリスト
  const areas = getActiveAreas();
  areas.forEach(area => {
    const isAreaActive = currentPage === `area-${area.id}`;
    const areaItem = el('a', {
      className: `sidebar-nav-item area-nav-item${isAreaActive ? ' active' : ''}`,
      href: '#',
      dataset: { page: `area-${area.id}` },
      onClick: (e) => {
        e.preventDefault();
        onNavigate(`area-${area.id}`);
      }
    },
      el('i', { 'data-lucide': area.icon || 'star' }),
      el('span', {}, area.name)
    );
    areaItem.style.setProperty('--area-color', area.color || '#6366F1');
    areaSection.appendChild(areaItem);
  });

  nav.appendChild(areaSection);

  // その他セクション
  const otherSection = el('div', { className: 'sidebar-section' },
    el('span', { className: 'sidebar-section-label' }, t('sidebar.other'))
  );
  
  otherSection.appendChild(createNavItem({
    id: 'monthly-review',
    label: t('sidebar.monthlyReview'),
    icon: 'calendar-check'
  }, currentPage, onNavigate));

  otherSection.appendChild(createNavItem({
    id: 'archives',
    label: t('sidebar.archives'),
    icon: 'archive'
  }, currentPage, onNavigate));

  nav.appendChild(otherSection);

  const scrollArea = el('div', { className: 'sidebar-scroll-area' });
  scrollArea.appendChild(nav);

  // データ管理セクション
  const dataSection = el('div', { className: 'sidebar-data-section' });

  if (!isPremiumUnlocked()) {
    const freePlanCard = el('div', {
      className: 'glass-card',
      style: 'padding: 12px; margin-bottom: 12px; width: 100%; background: rgba(255,255,255,0.03);'
    },
      el('div', { style: 'font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;' }, t('premium.freeUsage')),
      el('div', { style: 'display: grid; gap: 6px; font-size: 11px; color: var(--text-secondary);' },
        createFreeUsageRow('Areas', usage.areas, freeItemLimit),
        createFreeUsageRow('Projects', usage.projects, freeItemLimit),
        createFreeUsageRow('Resources', usage.resources, freeItemLimit),
        createFreeUsageRow('Routines', usage.routines, freeItemLimit)
      )
    );
    dataSection.appendChild(freePlanCard);

    const purchaseConfigured = isPremiumPurchaseConfigured();
    const purchaseMessage = el('div', {
      style: 'margin-bottom: 8px; font-size: 10px; line-height: 1.5; color: var(--text-tertiary);'
    }, purchaseConfigured ? t('premium.unlockMessage') : t('premium.preparing'));
    const licenseCard = el('div', {
      className: 'glass-card',
      style: 'padding: 12px; margin-bottom: 12px; width: 100%; background: rgba(255,255,255,0.03);'
    },
      el('div', { style: 'font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;' }, t('premium.unlock')),
      purchaseMessage,
      el('button', {
        className: 'sidebar-action-btn',
        style: 'justify-content: center; width: 100%; margin-top: 4px;',
        disabled: !purchaseConfigured,
        onClick: async () => {
          if (!isDriveAuthorized()) {
            alert(lang === 'ja' ? '先にGoogleへログインしてください' : 'Please sign in with Google first');
            return;
          }
          try {
            await startPremiumPurchase();
          } catch (err) {
            console.error('Checkout failed', err);
            const detail = err?.message ? `\n\n${err.message}` : '';
            alert((lang === 'ja' ? '購入画面を開けませんでした。時間をおいて再度お試しください。' : 'Could not open checkout. Please try again.') + detail);
            return;
            alert(lang === 'ja' ? '購入画面を開けませんでした。時間をおいて再度お試しください。' : 'Could not open checkout. Please try again.');
          }
        }
      }, el('i', { 'data-lucide': 'credit-card' }), el('span', {}, purchaseConfigured ? t('premium.buy') : t('premium.comingSoon')))
    );
    dataSection.appendChild(licenseCard);
  }

  // エクスポートボタン
  const exportBtn = el('button', {
    className: 'sidebar-action-btn',
    onClick: () => {
      exportData();
      showToast(t('export.success'));
    }
  },
    el('i', { 'data-lucide': 'download' }),
    el('span', {}, t('sidebar.export'))
  );
  dataSection.appendChild(exportBtn);

  // インポートボタン
  const importInput = el('input', {
    type: 'file',
    accept: '.json',
    style: 'display:none',
    onChange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm(t('import.confirm'))) {
        importInput.value = '';
        return;
      }
      try {
        await importData(file);
        showToast(t('import.success'));
        renderSidebar(container, currentPage, onNavigate);
        onNavigate(currentPage);
      } catch {
        alert(t('import.error'));
      }
      importInput.value = '';
    }
  });

  const importBtn = el('button', {
    className: 'sidebar-action-btn',
    onClick: () => importInput.click()
  },
    el('i', { 'data-lucide': 'upload' }),
    el('span', {}, t('sidebar.import'))
  );
  dataSection.appendChild(importBtn);
  dataSection.appendChild(importInput);

  scrollArea.appendChild(dataSection);
  container.appendChild(scrollArea);

  // テーマ切り替えボタン
  const currentTheme = localStorage.getItem('orbit_theme') || 'dark';
  const themeToggleBtn = el('button', {
    className: 'theme-toggle-btn',
    style: 'background: transparent; border: 1px solid var(--border-subtle); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); margin-right: 8px;',
    title: currentTheme === 'light' ? 'ダークモードへ' : 'ライトモードへ',
    onClick: () => {
      const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
      if (nextTheme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
      localStorage.setItem('orbit_theme', nextTheme);
      renderSidebar(container, currentPage, onNavigate);
    }
  },
    el('i', { 'data-lucide': currentTheme === 'light' ? 'moon' : 'sun', style: 'width: 14px; height: 14px;' })
  );

  // フッター
  const footer = el('div', { className: 'sidebar-footer' },
    el('span', { className: 'sidebar-footer-text' }, 'Orbit v3.0'),
    el('div', { style: 'display: flex; align-items: center;' },
      themeToggleBtn,
      el('button', {
        className: 'lang-toggle-btn',
        onClick: () => {
          toggleLang();
          renderSidebar(container, currentPage, onNavigate);
          onNavigate(currentPage);
        }
      }, getLang() === 'ja' ? '🌐 EN' : '🌐 JP')
    )
  );
  container.appendChild(footer);

  if (window.lucide) window.lucide.createIcons();
}

function createNavItem(item, currentPage, onNavigate) {
  const isActive = currentPage === item.id;

  const navItem = el('a', {
    className: `sidebar-nav-item${isActive ? ' active' : ''}`,
    href: '#',
    dataset: { page: item.id },
    onClick: (e) => {
      e.preventDefault();
      onNavigate(item.id);
    }
  },
    el('i', { 'data-lucide': item.icon }),
    el('span', {}, item.label)
  );

  return navItem;
}

function createFreeUsageRow(label, used, limit) {
  return el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 8px;' },
    el('span', {}, label),
    el('span', { style: 'color: var(--text-primary); font-variant-numeric: tabular-nums;' }, `${used}/${limit}`)
  );
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
