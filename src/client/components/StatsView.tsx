import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { getStats, Artist } from "../hooks/useDb";

export default function StatsView() {
  const [stats, setStats] = useState<{
    artistCount: number;
    moduleCount: number;
    genreCount: number;
    topRated: Artist[];
  } | null>(null);

  useEffect(() => {
    setStats(getStats());
  }, []);

  if (!stats) return <Text color="gray">Loading...</Text>;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          Database Stats
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={2}>
        <Box gap={2}>
          <Text color="gray">Artists:</Text>
          <Text bold>{stats.artistCount.toLocaleString()}</Text>
        </Box>
        <Box gap={2}>
          <Text color="gray">Modules:</Text>
          <Text bold>{stats.moduleCount.toLocaleString()}</Text>
        </Box>
        <Box gap={2}>
          <Text color="gray">Genres: </Text>
          <Text bold>{stats.genreCount.toLocaleString()}</Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text bold color="green">
          Top Rated Artists
        </Text>
      </Box>
      {stats.topRated.map((a, i) => {
        const filled = Math.round((a.rating ?? 0) / 2);
        const s = "★".repeat(filled) + "☆".repeat(5 - filled);
        return (
          <Box key={a.id} gap={2}>
            <Text color="gray">{String(i + 1).padStart(2)}.</Text>
            <Text>{a.name.substring(0, 28).padEnd(28)}</Text>
            <Text color="yellow">{s}</Text>
            <Text color="gray">
              {a.rating?.toFixed(1)} ({a.rating_count} ratings)
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
