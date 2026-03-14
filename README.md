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

## dotenvx and encrypted env files

This project supports `dotenvx` for local `.env` loading now, and can optionally use encrypted env artifacts later.

- Keep local plaintext env in `.env` (gitignored).
- Never commit `.env.keys` (gitignored).
- You may commit `.env.vault` when you choose to adopt encrypted env files.
- Keep deployment SSH secrets in GitHub Secrets as-is (`SSH_PRIVATE_KEY`, `SERVER_*`).

Suggested secret naming when vault is enabled:

- `DOTENV_PRIVATE_KEY_DEVELOPMENT`
- `DOTENV_PRIVATE_KEY_PRODUCTION`

Use one key per environment to reduce blast radius.

### First-time dotenvx setup

If you have never used dotenvx before, use this flow:

1. Create a local env file from the example:

   ```bash
   cp .env.example .env
   ```

   PowerShell equivalent:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Encrypt your local `.env` into `.env.vault`:

   ```bash
   npx dotenvx encrypt -f .env
   ```

   This creates/updates:
   - `.env.vault` (safe to commit)
   - `.env.keys` (secret, never commit)

3. Add dotenv keys to GitHub Secrets (when you enable vault in CI/deploy):
   - `DOTENV_KEY_DEV`
   - `DOTENV_KEY_PROD`

4. Keep using normal app scripts locally (`npm start`, `npm run validate`).
   The server already loads local `.env` automatically via dotenvx.

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
