import type { NextConfig } from "next";

// The admin console is fully per-user and live (every page reads the session
// cookie), so it renders dynamically. Cache Components is left off on purpose.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
