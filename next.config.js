/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  distDir: 'out',
  assetPrefix: process.env.NODE_ENV === 'production' ? './' : undefined,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.target = 'electron-renderer';
    }
    return config;
  },
  env: {
    NEXT_PUBLIC_GITHUB_TOKEN: process.env.NEXT_PUBLIC_GITHUB_TOKEN,
  },
}

module.exports = nextConfig

