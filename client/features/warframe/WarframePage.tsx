import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLayoutSlots } from '../../components/Layout/useLayoutSlots';
import { apiFetch } from '../../utils/api';

type Worksheet = { id: number; name: string };
type Column = { id: number; name: string };
type Row = {
  id: number;
  name?: string;
  item_name?: string;
  values?: Record<string, string>;
};
type WorksheetData = { columns: Column[]; rows: Row[] };

const STATUS_CYCLE = ['', 'Obtained', 'Complete'];
const HELMINTH_CYCLE = ['', 'Yes'];
const TAB_ORDER = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Archwing Weapons',
  'Accessories',
] as const;
const WORKSHEET_LABELS: Record<string, string> = {
  Warframes: 'Warframes',
  'Primary Weapons': 'Primary',
  'Secondary Weapons': 'Secondary',
  'Melee Weapons': 'Melee',
  'Modular Weapons': 'Modular',
  'Archwing Weapons': 'Archwing',
  Accessories: 'Accessories',
};

function nextStatus(current: string, columnName: string): string {
  const cycle = columnName === 'Helminth' ? HELMINTH_CYCLE : STATUS_CYCLE;
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
  const { setHeaderCenter, setHeaderActions } = useLayoutSlots();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [worksheetId, setWorksheetId] = useState<number | null>(null);
  const [data, setData] = useState<WorksheetData>({ columns: [], rows: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const worksheetIdRef = useRef<number | null>(worksheetId);

  useEffect(() => {
    worksheetIdRef.current = worksheetId;
  }, [worksheetId]);

  const fetchWorksheets = useCallback(async (): Promise<Worksheet[]> => {
    const response = await apiFetch('/api/warframe/worksheets');
    if (!response.ok) {
      throw new Error('Failed to load worksheets');
    }
    const body = (await response.json()) as { worksheets?: Worksheet[] };
    return Array.isArray(body.worksheets) ? body.worksheets : [];
  }, []);

  const fetchWorksheetData = useCallback(
    async (
      targetWorksheetId: number,
      signal?: AbortSignal,
    ): Promise<WorksheetData> => {
      const response = await apiFetch(
        `/api/warframe/worksheets/${targetWorksheetId}`,
        {
          signal,
        },
      );
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
    },
    [],
  );

  const loadWorksheets = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const items = (await fetchWorksheets())
        .map((worksheet) => ({
          ...worksheet,
          name: worksheet.name.replace(/^\uFEFF/, '').trim(),
        }))
        .sort((a, b) => {
          const indexA = TAB_ORDER.indexOf(
            a.name as (typeof TAB_ORDER)[number],
          );
          const indexB = TAB_ORDER.indexOf(
            b.name as (typeof TAB_ORDER)[number],
          );
          return (
            (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
          );
        });
      setWorksheets(items);
      setWorksheetId(items[0]?.id ?? null);
    } catch {
      setError('Could not load Warframe worksheets.');
    } finally {
      setLoading(false);
    }
  }, [fetchWorksheets]);

  const loadWorksheetData = useCallback(
    async (targetWorksheetId: number, signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setError(null);
      setData({ columns: [], rows: [] });
      try {
        const worksheetData = await fetchWorksheetData(
          targetWorksheetId,
          signal,
        );
        if (signal?.aborted || worksheetIdRef.current !== targetWorksheetId) {
          return;
        }
        setData(worksheetData);
      } catch (error_) {
        if (
          signal?.aborted ||
          (error_ instanceof Error && error_.name === 'AbortError') ||
          worksheetIdRef.current !== targetWorksheetId
        ) {
          return;
        }
        setError('Could not load worksheet data.');
      } finally {
        if (!signal?.aborted && worksheetIdRef.current === targetWorksheetId) {
          setLoading(false);
        }
      }
    },
    [fetchWorksheetData],
  );

  useEffect(() => {
    void loadWorksheets();
  }, [loadWorksheets]);

  useEffect(() => {
    let controller: AbortController | null = null;
    if (worksheetId === null) {
      setData({ columns: [], rows: [] });
    } else {
      controller = new AbortController();
      const currentWorksheetId = worksheetId;
      void loadWorksheetData(currentWorksheetId, controller.signal);
    }
    return () => {
      controller?.abort();
    };
  }, [worksheetId, loadWorksheetData]);

  const rows = useMemo(
    () =>
      data.rows.filter((row) =>
        (row.name || row.item_name || '')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.rows, search],
  );

  const stats = useMemo(() => {
    const byColumn: Record<string, { total: number; complete: number }> = {};
    for (const column of data.columns) {
      if (column.name === 'Helminth') continue;
      byColumn[String(column.id)] = { total: 0, complete: 0 };
    }
    for (const row of data.rows) {
      for (const column of data.columns) {
        if (column.name === 'Helminth') continue;
        const key = String(column.id);
        byColumn[key].total += 1;
        if ((row.values?.[key] ?? '') === 'Complete') {
          byColumn[key].complete += 1;
        }
      }
    }
    return data.columns
      .filter((column) => column.name !== 'Helminth')
      .map((column) => {
        const entry = byColumn[String(column.id)];
        const percent =
          entry.total > 0
            ? Math.round((entry.complete / entry.total) * 100)
            : 0;
        return {
          name: column.name,
          complete: entry.complete,
          total: entry.total,
          percent,
        };
      });
  }, [data.columns, data.rows]);

  async function handleToggle(row: Row, column: Column): Promise<void> {
    const oldValue = row.values?.[String(column.id)] ?? '';
    if (oldValue === 'Unavailable') {
      return;
    }
    const value = nextStatus(oldValue, column.name);
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
      const response = await apiFetch('/api/warframe/cells', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: rowId,
          column_id: column.id,
          value,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
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

  useEffect(() => {
    setHeaderActions(null);
  }, [setHeaderActions]);

  useEffect(() => {
    setHeaderCenter(
      <div className="search-wrapper">
        <input
          className="search-box"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search Warframe items"
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

  function handleRetry(): void {
    setError(null);
    if (worksheetId === null) {
      void loadWorksheets();
      return;
    }
    void loadWorksheetData(worksheetId);
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleRetry}
          >
            Retry
          </button>
          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="tabs" role="tablist" aria-label="Warframe categories">
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
      <div className="stats-bar">
        {stats.map((entry) => (
          <div key={entry.name} className="stat">
            <span>{entry.name}:</span>
            <span className="stat-value stat-complete">{entry.complete}</span>
            <span>/</span>
            <span className="stat-value">{entry.total}</span>
            <span>({entry.percent}%)</span>
          </div>
        ))}
      </div>
      <div className="table-container">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {data.columns.map((column) => (
                  <th key={column.id}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="item-name">
                    {row.name || row.item_name || 'Unnamed'}
                  </td>
                  {data.columns.map((column) => {
                    const value = row.values?.[String(column.id)] ?? '';
                    return (
                      <td
                        key={`${row.id}-${column.id}`}
                        className="status-cell"
                      >
                        <button
                          type="button"
                          className={statusClass(value, column.name)}
                          onClick={() => {
                            void handleToggle(row, column);
                          }}
                          aria-label={`${column.name} status for ${row.name || row.item_name || 'item'}`}
                          disabled={value === 'Unavailable'}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
