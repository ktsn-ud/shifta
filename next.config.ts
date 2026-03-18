import type { NextConfig } from "next";

// 参考: https://qiita.com/benjuwan/items/1016afb442967eb742e7

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": [
      "lib/generated/prisma/**/*",
      "node_modules/.prisma/client/**/*",
    ],
    "/*": ["lib/generated/prisma/**/*", "node_modules/.prisma/client/**/*"],
  },
};

export default nextConfig;
