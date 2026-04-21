import { useAuth } from './use-auth';

export function useAccess() {
  const auth = useAuth();
  const user = auth.data;
  
  const isPremium = user?.access_status === "active" 
    || (user as any)?.subscription_active 
    || (user as any)?.trial_active 
    || (user as any)?.is_admin;
    
  const isTrial = (user as any)?.trial_active === true;
  const isExpired = user?.access_status === "expired";
  
  return { ...auth, isPremium, isTrial, isExpired, user };
}