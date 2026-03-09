import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useLayoutSlots } from '../../components/Layout/useLayoutSlots';
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
type WorksheetSyncResult = {
  worksheet: string;
  added: string[];
  deleted: string[];
  markedUnavailable: string[];
  mismatched: number[];
};
type SyncResult = {
  users: Array<{
    userId: number;
    worksheets: WorksheetSyncResult[];
  }>;
  summary: {
    added: number;
    deleted: number;
    markedUnavailable: number;
    mismatched: number;
  };
  cleanup?: {
    deleted: number;
    requiresConfirmation: number;
    deletedRows: Array<{
      worksheet: string;
      itemName: string;
      rowId: number;
      canonicalKey: string;
    }>;
    requiresConfirmationRows: Array<{
      worksheet: string;
      itemName: string;
      rowId: number;
      canonicalKey: string;
    }>;
  };
};

const WORKSHEET_LABELS: Record<string, string> = {
  Warframes: 'Warframes',
  'Primary Weapons': 'Primary',
  'Secondary Weapons': 'Secondary',
  'Melee Weapons': 'Melee',
  'Modular Weapons': 'Modular',
  Companions: 'Companions',
  'Archwing Weapons': 'Archwing',
  Accessories: 'Accessories',
};
const WORKSHEET_ORDER = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Companions',
  'Archwing Weapons',
  'Accessories',
] as const;

const worksheetOrderIndex = new Map<string, number>(
  WORKSHEET_ORDER.map((name, index) => [name, index]),
);
const tableScrollStyle = {
  '--header-offset': '430px',
} as CSSProperties;

function statusClass(value: string, columnName: string): string {
  if (columnName === 'Helminth') {
    return value === 'Yes'
      ? 'status-btn helminth-btn yes'
      : 'status-btn helminth-btn empty';
  }
  return `status-btn ${value.toLowerCase() || 'empty'}`;
}

function cellDisplay(value: string | undefined, columnName: string): string {
  if (columnName === 'Helminth' && value === 'Yes') {
    return '✓';
  }
  return value || '—';
}

export function WarframeAdminPage() {
  const { auth } = useAuth();
  const { setHeaderCenter, setHeaderActions } = useLayoutSlots();
  const isAdmin = auth.status === 'ok' && auth.user.isAdmin;
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [worksheetId, setWorksheetId] = useState<number | null>(null);
  const [data, setData] = useState<WorksheetData>({ columns: [], rows: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncResult['summary'] | null>(null);
  const [cleanup, setCleanup] = useState<SyncResult['cleanup'] | null>(null);
  const [mismatchedByWorksheet, setMismatchedByWorksheet] = useState<
    Record<string, Set<number>>
  >({});

  const loadWorksheets = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/warframe/worksheets');
      if (!response.ok) throw new Error('Failed to load worksheets');
      const body = (await response.json()) as { worksheets?: Worksheet[] };
      const next = Array.isArray(body.worksheets) ? body.worksheets : [];
      const sorted = [...next].sort((a, b) => {
        const ai = worksheetOrderIndex.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const bi = worksheetOrderIndex.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
      setWorksheets(sorted);
      setWorksheetId((current) => current ?? sorted[0]?.id ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load worksheets',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorksheetData = useCallback(async (targetWorksheetId: number) => {
    setLoadingData(true);
    try {
      const response = await apiFetch(
        `/api/warframe/worksheets/${targetWorksheetId}`,
      );
      if (!response.ok) throw new Error('Failed to load worksheet data');
      const body = (await response.json()) as {
        columns?: Column[];
        rows?: Row[];
      };
      setData({
        columns: Array.isArray(body.columns) ? body.columns : [],
        rows: Array.isArray(body.rows) ? body.rows : [],
      });
    } catch (err) {
      console.error('[warframe admin] Failed to load worksheet data', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load worksheet data',
      );
    } finally {
      setLoadingData(false);
    }
  }, []);

  const loadPreview = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch('/api/warframe/admin/sync-preview');
      if (!response.ok) throw new Error('Failed to load sync preview');
      const body = (await response.json()) as SyncResult;
      setSummary(body.summary ?? null);
      setCleanup(body.cleanup ?? null);
      const firstUser = body.users?.[0];
      const mismatchMap: Record<string, Set<number>> = {};
      if (firstUser?.worksheets) {
        for (const sheet of firstUser.worksheets) {
          mismatchMap[sheet.worksheet] = new Set(sheet.mismatched ?? []);
        }
      }
      setMismatchedByWorksheet(mismatchMap);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load sync preview',
      );
    }
  }, []);

  useEffect(() => {
    void loadWorksheets();
    void loadPreview();
  }, [loadPreview, loadWorksheets]);

  useEffect(() => {
    if (worksheetId === null) return;
    void loadWorksheetData(worksheetId).catch((err) => {
      setError(
        err instanceof Error ? err.message : 'Failed to load worksheet data',
      );
    });
  }, [loadWorksheetData, worksheetId]);

  const activeWorksheetName = useMemo(
    () =>
      worksheets.find((worksheet) => worksheet.id === worksheetId)?.name ?? '',
    [worksheetId, worksheets],
  );

  const mismatchedRows =
    mismatchedByWorksheet[activeWorksheetName] ?? new Set<number>();

  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) =>
        (row.name || row.item_name || '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.rows, search],
  );

  const handleSync = useCallback(async (): Promise<void> => {
    setRunningSync(true);
    setError(null);
    try {
      const response = await apiFetch('/api/warframe/admin/sync-source', {
        method: 'POST',
      });
      const body = (await response.json().catch(() => null)) as
        | SyncResult
        | { error?: string }
        | null;
      if (!response.ok || (body && 'error' in body && body.error)) {
        throw new Error(
          (body && 'error' in body && body.error) || 'Failed to run sync',
        );
      }
      const result = body as SyncResult;
      setSummary(result.summary ?? null);
      setCleanup(result.cleanup ?? null);
      await loadWorksheets();
      if (worksheetId !== null) {
        await loadWorksheetData(worksheetId);
      }
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run sync');
    } finally {
      setRunningSync(false);
    }
  }, [loadPreview, loadWorksheetData, loadWorksheets, worksheetId]);

  useEffect(() => {
    setHeaderCenter(
      <div className="search-wrapper">
        <input
          className="search-box"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search Warframe admin rows"
          placeholder="Search..."
        />
        <button
          type="button"
          className={`search-clear ${search.length > 0 ? 'visible' : ''}`}
          aria-label="Clear search"
          onClick={() => setSearch('')}
        >
          &times;
        </button>
      </div>,
    );
    return () => {
      setHeaderCenter(null);
    };
  }, [search, setHeaderCenter]);

  useEffect(() => {
    setHeaderActions(
      <button
        type="button"
        className="header-link"
        onClick={() => void handleSync()}
        disabled={runningSync}
      >
        {runningSync ? 'Syncing…' : 'Sync From Parametric'}
      </button>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [handleSync, runningSync, setHeaderActions]);

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] p-6">
        <h1 className="mb-2 text-2xl font-semibold">Warframe Admin</h1>
        <p className="text-sm text-muted">Admin access is required.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading Warframe admin...
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Warframe Admin</h1>
      <p className="text-sm text-muted">
        Opening this page loads a preview only. Import runs from the header
        action button.
      </p>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {summary ? (
        <div className="sync-summary">
          <span>Added: {summary.added}</span>
          <span>Deleted: {summary.deleted}</span>
          <span>Unavailable: {summary.markedUnavailable}</span>
          <span>Mismatched: {summary.mismatched}</span>
          {cleanup ? <span>Cleanup Deleted: {cleanup.deleted}</span> : null}
          {cleanup && cleanup.requiresConfirmation > 0 ? (
            <span>Cleanup Review Needed: {cleanup.requiresConfirmation}</span>
          ) : null}
        </div>
      ) : null}
      {cleanup && cleanup.requiresConfirmationRows.length > 0 ? (
        <p className="text-sm text-yellow-300" role="status">
          Some duplicate rows contain user progress and were not deleted. Review
          required before manual cleanup.
        </p>
      ) : null}

      <div
        className="tabs"
        role="tablist"
        aria-label="Warframe admin categories"
      >
        {worksheets.map((worksheet) => (
          <button
            key={worksheet.id}
            type="button"
            className={`tab ${worksheetId === worksheet.id ? 'active' : ''}`}
            role="tab"
            aria-selected={worksheetId === worksheet.id}
            onClick={() => setWorksheetId(worksheet.id)}
          >
            {WORKSHEET_LABELS[worksheet.name] ?? worksheet.name}
          </button>
        ))}
      </div>

      <div className="table-container" aria-busy={loadingData}>
        {loadingData ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
            role="status"
            aria-live="polite"
          >
            <span className="loading p-0">Loading worksheet data...</span>
          </div>
        ) : null}
        <div
          className={`table-scroll ${loadingData ? 'opacity-60' : ''}`}
          style={tableScrollStyle}
        >
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 'auto' }} />
              {data.columns.map((column) => (
                <col
                  key={`col-${column.id}`}
                  style={{
                    width: column.name === 'Helminth' ? '150px' : '200px',
                  }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                {data.columns.map((column) => (
                  <th key={column.id} className="text-center">
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingData ? (
                <tr>
                  <td
                    className="text-center text-muted"
                    colSpan={Math.max(data.columns.length + 1, 1)}
                  >
                    Loading worksheet data...
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const displayName = row.name || row.item_name || 'Unnamed';
                  const isMismatch = mismatchedRows.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={isMismatch ? 'sync-mismatch-row' : undefined}
                    >
                      <td className="item-name">{displayName}</td>
                      {data.columns.map((column) => {
                        const value = row.values?.[String(column.id)];
                        return (
                          <td
                            key={`${row.id}-${column.id}`}
                            className="status-cell"
                          >
                            <button
                              type="button"
                              className={statusClass(value ?? '', column.name)}
                              disabled
                              aria-label={`${column.name} status for ${displayName}`}
                            >
                              {cellDisplay(value, column.name)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
