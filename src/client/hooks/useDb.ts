import Database from "better-sqlite3";
import path from "path";

const db = new Database(path.resolve(process.cwd(), "scraper.db"), {
  readonly: true,
});

export interface Artist {
  id: string;
  name: string;
  module_count: number | null;
  rating: number | null;
  rating_count: number | null;
}

export interface Module {
  id: string;
  artist_id: string;
  file_name: string;
  module_name: string | null;
  md5: string | null;
}

export interface Genre {
  id: number;
  name: string;
  module_count?: number;
}

export function getArtists(limit = 50, offset = 0): Artist[] {
  return db
    .prepare(`SELECT * FROM artists ORDER BY name ASC LIMIT ? OFFSET ?`)
    .all(limit, offset) as Artist[];
}

export function searchArtists(query: string, limit = 50): Artist[] {
  return db
    .prepare(
      `SELECT * FROM artists WHERE name LIKE ? ORDER BY name ASC LIMIT ?`,
    )
    .all(`%${query}%`, limit) as Artist[];
}

export function getModulesByArtist(
  artistId: string,
  limit = 100,
  offset = 0,
): Module[] {
  return db
    .prepare(
      `SELECT * FROM modules WHERE artist_id = ? ORDER BY file_name ASC LIMIT ? OFFSET ?`,
    )
    .all(artistId, limit, offset) as Module[];
}

export function getGenres(): Genre[] {
  return db
    .prepare(
      `SELECT g.*, COUNT(mg.module_id) as module_count
       FROM genres g
       LEFT JOIN module_genres mg ON g.id = mg.genre_id
       GROUP BY g.id ORDER BY module_count DESC`,
    )
    .all() as Genre[];
}

export function getModulesByGenre(
  genreId: number,
  limit = 50,
  offset = 0,
): (Module & { artist_name: string })[] {
  return db
    .prepare(
      `SELECT m.*, a.name as artist_name
       FROM modules m
       JOIN module_genres mg ON m.id = mg.module_id
       JOIN artists a ON m.artist_id = a.id
       WHERE mg.genre_id = ?
       ORDER BY m.file_name ASC LIMIT ? OFFSET ?`,
    )
    .all(genreId, limit, offset) as (Module & { artist_name: string })[];
}

export function searchModules(
  query: string,
  limit = 50,
): (Module & { artist_name: string })[] {
  return db
    .prepare(
      `SELECT m.*, a.name as artist_name
       FROM modules m
       JOIN artists a ON m.artist_id = a.id
       WHERE m.module_name LIKE ? OR m.file_name LIKE ?
       ORDER BY m.module_name ASC LIMIT ?`,
    )
    .all(`%${query}%`, `%${query}%`, limit) as (Module & {
    artist_name: string;
  })[];
}

export function getStats() {
  const artistCount = (
    db.prepare(`SELECT COUNT(*) as c FROM artists`).get() as { c: number }
  ).c;
  const moduleCount = (
    db.prepare(`SELECT COUNT(*) as c FROM modules`).get() as { c: number }
  ).c;
  const genreCount = (
    db.prepare(`SELECT COUNT(*) as c FROM genres`).get() as { c: number }
  ).c;
  const topRated = db
    .prepare(
      `SELECT * FROM artists WHERE rating IS NOT NULL AND rating_count > 0 ORDER BY rating DESC LIMIT 8`,
    )
    .all() as Artist[];
  return { artistCount, moduleCount, genreCount, topRated };
}
