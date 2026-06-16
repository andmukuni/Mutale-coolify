# Deploying Mutale to cPanel (Shared Hosting)

## Prerequisites
- cPanel with **Node.js Selector** (CloudLinux / Setup Node.js App)
- MySQL database already created via cPanel → MySQL Databases
- Node.js 18+ selected in cPanel

---

## Step-by-step

### 1. Build locally
```bash
npm run deploy:build
```
This runs `vite build` and creates the `dist/` folder.

### 2. Create the MySQL database in cPanel
1. Go to **cPanel → MySQL Databases**
2. Create a new database (e.g. `yourusername_mutale`)
3. Create a database user and assign it **ALL PRIVILEGES** on that database
4. Note down: `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### 2b. Import your local MySQL database to cPanel
You have two options:

#### Option A — Import via phpMyAdmin (Recommended for most users)
1. **Export locally** — run this on your Mac terminal:
   ```bash
   mysqldump -u root -p mutale_dev > mutale_backup.sql
   ```
   *(Replace `mutale_dev` with your local DB name and enter your local MySQL password)*
2. Go to **cPanel → phpMyAdmin**
3. Select your newly created database (e.g. `yourusername_mutale`) in the left sidebar
4. Click the **Import** tab at the top
5. Click **Choose File** → select `mutale_backup.sql`
6. Leave encoding as `utf-8`, format as `SQL`
7. Click **Go** — wait for "Import has been successfully finished"

#### Option B — Import via Terminal (SSH)
If your host provides SSH access:
```bash
# SSH into your server
ssh yourusername@yourdomain.com

# Import the SQL file
mysql -u yourusername_mutale -p yourusername_mutale < mutale_backup.sql
```

#### ⚠️ Important Notes
- **Max upload size in phpMyAdmin** is usually 50MB–512MB. If your dump is larger, use SSH or split the file.
- The app's `ensureSchema()` auto-creates tables on startup, so you can also deploy **without importing** — the DB will be empty but structurally correct. Then seed the admin:
  ```bash
  # In cPanel Node.js App terminal, or via SSH:
  node server/seed.js
  ```
- If you import a dump, make sure the **DB user** in your `.env` matches the cPanel DB user (not your local `root`).

### 3. Upload files to cPanel
Upload these to your app directory (e.g. `~/yourdomain.com/` or `~/myapp/`):

```
├── app.js              ← Passenger entry point
├── .htaccess           ← Apache proxy rules
├── .env                ← Your production environment variables
├── package.json
├── server/
│   ├── index.js
│   └── db.js
├── dist/               ← Built frontend (from step 1)
├── uploads/            ← User-uploaded files (blog images, etc.)
```

> **Do NOT upload:** `node_modules/`, `src/`, `public/`, `mutale2/`, `Archive*.zip`, dev config files.

### 4. Create the `.env` file on the server
Copy `.env.example` and fill in your production values:

```env
NODE_ENV=production
PORT=4000
APP_URL=https://yourdomain.com
CORS_ORIGINS=https://yourdomain.com

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=yourusername_mutale
DB_PASSWORD=your_secure_password
DB_NAME=yourusername_mutale

AUTH_TOKEN_SECRET=generate-a-64-char-random-string-here
```

> **Tip:** Generate a secure secret with:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 5. Set up Node.js App in cPanel
1. Go to **cPanel → Setup Node.js App**
2. Click **Create Application**
3. Set:
   - **Node.js version:** 18+ (or latest available)
   - **Application mode:** Production
   - **Application root:** your app directory (e.g. `yourdomain.com`)
   - **Application URL:** your domain
   - **Application startup file:** `app.js`
4. Click **Create**
5. Click **Run NPM Install** (in the cPanel interface)

### 6. Restart the app
Click **Restart** in the Node.js app manager. The server will:
- Auto-create all database tables
- Seed the default admin user (`admin@mutale.dev` / `admin123`)
- Serve the React frontend from `dist/`

### 7. Verify
- Visit `https://yourdomain.com` → should show the React app
- Visit `https://yourdomain.com/api/health` → should return JSON including `deploymentTag` (if it is missing, you are still on an old `server/index.js` or the wrong app directory)
- Visit `https://yourdomain.com/admin/login` → log in with admin credentials

### Users table vs Admin “Users” screen
- **Registered accounts** are stored in the MySQL table **`users`** (same database as `DB_NAME` in `.env`).
- In phpMyAdmin, select **that exact database** before opening `users`. If the table looks empty but people can log in, you were usually viewing a **different database** than production uses.
- The Admin dashboard **Users** list reads from the API (**`/api/admin/users`**), not browser storage.

---

## Troubleshooting: `Cannot POST /api/auth/forgot-password`

That HTML page is **Express’s own 404** — the running Node process does **not** have the password-reset route (almost always one of these):

1. **ZIP extracted in the wrong folder**  
   Your `.htaccess` has `PassengerAppRoot "/home/.../mutaleapp"` (example). The zip must be uploaded and extracted **inside that exact folder** (where `app.js` and `server/index.js` live for this app), not only under `public_html` or a duplicate copy of the site.

2. **Node app not restarted after upload**  
   In **cPanel → Setup Node.js App** click **Restart** after every extract so Passenger loads the new `server/index.js`.

3. **Confirm the live API file**  
   In File Manager, open `server/index.js` on the server and search for `forgot-password`. If it is not there, the upload did not overwrite the file you think it did.

4. **Confirm health after deploy**  
   Open `https://yourdomain.com/api/health`. You should see something like:
   ```json
   "deploymentTag": "2026-05-09-auth-forgot-password",
   "features": { "authForgotPassword": true }
   ```
   If `deploymentTag` is missing, production is still serving an **older** API build.

---

## Troubleshooting: `npm error ERESOLVE` on Run NPM Install

cPanel’s **Run NPM Install** can fail with `ERESOLVE could not resolve` (often `@tiptap/*` peer dependencies). This project ships a **`.npmrc`** file with:

```ini
legacy-peer-deps=true
```

**Fix:**

1. Upload/extract the latest deploy zip so **`.npmrc`** is in your app root (same folder as `package.json`). Do **not** add npm `overrides` in `package.json` — use `.npmrc` only.
2. In **Setup Node.js App**, set **Application startup file** to **`lsentry.cjs`** or **`app.js`** — not `isentry.cjs` (typo).
3. Click **Run NPM Install** again, then **Restart** the app.

**If the button still fails**, use cPanel **Terminal** (or SSH):

```bash
source /home5/mutalemubanga/nodevenv/First/20/bin/activate
cd /home5/mutalemubanga/First
rm -rf node_modules
npm install --omit=dev --legacy-peer-deps
```

Replace the path with your virtualenv command shown in Setup Node.js App.

**If you see `EOVERRIDE`:** your `package.json` has conflicting `overrides` — remove the `overrides` block and redeploy; only `.npmrc` with `legacy-peer-deps=true` is needed.

---

## Troubleshooting: 503 Service Unavailable

The edge server (LiteSpeed/Apache) returns 503 when the **Node process crashes on startup** or exits. Check **cPanel → Setup Node.js App → stderr log** (or your `stderr.log` download).

**0. `Cannot find module '../src/utils/certificateEligibility.js'` (or any `../src/` import)**  
Production ZIPs do **not** include the `src/` folder. Redeploy the latest `server/` build (includes `server/certificateEligibility.js`). Then **Restart** the Node app.

**1. `AUTH_TOKEN_SECRET or JWT_SECRET must be set`**  
`app.js` sets production mode. You **must** define a strong secret in `.env` at the **application root** (same folder as `app.js`):

```env
JWT_SECRET=your-long-random-hex-string
```

(`JWT_SECRET` or `AUTH_TOKEN_SECRET` — either name works.) After editing `.env`, **Restart** the Node app.

**2. `Failed to initialize database schema` / errno 150**  
Older builds used a foreign key on `event_coupons` that can fail on some MySQL setups. **Redeploy** the latest `server/index.js` (coupons table without FK), then **Restart**.  
If a broken `event_coupons` table was partially created, drop it in phpMyAdmin and restart once so `ensureSchema` can recreate it.

**3. `CORS not allowed for this origin`**  
Set `CORS_ORIGINS` in `.env` to your real site origin (no trailing slash), comma-separated if you have `www` and non-`www`:

```env
CORS_ORIGINS=https://mutalemubanga.org,https://www.mutalemubanga.org
APP_URL=https://mutalemubanga.org
```

Then **Restart** the Node app.

**4. `Cannot find module 'puppeteer'` or Chromium / Puppeteer install errors**  
Receipt PDFs use Puppeteer, which is loaded **only when a receipt is generated** (not at startup). If `npm install` fails while downloading Chromium, the site should still load; receipt downloads fall back to the legacy PDF layout.

- In **cPanel → Setup Node.js App**, click **Run NPM Install** after each deploy.
- If install fails or receipts error at runtime, add to `.env`:
  ```env
  RECEIPT_PDF_LEGACY=1
  ```
  Then **Restart**. Receipts will use the built-in jsPDF layout (slightly different from preview, but functional).

Check the **stderr log** in Setup Node.js App for the exact crash message.

---

## Updating the site
1. Make changes locally
2. Run `npm run deploy:zip`
3. Upload `mutale-cpanel-deploy.zip` (or the dated ZIP from `./scripts/fix-deployment.sh ... --zip`) to your cPanel app root (same folder as `app.js`)
4. Extract it in cPanel File Manager (it will overwrite `dist/`, `server/`, etc.)
5. In cPanel Node.js App → click **Restart**

> Notes:
> - The ZIP intentionally excludes `.env` and `node_modules/`.
> - `uploads/` is excluded by default so your server uploads aren’t overwritten.
>   If you want to include uploads: `bash scripts/make-cpanel-update-zip.sh --include-uploads`

---

## Folder structure on cPanel
```
~/yourdomain.com/
├── app.js                 # Passenger entry point
├── .htaccess              # Apache rewrite rules
├── .env                   # Production env vars (never commit)
├── package.json
├── server/
│   ├── index.js           # Express API + static file server
│   └── db.js              # MySQL connection pool
├── dist/                  # Vite production build (static files)
│   ├── index.html
│   └── assets/
├── uploads/               # User uploads (persisted)
│   ├── blog/
│   ├── books/
│   └── events/
└── node_modules/          # Installed by cPanel "Run NPM Install"
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 503 / Application Error | Check cPanel → Setup Node.js App → **Errors** log |
| API returns HTML instead of JSON | Ensure `.htaccess` is in the app root |
| "Cannot find module" | Run NPM Install again in cPanel |
| Database connection refused | Verify `DB_HOST` is `127.0.0.1` and credentials match cPanel MySQL |
| Admin login fails | Check the `users` table has a row with `role='admin'` and `email_verified=1` |
| Uploads not showing | Ensure the `uploads/` folder exists and has write permissions (`chmod 755`) |
