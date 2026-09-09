// Entitlements require a real expiry. Imported status labels are not a clock.
export function computeAccessStatus(user, { now = new Date(), adminEmail = process.env.ADMIN_EMAIL || '' } = {}) {
  const email = String(user?.email || '').trim().toLowerCase();
  const expectedAdmin = adminEmail.trim().toLowerCase();
  if (user?.is_admin === true || user?.is_admin === 1 || (expectedAdmin && email === expectedAdmin)) {
    return { status: 'active', trial_active: false, subscription_active: true, has_full_access: true };
  }

  const future = (value) => {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > new Date(now).getTime();
  };
  const trialActive = future(user?.trial_ends_at);
  const premiumActive = future(user?.premium_expires_at) || future(user?.subscription_expires_at);
  return {
    status: premiumActive ? 'active' : trialActive ? 'trial' : 'expired',
    trial_active: trialActive,
    subscription_active: premiumActive,
    has_full_access: trialActive || premiumActive,
    referral_code: user?.own_referral_code || null,
  };
}
