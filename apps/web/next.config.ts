import type { NextConfig } from "next";
import { configureDevelopmentDatabase } from "./src/server/database-url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
configureDevelopmentDatabase(process.env);

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = {
      ...webpackConfig.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return webpackConfig;
  },
};

export default config;
