import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Keeper agent lives in the sibling workspace package; transpile it
  // so the /api/verdict route handler can import it directly.
  transpilePackages: ["@cryptkeeper/agent"],
};

export default nextConfig;
