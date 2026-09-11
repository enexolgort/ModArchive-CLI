import React from "react";
import { render } from "ink";
import { App } from "./App";
import { pm } from "./singleton";

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

render(<App />);
