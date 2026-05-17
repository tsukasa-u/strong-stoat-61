import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep heavy font processing deps external on the server runtime.
  serverExternalPackages: ["pua-font-obfuscator", "opentype.js", "wawoff2"],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
};

export default nextConfig;
