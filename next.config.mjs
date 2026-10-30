/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  /* config options here */
  // OneDrive-backed working directories can hold file locks on `.next`,
  // which breaks `next build`'s clean step. `NEXT_DIST_DIR` lets the build
  // run against a scratch directory instead.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    agentFeedback: true,
  },
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
