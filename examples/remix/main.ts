/**
 * Remix runnable launcher.
 *
 * Runs Remix with Vite dev server so routes are served from `app/routes/*`.
 */

import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["--dir", "examples/remix", "exec", "remix", "vite:dev", "--host", "127.0.0.1", "--port", "8011"],
  { stdio: "inherit" },
);

const shutdown = () => {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
