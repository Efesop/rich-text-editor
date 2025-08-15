/** @type {import('next').NextConfig} */
// Check if we're building for GitHub Pages
const isGitHubPages = process.env.DEPLOY_TARGET === 'github'
const basePath = isGitHubPages ? '/rich-text-editor' : ''

const nextConfig = {
  output: 'export',
  distDir: 'out',
  basePath: isGitHubPages ? basePath : undefined,
  assetPrefix: isGitHubPages ? basePath : './',
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  }
}

module.exports = nextConfig

