import { useEffect, useMemo, useState } from 'react';

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
type Epic7Account = { id: number; account_name: string };

const HERO_RATINGS = ['-', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;
const GAUGE_MAX = 5;
const HERO_CLASSES = ['warrior', 'knight', 'thief', 'ranger', 'mage', 'soulweaver'] as const;
const ARTIFACT_CLASSES = [...HERO_CLASSES, 'universal'] as const;
const ELEMENTS = ['fire', 'ice', 'earth', 'light', 'dark'] as const;

function stars(count: number | undefined): string {
  if (!count || count <= 0) return '-';
  return `${'★'.repeat(count)} (${count})`;
}

export function Epic7Page() {
  const [accounts, setAccounts] = useState<Epic7Account[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<number | null>(null);
  const [heroes, setHeroes] = useState<Epic7Hero[]>([]);
  const [artifacts, setArtifacts] = useState<Epic7Artifact[]>([]);
  const [tab, setTab] = useState<'heroes' | 'artifacts'>('heroes');
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftClass, setDraftClass] = useState('');
  const [draftElement, setDraftElement] = useState('');
  const [draftStars, setDraftStars] = useState(5);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<
    { id: number; type: 'hero' | 'artifact'; name: string } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAccountsAndData(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const accountsRes = await fetch('/api/epic7/accounts');
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
      setAccounts(nextAccounts);
      setCurrentAccountId(nextAccountId);
      if (nextAccountId === null) {
        setHeroes([]);
        setArtifacts([]);
        setLoading(false);
        return;
      }

      const [heroesRes, artifactsRes] = await Promise.all([
        fetch('/api/epic7/heroes'),
        fetch('/api/epic7/artifacts'),
      ]);
      if (!heroesRes.ok || !artifactsRes.ok) {
        throw new Error('Failed to load Epic7 data');
      }
      const heroesBody = (await heroesRes.json()) as { heroes?: Epic7Hero[] };
      const artifactsBody = (await artifactsRes.json()) as {
        artifacts?: Epic7Artifact[];
      };
      setHeroes(Array.isArray(heroesBody.heroes) ? heroesBody.heroes : []);
      setArtifacts(
        Array.isArray(artifactsBody.artifacts) ? artifactsBody.artifacts : [],
      );
    } catch {
      setError('Could not load Epic Seven data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccountsAndData();
  }, []);

  const activeRows = useMemo(() => {
    const list = tab === 'heroes' ? heroes : artifacts;
    return list.filter((row) =>
      row.name.toLowerCase().includes(search.trim().toLowerCase()),
    );
  }, [tab, heroes, artifacts, search]);

  async function switchAccount(accountId: number): Promise<void> {
    if (currentAccountId === accountId) return;
    try {
      const response = await apiFetch('/api/epic7/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Failed to switch account');
      }
      await loadAccountsAndData();
    } catch {
      setError('Failed to switch Epic Seven account.');
    }
  }

  async function cycleHero(hero: Epic7Hero): Promise<void> {
    const index = HERO_RATINGS.indexOf(hero.rating);
    const rating = HERO_RATINGS[(index + 1 + HERO_RATINGS.length) % HERO_RATINGS.length];
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
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Failed to update hero');
      }
    } catch {
      setHeroes((previous) =>
        previous.map((candidate) =>
          candidate.id === hero.id ? { ...candidate, rating: hero.rating } : candidate,
        ),
      );
      setError('Failed to save hero rating.');
    }
  }

  async function cycleArtifact(artifact: Epic7Artifact): Promise<void> {
    const gaugeLevel = (artifact.gauge_level + 1) % (GAUGE_MAX + 1);
    setArtifacts((previous) =>
      previous.map((candidate) =>
        candidate.id === artifact.id ? { ...candidate, gauge_level: gaugeLevel } : candidate,
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
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
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
      setError('Failed to save artifact gauge.');
    }
  }

  async function addAccount(): Promise<void> {
    if (newAccountName.trim().length === 0) {
      setError('Account name is required.');
      return;
    }
    try {
      const response = await apiFetch('/api/epic7/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_name: newAccountName.trim() }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || body?.error) {
        throw new Error(body?.error || 'Failed to add account');
      }
      setAccountModalOpen(false);
      setNewAccountName('');
      await loadAccountsAndData();
    } catch {
      setError('Failed to create account.');
    }
  }

  function openAddItemModal(): void {
    setEditingId(null);
    setDraftName('');
    setDraftClass(tab === 'heroes' ? HERO_CLASSES[0] : ARTIFACT_CLASSES[0]);
    setDraftElement(ELEMENTS[0]);
    setDraftStars(5);
    setItemModalOpen(true);
  }

  function openEditItemModal(item: Epic7Hero | Epic7Artifact): void {
    setEditingId(item.id);
    setDraftName(item.name);
    setDraftClass(item.class || (tab === 'heroes' ? HERO_CLASSES[0] : ARTIFACT_CLASSES[0]));
    setDraftElement((item as Epic7Hero).element || ELEMENTS[0]);
    setDraftStars(item.star_rating || 5);
    setItemModalOpen(true);
  }

  async function saveItem(): Promise<void> {
    if (draftName.trim().length === 0) {
      setError('Name is required.');
      return;
    }
    const isHero = tab === 'heroes';
    const isEdit = editingId !== null;
    const path = isHero ? 'heroes' : 'artifacts';
    const url = isEdit
      ? `/api/epic7/${path}/${editingId}/details`
      : `/api/epic7/${path}`;
    const method = isEdit ? 'PATCH' : 'POST';
    const body = isHero
      ? {
          name: draftName.trim(),
          class: draftClass,
          element: draftElement,
          star_rating: draftStars,
        }
      : {
          name: draftName.trim(),
          class: draftClass,
          star_rating: draftStars,
        };
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
        throw new Error(payload?.error || 'Failed to save item');
      }
      setItemModalOpen(false);
      await loadAccountsAndData();
    } catch {
      setError('Failed to save item.');
    }
  }

  async function deleteItem(): Promise<void> {
    if (!deletingItem) return;
    const path = deletingItem.type === 'hero' ? 'heroes' : 'artifacts';
    try {
      const response = await apiFetch(`/api/epic7/${path}/${deletingItem.id}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Failed to delete item');
      }
      setDeleteModalOpen(false);
      setDeletingItem(null);
      await loadAccountsAndData();
    } catch {
      setError('Failed to delete item.');
    }
  }


  if (loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        Loading Epic Seven...
      </div>
    );
  }
  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Epic Seven</h1>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${editMode ? 'btn-accent' : 'btn-secondary'}`}
          onClick={() => setEditMode((previous) => !previous)}
        >
          {editMode ? 'Done Editing' : 'Edit Mode'}
        </button>
        {editMode ? (
          <button type="button" className="btn btn-secondary" onClick={openAddItemModal}>
            Add {tab === 'heroes' ? 'Hero' : 'Artifact'}
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={() => setAccountModalOpen(true)}>
          Add Account
        </button>
      </div>
      <div className="filter-bar">
        <label className="form-group mb-0">
          <span className="mb-2 block text-sm text-muted">Account</span>
          <select
            value={currentAccountId ?? ''}
            onChange={(event) => {
              void switchAccount(Number(event.target.value));
            }}
            aria-label="Select Epic Seven account"
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
        </label>
        <label className="form-group mb-0">
          <span className="mb-2 block text-sm text-muted">Search</span>
          <input
            className="search-box"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search Epic Seven entries"
            placeholder="Search..."
          />
        </label>
      </div>
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
      <div className="table-container">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Class</th>
                <th>Stars</th>
                <th>{tab === 'heroes' ? 'Imprint' : 'Limit Break'}</th>
                {editMode ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {activeRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.class || '-'}</td>
                  <td>{stars(row.star_rating)}</td>
                  <td>
                    {tab === 'heroes' ? (
                      <button
                        type="button"
                        className="rating-btn"
                        onClick={() => {
                          void cycleHero(row as Epic7Hero);
                        }}
                        aria-label={`Cycle imprint for ${row.name}`}
                      >
                        {(row as Epic7Hero).rating}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="gauge-btn"
                        onClick={() => {
                          void cycleArtifact(row as Epic7Artifact);
                        }}
                        aria-label={`Cycle limit break for ${row.name}`}
                      >
                        {'▰'.repeat((row as Epic7Artifact).gauge_level)}
                        {'▱'.repeat(GAUGE_MAX - (row as Epic7Artifact).gauge_level)}
                      </button>
                    )}
                  </td>
                  {editMode ? (
                    <td className="row-actions" style={{ display: 'table-cell' }}>
                      <button
                        type="button"
                        className="btn-icon btn-edit"
                        onClick={() => openEditItemModal(row as Epic7Hero | Epic7Artifact)}
                        aria-label={`Edit ${row.name}`}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-delete"
                        onClick={() => {
                          setDeletingItem({
                            id: row.id,
                            type: tab === 'heroes' ? 'hero' : 'artifact',
                            name: row.name,
                          });
                          setDeleteModalOpen(true);
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
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        ariaLabelledBy="epic7-account-modal-title"
      >
        <h2 id="epic7-account-modal-title" className="mb-4 text-lg font-semibold">
          Add Account
        </h2>
        <div className="form-group">
          <label htmlFor="epic7-account-name">Account name</label>
          <input
            id="epic7-account-name"
            value={newAccountName}
            onChange={(event) => setNewAccountName(event.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-cancel" onClick={() => setAccountModalOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-accent" onClick={() => void addAccount()}>
            Create
          </button>
        </div>
      </Modal>

      <Modal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        ariaLabelledBy="epic7-item-modal-title"
      >
        <h2 id="epic7-item-modal-title" className="mb-4 text-lg font-semibold">
          {editingId === null ? `Add ${tab === 'heroes' ? 'Hero' : 'Artifact'}` : `Edit ${tab === 'heroes' ? 'Hero' : 'Artifact'}`}
        </h2>
        <div className="form-group">
          <label htmlFor="epic7-item-name">Name</label>
          <input
            id="epic7-item-name"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="epic7-item-class">Class</label>
          <select
            id="epic7-item-class"
            value={draftClass}
            onChange={(event) => setDraftClass(event.target.value)}
          >
            {(tab === 'heroes' ? HERO_CLASSES : ARTIFACT_CLASSES).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        {tab === 'heroes' ? (
          <div className="form-group">
            <label htmlFor="epic7-item-element">Element</label>
            <select
              id="epic7-item-element"
              value={draftElement}
              onChange={(event) => setDraftElement(event.target.value)}
            >
              {ELEMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="form-group">
          <label htmlFor="epic7-item-stars">Stars</label>
          <select
            id="epic7-item-stars"
            value={draftStars}
            onChange={(event) => setDraftStars(Number(event.target.value))}
          >
            {[3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-cancel" onClick={() => setItemModalOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-accent" onClick={() => void saveItem()}>
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        ariaLabelledBy="epic7-delete-modal-title"
      >
        <h2 id="epic7-delete-modal-title" className="mb-4 text-lg font-semibold">
          Delete {deletingItem?.type === 'hero' ? 'Hero' : 'Artifact'}
        </h2>
        <p className="text-sm text-muted">
          Delete <strong>{deletingItem?.name || 'this item'}</strong>?
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-cancel" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void deleteItem()}>
            Delete
          </button>
        </div>
      </Modal>
    </section>
  );
}
