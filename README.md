# Warframe Collection Tracker

TypeScript/Node.js web app for tracking your Warframe collection (worksheets with items and status columns). User-based auth and admin management.

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

3. **Create directories**

```bash
mkdir -p data
```

4. **Run the app**

   ```bash
   npm run dev    # development (ts-node-dev)
   npm start      # production (after npm run build)
   ```

   By default the app runs at **<http://127.0.0.1:3000>** (`HOST` and `PORT` in `.env`).

## Routes

| Route       | Description                               |
| ----------- | ----------------------------------------- |
| `/`         | Main tracker (tabs, search)               |
| `/login`    | Login                                     |
| `/logout`   | Logout                                    |
| `/admin`    | Admin (add/edit items, set status)        |
| `/register` | Create user (admin only)                  |
| `/api`      | JSON API (worksheets, data, update, CRUD) |

API examples: `GET /api?action=worksheets`, `GET /api?action=data&worksheet=1`, `POST /api?action=update` with JSON `{ row_id, column_id, value }`, etc.

## Scripts

| Script                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Run with ts-node-dev (watch)                 |
| `npm run build`        | Compile TypeScript and copy views to `dist/` |
| `npm start`            | Run compiled app from `dist/`                |
| `npm run lint`         | Run ESLint                                   |
| `npm run format`       | Run Prettier                                 |
| `npm run check-format` | Check Prettier formatting                    |

## Project layout

```
├── src/
│   ├── index.ts       # Express app
│   ├── config.ts      # Env config
│   ├── auth.ts        # Login, lockout, user management
│   ├── db/             # SQLite schema & queries
│   ├── middleware/     # Auth middleware
│   ├── routes/         # API & page routes
│   ├── views/          # EJS (index, login, admin, register)
│   ├── scripts/        # One-off scripts
│   └── types/          # Session typings
├── data/               # SQLite DB, lockout JSON (gitignored)
├── .env.example
├── package.json
└── tsconfig.json
```

## Deployment

Run the Node app (e.g. PM2 or systemd) behind a reverse proxy (e.g. Apache or nginx). Set **`NODE_ENV=production`**, **`SESSION_SECRET`** to a strong random value, and **`TRUST_PROXY=1`** and **`SECURE_COOKIES=1`** when using HTTPS. The app uses graceful shutdown (SIGTERM/SIGINT) to close the session store before exiting.

## License

GPL-3.0-or-later
