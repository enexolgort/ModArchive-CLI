import * as fs from "fs";
import type { ModuleRow } from "./queries";
import { markDownloaded } from "./queries";
import { getModulePaths } from "./paths";
import { downloadModule } from "./downloader";
import { convertToMp3 } from "./converter";

/**
 * Downloads+converts one module in the background, ahead of time, so the
 * download/convert pause that normally happens on track change doesn't land
 * on every track — just the first one. PlaybackManager points this at
 * "whatever's next in the queue" whenever the queue or playback position
 * changes; it cancels and retargets itself as that changes.
 *
 * Deliberately has no dedup/locking against PlaybackManager's own
 * download+convert: if the user skips ahead onto a track this is still
 * mid-fetch for, both run concurrently against the same destination paths.
 * That's the same tradeoff downloader.ts/converter.ts already accept for
 * "two call sites at once" (playback + batch convert) — unique-per-call tmp
 * filenames mean the race is wasteful, not unsafe. cancelFor() below avoids
 * it in the common case by handing off instead.
 */
export class Prefetcher {
  private abortController: AbortController | null = null;
  private moduleId: string | null = null;

  /** Starts prefetching `mod` if it isn't already cached, cancelling any previous target. Pass null when there's nothing to prefetch (end of queue). */
  ensure(mod: ModuleRow | null) {
    if (!mod || mod.id === this.moduleId) return;
    this.cancel();

    const { audioPath } = getModulePaths(mod);
    if (fs.existsSync(audioPath)) return;

    this.moduleId = mod.id;
    const controller = new AbortController();
    this.abortController = controller;
    void this.run(mod, controller);
  }

  /** Cancels an in-flight prefetch if it's targeting this exact module — called right before PlaybackManager starts its own download for it, so the two don't race. */
  cancelFor(moduleId: string) {
    if (this.moduleId === moduleId) this.cancel();
  }

  cancel() {
    this.abortController?.abort();
    this.abortController = null;
    this.moduleId = null;
  }

  private async run(mod: ModuleRow, controller: AbortController) {
    const { dir, rawPath, audioPath } = getModulePaths(mod);
    try {
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(rawPath)) {
        await downloadModule(mod.id, rawPath, undefined, controller.signal);
      }
      await convertToMp3(rawPath, audioPath, undefined, controller.signal);
      fs.rm(rawPath, { force: true }, () => {});
      markDownloaded(mod.id);
    } catch {
      // Best-effort background work — swallow errors silently. The user
      // just sees the normal download/convert flow when they get to this
      // track instead of it already being cached.
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
        this.moduleId = null;
      }
    }
  }
}
