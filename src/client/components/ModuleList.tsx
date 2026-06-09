import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getModulesByArtist, getModulesByGenre, Module } from "../hooks/useDb";
import { NowPlaying } from "../hooks/usePlayer";

interface Props {
  focused: boolean;
  artistId?: string;
  artistName?: string;
  genreId?: number;
  genreName?: string;
  nowPlaying: NowPlaying | null;
  onPlay: (id: string, name: string, artist: string, file: string) => void;
  onBack: () => void;
}

const PAGE = 20;

export default function ModuleList({
  focused,
  artistId,
  artistName,
  genreId,
  genreName,
  nowPlaying,
  onPlay,
  onBack,
}: Props) {
  const [items, setItems] = useState<(Module & { artist_name?: string })[]>([]);
  const [idx, setIdx] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setIdx(0);
    setOffset(0);
  }, [artistId, genreId]);

  useEffect(() => {
    if (artistId) setItems(getModulesByArtist(artistId, PAGE, offset));
    else if (genreId !== undefined)
      setItems(getModulesByGenre(genreId, PAGE, offset));
  }, [artistId, genreId, offset]);

  useInput(
    (input, key) => {
      if (key.escape || input === "b" || input === "B") {
        onBack();
        return;
      }
      if (key.upArrow) {
        if (idx > 0) setIdx((i) => i - 1);
        else if (offset > 0) {
          setOffset((o) => o - PAGE);
          setIdx(PAGE - 1);
        }
      }
      if (key.downArrow) {
        if (idx < items.length - 1) setIdx((i) => i + 1);
        else if (items.length === PAGE) {
          setOffset((o) => o + PAGE);
          setIdx(0);
        }
      }
      if ((key.return || input === " ") && items[idx]) {
        const m = items[idx];
        onPlay(
          m.id,
          m.module_name ?? m.file_name,
          artistName ?? m.artist_name ?? "Unknown",
          m.file_name,
        );
      }
    },
    { isActive: focused },
  );

  const title = artistName ? `◈ ${artistName}` : `♪ ${genreName}`;
  const page = Math.floor(offset / PAGE) + 1;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="green">
          {title}
        </Text>
        <Text color="gray" dimColor>
          page {page}
        </Text>
        <Text color="gray" dimColor>
          [B/Esc] back
        </Text>
      </Box>

      {items.length === 0 ? (
        <Text color="gray">No modules found.</Text>
      ) : (
        items.map((m, i) => {
          const sel = i === idx;
          const playing = nowPlaying?.moduleId === m.id;
          const name = (m.module_name ?? m.file_name)
            .substring(0, 36)
            .padEnd(36);
          const sub = (
            genreId !== undefined ? (m.artist_name ?? "") : m.file_name
          )
            .substring(0, 22)
            .padEnd(22);
          return (
            <Box key={m.id}>
              <Text
                color={sel ? "black" : playing ? "green" : "white"}
                backgroundColor={
                  sel && focused ? "green" : sel ? "gray" : undefined
                }
              >
                {playing ? " ♫ " : sel ? " ▶ " : "   "}
                {name}
                {"  "}
                <Text color={sel ? "black" : "gray"}>{sub}</Text>
              </Text>
            </Box>
          );
        })
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Space/Enter play B back ↑↓ navigate
        </Text>
      </Box>
    </Box>
  );
}
