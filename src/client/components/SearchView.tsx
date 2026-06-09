import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { searchArtists, searchModules, Artist, Module } from "../hooks/useDb";
import { NowPlaying } from "../hooks/usePlayer";

interface Props {
  focused: boolean;
  nowPlaying: NowPlaying | null;
  onSelectArtist: (artist: Artist) => void;
  onPlay: (id: string, name: string, artist: string, file: string) => void;
}

type Mode = "input" | "results";
type Tab = "artists" | "modules";

export default function SearchView({
  focused,
  nowPlaying,
  onSelectArtist,
  onPlay,
}: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("input");
  const [tab, setTab] = useState<Tab>("artists");
  const [artistResults, setArtistResults] = useState<Artist[]>([]);
  const [moduleResults, setModuleResults] = useState<
    (Module & { artist_name: string })[]
  >([]);
  const [idx, setIdx] = useState(0);

  useInput(
    (input, key) => {
      if (mode === "input") {
        if (key.return) {
          if (!query.trim()) return;
          setArtistResults(searchArtists(query, 30));
          setModuleResults(searchModules(query, 30));
          setMode("results");
          setIdx(0);
          return;
        }
        if (key.backspace || key.delete) {
          setQuery((q) => q.slice(0, -1));
          return;
        }
        if (key.escape) {
          setQuery("");
          return;
        }
        if (input && !key.ctrl && !key.meta && input.length === 1)
          setQuery((q) => q + input);
      } else {
        if (key.escape) {
          setMode("input");
          return;
        }
        if (key.tab) {
          setTab((t) => (t === "artists" ? "modules" : "artists"));
          setIdx(0);
          return;
        }
        if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
        if (key.downArrow) {
          const max =
            (tab === "artists" ? artistResults : moduleResults).length - 1;
          setIdx((i) => Math.min(max, i + 1));
        }
        if (key.return || input === " ") {
          if (tab === "artists" && artistResults[idx]) {
            onSelectArtist(artistResults[idx]);
          } else if (tab === "modules" && moduleResults[idx]) {
            const m = moduleResults[idx];
            onPlay(
              m.id,
              m.module_name ?? m.file_name,
              m.artist_name,
              m.file_name,
            );
          }
        }
      }
    },
    { isActive: focused },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          Search
        </Text>
      </Box>

      <Box
        marginBottom={1}
        borderStyle="single"
        borderColor={mode === "input" && focused ? "green" : "gray"}
        paddingX={1}
      >
        <Text color="gray">⌕ </Text>
        <Text color="white">{query}</Text>
        {mode === "input" && focused && <Text color="green">█</Text>}
        {!query && (
          <Text color="gray" dimColor>
            {" "}
            type and press Enter...
          </Text>
        )}
      </Box>

      {mode === "results" && (
        <>
          <Box marginBottom={1} gap={2}>
            <Text
              color={tab === "artists" ? "black" : "white"}
              backgroundColor={tab === "artists" ? "green" : undefined}
            >
              {` Artists (${artistResults.length}) `}
            </Text>
            <Text
              color={tab === "modules" ? "black" : "white"}
              backgroundColor={tab === "modules" ? "green" : undefined}
            >
              {` Modules (${moduleResults.length}) `}
            </Text>
            <Text color="gray" dimColor>
              Tab switch
            </Text>
          </Box>

          {tab === "artists" &&
            artistResults.map((a, i) => {
              const sel = i === idx;
              return (
                <Box key={a.id}>
                  <Text
                    color={sel ? "black" : "white"}
                    backgroundColor={
                      sel && focused ? "green" : sel ? "gray" : undefined
                    }
                  >
                    {sel ? " ▶ " : "   "}
                    {a.name.substring(0, 30).padEnd(30)}
                    {"  "}
                    <Text color={sel ? "black" : "gray"}>
                      {a.module_count ?? 0} mods
                    </Text>
                  </Text>
                </Box>
              );
            })}

          {tab === "modules" &&
            moduleResults.map((m, i) => {
              const sel = i === idx;
              const playing = nowPlaying?.moduleId === m.id;
              return (
                <Box key={m.id}>
                  <Text
                    color={sel ? "black" : playing ? "green" : "white"}
                    backgroundColor={
                      sel && focused ? "green" : sel ? "gray" : undefined
                    }
                  >
                    {playing ? " ♫ " : sel ? " ▶ " : "   "}
                    {(m.module_name ?? m.file_name).substring(0, 32).padEnd(32)}
                    {"  "}
                    <Text color={sel ? "black" : "gray"}>
                      {m.artist_name.substring(0, 20)}
                    </Text>
                  </Text>
                </Box>
              );
            })}

          <Box marginTop={1}>
            <Text color="gray" dimColor>
              Esc back ↑↓ navigate Tab switch Enter/Space select
            </Text>
          </Box>
        </>
      )}
      {mode === "input" && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Type to search, Enter to confirm, Esc to clear
          </Text>
        </Box>
      )}
    </Box>
  );
}
