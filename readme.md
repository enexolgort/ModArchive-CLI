# ModArchive Scraper

A TypeScript scraper that indexes the full [ModArchive](http://modarchive.org) catalog into a local SQLite database — artists, modules, genres, ratings, and more.

---

## Requirements

- Node.js 18+
- npm
- A working internet connection

---

## Installation

```bash
npm install
```

---

## Database

The scraper writes to `scraper.db` in the project root. The file is created automatically on first run.

### Schema

```
artists
├── id             TEXT  (ModArchive member ID)
├── name           TEXT
├── module_count   INTEGER
├── rating         REAL
└── rating_count   INTEGER

modules
├── id             TEXT  (ModArchive module ID)
├── artist_id      TEXT  → artists.id
├── file_name      TEXT
├── module_name    TEXT
└── md5            TEXT

genres
├── id             INTEGER
└── name           TEXT  (lowercase, unique)

module_genres        (N-to-N join table)
├── module_id      TEXT  → modules.id
└── genre_id       INTEGER → genres.id
```

---

## Scripts

### `npm run scrap`

Runs the full pipeline end-to-end:

1. Scrapes the artist roster A→Z
2. For each artist, fetches their module list
3. For each module, fetches its details (name, MD5, genre)

```bash
npm run scrap
```

> ⚠️ This is a long-running operation. ModArchive has tens of thousands of artists and hundreds of thousands of modules. Expect it to take many hours on a full run.

---

### `npm run scrap:artists`

Scrapes only the artist roster and their module lists. Does **not** fetch individual module details.

```bash
npm run scrap:artists
```

Use this when you want to discover new artists and index which modules they have, without yet fetching full module metadata.

**What it does:**

- Iterates every letter A→Z on the roster pages
- Saves each artist (id, name) to the `artists` table
- Visits each artist's profile page to fetch:
  - Total module count
  - Overall rating + number of ratings
- Skips artists whose DB module count already matches the live count (no new releases)
- Paginates through each artist's module list and saves module stubs (id, file_name)

---

### `npm run scrap:modules`

Scrapes only the detail page for each module that is missing a `module_name` or `md5`.

```bash
npm run scrap:modules
```

Use this after `scrap:artists` to fill in the full metadata for all discovered modules, or to resume a previously interrupted detail scrape.

**What it fetches per module:**

| Field | Source |
|-------|--------|
| `module_name` | `<h1>` tag (span removed) |
| `md5` | `<li class="stats">MD5: ...</li>` |
| `genre` | `<li class="stats">Genre: ...</li>` (comma-separated, lowercase, parentheticals stripped) |

---

### `npm run purge`

Wipes all data from the database. The schema (tables) is preserved.

```bash
npm run purge
```

> ⚠️ This is irreversible. All scraped data will be deleted.

---

## Resumability

All scripts are safe to interrupt and resume:

- `INSERT OR IGNORE` prevents duplicate rows
- `scrap:artists` skips artists whose module count hasn't changed
- `scrap:modules` only queries modules where `module_name IS NULL OR md5 IS NULL`

You can stop the scraper at any time with `Ctrl+C` and rerun — it will pick up where it left off.

---

## Rate Limiting & Retries

The scraper includes built-in protections to avoid overwhelming the server:

- **1500ms delay** between each request
- **Automatic retry** on connection errors (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`)
  - Up to 3 retries per request
  - 5 second wait before each retry

If a request fails after all retries, the error is thrown and the scraper stops. Simply rerun the command to resume.

---

## Viewing the Database

**Recommended:** Install the [SQLite](https://marketplace.visualstudio.com/items?itemName=alexcvzz.vscode-sqlite) extension for VS Code (`alexcvzz.vscode-sqlite`).

- `Ctrl+Shift+P` → `SQLite: Open Database` → select `scraper.db`
- `Ctrl+Shift+P` → `SQLite: New Query` → write SQL → `Ctrl+Shift+Q` to run

**Useful queries:**

```sql
-- Total counts
SELECT COUNT(*) FROM artists;
SELECT COUNT(*) FROM modules;
SELECT COUNT(*) FROM genres;

-- Top rated artists
SELECT name, rating, rating_count
FROM artists
WHERE rating IS NOT NULL
ORDER BY rating DESC
LIMIT 20;

-- Modules by genre
SELECT m.module_name, a.name as artist, g.name as genre
FROM modules m
JOIN artists a ON m.artist_id = a.id
JOIN module_genres mg ON m.id = mg.module_id
JOIN genres g ON mg.genre_id = g.id
WHERE g.name = 'chiptune'
LIMIT 20;

-- Artists with unscraped modules
SELECT name, module_count,
  (SELECT COUNT(*) FROM modules WHERE artist_id = artists.id) as db_count
FROM artists
WHERE module_count > (SELECT COUNT(*) FROM modules WHERE artist_id = artists.id);
```

---

## Recommended Workflow

For a first-time full index:

```bash
# 1. Discover all artists and their module lists
npm run scrap:artists

# 2. Fill in module details (name, MD5, genre)
npm run scrap:modules
```

To keep the database up to date after new releases:

```bash
# Re-runs artist scrape — automatically skips artists with no new modules
npm run scrap:artists

# Fills in any newly discovered modules
npm run scrap:modules
```
