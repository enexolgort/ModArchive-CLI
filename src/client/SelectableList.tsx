import React from "react";
import { Box, Text } from "ink";

interface SelectableListProps<T> {
  items: T[];
  selectedIndex: number;
  windowSize?: number;
  renderItem: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  emptyLabel?: string;
}

export function SelectableList<T>({
  items,
  selectedIndex,
  windowSize = 16,
  renderItem,
  emptyLabel = "Nothing to show.",
}: SelectableListProps<T>) {
  if (items.length === 0) {
    return <Text dimColor>{emptyLabel}</Text>;
  }

  const maxStart = Math.max(0, items.length - windowSize);
  const start = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(windowSize / 2), maxStart),
  );
  const visible = items.slice(start, start + windowSize);

  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const index = start + i;
        return <Box key={index}>{renderItem(item, index === selectedIndex, index)}</Box>;
      })}
      {items.length > windowSize && (
        <Text dimColor>
          {"  "}
          {start + 1}-{Math.min(start + windowSize, items.length)} of {items.length}
        </Text>
      )}
    </Box>
  );
}
