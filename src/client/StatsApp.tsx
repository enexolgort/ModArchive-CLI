import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  listDownloadedCountsByArtist,
  listDownloadedCountsByGenre,
  listDownloaded,
  listFavorites,
  type DownloadCount,
} from "./queries";
import { SelectableList } from "./SelectableList";
import { ProgressBar } from "./ProgressBar";
import { formatGB } from "./format";

type Panel = "artists" | "genres";
type SortKey = "downloaded" | "favorites";

const NAME_WIDTH = 26;
const MEDALS = ["🥇", "🥈", "🥉"];

function truncate(name: string, width: number): string {
  return name.length > width ? `${name.slice(0, width - 1)}…` : name;
}

function sortRows(rows: DownloadCount[], sortKey: SortKey): DownloadCount[] {
  return [...rows].sort((a, b) => {
    const diff = b[sortKey] - a[sortKey];
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function Column({
  title,
  items,
  sortKey,
  selected,
  focused,
  emptyLabel,
}: {
  title: string;
  items: DownloadCount[];
  sortKey: SortKey;
  selected: number;
  focused: boolean;
  emptyLabel: string;
}) {
  const sorted = useMemo(() => sortRows(items, sortKey), [items, sortKey]);
  const maxValue = sorted.reduce((max, row) => Math.max(max, row[sortKey]), 0);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={1}
    >
      <Text bold color="cyan">
        {title} <Text dimColor>({items.length}, sorted by {sortKey})</Text>
      </Text>
      <Box marginTop={1}>
        <SelectableList
          items={sorted}
          selectedIndex={selected}
          emptyLabel={emptyLabel}
          renderItem={(row, isSelected, index) => {
            const rank = index < MEDALS.length ? MEDALS[index] : String(index + 1).padStart(3, " ") + ".";
            return (
              <Text
                color={focused && isSelected ? "cyan" : undefined}
                bold={(focused && isSelected) || index === 0}
              >
                {rank} {truncate(row.name, NAME_WIDTH).padEnd(NAME_WIDTH)}
                <Text dimColor>  ⬇{String(row.downloaded).padStart(3, " ")}</Text>
                <Text color={row.favorites > 0 ? "yellow" : undefined} dimColor={row.favorites === 0}>
                  {"  ★"}
                  {String(row.favorites).padStart(2, " ")}
                </Text>
                <Text>  </Text>
                <ProgressBar ratio={maxValue ? row[sortKey] / maxValue : 0} width={14} />
              </Text>
            );
          }}
        />
      </Box>
    </Box>
  );
}

export function StatsApp() {
  const { exit } = useApp();
  const [panel, setPanel] = useState<Panel>("artists");
  const [sortKey, setSortKey] = useState<SortKey>("downloaded");
  const [artistSelected, setArtistSelected] = useState(0);
  const [genreSelected, setGenreSelected] = useState(0);

  const byArtist = useMemo(() => listDownloadedCountsByArtist(), []);
  const byGenre = useMemo(() => listDownloadedCountsByGenre(), []);
  const downloaded = useMemo(() => listDownloaded(), []);
  const favorites = useMemo(() => listFavorites(), []);

  const totalBytes = useMemo(() => downloaded.reduce((sum, d) => sum + d.bytes, 0), [downloaded]);
  const artistsRepresented = byArtist.filter((row) => row.downloaded > 0).length;
  const genresRepresented = byGenre.filter((row) => row.downloaded > 0).length;

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    if (key.tab || key.leftArrow || key.rightArrow) {
      setPanel((p) => (p === "artists" ? "genres" : "artists"));
      return;
    }
    if (input === "s") {
      setSortKey((s) => (s === "downloaded" ? "favorites" : "downloaded"));
      return;
    }

    const items = panel === "artists" ? byArtist : byGenre;
    const selected = panel === "artists" ? artistSelected : genreSelected;
    const setSelected = panel === "artists" ? setArtistSelected : setGenreSelected;

    if (key.upArrow) {
      setSelected(Math.max(0, selected - 1));
      return;
    }
    if (key.downArrow) {
      setSelected(Math.min(items.length - 1, selected + 1));
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color="cyan">
          ♫ ModArchive Stats
        </Text>
        <Text dimColor>
          {"  "}
          {downloaded.length} downloaded ({formatGB(totalBytes)}) · {favorites.length} favorited ·{" "}
          {artistsRepresented} artists · {genresRepresented} genres
        </Text>
      </Text>

      <Box marginTop={1} flexDirection="row">
        <Box marginRight={1} flexGrow={1}>
          <Column
            title="By Artist"
            items={byArtist}
            sortKey={sortKey}
            selected={artistSelected}
            focused={panel === "artists"}
            emptyLabel="Nothing downloaded or favorited yet."
          />
        </Box>
        <Box flexGrow={1}>
          <Column
            title="By Genre"
            items={byGenre}
            sortKey={sortKey}
            selected={genreSelected}
            focused={panel === "genres"}
            emptyLabel="Nothing downloaded or favorited yet, or no genre tags."
          />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>←→/tab switch panel · ↑↓ scroll · s sort by {sortKey === "downloaded" ? "favorites" : "downloaded"} · q quit</Text>
      </Box>
    </Box>
  );
}
