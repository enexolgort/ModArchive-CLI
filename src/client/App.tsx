import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import * as path from "path";
import * as fs from "fs";
import {
  listArtists,
  listModulesForArtist,
  listGenres,
  listModulesForGenre,
  searchModules,
  listFavorites,
  listAllModulesRandom,
  listFavoriteArtists,
  listFavoriteGenres,
  listDownloaded,
  isFavorite,
  toggleFavorite,
  isFavoriteArtist,
  toggleFavoriteArtist,
  isFavoriteGenre,
  toggleFavoriteGenre,
  listGenreNamesForModule,
  listPlaylists,
  listPlaylistModules,
  createPlaylist,
  deletePlaylist,
  addToPlaylist,
  removeFromPlaylist,
  type Artist,
  type Genre,
  type Playlist,
  type ModuleRow,
} from "./queries";
import { pm, batchConverter } from "./singleton";
import type { PlaybackState } from "./playback-manager";
import type { BatchState } from "./batch-converter";
import { getModulePaths } from "./paths";
import { SelectableList } from "./SelectableList";
import { NowPlayingBar } from "./NowPlayingBar";
import { ProgressBar } from "./ProgressBar";
import { formatBytes, formatGB } from "./format";

function isDownloaded(mod: ModuleRow): boolean {
  return fs.existsSync(getModulePaths(mod).audioPath);
}

type Section =
  | "artists"
  | "favorite-artists"
  | "genres"
  | "favorite-genres"
  | "playlists"
  | "search"
  | "favorites"
  | "all"
  | "downloaded";
type Focus = "sidebar" | "content";

const SIDEBAR_ITEMS: { key: Section; label: string }[] = [
  { key: "artists", label: "Artists" },
  { key: "favorite-artists", label: "Favorite Artists" },
  { key: "genres", label: "Genres" },
  { key: "favorite-genres", label: "Favorite Genres" },
  { key: "playlists", label: "Playlists" },
  { key: "search", label: "Search" },
  { key: "favorites", label: "Favorite Mods" },
  { key: "all", label: "All Mods" },
  { key: "downloaded", label: "Downloaded" },
];

interface ArtistsState {
  query: string;
  selected: number;
  drill: { artistId: string; artistName: string; selected: number } | null;
}

interface GenresState {
  selected: number;
  drill: { genreId: number; genreName: string; selected: number } | null;
}

interface PlaylistsState {
  selected: number;
  drill: { playlistId: number; playlistName: string; selected: number } | null;
}

interface SearchState {
  query: string;
  selected: number;
}

interface PlaylistPickerState {
  moduleId: string;
  selected: number;
  creating: boolean;
  newName: string;
}

type ContentContext =
  | { kind: "artists-list" }
  | { kind: "favorite-artists-list" }
  | { kind: "artists-modules"; artistId: string; artistName: string }
  | { kind: "genres-list" }
  | { kind: "favorite-genres-list" }
  | { kind: "genres-modules"; genreId: number; genreName: string }
  | { kind: "playlists-list" }
  | { kind: "playlists-modules"; playlistId: number; playlistName: string }
  | { kind: "search" }
  | { kind: "favorites" }
  | { kind: "all" }
  | { kind: "downloaded" };

function moduleLabel(m: ModuleRow): string {
  const name = m.module_name || m.file_name;
  const ext = path.extname(m.file_name);
  return `${name}${ext ? `  ${ext}` : ""}`;
}

/**
 * When the currently browsed list is the same set of modules as the shuffled
 * playback queue, show it in queue order instead of the canonical DB order —
 * so shuffling visibly reorders what's on screen, not just future playback.
 */
function reorderByQueue(list: ModuleRow[], queue: ModuleRow[], shuffled: boolean): ModuleRow[] {
  if (!shuffled || list.length === 0 || queue.length !== list.length) return list;
  const listIds = new Set(list.map((m) => m.id));
  if (!queue.every((m) => listIds.has(m.id))) return list;
  return queue;
}

export function App() {
  const { exit } = useApp();

  const [focus, setFocus] = useState<Focus>("sidebar");
  const [section, setSection] = useState<Section>("artists");
  const [sidebarSelected, setSidebarSelected] = useState(0);

  const [artistsState, setArtistsState] = useState<ArtistsState>({
    query: "",
    selected: 0,
    drill: null,
  });
  const [genresState, setGenresState] = useState<GenresState>({
    selected: 0,
    drill: null,
  });
  const [playlistsState, setPlaylistsState] = useState<PlaylistsState>({
    selected: 0,
    drill: null,
  });
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistPicker, setPlaylistPicker] = useState<PlaylistPickerState | null>(null);
  const [searchState, setSearchState] = useState<SearchState>({
    query: "",
    selected: 0,
  });
  const [favoritesSelected, setFavoritesSelected] = useState(0);
  const [allSelected, setAllSelected] = useState(0);
  const [favoriteArtistsSelected, setFavoriteArtistsSelected] = useState(0);
  const [favoriteGenresSelected, setFavoriteGenresSelected] = useState(0);
  const [downloadedSelected, setDownloadedSelected] = useState(0);

  const [playState, setPlayState] = useState<PlaybackState>(pm.getState());
  const [favoritesVersion, setFavoritesVersion] = useState(0);
  const [playlistsVersion, setPlaylistsVersion] = useState(0);
  const [batchState, setBatchState] = useState<BatchState>(batchConverter.getState());

  useEffect(() => {
    const handler = (s: PlaybackState) => setPlayState(s);
    pm.on("change", handler);
    return () => {
      pm.off("change", handler);
    };
  }, []);

  useEffect(() => {
    const handler = (s: BatchState) => setBatchState(s);
    batchConverter.on("change", handler);
    return () => {
      batchConverter.off("change", handler);
    };
  }, []);

  // Total size of everything already downloaded, shown next to the app
  // title. listDownloaded() does a full-catalog scan (~500ms), so it's
  // refreshed periodically rather than on every render — plus immediately
  // whenever a batch conversion finishes, for quicker feedback after a bulk
  // download.
  const [totalDownloadedBytes, setTotalDownloadedBytes] = useState(0);

  useEffect(() => {
    function refresh() {
      setTotalDownloadedBytes(listDownloaded().reduce((sum, d) => sum + d.bytes, 0));
    }
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!batchState.active) {
      setTotalDownloadedBytes(listDownloaded().reduce((sum, d) => sum + d.bytes, 0));
    }
  }, [batchState.active]);

  const ctx: ContentContext = useMemo(() => {
    if (section === "artists" || section === "favorite-artists") {
      if (artistsState.drill) {
        return {
          kind: "artists-modules",
          artistId: artistsState.drill.artistId,
          artistName: artistsState.drill.artistName,
        };
      }
      return { kind: section === "artists" ? "artists-list" : "favorite-artists-list" };
    }
    if (section === "genres" || section === "favorite-genres") {
      if (genresState.drill) {
        return {
          kind: "genres-modules",
          genreId: genresState.drill.genreId,
          genreName: genresState.drill.genreName,
        };
      }
      return { kind: section === "genres" ? "genres-list" : "favorite-genres-list" };
    }
    if (section === "playlists") {
      if (playlistsState.drill) {
        return {
          kind: "playlists-modules",
          playlistId: playlistsState.drill.playlistId,
          playlistName: playlistsState.drill.playlistName,
        };
      }
      return { kind: "playlists-list" };
    }
    if (section === "search") return { kind: "search" };
    if (section === "favorites") return { kind: "favorites" };
    if (section === "downloaded") return { kind: "downloaded" };
    return { kind: "all" };
  }, [section, artistsState.drill, genresState.drill, playlistsState.drill]);

  const downloadedList = useMemo(
    () => (ctx.kind === "downloaded" ? listDownloaded() : []),
    [ctx],
  );
  const downloadedTotalBytes = useMemo(
    () => downloadedList.reduce((sum, d) => sum + d.bytes, 0),
    [downloadedList],
  );

  const items = useMemo((): (Artist | Genre | Playlist | ModuleRow)[] => {
    const reorder = (list: ModuleRow[]) =>
      reorderByQueue(list, playState.queue, playState.shuffled);
    switch (ctx.kind) {
      case "artists-list":
        return listArtists(artistsState.query);
      case "favorite-artists-list":
        return listFavoriteArtists();
      case "artists-modules":
        return reorder(listModulesForArtist(ctx.artistId));
      case "genres-list":
        return listGenres();
      case "favorite-genres-list":
        return listFavoriteGenres();
      case "genres-modules":
        return reorder(listModulesForGenre(ctx.genreId));
      case "playlists-list":
        return listPlaylists();
      case "playlists-modules":
        return reorder(listPlaylistModules(ctx.playlistId));
      case "search":
        return reorder(searchState.query.trim() ? searchModules(searchState.query) : []);
      case "favorites":
        return reorder(listFavorites());
      case "all":
        return reorder(listAllModulesRandom());
      case "downloaded":
        return reorder(downloadedList.map((d) => d.module));
    }
  }, [
    ctx,
    artistsState.query,
    searchState.query,
    favoritesVersion,
    playlistsVersion,
    playState.queue,
    playState.shuffled,
    downloadedList,
  ]);

  function getSelected(): number {
    switch (ctx.kind) {
      case "artists-list":
        return artistsState.selected;
      case "artists-modules":
        return artistsState.drill?.selected ?? 0;
      case "genres-list":
        return genresState.selected;
      case "genres-modules":
        return genresState.drill?.selected ?? 0;
      case "playlists-list":
        return playlistsState.selected;
      case "playlists-modules":
        return playlistsState.drill?.selected ?? 0;
      case "search":
        return searchState.selected;
      case "favorites":
        return favoritesSelected;
      case "all":
        return allSelected;
      case "favorite-artists-list":
        return favoriteArtistsSelected;
      case "favorite-genres-list":
        return favoriteGenresSelected;
      case "downloaded":
        return downloadedSelected;
    }
  }

  function setSelected(n: number) {
    switch (ctx.kind) {
      case "artists-list":
        setArtistsState((s) => ({ ...s, selected: n }));
        return;
      case "artists-modules":
        setArtistsState((s) => (s.drill ? { ...s, drill: { ...s.drill, selected: n } } : s));
        return;
      case "genres-list":
        setGenresState((s) => ({ ...s, selected: n }));
        return;
      case "genres-modules":
        setGenresState((s) => (s.drill ? { ...s, drill: { ...s.drill, selected: n } } : s));
        return;
      case "playlists-list":
        setPlaylistsState((s) => ({ ...s, selected: n }));
        return;
      case "playlists-modules":
        setPlaylistsState((s) => (s.drill ? { ...s, drill: { ...s.drill, selected: n } } : s));
        return;
      case "search":
        setSearchState((s) => ({ ...s, selected: n }));
        return;
      case "favorites":
        setFavoritesSelected(n);
        return;
      case "all":
        setAllSelected(n);
        return;
      case "favorite-artists-list":
        setFavoriteArtistsSelected(n);
        return;
      case "favorite-genres-list":
        setFavoriteGenresSelected(n);
        return;
      case "downloaded":
        setDownloadedSelected(n);
        return;
    }
  }

  const isTextCtx = ctx.kind === "artists-list" || ctx.kind === "search";

  function getQuery(): string {
    if (ctx.kind === "artists-list") return artistsState.query;
    if (ctx.kind === "search") return searchState.query;
    return "";
  }

  function setQuery(q: string) {
    if (ctx.kind === "artists-list") setArtistsState((s) => ({ ...s, query: q, selected: 0 }));
    if (ctx.kind === "search") setSearchState((s) => ({ ...s, query: q, selected: 0 }));
  }

  function playList(list: ModuleRow[], index: number) {
    pm.setQueue(list, index);
    void pm.playIndex(index);
  }

  function handleEnter() {
    const sel = getSelected();
    switch (ctx.kind) {
      case "artists-list":
      case "favorite-artists-list": {
        const artist = (items as Artist[])[sel];
        if (artist) {
          setArtistsState((s) => ({
            ...s,
            drill: { artistId: artist.id, artistName: artist.name, selected: 0 },
          }));
        }
        return;
      }
      case "artists-modules": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
      case "genres-list":
      case "favorite-genres-list": {
        const genre = (items as Genre[])[sel];
        if (genre) {
          setGenresState((s) => ({
            ...s,
            drill: { genreId: genre.id, genreName: genre.name, selected: 0 },
          }));
        }
        return;
      }
      case "genres-modules": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
      case "playlists-list": {
        const playlist = (items as Playlist[])[sel];
        if (playlist) {
          setPlaylistsState((s) => ({
            ...s,
            drill: { playlistId: playlist.id, playlistName: playlist.name, selected: 0 },
          }));
        }
        return;
      }
      case "playlists-modules": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
      case "search": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
      case "favorites": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
      case "all": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
      case "downloaded": {
        const list = items as ModuleRow[];
        if (list[sel]) playList(list, sel);
        return;
      }
    }
  }

  function getSelectedModule(): ModuleRow | null {
    if (
      ctx.kind === "artists-modules" ||
      ctx.kind === "genres-modules" ||
      ctx.kind === "playlists-modules" ||
      ctx.kind === "search" ||
      ctx.kind === "favorites" ||
      ctx.kind === "all" ||
      ctx.kind === "downloaded"
    ) {
      const list = items as ModuleRow[];
      return list[getSelected()] ?? null;
    }
    return null;
  }

  function handleContentEscape() {
    if (ctx.kind === "artists-modules") {
      setArtistsState((s) => ({ ...s, drill: null }));
      return;
    }
    if (ctx.kind === "genres-modules") {
      setGenresState((s) => ({ ...s, drill: null }));
      return;
    }
    if (ctx.kind === "playlists-modules") {
      setPlaylistsState((s) => ({ ...s, drill: null }));
      return;
    }
    setFocus("sidebar");
  }

  function cleanupAndExit() {
    pm.stop();
    exit();
    setTimeout(() => process.exit(0), 50);
  }

  /**
   * `*` favorites whatever is most relevant to the current view: the
   * selected artist/genre while browsing those lists, otherwise the
   * currently playing module (falling back to the selected one).
   */
  function toggleCurrentFavorite() {
    if (ctx.kind === "artists-list" || ctx.kind === "favorite-artists-list") {
      const artist = (items as Artist[])[getSelected()];
      if (artist) toggleFavoriteArtist(artist.id);
    } else if (ctx.kind === "genres-list" || ctx.kind === "favorite-genres-list") {
      const genre = (items as Genre[])[getSelected()];
      if (genre) toggleFavoriteGenre(genre.id);
    } else {
      const mod = playState.module ?? getSelectedModule();
      if (mod) toggleFavorite(mod.id);
    }
    setFavoritesVersion((v) => v + 1);
  }

  useInput((input, key) => {
    // Naming a new playlist and picking one from the add-to-playlist prompt
    // both need to consume every keystroke themselves (letters, backspace,
    // enter, escape) before any of the single-key shortcuts below get a
    // chance to fire on them.
    if (creatingPlaylist) {
      if (key.escape) {
        setCreatingPlaylist(false);
        setNewPlaylistName("");
        return;
      }
      if (key.return) {
        const name = newPlaylistName.trim();
        if (name) {
          const id = createPlaylist(name);
          setPlaylistsVersion((v) => v + 1);
          setPlaylistsState({ selected: 0, drill: { playlistId: id, playlistName: name, selected: 0 } });
        }
        setCreatingPlaylist(false);
        setNewPlaylistName("");
        return;
      }
      if (key.backspace || key.delete) {
        setNewPlaylistName((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setNewPlaylistName((s) => s + input);
      }
      return;
    }

    if (playlistPicker) {
      if (playlistPicker.creating) {
        if (key.escape) {
          setPlaylistPicker((p) => (p ? { ...p, creating: false, newName: "" } : p));
          return;
        }
        if (key.return) {
          const name = playlistPicker.newName.trim();
          if (name) {
            const id = createPlaylist(name);
            addToPlaylist(id, playlistPicker.moduleId);
            setPlaylistsVersion((v) => v + 1);
          }
          setPlaylistPicker(null);
          return;
        }
        if (key.backspace || key.delete) {
          setPlaylistPicker((p) => (p ? { ...p, newName: p.newName.slice(0, -1) } : p));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setPlaylistPicker((p) => (p ? { ...p, newName: p.newName + input } : p));
        }
        return;
      }

      const options = listPlaylists();
      const total = options.length + 1; // +1 for "+ New Playlist"
      if (key.escape) {
        setPlaylistPicker(null);
        return;
      }
      if (key.upArrow) {
        setPlaylistPicker((p) => (p ? { ...p, selected: Math.max(0, p.selected - 1) } : p));
        return;
      }
      if (key.downArrow) {
        setPlaylistPicker((p) =>
          p ? { ...p, selected: Math.min(total - 1, p.selected + 1) } : p,
        );
        return;
      }
      if (key.return) {
        if (playlistPicker.selected === 0) {
          setPlaylistPicker((p) => (p ? { ...p, creating: true, newName: "" } : p));
        } else {
          const playlist = options[playlistPicker.selected - 1];
          if (playlist) {
            addToPlaylist(playlist.id, playlistPicker.moduleId);
            setPlaylistsVersion((v) => v + 1);
          }
          setPlaylistPicker(null);
        }
        return;
      }
      return;
    }

    // Playback controls live on plain keys rather than Ctrl-combos: terminal
    // hosts (VS Code's integrated terminal in particular) intercept
    // Ctrl+N/Ctrl+B/Ctrl+F/Ctrl+R as their own global shortcuts (new file,
    // toggle sidebar, find, reload) before the keystroke ever reaches this
    // app's stdin, so those bindings silently never fire. n/b/r are gated on
    // !isTextCtx (like space and q below) so they still type normally into
    // search boxes. A couple of the old Ctrl+ bindings are kept below as a
    // bonus fallback for terminals that don't swallow them.
    if (input === "n" && !(focus === "content" && isTextCtx)) {
      void pm.next();
      return;
    }
    if (input === "b" && !(focus === "content" && isTextCtx)) {
      void pm.previous();
      return;
    }
    if (input === "*") {
      toggleCurrentFavorite();
      return;
    }
    if (input === "a" && !(focus === "content" && isTextCtx)) {
      const mod = playState.module ?? getSelectedModule();
      if (mod) {
        setPlaylistPicker({ moduleId: mod.id, selected: 0, creating: false, newName: "" });
      }
      return;
    }
    if (input === "+" && ctx.kind === "playlists-list" && focus === "content") {
      setCreatingPlaylist(true);
      setNewPlaylistName("");
      return;
    }
    if (input === "x" && ctx.kind === "playlists-list" && focus === "content") {
      const playlist = (items as Playlist[])[getSelected()];
      if (playlist) {
        deletePlaylist(playlist.id);
        setPlaylistsVersion((v) => v + 1);
        setPlaylistsState((s) => ({ ...s, selected: Math.max(0, s.selected - 1) }));
      }
      return;
    }
    if (input === "x" && ctx.kind === "playlists-modules" && focus === "content") {
      const list = items as ModuleRow[];
      const mod = list[getSelected()];
      if (mod) {
        removeFromPlaylist(ctx.playlistId, mod.id);
        setPlaylistsVersion((v) => v + 1);
      }
      return;
    }
    if (input === "r" && !(focus === "content" && isTextCtx)) {
      pm.shuffle();
      return;
    }
    if (input === "c" && (ctx.kind === "artists-modules" || ctx.kind === "genres-modules")) {
      if (batchState.active) {
        batchConverter.cancel();
      } else {
        const label = ctx.kind === "artists-modules" ? ctx.artistName : ctx.genreName;
        void batchConverter.run(label, items as ModuleRow[]);
      }
      return;
    }
    if (input === "\\") {
      pm.stop();
      return;
    }

    if (key.ctrl && input === "p") {
      pm.togglePause();
      return;
    }
    if (key.ctrl && input === "x") {
      pm.stop();
      return;
    }
    if (key.ctrl && input === "n") {
      void pm.next();
      return;
    }
    if (key.ctrl && input === "b") {
      void pm.previous();
      return;
    }
    if (key.ctrl && input === "f") {
      toggleCurrentFavorite();
      return;
    }
    if (key.ctrl && (input === "c" || input === "q")) {
      cleanupAndExit();
      return;
    }
    if (input === " " && !(focus === "content" && isTextCtx)) {
      pm.togglePause();
      return;
    }

    if (focus === "sidebar") {
      if (input === "q") {
        cleanupAndExit();
        return;
      }
      if (key.upArrow) {
        setSidebarSelected((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSidebarSelected((i) => Math.min(SIDEBAR_ITEMS.length - 1, i + 1));
        return;
      }
      if (key.return || key.rightArrow) {
        setSection(SIDEBAR_ITEMS[sidebarSelected].key);
        setFocus("content");
        return;
      }
      return;
    }

    // focus === "content"
    if (!isTextCtx && input === "q") {
      cleanupAndExit();
      return;
    }

    if (key.leftArrow) {
      setFocus("sidebar");
      return;
    }
    if (key.escape) {
      handleContentEscape();
      return;
    }

    const count = items.length;
    if (key.upArrow) {
      setSelected(Math.max(0, getSelected() - 1));
      return;
    }
    if (key.downArrow) {
      setSelected(Math.min(count - 1, getSelected() + 1));
      return;
    }
    if (key.return) {
      handleEnter();
      return;
    }

    if (isTextCtx) {
      if (key.backspace || key.delete) {
        setQuery(getQuery().slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setQuery(getQuery() + input);
        return;
      }
    }
  });

  function contentTitle(): React.ReactNode {
    switch (ctx.kind) {
      case "artists-list":
        return <Text dimColor>Artists</Text>;
      case "favorite-artists-list":
        return <Text dimColor>Favorite Artists</Text>;
      case "artists-modules":
        return (
          <Text>
            <Text dimColor>Artists › </Text>
            <Text bold color="cyan">
              {ctx.artistName}
            </Text>
          </Text>
        );
      case "genres-list":
        return <Text dimColor>Genres</Text>;
      case "favorite-genres-list":
        return <Text dimColor>Favorite Genres</Text>;
      case "genres-modules":
        return (
          <Text>
            <Text dimColor>Genres › </Text>
            <Text bold color="cyan">
              {ctx.genreName}
            </Text>
          </Text>
        );
      case "playlists-list":
        return <Text dimColor>Playlists</Text>;
      case "playlists-modules":
        return (
          <Text>
            <Text dimColor>Playlists › </Text>
            <Text bold color="cyan">
              {ctx.playlistName}
            </Text>
          </Text>
        );
      case "search":
        return <Text dimColor>Search</Text>;
      case "favorites":
        return <Text dimColor>Favorite Mods</Text>;
      case "all":
        return <Text dimColor>All Mods</Text>;
      case "downloaded":
        return (
          <Text dimColor>
            Downloaded ({downloadedList.length}, {formatBytes(downloadedTotalBytes)})
          </Text>
        );
    }
  }

  function isPlaying(id: string): boolean {
    return playState.module?.id === id && playState.phase !== "idle";
  }

  const selectedIndex = getSelected();

  const drilledName =
    ctx.kind === "artists-modules"
      ? ctx.artistName
      : ctx.kind === "genres-modules"
        ? ctx.genreName
        : ctx.kind === "playlists-modules"
          ? ctx.playlistName
          : null;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Box flexDirection="column">
          <Text>
            <Text bold color="cyan">
              ♫ ModArchive Player
            </Text>
            <Text dimColor>  ({formatGB(totalDownloadedBytes)} downloaded)</Text>
          </Text>
          {drilledName && (
            <Text bold color="cyan">
              {drilledName}
            </Text>
          )}
        </Box>
        {contentTitle()}
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Box
          flexDirection="column"
          width={22}
          marginRight={1}
          borderStyle="round"
          borderColor={focus === "sidebar" ? "cyan" : "gray"}
          paddingX={1}
        >
          {SIDEBAR_ITEMS.map((item, i) => {
            const isActiveSection = section === item.key;
            const isCursor = focus === "sidebar" && sidebarSelected === i;
            return (
              <Text
                key={item.key}
                color={isCursor || isActiveSection ? "cyan" : undefined}
                bold={isCursor || isActiveSection}
                inverse={isCursor}
              >
                {isActiveSection ? "▸ " : "  "}
                {item.label}
              </Text>
            );
          })}
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor={focus === "content" ? "cyan" : "gray"}
          paddingX={1}
        >
          {playlistPicker && (
            <Box flexDirection="column">
              <Text bold color="cyan">
                Add to playlist
              </Text>
              {playlistPicker.creating ? (
                <Box marginTop={1}>
                  <Text>
                    New playlist name: {playlistPicker.newName}
                    <Text color="cyan">_</Text>
                  </Text>
                </Box>
              ) : (
                <Box marginTop={1} flexDirection="column">
                  <Text
                    color={playlistPicker.selected === 0 ? "cyan" : undefined}
                    bold={playlistPicker.selected === 0}
                    inverse={playlistPicker.selected === 0}
                  >
                    {playlistPicker.selected === 0 ? "❯ " : "  "}+ New Playlist
                  </Text>
                  {listPlaylists().map((p, i) => (
                    <Text
                      key={p.id}
                      color={playlistPicker.selected === i + 1 ? "cyan" : undefined}
                      bold={playlistPicker.selected === i + 1}
                      inverse={playlistPicker.selected === i + 1}
                    >
                      {playlistPicker.selected === i + 1 ? "❯ " : "  "}
                      {p.name}
                      <Text dimColor>
                        {"  "}
                        {p.module_count} tracks
                      </Text>
                    </Text>
                  ))}
                </Box>
              )}
              <Box marginTop={1}>
                <Text dimColor>enter select · esc cancel</Text>
              </Box>
            </Box>
          )}

          {!playlistPicker && isTextCtx && (
            <Box marginBottom={1}>
              <Text>
                Search: {getQuery()}
                {focus === "content" && <Text color="cyan">_</Text>}
              </Text>
            </Box>
          )}

          {!playlistPicker && (ctx.kind === "artists-list" || ctx.kind === "favorite-artists-list") && (
            <SelectableList
              items={items as Artist[]}
              selectedIndex={selectedIndex}
              emptyLabel={
                ctx.kind === "favorite-artists-list"
                  ? "No favorite artists yet. Press * on an artist to add one."
                  : "No artists found."
              }
              renderItem={(artist, isSelected) => (
                <Text
                  color={focus === "content" && isSelected ? "cyan" : undefined}
                  bold={focus === "content" && isSelected}
                >
                  {focus === "content" && isSelected ? "❯ " : "  "}
                  {isFavoriteArtist(artist.id) ? <Text color="yellow">★ </Text> : "  "}
                  {artist.name}
                  <Text dimColor>
                    {"  "}
                    {artist.module_count ?? 0} modules
                    {artist.rating ? `, ★${artist.rating.toFixed(1)}` : ""}
                  </Text>
                </Text>
              )}
            />
          )}

          {!playlistPicker &&
            (ctx.kind === "artists-modules" ||
            ctx.kind === "genres-modules" ||
            ctx.kind === "playlists-modules" ||
            ctx.kind === "search" ||
            ctx.kind === "favorites" ||
            ctx.kind === "all" ||
            ctx.kind === "downloaded") && (
            <SelectableList
              items={items as ModuleRow[]}
              selectedIndex={selectedIndex}
              emptyLabel={
                ctx.kind === "search" && !searchState.query.trim()
                  ? "Type to search…"
                  : ctx.kind === "favorites"
                    ? "No favorite mods yet. Press * on a module to add one."
                    : ctx.kind === "downloaded"
                      ? "Nothing downloaded yet. Play or convert a module to cache it."
                      : ctx.kind === "playlists-modules"
                        ? "No tracks yet. Press a on a module elsewhere to add it here."
                        : "No modules found."
              }
              renderItem={(mod, isSelected) => {
                const downloaded = isDownloaded(mod);
                const genres = ctx.kind !== "genres-modules" ? listGenreNamesForModule(mod.id) : [];
                return (
                  <Text
                    color={
                      focus === "content" && isSelected
                        ? "cyan"
                        : !downloaded
                          ? "yellow"
                          : undefined
                    }
                    bold={focus === "content" && isSelected}
                  >
                    {focus === "content" && isSelected ? "❯ " : "  "}
                    {isPlaying(mod.id) ? "♪ " : "  "}
                    {isFavorite(mod.id) ? <Text color="yellow">★ </Text> : "  "}
                    {moduleLabel(mod)}
                    {(ctx.kind === "search" ||
                      ctx.kind === "favorites" ||
                      ctx.kind === "all" ||
                      ctx.kind === "downloaded" ||
                      ctx.kind === "playlists-modules") && (
                      <Text dimColor> — {mod.artist_name}</Text>
                    )}
                    {genres.length > 0 && <Text dimColor>  [{genres.join(", ")}]</Text>}
                  </Text>
                );
              }}
            />
          )}

          {!playlistPicker && ctx.kind === "playlists-list" &&
            (creatingPlaylist ? (
              <Text>
                New playlist name: {newPlaylistName}
                <Text color="cyan">_</Text>
              </Text>
            ) : (
              <SelectableList
                items={items as Playlist[]}
                selectedIndex={selectedIndex}
                emptyLabel="No playlists yet. Press + to create one."
                renderItem={(playlist, isSelected) => (
                  <Text
                    color={focus === "content" && isSelected ? "cyan" : undefined}
                    bold={focus === "content" && isSelected}
                  >
                    {focus === "content" && isSelected ? "❯ " : "  "}
                    {playlist.name}
                    <Text dimColor>
                      {"  "}
                      {playlist.module_count} tracks
                    </Text>
                  </Text>
                )}
              />
            ))}

          {!playlistPicker && (ctx.kind === "genres-list" || ctx.kind === "favorite-genres-list") && (
            <SelectableList
              items={items as Genre[]}
              selectedIndex={selectedIndex}
              emptyLabel={
                ctx.kind === "favorite-genres-list"
                  ? "No favorite genres yet. Press * on a genre to add one."
                  : "No genres found."
              }
              renderItem={(genre, isSelected) => (
                <Text
                  color={focus === "content" && isSelected ? "cyan" : undefined}
                  bold={focus === "content" && isSelected}
                >
                  {focus === "content" && isSelected ? "❯ " : "  "}
                  {isFavoriteGenre(genre.id) ? <Text color="yellow">★ </Text> : "  "}
                  {genre.name}
                  <Text dimColor>
                    {"  "}
                    {genre.module_count} modules
                  </Text>
                </Text>
              )}
            />
          )}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {batchState.active && (
          <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
            <Text color="yellow" bold>
              ⇩ Converting {batchState.label}
              {batchState.current ? ` — ${moduleLabel(batchState.current)}` : ""}
            </Text>
            <Text>
              <ProgressBar ratio={batchState.total ? batchState.done / batchState.total : 0} />
              <Text color="yellow">
                {" "}
                {batchState.done}/{batchState.total} (c to cancel)
              </Text>
            </Text>
          </Box>
        )}
        <NowPlayingBar state={playState} />
        <Text dimColor>
          ←→ pane · ↑↓ move · enter select/play · esc back · space pause · b/n
          prev/next · * favorite · a add to playlist ·{" "}
          <Text color={playState.shuffled ? "red" : undefined} dimColor={!playState.shuffled}>
            r shuffle
          </Text>{" "}
          · \ stop · c convert artist/genre · + new / x delete playlist · ^q quit
        </Text>
      </Box>
    </Box>
  );
}
