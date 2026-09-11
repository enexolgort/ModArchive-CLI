import * as path from "path";
import type { ModuleRow } from "./queries";

const MODULES_ROOT = path.resolve(process.cwd(), "modules");

export function sanitizeSegment(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "unknown";
}

export interface ModulePaths {
  dir: string;
  rawPath: string;
  audioPath: string;
}

export function getModulePaths(mod: ModuleRow): ModulePaths {
  const artistDir = sanitizeSegment(mod.artist_name);
  const baseName = sanitizeSegment(mod.module_name || mod.file_name);
  const ext = path.extname(mod.file_name) || "";
  const dir = path.join(MODULES_ROOT, artistDir);

  return {
    dir,
    rawPath: path.join(dir, `${baseName}${ext}`),
    // Testing whether mp3 avoids the WSLg/PulseAudio drop-outs seen with flac.
    audioPath: path.join(dir, `${baseName}.mp3`),
  };
}
