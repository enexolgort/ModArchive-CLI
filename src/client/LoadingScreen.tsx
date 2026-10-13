import React, { useEffect, useState } from "react";
import { Box, Text, useStdout } from "ink";
import { ProgressBar } from "./ProgressBar";
import type { ReconcileProgress } from "./queries";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Figlet "ANSI Shadow" rendering of "MODARCHIVE" — solid block-letter logo
// for wide-enough terminals.
const LOGO_WIDE = String.raw`███╗   ███╗ ██████╗ ██████╗  █████╗ ██████╗  ██████╗██╗  ██╗██╗██╗   ██╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██╔══██╗██╔══██╗██╔════╝██║  ██║██║██║   ██║██╔════╝
██╔████╔██║██║   ██║██║  ██║███████║██████╔╝██║     ███████║██║██║   ██║█████╗
██║╚██╔╝██║██║   ██║██║  ██║██╔══██║██╔══██╗██║     ██╔══██║██║╚██╗ ██╔╝██╔══╝
██║ ╚═╝ ██║╚██████╔╝██████╔╝██║  ██║██║  ██║╚██████╗██║  ██║██║ ╚████╔╝ ███████╗
╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝`;
const LOGO_WIDE_WIDTH = 80;

// Figlet "Small Block" rendering of "MOD ARCHIVE" — compact block-letter
// fallback once the terminal can't fit the wide logo.
const LOGO_COMPACT = String.raw`▙▗▌▞▀▖▛▀▖ ▞▀▖▛▀▖▞▀▖▌ ▌▜▘▌ ▌▛▀▘
▌▘▌▌ ▌▌ ▌ ▙▄▌▙▄▘▌  ▙▄▌▐ ▚▗▘▙▄
▌ ▌▌ ▌▌ ▌ ▌ ▌▌▚ ▌ ▖▌ ▌▐ ▝▞ ▌
▘ ▘▝▀ ▀▀  ▘ ▘▘ ▘▝▀ ▘ ▘▀▘ ▘ ▀▀▘`;

/**
 * Full-screen splash shown at startup while reconcileDownloaded() walks the
 * whole catalog checking which mods are actually on disk — otherwise the
 * terminal just sits there looking frozen for however long that scan takes.
 */
export function LoadingScreen({ label, progress }: { label: string; progress: ReconcileProgress }) {
  const [frame, setFrame] = useState(0);
  const { stdout } = useStdout();

  useEffect(() => {
    const interval = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(interval);
  }, []);

  const { done, total } = progress;
  const ratio = total > 0 ? done / total : 0;
  const pct = Math.round(ratio * 100);
  const columns = stdout.columns || 80;
  const logo = columns >= LOGO_WIDE_WIDTH + 4 ? LOGO_WIDE : LOGO_COMPACT;

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width={columns}
      height={(stdout.rows || 24) - 1}
    >
      <Text bold color="cyan">
        {logo}
      </Text>
      <Text dimColor>♫ Player ♫</Text>
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        borderColor="cyan"
        width={46}
        paddingY={1}
        marginTop={1}
      >
        <Text>
          <Text color="cyan">{SPINNER_FRAMES[frame]}</Text> {label}
        </Text>
        <Box marginTop={1}>
          <ProgressBar ratio={ratio} width={32} />
          <Text dimColor> {String(pct).padStart(3, " ")}%</Text>
        </Box>
        <Text dimColor>
          {total > 0 ? `${done} / ${total} mods checked` : "scanning catalog…"}
        </Text>
      </Box>
    </Box>
  );
}
