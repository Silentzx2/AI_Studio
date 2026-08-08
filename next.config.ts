import path from 'path';
import type {NextConfig} from 'next';
import { withReticle } from '@reticlehq/next';

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
    '*.trycloudflare.com',
    '*.run.app',
    '*.asia-east1.run.app',
  ],
};

export default withReticle(nextConfig);
