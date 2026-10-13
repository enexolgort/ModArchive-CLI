import React, { useEffect, useState } from "react";
import { render } from "ink";
import { App } from "./App";
import { pm } from "./singleton";
import { reconcileDownloaded, type ReconcileProgress } from "./queries";
import { LoadingScreen } from "./LoadingScreen";

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

function Root() {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<ReconcileProgress>({ done: 0, total: 0 });

  useEffect(() => {
    // The downloaded mp3s on disk are the source of truth for what's actually
    // cached — the DB's `downloaded` flag can drift from that (files removed
    // by hand, or a DB reset/restore that lost track of prior downloads), so
    // reconcile it once up front rather than trusting whatever it says.
    reconcileDownloaded(setProgress).then(() => setReady(true));
  }, []);

  if (!ready) {
    return <LoadingScreen label="Verifying downloaded tracks…" progress={progress} />;
  }
  return <App />;
}

render(<Root />);
