import { useAuth } from './use-auth';

export function useAccess() {
  const auth = useAuth();
  const user = auth.data;
  
  // Check all possible access signals — trial users must not be treated as expired
  const isPremium = user?.access_status === "active"
    || user?.access_status === "trial"          // FIX: trial users are "premium" for feature access
    || (user as any)?.has_full_access === true  // explicit flag from backend
    || (user as any)?.has_access === true       // legacy field
    || (user as any)?.trial_active === true
    || (user as any)?.subscription_active === true
    || (user as any)?.is_admin === true;

  const isTrial = user?.access_status === "trial"
    || (user as any)?.trial_active === true;

  const isExpired = !isPremium && (
    user?.access_status === "expired"
    || (!!user && !isPremium)
  );

  return { ...auth, isPremium, isTrial, isExpired, user };
}