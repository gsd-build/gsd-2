import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(webRoot, '..')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@gsd/native', 'node-pty'],
  // NodeNext-style .js extension imports in src/ must resolve to .ts source.
  // Turbopack doesn't support extensionAlias, so builds use --webpack flag.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
}

export default nextConfig
