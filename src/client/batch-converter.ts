import { EventEmitter } from "events";
import * as fs from "fs";
import type { ModuleRow } from "./queries";
import { markDownloaded } from "./queries";
import { getModulePaths } from "./paths";
import { downloadModule, AbortedError } from "./downloader";
import { convertToMp3 } from "./converter";

export type BatchPhase = "idle" | "downloading" | "converting";

export interface BatchState {
  active: boolean;
  label: string;
  total: number;
  done: number;
  current: ModuleRow | null;
  phase: BatchPhase;
  error?: string;
}

const initialState: BatchState = {
  active: false,
  label: "",
  total: 0,
  done: 0,
  current: null,
  phase: "idle",
};

/** Downloads and converts every module in a list to mp3, one at a time, skipping ones already cached. */
export class BatchConverter extends EventEmitter {
  private state: BatchState = { ...initialState };
  private abortController: AbortController | null = null;
  private runToken = 0;

  getState(): BatchState {
    return this.state;
  }

  private setState(patch: Partial<BatchState>) {
    this.state = { ...this.state, ...patch };
    this.emit("change", this.state);
  }

  cancel() {
    this.runToken++;
    this.abortController?.abort();
    this.setState({ ...initialState });
  }

  async run(label: string, modules: ModuleRow[]) {
    this.cancel();
    const token = this.runToken;
    const controller = new AbortController();
    this.abortController = controller;
    this.setState({
      active: true,
      label,
      total: modules.length,
      done: 0,
      current: null,
      phase: "idle",
      error: undefined,
    });

    for (const mod of modules) {
      if (token !== this.runToken) return;
      const { dir, rawPath, audioPath } = getModulePaths(mod);
      this.setState({ current: mod, phase: "downloading" });

      try {
        fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(audioPath)) {
          if (!fs.existsSync(rawPath)) {
            await downloadModule(mod.id, rawPath, undefined, controller.signal);
          }
          if (token !== this.runToken) return;

          this.setState({ phase: "converting" });
          await convertToMp3(rawPath, audioPath, undefined, controller.signal);
          fs.rm(rawPath, { force: true }, () => {});
        }
        markDownloaded(mod.id);
      } catch (err: any) {
        if (err instanceof AbortedError) return;
        if (token !== this.runToken) return;
        // Keep going — one broken module shouldn't stop the whole batch.
        this.setState({ error: `${mod.file_name}: ${String(err?.message ?? err)}` });
      }

      if (token !== this.runToken) return;
      this.setState({ done: this.state.done + 1 });
    }

    if (token !== this.runToken) return;
    this.setState({ active: false, phase: "idle", current: null });
  }
}
