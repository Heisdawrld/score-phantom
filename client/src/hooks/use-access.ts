import { useAuth } from './use-auth';

export function useAccess() {
  const auth = useAuth();
  const user = auth.data;
  
  // isPremium = has ANY access (trial OR paid) — used for basic prediction access
  const isPremium = user?.access_status === "active"
    || user?.access_status === "trial"
    || (user as any)?.has_full_access === true
    || (user as any)?.has_access === true
    || (user as any)?.trial_active === true
    || (user as any)?.subscription_active === true
    || (user as any)?.is_admin === true;

  // isSubscribed = actual PAYING subscriber (NOT trial) — used for premium-only features
  const isSubscribed = (user as any)?.subscription_active === true
    || user?.access_status === "active"
    || (user as any)?.is_admin === true;

  const isTrial = (user?.access_status === "trial"
    || (user as any)?.trial_active === true)
    && !isSubscribed; // if they're subscribed, they're not trial

  // BUG FIX: Only mark as expired when the server explicitly says "expired".
  // Old logic: !isPremium && (!!user && !isPremium) → any non-premium user was "expired",
  // including brand-new users who haven't been assigned an access status yet.
  const isExpired = user?.access_status === "expired"
    || ((user as any)?.subscription_status === "expired");

  return { ...auth, isPremium, isSubscribed, isTrial, isExpired, user };
}

