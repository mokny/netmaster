import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // ssh2 loads a native binding and a WASM module at runtime; Turbopack
  // can't place those as ESM chunks, so keep it out of the server bundle.
  serverExternalPackages: ["ssh2"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
