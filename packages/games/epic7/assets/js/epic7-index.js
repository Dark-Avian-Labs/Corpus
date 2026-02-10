// Epic Seven index page logic
// Reads configuration from window.EPIC7_CONFIG set by a small inline bootstrap in the template.

const cfg = window.EPIC7_CONFIG || {};
const BASE_PATH = cfg.basePath || '';
const API_URL = `${BASE_PATH}/api`;
const ICONS_BASE = `${BASE_PATH}/assets/icons`;
const SHARED_ICONS = '/shared/icons';
const CSRF_TOKEN = cfg.csrfToken || '';
const HERO_CLASSES = cfg.heroClasses;
const ARTIFACT_CLASSES = cfg.artifactClasses;
const ELEMENTS = cfg.elements;
const HERO_RATINGS = cfg.heroRatings;
const RATING_COLORS = cfg.ratingColors;
const GAUGE_COLORS = cfg.gaugeColors;
const CLASS_NAMES = cfg.classNames;
const ELEMENT_NAMES = cfg.elementNames;
const GAUGE_MAX = cfg.gaugeMax;
const GAUGE_FILLED = cfg.gaugeFilled;
const GAUGE_EMPTY = cfg.gaugeEmpty;

let currentTab = 'heroes';
let currentData = null;
let accounts = [];
let currentAccountId = null;
let searchTerm = '';
let activeFilters = { class: null, element: null };
let editMode = false;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await loadAccounts();
    setupEventListeners();
    if (currentAccountId) await loadData();
  } catch (err) {
    console.error('Init error:', err);
    showError(`Failed to initialize: ${err.message}`);
  }
}

function setupEventListeners() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  });
  const searchInput = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    searchClear.classList.toggle('visible', e.target.value.length > 0);
    renderTable();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchTerm = '';
    searchClear.classList.remove('visible');
    renderTable();
  });
  document.getElementById('account-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('account-dropdown');
    const btn = document.getElementById('account-btn');
    dd.classList.toggle('show');
    const open = dd.classList.contains('show');
    btn.setAttribute('aria-expanded', open);
    dd.setAttribute('aria-hidden', !open);
  });
  document.addEventListener('click', () => {
    const dd = document.getElementById('account-dropdown');
    const btn = document.getElementById('account-btn');
    if (dd && dd.classList.contains('show')) {
      dd.classList.remove('show');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      dd.setAttribute('aria-hidden', 'true');
    }
  });
  document
    .getElementById('manage-accounts-btn')
    .addEventListener('click', openManageAccountsModal);
  document
    .getElementById('manage-accounts-close')
    .addEventListener('click', closeManageAccountsModal);
  document
    .getElementById('manage-accounts-modal')
    .addEventListener('click', (e) => {
      if (e.target.id === 'manage-accounts-modal') closeManageAccountsModal();
    });
  document
    .getElementById('add-new-account-btn')
    .addEventListener('click', () => {
      closeManageAccountsModal();
      openAddAccountModal();
    });
  document
    .getElementById('add-account-cancel')
    .addEventListener('click', closeAddAccountModal);
  document
    .getElementById('add-account-modal')
    .addEventListener('click', (e) => {
      if (e.target.id === 'add-account-modal') closeAddAccountModal();
    });
  document
    .getElementById('add-account-form')
    .addEventListener('submit', handleAddAccount);
  document
    .getElementById('edit-mode-btn')
    .addEventListener('click', toggleEditMode);
  document
    .getElementById('add-item-btn')
    .addEventListener('click', openAddItemModal);
  document
    .getElementById('add-item-cancel')
    .addEventListener('click', closeAddItemModal);
  document.getElementById('add-item-modal').addEventListener('click', (e) => {
    if (e.target.id === 'add-item-modal') closeAddItemModal();
  });
  document
    .getElementById('add-item-form')
    .addEventListener('submit', handleAddItem);
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('edit-mode-btn');
  if (editMode) {
    btn.classList.add('active');
    btn.textContent = 'Done Editing';
    document.body.classList.add('edit-mode');
  } else {
    btn.classList.remove('active');
    btn.textContent = 'Edit Mode';
    document.body.classList.remove('edit-mode');
  }
  const h = document.querySelector('.actions-header');
  if (h) h.classList.toggle('hidden', !editMode);
}

async function loadAccounts() {
  try {
    const r = await fetch(`${API_URL}?action=accounts`);
    if (!r.ok) {
      const t = await r.text();
      let msg = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(t);
        if (j.error) msg = j.error;
      } catch {
        if (t) msg += ` - ${t.slice(0, 200)}`;
      }
      showError(msg);
      return;
    }
    const d = await r.json();
    if (d.error) {
      showError(d.error);
      return;
    }
    accounts = d.accounts;
    currentAccountId = d.current_account_id;
    renderAccountDropdown();
  } catch (err) {
    showError(`Failed to load accounts: ${err.message}`);
  }
}

function renderAccountDropdown() {
  const list = document.getElementById('account-list');
  const nameEl = document.getElementById('current-account-name');
  if (!accounts || accounts.length === 0) {
    nameEl.textContent = 'No Account';
    list.innerHTML =
      '<div class="account-dropdown-item text-muted" role="menuitem" aria-disabled="true">No accounts yet</div>';
    showNoAccountMessage();
    return;
  }
  const cur = accounts.find((a) => a.id == currentAccountId);
  nameEl.textContent = cur
    ? cur.account_name
    : accounts[0]
      ? accounts[0].account_name
      : 'No Account';
  list.innerHTML = accounts
    .map(
      (acc) =>
        `<div class="account-dropdown-item ${acc.id == currentAccountId ? 'active' : ''}" role="menuitem" data-account-id="${acc.id}">${escapeHtml(acc.account_name)}</div>`,
    )
    .join('');
  list.querySelectorAll('.account-dropdown-item').forEach((item) => {
    item.addEventListener('click', () =>
      switchAccount(parseInt(item.dataset.accountId)),
    );
  });
}

async function switchAccount(accountId) {
  if (accountId === currentAccountId) return;
  try {
    const r = await fetch(`${API_URL}?action=switch_account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ account_id: accountId }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    currentAccountId = accountId;
    renderAccountDropdown();
    const dd = document.getElementById('account-dropdown');
    const btn = document.getElementById('account-btn');
    if (dd) {
      dd.classList.remove('show');
      dd.setAttribute('aria-hidden', 'true');
    }
    if (btn) btn.setAttribute('aria-expanded', 'false');
    await loadData();
  } catch (err) {
    alert(`Failed to switch account: ${err.message}`);
  }
}

function selectTab(tab) {
  currentTab = tab;
  activeFilters = { class: null, element: null };
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  loadData();
}

async function loadData() {
  if (!currentAccountId) {
    showNoAccountMessage();
    return;
  }
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '<tr><td class="loading">Loading data...</td></tr>';
  try {
    let url = `${API_URL}?action=${currentTab}`;
    if (activeFilters.class) url += `&class=${activeFilters.class}`;
    if (activeFilters.element && currentTab === 'heroes') {
      url += `&element=${activeFilters.element}`;
    }
    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text();
      let msg = `HTTP ${r.status}`;
      try {
        const j = JSON.parse(t);
        if (j.error) msg = j.error;
      } catch {
        /* ignore */
      }
      showError(msg);
      return;
    }
    const d = await r.json();
    if (d.error) {
      showError(d.error);
      return;
    }
    currentData = d;
    renderFilters();
    renderStats();
    renderTable();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

function renderFilters() {
  const bar = document.getElementById('filter-bar');
  if (currentTab === 'heroes') {
    bar.innerHTML =
      `<div class="filter-group"><span class="filter-label">Class:</span>${HERO_CLASSES.map(
        (cls) =>
          `<div class="filter-icon ${activeFilters.class === cls ? 'active' : ''}" data-filter="class" data-value="${cls}" title="${CLASS_NAMES[cls] || cls}"><img src="${ICONS_BASE}/${cls}.png" alt="${CLASS_NAMES[cls] || cls}"></div>`,
      ).join('')}</div>` +
      `<div class="filter-group"><span class="filter-label">Element:</span>${ELEMENTS.map(
        (elem) =>
          `<div class="filter-icon ${activeFilters.element === elem ? 'active' : ''}" data-filter="element" data-value="${elem}" title="${ELEMENT_NAMES[elem] || elem}"><img src="${ICONS_BASE}/${elem}.png" alt="${ELEMENT_NAMES[elem] || elem}"></div>`,
      ).join('')}</div>`;
  } else {
    bar.innerHTML = `<div class="filter-group"><span class="filter-label">Class:</span>${ARTIFACT_CLASSES.map(
      (cls) =>
        `<div class="filter-icon ${activeFilters.class === cls ? 'active' : ''}" data-filter="class" data-value="${cls}" title="${CLASS_NAMES[cls] || cls}"><img src="${ICONS_BASE}/${cls}.png" alt="${CLASS_NAMES[cls] || cls}"></div>`,
    ).join('')}</div>`;
  }
  bar.querySelectorAll('.filter-icon').forEach((icon) => {
    icon.addEventListener('click', () => {
      const f = icon.dataset.filter,
        v = icon.dataset.value;
      activeFilters[f] = activeFilters[f] === v ? null : v;
      loadData();
    });
  });
}

function renderStats() {
  const stats = currentData.stats;
  const c = document.getElementById('stats');
  const ownedPct =
    stats.total > 0 ? Math.round((stats.owned / stats.total) * 100) : 0;
  const maxedPct =
    stats.total > 0 ? Math.round((stats.maxed / stats.total) * 100) : 0;
  c.innerHTML =
    `<div class="stat"><span>Total:</span><span class="stat-value">${stats.total}</span></div>` +
    `<div class="stat"><span>Upgraded:</span><span class="stat-value stat-owned">${stats.owned}</span><span>(${ownedPct}%)</span></div>` +
    `<div class="stat"><span>${currentTab === 'heroes' ? 'SSS' : 'Max Level'}:</span><span class="stat-value stat-maxed">${stats.maxed}</span><span>(${maxedPct}%)</span></div>`;
}

function renderStars(count) {
  let s = '';
  for (let i = 0; i < count; i++) {
    s += `<img src="${ICONS_BASE}/star${count}.png" alt="${count} stars" title="${count} stars">`;
  }
  return s;
}

function renderGauge(level) {
  const n = parseInt(level);
  const color = GAUGE_COLORS[n] || GAUGE_COLORS['0'] || '#6b7280';
  let g = '';
  for (let i = 0; i < GAUGE_MAX; i++) {
    g +=
      i < n
        ? `<span style="color:${color}">${GAUGE_FILLED}</span>`
        : GAUGE_EMPTY;
  }
  return g;
}

function renderTable() {
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  if (currentTab === 'heroes') {
    thead.innerHTML =
      '<tr><th>Name</th><th class="icon-cell">Class</th><th class="icon-cell">Element</th><th>Stars</th><th>Imprint</th><th class="actions-header hidden">Actions</th></tr>';
    const items = (currentData.heroes || []).filter(
      (h) => !searchTerm || h.name.toLowerCase().includes(searchTerm),
    );
    if (items.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="loading">No heroes found.</td></tr>';
      return;
    }
    const h = thead.querySelector('.actions-header');
    if (h) h.classList.toggle('hidden', !editMode);
    tbody.innerHTML = items
      .map((hero) => {
        const r = hero.rating;
        const rc = RATING_COLORS[r] || '#6b7280';
        return `<tr data-id="${hero.id}"><td class="item-name">${escapeHtml(hero.name)}</td><td class="icon-cell"><img src="${ICONS_BASE}/${hero.class}.png" alt="${CLASS_NAMES[hero.class]}" title="${CLASS_NAMES[hero.class]}"></td><td class="icon-cell"><img src="${ICONS_BASE}/${hero.element}.png" alt="${ELEMENT_NAMES[hero.element]}" title="${ELEMENT_NAMES[hero.element]}"></td><td class="stars-cell">${renderStars(hero.star_rating)}</td><td class="rating-cell"><button class="rating-btn" data-hero-id="${hero.id}" data-rating="${r}" style="background:${rc}20;color:${rc};border-color:${rc}50">${r}</button></td><td class="row-actions"><button class="btn-icon btn-edit" data-edit-hero="${hero.id}" title="Edit"><img src="${SHARED_ICONS}/edit.png" alt="Edit"></button><button class="btn-icon btn-delete" data-del-hero="${hero.id}" data-name="${escapeHtml(hero.name)}" title="Delete"><img src="${SHARED_ICONS}/delete.png" alt="Delete"></button></td></tr>`;
      })
      .join('');
    tbody
      .querySelectorAll('.rating-btn')
      .forEach((btn) => btn.addEventListener('click', () => cycleRating(btn)));
    tbody
      .querySelectorAll('[data-edit-hero]')
      .forEach((btn) =>
        btn.addEventListener('click', () =>
          editHero(parseInt(btn.dataset.editHero)),
        ),
      );
    tbody
      .querySelectorAll('[data-del-hero]')
      .forEach((btn) =>
        btn.addEventListener('click', () =>
          deleteHero(parseInt(btn.dataset.delHero), btn.dataset.name),
        ),
      );
  } else {
    thead.innerHTML =
      '<tr><th>Name</th><th class="icon-cell">Class</th><th>Stars</th><th>Limit Break</th><th class="actions-header hidden">Actions</th></tr>';
    const items = (currentData.artifacts || []).filter(
      (a) => !searchTerm || a.name.toLowerCase().includes(searchTerm),
    );
    if (items.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="loading">No artifacts found.</td></tr>';
      return;
    }
    const h = thead.querySelector('.actions-header');
    if (h) h.classList.toggle('hidden', !editMode);
    tbody.innerHTML = items
      .map((artifact) => {
        const gl = parseInt(artifact.gauge_level);
        const gc = GAUGE_COLORS[gl] || GAUGE_COLORS['0'] || '#6b7280';
        return `<tr data-id="${artifact.id}"><td class="item-name">${escapeHtml(artifact.name)}</td><td class="icon-cell"><img src="${ICONS_BASE}/${artifact.class}.png" alt="${CLASS_NAMES[artifact.class]}" title="${CLASS_NAMES[artifact.class]}"></td><td class="stars-cell">${renderStars(artifact.star_rating)}</td><td class="level-cell"><button class="gauge-btn" data-artifact-id="${artifact.id}" data-gauge="${gl}" style="color:${gc}">${renderGauge(gl)}</button></td><td class="row-actions"><button class="btn-icon btn-edit" data-edit-artifact="${artifact.id}" title="Edit"><img src="${SHARED_ICONS}/edit.png" alt="Edit"></button><button class="btn-icon btn-delete" data-del-artifact="${artifact.id}" data-name="${escapeHtml(artifact.name)}" title="Delete"><img src="${SHARED_ICONS}/delete.png" alt="Delete"></button></td></tr>`;
      })
      .join('');
    tbody
      .querySelectorAll('.gauge-btn')
      .forEach((btn) => btn.addEventListener('click', () => cycleGauge(btn)));
    tbody
      .querySelectorAll('[data-edit-artifact]')
      .forEach((btn) =>
        btn.addEventListener('click', () =>
          editArtifact(parseInt(btn.dataset.editArtifact)),
        ),
      );
    tbody
      .querySelectorAll('[data-del-artifact]')
      .forEach((btn) =>
        btn.addEventListener('click', () =>
          deleteArtifact(parseInt(btn.dataset.delArtifact), btn.dataset.name),
        ),
      );
  }
}

async function cycleRating(btn) {
  const heroId = parseInt(btn.dataset.heroId);
  const cur = btn.dataset.rating;
  const idx = HERO_RATINGS.indexOf(cur);
  const next = HERO_RATINGS[(idx + 1) % HERO_RATINGS.length];
  btn.dataset.rating = next;
  btn.textContent = next;
  const rc = RATING_COLORS[next] || '#6b7280';
  btn.style.background = `${rc}20`;
  btn.style.color = rc;
  btn.style.borderColor = `${rc}50`;
  const hero = currentData.heroes.find((h) => h.id === heroId);
  if (hero) {
    const wo = hero.rating !== '-';
    const io = next !== '-';
    const wm = hero.rating === 'SSS';
    const im = next === 'SSS';
    hero.rating = next;
    if (wo !== io) currentData.stats.owned += io ? 1 : -1;
    if (wm !== im) currentData.stats.maxed += im ? 1 : -1;
    renderStats();
  }
  try {
    const r = await fetch(`${API_URL}?action=update_hero`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ hero_id: heroId, rating: next }),
    });
    const d = await r.json();
    if (d.error) {
      btn.dataset.rating = cur;
      btn.textContent = cur;
      const oc = RATING_COLORS[cur] || '#6b7280';
      btn.style.background = `${oc}20`;
      btn.style.color = oc;
      btn.style.borderColor = `${oc}50`;
      if (hero) hero.rating = cur;
      loadData();
      alert(`Error: ${d.error}`);
    }
  } catch (err) {
    loadData();
    alert(`Failed to save: ${err.message}`);
  }
}

async function cycleGauge(btn) {
  const artifactId = parseInt(btn.dataset.artifactId);
  const cur = parseInt(btn.dataset.gauge);
  const next = (cur + 1) % (GAUGE_MAX + 1);
  btn.dataset.gauge = next;
  btn.innerHTML = renderGauge(next);
  btn.style.color = GAUGE_COLORS[next] || GAUGE_COLORS['0'] || '#6b7280';
  const artifact = currentData.artifacts.find((a) => a.id === artifactId);
  if (artifact) {
    const wo = artifact.gauge_level > 0;
    const io = next > 0;
    const wm = artifact.gauge_level === GAUGE_MAX;
    const im = next === GAUGE_MAX;
    artifact.gauge_level = next;
    if (wo !== io) currentData.stats.owned += io ? 1 : -1;
    if (wm !== im) currentData.stats.maxed += im ? 1 : -1;
    renderStats();
  }
  try {
    const r = await fetch(`${API_URL}?action=update_artifact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ artifact_id: artifactId, gauge_level: next }),
    });
    const d = await r.json();
    if (d.error) {
      btn.dataset.gauge = cur;
      btn.innerHTML = renderGauge(cur);
      btn.style.color = GAUGE_COLORS[cur] || GAUGE_COLORS['0'] || '#6b7280';
      if (artifact) artifact.gauge_level = cur;
      loadData();
      alert(`Error: ${d.error}`);
    }
  } catch (err) {
    loadData();
    alert(`Failed to save: ${err.message}`);
  }
}

function showNoAccountMessage() {
  document.getElementById('filter-bar').innerHTML = '';
  document.getElementById('stats').innerHTML = '';
  document.getElementById('table-head').innerHTML = '';
  const tableBody = document.getElementById('table-body');
  tableBody.innerHTML =
    '<tr><td class="no-account-msg"><h2>No Game Account</h2><p>Create a game account to start tracking your collection.</p><button class="btn" data-action="open-add-account">+ Create Account</button></td></tr>';
  const createBtn = tableBody.querySelector('[data-action="open-add-account"]');
  if (createBtn) createBtn.addEventListener('click', openAddAccountModal);
}

function showError(msg) {
  document.getElementById('table-head').innerHTML = '';
  document.getElementById('table-body').innerHTML =
    `<tr><td class="error">${escapeHtml(msg)}</td></tr>`;
  document.getElementById('filter-bar').innerHTML = '';
  document.getElementById('stats').innerHTML = '';
}

function openAddAccountModal() {
  document.getElementById('new-account-name').value = '';
  document.getElementById('add-account-modal').classList.add('active');
  document.getElementById('new-account-name').focus();
}

function closeAddAccountModal() {
  document.getElementById('add-account-modal').classList.remove('active');
}

async function handleAddAccount(e) {
  e.preventDefault();
  const name = document.getElementById('new-account-name').value.trim();
  if (!name) {
    alert('Please enter an account name');
    return;
  }
  try {
    const r = await fetch(`${API_URL}?action=add_account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ account_name: name }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    closeAddAccountModal();
    await loadAccounts();
    if (accounts.length === 1) currentAccountId = d.account_id;
    await loadData();
  } catch (err) {
    alert(`Failed to create account: ${err.message}`);
  }
}

function openManageAccountsModal() {
  const dd = document.getElementById('account-dropdown');
  const btn = document.getElementById('account-btn');
  if (dd) {
    dd.classList.remove('show');
    dd.setAttribute('aria-hidden', 'true');
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
  renderManageAccountsList();
  document.getElementById('manage-accounts-modal').classList.add('active');
}

function closeManageAccountsModal() {
  document.getElementById('manage-accounts-modal').classList.remove('active');
}

function renderManageAccountsList() {
  const c = document.getElementById('manage-accounts-list');
  if (accounts.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">No accounts yet.</p>';
    return;
  }
  c.innerHTML = accounts
    .map(
      (acc) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.1)"><span>${escapeHtml(acc.account_name)} ${acc.id == currentAccountId ? '<span class="text-accent">(active)</span>' : ''}</span><button class="btn btn-danger btn-sm" data-del-acc="${acc.id}" data-acc-name="${acc.account_name}">Delete</button></div>`,
    )
    .join('');
  c.querySelectorAll('[data-del-acc]').forEach((btn) =>
    btn.addEventListener('click', () =>
      deleteAccount(parseInt(btn.dataset.delAcc), btn.dataset.accName),
    ),
  );
}

async function deleteAccount(accountId, accountName) {
  if (
    !confirm(
      `Delete account "${
        accountName
      }"? This will remove all hero and artifact data for this account.`,
    )
  ) {
    return;
  }
  try {
    const r = await fetch(`${API_URL}?action=delete_account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ account_id: accountId }),
    });
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    await loadAccounts();
    renderManageAccountsList();
    await loadData();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

function openAddItemModal(initialValues) {
  const modal = document.getElementById('add-item-modal');
  const title = document.getElementById('add-item-title');
  const elementGroup = document.getElementById('item-element-group');
  const quickAddGroup = document.getElementById('item-quick-add');
  const quickAddSelect = document.getElementById('quick-add-select');
  const classSelect = document.getElementById('item-class');
  const elementSelect = document.getElementById('item-element');
  const isEditing = !!(initialValues && initialValues.editId != null);

  if (currentTab === 'heroes') {
    title.textContent = isEditing ? 'Edit Hero' : 'Add Hero';
    elementGroup.style.display = 'block';
    elementSelect.required = true;
    classSelect.innerHTML = HERO_CLASSES.map(
      (cls) => `<option value="${cls}">${CLASS_NAMES[cls] || cls}</option>`,
    ).join('');
    elementSelect.innerHTML = ELEMENTS.map(
      (elem) =>
        `<option value="${elem}">${ELEMENT_NAMES[elem] || elem}</option>`,
    ).join('');
    if (!isEditing) {
      document.getElementById('item-name').value = '';
      document.getElementById('item-stars').value = '5';
      classSelect.value = '';
      elementSelect.value = '';
    }
    if (!isEditing && currentData && currentData.base_heroes) {
      quickAddGroup.style.display = 'block';
      quickAddSelect.innerHTML = `<option value="">-- Custom --</option>${currentData.base_heroes
        .map(
          (h) =>
            `<option value="${h.id}">${escapeHtml(h.name)} (${CLASS_NAMES[h.class]}, ${ELEMENT_NAMES[h.element]}, ${h.star_rating}\u2605)</option>`,
        )
        .join('')}`;
      quickAddSelect.onchange = function () {
        if (!this.value) return;
        const h = currentData.base_heroes.find((x) => x.id == this.value);
        if (h) {
          document.getElementById('item-name').value = h.name;
          classSelect.value = h.class;
          elementSelect.value = h.element;
          document.getElementById('item-stars').value = h.star_rating;
        }
      };
    } else {
      quickAddGroup.style.display = 'none';
    }
  } else {
    title.textContent = isEditing ? 'Edit Artifact' : 'Add Artifact';
    elementGroup.style.display = 'none';
    elementSelect.required = false;
    classSelect.innerHTML = ARTIFACT_CLASSES.map(
      (cls) => `<option value="${cls}">${CLASS_NAMES[cls] || cls}</option>`,
    ).join('');
    if (!isEditing) {
      document.getElementById('item-name').value = '';
      document.getElementById('item-stars').value = '5';
      classSelect.value = '';
    }
    if (!isEditing && currentData && currentData.base_artifacts) {
      quickAddGroup.style.display = 'block';
      quickAddSelect.innerHTML = `<option value="">-- Custom --</option>${currentData.base_artifacts
        .map(
          (a) =>
            `<option value="${a.id}">${escapeHtml(a.name)} (${CLASS_NAMES[a.class]}, ${a.star_rating}\u2605)</option>`,
        )
        .join('')}`;
      quickAddSelect.onchange = function () {
        if (!this.value) return;
        const a = currentData.base_artifacts.find((x) => x.id == this.value);
        if (a) {
          document.getElementById('item-name').value = a.name;
          classSelect.value = a.class;
          document.getElementById('item-stars').value = a.star_rating;
        }
      };
    } else {
      quickAddGroup.style.display = 'none';
    }
  }

  if (initialValues) {
    if (initialValues.name != null) {
      document.getElementById('item-name').value = initialValues.name;
    }
    if (initialValues.class != null) classSelect.value = initialValues.class;
    if (initialValues.element != null) {
      elementSelect.value = initialValues.element;
    }
    if (initialValues.star_rating != null) {
      document.getElementById('item-stars').value = String(
        initialValues.star_rating,
      );
    }
    if (initialValues.editId != null) {
      document.getElementById('item-edit-id').value = String(
        initialValues.editId,
      );
    }
    if (initialValues.editType != null) {
      document.getElementById('item-edit-type').value = initialValues.editType;
    }
  }

  modal.classList.add('active');
  document.getElementById('item-name').focus();
}

function closeAddItemModal() {
  document.getElementById('add-item-modal').classList.remove('active');
  document.getElementById('item-edit-id').value = '';
  document.getElementById('item-edit-type').value = '';
}

async function handleAddItem(e) {
  e.preventDefault();
  const editId = document.getElementById('item-edit-id').value;
  const editType = document.getElementById('item-edit-type').value;
  const name = document.getElementById('item-name').value.trim();
  const itemClass = document.getElementById('item-class').value;
  const stars = parseInt(document.getElementById('item-stars').value);
  const quickAddId = document.getElementById('quick-add-select').value;

  if (!name) {
    alert('Please enter a name');
    return;
  }

  if (editId && editType) {
    const action =
      editType === 'hero' ? 'update_hero_details' : 'update_artifact_details';
    let body;
    if (editType === 'hero') {
      body = {
        hero_id: parseInt(editId),
        name,
        class: itemClass,
        star_rating: stars,
        element: document.getElementById('item-element').value,
      };
    } else {
      body = {
        artifact_id: parseInt(editId),
        name,
        class: itemClass,
        star_rating: stars,
      };
    }
    try {
      const r = await fetch(`${API_URL}?action=${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': CSRF_TOKEN,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text();
        alert(`Error ${r.status} ${r.statusText}: ${text}`);
        return;
      }
      const d = await r.json();
      if (d.error) {
        alert(`Error: ${d.error}`);
        return;
      }
      closeAddItemModal();
      await loadData();
    } catch (err) {
      alert(`Failed to update: ${err.message}`);
    }
    return;
  }

  let action, body;
  if (currentTab === 'heroes') {
    const element = document.getElementById('item-element').value;
    action = 'add_hero';
    body = {
      name,
      class: itemClass,
      element,
      star_rating: stars,
      base_hero_id: quickAddId ? parseInt(quickAddId) : null,
    };
  } else {
    action = 'add_artifact';
    body = {
      name,
      class: itemClass,
      star_rating: stars,
      base_artifact_id: quickAddId ? parseInt(quickAddId) : null,
    };
  }
  try {
    const r = await fetch(`${API_URL}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    closeAddItemModal();
    await loadData();
  } catch (err) {
    alert(`Failed to add: ${err.message}`);
  }
}

function editHero(heroId) {
  const hero = currentData.heroes.find((h) => h.id === heroId);
  if (!hero) return;
  openAddItemModal({
    name: hero.name,
    class: hero.class,
    element: hero.element,
    star_rating: hero.star_rating,
    editId: heroId,
    editType: 'hero',
  });
}

function editArtifact(artifactId) {
  const artifact = currentData.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return;
  openAddItemModal({
    name: artifact.name,
    class: artifact.class,
    star_rating: artifact.star_rating,
    editId: artifactId,
    editType: 'artifact',
  });
}

async function deleteHero(heroId, heroName) {
  if (!confirm(`Delete hero "${heroName}" from your collection?`)) return;
  try {
    const r = await fetch(`${API_URL}?action=delete_hero`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ hero_id: heroId }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    await loadData();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

async function deleteArtifact(artifactId, artifactName) {
  if (!confirm(`Delete artifact "${artifactName}" from your collection?`)) {
    return;
  }
  try {
    const r = await fetch(`${API_URL}?action=delete_artifact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ artifact_id: artifactId }),
    });
    if (!r.ok) {
      const text = await r.text();
      alert(`Error ${r.status} ${r.statusText}: ${text}`);
      return;
    }
    const d = await r.json();
    if (d.error) {
      alert(`Error: ${d.error}`);
      return;
    }
    await loadData();
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
