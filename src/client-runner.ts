import React from "react";
import { render } from "ink";
import App from "./client/app";

const { waitUntilExit } = render(React.createElement(App), {
  exitOnCtrlC: true,
});
waitUntilExit().then(() => process.exit(0));
