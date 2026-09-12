# ModArchive CLI

A TypeScript scraper that indexes the full [ModArchive](http://modarchive.org) catalog into a local SQLite database — artists, modules, genres, ratings, and more — plus a terminal UI (built with [Ink](https://github.com/vadimdemedes/ink)) for browsing that catalog and playing modules, Spotify-style, right from the terminal.

---

## Requirements

- Node.js 18+
- npm
- [ffmpeg](https://ffmpeg.org/) on `PATH` (needs `libopenmpt` support for tracker formats — most distro packages include it) — used to convert downloaded modules to MP3 and, outside WSL, to play them back
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

favorites            (modules starred in the client)
├── module_id      TEXT  → modules.id
└── added_at       TEXT  (timestamp)

favorite_artists     (artists starred in the client)
├── artist_id      TEXT  → artists.id
└── added_at       TEXT  (timestamp)

favorite_genres      (genres starred in the client)
├── genre_id       INTEGER → genres.id
└── added_at       TEXT  (timestamp)
```

---

## Client (TUI Player)

A terminal player for browsing and listening to the modules indexed above. Run it after at least `npm run scrap:artists` + `npm run scrap:modules` have populated `scraper.db`.

```bash
npm run client
```

### Sections

- **Artists** — browse/search all indexed artists, drill into an artist to see their modules
- **Favorite Artists** — artists you've starred; drilling in works exactly like the main Artists page
- **Genres** — browse genres (with module counts), drill into a genre to see its modules
- **Favorite Genres** — genres you've starred; drilling in works exactly like the main Genres page
- **Search** — full-text search across module and file names
- **Favorite Mods** — modules you've starred
- **All Mods** — every module in the catalog, in a fresh random order each time you open the page

### How playback works

Pressing Enter on a module:

1. Downloads the original file from ModArchive if it isn't already cached
2. Converts it to MP3 via `ffmpeg` (tracker formats — `.mod`/`.xm`/`.it`/`.s3m`/etc. — are decoded through ffmpeg's `libopenmpt` support)
3. Deletes the original download, keeping only the MP3
4. Plays it and auto-advances to the next module in the current list when it ends

Downloaded/converted files live under `./modules/<artist name>/<module name>.mp3`. In any module list, entries that haven't been downloaded/converted yet are shown in yellow.

### Batch converting a whole artist or genre

While browsing a specific artist's or genre's module list, press `c` to download and convert every module in that list up front (skipping ones already cached, continuing past individual failures). A progress bar tracks it; press `c` again to cancel.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `←` `→` | Switch focus between sidebar and content pane |
| `↑` `↓` | Move selection |
| `Enter` | Open (artist/genre) or play (module) |
| `Esc` | Back out of an artist/genre's module list |
| `Space` | Pause / resume |
| `b` / `n` | Previous / next track |
| `*` | Toggle favorite — the selected artist/genre while browsing those lists, otherwise the playing (or selected) module |
| `r` | Toggle shuffle (press again to restore original order) |
| `\` | Stop |
| `c` | Convert a whole artist/genre's modules (see above) |
| `q` | Quit |

Letter shortcuts (`b`, `n`, `r`, `q`) are disabled while typing in a search/filter box so they type normally instead — use `Ctrl+Q` (or `Ctrl+C`) to quit from there.

### Audio backend

Playback always goes through `ffmpeg`, but *how* differs by environment:

- **WSL**: audio is played by a native Windows process (`src/client/win-player.ps1`, driven via `powershell.exe` over the WSL/Windows interop bridge), so it goes through Windows' own audio stack instead of WSLg's PulseAudio bridge — the latter was found to progressively lose throughput on long streams and eventually drop the connection, regardless of audio format.
- **Linux with PulseAudio** (`$PULSE_SERVER` set, non-WSL): plays via `ffmpeg -f pulse`.
- **Everything else**: plays via `ffplay`.

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
