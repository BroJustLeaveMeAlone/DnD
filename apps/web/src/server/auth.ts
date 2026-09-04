import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDatabase, schema } from '@ttrpg/db';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Discord from 'next-auth/providers/discord';
import Google from 'next-auth/providers/google';
import { serverEnv } from '@/env';

/**
 * Providers are wired only when their credentials are present, so a fresh clone
 * with no OAuth apps registered still boots. Phase 0 ships OAuth only; email
 * magic links need a mail transport and land alongside the Commons.
 */
function providers(env: ReturnType<typeof serverEnv>): NextAuthConfig['providers'] {
  const configured: NextAuthConfig['providers'] = [];

  if (env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET) {
    configured.push(
      Discord({ clientId: env.AUTH_DISCORD_ID, clientSecret: env.AUTH_DISCORD_SECRET }),
    );
  }
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    configured.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
  }

  return configured;
}

export function buildAuthConfig(): NextAuthConfig {
  const env = serverEnv();

  return {
    adapter: DrizzleAdapter(getDatabase(), {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
      authenticatorsTable: schema.authenticators,
    }),
    providers: providers(env),
    session: { strategy: 'database' },
    callbacks: {
      session({ session, user }) {
        if (session.user) session.user.id = user.id;
        return session;
      },
    },
  };
}

/**
 * Lazy config. NextAuth accepts a factory, which defers env validation and
 * pool creation to the first request instead of module evaluation — so a
 * production build (or a container image build) does not need a reachable
 * database or a populated .env just to collect page data.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig);
