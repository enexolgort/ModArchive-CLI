import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getArtists, searchArtists, Artist } from "../hooks/useDb";

interface Props {
  focused: boolean;
  searchQuery: string;
  onSelectArtist: (artist: Artist) => void;
}

const PAGE = 20;

function stars(rating: number | null): string {
  if (!rating) return "☆☆☆☆☆";
  const filled = Math.round(rating / 2);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export default function ArtistList({
  focused,
  searchQuery,
  onSelectArtist,
}: Props) {
  const [items, setItems] = useState<Artist[]>([]);
  const [idx, setIdx] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (searchQuery) {
      setItems(searchArtists(searchQuery, PAGE));
      setIdx(0);
      setOffset(0);
    } else {
      setItems(getArtists(PAGE, offset));
    }
  }, [searchQuery, offset]);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        if (idx > 0) setIdx((i) => i - 1);
        else if (offset > 0 && !searchQuery) {
          setOffset((o) => o - PAGE);
          setIdx(PAGE - 1);
        }
      }
      if (key.downArrow) {
        if (idx < items.length - 1) setIdx((i) => i + 1);
        else if (items.length === PAGE && !searchQuery) {
          setOffset((o) => o + PAGE);
          setIdx(0);
        }
      }
      if (key.return && items[idx]) onSelectArtist(items[idx]);
    },
    { isActive: focused },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          Artists{" "}
        </Text>
        <Text color="gray" dimColor>
          {searchQuery
            ? `search: "${searchQuery}"`
            : `page ${Math.floor(offset / PAGE) + 1}`}
        </Text>
      </Box>

      {items.length === 0 ? (
        <Text color="gray">No artists found.</Text>
      ) : (
        items.map((a, i) => {
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
                {a.name.substring(0, 28).padEnd(28)}
                {"  "}
                <Text color={sel ? "black" : "yellow"}>{stars(a.rating)}</Text>
                {"  "}
                <Text color={sel ? "black" : "gray"}>
                  {String(a.module_count ?? 0).padStart(4)} mods
                </Text>
              </Text>
            </Box>
          );
        })
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Enter → browse modules
        </Text>
      </Box>
    </Box>
  );
}
