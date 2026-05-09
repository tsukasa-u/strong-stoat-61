/**
 * SvelteKit runnable launcher.
 *
 * Runs the official SvelteKit dev server and serves routes from `src/routes/*`.
 */

import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["--dir", "examples/sveltekit", "exec", "vite", "dev", "--host", "127.0.0.1", "--port", "8013"],
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
