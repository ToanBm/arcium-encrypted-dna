import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // Provide empty stubs for Node.js built-ins that Solana/Anchor deps try to require
    // in browser/SSR contexts. Works across all node_modules (including root-level).
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      path: false,
      os: false,
      stream: false,
      crypto: false,
      http: false,
      https: false,
      url: false,
      zlib: false,
      "node-gyp-build": false,
    };
    return config;
  },
  turbopack: {
    // Relative to project root — do NOT use path.resolve() here
    resolveAlias: {
      fs: "./src/shims/node-empty.js",
      net: "./src/shims/node-empty.js",
      tls: "./src/shims/node-empty.js",
      "node:fs": "./src/shims/node-empty.js",
      "node:net": "./src/shims/node-empty.js",
      "node:tls": "./src/shims/node-empty.js",
    },
  },
};

export default nextConfig;
