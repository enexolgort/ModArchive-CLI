import React from "react";
import { Text } from "ink";

export function ProgressBar({ ratio, width = 30 }: { ratio: number; width?: number }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return (
    <Text>
      <Text color="green">{"█".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(width - filled)}</Text>
    </Text>
  );
}
