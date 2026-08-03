import path from 'path';
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],

  // Prevents turbopack from resolving workspace root to a parent directory
  // that contains a different lockfile, which causes dev server instability.
  turbopack: { root: path.resolve(__dirname) },

  // Allow dev server access from non-localhost hosts (e.g. Docker, tunnel, LAN)
  allowedDevOrigins: [
    '*',
    '*.run.app',
    '*.asia-east1.run.app',
  ],
};

export default nextConfig;
