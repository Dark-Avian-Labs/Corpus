import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { useLayoutSlots } from '../../components/Layout/useLayoutSlots';
import { Modal } from '../../components/ui/Modal';
import { apiFetch } from '../../utils/api';

type Epic7Hero = {
  id: number;
  name: string;
  class?: string;
  element?: string;
  star_rating?: number;
  rating: '-' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
};
type Epic7Artifact = {
  id: number;
  name: string;
  class?: string;
  star_rating?: number;
  gauge_level: number;
};
function isHero(item: Epic7Hero | Epic7Artifact): item is Epic7Hero {
  return 'rating' in item;
}
type Epic7Account = { id: number; account_name: string };
type DeletingItem = { id: number; type: 'hero' | 'artifact'; name: string };
type Epic7ModalDraft = {
  name: string;
  class: string;
  element: string;
  stars: number;
};
type Epic7ModalState = {
  isAccountModalOpen: boolean;
  accountNameDraft: string;
  isItemModalOpen: boolean;
  modalItemType: 'heroes' | 'artifacts';
  draft: Epic7ModalDraft;
  editingId: number | null;
  isDeleteModalOpen: boolean;
  deletingItem: DeletingItem | null;
};
type Epic7ModalAction =
  | { type: 'OPEN_ACCOUNT_MODAL' }
  | { type: 'CLOSE_ACCOUNT_MODAL' }
  | { type: 'SET_ACCOUNT_NAME'; payload: string }
  | { type: 'OPEN_ITEM_MODAL'; payload: { itemType: 'heroes' | 'artifacts' } }
  | { type: 'CLOSE_ITEM_MODAL' }
  | {
      type: 'SET_DRAFT_FIELD';
      payload: { field: keyof Epic7ModalDraft; value: string | number };
    }
  | {
      type: 'START_EDIT';
      payload: {
        itemType: 'heroes' | 'artifacts';
        id: number;
        draft: Epic7ModalDraft;
      };
    }
  | { type: 'START_DELETE'; payload: DeletingItem }
  | { type: 'CANCEL_DELETE' }
  | { type: 'CONFIRM_DELETE' };

type HeroClass =
  | 'warrior'
  | 'knight'
  | 'thief'
  | 'ranger'
  | 'mage'
  | 'soulweaver';
type ArtifactClass = HeroClass | 'universal';
type Element = 'fire' | 'ice' | 'earth' | 'light' | 'dark';
type ActiveFilters = { class: ArtifactClass | null; element: Element | null };

const HERO_RATINGS = ['-', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;
const GAUGE_MAX = 5;
const GAUGE_FILLED = '▰';
const GAUGE_EMPTY = '▱';
const HERO_CLASSES: HeroClass[] = [
  'warrior',
  'knight',
  'thief',
  'ranger',
  'mage',
  'soulweaver',
];
const ARTIFACT_CLASSES: ArtifactClass[] = [...HERO_CLASSES, 'universal'];
const ELEMENTS: Element[] = ['fire', 'ice', 'earth', 'light', 'dark'];
const CLASS_NAMES: Record<ArtifactClass, string> = {
  warrior: 'Warrior',
  knight: 'Knight',
  thief: 'Thief',
  ranger: 'Ranger',
  mage: 'Mage',
  soulweaver: 'Soul Weaver',
  universal: 'Universal',
};
const ELEMENT_NAMES: Record<Element, string> = {
  fire: 'Fire',
  ice: 'Ice',
  earth: 'Earth',
  light: 'Light',
  dark: 'Dark',
};
const RATING_COLORS: Record<string, string> = {
  '-': '#6b7280',
  D: '#06b6d4',
  C: '#22c55e',
  B: '#3b82f6',
  A: '#a855f7',
  S: '#eab308',
  SS: '#f97316',
  SSS: '#ef4444',
};
const GAUGE_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#3b82f6',
  2: '#22c55e',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};

const ICON_MODULES = import.meta.glob(
  '../../../packages/games/epic7/assets/icons/*.png',
  { eager: true, import: 'default' },
) as Record<string, string>;

const ICONS: Record<string, string> = {};
for (const [path, src] of Object.entries(ICON_MODULES)) {
  const file = path.split('/').pop();
  if (!file) continue;
  ICONS[file.replace('.png', '')] = src;
}

const initialModalState: Epic7ModalState = {
  isAccountModalOpen: false,
  accountNameDraft: '',
  isItemModalOpen: false,
  modalItemType: 'heroes',
  draft: {
    name: '',
    class: HERO_CLASSES[0],
    element: ELEMENTS[0],
    stars: 5,
  },
  editingId: null,
  isDeleteModalOpen: false,
  deletingItem: null,
};

function epic7ModalReducer(
  state: Epic7ModalState,
  action: Epic7ModalAction,
): Epic7ModalState {
  switch (action.type) {
    case 'OPEN_ACCOUNT_MODAL':
      return { ...state, isAccountModalOpen: true };
    case 'CLOSE_ACCOUNT_MODAL':
      return { ...state, isAccountModalOpen: false, accountNameDraft: '' };
    case 'SET_ACCOUNT_NAME':
      return { ...state, accountNameDraft: action.payload };
    case 'OPEN_ITEM_MODAL':
      return {
        ...state,
        isItemModalOpen: true,
        modalItemType: action.payload.itemType,
        editingId: null,
        draft: {
          name: '',
          class:
            action.payload.itemType === 'heroes'
              ? HERO_CLASSES[0]
              : ARTIFACT_CLASSES[0],
          element: ELEMENTS[0],
          stars: 5,
        },
      };
    case 'CLOSE_ITEM_MODAL':
      return { ...state, isItemModalOpen: false };
    case 'SET_DRAFT_FIELD':
      return {
        ...state,
        draft: {
          ...state.draft,
          [action.payload.field]: action.payload.value,
        },
      };
    case 'START_EDIT':
      return {
        ...state,
        isItemModalOpen: true,
        modalItemType: action.payload.itemType,
        editingId: action.payload.id,
        draft: action.payload.draft,
      };
    case 'START_DELETE':
      return {
        ...state,
        isDeleteModalOpen: true,
        deletingItem: action.payload,
      };
    case 'CANCEL_DELETE':
    case 'CONFIRM_DELETE':
      return {
        ...state,
        isDeleteModalOpen: false,
        deletingItem: null,
      };
    default:
      return state;
  }
}

function renderStars(count: number | undefined) {
  if (!count || count <= 0) return '-';
  const iconSrc = ICONS[`star${count}`];
  if (!iconSrc) return '★'.repeat(count);
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <img
          key={`${count}-${index}`}
          src={iconSrc}
          alt={`${count} stars`}
          title={`${count} stars`}
        />
      ))}
    </>
  );
}

function renderGauge(level: number): string {
  return `${GAUGE_FILLED.repeat(level)}${GAUGE_EMPTY.repeat(
    Math.max(0, GAUGE_MAX - level),
  )}`;
}

const tableScrollStyle = {
  '--header-offset': '340px',
} as CSSProperties;

export function Epic7Page() {
  const { setHeaderCenter, setHeaderActions } = useLayoutSlots();
  const [accounts, setAccounts] = useState<Epic7Account[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<number | null>(null);
  const [heroes, setHeroes] = useState<Epic7Hero[]>([]);
  const [artifacts, setArtifacts] = useState<Epic7Artifact[]>([]);
  const [tab, setTab] = useState<'heroes' | 'artifacts'>('heroes');
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({
    class: null,
    element: null,
  });
  const [editMode, setEditMode] = useState(false);
  const [modalState, dispatchModal] = useReducer(
    epic7ModalReducer,
    initialModalState,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const beginUserActionRequest = useCallback((): AbortSignal => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller.signal;
  }, []);

  const loadAccountsAndData = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setLoadError(null);
      try {
        const accountsRes = await apiFetch('/api/epic7/accounts', { signal });
        if (!accountsRes.ok) {
          throw new Error('Failed to load accounts');
        }
        const accountsBody = (await accountsRes.json()) as {
          accounts?: Epic7Account[];
          current_account_id?: number | null;
        };
        const nextAccounts = Array.isArray(accountsBody.accounts)
          ? accountsBody.accounts
          : [];
        const nextAccountId =
          typeof accountsBody.current_account_id === 'number'
            ? accountsBody.current_account_id
            : null;
        if (signal?.aborted) return;
        setAccounts(nextAccounts);
        setCurrentAccountId(nextAccountId);
        if (nextAccountId === null) {
          setHeroes([]);
          setArtifacts([]);
          setLoading(false);
          return;
        }

        const [heroesRes, artifactsRes] = await Promise.all([
          apiFetch('/api/epic7/heroes', { signal }),
          apiFetch('/api/epic7/artifacts', { signal }),
        ]);
        if (!heroesRes.ok || !artifactsRes.ok) {
          throw new Error('Failed to load Epic7 data');
        }
        const heroesBody = (await heroesRes.json()) as { heroes?: Epic7Hero[] };
        const artifactsBody = (await artifactsRes.json()) as {
          artifacts?: Epic7Artifact[];
        };
        if (signal?.aborted) return;
        setHeroes(Array.isArray(heroesBody.heroes) ? heroesBody.heroes : []);
        setArtifacts(
          Array.isArray(artifactsBody.artifacts) ? artifactsBody.artifacts : [],
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoadError('Could not load Epic Seven data.');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let timeoutId: number | null = null;
    if (operationError) {
      timeoutId = window.setTimeout(() => {
        setOperationError(null);
      }, 5000);
    }
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [operationError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAccountsAndData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadAccountsAndData]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setActiveFilters({ class: null, element: null });
  }, [tab]);

  const activeRows = useMemo(() => {
    if (tab === 'heroes') {
      return heroes.filter((row) => {
        if (!row.name.toLowerCase().includes(search.trim().toLowerCase())) {
          return false;
        }
        if (activeFilters.class && row.class !== activeFilters.class) {
          return false;
        }
        if (activeFilters.element && row.element !== activeFilters.element) {
          return false;
        }
        return true;
      });
    }
    return artifacts.filter((row) => {
      if (!row.name.toLowerCase().includes(search.trim().toLowerCase())) {
        return false;
      }
      if (activeFilters.class && row.class !== activeFilters.class) {
        return false;
      }
      return true;
    });
  }, [tab, heroes, artifacts, search, activeFilters]);

  const stats = useMemo(() => {
    const total = activeRows.length;
    if (tab === 'heroes') {
      const heroRows = activeRows as Epic7Hero[];
      const owned = heroRows.filter((hero) => hero.rating !== '-').length;
      const maxed = heroRows.filter((hero) => hero.rating === 'SSS').length;
      return { total, owned, maxed };
    }
    const artifactRows = activeRows as Epic7Artifact[];
    const owned = artifactRows.filter(
      (artifact) => artifact.gauge_level > 0,
    ).length;
    const maxed = artifactRows.filter(
      (artifact) => artifact.gauge_level === GAUGE_MAX,
    ).length;
    return { total, owned, maxed };
  }, [activeRows, tab]);

  const switchAccount = useCallback(
    async (accountId: number): Promise<void> => {
      if (currentAccountId === accountId) return;
      const signal = beginUserActionRequest();
      try {
        const response = await apiFetch('/api/epic7/accounts/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: accountId }),
          signal,
        });
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!response.ok || body?.error) {
          throw new Error(body?.error || 'Failed to switch account');
        }
        await loadAccountsAndData(signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setOperationError('Failed to switch Epic Seven account.');
      }
    },
    [beginUserActionRequest, currentAccountId, loadAccountsAndData],
  );

  async function cycleHero(hero: Epic7Hero): Promise<void> {
    const index = HERO_RATINGS.indexOf(hero.rating);
    const rating =
      HERO_RATINGS[(index + 1 + HERO_RATINGS.length) % HERO_RATINGS.length];
    setHeroes((previous) =>
      previous.map((candidate) =>
        candidate.id === hero.id ? { ...candidate, rating } : candidate,
      ),
    );
    try {
      const response = await apiFetch(`/api/epic7/heroes/${hero.id}/rating`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Failed to update hero');
      }
    } catch {
      setHeroes((previous) =>
        previous.map((candidate) =>
          candidate.id === hero.id
            ? { ...candidate, rating: hero.rating }
            : candidate,
        ),
      );
      setOperationError('Failed to save hero rating.');
    }
  }

  async function cycleArtifact(artifact: Epic7Artifact): Promise<void> {
    const gaugeLevel = (artifact.gauge_level + 1) % (GAUGE_MAX + 1);
    setArtifacts((previous) =>
      previous.map((candidate) =>
        candidate.id === artifact.id
          ? { ...candidate, gauge_level: gaugeLevel }
          : candidate,
      ),
    );
    try {
      const response = await apiFetch(
        `/api/epic7/artifacts/${artifact.id}/gauge`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gauge_level: gaugeLevel }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Failed to update artifact');
      }
    } catch {
      setArtifacts((previous) =>
        previous.map((candidate) =>
          candidate.id === artifact.id
            ? { ...candidate, gauge_level: artifact.gauge_level }
            : candidate,
        ),
      );
      setOperationError('Failed to save artifact gauge.');
    }
  }

  async function addAccount(): Promise<void> {
    if (modalState.accountNameDraft.trim().length === 0) {
      setOperationError('Account name is required.');
      return;
    }
    const signal = beginUserActionRequest();
    try {
      const response = await apiFetch('/api/epic7/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_name: modalState.accountNameDraft.trim(),
        }),
        signal,
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Failed to add account');
      }
      dispatchModal({ type: 'CLOSE_ACCOUNT_MODAL' });
      await loadAccountsAndData(signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setOperationError('Failed to create account.');
    }
  }

  const openAddItemModal = useCallback((): void => {
    dispatchModal({
      type: 'OPEN_ITEM_MODAL',
      payload: { itemType: tab },
    });
  }, [tab]);

  function openEditItemModal(item: Epic7Hero | Epic7Artifact): void {
    const itemType = 'rating' in item ? 'heroes' : 'artifacts';
    dispatchModal({
      type: 'START_EDIT',
      payload: {
        itemType,
        id: item.id,
        draft: {
          name: item.name,
          class:
            item.class ||
            (itemType === 'heroes' ? HERO_CLASSES[0] : ARTIFACT_CLASSES[0]),
          element: 'rating' in item ? item.element || ELEMENTS[0] : ELEMENTS[0],
          stars: item.star_rating || 5,
        },
      },
    });
  }

  async function saveItem(): Promise<void> {
    if (modalState.draft.name.trim().length === 0) {
      setOperationError('Name is required.');
      return;
    }
    const isHeroItem = modalState.modalItemType === 'heroes';
    const isEdit = modalState.editingId !== null;
    const path = isHeroItem ? 'heroes' : 'artifacts';
    const url = isEdit
      ? `/api/epic7/${path}/${modalState.editingId}/details`
      : `/api/epic7/${path}`;
    const method = isEdit ? 'PATCH' : 'POST';
    const body = isHeroItem
      ? {
          name: modalState.draft.name.trim(),
          class: modalState.draft.class,
          element: modalState.draft.element,
          star_rating: modalState.draft.stars,
        }
      : {
          name: modalState.draft.name.trim(),
          class: modalState.draft.class,
          star_rating: modalState.draft.stars,
        };
    const signal = beginUserActionRequest();
    try {
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to save item');
      }
      dispatchModal({ type: 'CLOSE_ITEM_MODAL' });
      await loadAccountsAndData(signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setOperationError('Failed to save item.');
    }
  }

  async function deleteItem(): Promise<void> {
    if (!modalState.deletingItem) return;
    const path =
      modalState.deletingItem.type === 'hero' ? 'heroes' : 'artifacts';
    const signal = beginUserActionRequest();
    try {
      const response = await apiFetch(
        `/api/epic7/${path}/${modalState.deletingItem.id}`,
        {
          method: 'DELETE',
          signal,
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to delete item');
      }
      dispatchModal({ type: 'CONFIRM_DELETE' });
      await loadAccountsAndData(signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setOperationError('Failed to delete item.');
    }
  }

  useEffect(() => {
    setHeaderCenter(
      <div className="search-wrapper">
        <input
          className="search-box"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search Epic Seven entries"
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
      <div className="flex items-center gap-2">
        <select
          value={currentAccountId ?? ''}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (!Number.isNaN(value) && value > 0) {
              void switchAccount(value);
            }
          }}
          aria-label="Select Epic Seven account"
          className="header-link"
        >
          {accounts.length === 0 ? (
            <option value="">No account</option>
          ) : (
            accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_name}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          className={`header-link ${editMode ? 'active' : ''}`}
          onClick={() => setEditMode((previous) => !previous)}
        >
          {editMode ? 'Done Editing' : 'Edit Mode'}
        </button>
        {editMode ? (
          <button
            type="button"
            className="header-link"
            onClick={openAddItemModal}
          >
            Add {tab === 'heroes' ? 'Hero' : 'Artifact'}
          </button>
        ) : null}
        <button
          type="button"
          className="header-link"
          onClick={() => dispatchModal({ type: 'OPEN_ACCOUNT_MODAL' })}
        >
          Add Account
        </button>
      </div>,
    );
    return () => {
      setHeaderActions(null);
    };
  }, [
    accounts,
    currentAccountId,
    editMode,
    openAddItemModal,
    setHeaderActions,
    switchAccount,
    tab,
  ]);

  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading Epic Seven...
      </div>
    );
  }
  if (loadError) {
    return (
      <p className="error" role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {operationError ? (
        <div
          className="error flex items-center justify-between gap-3"
          role="alert"
        >
          <span>{operationError}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOperationError(null)}
            aria-label="Dismiss error message"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <div className="tabs" role="tablist" aria-label="Epic Seven data tabs">
        <button
          type="button"
          className={`tab ${tab === 'heroes' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'heroes'}
          onClick={() => setTab('heroes')}
        >
          Heroes
        </button>
        <button
          type="button"
          className={`tab ${tab === 'artifacts' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'artifacts'}
          onClick={() => setTab('artifacts')}
        >
          Artifacts
        </button>
      </div>
      <div className="filter-bar" id="filter-bar">
        {tab === 'heroes' ? (
          <>
            <div className="filter-group">
              <span className="filter-label">Class:</span>
              {HERO_CLASSES.map((classKey) => (
                <button
                  key={classKey}
                  type="button"
                  className={`filter-icon ${
                    activeFilters.class === classKey ? 'active' : ''
                  }`}
                  title={CLASS_NAMES[classKey]}
                  onClick={() =>
                    setActiveFilters((previous) => ({
                      ...previous,
                      class: previous.class === classKey ? null : classKey,
                    }))
                  }
                >
                  <img
                    className="invert-on-light"
                    src={ICONS[classKey]}
                    alt={CLASS_NAMES[classKey]}
                  />
                </button>
              ))}
            </div>
            <div className="filter-group">
              <span className="filter-label">Element:</span>
              {ELEMENTS.map((elementKey) => (
                <button
                  key={elementKey}
                  type="button"
                  className={`filter-icon ${
                    activeFilters.element === elementKey ? 'active' : ''
                  }`}
                  title={ELEMENT_NAMES[elementKey]}
                  onClick={() =>
                    setActiveFilters((previous) => ({
                      ...previous,
                      element:
                        previous.element === elementKey ? null : elementKey,
                    }))
                  }
                >
                  <img
                    src={ICONS[elementKey]}
                    alt={ELEMENT_NAMES[elementKey]}
                  />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="filter-group">
            <span className="filter-label">Class:</span>
            {ARTIFACT_CLASSES.map((classKey) => (
              <button
                key={classKey}
                type="button"
                className={`filter-icon ${
                  activeFilters.class === classKey ? 'active' : ''
                }`}
                title={CLASS_NAMES[classKey]}
                onClick={() =>
                  setActiveFilters((previous) => ({
                    ...previous,
                    class: previous.class === classKey ? null : classKey,
                  }))
                }
              >
                <img
                  className="invert-on-light"
                  src={ICONS[classKey]}
                  alt={CLASS_NAMES[classKey]}
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="stats-bar">
        <div className="stat">
          <span>Total:</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat">
          <span>Upgraded:</span>
          <span className="stat-value stat-owned">{stats.owned}</span>
        </div>
        <div className="stat">
          <span>{tab === 'heroes' ? 'SSS:' : 'Max Level:'}</span>
          <span className="stat-value stat-maxed">{stats.maxed}</span>
        </div>
      </div>
      <div className="table-container">
        <div className="table-scroll" style={tableScrollStyle}>
          <table>
            <thead>
              {tab === 'heroes' ? (
                <tr>
                  <th>Name</th>
                  <th className="icon-cell">Class</th>
                  <th className="icon-cell">Element</th>
                  <th>Stars</th>
                  <th>Imprint</th>
                  {editMode ? <th>Actions</th> : null}
                </tr>
              ) : (
                <tr>
                  <th>Name</th>
                  <th className="icon-cell">Class</th>
                  <th>Stars</th>
                  <th>Limit Break</th>
                  {editMode ? <th>Actions</th> : null}
                </tr>
              )}
            </thead>
            <tbody>
              {activeRows.map((row) => (
                <tr key={row.id}>
                  <td className="item-name">{row.name}</td>
                  <td className="icon-cell">
                    {row.class && ICONS[row.class] ? (
                      <img
                        className="invert-on-light"
                        src={ICONS[row.class]}
                        alt={
                          CLASS_NAMES[row.class as ArtifactClass] ?? row.class
                        }
                        title={
                          CLASS_NAMES[row.class as ArtifactClass] ?? row.class
                        }
                      />
                    ) : (
                      row.class || '-'
                    )}
                  </td>
                  {isHero(row) ? (
                    <td className="icon-cell">
                      {row.element && ICONS[row.element] ? (
                        <img
                          src={ICONS[row.element]}
                          alt={
                            ELEMENT_NAMES[row.element as Element] ?? row.element
                          }
                          title={
                            ELEMENT_NAMES[row.element as Element] ?? row.element
                          }
                        />
                      ) : (
                        row.element || '-'
                      )}
                    </td>
                  ) : null}
                  <td className="stars-cell">{renderStars(row.star_rating)}</td>
                  <td className={isHero(row) ? 'rating-cell' : 'level-cell'}>
                    {isHero(row) ? (
                      <button
                        type="button"
                        className="rating-btn"
                        style={{
                          color: RATING_COLORS[row.rating] ?? '#6b7280',
                          borderColor: `${
                            RATING_COLORS[row.rating] ?? '#6b7280'
                          }50`,
                          background: `${
                            RATING_COLORS[row.rating] ?? '#6b7280'
                          }20`,
                        }}
                        onClick={() => {
                          void cycleHero(row);
                        }}
                        aria-label={`Cycle imprint for ${row.name}`}
                      >
                        {row.rating}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="gauge-btn"
                        style={{
                          color:
                            GAUGE_COLORS[row.gauge_level] ?? GAUGE_COLORS[0],
                        }}
                        onClick={() => {
                          void cycleArtifact(row);
                        }}
                        aria-label={`Cycle limit break for ${row.name}`}
                      >
                        {renderGauge(row.gauge_level)}
                      </button>
                    )}
                  </td>
                  {editMode ? (
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn-icon btn-edit"
                        onClick={() => openEditItemModal(row)}
                        aria-label={`Edit ${row.name}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-delete"
                        onClick={() => {
                          dispatchModal({
                            type: 'START_DELETE',
                            payload: {
                              id: row.id,
                              type: tab === 'heroes' ? 'hero' : 'artifact',
                              name: row.name,
                            },
                          });
                        }}
                        aria-label={`Delete ${row.name}`}
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

      <Modal
        open={modalState.isAccountModalOpen}
        onClose={() => dispatchModal({ type: 'CLOSE_ACCOUNT_MODAL' })}
        ariaLabelledBy="epic7-account-modal-title"
      >
        <h2
          id="epic7-account-modal-title"
          className="mb-4 text-lg font-semibold"
        >
          Add Account
        </h2>
        <div className="form-group">
          <label htmlFor="epic7-account-name">Account name</label>
          <input
            id="epic7-account-name"
            value={modalState.accountNameDraft}
            onChange={(event) =>
              dispatchModal({
                type: 'SET_ACCOUNT_NAME',
                payload: event.target.value,
              })
            }
          />
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => dispatchModal({ type: 'CLOSE_ACCOUNT_MODAL' })}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void addAccount()}
          >
            Create
          </button>
        </div>
      </Modal>

      <Modal
        open={modalState.isItemModalOpen}
        onClose={() => dispatchModal({ type: 'CLOSE_ITEM_MODAL' })}
        ariaLabelledBy="epic7-item-modal-title"
      >
        <h2 id="epic7-item-modal-title" className="mb-4 text-lg font-semibold">
          {modalState.editingId === null
            ? `Add ${modalState.modalItemType === 'heroes' ? 'Hero' : 'Artifact'}`
            : `Edit ${modalState.modalItemType === 'heroes' ? 'Hero' : 'Artifact'}`}
        </h2>
        <div className="form-group">
          <label htmlFor="epic7-item-name">Name</label>
          <input
            id="epic7-item-name"
            value={modalState.draft.name}
            onChange={(event) =>
              dispatchModal({
                type: 'SET_DRAFT_FIELD',
                payload: { field: 'name', value: event.target.value },
              })
            }
          />
        </div>
        <div className="form-group">
          <label htmlFor="epic7-item-class">Class</label>
          <select
            id="epic7-item-class"
            value={modalState.draft.class}
            onChange={(event) =>
              dispatchModal({
                type: 'SET_DRAFT_FIELD',
                payload: { field: 'class', value: event.target.value },
              })
            }
          >
            {(modalState.modalItemType === 'heroes'
              ? HERO_CLASSES
              : ARTIFACT_CLASSES
            ).map((value) => (
              <option key={value} value={value}>
                {CLASS_NAMES[value]}
              </option>
            ))}
          </select>
        </div>
        {modalState.modalItemType === 'heroes' ? (
          <div className="form-group">
            <label htmlFor="epic7-item-element">Element</label>
            <select
              id="epic7-item-element"
              value={modalState.draft.element}
              onChange={(event) =>
                dispatchModal({
                  type: 'SET_DRAFT_FIELD',
                  payload: { field: 'element', value: event.target.value },
                })
              }
            >
              {ELEMENTS.map((value) => (
                <option key={value} value={value}>
                  {ELEMENT_NAMES[value]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="form-group">
          <label htmlFor="epic7-item-stars">Stars</label>
          <select
            id="epic7-item-stars"
            value={modalState.draft.stars}
            onChange={(event) =>
              dispatchModal({
                type: 'SET_DRAFT_FIELD',
                payload: { field: 'stars', value: Number(event.target.value) },
              })
            }
          >
            {[3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
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
            onClick={() => void saveItem()}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={modalState.isDeleteModalOpen}
        onClose={() => dispatchModal({ type: 'CANCEL_DELETE' })}
        ariaLabelledBy="epic7-delete-modal-title"
      >
        <h2
          id="epic7-delete-modal-title"
          className="mb-4 text-lg font-semibold"
        >
          Delete{' '}
          {modalState.deletingItem?.type === 'hero' ? 'Hero' : 'Artifact'}
        </h2>
        <p className="text-sm text-muted">
          Delete <strong>{modalState.deletingItem?.name || 'this item'}</strong>
          ?
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => dispatchModal({ type: 'CANCEL_DELETE' })}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void deleteItem()}
          >
            Delete
          </button>
        </div>
      </Modal>
    </section>
  );
}
