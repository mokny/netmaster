import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // ssh2 loads a native binding and a WASM module at runtime; Turbopack
  // can't place those as ESM chunks, so keep it out of the server bundle.
  // unzipper's Open/index.js has an optional, only-used-if-called
  // require("@aws-sdk/client-s3") for its S3-source support (we only use
  // unzipper.Parse() for the ZIP-Entpacken-Feature, never Open.s3/.s3_v3) -
  // without a real dependency on that package, Turbopack's static bundling
  // fails to resolve it even though it's never invoked. Keeping the package
  // external avoids bundling it at build time; Node resolves the require()
  // normally at runtime, which is fine since that code path is unreachable.
  serverExternalPackages: ["ssh2", "unzipper"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
