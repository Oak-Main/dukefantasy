import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Resolve metadata into <head> for every user agent, as vinext 0.0.50 did.
  // vinext 1.2 otherwise streams title, description and canonical after
  // </head> to any agent outside Next's HTML-limited bot list, Googlebot
  // included.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
