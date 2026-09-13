import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
import type { ClientRequest } from "http";

const DOWNLOAD_BASE = "https://api.modarchive.org/downloads.php?moduleid=";

// ModArchive's servers reset connections mid-download regularly enough that
// the scraper (src/scraper.ts) already retries on this — same treatment here,
// since without it every transient reset surfaced as a hard error requiring
// the user to manually re-select the track.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const RETRYABLE_CODES = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortedError";
  }
}

export async function downloadModule(
  moduleId: string,
  destPath: string,
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  // Unique per call, not just per destPath — see the matching comment in
  // converter.ts: the same module can get downloaded from two call sites
  // at once (playback + a batch convert), and a shared deterministic tmp
  // name let one call's abort-cleanup delete the other's in-progress file.
  const tmpPath = `${destPath}.${process.pid}-${crypto.randomUUID()}.part`;

  let retries = MAX_RETRIES;
  for (;;) {
    try {
      await attemptDownload(moduleId, destPath, tmpPath, onProgress, signal);
      return;
    } catch (err: any) {
      if (err instanceof AbortedError) throw err;
      if (retries > 0 && RETRYABLE_CODES.includes(err?.code)) {
        retries--;
        await sleep(RETRY_DELAY_MS);
        if (signal?.aborted) throw new AbortedError();
        continue;
      }
      throw err;
    }
  }
}

function attemptDownload(
  moduleId: string,
  destPath: string,
  tmpPath: string,
  onProgress: ((receivedBytes: number, totalBytes: number | null) => void) | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }

    let activeReq: ClientRequest | null = null;
    let activeFileStream: fs.WriteStream | null = null;
    let settled = false;

    const cleanupTmp = () => fs.rm(tmpPath, { force: true }, () => {});

    const onAbort = () => {
      if (settled) return;
      settled = true;
      activeReq?.destroy();
      activeFileStream?.destroy();
      cleanupTmp();
      reject(new AbortedError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn();
    };

    const get = (url: string, redirectsLeft: number) => {
      const client = url.startsWith("https") ? https : http;
      const req = client.get(
        url,
        { headers: { "User-Agent": "ModArchive-CLI/1.0" } },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            if (redirectsLeft <= 0) {
              finish(() => reject(new Error("Too many redirects")));
              return;
            }
            const location = res.headers.location;
            const redirectUrl = location.startsWith("http")
              ? location
              : new URL(location, url).href;
            res.resume();
            get(redirectUrl, redirectsLeft - 1);
            return;
          }

          if (res.statusCode !== 200) {
            finish(() =>
              reject(new Error(`HTTP ${res.statusCode} downloading module ${moduleId}`)),
            );
            return;
          }

          const totalBytes = res.headers["content-length"]
            ? parseInt(res.headers["content-length"], 10)
            : null;
          let received = 0;

          const fileStream = fs.createWriteStream(tmpPath);
          activeFileStream = fileStream;
          res.on("data", (chunk: Buffer) => {
            received += chunk.length;
            onProgress?.(received, totalBytes);
          });
          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close(() => {
              finish(() => {
                fs.renameSync(tmpPath, destPath);
                resolve();
              });
            });
          });

          fileStream.on("error", (err) => {
            finish(() => {
              cleanupTmp();
              reject(err);
            });
          });
        },
      );
      activeReq = req;

      req.setTimeout(30000, () => {
        req.destroy();
        finish(() => reject(new Error(`Timeout downloading module ${moduleId}`)));
      });
      req.on("error", (err) => {
        finish(() => {
          cleanupTmp();
          reject(err);
        });
      });
    };

    get(`${DOWNLOAD_BASE}${moduleId}`, 5);
  });
}
