import React from "react";
import { Box, Text } from "ink";
import type { PlaybackState } from "./playback-manager";
import { formatTime } from "./format";

function ProgressBar({ ratio, width = 30 }: { ratio: number; width?: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return (
    <Text>
      <Text color="green">{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(width - filled)}</Text>
    </Text>
  );
}

export function NowPlayingBar({ state }: { state: PlaybackState }) {
  const { phase, module } = state;

  if (!module || phase === "idle") {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text dimColor>Nothing playing. Select a module and press Enter.</Text>
      </Box>
    );
  }

  const title = module.module_name || module.file_name;
  const label = `${title} — ${module.artist_name}`;

  let statusLine: React.ReactNode;
  if (phase === "downloading") {
    statusLine = (
      <Text>
        <Text color="yellow">⬇ Downloading </Text>
        <ProgressBar ratio={state.downloadProgress / 100} />
        <Text> {state.downloadProgress}%</Text>
      </Text>
    );
  } else if (phase === "converting") {
    const ratio = state.convertDuration ? state.convertElapsed / state.convertDuration : 0;
    statusLine = (
      <Text>
        <Text color="cyan">🔄 Converting to FLAC </Text>
        <ProgressBar ratio={ratio} />
        <Text>
          {" "}
          {formatTime(state.convertElapsed)}
          {state.convertDuration ? ` / ${formatTime(state.convertDuration)}` : ""}
        </Text>
      </Text>
    );
  } else if (phase === "playing" || phase === "paused") {
    const ratio = state.duration ? state.elapsed / state.duration : 0;
    statusLine = (
      <Text>
        <Text color={phase === "playing" ? "green" : "yellow"}>
          {phase === "playing" ? "▶ " : "⏸ "}
        </Text>
        <ProgressBar ratio={ratio} />
        <Text>
          {" "}
          {formatTime(state.elapsed)} / {formatTime(state.duration)}
        </Text>
      </Text>
    );
  } else if (phase === "error") {
    statusLine = <Text color="red">⚠ Error: {state.error}</Text>;
  }

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
      <Text bold>{label}</Text>
      <Box>{statusLine}</Box>
    </Box>
  );
}
