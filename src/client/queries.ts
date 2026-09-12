import { db, addFavorite, removeFavorite, isFavoriteStmt } from "../db";

export interface Artist {
  id: string;
  name: string;
  module_count: number | null;
  rating: number | null;
  rating_count: number | null;
}

export interface Genre {
  id: number;
  name: string;
  module_count: number;
}

export interface ModuleRow {
  id: string;
  artist_id: string;
  artist_name: string;
  file_name: string;
  module_name: string | null;
  md5: string | null;
}

const listArtistsStmt = db.prepare(`
  SELECT id, name, module_count, rating, rating_count
  FROM artists
  WHERE name LIKE ?
  ORDER BY name COLLATE NOCASE
`);

export function listArtists(search = ""): Artist[] {
  return listArtistsStmt.all(`%${search}%`) as Artist[];
}

const listModulesForArtistStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM modules m
  JOIN artists a ON a.id = m.artist_id
  WHERE m.artist_id = ?
  ORDER BY COALESCE(m.module_name, m.file_name) COLLATE NOCASE
`);

export function listModulesForArtist(artistId: string): ModuleRow[] {
  return listModulesForArtistStmt.all(artistId) as ModuleRow[];
}

const searchModulesStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM modules m
  JOIN artists a ON a.id = m.artist_id
  WHERE m.module_name LIKE ? OR m.file_name LIKE ?
  ORDER BY COALESCE(m.module_name, m.file_name) COLLATE NOCASE
`);

export function searchModules(query: string): ModuleRow[] {
  const pattern = `%${query}%`;
  return searchModulesStmt.all(pattern, pattern) as ModuleRow[];
}

const listAllModulesRandomStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM modules m
  JOIN artists a ON a.id = m.artist_id
  ORDER BY RANDOM()
`);

/** Every module across the whole catalog, in a fresh random order each call. */
export function listAllModulesRandom(): ModuleRow[] {
  return listAllModulesRandomStmt.all() as ModuleRow[];
}

const listGenresStmt = db.prepare(`
  SELECT g.id, g.name, COUNT(mg.module_id) as module_count
  FROM genres g
  JOIN module_genres mg ON mg.genre_id = g.id
  GROUP BY g.id
  ORDER BY g.name COLLATE NOCASE
`);

export function listGenres(): Genre[] {
  return listGenresStmt.all() as Genre[];
}

const listModulesForGenreStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM modules m
  JOIN artists a ON a.id = m.artist_id
  JOIN module_genres mg ON mg.module_id = m.id
  WHERE mg.genre_id = ?
  ORDER BY COALESCE(m.module_name, m.file_name) COLLATE NOCASE
`);

export function listModulesForGenre(genreId: number): ModuleRow[] {
  return listModulesForGenreStmt.all(genreId) as ModuleRow[];
}

const listFavoritesStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM favorites f
  JOIN modules m ON m.id = f.module_id
  JOIN artists a ON a.id = m.artist_id
  ORDER BY f.added_at DESC
`);

export function listFavorites(): ModuleRow[] {
  return listFavoritesStmt.all() as ModuleRow[];
}

export function isFavorite(moduleId: string): boolean {
  return isFavoriteStmt.get(moduleId) !== undefined;
}

export function toggleFavorite(moduleId: string): boolean {
  if (isFavorite(moduleId)) {
    removeFavorite.run(moduleId);
    return false;
  }
  addFavorite.run(moduleId);
  return true;
}
