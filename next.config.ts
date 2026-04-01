import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=30, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
