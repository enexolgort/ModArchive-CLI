import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import type { ClientRequest } from "http";

const DOWNLOAD_BASE = "https://api.modarchive.org/downloads.php?moduleid=";

export class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortedError";
  }
}

export function downloadModule(
  moduleId: string,
  destPath: string,
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tmpPath = `${destPath}.part`;

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
