import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

/**
 * Next only looks for .env alongside the app, but this is a monorepo and a
 * single root .env drives docker compose, drizzle-kit, and the app alike.
 * next.config is evaluated before dev, build, and start, so loading it here
 * covers all three.
 */
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@ttrpg/db', '@ttrpg/schemas', '@ttrpg/rules-engine'],
  // Promoted out of `experimental` in Next 15.5.
  typedRoutes: true,
  eslint: {
    // Linting is a separate turbo task across the whole workspace; running it
    // again here would duplicate work and use a different config.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
