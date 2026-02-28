# Corpus

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/Node-%3E%3D25-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)

Corpus is a game collection tracker with pluggable modules. It currently ships with Warframe and Epic Seven, and uses the shared Auth service for login and access control.

## Requirements

- Node.js 25+
- npm

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env file:

   ```bash
   cp .env.example .env
   ```

3. Build and run:

   ```bash
   npm run build
   npm start
   ```

## Environment

| Variable                            | Description                                                     |
| ----------------------------------- | --------------------------------------------------------------- |
| `PORT`, `HOST`                      | Server bind address (defaults: `3000`, `127.0.0.1`).            |
| `SESSION_SECRET`                    | Required; 32+ characters.                                       |
| `TRUST_PROXY`                       | Optional, defaults to `false`; set to `1` behind reverse proxy. |
| `AUTH_SERVICE_URL`                  | Shared Auth base URL.                                           |
| `CENTRAL_DB_PATH`                   | Absolute mounted path to the shared Auth SQLite database.       |
| `PARAMETRIC_DB_PATH`                | Absolute mounted path to the Parametric SQLite database.        |
| `WARFRAME_DB_PATH`, `EPIC7_DB_PATH` | Per-game DB paths.                                              |
| `COOKIE_DOMAIN`                     | Optional cross-subdomain cookie domain.                         |
| `GAME_HOSTS`                        | Optional host-to-game map (`host=gameId` pairs).                |

### Shared SQLite deployment notes

- `CENTRAL_DB_PATH` and `PARAMETRIC_DB_PATH` must be absolute mount paths available inside the Corpus runtime container/host.
- Do not use relative `../service/...` paths; deploy each service with explicit shared mounts instead.
- `CENTRAL_DB_PATH` is opened in WAL mode by Corpus; keep a single writer service boundary for schema/migration changes and avoid multi-host writes over network filesystems that do not support SQLite file locking semantics.

## Scripts

| Script                 | Description                         |
| ---------------------- | ----------------------------------- |
| `npm run build`        | Build workspaces and app.           |
| `npm start`            | Run production server from `dist/`. |
| `npm run lint`         | Run ESLint in all workspaces.       |
| `npm run format`       | Run Prettier formatting.            |
| `npm run check-format` | Check Prettier formatting.          |

## License

GPL-3.0-or-later
