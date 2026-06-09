import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { NowPlaying, PlayerStatus } from "../hooks/usePlayer";

interface Props {
  nowPlaying: NowPlaying | null;
  status: PlayerStatus;
  error: string | null;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export default function NowPlayingBar({ nowPlaying, status, error }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (status === "loading" || status === "playing") {
      const t = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
      return () => clearInterval(t);
    }
  }, [status]);

  return (
    <Box
      borderStyle="single"
      borderColor={
        status === "playing" ? "green" : status === "error" ? "red" : "gray"
      }
      paddingX={1}
      height={3}
    >
      {status === "idle" && (
        <Text color="gray" dimColor>
          ◉ Nothing playing — navigate to a module and press Space
        </Text>
      )}
      {status === "loading" && (
        <Text color="yellow">{FRAMES[frame]} Loading...</Text>
      )}
      {status === "playing" && nowPlaying && (
        <Box gap={1}>
          <Text color="green">{FRAMES[frame]}</Text>
          <Text color="green" bold>
            ♫
          </Text>
          <Text color="white" bold>
            {nowPlaying.moduleName.substring(0, 40)}
          </Text>
          <Text color="gray">by</Text>
          <Text color="cyan">{nowPlaying.artistName.substring(0, 24)}</Text>
          <Text color="gray" dimColor>
            {" "}
            [S] stop
          </Text>
        </Box>
      )}
      {status === "error" && (
        <Text color="red">✗ {error?.substring(0, 100)}</Text>
      )}
    </Box>
  );
}
