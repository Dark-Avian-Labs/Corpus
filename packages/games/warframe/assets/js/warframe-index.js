import { escapeHtml, debounce } from '@lib/utils';

const API_URL = window.WARFRAME_CONFIG.apiUrl;
const CSRF_TOKEN = window.WARFRAME_CONFIG.csrfToken;

let worksheets = [];
let currentWorksheet = null;
let currentData = null;
let searchTerm = '';
const statusCycle = ['', 'Obtained', 'Complete'];
const helminthCycle = ['', 'Yes'];
const tabOrder = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Archwing Weapons',
  'Accessories',
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadWorksheets();
  const searchInput = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  if (searchInput && searchClear) {
    const debouncedRender = debounce(() => renderTable(), 300);
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      searchClear.classList.toggle('visible', e.target.value.length > 0);
      debouncedRender();
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchTerm = '';
      searchClear.classList.remove('visible');
      renderTable();
    });
  }
  const editModeBtn = document.getElementById('edit-mode-btn');
  const addItemBtn = document.getElementById('add-item-btn');
  if (editModeBtn) {
    editModeBtn.addEventListener('click', () => {
      document.body.classList.toggle('edit-mode');
      const active = document.body.classList.contains('edit-mode');
      editModeBtn.classList.toggle('active', active);
      editModeBtn.textContent = active ? 'Done Editing' : 'Edit Mode';
      renderTable();
    });
  }
  if (addItemBtn) addItemBtn.addEventListener('click', () => openAddModal());
  document
    .getElementById('item-modal-cancel')
    ?.addEventListener('click', closeItemModal);
  document
    .getElementById('item-form')
    ?.addEventListener('submit', handleItemFormSubmit);
  document.getElementById('item-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'item-modal') closeItemModal();
  });
  document
    .getElementById('delete-cancel')
    ?.addEventListener('click', closeDeleteModal);
  document
    .getElementById('delete-confirm')
    ?.addEventListener('click', handleDeleteConfirm);
  document.getElementById('delete-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'delete-modal') closeDeleteModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const itemModal = document.getElementById('item-modal');
      const deleteModal = document.getElementById('delete-modal');
      if (itemModal?.classList.contains('active')) closeItemModal();
      if (deleteModal?.classList.contains('active')) closeDeleteModal();
    }
  });
  document.getElementById('table-body').addEventListener('click', (e) => {
    const statusBtn = e.target.closest('.status-btn:not([disabled])');
    if (statusBtn) {
      toggleStatus(statusBtn);
      return;
    }
    const editBtn = e.target.closest('[data-edit-row]');
    if (editBtn) {
      openEditModal(parseInt(editBtn.dataset.editRow));
      return;
    }
    const deleteBtn = e.target.closest('[data-delete-row]');
    if (deleteBtn) {
      openDeleteModal(
        parseInt(deleteBtn.dataset.deleteRow),
        deleteBtn.dataset.rowName,
      );
    }
  });
}

function safeColId(id) {
  const str = String(id);
  if (/^[A-Za-z0-9\-_]+$/.test(str)) return str;
  return str.replace(/[^A-Za-z0-9\-_]/g, '_');
}

function getColumnOptions(col) {
  const isHelminth = col.name === 'Helminth';
  const options = isHelminth ? ['', 'Yes'] : ['', 'Obtained', 'Complete'];
  const getLabel = (v) => (v === '' ? '—' : v);
  return { options, getLabel };
}

function openAddModal() {
  if (!currentData) return;
  document.getElementById('item-modal-title').textContent = 'Add Item';
  document.getElementById('form-row-id').value = '';
  document.getElementById('form-name').value = '';
  const colsDiv = document.getElementById('form-columns');
  colsDiv.innerHTML = currentData.columns
    .map((col) => {
      const sid = safeColId(col.id);
      const { options, getLabel } = getColumnOptions(col);
      return `<div class="form-group">
                <label for="form-col-${sid}">${escapeHtml(col.name)}</label>
                <select id="form-col-${sid}">${options.map((opt) => `<option value="${opt}">${getLabel(opt)}</option>`).join('')}</select>
            </div>`;
    })
    .join('');
  document.getElementById('item-modal').classList.add('active');
  document.getElementById('form-name').focus();
}

function openEditModal(rowId) {
  if (!currentData) return;
  const row = currentData.rows.find((r) => r.id === rowId);
  if (!row) return;
  document.getElementById('item-modal-title').textContent = 'Edit Item';
  document.getElementById('form-row-id').value = rowId;
  document.getElementById('form-name').value = row.name;
  const colsDiv = document.getElementById('form-columns');
  colsDiv.innerHTML = currentData.columns
    .map((col) => {
      const sid = safeColId(col.id);
      const value = row.values[col.id] || '';
      const { options, getLabel } = getColumnOptions(col);
      return `<div class="form-group">
                <label for="form-col-${sid}">${escapeHtml(col.name)}</label>
                <select id="form-col-${sid}">${options.map((opt) => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${getLabel(opt)}</option>`).join('')}</select>
            </div>`;
    })
    .join('');
  document.getElementById('item-modal').classList.add('active');
  document.getElementById('form-name').focus();
}

function closeItemModal() {
  document.getElementById('item-modal')?.classList.remove('active');
}

function openDeleteModal(rowId, name) {
  document.getElementById('delete-row-id').value = rowId;
  document.getElementById('delete-item-name').textContent = name;
  document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('delete-modal')?.classList.remove('active');
}

async function handleItemFormSubmit(e) {
  e.preventDefault();
  const rowId = document.getElementById('form-row-id').value;
  const itemName = document.getElementById('form-name').value.trim();
  if (!itemName) {
    alert('Item name is required');
    return;
  }
  const values = {};
  currentData.columns.forEach((col) => {
    const el = document.getElementById(`form-col-${safeColId(col.id)}`);
    values[col.id] = el?.value ?? '';
  });
  try {
    const action = rowId ? 'edit_row' : 'add_row';
    const body = rowId
      ? { row_id: parseInt(rowId), item_name: itemName, values }
      : { worksheet_id: currentWorksheet, item_name: itemName, values };
    const response = await fetch(`${API_URL}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      alert(
        `Error ${response.status} ${response.statusText}: ${errorText || 'Request failed'}`,
      );
      return;
    }
    const result = await response.json();
    if (result.error) {
      alert(`Error: ${result.error}`);
    } else {
      closeItemModal();
      await loadData(currentWorksheet);
    }
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
  }
}

async function handleDeleteConfirm() {
  const rowId = parseInt(document.getElementById('delete-row-id').value);
  try {
    const response = await fetch(`${API_URL}?action=delete_row`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ row_id: rowId }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      alert(
        `Error ${response.status} ${response.statusText}: ${errorText || 'Delete failed'}`,
      );
      return;
    }
    const result = await response.json();
    if (result.error) {
      alert(`Error: ${result.error}`);
    } else {
      closeDeleteModal();
      await loadData(currentWorksheet);
    }
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
}

async function loadWorksheets() {
  try {
    const response = await fetch(`${API_URL}?action=worksheets`);
    if (!response.ok) {
      const errorBody = await response.text();
      showError(
        `Failed to load worksheets (${response.status}): ${errorBody || response.statusText}`,
      );
      return;
    }
    const data = await response.json();
    if (data.error) {
      showError(data.error);
      return;
    }
    worksheets = data.worksheets;
    worksheets.forEach((w) => {
      w.name = w.name.replace(/^\uFEFF/, '').trim();
    });
    worksheets.sort((a, b) => {
      const indexA =
        tabOrder.indexOf(a.name) === -1 ? 999 : tabOrder.indexOf(a.name);
      const indexB =
        tabOrder.indexOf(b.name) === -1 ? 999 : tabOrder.indexOf(b.name);
      return indexA - indexB;
    });
    renderTabs();
    if (worksheets.length > 0) selectWorksheet(worksheets[0].id);
  } catch (err) {
    showError(`Failed to load worksheets: ${err.message}`);
  }
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs');
  tabsContainer.setAttribute('role', 'tablist');
  tabsContainer.innerHTML = worksheets
    .map(
      (ws) =>
        `<button class="tab" role="tab" aria-selected="false" data-id="${ws.id}">${escapeHtml(ws.name)}</button>`,
    )
    .join('');
  tabsContainer.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () =>
      selectWorksheet(parseInt(tab.dataset.id)),
    );
  });
}

async function selectWorksheet(id) {
  currentWorksheet = id;
  document.querySelectorAll('.tab').forEach((tab) => {
    const isActive = parseInt(tab.dataset.id) === id;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  await loadData(id);
}

async function loadData(worksheetId) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '<tr><td class="loading">Loading data...</td></tr>';
  try {
    const response = await fetch(
      `${API_URL}?action=data&worksheet=${worksheetId}`,
    );
    if (!response.ok) {
      const errorBody = await response.text();
      showError(
        `Failed to load data (${response.status}): ${errorBody || response.statusText}`,
      );
      return;
    }
    const data = await response.json();
    if (data.error) {
      showError(data.error);
      return;
    }
    currentData = data;
    renderTable();
    renderStats();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

function renderTable() {
  if (!currentData) return;
  const table = document.querySelector('.table-container table');
  const thead = document.getElementById('table-head');
  const tbody = document.getElementById('table-body');
  const colWidth = (col) => (col.name === 'Helminth' ? '150px' : '200px');
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }
  colgroup.innerHTML = `<col style="width: auto">${currentData.columns.map((col) => `<col style="width: ${colWidth(col)}">`).join('')}`;

  thead.innerHTML = `<tr><th>Name</th>${currentData.columns.map((col) => `<th>${escapeHtml(col.name)}</th>`).join('')}<th class="actions-header${document.body.classList.contains('edit-mode') ? '' : ' hidden'}">Actions</th></tr>`;
  let rows = currentData.rows;
  if (searchTerm) {
    rows = rows.filter((row) => row.name.toLowerCase().includes(searchTerm));
  }
  if (rows.length === 0) {
    const colCount = thead.querySelectorAll('th:not(.hidden)').length;
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="loading">No items found.</td></tr>`;
    return;
  }
  const sharedIcons = '/shared/icons';
  tbody.innerHTML = rows
    .map(
      (row) => `
            <tr data-row-id="${row.id}">
                <td class="item-name">${escapeHtml(row.name)}</td>
                ${currentData.columns
                  .map((col) => {
                    const sid = safeColId(col.id);
                    const value = row.values[col.id] || '';
                    const isHelminth = col.name === 'Helminth';
                    if (isHelminth) {
                      const displayText = value === 'Yes' ? '✓' : '—';
                      return `<td class="status-cell helminth-cell">
                            <button type="button" class="status-btn helminth-btn ${value === 'Yes' ? 'yes' : 'empty'}" data-row-id="${row.id}" data-column-id="${sid}" data-column-name="Helminth" data-value="${escapeHtml(value)}">${displayText}</button>
                        </td>`;
                    }
                    const statusClass = value.toLowerCase() || 'empty';
                    const isUnavailable = value === 'Unavailable';
                    const displayText = value || '—';
                    return `<td class="status-cell">
                        <button type="button" class="status-btn ${statusClass}" data-row-id="${row.id}" data-column-id="${sid}" data-column-name="${escapeHtml(col.name)}" data-value="${escapeHtml(value)}" ${isUnavailable ? 'disabled' : ''}>${displayText}</button>
                    </td>`;
                  })
                  .join('')}
                <td class="row-actions">
                    <button type="button" class="btn-icon btn-edit" data-edit-row="${row.id}" title="Edit"><img src="${sharedIcons}/edit.png" alt="Edit"></button>
                    <button type="button" class="btn-icon btn-delete" data-delete-row="${row.id}" data-row-name="${escapeHtml(row.name)}" title="Delete"><img src="${sharedIcons}/delete.png" alt="Delete"></button>
                </td>
            </tr>
        `,
    )
    .join('');
}

function renderStats() {
  if (!currentData) return;
  const statsContainer = document.getElementById('stats');
  const stats = {};
  currentData.columns.forEach((col) => {
    if (col.name === 'Helminth') return;
    stats[col.id] = {
      name: col.name,
      total: 0,
      complete: 0,
      obtained: 0,
      unavailable: 0,
    };
  });
  currentData.rows.forEach((row) => {
    currentData.columns.forEach((col) => {
      if (col.name === 'Helminth') return;
      const value = row.values[col.id] || '';
      stats[col.id].total++;
      if (value === 'Complete') stats[col.id].complete++;
      else if (value === 'Obtained') stats[col.id].obtained++;
      else if (value === 'Unavailable') stats[col.id].unavailable++;
    });
  });
  const totalRows = currentData.rows.length;
  const helminthCol = currentData.columns.find(
    (col) => col.name === 'Helminth',
  );
  const helminthYes = helminthCol
    ? currentData.rows.filter(
        (row) => (row.values[helminthCol.id] || '') === 'Yes',
      ).length
    : 0;

  let html = currentData.columns
    .filter((col) => col.name !== 'Helminth')
    .map((col) => {
      const s = stats[col.id];
      const available = s.total - s.unavailable;
      const pct =
        available > 0 ? Math.round((s.complete / available) * 100) : 0;
      return `<div class="stat">
                <span>${escapeHtml(col.name)}:</span>
                <span class="stat-value stat-complete">${s.complete}</span>/<span class="stat-value">${available}</span>
                <span>(${pct}%)</span>
                ${s.obtained > 0 ? `<span class="stat-obtained">+${s.obtained} in progress</span>` : ''}
            </div>`;
    })
    .join('');

  if (helminthCol) {
    const helminthPct =
      totalRows > 0 ? Math.round((helminthYes / totalRows) * 100) : 0;
    html += `<div class="stat">
                <span>Helminth:</span>
                <span class="stat-value stat-complete">${helminthYes}</span>/<span class="stat-value">${totalRows}</span>
                <span>(${helminthPct}%)</span>
            </div>`;
  }
  statsContainer.innerHTML = html;
}

function updateStatusButton(btn, value, isHelminth) {
  btn.dataset.value = value;
  if (isHelminth) {
    btn.className = `status-btn helminth-btn ${value === 'Yes' ? 'yes' : 'empty'}`;
    btn.textContent = value === 'Yes' ? '✓' : '—';
  } else {
    btn.className = `status-btn ${value.toLowerCase() || 'empty'}`;
    btn.textContent = value || '—';
  }
}

async function toggleStatus(btn) {
  if (btn.dataset.pending === '1') return;
  const rowId = parseInt(btn.dataset.rowId);
  const columnId = parseInt(btn.dataset.columnId);
  const isHelminth = btn.dataset.columnName === 'Helminth';
  const cycle = isHelminth ? helminthCycle : statusCycle;
  const currentValue = btn.dataset.value;
  const currentIndex = cycle.indexOf(currentValue);
  const nextIndex = (currentIndex + 1) % cycle.length;
  const newValue = cycle[nextIndex];
  updateStatusButton(btn, newValue, isHelminth);
  const row = currentData.rows.find((r) => r.id === rowId);
  if (row) row.values[columnId] = newValue;
  renderStats();
  btn.dataset.pending = '1';
  btn.disabled = true;
  try {
    const response = await fetch(`${API_URL}?action=update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({
        row_id: rowId,
        column_id: columnId,
        value: newValue,
      }),
    });
    if (!response.ok) {
      updateStatusButton(btn, currentValue, isHelminth);
      if (row) row.values[columnId] = currentValue;
      renderStats();
      const errorText = await response.text();
      alert(
        `Error ${response.status} ${response.statusText}: ${errorText || 'Update failed'}`,
      );
      return;
    }
    const result = await response.json();
    if (result.error) {
      updateStatusButton(btn, currentValue, isHelminth);
      if (row) row.values[columnId] = currentValue;
      renderStats();
      alert(`Error: ${result.error}`);
    }
  } catch (err) {
    updateStatusButton(btn, currentValue, isHelminth);
    if (row) row.values[columnId] = currentValue;
    renderStats();
    alert(`Failed to save: ${err.message}`);
  } finally {
    btn.disabled = false;
    delete btn.dataset.pending;
  }
}

function showError(message) {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = `<tr><td class="error">${escapeHtml(message)}</td></tr>`;
}
