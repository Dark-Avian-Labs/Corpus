import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { APP_PATHS } from '../../app/paths';
import { GlassCard } from '../../components/ui/GlassCard';

const warframeStyle = { '--color-accent': '#ea580c' } as CSSProperties;
const epic7Style = { '--color-accent': '#a855f7' } as CSSProperties;

export function HomePage() {
  return (
    <div className="space-y-5">
      <GlassCard className="p-6">
        <h1 className="mb-2 text-2xl font-semibold">Corpus</h1>
        <p className="text-sm text-muted">
          Select a game workspace to manage your collection and progress.
        </p>
      </GlassCard>
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to={APP_PATHS.warframe}
          className="game-card"
          style={warframeStyle}
        >
          <h2>Warframe</h2>
          <p>Track worksheet status and completion.</p>
        </Link>
        <Link to={APP_PATHS.epic7} className="game-card" style={epic7Style}>
          <h2>Epic Seven</h2>
          <p>Manage heroes, artifacts, and accounts.</p>
        </Link>
      </div>
    </div>
  );
}
