# Epic7 Collection Tracker

TypeScript/Node.js web app for tracking Epic Seven heroes and artifacts across multiple game accounts. Multi-user auth, per-user game accounts, and admin management of base data.

## Requirements

- **Node.js** 18+
- **Build tools** (for `better-sqlite3` on Windows):  
  [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **“Desktop development with C++”**.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure**

   ```bash
   cp .env.example .env
   ```

   Edit `.env`: set `SESSION_SECRET`, and optionally `IMPORT_DEFAULT_ADMIN_USERNAME` / `IMPORT_DEFAULT_ADMIN_PASSWORD` for the default admin created by import.

3. **Create directories**

   ```bash
   mkdir -p data import
   ```

4. **Import base data (optional)**
   - Add `heroes.csv` and `artifacts.csv` to `import/` (semicolon-delimited; see examples in `import/*.csv.example`).
   - Run:

     ```bash
     npm run import
     ```

   This creates the DB, schema, default admin user, and base heroes/artifacts. **Warning:** Import **recreates** the schema and overwrites existing data.

5. **Run the app**

   ```bash
   npm run dev    # development
   npm start      # production (after npm run build)
   ```

   By default: **http://localhost:3001** (`PORT` in `.env`).

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

- `npm run dev` – run with ts-node-dev
- `npm run build` – compile TypeScript to `dist/`
- `npm start` – run compiled app
- `npm run import` – run schema + CSV import (base data + default admin)
- `npm run import-account` – import `Heros.csv` / `Artifacts.csv` into a game account (set `TARGET_ACCOUNT_ID` or pass as first CLI arg)

## CSV format

- **heroes.csv**: `Name;Class;Element;Stars` (header + rows). Classes: warrior, knight, thief, ranger, mage, soulweaver. Elements: fire, ice, earth, light, dark.
- **artifacts.csv**: `Name;Class;Stars` (header + rows). Classes include `universal`.

## Deployment

Same pattern as Warframe-Node: run the Node app (e.g. PM2 or systemd), put it behind Apache as a reverse proxy, set `TRUST_PROXY=1` and `SECURE_COOKIES=1` when using HTTPS. See Warframe-Node’s `DEPLOY.md` for Apache + HTTPS.

## License

MIT
