import { escapeHtml, debounce } from '@lib/utils';

const cfg = window.WARFRAME_ADMIN_CONFIG || {};
const API_URL = cfg.apiUrl || '/api';
const CSRF_TOKEN =
  document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
  '';
const VALID_STATUSES = ['', 'Obtained', 'Complete', 'Unavailable'];
const HELMINTH_VALUES = ['', 'Yes'];
const tabOrder = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Archwing Weapons',
  'Accessories',
];
let worksheets = [];

/** Returns options array and getLabel(value) for a column (Helminth vs status). */
function getColumnOptions(col) {
  const isHelminth = col.name === 'Helminth';
  const options = isHelminth ? HELMINTH_VALUES : VALID_STATUSES;
  const getLabel = (v) =>
    isHelminth ? (v === 'Yes' ? 'Yes' : 'No') : v || '(none)';
  return { options, getLabel };
}
let currentWorksheet = null;
let currentData = null;
let searchTerm = '';

function getTableBody() {
  return (
    document.getElementById('table-body') ||
    document.querySelector('.table-container tbody')
  );
}
function getTableHead() {
  return (
    document.getElementById('table-head') ||
    document.querySelector('.table-container thead')
  );
}

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
  const addBtn = document.getElementById('add-btn');
  if (addBtn) addBtn.addEventListener('click', () => openAddModal());
  const modalCancel = document.getElementById('modal-cancel');
  if (modalCancel) modalCancel.addEventListener('click', closeModal);
  const itemForm = document.getElementById('item-form');
  if (itemForm) itemForm.addEventListener('submit', handleFormSubmit);
  const modal = document.getElementById('modal');
  if (modal)
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });
  const deleteCancel = document.getElementById('delete-cancel');
  if (deleteCancel) deleteCancel.addEventListener('click', closeDeleteModal);
  const deleteConfirm = document.getElementById('delete-confirm');
  if (deleteConfirm) deleteConfirm.addEventListener('click', handleDelete);
  const deleteModal = document.getElementById('delete-modal');
  if (deleteModal)
    deleteModal.addEventListener('click', (e) => {
      if (e.target.id === 'delete-modal') closeDeleteModal();
    });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeDeleteModal();
    }
  });
}

async function loadWorksheets() {
  const tbody = getTableBody();
  try {
    const response = await fetch(`${API_URL}?action=worksheets`);
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data.error) {
      showError(data.error);
      return;
    }
    worksheets = Array.isArray(data.worksheets) ? data.worksheets : [];
    worksheets.forEach((w) => {
      w.name = (w.name || '').replace(/^\uFEFF/, '').trim();
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
    else if (tbody)
      tbody.innerHTML =
        '<tr><td class="loading">No worksheets found.</td></tr>';
  } catch (err) {
    showError(`Failed to load worksheets: ${err.message}`);
  }
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs');
  if (!tabsContainer) return;
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
  const tbody = getTableBody();
  if (!tbody) return;
  tbody.innerHTML = '<tr><td class="loading">Loading data...</td></tr>';
  try {
    const response = await fetch(
      `${API_URL}?action=data&worksheet=${worksheetId}`,
    );
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data.error) {
      showError(data.error);
      return;
    }
    currentData = data;
    renderTable();
  } catch (err) {
    showError(`Failed to load data: ${err.message}`);
  }
}

function renderTable() {
  if (!currentData) return;
  const thead = getTableHead();
  const tbody = getTableBody();
  if (!thead || !tbody) return;
  thead.innerHTML = `<tr><th>Name</th>${currentData.columns.map((col) => `<th>${escapeHtml(col.name)}</th>`).join('')}<th>Actions</th></tr>`;
  let rows = currentData.rows;
  if (searchTerm)
    rows = rows.filter((row) => row.name.toLowerCase().includes(searchTerm));
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${currentData.columns.length + 2}" class="loading">No items found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (row) => `
        <tr data-row-id="${row.id}">
            <td class="item-name">${escapeHtml(row.name)}</td>
            ${currentData.columns
              .map((col) => {
                const value = row.values[col.id] || '';
                const { options, getLabel } = getColumnOptions(col);
                return `<td>
                    <select class="status-select" data-row-id="${row.id}" data-column-id="${col.id}">
                        ${options
                          .map(
                            (opt) =>
                              `<option value="${opt}" ${value === opt ? 'selected' : ''}>${getLabel(opt)}</option>`,
                          )
                          .join('')}
                    </select>
                </td>`;
              })
              .join('')}
            <td class="row-actions">
                <button class="btn btn-sm btn-secondary edit-btn" data-row-id="${row.id}">Edit</button>
                <button class="btn btn-sm btn-danger delete-btn" data-row-id="${row.id}" data-name="${escapeHtml(row.name)}">Delete</button>
            </td>
        </tr>
    `,
    )
    .join('');
  tbody.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', (e) => handleStatusChange(e.target));
  });
  tbody.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () =>
      openEditModal(parseInt(btn.dataset.rowId)),
    );
  });
  tbody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () =>
      openDeleteModal(parseInt(btn.dataset.rowId), btn.dataset.name),
    );
  });
}

async function handleStatusChange(select) {
  const rowId = parseInt(select.dataset.rowId);
  const columnId = parseInt(select.dataset.columnId);
  const value = select.value;
  try {
    const response = await fetch(`${API_URL}?action=admin_update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify({ row_id: rowId, column_id: columnId, value }),
    });
    if (!response.ok) {
      const text = await response.text();
      alert(
        `Error: ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`,
      );
      loadData(currentWorksheet);
      return;
    }
    const result = await response.json();
    if (result.error) {
      alert(`Error: ${result.error}`);
      loadData(currentWorksheet);
    } else {
      const row = currentData.rows.find((r) => r.id === rowId);
      if (row) row.values[columnId] = value;
    }
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
    loadData(currentWorksheet);
  }
}

function openAddModal() {
  const modalTitle = document.getElementById('modal-title');
  const formRowId = document.getElementById('form-row-id');
  const formName = document.getElementById('form-name');
  const columnsDiv = document.getElementById('form-columns');
  const modal = document.getElementById('modal');
  if (!modalTitle || !formRowId || !formName || !columnsDiv || !modal) return;
  modalTitle.textContent = 'Add Item';
  formRowId.value = '';
  formName.value = '';
  if (!currentData || !Array.isArray(currentData.columns)) {
    columnsDiv.innerHTML = '<p class="loading">No columns loaded.</p>';
  } else {
    columnsDiv.innerHTML = currentData.columns
      .map((col) => {
        const { options, getLabel } = getColumnOptions(col);
        return `<div class="form-group">
            <label for="form-col-${col.id}">${escapeHtml(col.name)}</label>
            <select id="form-col-${col.id}">
                ${options.map((opt) => `<option value="${opt}">${getLabel(opt)}</option>`).join('')}
            </select>
        </div>`;
      })
      .join('');
  }
  modal.classList.add('active');
  formName.focus();
}

function openEditModal(rowId) {
  const row = currentData.rows.find((r) => r.id === rowId);
  if (!row) return;
  const modalTitle = document.getElementById('modal-title');
  const formRowId = document.getElementById('form-row-id');
  const formName = document.getElementById('form-name');
  const columnsDiv = document.getElementById('form-columns');
  const modal = document.getElementById('modal');
  if (!modalTitle || !formRowId || !formName || !columnsDiv || !modal) return;
  modalTitle.textContent = 'Edit Item';
  formRowId.value = rowId;
  formName.value = row.name;
  columnsDiv.innerHTML = currentData.columns
    .map((col) => {
      const value = row.values[col.id] || '';
      const { options, getLabel } = getColumnOptions(col);
      return `<div class="form-group">
            <label for="form-col-${col.id}">${escapeHtml(col.name)}</label>
            <select id="form-col-${col.id}">
                ${options
                  .map(
                    (opt) =>
                      `<option value="${opt}" ${value === opt ? 'selected' : ''}>${getLabel(opt)}</option>`,
                  )
                  .join('')}
            </select>
        </div>`;
    })
    .join('');
  modal.classList.add('active');
  formName.focus();
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('active');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const rowId = document.getElementById('form-row-id').value;
  const itemName = document.getElementById('form-name').value.trim();
  if (!itemName) {
    alert('Item name is required');
    return;
  }
  const values = {};
  currentData.columns.forEach((col) => {
    const el = document.getElementById(`form-col-${col.id}`);
    values[col.id] = el?.value ?? '';
  });
  try {
    let action, body;
    if (rowId) {
      action = 'edit_row';
      body = { row_id: parseInt(rowId), item_name: itemName, values };
    } else {
      action = 'add_row';
      body = { worksheet_id: currentWorksheet, item_name: itemName, values };
    }
    const response = await fetch(`${API_URL}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      alert(
        `Error: ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`,
      );
      return;
    }
    const result = await response.json();
    if (result.error) {
      alert(`Error: ${result.error}`);
    } else {
      closeModal();
      await loadData(currentWorksheet);
    }
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
  }
}

function openDeleteModal(rowId, name) {
  const deleteRowId = document.getElementById('delete-row-id');
  const deleteItemName = document.getElementById('delete-item-name');
  const deleteModal = document.getElementById('delete-modal');
  if (!deleteRowId || !deleteItemName || !deleteModal) return;
  deleteRowId.value = rowId;
  deleteItemName.textContent = name;
  deleteModal.classList.add('active');
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal');
  if (modal) modal.classList.remove('active');
}

async function handleDelete() {
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
      const text = await response.text();
      alert(
        `Error: ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`,
      );
      closeDeleteModal();
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

function showError(message) {
  const tbody = getTableBody();
  if (!tbody) return;
  tbody.innerHTML = `<tr><td class="error">${escapeHtml(message)}</td></tr>`;
}
