import React from "react";
import { Box, Text } from "ink";

export type SidebarView = "artists" | "genres" | "search" | "stats";

interface SidebarProps {
  activeView: SidebarView;
  focused: boolean;
}

const NAV_ITEMS: { id: SidebarView; label: string; icon: string }[] = [
  { id: "artists", label: "Artists", icon: "◈" },
  { id: "genres", label: "Genres", icon: "♪" },
  { id: "search", label: "Search", icon: "⌕" },
  { id: "stats", label: "Stats", icon: "◉" },
];

export default function Sidebar({ activeView, focused }: SidebarProps) {
  return (
    <Box
      flexDirection="column"
      width={22}
      borderStyle="single"
      borderColor={focused ? "green" : "gray"}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="green">
          {" "}
          MOD ARCHIVE
        </Text>
      </Box>
      <Text color="gray">──────────────────</Text>

      <Box flexDirection="column" marginTop={1}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <Box key={item.id}>
              <Text
                color={isActive ? "black" : "white"}
                backgroundColor={isActive ? "green" : undefined}
                bold={isActive}
              >
                {" "}
                {item.icon} {item.label.padEnd(14)}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="gray">──────────────────</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" dimColor>
          {" "}
          Tab switch panel
        </Text>
        <Text color="gray" dimColor>
          {" "}
          ↑↓ navigate
        </Text>
        <Text color="gray" dimColor>
          {" "}
          Enter select
        </Text>
        <Text color="gray" dimColor>
          {" "}
          Space play
        </Text>
        <Text color="gray" dimColor>
          {" "}
          S stop
        </Text>
        <Text color="gray" dimColor>
          {" "}
          B back
        </Text>
        <Text color="gray" dimColor>
          {" "}
          Q quit
        </Text>
      </Box>
    </Box>
  );
}
