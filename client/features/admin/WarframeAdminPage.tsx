import { isHelminthNonSubsumableItemName } from '@codex/game-warframe/helminth-exceptions';
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';

import { useLayoutSlots } from '../../components/Layout/useLayoutSlots';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
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
type WorksheetSyncResult = {
  worksheet: string;
  added: string[];
  deleted: string[];
  markedUnavailable: string[];
  mismatched: number[];
};
type MarketLinkSyncPayload =
  | { ran: false }
  | {
      ran: true;
      rowsProcessed: number;
      rowsWithLink: number;
      failedWorksheets: Array<{ userId: number; worksheet: string }>;
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
  marketLinkSync?: MarketLinkSyncPayload;
};

const NAME_PREVIEW_LIMIT = 10;

function formatNameSample(names: string[], limit = NAME_PREVIEW_LIMIT): string | null {
  if (names.length === 0) return null;
  const slice = names.slice(0, limit);
  const suffix = names.length > limit ? ` (+${names.length - limit} more)` : '';
  return `${slice.join(', ')}${suffix}`;
}

function worksheetHasActivity(sheet: WorksheetSyncResult): boolean {
  return (
    sheet.added.length > 0 ||
    sheet.deleted.length > 0 ||
    sheet.markedUnavailable.length > 0 ||
    sheet.mismatched.length > 0
  );
}

const WORKSHEET_LABELS: Record<string, string> = {
  Warframes: 'Warframes',
  'Primary Weapons': 'Primary',
  'Secondary Weapons': 'Secondary',
  'Melee Weapons': 'Melee',
  'Modular Weapons': 'Modular',
  'K-Drives': 'K-Drives',
  Companions: 'Companions',
  'Companion Weapons': 'Companion Weapons',
  'Archwing Weapons': 'Archwing',
  Accessories: 'Accessories',
};
const WORKSHEET_ORDER = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'K-Drives',
  'Companions',
  'Companion Weapons',
  'Archwing Weapons',
  'Accessories',
] as const;

const worksheetOrderIndex = new Map<string, number>(
  WORKSHEET_ORDER.map((name, index) => [name, index]),
);
const tableScrollStyle = {
  '--header-offset': '430px',
} as CSSProperties;

function SyncFromArmoryReportModal({
  open,
  result,
  onClose,
}: {
  open: boolean;
  result: SyncResult | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabelledBy="warframe-sync-report-title"
      className="warframe-sync-report-modal"
    >
      {!result ? (
        <>
          <h2 id="warframe-sync-report-title">Armory sync</h2>
          <p className="text-muted text-sm">No report data.</p>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <SyncFromArmoryReportBody result={result} onClose={onClose} />
      )}
    </Modal>
  );
}

function SyncFromArmoryReportBody({
  result,
  onClose,
}: {
  result: SyncResult;
  onClose: () => void;
}) {
  const { summary, cleanup, users } = result;
  const marketLinkSync = result.marketLinkSync ?? { ran: false as const };
  const totalMovement =
    summary.added + summary.deleted + summary.markedUnavailable + summary.mismatched;
  const cleanupRemoved = cleanup?.deleted ?? 0;
  const cleanupReview = cleanup?.requiresConfirmation ?? 0;
  const marketHadSuccessfulRefresh =
    marketLinkSync.ran && (marketLinkSync.rowsProcessed > 0 || marketLinkSync.rowsWithLink > 0);
  const marketHadNoActivity =
    !marketLinkSync.ran ||
    (marketLinkSync.rowsProcessed === 0 &&
      marketLinkSync.rowsWithLink === 0 &&
      marketLinkSync.failedWorksheets.length === 0);

  return (
    <>
      <h2 id="warframe-sync-report-title">Armory sync complete</h2>
      <p className="text-muted mt-2 text-sm leading-relaxed">
        Worksheet rows were reconciled against Armory&apos;s database (same item names your tracker
        uses). Totals below are across all Codex users who own these worksheets.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">New rows added</dt>
        <dd className="font-mono font-medium tabular-nums">{summary.added}</dd>
        <dt className="text-muted">Rows removed / merged out</dt>
        <dd className="font-mono font-medium tabular-nums">{summary.deleted}</dd>
        <dt className="text-muted">Marked unavailable</dt>
        <dd className="font-mono font-medium tabular-nums">{summary.markedUnavailable}</dd>
        <dt className="text-muted">Mismatched (still on sheet)</dt>
        <dd className="font-mono font-medium tabular-nums">{summary.mismatched}</dd>
        <dt className="text-muted">Warframe Market links (from Armory)</dt>
        <dd className="text-sm leading-snug">
          {!marketLinkSync.ran ? (
            <span className="text-muted">Not run</span>
          ) : marketLinkSync.failedWorksheets.length > 0 &&
            marketLinkSync.rowsProcessed === 0 &&
            marketLinkSync.rowsWithLink === 0 ? (
            <span className="text-warning">
              Import failed for every worksheet — check server logs.
            </span>
          ) : (
            <>
              <span className="font-mono font-medium text-[var(--color-foreground)] tabular-nums">
                {marketLinkSync.rowsWithLink}
              </span>{' '}
              <span className="text-muted">
                row{marketLinkSync.rowsWithLink === 1 ? '' : 's'} with a market URL (
                {marketLinkSync.rowsProcessed} Codex rows updated)
              </span>
              {marketLinkSync.failedWorksheets.length > 0 ? (
                <span className="text-warning mt-1 block">
                  {marketLinkSync.failedWorksheets.length} worksheet
                  {marketLinkSync.failedWorksheets.length === 1 ? '' : 's'} could not be refreshed
                  (User{' '}
                  {marketLinkSync.failedWorksheets
                    .map((f) => `${f.userId} · ${f.worksheet}`)
                    .join('; ')}
                  ).
                </span>
              ) : null}
            </>
          )}
        </dd>
      </dl>

      {cleanupRemoved > 0 || cleanupReview > 0 ? (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            cleanupReview > 0
              ? 'border-warning/40 bg-warning/10'
              : 'border-[var(--color-glass-border)] bg-[var(--color-glass)]'
          }`}
        >
          <p className="font-medium">Duplicate cleanup</p>
          <ul className="text-muted mt-1 list-inside list-disc space-y-0.5">
            {cleanupRemoved > 0 ? (
              <li>
                Removed {cleanupRemoved} duplicate row{cleanupRemoved === 1 ? '' : 's'} that had no
                progress.
              </li>
            ) : null}
            {cleanupReview > 0 ? (
              <li>
                {cleanupReview} duplicate row{cleanupReview === 1 ? '' : 's'} still need manual
                review (progress on both copies). They stay in the sheet until you resolve them.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {totalMovement === 0 && cleanupRemoved === 0 && cleanupReview === 0 && marketHadNoActivity ? (
        <p className="text-muted mt-4 text-sm">
          No changes were necessary — Codex already matched Armory for every user.
        </p>
      ) : totalMovement === 0 &&
        cleanupRemoved === 0 &&
        cleanupReview === 0 &&
        marketHadSuccessfulRefresh ? (
        <p className="text-muted mt-4 text-sm">
          No worksheet row changes — Warframe Market links were still refreshed from Armory (
          {marketLinkSync.rowsWithLink} with URLs, {marketLinkSync.rowsProcessed} rows updated).
        </p>
      ) : (
        <div className="mt-4 max-h-[min(50vh,22rem)] space-y-4 overflow-y-auto border-t border-[var(--color-glass-border)] pt-4">
          {users.map((u) => {
            const activeSheets = u.worksheets.filter(worksheetHasActivity);
            if (activeSheets.length === 0) return null;
            return (
              <div key={u.userId}>
                {users.length > 1 ? (
                  <p className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
                    User {u.userId}
                  </p>
                ) : null}
                {activeSheets.map((ws) => {
                  const label = WORKSHEET_LABELS[ws.worksheet] ?? ws.worksheet;
                  const addedLine = formatNameSample(ws.added);
                  const deletedLine = formatNameSample(ws.deleted);
                  const unavailableLine = formatNameSample(ws.markedUnavailable);
                  return (
                    <div key={`${u.userId}-${ws.worksheet}`} className="mb-4 last:mb-0">
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <ul className="text-muted mt-1.5 list-inside list-disc space-y-1 text-sm leading-relaxed">
                        {ws.added.length > 0 ? (
                          <li>
                            <span className="text-[var(--color-foreground)]">
                              Added ({ws.added.length}):
                            </span>{' '}
                            {addedLine}
                          </li>
                        ) : null}
                        {ws.deleted.length > 0 ? (
                          <li>
                            <span className="text-[var(--color-foreground)]">
                              Removed / cleanup ({ws.deleted.length}):
                            </span>{' '}
                            {deletedLine}
                          </li>
                        ) : null}
                        {ws.markedUnavailable.length > 0 ? (
                          <li>
                            <span className="text-[var(--color-foreground)]">
                              Marked unavailable ({ws.markedUnavailable.length}):
                            </span>{' '}
                            {unavailableLine}
                          </li>
                        ) : null}
                        {ws.mismatched.length > 0 ? (
                          <li>
                            <span className="text-[var(--color-foreground)]">
                              Not in Armory list ({ws.mismatched.length} rows)
                            </span>{' '}
                            — still on this worksheet; highlighted in the table until you remove or
                            fix them.
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

function statusClass(value: string, columnName: string, rowDisplayName?: string): string {
  if (columnName === 'Helminth') {
    if (value === 'Yes') return 'status-btn helminth-btn yes';
    if (
      value === 'Unavailable' ||
      (rowDisplayName !== undefined && isHelminthNonSubsumableItemName(rowDisplayName))
    ) {
      return 'status-btn helminth-btn unavailable';
    }
    return 'status-btn helminth-btn empty';
  }
  return `status-btn ${value.toLowerCase() || 'empty'}`;
}

function cellDisplay(
  value: string | undefined,
  columnName: string,
  rowDisplayName?: string,
): string {
  if (columnName === 'Helminth') {
    if (value === 'Yes') return '\u2713';
    if (
      value === 'Unavailable' ||
      (rowDisplayName && isHelminthNonSubsumableItemName(rowDisplayName))
    ) {
      return 'X';
    }
    return '\u2014';
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
  const [syncReportOpen, setSyncReportOpen] = useState(false);
  const [lastSyncReport, setLastSyncReport] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncResult['summary'] | null>(null);
  const [cleanup, setCleanup] = useState<SyncResult['cleanup'] | null>(null);
  const [mismatchedByWorksheet, setMismatchedByWorksheet] = useState<Record<string, Set<number>>>(
    {},
  );

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
      setError(err instanceof Error ? err.message : 'Failed to load worksheets');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorksheetData = useCallback(async (targetWorksheetId: number) => {
    setLoadingData(true);
    try {
      const response = await apiFetch(`/api/warframe/worksheets/${targetWorksheetId}`);
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
      setError(err instanceof Error ? err.message : 'Failed to load worksheet data');
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
      setError(err instanceof Error ? err.message : 'Failed to load sync preview');
    }
  }, []);

  useEffect(() => {
    void loadWorksheets();
    void loadPreview();
  }, [loadPreview, loadWorksheets]);

  useEffect(() => {
    if (worksheetId === null) return;
    void loadWorksheetData(worksheetId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load worksheet data');
    });
  }, [loadWorksheetData, worksheetId]);

  const activeWorksheetName = useMemo(
    () => worksheets.find((worksheet) => worksheet.id === worksheetId)?.name ?? '',
    [worksheetId, worksheets],
  );

  const mismatchedRows = mismatchedByWorksheet[activeWorksheetName] ?? new Set<number>();

  const filteredRows = useMemo(
    () =>
      data.rows.filter((row) =>
        (row.name || row.item_name || '').toLowerCase().includes(search.toLowerCase()),
      ),
    [data.rows, search],
  );

  const closeSyncReport = useCallback(() => {
    setSyncReportOpen(false);
    setLastSyncReport(null);
  }, []);

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
        throw new Error((body && 'error' in body && body.error) || 'Failed to run sync');
      }
      const result = body as SyncResult;
      setSummary(result.summary ?? null);
      setCleanup(result.cleanup ?? null);
      setLastSyncReport(result);
      setSyncReportOpen(true);
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
          id="codex-warframe-admin-search"
          name="search"
          type="text"
          role="searchbox"
          enterKeyHint="search"
          autoComplete="off"
          className="search-box"
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
          <MaterialSymbol name="close" style={{ fontSize: 18 }} />
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
        {runningSync ? 'Syncing...' : 'Sync From Armory'}
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
        <p className="text-muted text-sm">Admin access is required.</p>
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
      <SyncFromArmoryReportModal
        open={syncReportOpen}
        result={lastSyncReport}
        onClose={closeSyncReport}
      />
      <h1 className="text-2xl font-semibold">Warframe Admin</h1>
      <p className="text-muted text-sm">
        Opening this page loads a preview only. Import runs from the header action button.
      </p>
      {error ? (
        <p className="text-danger text-sm" role="alert">
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
          <span className="text-muted">
            Market links: Armory URLs are written only when you run full &quot;Sync From
            Armory&quot; (not this preview).
          </span>
        </div>
      ) : null}
      {cleanup && cleanup.requiresConfirmationRows.length > 0 ? (
        <p className="text-warning text-sm" role="status">
          Some duplicate rows contain user progress and were not deleted. Review required before
          manual cleanup.
        </p>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Warframe admin categories">
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
        <div className={`table-scroll ${loadingData ? 'opacity-60' : ''}`} style={tableScrollStyle}>
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
                    className="text-muted text-center"
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
                    <tr key={row.id} className={isMismatch ? 'sync-mismatch-row' : undefined}>
                      <td className="item-name">{displayName}</td>
                      {data.columns.map((column) => {
                        const value = row.values?.[String(column.id)];
                        return (
                          <td key={`${row.id}-${column.id}`} className="status-cell">
                            <button
                              type="button"
                              className={statusClass(value ?? '', column.name, displayName)}
                              disabled
                              aria-label={`${column.name} status for ${displayName}`}
                            >
                              {cellDisplay(value, column.name, displayName)}
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
