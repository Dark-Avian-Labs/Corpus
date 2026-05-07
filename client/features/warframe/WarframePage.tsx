import { isHelminthNonSubsumableItemName } from '@codex/game-warframe/helminth-exceptions';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useLayoutSlots } from '../../components/Layout/useLayoutSlots';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { apiFetch } from '../../utils/api';

type Worksheet = { id: number; name: string };
type Column = { id: number; name: string };
type Row = {
  id: number;
  name?: string;
  item_name?: string;
  values?: Record<string, string>;
  market_href?: string | null;
  market_href_normal?: string | null;
  market_href_prime?: string | null;
  advanced_progress?: {
    normal: {
      level: number;
      valence_percent: number | null;
      has_element: boolean;
      has_orokin: boolean;
      has_arcane: boolean;
      has_exilus: boolean;
    };
    prime: {
      level: number;
      valence_percent: number | null;
      has_element: boolean;
      has_orokin: boolean;
      has_arcane: boolean;
      has_exilus: boolean;
    };
  };
  advanced_relevance?: {
    normal: {
      max_level: number;
      valence: boolean;
      element: boolean;
      orokin: boolean;
      arcane: boolean;
      exilus: boolean;
    };
    prime: {
      max_level: number;
      valence: boolean;
      element: boolean;
      orokin: boolean;
      arcane: boolean;
      exilus: boolean;
    };
    has_prime_variant: boolean;
  };
};
type WorksheetData = { columns: Column[]; rows: Row[] };
type WarframeSettings = {
  hide_completed: boolean;
  market_links: boolean;
  advanced_mode: boolean;
  show_all_variants: boolean;
};
type ExitRowPhase = 'fill' | 'push';

const STATUS_CYCLE = ['', 'Obtained', 'Complete'];
const HELMINTH_CYCLE = ['', 'Yes'];
const TAB_ORDER = [
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
const tableScrollStyle = {
  '--header-offset': '320px',
} as CSSProperties;

function rowItemLabel(row: Row): string {
  return row.name || row.item_name || '';
}

function isHelminthNonSubsumableRow(row: Row): boolean {
  return isHelminthNonSubsumableItemName(rowItemLabel(row));
}

function helminthCellGlyph(value: string, row: Row): string {
  if (value === 'Yes') return '\u2713';
  if (value === 'Unavailable' || isHelminthNonSubsumableRow(row)) return '\u2717';
  return '\u2014';
}

function nextStatus(current: string, columnName: string): string {
  const cycle = columnName === 'Helminth' ? HELMINTH_CYCLE : STATUS_CYCLE;
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1 + cycle.length) % cycle.length];
}

function statusClass(value: string, columnName: string, row?: Row): string {
  if (columnName === 'Helminth') {
    if (row && isHelminthNonSubsumableRow(row)) {
      return 'status-btn helminth-btn unavailable';
    }
    if (value === 'Yes') return 'status-btn helminth-btn yes';
    if (value === 'Unavailable') return 'status-btn helminth-btn unavailable';
    return 'status-btn helminth-btn empty';
  }
  return `status-btn ${value.toLowerCase() || 'empty'}`;
}

function advancedToggleClass(
  checked: boolean,
  interactive: boolean,
  lockedActive?: boolean,
): string {
  if (lockedActive && checked) {
    return 'status-btn helminth-btn yes cursor-default border-success/35 bg-success/10 text-success/80';
  }
  if (!interactive) return 'status-btn helminth-btn unavailable';
  if (checked) return 'status-btn helminth-btn yes';
  return 'status-btn helminth-btn empty';
}

function advancedToggleGlyph(
  checked: boolean,
  interactive: boolean,
  lockedActive?: boolean,
): string {
  if (lockedActive && checked) return '\u2713';
  if (!interactive) return '\u2717';
  if (checked) return '\u2713';
  return '\u2014';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRowClassicCompleted(row: Row, columns: Column[]): boolean {
  const coreColumns = columns.filter((column) => column.name !== 'Helminth');
  if (coreColumns.length === 0) {
    return false;
  }

  const relevantCoreColumns = coreColumns.filter((column) => {
    const value = row.values?.[String(column.id)] ?? '';
    return value !== 'Unavailable';
  });
  if (relevantCoreColumns.length === 0) {
    return false;
  }

  const hasAllCoreComplete = relevantCoreColumns.every((column) => {
    const value = row.values?.[String(column.id)] ?? '';
    return value === 'Complete';
  });
  if (!hasAllCoreComplete) {
    return false;
  }

  const helminthColumn = columns.find((column) => column.name === 'Helminth');
  if (!helminthColumn) {
    return true;
  }

  const helminthValue = row.values?.[String(helminthColumn.id)] ?? '';
  if (isHelminthNonSubsumableItemName(rowItemLabel(row))) {
    return helminthValue === 'Unavailable' || helminthValue === '';
  }
  return helminthValue === 'Yes';
}

function advancedVariantsVisible(row: Row, showAllVariants: boolean): Array<'normal' | 'prime'> {
  const hasPrime = Boolean(row.advanced_relevance?.has_prime_variant);
  if (showAllVariants) {
    return hasPrime ? ['normal', 'prime'] : ['normal'];
  }
  return hasPrime ? ['prime'] : ['normal'];
}

function isRowAdvancedCompleted(row: Row, showAllVariants: boolean): boolean {
  const progress = row.advanced_progress;
  const relevance = row.advanced_relevance;
  if (!progress || !relevance) return false;
  const variants = advancedVariantsVisible(row, showAllVariants);
  for (const variant of variants) {
    const p = progress[variant];
    const r = relevance[variant];
    if (p.level < r.max_level) return false;
    if (r.valence && (p.valence_percent ?? 0) < 60) return false;
    if (r.element && !p.has_element) return false;
    if (r.orokin && !p.has_orokin) return false;
    if (r.arcane && !p.has_arcane) return false;
    if (r.exilus && !p.has_exilus) return false;
  }
  return true;
}

function isRowCompleted(
  row: Row,
  columns: Column[],
  advancedMode: boolean,
  showAllVariants: boolean,
): boolean {
  return advancedMode
    ? isRowAdvancedCompleted(row, showAllVariants)
    : isRowClassicCompleted(row, columns);
}

export function WarframePage() {
  const { setHeaderCenter, setHeaderActions } = useLayoutSlots();
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [worksheetId, setWorksheetId] = useState<number | null>(null);
  const [data, setData] = useState<WorksheetData>({ columns: [], rows: [] });
  const [search, setSearch] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [marketLinks, setMarketLinks] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showAllVariants, setShowAllVariants] = useState(false);
  const [exitingRows, setExitingRows] = useState<Record<number, ExitRowPhase>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const worksheetIdRef = useRef<number | null>(worksheetId);
  const exitTimersRef = useRef<Map<number, number[]>>(new Map());
  const holdIntervalRef = useRef<number | null>(null);
  const holdSessionRef = useRef<{
    latest: number;
    commit: (value: number) => void;
  } | null>(null);

  const clearExitTimers = useCallback((rowId: number): void => {
    const timers = exitTimersRef.current.get(rowId);
    if (!timers) return;
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    exitTimersRef.current.delete(rowId);
  }, []);

  const clearAllExitTimers = useCallback((): void => {
    for (const [rowId, timers] of exitTimersRef.current.entries()) {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      exitTimersRef.current.delete(rowId);
    }
  }, []);

  const stopHoldStep = useCallback((commitFinal = true): void => {
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    const session = holdSessionRef.current;
    holdSessionRef.current = null;
    if (commitFinal && session) {
      session.commit(session.latest);
    }
  }, []);

  const cancelExitAnimation = useCallback(
    (rowId: number): void => {
      clearExitTimers(rowId);
      setExitingRows((previous) => {
        if (!(rowId in previous)) return previous;
        const next = { ...previous };
        delete next[rowId];
        return next;
      });
    },
    [clearExitTimers],
  );

  const startExitAnimation = useCallback(
    (rowId: number): void => {
      clearExitTimers(rowId);
      setExitingRows((previous) => ({ ...previous, [rowId]: 'fill' }));
      const fillTimer = window.setTimeout(() => {
        setExitingRows((previous) => {
          if (!(rowId in previous)) return previous;
          return { ...previous, [rowId]: 'push' };
        });
      }, 250);
      const cleanupTimer = window.setTimeout(() => {
        setExitingRows((previous) => {
          if (!(rowId in previous)) return previous;
          const next = { ...previous };
          delete next[rowId];
          return next;
        });
        exitTimersRef.current.delete(rowId);
      }, 500);
      exitTimersRef.current.set(rowId, [fillTimer, cleanupTimer]);
    },
    [clearExitTimers],
  );

  useEffect(() => {
    worksheetIdRef.current = worksheetId;
  }, [worksheetId]);

  useEffect(() => {
    return () => {
      clearAllExitTimers();
      stopHoldStep();
    };
  }, [clearAllExitTimers, stopHoldStep]);

  const fetchWorksheets = useCallback(async (): Promise<Worksheet[]> => {
    const response = await apiFetch('/api/warframe/worksheets');
    if (!response.ok) {
      throw new Error('Failed to load worksheets');
    }
    const body = (await response.json()) as { worksheets?: Worksheet[] };
    return Array.isArray(body.worksheets) ? body.worksheets : [];
  }, []);

  const fetchSettings = useCallback(async (): Promise<WarframeSettings> => {
    const response = await apiFetch('/api/warframe/settings');
    if (!response.ok) {
      throw new Error('Failed to load Warframe settings');
    }
    const body = (await response.json()) as Partial<WarframeSettings> | null;
    return {
      hide_completed: Boolean(body?.hide_completed),
      market_links: Boolean(body?.market_links),
      advanced_mode: Boolean(body?.advanced_mode),
      show_all_variants: Boolean(body?.show_all_variants),
    };
  }, []);

  const fetchWorksheetData = useCallback(
    async (targetWorksheetId: number, signal?: AbortSignal): Promise<WorksheetData> => {
      const response = await apiFetch(`/api/warframe/worksheets/${targetWorksheetId}`, {
        signal,
      });
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
      const [worksheetItems, settings] = await Promise.all([fetchWorksheets(), fetchSettings()]);
      const items = worksheetItems
        .map((worksheet) => ({
          ...worksheet,
          name: worksheet.name.replace(/^\uFEFF/, '').trim(),
        }))
        .sort((a, b) => {
          const indexA = TAB_ORDER.indexOf(a.name as (typeof TAB_ORDER)[number]);
          const indexB = TAB_ORDER.indexOf(b.name as (typeof TAB_ORDER)[number]);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
      setHideCompleted(settings.hide_completed);
      setMarketLinks(settings.market_links);
      setAdvancedMode(settings.advanced_mode);
      setShowAllVariants(settings.show_all_variants);
      setWorksheets(items);
      setWorksheetId(items[0]?.id ?? null);
    } catch {
      setError('Could not load Warframe worksheets.');
    } finally {
      setLoading(false);
    }
  }, [fetchSettings, fetchWorksheets]);

  const loadWorksheetData = useCallback(
    async (targetWorksheetId: number, signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setError(null);
      setData({ columns: [], rows: [] });
      try {
        const worksheetData = await fetchWorksheetData(targetWorksheetId, signal);
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
    clearAllExitTimers();
    setExitingRows({});
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
  }, [worksheetId, loadWorksheetData, clearAllExitTimers]);

  useEffect(() => {
    if (!hideCompleted || search.trim().length > 0) {
      clearAllExitTimers();
      setExitingRows({});
    }
  }, [hideCompleted, search, clearAllExitTimers]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const hasSearch = query.length > 0;
    const exitingRowIds = new Set(Object.keys(exitingRows).map((rowId) => Number(rowId)));
    return data.rows.filter((row) => {
      const matchesSearch = (row.name || row.item_name || '').toLowerCase().includes(query);
      if (!matchesSearch) {
        return false;
      }
      if (!hideCompleted || hasSearch) {
        return true;
      }
      if (!isRowCompleted(row, data.columns, advancedMode, showAllVariants)) {
        return true;
      }
      return exitingRowIds.has(row.id);
    });
  }, [advancedMode, showAllVariants, data.columns, data.rows, hideCompleted, search, exitingRows]);

  const hasDualVariantColumns = useMemo(() => {
    const nonHelminth = data.columns.filter((column) => column.name !== 'Helminth');
    return (
      nonHelminth.some((column) => /prime/i.test(column.name)) &&
      nonHelminth.some((column) => !/prime/i.test(column.name))
    );
  }, [data.columns]);

  const stats = useMemo(() => {
    if (advancedMode) {
      const total = data.rows.length;
      const complete = data.rows.filter((row) =>
        isRowAdvancedCompleted(row, showAllVariants),
      ).length;
      const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
      return [{ name: 'Completed', complete, total, percent, obtained: 0 }];
    }
    const byColumn: Record<string, { total: number; complete: number; obtained: number }> = {};
    for (const column of data.columns) {
      if (column.name === 'Helminth') continue;
      byColumn[String(column.id)] = { total: 0, complete: 0, obtained: 0 };
    }
    for (const row of data.rows) {
      for (const column of data.columns) {
        if (column.name === 'Helminth') continue;
        const key = String(column.id);
        const value = row.values?.[key] ?? '';
        if (value === 'Unavailable') {
          continue;
        }
        byColumn[key].total += 1;
        if (value === 'Complete') {
          byColumn[key].complete += 1;
        } else if (value === 'Obtained') {
          byColumn[key].obtained += 1;
        }
      }
    }
    return data.columns
      .filter((column) => column.name !== 'Helminth')
      .map((column) => {
        const entry = byColumn[String(column.id)];
        const percent = entry.total > 0 ? Math.round((entry.complete / entry.total) * 100) : 0;
        return {
          name: column.name,
          complete: entry.complete,
          total: entry.total,
          percent,
          obtained: entry.obtained,
        };
      });
  }, [advancedMode, showAllVariants, data.columns, data.rows]);

  async function handleToggle(row: Row, column: Column): Promise<void> {
    const oldValue = row.values?.[String(column.id)] ?? '';
    if (oldValue === 'Unavailable') {
      return;
    }
    if (column.name === 'Helminth' && isHelminthNonSubsumableRow(row)) {
      return;
    }
    const value = nextStatus(oldValue, column.name);
    const rowId = row.id;
    const wasCompleted = isRowCompleted(row, data.columns, advancedMode, showAllVariants);
    const updatedRowForCompletionCheck: Row = {
      ...row,
      values: {
        ...row.values,
        [String(column.id)]: value,
      },
    };
    const nowCompleted = isRowCompleted(
      updatedRowForCompletionCheck,
      data.columns,
      advancedMode,
      showAllVariants,
    );
    const shouldAnimateExit =
      hideCompleted && search.trim().length === 0 && !wasCompleted && nowCompleted;
    if (!shouldAnimateExit) {
      cancelExitAnimation(rowId);
    }
    setData((previous) => ({
      ...previous,
      rows: previous.rows.map((candidate) =>
        candidate.id === row.id
          ? {
              ...candidate,
              values: {
                ...candidate.values,
                [String(column.id)]: value,
              },
            }
          : candidate,
      ),
    }));
    if (shouldAnimateExit) {
      startExitAnimation(rowId);
    }
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
      cancelExitAnimation(rowId);
      setData((previous) => ({
        ...previous,
        rows: previous.rows.map((candidate) =>
          candidate.id === row.id
            ? {
                ...candidate,
                values: {
                  ...candidate.values,
                  [String(column.id)]: oldValue,
                },
              }
            : candidate,
        ),
      }));
      setError('Failed to save Warframe update.');
    }
  }

  async function handleAdvancedPatch(
    row: Row,
    patch: Partial<{
      level: number;
      level_prime: number;
      valence_percent: number | null;
      valence_percent_prime: number | null;
      has_element: boolean;
      has_element_prime: boolean;
      has_orokin: boolean;
      has_orokin_prime: boolean;
      has_arcane: boolean;
      has_arcane_prime: boolean;
      has_exilus: boolean;
      has_exilus_prime: boolean;
    }>,
  ): Promise<void> {
    const oldProgress = row.advanced_progress ?? {
      normal: {
        level: 0,
        valence_percent: null,
        has_element: false,
        has_orokin: false,
        has_arcane: false,
        has_exilus: false,
      },
      prime: {
        level: 0,
        valence_percent: null,
        has_element: false,
        has_orokin: false,
        has_arcane: false,
        has_exilus: false,
      },
    };
    const nextProgress = {
      normal: {
        ...oldProgress.normal,
        level: patch.level ?? oldProgress.normal.level,
        valence_percent: patch.valence_percent ?? oldProgress.normal.valence_percent,
        has_element: patch.has_element ?? oldProgress.normal.has_element,
        has_orokin: patch.has_orokin ?? oldProgress.normal.has_orokin,
        has_arcane: patch.has_arcane ?? oldProgress.normal.has_arcane,
        has_exilus: patch.has_exilus ?? oldProgress.normal.has_exilus,
      },
      prime: {
        ...oldProgress.prime,
        level: patch.level_prime ?? oldProgress.prime.level,
        valence_percent: patch.valence_percent_prime ?? oldProgress.prime.valence_percent,
        has_element: patch.has_element_prime ?? oldProgress.prime.has_element,
        has_orokin: patch.has_orokin_prime ?? oldProgress.prime.has_orokin,
        has_arcane: patch.has_arcane_prime ?? oldProgress.prime.has_arcane,
        has_exilus: patch.has_exilus_prime ?? oldProgress.prime.has_exilus,
      },
    };
    const rowId = row.id;
    const wasCompleted = isRowCompleted(row, data.columns, true, showAllVariants);
    const nowCompleted = isRowCompleted(
      { ...row, advanced_progress: nextProgress },
      data.columns,
      true,
      showAllVariants,
    );
    const shouldAnimateExit =
      hideCompleted && search.trim().length === 0 && !wasCompleted && nowCompleted;
    if (!shouldAnimateExit) {
      cancelExitAnimation(rowId);
    }
    setData((previous) => ({
      ...previous,
      rows: previous.rows.map((candidate) =>
        candidate.id === row.id ? { ...candidate, advanced_progress: nextProgress } : candidate,
      ),
    }));
    if (shouldAnimateExit) {
      startExitAnimation(rowId);
    }
    try {
      const response = await apiFetch('/api/warframe/advanced-progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          row_id: row.id,
          ...patch,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        advanced_progress?: NonNullable<Row['advanced_progress']>;
      } | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Update failed');
      }
      if (body?.advanced_progress) {
        setData((previous) => ({
          ...previous,
          rows: previous.rows.map((candidate) =>
            candidate.id === row.id
              ? { ...candidate, advanced_progress: body.advanced_progress }
              : candidate,
          ),
        }));
      }
    } catch {
      cancelExitAnimation(rowId);
      setData((previous) => ({
        ...previous,
        rows: previous.rows.map((candidate) =>
          candidate.id === row.id ? { ...candidate, advanced_progress: oldProgress } : candidate,
        ),
      }));
      setError('Failed to save advanced Warframe update.');
    }
  }

  const updateAdvancedProgressLocal = useCallback(
    (
      rowId: number,
      patch: Partial<{
        level: number;
        level_prime: number;
        valence_percent: number | null;
        valence_percent_prime: number | null;
      }>,
    ): void => {
      setData((previous) => ({
        ...previous,
        rows: previous.rows.map((candidate) => {
          if (candidate.id !== rowId) return candidate;
          const current = candidate.advanced_progress;
          if (!current) return candidate;
          return {
            ...candidate,
            advanced_progress: {
              normal: {
                ...current.normal,
                level: patch.level ?? current.normal.level,
                valence_percent: patch.valence_percent ?? current.normal.valence_percent,
              },
              prime: {
                ...current.prime,
                level: patch.level_prime ?? current.prime.level,
                valence_percent: patch.valence_percent_prime ?? current.prime.valence_percent,
              },
            },
          };
        }),
      }));
    },
    [],
  );

  const startHoldStep = useCallback(
    (
      initialValue: number,
      direction: 1 | -1,
      min: number,
      max: number,
      applyLocal: (next: number) => void,
      commitRemote: (next: number) => void,
    ): void => {
      stopHoldStep(false);
      let current = clamp(initialValue + direction, min, max);
      applyLocal(current);
      holdSessionRef.current = {
        latest: current,
        commit: commitRemote,
      };
      holdIntervalRef.current = window.setInterval(() => {
        current = clamp(current + direction, min, max);
        applyLocal(current);
        if (holdSessionRef.current) {
          holdSessionRef.current.latest = current;
        }
      }, 150);
    },
    [stopHoldStep],
  );

  const handleHideCompletedChange = useCallback(
    async (nextValue: boolean): Promise<void> => {
      const previousValue = hideCompleted;
      setHideCompleted(nextValue);
      try {
        const response = await apiFetch('/api/warframe/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hide_completed: nextValue }),
        });
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok || body?.error) {
          throw new Error(body?.error || 'Failed to save Warframe settings');
        }
      } catch {
        setHideCompleted(previousValue);
        setError('Failed to save "Hide completed" setting.');
      }
    },
    [hideCompleted],
  );

  const handleMarketLinksChange = useCallback(
    async (nextValue: boolean): Promise<void> => {
      const previousValue = marketLinks;
      setMarketLinks(nextValue);
      try {
        const response = await apiFetch('/api/warframe/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ market_links: nextValue }),
        });
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok || body?.error) {
          throw new Error(body?.error || 'Failed to save Warframe settings');
        }
      } catch {
        setMarketLinks(previousValue);
        setError('Failed to save "Market links" setting.');
        return;
      }
      if (nextValue && worksheetId !== null) {
        void loadWorksheetData(worksheetId);
      }
    },
    [marketLinks, worksheetId, loadWorksheetData],
  );

  const handleAdvancedModeChange = useCallback(
    async (nextValue: boolean): Promise<void> => {
      const previousValue = advancedMode;
      setAdvancedMode(nextValue);
      try {
        const response = await apiFetch('/api/warframe/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ advanced_mode: nextValue }),
        });
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok || body?.error) {
          throw new Error(body?.error || 'Failed to save Warframe settings');
        }
      } catch {
        setAdvancedMode(previousValue);
        setError('Failed to save "Advanced" setting.');
      }
    },
    [advancedMode],
  );

  const handleShowAllVariantsChange = useCallback(
    async (nextValue: boolean): Promise<void> => {
      const previousValue = showAllVariants;
      setShowAllVariants(nextValue);
      try {
        const response = await apiFetch('/api/warframe/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ show_all_variants: nextValue }),
        });
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok || body?.error) {
          throw new Error(body?.error || 'Failed to save Warframe settings');
        }
      } catch {
        setShowAllVariants(previousValue);
        setError('Failed to save "Show all variants" setting.');
      }
    },
    [showAllVariants],
  );

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
          <MaterialSymbol name="close" className="leading-none" style={{ fontSize: 18 }} />
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

  const effectiveMarketLinks = marketLinks && !advancedMode;

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
        <div className="stats-bar-stats">
          {stats.map((entry) => (
            <div key={entry.name} className="stat">
              <span>{entry.name}:</span>
              <span className="stat-value stat-complete">{entry.complete}</span>
              <span>/</span>
              <span className="stat-value">{entry.total}</span>
              <span>({entry.percent}%)</span>
              {entry.obtained > 0 ? (
                <span className="stat-value stat-obtained">+{entry.obtained}</span>
              ) : null}
            </div>
          ))}
        </div>
        <div className="stats-bar-actions">
          <button
            type="button"
            onClick={() => {
              void handleHideCompletedChange(!hideCompleted);
            }}
            aria-pressed={hideCompleted}
            className="border-glass-border text-muted hover:border-glass-border-hover hover:bg-glass-hover hover:text-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-[color,background-color,border-color,box-shadow] duration-200"
            title='Toggle "Hide completed"'
          >
            <span>Hide completed</span>
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors ${
                hideCompleted
                  ? 'bg-success/20 text-success hover:bg-success/30'
                  : 'bg-muted/10 text-muted/40 hover:bg-muted/20'
              }`}
              aria-hidden="true"
            >
              {hideCompleted ? (
                <MaterialSymbol
                  name="check"
                  filled
                  className="leading-none"
                  style={{ fontSize: 15 }}
                />
              ) : (
                <MaterialSymbol name="close" className="leading-none" style={{ fontSize: 15 }} />
              )}
            </span>
          </button>
          {!advancedMode ? (
            <button
              type="button"
              onClick={() => {
                void handleMarketLinksChange(!marketLinks);
              }}
              aria-pressed={marketLinks}
              className="border-glass-border text-muted hover:border-glass-border-hover hover:bg-glass-hover hover:text-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-[color,background-color,border-color,box-shadow] duration-200"
              title='Toggle "Market links"'
            >
              <span>Market links</span>
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors ${
                  marketLinks
                    ? 'bg-success/20 text-success hover:bg-success/30'
                    : 'bg-muted/10 text-muted/40 hover:bg-muted/20'
                }`}
                aria-hidden="true"
              >
                {marketLinks ? (
                  <MaterialSymbol
                    name="check"
                    filled
                    className="leading-none"
                    style={{ fontSize: 15 }}
                  />
                ) : (
                  <MaterialSymbol name="close" className="leading-none" style={{ fontSize: 15 }} />
                )}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void handleAdvancedModeChange(!advancedMode);
            }}
            aria-pressed={advancedMode}
            className="border-glass-border text-muted hover:border-glass-border-hover hover:bg-glass-hover hover:text-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-[color,background-color,border-color,box-shadow] duration-200"
            title='Toggle "Advanced"'
          >
            <span>Advanced</span>
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors ${
                advancedMode
                  ? 'bg-success/20 text-success hover:bg-success/30'
                  : 'bg-muted/10 text-muted/40 hover:bg-muted/20'
              }`}
              aria-hidden="true"
            >
              {advancedMode ? (
                <MaterialSymbol
                  name="check"
                  filled
                  className="leading-none"
                  style={{ fontSize: 15 }}
                />
              ) : (
                <MaterialSymbol name="close" className="leading-none" style={{ fontSize: 15 }} />
              )}
            </span>
          </button>
          {advancedMode ? (
            <button
              type="button"
              onClick={() => {
                void handleShowAllVariantsChange(!showAllVariants);
              }}
              aria-pressed={showAllVariants}
              className="border-glass-border text-muted hover:border-glass-border-hover hover:bg-glass-hover hover:text-foreground inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-[color,background-color,border-color,box-shadow] duration-200"
              title={
                showAllVariants
                  ? 'Showing Normal and Prime for items that have both'
                  : 'Hiding duplicate variant: Normal when Prime exists, Prime when it does not'
              }
            >
              <span>Show all</span>
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold transition-colors ${
                  showAllVariants
                    ? 'bg-success/20 text-success hover:bg-success/30'
                    : 'bg-muted/10 text-muted/40 hover:bg-muted/20'
                }`}
                aria-hidden="true"
              >
                {showAllVariants ? (
                  <MaterialSymbol
                    name="check"
                    filled
                    className="leading-none"
                    style={{ fontSize: 15 }}
                  />
                ) : (
                  <MaterialSymbol name="close" className="leading-none" style={{ fontSize: 15 }} />
                )}
              </span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="table-container">
        <div className="table-scroll" style={tableScrollStyle}>
          <table style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 'auto' }} />
              {advancedMode ? (
                <>
                  <col style={{ width: '64px' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '128px' }} />
                </>
              ) : (
                data.columns.map((column) => (
                  <col
                    key={`col-${column.id}`}
                    style={{
                      width:
                        column.name === 'Helminth'
                          ? '150px'
                          : hasDualVariantColumns && effectiveMarketLinks
                            ? '248px'
                            : '200px',
                    }}
                  />
                ))
              )}
              {effectiveMarketLinks && !hasDualVariantColumns ? (
                <col style={{ width: '96px' }} />
              ) : null}
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                {advancedMode ? (
                  <>
                    <th className="text-muted text-center text-xs font-normal" aria-label="Variant">
                      &nbsp;
                    </th>
                    <th className="text-center">Level</th>
                    <th className="text-center">Valence</th>
                    <th className="text-center">Ele Vice</th>
                    <th className="text-center">Orokin</th>
                    <th className="text-center">Arcane</th>
                    <th className="text-center">Exilus</th>
                  </>
                ) : (
                  data.columns.map((column) => (
                    <th key={column.id} className="text-center">
                      {column.name}
                    </th>
                  ))
                )}
                {effectiveMarketLinks && !hasDualVariantColumns ? (
                  <th className="text-center">Market</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isCompletedRow = isRowCompleted(
                  row,
                  data.columns,
                  advancedMode,
                  showAllVariants,
                );
                const rowClassName = `${isCompletedRow ? 'warframe-completed-row ' : ''}${
                  exitingRows[row.id] === 'fill' ? 'warframe-row-exit-fill ' : ''
                }${exitingRows[row.id] === 'push' ? 'warframe-row-exit-push' : ''}`.trim();
                const visibleVariants = advancedVariantsVisible(row, showAllVariants);

                return (
                  <tr key={row.id} className={rowClassName}>
                    <td className="item-name">{row.name || row.item_name || 'Unnamed'}</td>
                    {advancedMode ? (
                      <>
                        <td className="status-cell align-middle">
                          <div className="status-cell-inner justify-end pr-1">
                            <div className="text-muted flex flex-col gap-1 text-end text-[10px] leading-tight">
                              {visibleVariants.map((variant) => (
                                <span
                                  key={`${row.id}-vl-${variant}`}
                                  className="flex min-h-[29px] items-center justify-end"
                                >
                                  {variant === 'prime' ? 'Prime' : 'Normal'}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="status-cell">
                          <div className="status-cell-inner justify-center">
                            <div className="flex flex-col gap-1">
                              {visibleVariants.map((variant) => {
                                const isPrime = variant === 'prime';
                                const relevance = row.advanced_relevance?.[variant];
                                const progress = row.advanced_progress?.[variant];
                                const enabled = isPrime
                                  ? Boolean(row.advanced_relevance?.has_prime_variant)
                                  : true;
                                const max = relevance?.max_level ?? 30;
                                const current = progress?.level ?? 0;
                                const levelMaxed = enabled && current >= max;
                                const key = isPrime ? 'level_prime' : 'level';
                                return (
                                  <button
                                    key={`level-${variant}`}
                                    type="button"
                                    className={`status-btn helminth-btn ${
                                      !enabled ? 'unavailable' : levelMaxed ? 'yes' : 'empty'
                                    } min-w-[82px] px-2 py-1 text-xs`}
                                    disabled={!enabled}
                                    onMouseDown={(event) => {
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      const direction: 1 | -1 =
                                        event.clientY < rect.top + rect.height / 2 ? 1 : -1;
                                      startHoldStep(
                                        current,
                                        direction,
                                        0,
                                        max,
                                        (next) => {
                                          updateAdvancedProgressLocal(row.id, {
                                            [key]: next,
                                          } as { level?: number; level_prime?: number });
                                        },
                                        (next) => {
                                          void handleAdvancedPatch(row, { [key]: next } as {
                                            level?: number;
                                            level_prime?: number;
                                          });
                                        },
                                      );
                                    }}
                                    onMouseUp={() => stopHoldStep(true)}
                                    onMouseLeave={() => stopHoldStep(true)}
                                    onTouchEnd={() => stopHoldStep(true)}
                                    aria-label={`${isPrime ? 'Prime' : 'Normal'} level for ${row.name || row.item_name || 'item'}`}
                                  >
                                    <span className="flex w-full min-w-0 items-center justify-between gap-1">
                                      <span className="tabular-nums">{current}</span>
                                      <span
                                        className={`inline-flex shrink-0 flex-col text-[9px] leading-[0.7] ${
                                          levelMaxed ? 'opacity-90' : 'opacity-80'
                                        }`}
                                      >
                                        <span>▲</span>
                                        <span>▼</span>
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                        <td className="status-cell">
                          <div className="status-cell-inner justify-center">
                            <div className="flex flex-col gap-1">
                              {visibleVariants.map((variant) => {
                                const isPrime = variant === 'prime';
                                const relevance = row.advanced_relevance?.[variant];
                                const progress = row.advanced_progress?.[variant];
                                const enabled = Boolean(relevance?.valence);
                                const current = progress?.valence_percent ?? 30;
                                const valenceMax = 60;
                                const valenceMaxed = enabled && current >= valenceMax;
                                const key = isPrime ? 'valence_percent_prime' : 'valence_percent';
                                return (
                                  <button
                                    key={`valence-${variant}`}
                                    type="button"
                                    className={`status-btn helminth-btn ${
                                      !enabled ? 'unavailable' : valenceMaxed ? 'yes' : 'empty'
                                    } min-w-[82px] px-2 py-1 text-xs`}
                                    disabled={!enabled}
                                    onMouseDown={(event) => {
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      const direction: 1 | -1 =
                                        event.clientY < rect.top + rect.height / 2 ? 1 : -1;
                                      startHoldStep(
                                        current,
                                        direction,
                                        30,
                                        valenceMax,
                                        (next) => {
                                          updateAdvancedProgressLocal(row.id, {
                                            [key]: next,
                                          } as {
                                            valence_percent?: number;
                                            valence_percent_prime?: number;
                                          });
                                        },
                                        (next) => {
                                          void handleAdvancedPatch(row, { [key]: next } as {
                                            valence_percent?: number;
                                            valence_percent_prime?: number;
                                          });
                                        },
                                      );
                                    }}
                                    onMouseUp={() => stopHoldStep(true)}
                                    onMouseLeave={() => stopHoldStep(true)}
                                    onTouchEnd={() => stopHoldStep(true)}
                                    aria-label={`${isPrime ? 'Prime' : 'Normal'} valence for ${row.name || row.item_name || 'item'}`}
                                  >
                                    <span className="flex w-full min-w-0 items-center justify-between gap-1">
                                      <span className="tabular-nums">{current}</span>
                                      <span
                                        className={`inline-flex shrink-0 flex-col text-[9px] leading-[0.7] ${
                                          valenceMaxed ? 'opacity-90' : 'opacity-80'
                                        }`}
                                      >
                                        <span>▲</span>
                                        <span>▼</span>
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                        {(
                          [
                            ['has_element', 'element'],
                            ['has_orokin', 'orokin'],
                            ['has_arcane', 'arcane'],
                            ['has_exilus', 'exilus'],
                          ] as const
                        ).map(([field, relevanceField]) => (
                          <td key={`${row.id}-${field}`} className="status-cell">
                            <div className="status-cell-inner justify-center">
                              <div className="flex flex-col gap-1">
                                {visibleVariants.map((variant) => {
                                  const isPrime = variant === 'prime';
                                  const checked = Boolean(
                                    isPrime
                                      ? row.advanced_progress?.prime[
                                          field as keyof NonNullable<
                                            Row['advanced_progress']
                                          >['prime']
                                        ]
                                      : row.advanced_progress?.normal[
                                          field as keyof NonNullable<
                                            Row['advanced_progress']
                                          >['normal']
                                        ],
                                  );
                                  const relevant = Boolean(
                                    row.advanced_relevance?.[variant][
                                      relevanceField as keyof NonNullable<
                                        Row['advanced_relevance']
                                      >['normal']
                                    ],
                                  );
                                  const lockedPrimeAuto =
                                    isPrime &&
                                    (field === 'has_element' || field === 'has_orokin') &&
                                    Boolean(row.advanced_relevance?.has_prime_variant);
                                  const interactive = relevant && !lockedPrimeAuto;
                                  const lockedOrokinPrimeAuto =
                                    lockedPrimeAuto && field === 'has_orokin' && checked;
                                  const key = isPrime ? `${field}_prime` : field;
                                  return (
                                    <button
                                      key={`${row.id}-${key}`}
                                      type="button"
                                      className={`${advancedToggleClass(checked, interactive, lockedOrokinPrimeAuto)} min-w-[82px] px-2 py-1 text-xs`}
                                      disabled={!interactive}
                                      tabIndex={lockedOrokinPrimeAuto ? -1 : undefined}
                                      onClick={() => {
                                        void handleAdvancedPatch(row, {
                                          [key]: !checked,
                                        } as Partial<{
                                          has_element: boolean;
                                          has_element_prime: boolean;
                                          has_orokin: boolean;
                                          has_orokin_prime: boolean;
                                          has_arcane: boolean;
                                          has_arcane_prime: boolean;
                                          has_exilus: boolean;
                                          has_exilus_prime: boolean;
                                        }>);
                                      }}
                                      aria-label={`${isPrime ? 'Prime' : 'Normal'} ${field.replace('has_', '')} for ${row.name || row.item_name || 'item'}`}
                                    >
                                      <span className="inline-flex items-center gap-1.5">
                                        <span>
                                          {advancedToggleGlyph(
                                            checked,
                                            interactive,
                                            lockedOrokinPrimeAuto,
                                          )}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        ))}
                      </>
                    ) : (
                      data.columns.map((column) => {
                        const value = row.values?.[String(column.id)] ?? '';
                        const rowLabel = row.name || row.item_name || 'item';
                        const showInlineMarket =
                          effectiveMarketLinks &&
                          hasDualVariantColumns &&
                          column.name !== 'Helminth';
                        const variantHref = showInlineMarket
                          ? /prime/i.test(column.name)
                            ? row.market_href_prime
                            : row.market_href_normal
                          : undefined;

                        const helminthLocked =
                          column.name === 'Helminth' && isHelminthNonSubsumableRow(row);
                        const helminthAria =
                          column.name === 'Helminth'
                            ? value === 'Yes'
                              ? `Helminth subsumed for ${rowLabel}`
                              : value === 'Unavailable' || helminthLocked
                                ? `Helminth not applicable for ${rowLabel}`
                                : `Helminth not completed for ${rowLabel}`
                            : `${column.name} status for ${rowLabel}`;
                        const statusButton = (
                          <button
                            type="button"
                            className={statusClass(value, column.name, row)}
                            onClick={() => {
                              void handleToggle(row, column);
                            }}
                            aria-label={helminthAria}
                            disabled={value === 'Unavailable' || helminthLocked}
                          >
                            {column.name === 'Helminth'
                              ? helminthCellGlyph(value, row)
                              : value || '—'}
                          </button>
                        );

                        return (
                          <td key={`${row.id}-${column.id}`} className="status-cell">
                            {showInlineMarket ? (
                              <div className="status-cell-inner">
                                {statusButton}
                                {variantHref ? (
                                  <a
                                    href={variantHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="status-btn helminth-btn empty text-primary hover:text-primary/90 inline-flex shrink-0 no-underline"
                                    aria-label={`Warframe Market (${column.name}) for ${rowLabel}`}
                                    title="Open Warframe Market"
                                  >
                                    <MaterialSymbol
                                      name="link_2"
                                      className="leading-none"
                                      style={{ fontSize: 15 }}
                                    />
                                  </a>
                                ) : (
                                  <span
                                    className="status-btn helminth-btn unavailable inline-flex shrink-0 cursor-not-allowed"
                                    aria-disabled="true"
                                    title="Not listed on Warframe Market"
                                    aria-label={`No Warframe Market listing (${column.name}) for ${rowLabel}`}
                                  >
                                    <MaterialSymbol
                                      name="link_2"
                                      className="leading-none"
                                      style={{ fontSize: 15 }}
                                    />
                                  </span>
                                )}
                              </div>
                            ) : (
                              statusButton
                            )}
                          </td>
                        );
                      })
                    )}
                    {effectiveMarketLinks && !hasDualVariantColumns ? (
                      <td className="status-cell">
                        {row.market_href ? (
                          <a
                            href={row.market_href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="status-btn empty text-primary hover:text-primary/90 inline-flex shrink-0 no-underline"
                            aria-label={`Warframe Market sell listings for ${row.name || row.item_name || 'item'}`}
                            title="Open Warframe Market"
                          >
                            <MaterialSymbol
                              name="link_2"
                              className="leading-none"
                              style={{ fontSize: 15 }}
                            />
                          </a>
                        ) : (
                          <span
                            className="status-btn unavailable inline-flex shrink-0 cursor-not-allowed"
                            aria-disabled="true"
                            title="Not listed on Warframe Market"
                            aria-label={`No Warframe Market listing for ${row.name || row.item_name || 'item'}`}
                          >
                            <MaterialSymbol
                              name="link_2"
                              className="leading-none"
                              style={{ fontSize: 15 }}
                            />
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
