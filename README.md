# Epic7 Collection Tracker

TypeScript/Node.js web app for tracking Epic Seven heroes and artifacts. Multi-user auth, per-user game accounts, and admin management of base heroes/artifacts.

## Requirements

- **Node.js** 25+ (see `engines` in `package.json`)
- **Build tools** (for `better-sqlite3` on Windows): [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **“Desktop development with C++”**. On Linux/macOS, standard build tools (e.g. `build-essential`, Xcode CLI) are usually sufficient.

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
   - **`SESSION_SECRET`** – secret for session cookies (use a long random string in production; the app will refuse to start in production with the default).
   - **`IMPORT_DEFAULT_ADMIN_USERNAME`** / **`IMPORT_DEFAULT_ADMIN_PASSWORD`** – credentials for the default admin user created by `npm run import` (optional; defaults in `.env.example`).

3. **Create directories**

   ```bash
   mkdir -p data import
   ```

4. **Import base data (optional)**

   Add `heroes.csv` and `artifacts.csv` to `import/` (semicolon-delimited; see `import/*.csv.example`). Then:

   ```bash
   npm run import
   ```

   This creates the database, schema, default admin user, and base heroes/artifacts. **Warning:** Import **recreates** the schema and overwrites existing data.

5. **Run the app**

   ```bash
   npm run dev    # development (ts-node-dev)
   npm start      # production (after npm run build)
   ```

   By default the app runs at **<http://127.0.0.1:3001>** (`HOST` and `PORT` in `.env`).

## Routes

| Route       | Description                          |
| ----------- | ------------------------------------ |
| `/`         | Main tracker (heroes, artifacts)     |
| `/login`    | Login                                |
| `/logout`   | Logout                               |
| `/admin`    | Admin (users, base heroes/artifacts) |
| `/register` | Create user (admin only)             |
| `/api`      | JSON API                             |

## Scripts

| Script                   | Description                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Run with ts-node-dev (watch)                                                                                                     |
| `npm run build`          | Compile TypeScript and copy views to `dist/`                                                                                     |
| `npm start`              | Run compiled app from `dist/`                                                                                                    |
| `npm run import`         | Create schema, default admin, and import base heroes/artifacts from CSV                                                          |
| `npm run import-account` | Import `Heros.csv` / `Artifacts.csv` into a game account (set `TARGET_ACCOUNT_ID` in `.env` or pass account ID as first CLI arg) |
| `npm run lint`           | Run ESLint                                                                                                                       |
| `npm run format`         | Run Prettier                                                                                                                     |
| `npm run check-format`   | Check Prettier formatting                                                                                                        |

## CSV format

- **heroes.csv**: `Name;Class;Element;Stars` (header + rows). Classes: warrior, knight, thief, ranger, mage, soulweaver. Elements: fire, ice, earth, light, dark.
- **artifacts.csv**: `Name;Class;Stars` (header + rows). Classes include `universal`.

## Deployment

Run the Node app (e.g. PM2 or systemd) behind a reverse proxy (e.g. Apache or nginx). Set **`NODE_ENV=production`**, **`SESSION_SECRET`** to a strong random value, and **`TRUST_PROXY=1`** and **`SECURE_COOKIES=1`** when using HTTPS. The app uses graceful shutdown (SIGTERM/SIGINT) to close the session store before exiting.

## License

GPL-3.0-or-later
