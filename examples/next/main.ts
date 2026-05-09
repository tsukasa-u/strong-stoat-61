/**
 * Next runnable launcher.
 *
 * Runs the official Next dev server so routes/pages are served from `app/*`.
 */

import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["--dir", "examples/next", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "8010"],
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
