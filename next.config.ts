import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  //CORS config
async rewrites() {
  return [{ source: "/api/:path*", destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*` }];
}
};

export default nextConfig;
