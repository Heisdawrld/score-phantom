export function basketballTeamLogoSrc({
  logo,
  name,
  league,
}: {
  logo?: string | null;
  name?: string | null;
  league?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("v", "2");
  if (logo) params.set("url", logo);
  if (name) params.set("name", name);
  if (league) params.set("league", league);
  return `/api/basketball/team-logo?${params.toString()}`;
}
