import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import { toWindowsPath } from "./paths";

export type PlayerStatus = "playing" | "paused" | "stopped";

// WSLg's PulseAudio bridge to Windows can't sustain real-time throughput over
// long streams: `ffmpeg -f pulse` measurably decays from 1.0x to ~0.5x speed
// within 30 seconds on this setup and eventually drops the connection outright,
// cutting tracks off mid-play. This is true regardless of audio format or
// buffer tuning (both tested). Under WSL, we instead run a native Windows
// process (win-player.ps1) that plays through Windows' own audio stack via
// WSL interop, sidestepping the PulseAudio bridge entirely. ffplay's SDL2
// backend also hangs indefinitely against WSLg's PulseAudio (stream opens but
// never advances), so it's only used outside WSL.
const IS_WSL = !!process.env.WSL_DISTRO_NAME;
const USE_PULSE_OUTPUT = !!process.env.PULSE_SERVER;
// Neither the WSL-interop backend nor a plain ffplay/ffmpeg child process on
// native Windows can be suspended with SIGSTOP/SIGCONT — Windows has no such
// signals, and Node throws ERR_UNKNOWN_SIGNAL if asked to send them. Pause
// there instead kills and relaunches with -ss/-StartSeconds from wherever
// playback had gotten to, same as the WSL-interop backend already did.
const PAUSE_VIA_RELAUNCH = IS_WSL || process.platform === "win32";

const WIN_PLAYER_SCRIPT = toWindowsPathSafe(
  path.join(process.cwd(), "src", "client", "win-player.ps1"),
);

function toWindowsPathSafe(p: string): string | null {
  try {
    return toWindowsPath(p);
  } catch {
    return null;
  }
}

export class Player extends EventEmitter {
  private proc: ChildProcess | null = null;
  private status: PlayerStatus = "stopped";

  // Tracks which backend startProcess() last used, purely to know whether a
  // relaunch (see PAUSE_VIA_RELAUNCH above) should go through the WSL-interop
  // script or a plain ffmpeg/ffplay respawn. The WSL-interop backend has the
  // added wrinkle of no live control channel at all (stdin over the
  // WSL<->Windows interop bridge only reliably delivers the first line to a
  // long-running process — verified empirically), but relaunch-from-offset
  // covers that the same way it covers Windows' lack of SIGSTOP/SIGCONT: the
  // Player tracks its own position rather than relying on the caller to hand
  // it back on resume().
  private usingWindowsInterop = false;
  private currentFilePath: string | null = null;
  private segmentStartOffset = 0;
  private segmentStartedAt = 0;

  play(filePath: string, startOffsetSeconds = 0) {
    this.stop();
    this.currentFilePath = filePath;
    this.segmentStartOffset = startOffsetSeconds;
    this.segmentStartedAt = Date.now();
    this.startProcess(filePath, startOffsetSeconds);
  }

  private startProcess(filePath: string, startOffsetSeconds: number) {
    if (IS_WSL && WIN_PLAYER_SCRIPT) {
      this.usingWindowsInterop = true;
      this.spawnWindowsPlayer(filePath, startOffsetSeconds);
      return;
    }

    this.usingWindowsInterop = false;
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
    this.attach(proc);
  }

  private spawnWindowsPlayer(filePath: string, startOffsetSeconds: number) {
    const winFilePath = toWindowsPathSafe(filePath);
    if (!winFilePath || !WIN_PLAYER_SCRIPT) {
      this.emit("error", new Error("Could not resolve a Windows path for playback"));
      return;
    }

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      WIN_PLAYER_SCRIPT,
      "-Path",
      winFilePath,
    ];
    if (startOffsetSeconds > 0) {
      args.push("-StartSeconds", String(startOffsetSeconds));
    }

    const proc = spawn("powershell.exe", args, { stdio: ["ignore", "pipe", "ignore"] });

    let lastErrorLine = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      const match = chunk.toString().match(/ERROR:.*/);
      if (match) lastErrorLine = match[0].trim();
    });

    this.attach(proc, () => lastErrorLine || undefined);
  }

  private attach(proc: ChildProcess, getErrorDetail?: () => string | undefined) {
    this.proc = proc;
    this.status = "playing";

    proc.on("exit", () => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.status = "stopped";
      const detail = getErrorDetail?.();
      if (detail) {
        this.emit("error", new Error(detail));
      } else {
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

  /** Kills the current process without emitting "end" or "error" for it. */
  private killSilently() {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    proc.removeAllListeners();
    proc.stdout?.removeAllListeners();
    try {
      proc.kill("SIGCONT");
    } catch {}
    proc.kill("SIGKILL");
  }

  pause() {
    if (!this.proc || this.status !== "playing") return;

    if (PAUSE_VIA_RELAUNCH) {
      this.segmentStartOffset += (Date.now() - this.segmentStartedAt) / 1000;
      this.killSilently();
    } else {
      this.proc.kill("SIGSTOP");
    }
    this.status = "paused";
  }

  resume() {
    if (this.status !== "paused") return;

    if (PAUSE_VIA_RELAUNCH) {
      if (!this.currentFilePath) return;
      this.segmentStartedAt = Date.now();
      this.startProcess(this.currentFilePath, this.segmentStartOffset);
    } else {
      this.proc?.kill("SIGCONT");
    }
    this.status = "playing";
  }

  stop() {
    if (this.proc) {
      this.killSilently();
    }
    this.status = "stopped";
    this.currentFilePath = null;
  }

  getStatus(): PlayerStatus {
    return this.status;
  }
}
