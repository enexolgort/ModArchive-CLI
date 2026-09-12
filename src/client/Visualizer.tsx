import React from "react";
import { Text } from "ink";

const CHARS = " ▁▂▃▄▅▆▇█";

function barColor(level: number): string {
  if (level > 0.75) return "red";
  if (level > 0.45) return "yellow";
  return "green";
}

export function VisualizerBars({ bars }: { bars: number[] }) {
  return (
    <Text>
      {bars.map((level, i) => {
        const idx = Math.min(CHARS.length - 1, Math.max(0, Math.floor(level * (CHARS.length - 1))));
        return (
          <Text key={i} color={barColor(level)}>
            {CHARS[idx]}
          </Text>
        );
      })}
    </Text>
  );
}
