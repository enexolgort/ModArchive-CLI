import Database from "better-sqlite3";

const db = new Database("scraper.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    module_count INTEGER,
    rating REAL,
    rating_count INTEGER
  );

  CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    artist_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    module_name TEXT,
    md5 TEXT,
    downloaded INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (artist_id) REFERENCES artists(id)
  );

  CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS module_genres (
    module_id TEXT NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (module_id, genre_id),
    FOREIGN KEY (module_id) REFERENCES modules(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    module_id TEXT PRIMARY KEY,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES modules(id)
  );

  CREATE TABLE IF NOT EXISTS favorite_artists (
    artist_id TEXT PRIMARY KEY,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(id)
  );

  CREATE TABLE IF NOT EXISTS favorite_genres (
    genre_id INTEGER PRIMARY KEY,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (genre_id) REFERENCES genres(id)
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS playlist_modules (
    playlist_id INTEGER NOT NULL,
    module_id TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, module_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id),
    FOREIGN KEY (module_id) REFERENCES modules(id)
  );
`);

// Migrate existing DB: add columns if they don't exist yet
const migrations = [
  `ALTER TABLE artists ADD COLUMN module_count INTEGER`,
  `ALTER TABLE artists ADD COLUMN rating REAL`,
  `ALTER TABLE artists ADD COLUMN rating_count INTEGER`,
  `ALTER TABLE modules ADD COLUMN downloaded INTEGER NOT NULL DEFAULT 0`,
];

for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch {
    // Column already exists, ignore
  }
}

export const insertArtist = db.prepare(`
  INSERT OR IGNORE INTO artists (id, name) VALUES (?, ?)
`);

export const updateArtistStats = db.prepare(`
  UPDATE artists SET module_count = ?, rating = ?, rating_count = ? WHERE id = ?
`);

export const insertModule = db.prepare(`
  INSERT OR IGNORE INTO modules (id, artist_id, file_name) VALUES (?, ?, ?)
`);

export const updateModule = db.prepare(`
  UPDATE modules SET module_name = ?, md5 = ? WHERE id = ?
`);

export const insertGenre = db.prepare(`
  INSERT OR IGNORE INTO genres (name) VALUES (?)
`);

export const getGenreByName = db.prepare(`
  SELECT id FROM genres WHERE name = ?
`);

export const insertModuleGenre = db.prepare(`
  INSERT OR IGNORE INTO module_genres (module_id, genre_id) VALUES (?, ?)
`);

export const getArtistModuleCount = db.prepare(`
  SELECT module_count FROM artists WHERE id = ?
`);

export const countModulesForArtist = db.prepare(`
  SELECT COUNT(*) as count FROM modules WHERE artist_id = ?
`);

export const setModuleDownloaded = db.prepare(`
  UPDATE modules SET downloaded = ? WHERE id = ?
`);

export const listModulesForDownloadScanStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5, m.downloaded
  FROM modules m
  JOIN artists a ON a.id = m.artist_id
`);

export const addFavorite = db.prepare(`
  INSERT OR IGNORE INTO favorites (module_id) VALUES (?)
`);

export const removeFavorite = db.prepare(`
  DELETE FROM favorites WHERE module_id = ?
`);

export const isFavoriteStmt = db.prepare(`
  SELECT 1 FROM favorites WHERE module_id = ?
`);

export const addFavoriteArtist = db.prepare(`
  INSERT OR IGNORE INTO favorite_artists (artist_id) VALUES (?)
`);

export const removeFavoriteArtist = db.prepare(`
  DELETE FROM favorite_artists WHERE artist_id = ?
`);

export const isFavoriteArtistStmt = db.prepare(`
  SELECT 1 FROM favorite_artists WHERE artist_id = ?
`);

export const addFavoriteGenre = db.prepare(`
  INSERT OR IGNORE INTO favorite_genres (genre_id) VALUES (?)
`);

export const removeFavoriteGenre = db.prepare(`
  DELETE FROM favorite_genres WHERE genre_id = ?
`);

export const isFavoriteGenreStmt = db.prepare(`
  SELECT 1 FROM favorite_genres WHERE genre_id = ?
`);

export const insertPlaylist = db.prepare(`
  INSERT OR IGNORE INTO playlists (name) VALUES (?)
`);

export const getPlaylistByName = db.prepare(`
  SELECT id FROM playlists WHERE name = ?
`);

export const deletePlaylistStmt = db.prepare(`
  DELETE FROM playlists WHERE id = ?
`);

export const deletePlaylistModulesStmt = db.prepare(`
  DELETE FROM playlist_modules WHERE playlist_id = ?
`);

export const addPlaylistModuleStmt = db.prepare(`
  INSERT OR IGNORE INTO playlist_modules (playlist_id, module_id) VALUES (?, ?)
`);

export const removePlaylistModuleStmt = db.prepare(`
  DELETE FROM playlist_modules WHERE playlist_id = ? AND module_id = ?
`);

export { db };
export default db;
