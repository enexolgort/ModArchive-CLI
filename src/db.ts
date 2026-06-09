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
`);

// Migrate existing DB: add columns if they don't exist yet
const migrations = [
  `ALTER TABLE artists ADD COLUMN module_count INTEGER`,
  `ALTER TABLE artists ADD COLUMN rating REAL`,
  `ALTER TABLE artists ADD COLUMN rating_count INTEGER`,
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

export default db;
