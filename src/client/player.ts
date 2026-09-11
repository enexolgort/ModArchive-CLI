import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

export type PlayerStatus = "playing" | "paused" | "stopped";

// ffplay's SDL2 audio backend hangs indefinitely against WSLg's PulseAudio
// server (stream opens but never advances). Talking to Pulse directly through
// ffmpeg's own muxer sidesteps SDL entirely and plays back in real time.
const USE_PULSE_OUTPUT = !!process.env.PULSE_SERVER;

export class Player extends EventEmitter {
  private proc: ChildProcess | null = null;
  private status: PlayerStatus = "stopped";

  play(filePath: string, startOffsetSeconds = 0) {
    this.stop();

    const seekArgs = startOffsetSeconds > 0 ? ["-ss", String(startOffsetSeconds)] : [];
    const proc = USE_PULSE_OUTPUT
      ? spawn(
          "ffmpeg",
          [
            "-nostdin",
            "-loglevel",
            "error",
            ...seekArgs,
            "-i",
            filePath,
            "-f",
            "pulse",
            "modarchive-cli",
          ],
          { stdio: "ignore" },
        )
      : spawn(
          "ffplay",
          ["-nodisp", "-autoexit", "-loglevel", "error", ...seekArgs, filePath],
          { stdio: "ignore" },
        );
    this.proc = proc;
    this.status = "playing";

    proc.on("exit", () => {
      if (this.proc === proc) {
        this.proc = null;
        this.status = "stopped";
        this.emit("end");
      }
    });
    proc.on("error", (err) => {
      if (this.proc === proc) {
        this.proc = null;
        this.status = "stopped";
      }
      this.emit("error", err);
    });
  }

  pause() {
    if (this.proc && this.status === "playing") {
      this.proc.kill("SIGSTOP");
      this.status = "paused";
    }
  }

  resume() {
    if (this.proc && this.status === "paused") {
      this.proc.kill("SIGCONT");
      this.status = "playing";
    }
  }

  stop() {
    if (this.proc) {
      const proc = this.proc;
      this.proc = null;
      this.status = "stopped";
      proc.removeAllListeners();
      // Send SIGCONT first in case it's paused, so SIGKILL is delivered immediately.
      try {
        proc.kill("SIGCONT");
      } catch {}
      proc.kill("SIGKILL");
    }
  }

  getStatus(): PlayerStatus {
    return this.status;
  }
}
