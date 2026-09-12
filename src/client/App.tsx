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
  isFavorite,
  toggleFavorite,
  type Artist,
  type Genre,
  type ModuleRow,
} from "./queries";
import { pm, batchConverter } from "./singleton";
import type { PlaybackState } from "./playback-manager";
import type { BatchState } from "./batch-converter";
import { getModulePaths } from "./paths";
import { SelectableList } from "./SelectableList";
import { NowPlayingBar } from "./NowPlayingBar";
import { ProgressBar } from "./ProgressBar";

function isDownloaded(mod: ModuleRow): boolean {
  return fs.existsSync(getModulePaths(mod).audioPath);
}

type Section = "artists" | "genres" | "search" | "favorites" | "all";
type Focus = "sidebar" | "content";

const SIDEBAR_ITEMS: { key: Section; label: string }[] = [
  { key: "artists", label: "Artists" },
  { key: "genres", label: "Genres" },
  { key: "search", label: "Search" },
  { key: "favorites", label: "Favorites" },
  { key: "all", label: "All Mods" },
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

interface SearchState {
  query: string;
  selected: number;
}

type ContentContext =
  | { kind: "artists-list" }
  | { kind: "artists-modules"; artistId: string; artistName: string }
  | { kind: "genres-list" }
  | { kind: "genres-modules"; genreId: number; genreName: string }
  | { kind: "search" }
  | { kind: "favorites" }
  | { kind: "all" };

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
  const [searchState, setSearchState] = useState<SearchState>({
    query: "",
    selected: 0,
  });
  const [favoritesSelected, setFavoritesSelected] = useState(0);
  const [allSelected, setAllSelected] = useState(0);

  const [playState, setPlayState] = useState<PlaybackState>(pm.getState());
  const [favoritesVersion, setFavoritesVersion] = useState(0);
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

  const ctx: ContentContext = useMemo(() => {
    if (section === "artists") {
      return artistsState.drill
        ? {
            kind: "artists-modules",
            artistId: artistsState.drill.artistId,
            artistName: artistsState.drill.artistName,
          }
        : { kind: "artists-list" };
    }
    if (section === "genres") {
      return genresState.drill
        ? {
            kind: "genres-modules",
            genreId: genresState.drill.genreId,
            genreName: genresState.drill.genreName,
          }
        : { kind: "genres-list" };
    }
    if (section === "search") return { kind: "search" };
    if (section === "favorites") return { kind: "favorites" };
    return { kind: "all" };
  }, [section, artistsState.drill, genresState.drill]);

  const items = useMemo((): (Artist | Genre | ModuleRow)[] => {
    const reorder = (list: ModuleRow[]) =>
      reorderByQueue(list, playState.queue, playState.shuffled);
    switch (ctx.kind) {
      case "artists-list":
        return listArtists(artistsState.query);
      case "artists-modules":
        return reorder(listModulesForArtist(ctx.artistId));
      case "genres-list":
        return listGenres();
      case "genres-modules":
        return reorder(listModulesForGenre(ctx.genreId));
      case "search":
        return reorder(searchState.query.trim() ? searchModules(searchState.query) : []);
      case "favorites":
        return reorder(listFavorites());
      case "all":
        return reorder(listAllModulesRandom());
    }
  }, [
    ctx,
    artistsState.query,
    searchState.query,
    favoritesVersion,
    playState.queue,
    playState.shuffled,
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
      case "search":
        return searchState.selected;
      case "favorites":
        return favoritesSelected;
      case "all":
        return allSelected;
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
      case "search":
        setSearchState((s) => ({ ...s, selected: n }));
        return;
      case "favorites":
        setFavoritesSelected(n);
        return;
      case "all":
        setAllSelected(n);
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
      case "artists-list": {
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
      case "genres-list": {
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
    }
  }

  function getSelectedModule(): ModuleRow | null {
    if (
      ctx.kind === "artists-modules" ||
      ctx.kind === "genres-modules" ||
      ctx.kind === "search" ||
      ctx.kind === "favorites" ||
      ctx.kind === "all"
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
    setFocus("sidebar");
  }

  function cleanupAndExit() {
    pm.stop();
    exit();
    setTimeout(() => process.exit(0), 50);
  }

  useInput((input, key) => {
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
      const mod = playState.module ?? getSelectedModule();
      if (mod) {
        toggleFavorite(mod.id);
        setFavoritesVersion((v) => v + 1);
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
      const mod = playState.module ?? getSelectedModule();
      if (mod) {
        toggleFavorite(mod.id);
        setFavoritesVersion((v) => v + 1);
      }
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
      case "genres-modules":
        return (
          <Text>
            <Text dimColor>Genres › </Text>
            <Text bold color="cyan">
              {ctx.genreName}
            </Text>
          </Text>
        );
      case "search":
        return <Text dimColor>Search</Text>;
      case "favorites":
        return <Text dimColor>Favorites</Text>;
      case "all":
        return <Text dimColor>All Mods</Text>;
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
        : null;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Box flexDirection="column">
          <Text bold color="cyan">
            ♫ ModArchive Player
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
          width={16}
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
          {isTextCtx && (
            <Box marginBottom={1}>
              <Text>
                Search: {getQuery()}
                {focus === "content" && <Text color="cyan">_</Text>}
              </Text>
            </Box>
          )}

          {ctx.kind === "artists-list" && (
            <SelectableList
              items={items as Artist[]}
              selectedIndex={selectedIndex}
              emptyLabel="No artists found."
              renderItem={(artist, isSelected) => (
                <Text
                  color={focus === "content" && isSelected ? "cyan" : undefined}
                  bold={focus === "content" && isSelected}
                >
                  {focus === "content" && isSelected ? "❯ " : "  "}
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

          {(ctx.kind === "artists-modules" ||
            ctx.kind === "genres-modules" ||
            ctx.kind === "search" ||
            ctx.kind === "favorites" ||
            ctx.kind === "all") && (
            <SelectableList
              items={items as ModuleRow[]}
              selectedIndex={selectedIndex}
              emptyLabel={
                ctx.kind === "search" && !searchState.query.trim()
                  ? "Type to search…"
                  : ctx.kind === "favorites"
                    ? "No favorites yet. Press * on a module to add one."
                    : "No modules found."
              }
              renderItem={(mod, isSelected) => {
                const downloaded = isDownloaded(mod);
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
                      ctx.kind === "all") && <Text dimColor> — {mod.artist_name}</Text>}
                  </Text>
                );
              }}
            />
          )}

          {ctx.kind === "genres-list" && (
            <SelectableList
              items={items as Genre[]}
              selectedIndex={selectedIndex}
              emptyLabel="No genres found."
              renderItem={(genre, isSelected) => (
                <Text
                  color={focus === "content" && isSelected ? "cyan" : undefined}
                  bold={focus === "content" && isSelected}
                >
                  {focus === "content" && isSelected ? "❯ " : "  "}
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
          prev/next · * favorite ·{" "}
          <Text color={playState.shuffled ? "red" : undefined} dimColor={!playState.shuffled}>
            r shuffle
          </Text>{" "}
          · \ stop · c convert artist/genre · ^q quit
        </Text>
      </Box>
    </Box>
  );
}
