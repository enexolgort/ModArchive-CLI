import { EventEmitter } from "events";
import * as fs from "fs";
import type { ModuleRow } from "./queries";
import { getModulePaths } from "./paths";
import { downloadModule, AbortedError } from "./downloader";
import { convertToMp3, probeDuration } from "./converter";
import { Player } from "./player";

export type PlaybackPhase =
  | "idle"
  | "downloading"
  | "converting"
  | "playing"
  | "paused"
  | "error";

export interface PlaybackState {
  phase: PlaybackPhase;
  module: ModuleRow | null;
  downloadProgress: number;
  convertElapsed: number;
  convertDuration: number | null;
  elapsed: number;
  duration: number | null;
  error?: string;
  queue: ModuleRow[];
  shuffled: boolean;
}

const initialState: PlaybackState = {
  phase: "idle",
  module: null,
  downloadProgress: 0,
  convertElapsed: 0,
  convertDuration: null,
  elapsed: 0,
  duration: null,
  queue: [],
  shuffled: false,
};

export class PlaybackManager extends EventEmitter {
  private player = new Player();
  private state: PlaybackState = { ...initialState };
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private queue: ModuleRow[] = [];
  private originalQueue: ModuleRow[] = [];
  private queueIndex = -1;
  private playToken = 0;
  private abortController: AbortController | null = null;
  private playStartedAt = 0;
  private segmentBaseOffset = 0;
  private dropRetryCount = 0;
  private static readonly MAX_DROP_RETRIES = 3;
  private static readonly END_TOLERANCE_SECONDS = 2;

  constructor() {
    super();
    this.player.on("end", () => {
      const token = this.playToken;
      this.stopElapsedTimer();

      // WSLg's PulseAudio RDP sink intermittently drops its connection to the
      // Windows host mid-stream, killing ffmpeg early — anywhere in the track,
      // not just at the start. Compare actual wall-clock playtime against the
      // known duration to tell a genuine drop apart from the track finishing,
      // and resume with -ss from where it left off instead of restarting or
      // silently skipping to the next track.
      const audioPath = this.state.module ? getModulePaths(this.state.module).audioPath : null;
      const playedNow =
        this.segmentBaseOffset + (Date.now() - this.playStartedAt) / 1000;
      const expected = this.state.duration;
      const droppedEarly =
        audioPath !== null &&
        expected !== null &&
        expected - playedNow > PlaybackManager.END_TOLERANCE_SECONDS;

      if (droppedEarly && this.dropRetryCount < PlaybackManager.MAX_DROP_RETRIES) {
        this.dropRetryCount++;
        this.setState({
          phase: "error",
          error: `Audio device dropped the stream at ${Math.floor(playedNow)}s — resuming (${this.dropRetryCount}/${PlaybackManager.MAX_DROP_RETRIES})…`,
        });
        setTimeout(() => {
          if (token !== this.playToken || !audioPath) return;
          this.resumeSegment(audioPath, playedNow, token);
        }, 400);
        return;
      }

      this.dropRetryCount = 0;
      if (droppedEarly) {
        this.setState({
          phase: "error",
          error:
            "Audio device keeps dropping the stream. This looks like a WSLg/PulseAudio issue, not a bad file — try again, or restart WSL audio.",
        });
        return;
      }

      this.segmentBaseOffset = 0;
      void this.next();
    });
    this.player.on("error", (err: Error) => {
      this.setState({ phase: "error", error: err.message });
    });
  }

  private async resumeFromFile(audioPath: string, token: number) {
    const duration = await probeDuration(audioPath);
    if (token !== this.playToken) return;
    this.dropRetryCount = 0;
    this.segmentBaseOffset = 0;
    this.setState({ phase: "playing", elapsed: 0, duration });
    this.playStartedAt = Date.now();
    this.player.play(audioPath);
    this.startElapsedTimer();
  }

  private resumeSegment(audioPath: string, fromSeconds: number, token: number) {
    if (token !== this.playToken) return;
    this.segmentBaseOffset = fromSeconds;
    this.playStartedAt = Date.now();
    this.setState({ phase: "playing", elapsed: fromSeconds });
    this.player.play(audioPath, fromSeconds);
    this.startElapsedTimer();
  }

  getState(): PlaybackState {
    return this.state;
  }

  private setState(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch };
    this.emit("change", this.state);
  }

  setQueue(list: ModuleRow[], startIndex: number) {
    this.queue = list;
    this.originalQueue = list;
    this.queueIndex = startIndex;
    this.setState({ queue: list, shuffled: false });
  }

  async playIndex(index: number) {
    if (index < 0 || index >= this.queue.length) return;
    this.queueIndex = index;
    await this.playModule(this.queue[index]);
  }

  async next() {
    if (this.queueIndex + 1 < this.queue.length) {
      await this.playIndex(this.queueIndex + 1);
    } else {
      this.player.stop();
      this.setState({ ...initialState });
    }
  }

  async previous() {
    if (this.queueIndex - 1 >= 0) {
      await this.playIndex(this.queueIndex - 1);
    }
  }

  /**
   * Toggles shuffle. Turning it on shuffles the upcoming queue, keeping the
   * currently playing track anchored in place. Turning it off restores the
   * original (pre-shuffle) order, re-anchored on wherever playback currently
   * is in that order.
   */
  shuffle() {
    if (this.queue.length < 2) return;
    const current = this.queueIndex >= 0 ? this.queue[this.queueIndex] : undefined;

    if (this.state.shuffled) {
      this.queue = [...this.originalQueue];
      this.queueIndex = current
        ? this.queue.findIndex((m) => m.id === current.id)
        : this.queueIndex;
      this.setState({ queue: this.queue, shuffled: false });
      return;
    }

    const rest = this.queue.filter((_, i) => i !== this.queueIndex);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.queue = current ? [current, ...rest] : rest;
    this.queueIndex = current ? 0 : this.queueIndex;
    this.setState({ queue: this.queue, shuffled: true });
  }

  async playModule(mod: ModuleRow) {
    const token = ++this.playToken;
    this.player.stop();
    this.stopElapsedTimer();
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    this.dropRetryCount = 0;
    this.segmentBaseOffset = 0;
    const { dir, rawPath, audioPath } = getModulePaths(mod);
    this.setState({
      ...initialState,
      queue: this.state.queue,
      shuffled: this.state.shuffled,
      module: mod,
      phase: "downloading",
    });

    try {
      fs.mkdirSync(dir, { recursive: true });

      if (!fs.existsSync(audioPath)) {
        if (!fs.existsSync(rawPath)) {
          await downloadModule(
            mod.id,
            rawPath,
            (received, total) => {
              if (token !== this.playToken) return;
              const progress = total
                ? Math.min(100, Math.round((received / total) * 100))
                : 0;
              this.setState({ downloadProgress: progress });
            },
            controller.signal,
          );
        }
        if (token !== this.playToken) return;

        this.setState({ phase: "converting", convertElapsed: 0 });
        const sourceDuration = await probeDuration(rawPath);
        if (token !== this.playToken) return;
        this.setState({ convertDuration: sourceDuration });

        await convertToMp3(
          rawPath,
          audioPath,
          (seconds) => {
            if (token !== this.playToken) return;
            this.setState({ convertElapsed: seconds });
          },
          controller.signal,
        );
        fs.rm(rawPath, { force: true }, () => {});
      }
      if (token !== this.playToken) return;

      await this.resumeFromFile(audioPath, token);
    } catch (err: any) {
      if (err instanceof AbortedError) return;
      if (token !== this.playToken) return;
      this.setState({ phase: "error", error: String(err?.message ?? err) });
    }
  }

  togglePause() {
    if (this.state.phase === "playing") {
      this.player.pause();
      this.stopElapsedTimer();
      // Freeze the accumulated position so a later resume continues counting
      // from here rather than jumping back to where this segment started.
      this.segmentBaseOffset = this.state.elapsed;
      this.setState({ phase: "paused" });
    } else if (this.state.phase === "paused") {
      this.player.resume();
      this.playStartedAt = Date.now();
      this.startElapsedTimer();
      this.setState({ phase: "playing" });
    }
  }

  stop() {
    this.playToken++;
    this.dropRetryCount = 0;
    this.segmentBaseOffset = 0;
    this.abortController?.abort();
    this.player.stop();
    this.stopElapsedTimer();
    this.setState({ ...initialState });
  }

  private startElapsedTimer() {
    this.stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      const elapsed = this.segmentBaseOffset + (Date.now() - this.playStartedAt) / 1000;
      this.setState({ elapsed });
    }, 500);
  }

  private stopElapsedTimer() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }
}
