import React, { useEffect, useState } from "react";
import { render } from "ink";
import { StatsApp } from "./StatsApp";
import { reconcileDownloaded, type ReconcileProgress } from "./queries";
import { LoadingScreen } from "./LoadingScreen";

function Root() {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<ReconcileProgress>({ done: 0, total: 0 });

  useEffect(() => {
    // Same reasoning as the main app's entry point: the downloaded flag can
    // drift from what's actually on disk, and this view reports off that flag.
    reconcileDownloaded(setProgress).then(() => setReady(true));
  }, []);

  if (!ready) {
    return <LoadingScreen label="Verifying downloaded tracks…" progress={progress} />;
  }
  return <StatsApp />;
}

render(<Root />);
