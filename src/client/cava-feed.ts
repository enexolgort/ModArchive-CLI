import { spawn, spawnSync, ChildProcess } from "child_process";
import * as fs from "fs";

// Actual playback goes through win-player.ps1 on WSL (see player.ts), which
// bypasses WSLg's PulseAudio bridge entirely — so a `cava` instance running in
// WSL has no `pulse`/`alsa` input it can attach to. Instead this runs a
// second, independent, real-time-paced ffmpeg decode of whatever file is
// currently playing and streams raw PCM into a named pipe; a standalone
// `cava -p cava-modarchive.config` pointed at that pipe renders real,
// audio-reactive bars. It's just a second decode of the same file, decoupled
// from whatever is actually producing sound, so it can drift slightly from
// real playback over a long track.
const FIFO_PATH = "/tmp/modarchive-cava.fifo";
const SAMPLE_RATE = 44100;
const CHANNELS = 2;

function ensureFifo() {
  if (fs.existsSync(FIFO_PATH)) return;
  try {
    spawnSync("mkfifo", [FIFO_PATH]);
  } catch {}
}

export class CavaFeed {
  private proc: ChildProcess | null = null;

  start(audioPath: string, startOffsetSeconds = 0) {
    this.stop();
    ensureFifo();

    const seekArgs = startOffsetSeconds > 0 ? ["-ss", String(startOffsetSeconds)] : [];
    // -re paces the read at the file's own playback rate, so the fifo fills
    // in real time instead of ffmpeg dumping the whole track as fast as it
    // can decode. Opening the fifo for write blocks (in this child process,
    // not in Node) until cava opens it for read — harmless; it just waits.
    const proc = spawn(
      "ffmpeg",
      [
        "-nostdin",
        "-loglevel",
        "error",
        "-re",
        ...seekArgs,
        "-i",
        audioPath,
        "-f",
        "s16le",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        String(CHANNELS),
        "-y",
        FIFO_PATH,
      ],
      { stdio: "ignore" },
    );
    proc.on("exit", () => {
      if (this.proc === proc) this.proc = null;
    });
    proc.on("error", () => {
      if (this.proc === proc) this.proc = null;
    });
    this.proc = proc;
  }

  stop() {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    proc.removeAllListeners();
    try {
      proc.kill("SIGKILL");
    } catch {}
  }
}
