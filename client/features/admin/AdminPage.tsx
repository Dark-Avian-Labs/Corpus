import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { APP_PATHS } from '../../app/paths';
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

export function AdminPage() {
  const { auth } = useAuth();
  const isAdmin = auth.status === 'ok' && auth.user.isAdmin;
  const [baseHeroes, setBaseHeroes] = useState<BaseHero[]>([]);
  const [baseArtifacts, setBaseArtifacts] = useState<BaseArtifact[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      <h1 className="text-2xl font-semibold">Corpus Admin: Base Tables</h1>
      <p className="text-sm text-muted">
        User management stays in the shared Auth app. This page only manages
        game base tables.
      </p>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel">
          <div className="panel-header">
            <h2>Epic Seven Base Heroes</h2>
          </div>
          <div className="space-y-2">
            <input
              value={heroName}
              onChange={(event) => setHeroName(event.target.value)}
              placeholder="Hero name"
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
              Add Base Hero
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {baseHeroes.length === 0 ? (
              <p className="text-sm text-muted">No base heroes</p>
            ) : (
              baseHeroes.map((hero) => (
                <div
                  key={hero.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {hero.name} ({hero.class}/{hero.element}/{hero.star_rating}
                    ★)
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void deleteHero(hero.id)}
                    aria-label={`Delete ${hero.name}`}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Epic Seven Base Artifacts</h2>
          </div>
          <div className="space-y-2">
            <input
              value={artifactName}
              onChange={(event) => setArtifactName(event.target.value)}
              placeholder="Artifact name"
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
              Add Base Artifact
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {baseArtifacts.length === 0 ? (
              <p className="text-sm text-muted">No base artifacts</p>
            ) : (
              baseArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span>
                    {artifact.name} ({artifact.class}/{artifact.star_rating}★)
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void deleteArtifact(artifact.id)}
                    aria-label={`Delete ${artifact.name}`}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] p-4 text-sm text-muted">
        Warframe worksheet admin overrides are available on{' '}
        <Link to={APP_PATHS.warframe} className="underline">
          the Warframe page
        </Link>{' '}
        via the Admin override toggle.
      </div>
    </section>
  );
}
