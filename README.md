# Mutale Mubanga — Professional Portfolio

A modern, responsive personal portfolio website built with React + Vite + Tailwind CSS for a senior Quality Assurance & Diagnostics Professional.

## Tech Stack

- **React 19** — Component-based UI
- **Vite** — Fast build tooling
- **Tailwind CSS v4** — Utility-first styling
- **React Router DOM** — Client-side routing
- **Lucide React** — Icon library
- **localStorage** — Data persistence (no backend required)

## Features

- **Public Portfolio Pages**: Home, About, Experience, Publications, Contact
- **Events System**: Filterable event listings with category/search support
- **Blog System**: Full blogging with category filtering, search, and article pages
- **Admin Portal**: Dashboard to manage events, blog posts, and site settings
- **Data Persistence**: All admin changes saved to localStorage
- **Responsive Design**: Mobile-first, fully responsive across all breakpoints
- **Professional Design**: Navy & cyan color palette, clean typography, polished UI

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Start backend API (MySQL connection)
npm run server:start
```

## MySQL (XAMPP) Setup

This project now includes a small Node API in `server/` that connects to MySQL.

1. Start **Apache** and **MySQL** from XAMPP.
2. Open phpMyAdmin and run the SQL in `server/init.sql` (or import the file).
3. Confirm `.env` has your credentials (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
4. Test connection:

```bash
node server/test-connection.js
```

If connected, you should see:
- `✅ Connected to MySQL`
- `db: 'mutale'`

### API Endpoints

- `GET /api/health` → API status
- `GET /api/db-test` → DB connectivity test
- `GET /api/events` → Fetch events from MySQL table

## Zoom Integration Setup

Zoom meetings are created from admin using **Server-to-Server OAuth** credentials. In-page attendee join uses the **Meeting SDK** (configured in Admin → Settings → Video, or via env vars below).

```bash
# OAuth — create/manage Zoom meetings from admin
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_DEFAULT_HOST_EMAIL=
ZOOM_WEBHOOK_SECRET_TOKEN=

# Meeting SDK — in-page join on /events/:slug/join (optional env override; admin UI preferred)
ZOOM_MEETING_SDK_KEY=
ZOOM_MEETING_SDK_SECRET=
```

Notes:
- Default join mode is **embed in Mutale** when Meeting SDK credentials are present.
- If SDK credentials are missing or signature generation fails, the join page falls back to opening Zoom `join_url` in a new tab.
- Add **mutalemubanga.org** to the Zoom Meeting SDK app domain allowlist before testing embed.
- Configure Zoom webhook URL to: `POST /api/webhooks/zoom` (public HTTPS endpoint in production).
- See [DEPLOY_COOLIFY.md](DEPLOY_COOLIFY.md) for Marketplace setup and CSP notes.

## Routes

| Path             | Page                    |
|------------------|-------------------------|
| `/`              | Home                    |
| `/about`         | About                   |
| `/experience`    | Professional Experience |
| `/events`        | Events & Workshops      |
| `/blog`          | Blog Listing            |
| `/blog/:slug`    | Blog Article            |
| `/publications`  | Publications            |
| `/contact`       | Contact                 |
| `/admin`         | Admin Portal            |

## Admin Portal

Navigate to `/admin` to manage events, blog posts, and site settings. All changes persist to localStorage.

## Responsive UI Checklist

When adding or editing pages/components, use this quick checklist:

- **Mobile-first layout**: Start from small screens, then scale up (`sm`, `md`, `lg`).
- **Overflow safety**: Avoid horizontal scroll unless intentional (chips/tables).
- **Tables**: Provide a mobile card/stacked fallback for tabular data.
- **Sticky actions on mobile**: For long forms/checkout pages, keep primary CTA reachable.
- **Readable typography**: Use smaller headline/body scale on phones (`text-2xl`/`prose-sm`).
- **Safe text wrapping**: Add `break-words`/`line-clamp-*` for long titles, links, emails.
- **Touch targets**: Buttons/chips should be easy to tap (comfortable padding and spacing).
- **Accessible feedback**: Use `role="status"` for success, `role="alert"` for errors.
- **Validation before merge**: Run build and tests after UI changes.

## License

Private — © Mutale Mubanga
