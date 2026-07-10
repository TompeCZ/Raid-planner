import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Připni workspace root na tenhle projekt. Jinak Next kvůli druhému
  // package-lock.json o úroveň výš (/workspace) odhadne špatný root a
  // rozhodí file tracing / dev cache.
  outputFileTracingRoot: path.join(__dirname),
  // Povol dev přístup z NASu (code-server, LAN IP) bez cross-origin varování.
  allowedDevOrigins: ["192.168.1.110"],
};

export default nextConfig;
