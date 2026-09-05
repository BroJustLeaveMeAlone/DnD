'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Subscribes to a campaign's event stream and re-renders on any change.
 *
 * Deliberately minimal. The pages are server components that already know how
 * to render current state under the viewer's own permissions, so `router.refresh()`
 * is the entire update mechanism — no client-side store to keep in sync, and no
 * risk of the live path showing something the authorised render would not.
 *
 * Renders nothing.
 */
export function LiveUpdates({ campaignId }: { campaignId: string }) {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(`/api/campaigns/${campaignId}/events`);
    const refresh = () => router.refresh();

    source.addEventListener('encounter', refresh);
    source.addEventListener('campaign', refresh);

    // A 403 or 401 makes EventSource fail without retrying, which is what we
    // want: a viewer who lost access should stop asking, not hammer the route.
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) source.close();
    });

    return () => source.close();
  }, [campaignId, router]);

  return null;
}
