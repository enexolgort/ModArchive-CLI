import { spawn } from "child_process";
import * as fs from "fs";
import { AbortedError } from "./downloader";

export function convertToMp3(
  srcPath: string,
  destPath: string,
  onProgress?: (seconds: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }

    const tmpPath = `${destPath}.part.mp3`;
    const proc = spawn("ffmpeg", [
      "-y",
      "-i",
      srcPath,
      "-vn",
      "-codec:a",
      "libmp3lame",
      "-qscale:a",
      "2",
      tmpPath,
    ]);
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      fs.rm(tmpPath, { force: true }, () => {});
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (match) {
        const seconds =
          parseInt(match[1], 10) * 3600 +
          parseInt(match[2], 10) * 60 +
          parseFloat(match[3]);
        onProgress?.(seconds);
      }
    });

    proc.on("error", (err) => finish(() => reject(err)));
    proc.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          fs.renameSync(tmpPath, destPath);
          resolve();
        } else {
          fs.rm(tmpPath, { force: true }, () => {});
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });
    });
  });
}

export function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      filePath,
    ]);

    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const value = parseFloat(stdout.trim());
      resolve(isNaN(value) ? null : value);
    });
  });
}
