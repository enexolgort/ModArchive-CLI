# ModArchive CLI

A TypeScript scraper that indexes the full [ModArchive](http://modarchive.org) catalog into a local SQLite database — artists, modules, genres, ratings, and more — plus a terminal UI (built with [Ink](https://github.com/vadimdemedes/ink)) for browsing that catalog and playing modules, Spotify-style, right from the terminal. A second terminal view turns the same database into a stats dashboard, and an optional `cava` visualizer can be hooked up to whatever's currently playing.

> **Testing status:** so far this has only actually been run and verified under WSL. Plain Linux, native Windows, and macOS are expected to work (see the platform notes below) but haven't been tested — treat them as unverified until confirmed.

---

## Requirements

- Node.js 18+
- npm
- [ffmpeg](https://ffmpeg.org/) + `ffprobe` on `PATH` (needs `libopenmpt` support for tracker formats — most distro packages include it) — used to convert downloaded modules to MP3, probe track duration, and, outside WSL, to play them back
- A working internet connection
- Optional: [`cava`](https://github.com/karlstav/cava) on `PATH` for the audio visualizer (`npm run cava`, see below). Linux/WSL only — there's no Windows build.

---

## Installation

```bash
npm install
```

---

## Database

The scraper writes to `scraper.db` in the project root. The file is created automatically on first run.

> **Note:** `scraper.db` is checked into this repo, so cloning it also clones whatever catalog, favorites, and playlists happen to be in it at the time (the maintainer's own, currently). If you want a clean slate instead, delete `scraper.db` before running anything, then repopulate the catalog from scratch with `npm run scrap` (see [Scripts](#scripts) below — this re-crawls the full ModArchive roster, so it takes a while). Alternatively, `npm run purge` clears every table in place without deleting the file.

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
├── md5            TEXT
└── downloaded     INTEGER  (0/1 — whether the mp3 is cached on disk; reconciled against the
                              filesystem at startup, see "Startup reconciliation" below)

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

playlists            (user-created playlists)
├── id             INTEGER
├── name           TEXT  (unique)
└── created_at     TEXT  (timestamp)

playlist_modules      (N-to-N join table, playlist contents)
├── playlist_id    INTEGER → playlists.id
├── module_id      TEXT     → modules.id
├── added_at       TEXT    (timestamp)
└── position       INTEGER  (manual ordering within the playlist — see "Playlists" below)
```

---

## Client (TUI Player)

A terminal player for browsing and listening to the modules indexed above. Run it after at least `npm run scrap:artists` + `npm run scrap:modules` have populated `scraper.db`.

```bash
npm run client
```

On startup it reconciles the `downloaded` flag against what's actually on disk (see below), showing a splash screen with a progress bar while that full-catalog scan runs — this can take a few seconds on a large catalog.

### Sections

- **Artists** — browse/search all indexed artists, drill into an artist (showing their rating) to see their modules
- **Favorite Artists** — artists you've starred; drilling in works exactly like the main Artists page
- **Genres** — browse genres (with module counts), drill into a genre to see its modules
- **Favorite Genres** — genres you've starred; drilling in works exactly like the main Genres page
- **Playlists** — your own named playlists; drill into one to see/reorder/play its tracks
- **Search** — full-text search across module and file names
- **Favorite Mods** — modules you've starred
- **All Mods** — every module in the catalog, in a fresh random order each time you open the page
- **Downloaded** — every module already cached as an mp3, with per-item and total size on disk

In any module list, the currently loaded track is marked with `♪` and colored by what it's doing (green while playing, yellow while paused or downloading, cyan while converting); undownloaded tracks are shown in gray, and whatever's being pre-fetched in the background for next is marked with `↓`.

### How playback works

Pressing Enter on a module:

1. Downloads the original file from ModArchive if it isn't already cached
2. Converts it to MP3 via `ffmpeg` (tracker formats — `.mod`/`.xm`/`.it`/`.s3m`/etc. — are decoded through ffmpeg's `libopenmpt` support), stamping the artist, title, and genre from the catalog on as proper ID3 tags
3. Deletes the original download, keeping only the MP3
4. Plays it and auto-advances to the next module in the current list when it ends

Downloaded/converted files live under `./modules/<artist name>/<module name>.mp3`, tagged so the artist/title/genre survive even if you copy an mp3 out and play it somewhere else.

Once a track starts playing, the player also pre-fetches (downloads + converts) whatever's next in the queue in the background, so the download/convert pause you'd otherwise hit on every track change only happens on the very first track — that track is marked with `↓` wherever it appears in a list while this is happening.

### Startup reconciliation

The files on disk under `./modules/` are the source of truth for what's actually downloaded. On launch (and before the stats dashboard, too), the app walks the whole catalog and corrects the `downloaded` DB flag to match reality — covering files removed by hand outside the app, or a DB reset/restore that lost track of what was already cached. This is the scan shown behind the startup splash screen.

### Playlists

From any module list, `a` opens an "add to playlist" picker (with an option to create a new one inline). From the Playlists section itself:

- `+` creates a new playlist, `x` deletes the selected one
- `e` renames the selected playlist
- Drill into a playlist and `x` removes the selected track from it
- `[` / `]` move the selected track up/down within the playlist

### Batch converting a whole artist or genre

While browsing a specific artist's or genre's module list, press `c` to download and convert every module in that list up front (skipping ones already cached, continuing past individual failures). A progress bar tracks it; press `c` again to cancel.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `←` `→` | Switch focus between sidebar and content pane |
| `↑` `↓` | Move selection |
| `Enter` | Open (artist/genre/playlist) or play (module) |
| `Esc` | Back out of a drilled-in module list |
| `Space` | Pause / resume |
| `b` / `n` | Previous / next track |
| `*` | Toggle favorite — the selected artist/genre while browsing those lists, otherwise the playing (or selected) module |
| `a` | Add the playing (or selected) module to a playlist |
| `r` | Toggle shuffle (press again to restore original order) |
| `\` | Stop |
| `c` | Convert a whole artist/genre's modules (see above) |
| `+` / `x` | New / delete playlist (from the Playlists list) |
| `e` | Rename the selected playlist (from the Playlists list) |
| `x` | Remove the selected track from a playlist (while drilled into one) |
| `[` / `]` | Move the selected track up/down within a playlist |
| `q` | Quit |

Letter shortcuts (`b`, `n`, `r`, `a`, `q`) are disabled while typing in a search/filter/name-entry box so they type normally instead; `Ctrl+N`/`Ctrl+B`/`Ctrl+F`/`Ctrl+P`/`Ctrl+X` work as fallbacks for next/previous/favorite/pause/stop everywhere (plain keys are preferred since some terminal hosts intercept those Ctrl combos as their own shortcuts), and `Ctrl+Q`/`Ctrl+C` always quit, including from a text box.

### Audio backend

Playback always goes through `ffmpeg`, but *how* differs by environment:

- **WSL**: audio is played by a native Windows process (`src/client/win-player.ps1`, driven via `powershell.exe` over the WSL/Windows interop bridge), so it goes through Windows' own audio stack instead of WSLg's PulseAudio bridge — the latter was found to progressively lose throughput on long streams and eventually drop the connection, regardless of audio format. A dropped stream is detected (actual playtime falls short of the probed duration) and automatically resumed from where it left off, up to 3 times, before surfacing an error.
- **Linux with PulseAudio** (`$PULSE_SERVER` set, non-WSL): plays via `ffmpeg -f pulse`.
- **Everything else**: plays via `ffplay`.

Pause/resume uses `SIGSTOP`/`SIGCONT` where the platform supports it; the WSL-interop backend and native Windows (neither has a POSIX stop/continue signal, nor a live control channel over the interop bridge) instead kill and relaunch playback from the paused position.

---

## Stats Dashboard

A read-only view of your library: which artists and genres you've actually downloaded and/or favorited, ranked side by side.

```bash
npm run stats
```

- Two panels, **By Artist** and **By Genre**, each row showing downloaded count (⬇), favorite count (★), and a relative bar; top 3 ranks get a medal
- `←` `→` / `Tab` switch which panel is focused, `↑` `↓` scrolls it
- `s` toggles the sort key between downloaded count and favorite count
- Header summarizes total downloaded count + size, total favorited count, and how many distinct artists/genres are represented
- `q` / `Ctrl+C` quits

---

## Audio Visualizer

```bash
npm run cava
```

Runs [`cava`](https://github.com/karlstav/cava) (must be installed separately and on `PATH`) configured via `cava-modarchive.config` to read from a named FIFO at `/tmp/modarchive-cava.fifo`. While the client is playing something, it independently decodes the same file to PCM and feeds that FIFO in real time, so run this in a second terminal alongside `npm run client` to get a live spectrum display of whatever's currently playing. Linux/WSL only — there's no Windows build of `cava`, and this bypasses WSLg's PulseAudio bridge entirely the same way normal playback does.

Since it's a second, independent decode of the file rather than tapping the actual playback stream, it can drift slightly out of sync with real playback over a very long track.

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

Wipes every table — the scraped catalog (`artists`/`modules`/`genres`/`module_genres`) as well as your favorites and playlists (`favorites`/`favorite_artists`/`favorite_genres`/`playlists`/`playlist_modules`). The schema itself is preserved; only the rows are deleted.

```bash
npm run purge
```

> ⚠️ This is irreversible. All scraped data, favorites, and playlists will be deleted.

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

- **500ms delay** between each request
- **Automatic retry** on connection errors (`ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`)
  - Up to 3 retries per request
  - 5 second wait before each retry

If a request fails after all retries, the error is thrown and the scraper stops. Simply rerun the command to resume. (The client's own module downloads retry the same way when playing or batch-converting.)

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

-- A playlist's contents, in the order they'll play
SELECT p.name as playlist, m.module_name, a.name as artist
FROM playlist_modules pm
JOIN playlists p ON p.id = pm.playlist_id
JOIN modules m ON m.id = pm.module_id
JOIN artists a ON a.id = m.artist_id
WHERE p.name = 'My Playlist'
ORDER BY pm.position;
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
