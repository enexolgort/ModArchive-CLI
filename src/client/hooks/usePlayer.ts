import { useState, useCallback, useRef, useEffect } from "react";
import { spawn, ChildProcess } from "child_process";

export type PlayerStatus = "idle" | "loading" | "playing" | "error";

export interface NowPlaying {
  moduleId: string;
  moduleName: string;
  artistName: string;
  fileName: string;
}

export function usePlayer() {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processRef = useRef<ChildProcess | null>(null);

  const stop = useCallback(() => {
    if (processRef.current) {
      processRef.current.kill("SIGTERM");
      processRef.current = null;
    }
    setStatus("idle");
    setNowPlaying(null);
    setError(null);
  }, []);

  const play = useCallback(
    (
      moduleId: string,
      moduleName: string,
      artistName: string,
      fileName: string,
    ) => {
      if (processRef.current) {
        processRef.current.kill("SIGTERM");
        processRef.current = null;
      }
      setStatus("loading");
      setError(null);

      const url = `https://api.modarchive.org/downloads.php?moduleid=${moduleId}#${fileName}`;

      try {
        const proc = spawn(
          "ffplay",
          ["-nodisp", "-autoexit", "-loglevel", "quiet", url],
          {
            stdio: ["ignore", "ignore", "ignore"],
            detached: false,
          },
        );
        processRef.current = proc;

        proc.on("spawn", () => {
          setStatus("playing");
          setNowPlaying({ moduleId, moduleName, artistName, fileName });
        });
        proc.on("error", () => {
          setStatus("error");
          setError("ffplay not found. Install ffmpeg and add it to PATH.");
          processRef.current = null;
        });
        proc.on("close", (code) => {
          if (code !== null && code !== 0 && code !== 255) {
            setStatus("error");
            setError(`Playback ended (code ${code})`);
          } else {
            setStatus("idle");
            setNowPlaying(null);
          }
          processRef.current = null;
        });
      } catch {
        setStatus("error");
        setError("Failed to start ffplay. Install ffmpeg and add it to PATH.");
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (processRef.current) processRef.current.kill("SIGTERM");
    };
  }, []);

  return { status, nowPlaying, error, play, stop };
}
