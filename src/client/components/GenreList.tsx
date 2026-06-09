import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { getGenres, Genre } from "../hooks/useDb";

interface Props {
  focused: boolean;
  onSelectGenre: (genre: Genre) => void;
}

export default function GenreList({ focused, onSelectGenre }: Props) {
  const [items, setItems] = useState<Genre[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setItems(getGenres());
  }, []);

  useInput(
    (input, key) => {
      if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
      if (key.downArrow) setIdx((i) => Math.min(items.length - 1, i + 1));
      if (key.return && items[idx]) onSelectGenre(items[idx]);
    },
    { isActive: focused },
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          Genres
        </Text>
      </Box>
      <Box flexWrap="wrap">
        {items.map((g, i) => {
          const sel = i === idx;
          return (
            <Box key={g.id} marginRight={1} marginBottom={0}>
              <Text
                color={sel ? "black" : "cyan"}
                backgroundColor={
                  sel && focused ? "green" : sel ? "gray" : undefined
                }
              >
                {` ${g.name} (${g.module_count ?? 0}) `}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate Enter browse modules
        </Text>
      </Box>
    </Box>
  );
}
