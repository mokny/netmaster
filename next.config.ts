import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 loads a native binding and a WASM module at runtime; Turbopack
  // can't place those as ESM chunks, so keep it out of the server bundle.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
