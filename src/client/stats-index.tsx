import React from "react";
import { render } from "ink";
import { StatsApp } from "./StatsApp";
import { reconcileDownloaded } from "./queries";

// Same reasoning as the main app's entry point: the downloaded flag can
// drift from what's actually on disk, and this view reports off that flag.
reconcileDownloaded();

render(<StatsApp />);
