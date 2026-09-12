import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

const SAMPLE_RATE = 44100;
// 1024 samples (~43Hz/bin) collapses several of the log-spaced low-frequency
// bars onto the same bin, making bass look pegged/undifferentiated. 8192
// (~5.4Hz/bin) resolves all 64 bars with zero duplicate edges, verified
// against real band-edge output (4096 still had a few dupes at this bar
// count). The window (~186ms) is longer than the tick interval, so
// consecutive ticks overlap — a mild, harmless smoothing effect.
const FFT_SIZE = 8192;
const TICK_MS = 80;
// Generated at a higher resolution than any reasonable terminal width so the
// UI can downsample to fit — decouples analysis resolution from display width
// instead of hardcoding a bar count that overflows narrower terminals.
const BAR_COUNT = 64;
const DECAY = 0.75; // per-tick falloff for bars that aren't re-hit, cava-style "gravity"

/** In-place iterative radix-2 Cooley-Tukey FFT. `real`/`imag` length must be a power of 2. */
function fft(real: Float64Array, imag: Float64Array) {
  const n = real.length;
  if (n <= 1) return;

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = real[i + j];
        const ui = imag[i + j];
        const vr = real[i + j + len / 2] * curWr - imag[i + j + len / 2] * curWi;
        const vi = real[i + j + len / 2] * curWi + imag[i + j + len / 2] * curWr;
        real[i + j] = ur + vr;
        imag[i + j] = ui + vi;
        real[i + j + len / 2] = ur - vr;
        imag[i + j + len / 2] = ui - vi;
        const nwr = curWr * wr - curWi * wi;
        const nwi = curWr * wi + curWi * wr;
        curWr = nwr;
        curWi = nwi;
      }
    }
  }
}

// Log-spaced band edges (bin indices) from ~40Hz to Nyquist, cava-style: narrow
// bins at the bass end, wide grouped bins at the treble end.
function buildBandEdges(): number[] {
  const minFreq = 40;
  const maxFreq = SAMPLE_RATE / 2;
  const edges: number[] = [];
  for (let i = 0; i <= BAR_COUNT; i++) {
    const freq = minFreq * Math.pow(maxFreq / minFreq, i / BAR_COUNT);
    edges.push(Math.min(FFT_SIZE / 2 - 1, Math.round((freq * FFT_SIZE) / SAMPLE_RATE)));
  }
  return edges;
}

const BAND_EDGES = buildBandEdges();

/**
 * Drives a cava-like spectrum visualizer. Since actual playback goes through
 * ffmpeg's pulse output, a native Windows process (WSL), or ffplay — none of
 * which hand samples back to Node — this runs a second, independent decode of
 * the same file paced at real time (`-re`) purely to analyze, entirely
 * decoupled from whatever is actually producing sound. It'll drift slightly
 * from real playback over a long track; that's an acceptable tradeoff for a
 * decorative visualizer.
 */
export class Visualizer extends EventEmitter {
  private proc: ChildProcess | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private bars: number[] = new Array(BAR_COUNT).fill(0);

  start(filePath: string, startOffsetSeconds = 0) {
    this.stop();

    const seekArgs = startOffsetSeconds > 0 ? ["-ss", String(startOffsetSeconds)] : [];
    const proc = spawn(
      "ffmpeg",
      [
        "-re",
        "-nostdin",
        "-loglevel",
        "error",
        ...seekArgs,
        "-i",
        filePath,
        "-f",
        "s16le",
        "-ar",
        String(SAMPLE_RATE),
        "-ac",
        "1",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    this.proc = proc;
    this.buffer = Buffer.alloc(0);
    this.bars = new Array(BAR_COUNT).fill(0);

    proc.stdout?.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      const maxBytes = FFT_SIZE * 2 * 4; // keep a small rolling window
      if (this.buffer.length > maxBytes) {
        this.buffer = this.buffer.subarray(this.buffer.length - maxBytes);
      }
    });
    proc.on("exit", () => {
      if (this.proc === proc) this.proc = null;
    });
    proc.on("error", () => {
      if (this.proc === proc) this.proc = null;
    });

    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick() {
    const neededBytes = FFT_SIZE * 2;
    if (this.buffer.length < neededBytes) {
      // Not enough audio yet — decay existing bars toward silence instead of freezing.
      this.bars = this.bars.map((v) => v * DECAY);
      this.emit("data", this.bars);
      return;
    }

    const window = this.buffer.subarray(this.buffer.length - neededBytes);
    const real = new Float64Array(FFT_SIZE);
    const imag = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      const sample = window.readInt16LE(i * 2) / 32768;
      // Hann window to reduce spectral leakage.
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      real[i] = sample * w;
    }
    fft(real, imag);

    const next: number[] = [];
    for (let b = 0; b < BAR_COUNT; b++) {
      const lo = BAND_EDGES[b];
      const hi = Math.max(lo + 1, BAND_EDGES[b + 1]);
      let peak = 0;
      for (let i = lo; i < hi; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        if (mag > peak) peak = mag;
      }
      // Log-scale amplitude (dB-ish) so quiet passages aren't invisible.
      const db = 20 * Math.log10(peak + 1e-6);
      const normalized = Math.max(0, Math.min(1, (db + 40) / 50));
      next.push(normalized);
    }

    this.bars = this.bars.map((prev, i) => Math.max(next[i], prev * DECAY));
    this.emit("data", this.bars);
  }

  stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.proc) {
      const proc = this.proc;
      this.proc = null;
      proc.removeAllListeners();
      proc.stdout?.removeAllListeners();
      proc.kill("SIGKILL");
    }
    this.bars = new Array(BAR_COUNT).fill(0);
    this.emit("data", this.bars);
  }
}

export { BAR_COUNT };
