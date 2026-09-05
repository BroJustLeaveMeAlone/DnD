import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDatabase, schema } from '@ttrpg/db';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Discord from 'next-auth/providers/discord';
import Google from 'next-auth/providers/google';
import { serverEnv } from '@/env';

export interface ProviderInfo {
  id: string;
  name: string;
}

/**
 * Which providers this deployment actually has credentials for.
 *
 * Read by the sign-in page so it offers exactly what is configured. A button
 * for an unregistered provider would send the user to a broken callback, and
 * the resulting error page is far more confusing than an absent button.
 */
export function configuredProviders(): ProviderInfo[] {
  const env = serverEnv();
  const available: ProviderInfo[] = [];

  if (env.AUTH_DISCORD_ID && env.AUTH_DISCORD_SECRET) {
    available.push({ id: 'discord', name: 'Discord' });
  }
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
    available.push({ id: 'google', name: 'Google' });
  }

  return available;
}

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

    // Our own pages, so an auth failure looks like the rest of the app and can
    // explain what went wrong in terms of this project's setup.
    pages: {
      signIn: '/signin',
      error: '/signin',
    },

    callbacks: {
      session({ session, user }) {
        if (session.user) session.user.id = user.id;
        return session;
      },
    },
  };
}

/**
 * Lazy config. NextAuth accepts a factory, which defers env validation and pool
 * creation to the first request instead of module evaluation — so a production
 * build (or a container image build) does not need a reachable database or a
 * populated .env just to collect page data.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig);
