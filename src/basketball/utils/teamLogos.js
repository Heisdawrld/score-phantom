const NBA_LOGO_CODES = {
  'atlanta hawks': 'atl',
  'boston celtics': 'bos',
  'brooklyn nets': 'bkn',
  'charlotte hornets': 'cha',
  'chicago bulls': 'chi',
  'cleveland cavaliers': 'cle',
  'dallas mavericks': 'dal',
  'denver nuggets': 'den',
  'detroit pistons': 'det',
  'golden state warriors': 'gs',
  'houston rockets': 'hou',
  'indiana pacers': 'ind',
  'la clippers': 'lac',
  'los angeles clippers': 'lac',
  'los angeles lakers': 'lal',
  'memphis grizzlies': 'mem',
  'miami heat': 'mia',
  'milwaukee bucks': 'mil',
  'minnesota timberwolves': 'min',
  'new orleans pelicans': 'no',
  'new york knicks': 'ny',
  'oklahoma city thunder': 'okc',
  'orlando magic': 'orl',
  'philadelphia 76ers': 'phi',
  'phoenix suns': 'phx',
  'portland trail blazers': 'por',
  'sacramento kings': 'sac',
  'san antonio spurs': 'sa',
  'toronto raptors': 'tor',
  'utah jazz': 'utah',
  'washington wizards': 'wsh',
};

const WNBA_LOGO_CODES = {
  'atlanta dream': 'atl',
  'chicago sky': 'chi',
  'connecticut sun': 'con',
  'dallas wings': 'dal',
  'golden state valkyries': 'gsv',
  'indiana fever': 'ind',
  'las vegas aces': 'lv',
  'los angeles sparks': 'la',
  'minnesota lynx': 'min',
  'new york liberty': 'ny',
  'phoenix mercury': 'phx',
  'portland fire': 'por',
  'seattle storm': 'sea',
  'washington mystics': 'wsh',
};

function normalize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function espnLogo(sport, code) {
  if (!sport || !code) return null;
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/scoreboard/${code}.png`;
}

export function resolveBasketballTeamLogo({ leagueKey = '', teamName = '', teamAbbr = '', rawLogo = null } = {}) {
  if (rawLogo && String(rawLogo).trim()) return String(rawLogo).trim();

  const key = String(leagueKey || '').toLowerCase();
  const normalizedName = normalize(teamName);
  const normalizedAbbr = normalize(teamAbbr);

  if (key === 'nba' || key === 'apisports_12') {
    const code = normalizedAbbr || NBA_LOGO_CODES[normalizedName] || null;
    return code ? espnLogo('nba', code) : null;
  }

  if (key === 'wnba') {
    const code = normalizedAbbr || WNBA_LOGO_CODES[normalizedName] || null;
    return code ? espnLogo('wnba', code) : null;
  }

  return null;
}
