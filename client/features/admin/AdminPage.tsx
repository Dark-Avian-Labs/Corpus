import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiFetch } from '../../utils/api';
import { useAuth } from '../auth/AuthContext';

type BaseHero = {
  id: number;
  name: string;
  class: string;
  element: string;
  star_rating: number;
};
type BaseArtifact = {
  id: number;
  name: string;
  class: string;
  star_rating: number;
};

const HERO_CLASSES = [
  'warrior',
  'knight',
  'thief',
  'ranger',
  'mage',
  'soulweaver',
] as const;
const ARTIFACT_CLASSES = [...HERO_CLASSES, 'universal'] as const;
const ELEMENTS = ['fire', 'ice', 'earth', 'light', 'dark'] as const;
const CLASS_NAMES: Record<(typeof ARTIFACT_CLASSES)[number], string> = {
  warrior: 'Warrior',
  knight: 'Knight',
  thief: 'Thief',
  ranger: 'Ranger',
  mage: 'Mage',
  soulweaver: 'Soul Weaver',
  universal: 'Universal',
};
const ELEMENT_NAMES: Record<(typeof ELEMENTS)[number], string> = {
  fire: 'Fire',
  ice: 'Ice',
  earth: 'Earth',
  light: 'Light',
  dark: 'Dark',
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

function renderStars(count: number): string | ReactNode {
  if (!count || count <= 0) return '-';
  const iconSrc = ICONS[`star${count}`];
  if (!iconSrc) return `${count}★`;
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

export function AdminPage() {
  const { auth } = useAuth();
  const isAdmin = auth.status === 'ok' && auth.user.isAdmin;
  const [tab, setTab] = useState<'heroes' | 'artifacts'>('heroes');
  const [baseHeroes, setBaseHeroes] = useState<BaseHero[]>([]);
  const [baseArtifacts, setBaseArtifacts] = useState<BaseArtifact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [elementFilter, setElementFilter] = useState('');

  const [heroName, setHeroName] = useState('');
  const [heroClass, setHeroClass] = useState<string>(HERO_CLASSES[0]);
  const [heroElement, setHeroElement] = useState<string>(ELEMENTS[0]);
  const [heroStars, setHeroStars] = useState(5);

  const [artifactName, setArtifactName] = useState('');
  const [artifactClass, setArtifactClass] = useState<string>(
    ARTIFACT_CLASSES[0],
  );
  const [artifactStars, setArtifactStars] = useState(5);

  const loadBaseData = useCallback(async (): Promise<void> => {
    if (!isAdmin) return;
    setError(null);
    try {
      const [heroesRes, artifactsRes] = await Promise.all([
        apiFetch('/api/epic7/admin/base/heroes'),
        apiFetch('/api/epic7/admin/base/artifacts'),
      ]);
      if (!heroesRes.ok || !artifactsRes.ok) {
        throw new Error('Failed to load base tables.');
      }
      const heroesBody = (await heroesRes.json()) as { heroes?: BaseHero[] };
      const artifactsBody = (await artifactsRes.json()) as {
        artifacts?: BaseArtifact[];
      };
      setBaseHeroes(Array.isArray(heroesBody.heroes) ? heroesBody.heroes : []);
      setBaseArtifacts(
        Array.isArray(artifactsBody.artifacts) ? artifactsBody.artifacts : [],
      );
    } catch {
      setError('Failed to load base tables.');
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  const filteredHeroes = useMemo(
    () =>
      baseHeroes.filter((hero) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          q.length === 0 || hero.name.toLowerCase().includes(q);
        const matchesClass = classFilter === '' || hero.class === classFilter;
        const matchesElement =
          elementFilter === '' || hero.element === elementFilter;
        return matchesSearch && matchesClass && matchesElement;
      }),
    [baseHeroes, classFilter, elementFilter, search],
  );

  const filteredArtifacts = useMemo(
    () =>
      baseArtifacts.filter((artifact) => {
        const q = search.trim().toLowerCase();
        const matchesSearch =
          q.length === 0 || artifact.name.toLowerCase().includes(q);
        const matchesClass =
          classFilter === '' || artifact.class === classFilter;
        return matchesSearch && matchesClass;
      }),
    [baseArtifacts, classFilter, search],
  );

  const setActiveTab = useCallback((nextTab: 'heroes' | 'artifacts') => {
    setTab(nextTab);
    if (nextTab === 'heroes') {
      setClassFilter((current) =>
        HERO_CLASSES.includes(current as (typeof HERO_CLASSES)[number])
          ? current
          : '',
      );
      setElementFilter((current) =>
        ELEMENTS.includes(current as (typeof ELEMENTS)[number]) ? current : '',
      );
      return;
    }

    setClassFilter((current) =>
      ARTIFACT_CLASSES.includes(current as (typeof ARTIFACT_CLASSES)[number])
        ? current
        : '',
    );
    setElementFilter('');
  }, []);

  async function addHero(): Promise<void> {
    if (!heroName.trim()) return;
    try {
      const res = await apiFetch('/api/epic7/admin/base/heroes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: heroName.trim(),
          class: heroClass,
          element: heroElement,
          star_rating: heroStars,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok || body?.error) {
        throw new Error(body?.error || 'Failed to add base hero.');
      }
      setHeroName('');
      await loadBaseData();
    } catch {
      setError('Failed to add base hero.');
    }
  }

  async function addArtifact(): Promise<void> {
    if (!artifactName.trim()) return;
    try {
      const res = await apiFetch('/api/epic7/admin/base/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: artifactName.trim(),
          class: artifactClass,
          star_rating: artifactStars,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok || body?.error) {
        throw new Error(body?.error || 'Failed to add base artifact.');
      }
      setArtifactName('');
      await loadBaseData();
    } catch {
      setError('Failed to add base artifact.');
    }
  }

  async function deleteHero(heroId: number): Promise<void> {
    const confirmed = window.confirm(
      'Are you sure you want to delete this base hero? This action cannot be undone.',
    );
    if (!confirmed) return;

    try {
      const res = await apiFetch(`/api/epic7/admin/base/heroes/${heroId}`, {
        method: 'DELETE',
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok || body?.error) {
        throw new Error(body?.error || 'Failed to delete base hero.');
      }
      await loadBaseData();
    } catch {
      setError('Failed to delete base hero.');
    }
  }

  async function deleteArtifact(artifactId: number): Promise<void> {
    const confirmed = window.confirm(
      'Are you sure you want to delete this base artifact? This action cannot be undone.',
    );
    if (!confirmed) return;

    try {
      const res = await apiFetch(
        `/api/epic7/admin/base/artifacts/${artifactId}`,
        {
          method: 'DELETE',
        },
      );
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok || body?.error) {
        throw new Error(body?.error || 'Failed to delete base artifact.');
      }
      await loadBaseData();
    } catch {
      setError('Failed to delete base artifact.');
    }
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] p-6">
        <h1 className="mb-2 text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted">Admin access is required.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Epic7 Admin: Base Tables</h1>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div
        className="tabs"
        role="tablist"
        aria-label="Epic Seven base categories"
      >
        <button
          type="button"
          className={`tab ${tab === 'heroes' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'heroes'}
          onClick={() => setActiveTab('heroes')}
        >
          Heroes
        </button>
        <button
          type="button"
          className={`tab ${tab === 'artifacts' ? 'active' : ''}`}
          role="tab"
          aria-selected={tab === 'artifacts'}
          onClick={() => setActiveTab('artifacts')}
        >
          Artifacts
        </button>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <input
            className="search-box"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search base table entries"
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
        </div>
        <div className="filter-group" role="group" aria-label="Filter by class">
          <span className="filter-label">Class:</span>
          {(tab === 'heroes' ? HERO_CLASSES : ARTIFACT_CLASSES).map((value) => {
            const isActive = classFilter === value;
            return (
              <button
                key={value}
                type="button"
                className={`filter-icon ${isActive ? 'active' : ''}`}
                aria-pressed={isActive}
                title={CLASS_NAMES[value]}
                onClick={() => setClassFilter((previous) => (previous === value ? '' : value))}
              >
                <img
                  className="invert-on-light"
                  src={ICONS[value]}
                  alt={CLASS_NAMES[value]}
                />
              </button>
            );
          })}
        </div>
        {tab === 'heroes' ? (
          <div className="filter-group" role="group" aria-label="Filter by element">
            <span className="filter-label">Element:</span>
            {ELEMENTS.map((value) => {
              const isActive = elementFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`filter-icon ${isActive ? 'active' : ''}`}
                  aria-pressed={isActive}
                  title={ELEMENT_NAMES[value]}
                  onClick={() =>
                    setElementFilter((previous) => (previous === value ? '' : value))
                  }
                >
                  <img src={ICONS[value]} alt={ELEMENT_NAMES[value]} />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="table-container">
        <div className="table-scroll">
          <table style={{ tableLayout: 'fixed' }}>
            {tab === 'heroes' ? (
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
            ) : (
              <colgroup>
                <col style={{ width: 'auto' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
            )}
            <thead>
              {tab === 'heroes' ? (
                <tr>
                  <th>Name</th>
                  <th className="icon-cell text-center">Class</th>
                  <th className="icon-cell text-center">Element</th>
                  <th className="text-center">Stars</th>
                  <th className="text-center">Actions</th>
                </tr>
              ) : (
                <tr>
                  <th>Name</th>
                  <th className="icon-cell text-center">Class</th>
                  <th className="text-center">Stars</th>
                  <th className="text-center">Actions</th>
                </tr>
              )}
            </thead>
            <tbody>
              {tab === 'heroes' ? (
                filteredHeroes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="status-cell text-center">
                      No heroes match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredHeroes.map((hero) => (
                    <tr key={hero.id}>
                      <td className="item-name">{hero.name}</td>
                      <td className="icon-cell">
                        {ICONS[hero.class] ? (
                          <img
                            className="invert-on-light"
                            src={ICONS[hero.class]}
                            alt={
                              CLASS_NAMES[
                                hero.class as (typeof ARTIFACT_CLASSES)[number]
                              ] ?? hero.class
                            }
                            title={
                              CLASS_NAMES[
                                hero.class as (typeof ARTIFACT_CLASSES)[number]
                              ] ?? hero.class
                            }
                          />
                        ) : (
                          hero.class
                        )}
                      </td>
                      <td className="icon-cell">
                        {ICONS[hero.element] ? (
                          <img
                            src={ICONS[hero.element]}
                            alt={
                              ELEMENT_NAMES[
                                hero.element as (typeof ELEMENTS)[number]
                              ] ?? hero.element
                            }
                            title={
                              ELEMENT_NAMES[
                                hero.element as (typeof ELEMENTS)[number]
                              ] ?? hero.element
                            }
                          />
                        ) : (
                          hero.element
                        )}
                      </td>
                      <td className="stars-cell">
                        {renderStars(hero.star_rating)}
                      </td>
                      <td className="status-cell">
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void deleteHero(hero.id)}
                          aria-label={`Delete ${hero.name}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : filteredArtifacts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="status-cell text-center">
                    No artifacts match your filters.
                  </td>
                </tr>
              ) : (
                filteredArtifacts.map((artifact) => (
                  <tr key={artifact.id}>
                    <td className="item-name">{artifact.name}</td>
                    <td className="icon-cell">
                      {ICONS[artifact.class] ? (
                        <img
                          className="invert-on-light"
                          src={ICONS[artifact.class]}
                          alt={
                            CLASS_NAMES[
                              artifact.class as (typeof ARTIFACT_CLASSES)[number]
                            ] ?? artifact.class
                          }
                          title={
                            CLASS_NAMES[
                              artifact.class as (typeof ARTIFACT_CLASSES)[number]
                            ] ?? artifact.class
                          }
                        />
                      ) : (
                        artifact.class
                      )}
                    </td>
                    <td className="stars-cell">
                      {renderStars(artifact.star_rating)}
                    </td>
                    <td className="status-cell">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => void deleteArtifact(artifact.id)}
                        aria-label={`Delete ${artifact.name}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="filter-group">
        {tab === 'heroes' ? (
          <>
            <input
              value={heroName}
              onChange={(event) => setHeroName(event.target.value)}
              placeholder="New hero name"
              aria-label="New base hero name"
            />
            <select
              value={heroClass}
              onChange={(event) => setHeroClass(event.target.value)}
              aria-label="New base hero class"
            >
              {HERO_CLASSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={heroElement}
              onChange={(event) => setHeroElement(event.target.value)}
              aria-label="New base hero element"
            >
              {ELEMENTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={heroStars}
              onChange={(event) => setHeroStars(Number(event.target.value))}
              aria-label="New base hero stars"
            >
              {[3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void addHero()}
            >
              Add Hero
            </button>
          </>
        ) : (
          <>
            <input
              value={artifactName}
              onChange={(event) => setArtifactName(event.target.value)}
              placeholder="New artifact name"
              aria-label="New base artifact name"
            />
            <select
              value={artifactClass}
              onChange={(event) => setArtifactClass(event.target.value)}
              aria-label="New base artifact class"
            >
              {ARTIFACT_CLASSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={artifactStars}
              onChange={(event) => setArtifactStars(Number(event.target.value))}
              aria-label="New base artifact stars"
            >
              {[3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => void addArtifact()}
            >
              Add Artifact
            </button>
          </>
        )}
      </div>
    </section>
  );
}
