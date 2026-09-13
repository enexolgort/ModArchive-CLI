import * as fs from "fs";
import {
  db,
  addFavorite,
  removeFavorite,
  isFavoriteStmt,
  addFavoriteArtist,
  removeFavoriteArtist,
  isFavoriteArtistStmt,
  addFavoriteGenre,
  removeFavoriteGenre,
  isFavoriteGenreStmt,
  insertPlaylist,
  getPlaylistByName,
  deletePlaylistStmt,
  deletePlaylistModulesStmt,
  addPlaylistModuleStmt,
  removePlaylistModuleStmt,
} from "../db";
import { getModulePaths } from "./paths";

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

export interface Playlist {
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

const listFavoriteArtistsStmt = db.prepare(`
  SELECT a.id, a.name, a.module_count, a.rating, a.rating_count
  FROM favorite_artists fa
  JOIN artists a ON a.id = fa.artist_id
  ORDER BY fa.added_at DESC
`);

export function listFavoriteArtists(): Artist[] {
  return listFavoriteArtistsStmt.all() as Artist[];
}

export function isFavoriteArtist(artistId: string): boolean {
  return isFavoriteArtistStmt.get(artistId) !== undefined;
}

export function toggleFavoriteArtist(artistId: string): boolean {
  if (isFavoriteArtist(artistId)) {
    removeFavoriteArtist.run(artistId);
    return false;
  }
  addFavoriteArtist.run(artistId);
  return true;
}

const listFavoriteGenresStmt = db.prepare(`
  SELECT g.id, g.name, COUNT(mg.module_id) as module_count
  FROM favorite_genres fg
  JOIN genres g ON g.id = fg.genre_id
  LEFT JOIN module_genres mg ON mg.genre_id = g.id
  GROUP BY g.id
  ORDER BY fg.added_at DESC
`);

export function listFavoriteGenres(): Genre[] {
  return listFavoriteGenresStmt.all() as Genre[];
}

export function isFavoriteGenre(genreId: number): boolean {
  return isFavoriteGenreStmt.get(genreId) !== undefined;
}

export function toggleFavoriteGenre(genreId: number): boolean {
  if (isFavoriteGenre(genreId)) {
    removeFavoriteGenre.run(genreId);
    return false;
  }
  addFavoriteGenre.run(genreId);
  return true;
}

const listAllModulesStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM modules m
  JOIN artists a ON a.id = m.artist_id
`);

export interface DownloadedModule {
  module: ModuleRow;
  bytes: number;
}

/** Every module that's already been downloaded and converted to mp3, with file size. */
export function listDownloaded(): DownloadedModule[] {
  const all = listAllModulesStmt.all() as ModuleRow[];
  const result: DownloadedModule[] = [];
  for (const module of all) {
    const { audioPath } = getModulePaths(module);
    try {
      const bytes = fs.statSync(audioPath).size;
      result.push({ module, bytes });
    } catch {
      // Not downloaded — skip.
    }
  }
  return result;
}

const listPlaylistsStmt = db.prepare(`
  SELECT p.id, p.name, COUNT(pm.module_id) as module_count
  FROM playlists p
  LEFT JOIN playlist_modules pm ON pm.playlist_id = p.id
  GROUP BY p.id
  ORDER BY p.created_at DESC
`);

export function listPlaylists(): Playlist[] {
  return listPlaylistsStmt.all() as Playlist[];
}

/** Creates a playlist if the name is new, otherwise returns the existing one's id. */
export function createPlaylist(name: string): number {
  const trimmed = name.trim();
  insertPlaylist.run(trimmed);
  return (getPlaylistByName.get(trimmed) as { id: number }).id;
}

export function deletePlaylist(playlistId: number) {
  deletePlaylistModulesStmt.run(playlistId);
  deletePlaylistStmt.run(playlistId);
}

const listPlaylistModulesStmt = db.prepare(`
  SELECT m.id, m.artist_id, a.name as artist_name, m.file_name, m.module_name, m.md5
  FROM playlist_modules pm
  JOIN modules m ON m.id = pm.module_id
  JOIN artists a ON a.id = m.artist_id
  WHERE pm.playlist_id = ?
  ORDER BY pm.added_at ASC
`);

export function listPlaylistModules(playlistId: number): ModuleRow[] {
  return listPlaylistModulesStmt.all(playlistId) as ModuleRow[];
}

export function addToPlaylist(playlistId: number, moduleId: string) {
  addPlaylistModuleStmt.run(playlistId, moduleId);
}

export function removeFromPlaylist(playlistId: number, moduleId: string) {
  removePlaylistModuleStmt.run(playlistId, moduleId);
}
