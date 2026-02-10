# Corpus – Game Collection Tracker

TypeScript/Node.js web app for tracking game collections. Central auth, admin management, and pluggable game modules. Ships with **Warframe** (worksheets with items and status) and **Epic Seven** (heroes and artifacts).

## Requirements

- **Node.js** 25+ (see `engines` in `package.json`)
- **Build tools** (for `better-sqlite3`): on Windows, [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **“Desktop development with C++”**; on Linux/macOS, standard build tools (e.g. `build-essential`, Xcode CLI).

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:
   - **`SESSION_SECRET`** – secret for session cookies (use a long random string in production; the app refuses to start with the default).

3. **Create data directory**

   ```bash
   mkdir -p data
   ```

4. **Build and run**

   ```bash
   npm run build
   npm start
   ```

   By default the app runs at **<http://127.0.0.1:3000>** (`HOST` and `PORT` in `.env`).

## Environment

| Variable                            | Description                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                    | Required. Secret for session signing.                                                   |
| `PORT`, `HOST`                      | Server address (default `3000`, `127.0.0.1`).                                           |
| `TRUST_PROXY`                       | Set to `1` when behind a reverse proxy.                                                 |
| `SECURE_COOKIES`                    | Set to `1` when using HTTPS.                                                            |
| `COOKIE_DOMAIN`                     | Optional. e.g. `.domain.tld` to share session across subdomains.                        |
| `BASE_HOST`                         | Optional. Base host for login (e.g. `corpus.domain.tld`).                               |
| `GAME_HOSTS`                        | Optional. `host=gameId` pairs, e.g. `warframe.domain.tld=warframe,e7.domain.tld=epic7`. |
| `CENTRAL_DB_PATH`                   | Central SQLite DB (default `./data/central.db`).                                        |
| `WARFRAME_DB_PATH`, `EPIC7_DB_PATH` | Per-game SQLite DBs (in `./data/` by default).                                          |

## Routes

| Route             | Description                                   |
| ----------------- | --------------------------------------------- |
| `/`               | Game picker (requires auth).                  |
| `/login`          | Login.                                        |
| `/logout`         | Logout.                                       |
| `/admin`          | Admin panel (users, game access).             |
| `/register`       | Create user (admin only).                     |
| `/games/warframe` | Warframe tracker (worksheets, items, status). |
| `/games/epic7`    | Epic Seven tracker (heroes, artifacts).       |
| `/games/*/api`    | JSON API per game.                            |

When `GAME_HOSTS` is set, visiting a game subdomain (e.g. `warframe.domain.tld`) redirects to the corresponding game. Unauthenticated users on game subdomains are redirected to `BASE_HOST` for login.

## Scripts

| Script                 | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run build`        | Build workspaces, compile TypeScript, copy views, build Tailwind. |
| `npm start`            | Run compiled app from `dist/`.                                    |
| `npm run lint`         | Run ESLint in all workspaces.                                     |
| `npm run format`       | Format with Prettier.                                             |
| `npm run check-format` | Check Prettier formatting.                                        |

## Project layout

```
├── packages/
│   ├── core/               # @corpus/core – auth, config, shared middleware & views
│   │   ├── src/            # Auth, DB schema, middleware, game types
│   │   ├── views/partials/ # Shared EJS partials
│   │   └── assets/         # Background art, icons
│   └── games/
│       ├── warframe/       # @corpus/game-warframe – Warframe tracker
│       │   ├── src/        # Routes, DB queries, views
│       │   └── assets/
│       └── epic7/          # @corpus/game-epic7 – Epic Seven tracker
│           ├── src/
│           └── assets/
├── src/                    # Root app – Express setup, login, admin, game mounting
│   ├── index.ts
│   ├── escapeHtml.ts
│   ├── middleware/         # Rate limiting
│   ├── views/              # Login, register, admin, game picker
│   └── types/
├── scripts/                # copy-all-views
├── data/                   # SQLite DBs, auth lockout (gitignored)
├── .env.example
└── package.json
```

## Deployment

Run the Node app (e.g. PM2 or systemd) behind a reverse proxy. Set **`NODE_ENV=production`**, **`SESSION_SECRET`** to a strong random value, and **`TRUST_PROXY=1`** and **`SECURE_COOKIES=1`** when using HTTPS. For multi-subdomain setups, set **`COOKIE_DOMAIN`**, **`BASE_HOST`**, and **`GAME_HOSTS`**. The app uses graceful shutdown (SIGTERM/SIGINT).

## License

GPL-3.0-or-later
