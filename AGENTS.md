# AGENTS.md

## Cursor Cloud specific instructions

This is a single full-stack app ("Mutale" portfolio/events platform): a React 19 + Vite frontend and an
Express 5 API in `server/`, backed by **MySQL/MariaDB**. See `README.md` and `package.json` scripts for the
standard commands. Notes below are the non-obvious bits for running it in this cloud environment.

### Services and how to run them

Development needs three things running:

1. **MariaDB** (port 3306) — required. The API calls `ensureSchema()`/seeders on boot and `process.exit(1)`s
   if the DB is unreachable, so start MariaDB **before** the backend. There is no systemd here, so start it
   manually (data dir persists in the VM snapshot):
   ```
   sudo -u mysql /usr/sbin/mariadbd --datadir=/var/lib/mysql --socket=/var/run/mysqld/mysqld.sock &
   ```
2. **Backend API** (`npm run server:dev`) → `http://localhost:4000` (serves `/api` and `/uploads`).
3. **Frontend** (`npm run dev`) → `http://localhost:5173`, which proxies `/api` and `/uploads` to `:4000`.

Use the app at `http://localhost:5173`. Default dev admin (seeded on boot): `admin@mutale.dev` / `admin123`
(admin portal at `/admin/login`).

### Database setup (already done in the snapshot)

`.env` is gitignored and already created for local dev, pointing at DB user `mutale` / password `mutale` /
database `mutale`. A dedicated `mutale` MySQL user exists because MariaDB reverse-resolves `127.0.0.1` to
`localhost`, which maps to the `root@localhost` unix_socket account and rejects TCP logins.

**Fresh-DB gotcha:** `ensureSchema()` in `server/index.js` runs `ALTER TABLE users ...` (backward-compat
migrations) *before* the `CREATE TABLE IF NOT EXISTS users` statement. On a completely empty database this
crashes on boot with `Table 'mutale.users' doesn't exist`. The `mutale` database in the snapshot already has
the `users` table pre-created (from the code's own definition), so the app boots fine. If you ever wipe/recreate
the `mutale` database, pre-create the `users` table first (copy the `CREATE TABLE ... users (...)` block from
`ensureSchema()` in `server/index.js`) before starting the backend. Do not "fix" this by editing app code
unless that is the actual task.

### Tests and lint

- `npm test` (Vitest). Requires the `@testing-library/dom` devDependency (peer of `@testing-library/react`;
  not auto-installed because `.npmrc` sets `legacy-peer-deps=true`). It is listed in `devDependencies` now.
  6 assertions in `BookFormPage.variants.test.jsx` and `ReceiptsPage.test.jsx` fail pre-existing (DOM query
  mismatches), unrelated to environment setup.
- `npm run lint` (ESLint) reports many pre-existing errors in `src/`; not caused by env setup.

### External integrations

Email (SMTP), payments (Lenco), and video (Zoom/Daily) are all optional and unconfigured by default — core
flows (auth, events, blog, admin CRUD) work without them.
