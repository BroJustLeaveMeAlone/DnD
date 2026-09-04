import { pingDatabase } from '@ttrpg/db';
import { ENGINE_VERSION } from '@ttrpg/rules-engine';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Phase 0 exit criterion: proves the app boots, the workspace packages resolve,
 * and the database is actually reachable and migrated.
 */
export async function GET() {
  const checks: Record<string, string> = {
    app: 'ok',
    rulesEngine: ENGINE_VERSION,
  };

  try {
    await pingDatabase();
    checks.database = 'ok';
  } catch (error) {
    checks.database = error instanceof Error ? `error: ${error.message}` : 'error';
    return NextResponse.json({ status: 'degraded', checks }, { status: 503 });
  }

  return NextResponse.json({ status: 'ok', checks });
}
