import React from "react";
import { render } from "ink";
import { App } from "./App";
import { pm } from "./singleton";
import { reconcileDownloaded } from "./queries";

const cleanup = () => {
  try {
    pm.stop();
  } catch {}
};

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

// The downloaded mp3s on disk are the source of truth for what's actually
// cached — the DB's `downloaded` flag can drift from that (files removed by
// hand, or a DB reset/restore that lost track of prior downloads), so
// reconcile it once up front rather than trusting whatever it says.
reconcileDownloaded();

render(<App />);
