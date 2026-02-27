import { useEffect, useMemo, useReducer, useState } from 'react';

import { Modal } from '../../components/ui/Modal';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../auth/AuthContext';

type Worksheet = { id: number; name: string };
type Column = { id: number; name: string };
type Row = {
  id: number;
  name?: string;
  item_name?: string;
  values?: Record<string, string>;
};
type WorksheetData = { columns: Column[]; rows: Row[] };

type ModalState = {
  itemModalOpen: boolean;
  deleteModalOpen: boolean;
  editingRowId: number | null;
  deletingRow: Row | null;
  draftName: string;
  draftValues: Record<string, string>;
};

type ModalAction =
  | { type: 'OPEN_ADD_MODAL'; columns: Column[] }
  | { type: 'OPEN_EDIT_MODAL'; row: Row }
  | { type: 'CLOSE_ITEM_MODAL' }
  | { type: 'SET_DRAFT_NAME'; value: string }
  | { type: 'SET_DRAFT_VALUE'; columnId: number; value: string }
  | { type: 'OPEN_DELETE_MODAL'; row: Row }
  | { type: 'CLOSE_DELETE_MODAL' };

const initialModalState: ModalState = {
  itemModalOpen: false,
  deleteModalOpen: false,
  editingRowId: null,
  deletingRow: null,
  draftName: '',
  draftValues: {},
};

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    case 'OPEN_ADD_MODAL': {
      const draftValues = action.columns.reduce<Record<string, string>>(
        (result, column) => {
          result[String(column.id)] = '';
          return result;
        },
        {},
      );
      return {
        ...state,
        itemModalOpen: true,
        editingRowId: null,
        draftName: '',
        draftValues,
      };
    }
    case 'OPEN_EDIT_MODAL':
      return {
        ...state,
        itemModalOpen: true,
        editingRowId: Number(action.row.id),
        draftName: action.row.name || action.row.item_name || '',
        draftValues: { ...(action.row.values || {}) },
      };
    case 'CLOSE_ITEM_MODAL':
      return {
        ...state,
        itemModalOpen: false,
      };
    case 'SET_DRAFT_NAME':
      return {
        ...state,
        draftName: action.value,
      };
    case 'SET_DRAFT_VALUE':
      return {
        ...state,
        draftValues: {
          ...state.draftValues,
          [String(action.columnId)]: action.value,
        },
      };
    case 'OPEN_DELETE_MODAL':
      return {
        ...state,
        deleteModalOpen: true,
        deletingRow: action.row,
      };
    case 'CLOSE_DELETE_MODAL':
      return {
        ...state,
        deleteModalOpen: false,
        deletingRow: null,
      };
    default:
      return state;
  }
}

const STATUS_CYCLE = ['', 'Obtained', 'Complete'];
const HELMINTH_CYCLE = ['', 'Yes'];
const ADMIN_STATUS_CYCLE = ['', 'Obtained', 'Complete', 'Unavailable'];

function nextStatus(
  current: string,
  columnName: string,
  isAdminOverride = false,
): string {
  const cycle =
    columnName === 'Helminth'
      ? HELMINTH_CYCLE
      : isAdminOverride
        ? ADMIN_STATUS_CYCLE
        : STATUS_CYCLE;
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1 + cycle.length) % cycle.length];
}

function statusClass(value: string, columnName: string): string {
  if (columnName === 'Helminth') {
    return value === 'Yes'
      ? 'status-btn helminth-btn yes'
      : 'status-btn helminth-btn empty';
  }
  return `status-btn ${value.toLowerCase() || 'empty'}`;
}

export function WarframePage() {
  const { auth } = useAuth();
  const isAdmin = auth.status === 'ok' && auth.user.isAdmin;
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [worksheetId, setWorksheetId] = useState<number | null>(null);
  const [data, setData] = useState<WorksheetData>({ columns: [], rows: [] });
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
  const [modalState, dispatchModal] = useReducer(modalReducer, initialModalState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function fetchWorksheetData(targetWorksheetId: number): Promise<WorksheetData> {
    const response = await fetch(`/api/warframe/worksheets/${targetWorksheetId}`);
    if (!response.ok) {
      throw new Error('Failed to load worksheet data');
    }
    const body = (await response.json()) as {
      columns?: Column[];
      rows?: Row[];
    };
    return {
      columns: Array.isArray(body.columns) ? body.columns : [],
      rows: Array.isArray(body.rows) ? body.rows : [],
    };
  }

  useEffect(() => {
    async function loadWorksheets() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch('/api/warframe/worksheets');
        if (!response.ok) {
          throw new Error('Failed to load worksheets');
        }
        const body = (await response.json()) as { worksheets?: Worksheet[] };
        const items = Array.isArray(body.worksheets) ? body.worksheets : [];
        setWorksheets(items);
        setWorksheetId(items[0]?.id ?? null);
      } catch {
        setError('Could not load Warframe worksheets.');
      } finally {
        setLoading(false);
      }
    }
    void loadWorksheets();
  }, []);

  useEffect(() => {
    if (worksheetId === null) {
      setData({ columns: [], rows: [] });
      return;
    }
    const currentWorksheetId = worksheetId;
    async function loadData() {
      setLoading(true);
      setError(null);
      setData({ columns: [], rows: [] });
      try {
        const worksheetData = await fetchWorksheetData(currentWorksheetId);
        setData(worksheetData);
      } catch {
        setError('Could not load worksheet data.');
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [worksheetId]);

  const rows = useMemo(
    () =>
      data.rows.filter((row) =>
        (row.name || row.item_name || '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.rows, search],
  );

  async function reloadCurrentWorksheet(): Promise<void> {
    if (worksheetId === null) {
      return;
    }
    try {
      const worksheetData = await fetchWorksheetData(worksheetId);
      setData(worksheetData);
    } catch {
      setError('Could not refresh worksheet data.');
    }
  }

  async function handleToggle(row: Row, column: Column): Promise<void> {
    const oldValue = row.values?.[String(column.id)] ?? '';
    const isAdminOverride = isAdmin && adminOverride;
    if (oldValue === 'Unavailable' && !isAdminOverride) {
      return;
    }
    const value = nextStatus(oldValue, column.name, isAdminOverride);
    const rowId = row.id;
    setData((previous) => ({
      ...previous,
      rows: previous.rows.map((candidate) =>
        candidate.id === row.id
          ? {
              ...candidate,
              values: {
                ...(candidate.values || {}),
                [String(column.id)]: value,
              },
            }
          : candidate,
      ),
    }));
    try {
      const response = await apiFetch(
        isAdminOverride ? '/api/warframe/admin/cells' : '/api/warframe/cells',
        {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: rowId,
          column_id: column.id,
          value,
        }),
      },
      );
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Update failed');
      }
    } catch {
      setData((previous) => ({
        ...previous,
        rows: previous.rows.map((candidate) =>
          candidate.id === row.id
            ? {
                ...candidate,
                values: {
                  ...(candidate.values || {}),
                  [String(column.id)]: oldValue,
                },
              }
            : candidate,
        ),
      }));
      setError('Failed to save Warframe update.');
    }
  }

  function openAddModal(): void {
    dispatchModal({ type: 'OPEN_ADD_MODAL', columns: data.columns });
  }

  function openEditModal(row: Row): void {
    dispatchModal({ type: 'OPEN_EDIT_MODAL', row });
  }

  async function submitItem(): Promise<void> {
    if (isSaving) {
      return;
    }
    if (!worksheetId || modalState.draftName.trim().length === 0) {
      setError('Item name is required.');
      return;
    }
    const isEdit = modalState.editingRowId !== null;
    const url = isEdit
      ? `/api/warframe/rows/${modalState.editingRowId}`
      : '/api/warframe/rows';
    const method = isEdit ? 'PATCH' : 'POST';
    const body = isEdit
      ? { item_name: modalState.draftName.trim(), values: modalState.draftValues }
      : {
          worksheet_id: worksheetId,
          item_name: modalState.draftName.trim(),
          values: modalState.draftValues,
        };
    setIsSaving(true);
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to save row');
      }
      dispatchModal({ type: 'CLOSE_ITEM_MODAL' });
      await reloadCurrentWorksheet();
    } catch {
      setError('Failed to save Warframe row.');
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (isDeleting || !modalState.deletingRow) return;
    setIsDeleting(true);
    try {
      const response = await apiFetch(`/api/warframe/rows/${modalState.deletingRow.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to delete row');
      }
      dispatchModal({ type: 'CLOSE_DELETE_MODAL' });
      await reloadCurrentWorksheet();
    } catch {
      setError('Failed to delete Warframe row.');
    } finally {
      setIsDeleting(false);
    }
  }

  function handleRetry(): void {
    setError(null);
    if (worksheetId === null) {
      setLoading(true);
      void apiFetch('/api/warframe/worksheets')
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Failed to load worksheets');
          }
          const body = (await response.json()) as { worksheets?: Worksheet[] };
          const items = Array.isArray(body.worksheets) ? body.worksheets : [];
          setWorksheets(items);
          setWorksheetId(items[0]?.id ?? null);
        })
        .catch(() => {
          setError('Could not load Warframe worksheets.');
        })
        .finally(() => {
          setLoading(false);
        });
      return;
    }
    setLoading(true);
    setData({ columns: [], rows: [] });
    void apiFetch(`/api/warframe/worksheets/${worksheetId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed');
        }
        const body = (await response.json()) as {
          columns?: Column[];
          rows?: Row[];
        };
        setData({
          columns: Array.isArray(body.columns) ? body.columns : [],
          rows: Array.isArray(body.rows) ? body.rows : [],
        });
      })
      .catch(() => {
        setError('Could not load worksheet data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading Warframe...
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3">
        <p className="error" role="alert">
          {error}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={handleRetry}>
            Retry
          </button>
          <button type="button" className="btn btn-cancel" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Warframe</h1>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${editMode ? 'btn-accent' : 'btn-secondary'}`}
          onClick={() => setEditMode((previous) => !previous)}
          aria-label={editMode ? 'Exit edit mode' : 'Enter edit mode'}
        >
          {editMode ? 'Done Editing' : 'Edit Mode'}
        </button>
        {editMode ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openAddModal}
            aria-label="Add Warframe row"
          >
            Add Item
          </button>
        ) : null}
        {isAdmin ? (
          <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-glass-border)] px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={adminOverride}
              onChange={(event) => setAdminOverride(event.target.checked)}
              aria-label="Enable admin override updates"
            />
            Admin override
          </label>
        ) : null}
      </div>
      <label className="form-group">
        <span className="mb-2 block text-sm text-muted">Worksheet</span>
        <select
          value={worksheetId ?? ''}
          onChange={(event) =>
            setWorksheetId(event.target.value === '' ? null : Number(event.target.value))
          }
          aria-label="Select Warframe worksheet"
        >
          {worksheets.map((worksheet) => (
            <option key={worksheet.id} value={worksheet.id}>
              {worksheet.name}
            </option>
          ))}
        </select>
      </label>
      <label className="form-group">
        <span className="mb-2 block text-sm text-muted">Search</span>
        <input
          className="search-box"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search Warframe items"
          placeholder="Search..."
        />
      </label>
      <div className="table-container">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {data.columns.map((column) => (
                  <th key={column.id}>{column.name}</th>
                ))}
                {editMode ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="item-name">{row.name || row.item_name || 'Unnamed'}</td>
                  {data.columns.map((column) => {
                    const value = row.values?.[String(column.id)] ?? '';
                    return (
                      <td key={`${row.id}-${column.id}`} className="status-cell">
                        <button
                          type="button"
                          className={statusClass(value, column.name)}
                          onClick={() => {
                            void handleToggle(row, column);
                          }}
                          aria-label={`${column.name} status for ${row.name || row.item_name || 'item'}`}
                          disabled={value === 'Unavailable' && !(isAdmin && adminOverride)}
                        >
                          {column.name === 'Helminth'
                            ? value === 'Yes'
                              ? '✓'
                              : '—'
                            : value || '—'}
                        </button>
                      </td>
                    );
                  })}
                  {editMode ? (
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn-icon btn-edit"
                        onClick={() => openEditModal(row)}
                        aria-label={`Edit ${row.name || row.item_name || 'row'}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-delete"
                        onClick={() => {
                          dispatchModal({ type: 'OPEN_DELETE_MODAL', row });
                        }}
                        aria-label={`Delete ${row.name || row.item_name || 'row'}`}
                      >
                        🗑
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          void reloadCurrentWorksheet();
        }}
      >
        Refresh
      </button>

      <Modal
        open={modalState.itemModalOpen}
        onClose={() => dispatchModal({ type: 'CLOSE_ITEM_MODAL' })}
        ariaLabelledBy="warframe-item-modal-title"
      >
        <h2 id="warframe-item-modal-title" className="mb-4 text-lg font-semibold">
          {modalState.editingRowId === null ? 'Add Item' : 'Edit Item'}
        </h2>
        <div className="form-group">
          <label htmlFor="warframe-item-name">Name</label>
          <input
            id="warframe-item-name"
            value={modalState.draftName}
            onChange={(event) =>
              dispatchModal({ type: 'SET_DRAFT_NAME', value: event.target.value })
            }
          />
        </div>
        {data.columns.map((column) => (
          <div key={column.id} className="form-group">
            <label htmlFor={`warframe-col-${column.id}`}>{column.name}</label>
            <select
              id={`warframe-col-${column.id}`}
              value={modalState.draftValues[String(column.id)] ?? ''}
              onChange={(event) => {
                dispatchModal({
                  type: 'SET_DRAFT_VALUE',
                  columnId: column.id,
                  value: event.target.value,
                });
              }}
            >
              {(
                column.name === 'Helminth'
                  ? HELMINTH_CYCLE
                  : isAdmin
                    ? ADMIN_STATUS_CYCLE
                    : STATUS_CYCLE
              ).map((value) => (
                <option key={value || 'empty'} value={value}>
                  {value || '—'}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => dispatchModal({ type: 'CLOSE_ITEM_MODAL' })}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void submitItem()}
            disabled={isSaving}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={modalState.deleteModalOpen}
        onClose={() => dispatchModal({ type: 'CLOSE_DELETE_MODAL' })}
        ariaLabelledBy="warframe-delete-modal-title"
      >
        <h2 id="warframe-delete-modal-title" className="mb-4 text-lg font-semibold">
          Delete Item
        </h2>
        <p className="text-sm text-muted">
          Delete{' '}
          <strong>
            {modalState.deletingRow?.name ||
              modalState.deletingRow?.item_name ||
              'this item'}
          </strong>
          ?
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => dispatchModal({ type: 'CLOSE_DELETE_MODAL' })}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void confirmDelete()}
            disabled={isDeleting}
          >
            Delete
          </button>
        </div>
      </Modal>
    </section>
  );
}
