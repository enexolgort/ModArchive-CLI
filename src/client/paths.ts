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
    audioPath: path.join(dir, `${baseName}.mp3`),
  };
}

/**
 * Converts an absolute WSL path to the `\\wsl.localhost\<Distro>\...` UNC form
 * a native Windows process can open directly over the WSL interop bridge.
 */
export function toWindowsPath(linuxPath: string): string {
  const distro = process.env.WSL_DISTRO_NAME;
  if (!distro) {
    throw new Error("WSL_DISTRO_NAME is not set; cannot resolve a Windows path for this WSL distro");
  }
  return `\\\\wsl.localhost\\${distro}${linuxPath.replace(/\//g, "\\")}`;
}
