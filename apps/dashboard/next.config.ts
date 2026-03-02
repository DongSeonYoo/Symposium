import type { NextConfig } from "next";
import path from "path";

const config: NextConfig = {
  transpilePackages: ["@symposium/db", "@symposium/shared-types"],
  // lockfile 루트 감지 경고 제거
  outputFileTracingRoot: path.join(__dirname, "../../"),
  webpack(webpackConfig) {
    // @symposium/db 등 NodeNext ESM 패키지의 .js import를 .ts로 리졸브
    // (TypeScript source를 직접 transpile할 때 필요)
    webpackConfig.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return webpackConfig;
  },
};

export default config;
