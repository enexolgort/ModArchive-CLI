import React from "react";
import { Text } from "ink";

const CHARS = " ▁▂▃▄▅▆▇█";

function barColor(level: number): string {
  if (level > 0.75) return "red";
  if (level > 0.45) return "yellow";
  return "green";
}

/**
 * Groups the source bars (generated at a fixed high resolution) down into
 * `targetCount` display slots by taking the peak within each group — keeps
 * the visualizer punchy rather than blurring peaks into an average, and lets
 * the terminal's actual width decide how many bars are shown.
 */
function downsample(bars: number[], targetCount: number): number[] {
  if (targetCount >= bars.length) return bars;
  const result: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor((i * bars.length) / targetCount);
    const end = Math.max(start + 1, Math.floor(((i + 1) * bars.length) / targetCount));
    let peak = 0;
    for (let j = start; j < end; j++) peak = Math.max(peak, bars[j]);
    result.push(peak);
  }
  return result;
}

export function VisualizerBars({ bars, maxWidth }: { bars: number[]; maxWidth: number }) {
  const displayed = downsample(bars, Math.max(1, maxWidth));
  return (
    <Text>
      {displayed.map((level, i) => {
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
