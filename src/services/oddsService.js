/**
 * oddsService.js — Odds-API.io integration
 * EXACT_MAP uses BOTH country (category_name from DB) AND tournament name
 * All 628 leagues from odds-api.io are mapped
 * Bookmakers: SportyBet (primary) + Bet365 (fallback)
 */
import db from '../config/database.js';

const ODDS_API_KEY  = process.env.ODDS_API_KEY || '';
const ODDS_API_BASE = 'https://api.odds-api.io/v3';
const BOOKMAKERS    = 'SportyBet,Bet365';
const LEAGUE_CACHE_HOURS  = 6;
const FIXTURE_CACHE_HOURS = 4;

// ALL 628 leagues from odds-api.io (/v3/leagues?sport=football)
// Key format: 'CountryFromDB|TournamentNameFromDB' → odds-api.io slug
const EXACT_MAP = {
  'Albania|Kategoria e Pare': 'albania-kategoria-e-pare',
  'Albania|Kategoria Superiore': 'albania-kategoria-superiore',
  'Albania|Kupa e Shqiperise': 'albania-kupa-e-shqiperise',
  'Algeria|Ligue 1': 'algeria-ligue-1',
  'Algeria|Ligue 2': 'algeria-ligue-2',
  'Andorra|Primera Divisio': 'andorra-primera-divisio',
  'Andorra|Second Divisio': 'andorra-second-divisio',
  'Angola|Girabola': 'angola-girabola',
  'Argentina|Copa Argentina': 'argentina-copa-argentina',
  'Argentina|Copa Proyeccion Final, Reserves': 'argentina-copa-proyeccion-final-reserves',
  'Argentina|Liga Profesional': 'argentina-liga-profesional',
  'Argentina|Primera B': 'argentina-primera-b',
  'Argentina|Primera C': 'argentina-primera-c',
  'Argentina|Primera Division, Women': 'argentina-primera-division-women',
  'Argentina|Primera Nacional': 'argentina-primera-nacional',
  'Argentina|Torneo Federal A': 'argentina-torneo-federal-a',
  'Armenia|First League': 'armenia-first-league',
  'Armenia|Premier League': 'armenia-premier-league',
  'Australia|A-League': 'australia-a-league',
  'Australia|A-League, Women': 'australia-a-league-women',
  'Australia|Capital NPL, Women': 'australia-capital-npl-women',
  'Australia|Northern NSW League One': 'australia-northern-nsw-league-one',
  'Australia|Northern NSW League One, Reserves': 'australia-northern-nsw-league-one-reserves',
  'Australia|Northern NSW League One, Reserves, Women': 'australia-northern-nsw-league-one-reserves-women',
  'Australia|Northern NSW NPL': 'australia-northern-nsw-npl',
  'Australia|Northern NSW NPL, Reserves': 'australia-northern-nsw-npl-reserves',
  'Australia|Northern Territory Premier League': 'australia-northern-territory-premier-league',
  'Australia|Northern Territory Premier League, Women': 'australia-northern-territory-premier-league-women',
  'Australia|NPL Western Australia, Women': 'australia-npl-western-australia-women',
  'Australia|NSW League One': 'australia-nsw-league-one',
  'Australia|NSW League One, Women': 'australia-nsw-league-one-women',
  'Australia|NSW League Two': 'australia-nsw-league-two',
  'Australia|NSW NPL 1': 'australia-nsw-npl-1',
  'Australia|NSW Premier League, Women': 'australia-nsw-premier-league-women',
  'Australia|Queensland NPL': 'australia-queensland-npl',
  'Australia|Queensland NPL, Women': 'australia-queensland-npl-women',
  'Australia|Queensland Premier League 1': 'australia-queensland-premier-league-1',
  'Australia|Queensland Premier League 1, Women': 'australia-queensland-premier-league-1-women',
  'Australia|Queensland Premier League 2': 'australia-queensland-premier-league-2',
  'Australia|Queensland Premier League 3 Metro': 'australia-queensland-premier-league-3-metro',
  'Australia|South Australia NPL': 'australia-south-australia-npl',
  'Australia|South Australia NPL, Reserves': 'australia-south-australia-npl-reserves',
  'Australia|South Australia NPL, Reserves, Women': 'australia-south-australia-npl-reserves-women',
  'Australia|South Australia NPL, Women': 'australia-south-australia-npl-women',
  'Australia|South Australia State League 1': 'australia-south-australia-state-league-1',
  'Australia|South Australia State League 1, Reserves': 'australia-south-australia-state-league-1-reserves',
  'Australia|South Australia State League 2': 'australia-south-australia-state-league-2',
  'Australia|South Australia State League 2, Reserves': 'australia-south-australia-state-league-2-reserves',
  'Australia|South Australia State League, Women': 'australia-south-australia-state-league-women',
  'Australia|Tasmania NPL': 'australia-tasmania-npl',
  'Australia|Tasmania Southern Championship': 'australia-tasmania-southern-championship',
  'Australia|Tasmania Super League, Women': 'australia-tasmania-super-league-women',
  'Australia|U20 NSW NPL': 'australia-u20-nsw-npl',
  'Australia|U20 NSW Premier League 2': 'australia-u20-nsw-premier-league-2',
  'Australia|U20 Victoria NPL, Women': 'australia-u20-victoria-npl-women',
  'Australia|U23 Capital NPL': 'australia-u23-capital-npl',
  'Australia|U23 NSW NPL, Women': 'australia-u23-nsw-npl-women',
  'Australia|U23 Queensland NPL': 'australia-u23-queensland-npl',
  'Australia|U23 Queensland Premier League 1': 'australia-u23-queensland-premier-league-1',
  'Australia|U23 Victoria NPL': 'australia-u23-victoria-npl',
  'Australia|U23 Victoria Premier League 1': 'australia-u23-victoria-premier-league-1',
  'Australia|U23 Western Australia NPL': 'australia-u23-western-australia-npl',
  'Australia|Victoria NPL, Women': 'australia-victoria-npl-women',
  'Australia|Victoria Premier League 1': 'australia-victoria-premier-league-1',
  'Australia|Victoria Premier League 2': 'australia-victoria-premier-league-2',
  'Australia|Victoria Premier League, Women': 'australia-victoria-premier-league-women',
  'Australia|Victoria, NPL': 'australia-victoria-npl',
  'Australia|Western Australia NPL': 'australia-western-australia-npl',
  'Australia|Western Australia State League 1': 'australia-western-australia-state-league-1',
  'Australia|Western Australia State League 1, Reserves': 'australia-western-australia-state-league-1-reserves',
  'Australia|Western Australia State League 2': 'australia-western-australia-state-league-2',
  'Australia|Western Australia State League 2, Reserves': 'australia-western-australia-state-league-2-reserves',
  'Austria|2. Liga': 'austria-2-liga',
  'Austria|Bundesliga': 'austria-bundesliga',
  'Austria|OFB Cup': 'austria-ofb-cup',
  'Austria Amateur|Bundesliga, Women': 'austria-amateur-bundesliga-women',
  'Austria Amateur|Burgenland, Burgenlandliga': 'austria-amateur-burgenland-burgenlandliga',
  'Austria Amateur|Karnten, Karntner Liga': 'austria-amateur-karnten-karntner-liga',
  'Austria Amateur|Niederosterreich, 1. Landesliga': 'austria-amateur-niederosterreich-1-landesliga',
  'Austria Amateur|Oberosterreich, OO Liga': 'austria-amateur-oberosterreich-oo-liga',
  'Austria Amateur|OFB Cup, Women': 'austria-amateur-ofb-cup-women',
  'Austria Amateur|Regionalliga Centre': 'austria-amateur-regionalliga-centre',
  'Austria Amateur|Regionalliga Ost': 'austria-amateur-regionalliga-ost',
  'Austria Amateur|Regionalliga West': 'austria-amateur-regionalliga-west',
  'Austria Amateur|Salzburg, Salzburger Liga': 'austria-amateur-salzburg-salzburger-liga',
  'Austria Amateur|Steiermark, Landesliga': 'austria-amateur-steiermark-landesliga',
  'Austria Amateur|Tirol, Regionalliga Tirol': 'austria-amateur-tirol-regionalliga-tirol',
  'Austria Amateur|Vorarlberg, Eliteliga': 'austria-amateur-vorarlberg-eliteliga',
  'Austria Amateur|Wien, Wiener Stadtliga': 'austria-amateur-wien-wiener-stadtliga',
  'Azerbaijan|Azerbaijan Cup': 'azerbaijan-azerbaijan-cup',
  'Azerbaijan|First Division': 'azerbaijan-first-division',
  'Azerbaijan|Premier League': 'azerbaijan-premier-league',
  'Bahrain|2nd Division': 'bahrain-2nd-division',
  'Bahrain|King of Bahrain Cup': 'bahrain-king-of-bahrain-cup',
  'Bahrain|Premier League': 'bahrain-premier-league',
  'Bangladesh|Federation Cup': 'bangladesh-federation-cup',
  'Bangladesh|Premier League': 'bangladesh-premier-league',
  'Belarus|Belarus Cup': 'belarus-belarus-cup',
  'Belarus|Pervaya Liga': 'belarus-pervaya-liga',
  'Belarus|Vysshaya Liga': 'belarus-vysshaya-liga',
  'Belgium|Beker van Belgie, Women': 'belgium-beker-van-belgie-women',
  'Belgium|Challenger Pro League': 'belgium-challenger-pro-league',
  'Belgium|Nationale 1 ACFF': 'belgium-nationale-1-acff',
  'Belgium|Nationale 1 VV': 'belgium-nationale-1-vv',
  'Belgium|Pro League': 'belgium-pro-league',
  'Belgium|Super League, Women': 'belgium-super-league-women',
  'Belgium|U21 Pro League': 'belgium-u21-pro-league',
  'Bosnia & Herzegovina|Bosnia & Herzegovina Cup': 'bosnia-&-herzegovina-bosnia-&-herzegovina-cup',
  'Bosnia & Herzegovina|Premijer Liga': 'bosnia-&-herzegovina-premijer-liga',
  'Bosnia & Herzegovina|Prva Liga, Fed BiH': 'bosnia-&-herzegovina-prva-liga-fed-bih',
  'Bosnia & Herzegovina|Prva Liga, Rep of Srpska': 'bosnia-&-herzegovina-prva-liga-rep-of-srpska',
  'Botswana|Premier League': 'botswana-premier-league',
  'Brazil|Alagoano, Serie B U23': 'brazil-alagoano-serie-b-u23',
  'Brazil|Brasileiro A3, Women': 'brazil-brasileiro-a3-women',
  'Brazil|Brasileiro Serie A': 'brazil-brasileiro-serie-a',
  'Brazil|Brasileiro Serie A2, Women': 'brazil-brasileiro-serie-a2-women',
  'Brazil|Brasileiro Serie B': 'brazil-brasileiro-serie-b',
  'Brazil|Brasileiro Serie C': 'brazil-brasileiro-serie-c',
  'Brazil|Brasileiro Serie D': 'brazil-brasileiro-serie-d',
  'Brazil|Campeonato Brasileiro, Women': 'brazil-campeonato-brasileiro-women',
  'Brazil|Campeonato Tocantinense': 'brazil-campeonato-tocantinense',
  'Brazil|Carioca, Serie A2': 'brazil-carioca-serie-a2',
  'Brazil|Cearense, Serie B': 'brazil-cearense-serie-b',
  'Brazil|Copa Alagoas': 'brazil-copa-alagoas',
  'Brazil|Copa do Nordeste': 'brazil-copa-do-nordeste',
  'Brazil|Copa Espirito Santo': 'brazil-copa-espirito-santo',
  'Brazil|Copa Sul-Sudeste': 'brazil-copa-sul-sudeste',
  'Brazil|Copa Verde': 'brazil-copa-verde',
  'Brazil|Paranaense, 2. Divisao': 'brazil-paranaense-2-divisao',
  'Brazil|Paulista, Serie A2': 'brazil-paulista-serie-a2',
  'Brazil|Paulista, Serie A3': 'brazil-paulista-serie-a3',
  'Brazil|Paulista, Serie A4': 'brazil-paulista-serie-a4',
  'Brazil|Roraimense': 'brazil-roraimense',
  'Brazil|Sul-Mato-Grossense': 'brazil-sul-mato-grossense',
  'Brazil|U20 Brasileiro Serie B': 'brazil-u20-brasileiro-serie-b',
  'Brazil|U20 Campeonato Brasileiro': 'brazil-u20-campeonato-brasileiro',
  'Brazil|U20 Catarinense, Serie A': 'brazil-u20-catarinense-serie-a',
  'Brazil|U20 Gaucho, Serie A1': 'brazil-u20-gaucho-serie-a1',
  'Brazil|U20 Goiano, 1. Divisao': 'brazil-u20-goiano-1-divisao',
  'Brazil|U20 Mineiro, 1. Divisao': 'brazil-u20-mineiro-1-divisao',
  'Brazil|U20 Paranaense, 1. Divisao': 'brazil-u20-paranaense-1-divisao',
  'Bulgaria|Bulgarian Cup': 'bulgaria-bulgarian-cup',
  'Bulgaria|Parva Liga': 'bulgaria-parva-liga',
  'Bulgaria|Treta Liga': 'bulgaria-treta-liga',
  'Bulgaria|Vtora Liga': 'bulgaria-vtora-liga',
  'Burundi|Ligue A': 'burundi-ligue-a',
  'Cambodia|Cambodian Premier League': 'cambodia-cambodian-premier-league',
  'Cameroon|Elite One': 'cameroon-elite-one',
  'Canada|Canadian Premier League': 'canada-canadian-premier-league',
  'Chile|Copa de la Liga': 'chile-copa-de-la-liga',
  'Chile|Primera B': 'chile-primera-b',
  'Chile|Primera Division': 'chile-primera-division',
  'Chile|Primera Division, Women': 'chile-primera-division-women',
  'Chile|Segunda Division': 'chile-segunda-division',
  'China|China League 1': 'china-china-league-1',
  'China|China League 2': 'china-china-league-2',
  'China|Chinese Super League': 'china-chinese-super-league',
  'China|FA Cup': 'china-fa-cup',
  'Chinese Taipei|Mulan Football League, Women': 'chinese-taipei-mulan-football-league-women',
  'Chinese Taipei|Premier League': 'chinese-taipei-premier-league',
  'Colombia|Liga Femenina': 'colombia-liga-femenina',
  'Colombia|Primera A, Apertura': 'colombia-primera-a-apertura',
  'Colombia|Primera B': 'colombia-primera-b',
  'Costa Rica|Copa Costa Rica': 'costa-rica-copa-costa-rica',
  'Costa Rica|Liga de Ascenso, Clausura': 'costa-rica-liga-de-ascenso-clausura',
  'Costa Rica|Primera Division, Clausura': 'costa-rica-primera-division-clausura',
  'Costa Rica|Primera Division, Women': 'costa-rica-primera-division-women',
  'Croatia|Croatian Cup': 'croatia-croatian-cup',
  'Croatia|Druga NL': 'croatia-druga-nl',
  'Croatia|First League Women': 'croatia-first-league-women',
  'Croatia|HNL': 'croatia-hnl',
  'Croatia|Prva NL': 'croatia-prva-nl',
  'Croatia|U19 Prva NL Juniori': 'croatia-u19-prva-nl-juniori',
  'Cyprus|1st Division': 'cyprus-1st-division',
  'Cyprus|1st Division, Women': 'cyprus-1st-division-women',
  'Cyprus|2nd Division': 'cyprus-2nd-division',
  'Cyprus|3rd Division': 'cyprus-3rd-division',
  'Cyprus|Cyprus Cup': 'cyprus-cyprus-cup',
  'Czechia|1. Liga': 'czechia-1-liga',
  'Czechia|1. Liga, Women': 'czechia-1-liga-women',
  'Czechia|2. Liga, Women': 'czechia-2-liga-women',
  'Czechia|CFL': 'czechia-cfl',
  'Czechia|Cup': 'czechia-cup',
  'Czechia|Divize A': 'czechia-divize-a',
  'Czechia|Divize B': 'czechia-divize-b',
  'Czechia|Divize C': 'czechia-divize-c',
  'Czechia|Divize D': 'czechia-divize-d',
  'Czechia|Divize E': 'czechia-divize-e',
  'Czechia|Divize F': 'czechia-divize-f',
  'Czechia|FNL': 'czechia-fnl',
  'Czechia|MSFL': 'czechia-msfl',
  'Czechia|U19 1st Division': 'czechia-u19-1st-division',
  'Denmark|1. Division': 'denmark-1-division',
  'Denmark|2nd Division': 'denmark-2nd-division',
  'Denmark|3rd Division': 'denmark-3rd-division',
  'Denmark|B Liga, Women': 'denmark-b-liga-women',
  'Denmark|Kvindeligaen, Women': 'denmark-kvindeligaen-women',
  'Denmark|Superliga': 'denmark-superliga',
  'Denmark|U19 Ligaen': 'denmark-u19-ligaen',
  'Ecuador|LigaPro Primera A': 'ecuador-ligapro-primera-a',
  'Ecuador|Serie B': 'ecuador-serie-b',
  'Egypt|2. Division A': 'egypt-2-division-a',
  'Egypt|Egypt Cup': 'egypt-egypt-cup',
  'Egypt|League Cup': 'egypt-league-cup',
  'Egypt|Premier League': 'egypt-premier-league',
  'El Salvador|Primera Division, Clausura': 'el-salvador-primera-division-clausura',
  'El Salvador|Primera Division, Reserves, Clausura': 'el-salvador-primera-division-reserves-clausura',
  'El Salvador|Segunda Division': 'el-salvador-segunda-division',
  'England|Championship': 'england-championship',
  'England|EFL Trophy': 'england-efl-trophy',
  'England|FA Cup': 'england-fa-cup',
  'England|League One': 'england-league-one',
  'England|League Two': 'england-league-two',
  'England|National League': 'england-national-league',
  'England|Premier League': 'england-premier-league',
  'England Amateur|Championship, Women': 'england-amateur-championship-women',
  'England Amateur|FA Cup, Women': 'england-amateur-fa-cup-women',
  'England Amateur|Isthmian League, Pr. Div': 'england-amateur-isthmian-league-pr-div',
  'England Amateur|National League North': 'england-amateur-national-league-north',
  'England Amateur|National League South': 'england-amateur-national-league-south',
  'England Amateur|Northern Premier League Premier': 'england-amateur-northern-premier-league-premier',
  'England Amateur|Southern League Premier Central': 'england-amateur-southern-league-premier-central',
  'England Amateur|Southern League Premier South': 'england-amateur-southern-league-premier-south',
  'England Amateur|Super League Women': 'england-amateur-super-league-women',
  'England Amateur|U21 Premier League 2': 'england-amateur-u21-premier-league-2',
  'England Amateur|U21 Professional Development League': 'england-amateur-u21-professional-development-league',
  'Estonia|Esiliiga': 'estonia-esiliiga',
  'Estonia|Esiliiga B': 'estonia-esiliiga-b',
  'Estonia|II Liiga': 'estonia-ii-liiga',
  'Estonia|Meistriliiga Women': 'estonia-meistriliiga-women',
  'Estonia|Premium Liiga': 'estonia-premium-liiga',
  'Ethiopia|Premier League': 'ethiopia-premier-league',
  'Faroe Islands|Premier League': 'faroe-islands-premier-league',
  'Finland|Kakkonen Playoffs': 'finland-kakkonen-playoffs',
  'Finland|Kansallinen Liiga, Women': 'finland-kansallinen-liiga-women',
  'Finland|Kolmonen': 'finland-kolmonen',
  'Finland|Suomen Cup': 'finland-suomen-cup',
  'Finland|Suomen Cup, Women': 'finland-suomen-cup-women',
  'Finland|Veikkausliiga': 'finland-veikkausliiga',
  'Finland|Ykkonen': 'finland-ykkonen',
  'Finland|Ykkonen, Women': 'finland-ykkonen-women',
  'Finland|Ykkosliiga': 'finland-ykkosliiga',
  'France|Championnat National U19': 'france-championnat-national-u19',
  'France|Coupe de France': 'france-coupe-de-france',
  'France|Coupe de France, Women': 'france-coupe-de-france-women',
  'France|Ligue 1': 'france-ligue-1',
  'France|Ligue 2': 'france-ligue-2',
  'France|National': 'france-national',
  'France|National 2': 'france-national-2',
  'France|Premiere Ligue, Women': 'france-premiere-ligue-women',
  'France|Seconde Ligue, Women': 'france-seconde-ligue-women',
  'Georgia|Erovnuli Liga': 'georgia-erovnuli-liga',
  'Germany|2. Bundesliga': 'germany-2-bundesliga',
  'Germany|3. Liga': 'germany-3-liga',
  'Germany|Bundesliga': 'germany-bundesliga',
  'Germany|DFB Pokal': 'germany-dfb-pokal',
  'Germany Amateur|2. Bundesliga, Women': 'germany-amateur-2-bundesliga-women',
  'Germany Amateur|Bayernliga North': 'germany-amateur-bayernliga-north',
  'Germany Amateur|Bayernliga South': 'germany-amateur-bayernliga-south',
  'Germany Amateur|Bremen Liga': 'germany-amateur-bremen-liga',
  'Germany Amateur|DFB Pokal Women': 'germany-amateur-dfb-pokal-women',
  'Germany Amateur|Hessenliga': 'germany-amateur-hessenliga',
  'Germany Amateur|Mittelrheinliga': 'germany-amateur-mittelrheinliga',
  'Germany Amateur|Oberliga BW': 'germany-amateur-oberliga-bw',
  'Germany Amateur|Oberliga Hamburg': 'germany-amateur-oberliga-hamburg',
  'Germany Amateur|Oberliga Niederrhein': 'germany-amateur-oberliga-niederrhein',
  'Germany Amateur|Oberliga Niedersachsen': 'germany-amateur-oberliga-niedersachsen',
  'Germany Amateur|Oberliga NOFV North': 'germany-amateur-oberliga-nofv-north',
  'Germany Amateur|Oberliga NOFV South': 'germany-amateur-oberliga-nofv-south',
  'Germany Amateur|Oberliga Rheinland-Pfalz': 'germany-amateur-oberliga-rheinland-pfalz',
  'Germany Amateur|Oberliga Westfalen': 'germany-amateur-oberliga-westfalen',
  'Germany Amateur|Regionalliga Bavaria': 'germany-amateur-regionalliga-bavaria',
  'Germany Amateur|Regionalliga North': 'germany-amateur-regionalliga-north',
  'Germany Amateur|Regionalliga Northeast': 'germany-amateur-regionalliga-northeast',
  'Germany Amateur|Regionalliga Southwest': 'germany-amateur-regionalliga-southwest',
  'Germany Amateur|Regionalliga West': 'germany-amateur-regionalliga-west',
  'Germany Amateur|Schleswig-Holstein-Liga': 'germany-amateur-schleswig-holstein-liga',
  'Germany Amateur|U19 DFB Nachwuchsliga': 'germany-amateur-u19-dfb-nachwuchsliga',
  'Germany Amateur|Women Bundesliga': 'germany-amateur-women-bundesliga',
  'Ghana|Premier League': 'ghana-premier-league',
  'Greece|Gamma Ethniki': 'greece-gamma-ethniki',
  'Greece|Greece Cup': 'greece-greece-cup',
  'Greece|Super League': 'greece-super-league',
  'Greece|Super League 2': 'greece-super-league-2',
  'Greece|Super League, Women': 'greece-super-league-women',
  'Guatemala|Liga Nacional. Clausura': 'guatemala-liga-nacional-clausura',
  'Guatemala|Primera Division': 'guatemala-primera-division',
  'Honduras|Liga Nacional. Clausura': 'honduras-liga-nacional-clausura',
  'Hong Kong, China|1. Division': 'hong-kong-china-1-division',
  'Hong Kong, China|Premier League': 'hong-kong-china-premier-league',
  'Hungary|Magyar Kupa': 'hungary-magyar-kupa',
  'Hungary|NB I': 'hungary-nb-i',
  'Hungary|NB I, Women': 'hungary-nb-i-women',
  'Hungary|NB II': 'hungary-nb-ii',
  'Hungary|NB III': 'hungary-nb-iii',
  'Hungary|U19 National': 'hungary-u19-national',
  'Iceland|Besta deild': 'iceland-besta-deild',
  'Iceland|Cup': 'iceland-cup',
  'Iceland|Super Cup': 'iceland-super-cup',
  'Iceland|Super Cup, Women': 'iceland-super-cup-women',
  'India|Goa Pro League': 'india-goa-pro-league',
  'India|I-League': 'india-i-league',
  'India|I-League 2': 'india-i-league-2',
  'India|Indian Super League': 'india-indian-super-league',
  'Indonesia|Liga 1': 'indonesia-liga-1',
  'Indonesia|Liga 2': 'indonesia-liga-2',
  'International|AFC Asian Cup QF': 'international-afc-asian-cup-qf',
  'International|Africa Cup of Nations Qualification': 'international-africa-cup-of-nations-qualification',
  'International|Africa Cup of Nations, Women': 'international-africa-cup-of-nations-women',
  'International|CONMEBOL Nations League, Women': 'international-conmebol-nations-league-women',
  'International|FIFA Series': 'international-fifa-series',
  'International|FIFA Series, Women': 'international-fifa-series-women',
  'International|FIFA World Cup, Women, Qualification, OFC': 'international-fifa-world-cup-women-qualification-ofc',
  'International|Int. Friendly Games': 'international-int-friendly-games',
  'International|Int. Friendly Games W': 'international-int-friendly-games-w',
  'International|UEFA Nations League': 'international-uefa-nations-league',
  'International|WC Qu. Int-Conf. Playoff': 'international-wc-qu-int-conf-playoff',
  'International|WC Qualification, UEFA': 'international-wc-qualification-uefa',
  'International|World Championship Qualification Women, Europe': 'international-world-championship-qualification-women-europe',
  'International|World Cup': 'international-world-cup',
  'International Clubs|AFC Challenge League': 'international-clubs-afc-challenge-league',
  'International Clubs|AFC Champions League Elite': 'international-clubs-afc-champions-league-elite',
  'International Clubs|AFC Champions League Two': 'international-clubs-afc-champions-league-two',
  "International Clubs|AFC Women's Champions League": "international-clubs-afc-women-s-champions-league",
  'International Clubs|CAF Champions League': 'international-clubs-caf-champions-league',
  'International Clubs|CAF Confederations Cup': 'international-clubs-caf-confederations-cup',
  'International Clubs|Club Friendly Games': 'international-clubs-club-friendly-games',
  'International Clubs|CONCACAF Champions Cup': 'international-clubs-concacaf-champions-cup',
  'International Clubs|Copa Libertadores': 'international-clubs-copa-libertadores',
  'International Clubs|Copa Sudamericana': 'international-clubs-copa-sudamericana',
  'International Clubs|UEFA Champions League': 'international-clubs-uefa-champions-league',
  'International Clubs|UEFA Champions League Women': 'international-clubs-uefa-champions-league-women',
  'International Clubs|UEFA Conference League': 'international-clubs-uefa-conference-league',
  'International Clubs|UEFA Europa Cup, Women': 'international-clubs-uefa-europa-cup-women',
  'International Clubs|UEFA Europa League': 'international-clubs-uefa-europa-league',
  'International Youth|Soccer.International Youth.U20 AFC Asian Cup, Women': 'international-youth-soccerinternational-youthu20-afc-asian-cup-women',
  'International Youth|U17 CONMEBOL Championship': 'international-youth-u17-conmebol-championship',
  'International Youth|U17 European Championship, Women, Qualification': 'international-youth-u17-european-championship-women-qualification',
  'International Youth|U17 UEFA European Championship, Qualification': 'international-youth-u17-uefa-european-championship-qualification',
  'International Youth|U19 European Championship, Qualification': 'international-youth-u19-european-championship-qualification',
  'International Youth|U19 European Championship, Women, Qualification': 'international-youth-u19-european-championship-women-qualification',
  'International Youth|U20 Friendly Games': 'international-youth-u20-friendly-games',
  'International Youth|U21 Friendly Games': 'international-youth-u21-friendly-games',
  'International Youth|U21 Premier League International Cup': 'international-youth-u21-premier-league-international-cup',
  'International Youth|U21 UEFA European Championship, Qualification': 'international-youth-u21-uefa-european-championship-qualification',
  'International Youth|U23 Friendly Games': 'international-youth-u23-friendly-games',
  'International Youth|UEFA Youth League': 'international-youth-uefa-youth-league',
  'Iran|Azadegan League': 'iran-azadegan-league',
  'Iraq|Iraqi League': 'iraq-iraqi-league',
  'Ireland|First Division': 'ireland-first-division',
  'Ireland|Premier Division': 'ireland-premier-division',
  'Ireland|Premier Division, Women': 'ireland-premier-division-women',
  'Israel|Liga Alef': 'israel-liga-alef',
  'Israel|National League': 'israel-national-league',
  'Israel|Premier League': 'israel-premier-league',
  'Israel|U19 Premier League': 'israel-u19-premier-league',
  'Italy|Coppa Italia': 'italy-coppa-italia',
  'Italy|Coppa Italia Primavera': 'italy-coppa-italia-primavera',
  'Italy|Coppa Italia Serie C': 'italy-coppa-italia-serie-c',
  'Italy|Coppa Italia, Women': 'italy-coppa-italia-women',
  'Italy|Primavera 1': 'italy-primavera-1',
  'Italy|Primavera 2': 'italy-primavera-2',
  'Italy|Serie A': 'italy-serie-a',
  'Italy|Serie A, Women': 'italy-serie-a-women',
  'Italy|Serie B': 'italy-serie-b',
  'Italy|Serie B, Women': 'italy-serie-b-women',
  'Italy|Serie C, Group A': 'italy-serie-c-group-a',
  'Italy|Serie C, Group B': 'italy-serie-c-group-b',
  'Italy|Serie C, Group C': 'italy-serie-c-group-c',
  'Italy|Serie D, Group A': 'italy-serie-d-group-a',
  'Italy|Serie D, Group B': 'italy-serie-d-group-b',
  'Italy|Serie D, Group C': 'italy-serie-d-group-c',
  'Italy|Serie D, Group D': 'italy-serie-d-group-d',
  'Italy|Serie D, Group E': 'italy-serie-d-group-e',
  'Italy|Serie D, Group F': 'italy-serie-d-group-f',
  'Italy|Serie D, Group G': 'italy-serie-d-group-g',
  'Italy|Serie D, Group H': 'italy-serie-d-group-h',
  'Italy|Serie D, Group I': 'italy-serie-d-group-i',
  'Jamaica|Premier League': 'jamaica-premier-league',
  'Japan|J.League': 'japan-jleague',
  'Japan|J. League': 'japan-jleague',
  'Japan|J. League 2': 'japan-jleague-2',
  'Japan|J1 League': 'japan-jleague',
  'Japan|J2 League': 'japan-jleague-2',
  'Japan|J.League 2': 'japan-jleague-2',
  'Japan|Nadeshiko League, Div 2, Women': 'japan-nadeshiko-league-div-2-women',
  'Japan|Nadeshiko League, Div. 1, Women': 'japan-nadeshiko-league-div-1-women',
  'Japan|WE League, Women': 'japan-we-league-women',
  'Jordan|Jordan League': 'jordan-jordan-league',
  'Kazakhstan|Kazakhstan Cup': 'kazakhstan-kazakhstan-cup',
  'Kazakhstan|Pervaya Liga': 'kazakhstan-pervaya-liga',
  'Kazakhstan|Premier League': 'kazakhstan-premier-league',
  'Kenya|Premier League': 'kenya-premier-league',
  'Kenya|Super League': 'kenya-super-league',
  'Kosovo|Kosovo FA Cup': 'kosovo-kosovo-fa-cup',
  'Kosovo|Superliga': 'kosovo-superliga',
  'Latvia|1.Liga': 'latvia-1liga',
  'Latvia|Virsliga': 'latvia-virsliga',
  'Lebanon|Premier League': 'lebanon-premier-league',
  'Lithuania|1 Lyga': 'lithuania-1-lyga',
  'Lithuania|A Lyga': 'lithuania-a-lyga',
  'Lithuania|II Lyga': 'lithuania-ii-lyga',
  'Lithuania|LFF Cup': 'lithuania-lff-cup',
  'Luxembourg|Division Nationale': 'luxembourg-division-nationale',
  "Luxembourg|Promotion d'Honneur": "luxembourg-promotion-d-honneur",
  'Malaysia|Liga A1': 'malaysia-liga-a1',
  'Malaysia|Piala Malaysia': 'malaysia-piala-malaysia',
  'Malaysia|Super League': 'malaysia-super-league',
  'Mali|Ligue 1': 'mali-ligue-1',
  'Malta|Challenge League': 'malta-challenge-league',
  'Malta|Premier League': 'malta-premier-league',
  'Mauritania|Super D2': 'mauritania-super-d2',
  'Mexico|Liga de Expansion MX, Clausura': 'mexico-liga-de-expansion-mx-clausura',
  'Mexico|Liga MX, Clausura': 'mexico-liga-mx-clausura',
  'Mexico|Liga MX, Women, Clausura': 'mexico-liga-mx-women-clausura',
  'Mexico|Liga Premier Serie A': 'mexico-liga-premier-serie-a',
  'Mexico|Liga Premier Serie B': 'mexico-liga-premier-serie-b',
  'Mexico|U21 Liga MX': 'mexico-u21-liga-mx',
  'Moldova|Cupa Moldovei': 'moldova-cupa-moldovei',
  'Moldova|Liga 1': 'moldova-liga-1',
  'Moldova|Super Liga': 'moldova-super-liga',
  'Montenegro|1. CFL': 'montenegro-1-cfl',
  'Montenegro|2. CFL': 'montenegro-2-cfl',
  'Morocco|Botola Pro D2': 'morocco-botola-pro-d2',
  'Netherlands|Derde Divisie': 'netherlands-derde-divisie',
  'Netherlands|Eerste Divisie': 'netherlands-eerste-divisie',
  'Netherlands|Eredivisie': 'netherlands-eredivisie',
  'Netherlands|Eredivisie, Women': 'netherlands-eredivisie-women',
  'Netherlands|KNVB beker': 'netherlands-knvb-beker',
  'Netherlands|Tweede Divisie': 'netherlands-tweede-divisie',
  'Netherlands|U21, Divisie 1': 'netherlands-u21-divisie-1',
  'New Zealand|National League': 'new-zealand-national-league',
  'Nicaragua|Liga de Ascenso': 'nicaragua-liga-de-ascenso',
  'Nigeria|Premier League': 'nigeria-premier-league',
  'North Macedonia|1. MFL': 'north-macedonia-1-mfl',
  'North Macedonia|Macedonia Cup': 'north-macedonia-macedonia-cup',
  'Northern Ireland|Championship': 'northern-ireland-championship',
  'Northern Ireland|Premiership': 'northern-ireland-premiership',
  'Norway|1st Division': 'norway-1st-division',
  'Norway|1st Division, Women': 'norway-1st-division-women',
  'Norway|2nd Division Group 1': 'norway-2nd-division-group-1',
  'Norway|2nd Division Group 2': 'norway-2nd-division-group-2',
  'Norway|3rd Division Group 1': 'norway-3rd-division-group-1',
  'Norway|3rd Division Group 2': 'norway-3rd-division-group-2',
  'Norway|3rd Division Group 3': 'norway-3rd-division-group-3',
  'Norway|3rd Division Group 4': 'norway-3rd-division-group-4',
  'Norway|3rd Division Group 5': 'norway-3rd-division-group-5',
  'Norway|3rd Division Group 6': 'norway-3rd-division-group-6',
  'Norway|Eliteserien': 'norway-eliteserien',
  'Norway|NM Cup': 'norway-nm-cup',
  'Norway|Toppserien, Women': 'norway-toppserien-women',
  'Oman|Omani League': 'oman-omani-league',
  'Panama|Liga Panamena de Futbol, Clausura': 'panama-liga-panamena-de-futbol-clausura',
  'Panama|Liga Prom': 'panama-liga-prom',
  'Paraguay|Camopeonato Femenino, Women': 'paraguay-camopeonato-femenino-women',
  'Paraguay|Division de Honor, Apertura': 'paraguay-division-de-honor-apertura',
  'Paraguay|Primera Division Reserve, Apertura': 'paraguay-primera-division-reserve-apertura',
  'Paraguay|Segunda Division': 'paraguay-segunda-division',
  'Peru|Liga 1': 'peru-liga-1',
  'Peru|Liga 2': 'peru-liga-2',
  'Peru|Liga Femenina': 'peru-liga-femenina',
  'Philippines|Philippines Footb. League': 'philippines-pfl',
  'Poland|1. Liga, Women': 'poland-1-liga-women',
  'Poland|CLJ': 'poland-clj',
  'Poland|Ekstraklasa': 'poland-ekstraklasa',
  'Poland|Ekstraliga, Women': 'poland-ekstraliga-women',
  'Poland|I Liga': 'poland-i-liga',
  'Poland|II Liga': 'poland-ii-liga',
  'Poland|III Liga, Group 1': 'poland-iii-liga-group-1',
  'Poland|III Liga, Group 2': 'poland-iii-liga-group-2',
  'Poland|III Liga, Group 3': 'poland-iii-liga-group-3',
  'Poland|III Liga, Group 4': 'poland-iii-liga-group-4',
  'Poland|Puchar Polski': 'poland-puchar-polski',
  'Poland|Puchar Polski, Women': 'poland-puchar-polski-women',
  'Portugal|Campeonato de Portugal': 'portugal-campeonato-de-portugal',
  'Portugal|Campeonato Nacional, Women': 'portugal-campeonato-nacional-women',
  'Portugal|II Divisao, Women': 'portugal-ii-divisao-women',
  'Portugal|Liga Portugal': 'portugal-liga-portugal',
  'Portugal|Liga Portugal 2': 'portugal-liga-portugal-2',
  'Portugal|Liga Portugal 3': 'portugal-liga-portugal-3',
  'Portugal|Taca de Portugal': 'portugal-taca-de-portugal',
  'Portugal|U19 Campeonato Nacional': 'portugal-u19-campeonato-nacional',
  'Portugal|U23 Liga Revelacao': 'portugal-u23-liga-revelacao',
  'Puerto Rico|LPR Pro': 'puerto-rico-lpr-pro',
  'Qatar|2nd Division League': 'qatar-2nd-division-league',
  'Qatar|QSL Cup': 'qatar-qsl-cup',
  'Qatar|Stars League': 'qatar-stars-league',
  'Qatar|U23 Olympic League': 'qatar-u23-olympic-league',
  'Republic of Korea|K-League 1': 'republic-of-korea-k-league-1',
  'Republic of Korea|K-League 2': 'republic-of-korea-k-league-2',
  'Republic of Korea|K3 League': 'republic-of-korea-k3-league',
  'Republic of Korea|WK-League': 'republic-of-korea-wk-league',
  'Romania|Liga 2': 'romania-liga-2',
  'Romania|Romania Cup': 'romania-romania-cup',
  'Romania|Superliga': 'romania-superliga',
  'Romania|Superliga, Women': 'romania-superliga-women',
  'Russia|1. Liga': 'russia-1-liga',
  'Russia|2. Liga, Division A': 'russia-2-liga-division-a',
  'Russia|2. Liga, Division B, Group 1': 'russia-2-liga-division-b-group-1',
  'Russia|2. Liga, Division B, Group 2': 'russia-2-liga-division-b-group-2',
  'Russia|2. Liga, Division B, Group 3': 'russia-2-liga-division-b-group-3',
  'Russia|2. Liga, Division B, Group 4': 'russia-2-liga-division-b-group-4',
  'Russia|Premier League': 'russia-premier-league',
  'Russia|Russian Cup': 'russia-russian-cup',
  'Russia|Superleague, Women': 'russia-superleague-women',
  'Russia|Youth League': 'russia-youth-league',
  'Rwanda|Premier League': 'rwanda-premier-league',
  'San Marino|Campionato Sammarinese': 'san-marino-campionato-sammarinese',
  'Saudi Arabia|Saudi Pro League': 'saudi-arabia-saudi-pro-league',
  'Saudi Arabia|Second Division': 'saudi-arabia-second-division',
  'Saudi Arabia|U21 Elite League': 'saudi-arabia-u21-elite-league',
  'Scotland|Challenge Cup': 'scotland-challenge-cup',
  'Scotland|Championship': 'scotland-championship',
  'Scotland|League 1': 'scotland-league-1',
  'Scotland|League 2': 'scotland-league-2',
  'Scotland|Premier League 2, Women': 'scotland-premier-league-2-women',
  'Scotland|Premier League Cup, Women': 'scotland-premier-league-cup-women',
  'Scotland|Premier League, Women': 'scotland-premier-league-women',
  'Scotland|Premiership': 'scotland-premiership',
  'Scotland|Scottish Cup': 'scotland-scottish-cup',
  'Senegal|Ligue 1': 'senegal-ligue-1',
  'Serbia|Prva Liga': 'serbia-prva-liga',
  'Serbia|Srpska Liga': 'serbia-srpska-liga',
  'Serbia|Superliga': 'serbia-superliga',
  'Serbia|U19 League': 'serbia-u19-league',
  'Singapore|Premier League': 'singapore-premier-league',
  'Singapore|Premier League 2': 'singapore-premier-league-2',
  'Slovakia|1. League Women': 'slovakia-1-league-women',
  'Slovakia|2. Liga': 'slovakia-2-liga',
  'Slovakia|3. Liga': 'slovakia-3-liga',
  'Slovakia|Slovensky Pohar': 'slovakia-slovensky-pohar',
  'Slovakia|Superliga': 'slovakia-superliga',
  'Slovakia|U19 1. Liga': 'slovakia-u19-1-liga',
  'Slovenia|2. Liga': 'slovenia-2-liga',
  'Slovenia|3. SNL': 'slovenia-3-snl',
  'Slovenia|PrvaLiga': 'slovenia-prvaliga',
  'Slovenia|Slovenia Cup': 'slovenia-slovenia-cup',
  'SoccerSpecials|Kings League Brazil': 'soccerspecials-kings-league-brazil',
  'SoccerSpecials|Kings League Spain': 'soccerspecials-kings-league-spain',
  'South Africa|Championship': 'south-africa-championship',
  'South Africa|Diski Challenge, Reserves': 'south-africa-diski-challenge-reserves',
  'South Africa|FA Cup': 'south-africa-fa-cup',
  'South Africa|Premiership': 'south-africa-premiership',
  'Spain|Copa del Rey': 'spain-copa-del-rey',
  'Spain|LaLiga': 'spain-laliga',
  'Spain|LaLiga 2': 'spain-laliga-2',
  'Spain|Primera Division Women': 'spain-primera-division-women',
  'Spain|Primera Federacion': 'spain-primera-federacion',
  'Spain|Primera Federacion, Women': 'spain-primera-federacion-women',
  'Spain|Segunda Federacion': 'spain-segunda-federacion',
  'Spain|U19 Division de Honor Juvenil': 'spain-u19-division-de-honor-juvenil',
  'Spain Amateur|Tercera Federacion, Group 1': 'spain-amateur-tercera-federacion-group-1',
  'Spain Amateur|Tercera Federacion, Group 10': 'spain-amateur-tercera-federacion-group-10',
  'Spain Amateur|Tercera Federacion, Group 11': 'spain-amateur-tercera-federacion-group-11',
  'Spain Amateur|Tercera Federacion, Group 12': 'spain-amateur-tercera-federacion-group-12',
  'Spain Amateur|Tercera Federacion, Group 13': 'spain-amateur-tercera-federacion-group-13',
  'Spain Amateur|Tercera Federacion, Group 14': 'spain-amateur-tercera-federacion-group-14',
  'Spain Amateur|Tercera Federacion, Group 15': 'spain-amateur-tercera-federacion-group-15',
  'Spain Amateur|Tercera Federacion, Group 16': 'spain-amateur-tercera-federacion-group-16',
  'Spain Amateur|Tercera Federacion, Group 17': 'spain-amateur-tercera-federacion-group-17',
  'Spain Amateur|Tercera Federacion, Group 18': 'spain-amateur-tercera-federacion-group-18',
  'Spain Amateur|Tercera Federacion, Group 2': 'spain-amateur-tercera-federacion-group-2',
  'Spain Amateur|Tercera Federacion, Group 3': 'spain-amateur-tercera-federacion-group-3',
  'Spain Amateur|Tercera Federacion, Group 4': 'spain-amateur-tercera-federacion-group-4',
  'Spain Amateur|Tercera Federacion, Group 5': 'spain-amateur-tercera-federacion-group-5',
  'Spain Amateur|Tercera Federacion, Group 6': 'spain-amateur-tercera-federacion-group-6',
  'Spain Amateur|Tercera Federacion, Group 7': 'spain-amateur-tercera-federacion-group-7',
  'Spain Amateur|Tercera Federacion, Group 8': 'spain-amateur-tercera-federacion-group-8',
  'Spain Amateur|Tercera Federacion, Group 9': 'spain-amateur-tercera-federacion-group-9',
  'Sweden|Allsvenskan': 'sweden-allsvenskan',
  'Sweden|Damallsvenskan': 'sweden-damallsvenskan',
  'Sweden|Division 2, Promotion Playoffs': 'sweden-division-2-promotion-playoffs',
  'Sweden|Ettan, Relegation/Promotion': 'sweden-ettan-relegation/promotion',
  'Sweden|Superettan': 'sweden-superettan',
  'Sweden Amateur|Elitettan, Women': 'sweden-amateur-elitettan-women',
  'Sweden Amateur|U19 Allsvenskan': 'sweden-amateur-u19-allsvenskan',
  'Sweden Amateur|U21 Ligacupen Elit': 'sweden-amateur-u21-ligacupen-elit',
  'Switzerland|Challenge League': 'switzerland-challenge-league',
  'Switzerland|Erste Liga': 'switzerland-erste-liga',
  'Switzerland|Promotion League': 'switzerland-promotion-league',
  'Switzerland|Schweizer Cup': 'switzerland-schweizer-cup',
  'Switzerland|Super League': 'switzerland-super-league',
  'Switzerland|Super League, Women': 'switzerland-super-league-women',
  'Switzerland|U19 Elite': 'switzerland-u19-elite',
  'Syria|Premier League': 'syria-premier-league',
  'Tanzania|Championship League': 'tanzania-championship-league',
  'Tanzania|Premier League': 'tanzania-premier-league',
  'Thailand|Thai League 1': 'thailand-thai-league-1',
  'Thailand|Thai League 2': 'thailand-thai-league-2',
  'Trinidad and Tobago|TT Premier League': 'trinidad-and-tobago-tt-premier-league',
  'Tunisia|Ligue 1': 'tunisia-ligue-1',
  'Tunisia|Ligue 2': 'tunisia-ligue-2',
  'Turkiye|1. Lig': 'turkiye-1-lig',
  'Turkiye|Super Lig': 'turkiye-super-lig',
  'Turkiye|Super Lig, Women': 'turkiye-super-lig-women',
  'Turkiye|Turkiye Kupasi': 'turkiye-turkiye-kupasi',
  'Turkiye Amateur|2. Lig': 'turkiye-amateur-2-lig',
  'Turkiye Amateur|3. Lig, Group 1': 'turkiye-amateur-3-lig-group-1',
  'Turkiye Amateur|3. Lig, Group 2': 'turkiye-amateur-3-lig-group-2',
  'Turkiye Amateur|3. Lig, Group 3': 'turkiye-amateur-3-lig-group-3',
  'Turkiye Amateur|3. Lig, Group 4': 'turkiye-amateur-3-lig-group-4',
  'Turkiye Amateur|U19 Elit A': 'turkiye-amateur-u19-elit-a',
  'Uganda|Premier League': 'uganda-premier-league',
  'Ukraine|Persha Liga': 'ukraine-persha-liga',
  'Ukraine|Premier League': 'ukraine-premier-league',
  'Ukraine|U19': 'ukraine-u19',
  'Ukraine|Ukraine Cup': 'ukraine-ukraine-cup',
  'United Arab Emirates|Arabian Gulf League': 'united-arab-emirates-arabian-gulf-league',
  'United Arab Emirates|First Division': 'united-arab-emirates-first-division',
  'United Arab Emirates|U23 Pro League': 'united-arab-emirates-u23-pro-league',
  'Uruguay|Primera Division': 'uruguay-primera-division',
  'Uruguay|Segunda Division': 'uruguay-segunda-division',
  'Uruguay|Tercera Division, Reserves': 'uruguay-tercera-division-reserves',
  'USA|MLS': 'usa-mls',
  'USA|MLS Next Pro': 'usa-mls-next-pro',
  'USA|National Womens Soccer League': 'usa-national-womens-soccer-league',
  'USA|US Open Cup': 'usa-us-open-cup',
  'USA|USL Championship': 'usa-usl-championship',
  'USA|USL League One': 'usa-usl-league-one',
  'USA|USL Super League, Women': 'usa-usl-super-league-women',
  'Uzbekistan|Cup': 'uzbekistan-cup',
  'Uzbekistan|Pro Liga': 'uzbekistan-pro-liga',
  'Venezuela|Primera Division': 'venezuela-primera-division',
  'Venezuela|Segunda Division': 'venezuela-segunda-division',
  'Vietnam|V-League 1': 'vietnam-v-league-1',
  'Vietnam|V-League 2': 'vietnam-v-league-2',
  'Wales|Cymru Championship South': 'wales-cymru-championship-south',
  'Wales|Cymru Championship, North': 'wales-cymru-championship-north',
  'Wales|Cymru Premier': 'wales-cymru-premier',
  'Wales|FAW Welsh Cup': 'wales-faw-welsh-cup',
  'Zambia|Super League': 'zambia-super-league',
  'Zimbabwe|Premier Soccer League': 'zimbabwe-premier-soccer-league',



  // === LiveScore name fixes (exact tournament names from live DB) ===
  'England|League 1':                         'england-league-one',
  'England|League 2':                         'england-league-two',
  'England|FA Trophy':                        'england-national-league',
  'England|National League North / South':    'england-national-league',
  'France|National 1':                        'france-national',
  'Italy|Serie C':                            'italy-serie-c',
  'Spain|Segunda B':                          'spain-segunda-federacion',
  'Spain|Super Cup':                          'spain-super-cup',
  'Portugal|Liga 3':                          'portugal-liga-3',
  'Poland|2nd Liga':                          'poland-i-liga',
  'Russia|Football National League':          'russia-fnl',
  'Russia|National Football League 2':        'russia-fnl-2',
  'Switzerland|1. Liga Promotion':            'switzerland-1-liga-promotion',
  'Croatia|2nd League':                       'croatia-druga-nl',
  'Slovakia|2nd League':                      'slovakia-2-liga',
  'Slovenia|2nd SNL':                         'slovenia-2-liga',
  'Bosnia and Herzegovina|1st League':        'bosnia-and-herzegovina-prva-liga-fbih',
  'Montenegro|2nd League':                    'montenegro-druga-crnogorska-liga',
  'Armenia|1st League':                       'armenia-first-league',
  'Bulgaria|Second Professional League':      'bulgaria-vtora-liga',
  'Lithuania|1st League':                     'lithuania-1-lyga',
  'North Macedonia|Vtora Liga':               'north-macedonia-vtora-liga',
  'Israel|Leumit League':                     'israel-leumit-league',
  'Cyprus|3. Division':                       'cyprus-3rd-division',
  'Czech Republic|3rd league':                'czechia-msfl',
  'Ireland|1st Division':                     'ireland-first-division',
  'Turkey|3rd Lig':                           'turkey-tff-2-lig',
  'Saudi Arabia|Division 1':                  'saudi-arabia-first-division',
  'Qatar|Stars League Cup':                   'qatar-stars-league',
  'Iraq|Premier League':                      'iraq-premier-league',
  'United Arab Emirates|Division 1':          'united-arab-emirates-uae-division-1',
  'Argentina|Liga Professional':              'argentina-liga-profesional',
  'Paraguay|Division Profesional':            'paraguay-division-de-honor-apertura',
  'Peru|Segunda Division':                    'peru-segunda-division',
  'Ecuador|Liga Pro Serie B':                 'ecuador-ligapro-primera-b',
  'Mexico|Liga Premier':                      'mexico-liga-premier-serie-a',
  'Brazil|Capixaba':                          'brazil-copa-espirito-santo',
  'Australia|New South Wales':                'australia-nsw-league-one',
  'Australia|Victorian':                      'australia-victoria-premier-league-1',
  'Austria|Regionalliga':                     'austria-amateur-regionalliga-ost',
  'Belgium|First Amateur Division':           'belgium-nationale-1-vv',
  'Rwanda|Championnat National':              'rwanda-premier-league',
  'Zambia|Premier League':                    'zambia-super-league',
  'Cameroon|Elite ONE':                       'cameroon-elite-one',
  'Cameroon|Elite Two':                       'cameroon-elite-two',
  'Ghana|Division One':                       'ghana-division-one',
  'DR Congo|Ligue 1':                         'dr-congo-linafoot',
  'Burkina Faso|Division 1':                  'burkina-faso-premiere-division',
  'Tunisia|Cup':                              'tunisia-coupe-de-tunisie',
  'Aruba|Division Di Honor':                  'aruba-division-di-honor',
  'Wales|Welsh Premier League':               'wales-cymru-premier',
  // International with empty category_name
  '|UEFA Nations League':                     'international-uefa-nations-league',
  '|World Cup UEFA Qualifiers':               'international-wc-qualification-uefa',
  '|World Cup Inter-Confederation Play-Off':  'international-wc-qu-int-conf-playoff',
  '|Africa Cup of Nations Qualifications':    'international-africa-cup-of-nations-qualification',
  '|Asian Cup Qualification':                 'international-afc-asian-cup-qf',
  '|Club Teams Friendlies':                   'international-clubs-club-friendly-games',
  '|National Teams Friendlies':              'international-int-friendly-games',

    // === LiveScore name aliases (LiveScore uses different tournament names) ===
  // England
  'England|Premier League': 'england-premier-league',
  'England|Championship': 'england-championship',
  'England|League One': 'england-league-one',
  'England|League Two': 'england-league-two',
  'England|National League': 'england-national-league',
  'England|FA Cup': 'england-fa-cup',
  'England|EFL Cup': 'england-league-cup',
  'England|Carabao Cup': 'england-league-cup',
  // Spain
  'Spain|La Liga': 'spain-la-liga',
  'Spain|Segunda Division': 'spain-segunda-federacion',
  'Spain|La Liga 2': 'spain-segunda-division',
  'Spain|Segunda Division': 'spain-segunda-division',
  'Spain|Copa del Rey': 'spain-copa-del-rey',
  // Germany
  'Germany|Bundesliga': 'germany-bundesliga',
  'Germany|2. Bundesliga': 'germany-2-bundesliga',
  'Germany|DFB-Pokal': 'germany-dfb-pokal',
  // Italy
  'Italy|Serie A': 'italy-serie-a',
  'Italy|Serie B': 'italy-serie-b',
  'Italy|Coppa Italia': 'italy-coppa-italia',
  // France
  'France|Ligue 1': 'france-ligue-1',
  'France|Ligue 2': 'france-ligue-2',
  // Netherlands
  'Netherlands|Eredivisie': 'netherlands-eredivisie',
  'Netherlands|Eerste Divisie': 'netherlands-eerste-divisie',
  'Netherlands|KNVB Beker': 'netherlands-knvb-cup',
  // Portugal
  'Portugal|Primeira Liga': 'portugal-primeira-liga',
  'Portugal|Liga Portugal': 'portugal-primeira-liga',
  'Portugal|Liga 2': 'portugal-liga-portugal-2',
  'Portugal|Segunda Liga': 'portugal-segunda-liga',
  // Belgium
  'Belgium|First Division A': 'belgium-pro-league',
  'Belgium|Jupiler Pro League': 'belgium-pro-league',
  'Belgium|Pro League': 'belgium-pro-league',
  'Belgium|First Division B': 'belgium-challenger-pro-league',
  // Turkey
  'Turkey|Süper Lig': 'turkey-super-lig',
  'Turkey|Super Lig': 'turkey-super-lig',
  'Turkey|TFF First League': 'turkiye-1-lig',
  'Turkey|1. Lig': 'turkiye-1-lig',
  'Turkey|2nd Lig': 'turkiye-1-lig',
  // Scotland
  'Scotland|Premiership': 'scotland-premiership',
  'Scotland|Championship': 'scotland-championship',
  // Greece
  'Greece|Super League': 'greece-super-league',
  // Switzerland
  'Switzerland|Super League': 'switzerland-super-league',
  // Austria
  'Austria|Bundesliga': 'austria-bundesliga',
  // Denmark
  'Denmark|Superliga': 'denmark-superliga',
  'Denmark|1st Division': 'denmark-1-division',
  // Sweden
  'Sweden|Allsvenskan': 'sweden-allsvenskan',
  // Norway
  'Norway|Eliteserien': 'norway-eliteserien',
  // Poland
  'Poland|Ekstraklasa': 'poland-ekstraklasa',
  // Russia
  'Russia|Premier League': 'russia-premier-league',
  // Ukraine
  'Ukraine|Premier League': 'ukraine-premier-league',
  // Croatia
  'Croatia|Prva HNL': 'croatia-prva-nl',
  'Croatia|HNL': 'croatia-hnl',
  // Czech Republic (LiveScore uses this name)
  'Czech Republic|Fortuna Liga': 'czechia-1-liga',
  'Czech Republic|1. Liga': 'czechia-1-liga',
  'Czechia|Fortuna Liga': 'czechia-1-liga',
  // Hungary
  'Hungary|OTP Bank Liga': 'hungary-otp-bank-liga',
  'Hungary|NB I': 'hungary-otp-bank-liga',
  // Romania
  'Romania|Liga I': 'romania-liga-i',
  // Bulgaria
  'Bulgaria|First Professional League': 'bulgaria-parva-liga',
  'Bulgaria|Parva Liga': 'bulgaria-parva-liga',
  // Serbia
  'Serbia|Super Liga': 'serbia-super-liga',
  // Bosnia
  'Bosnia and Herzegovina|Premijer Liga': 'bosnia-&-herzegovina-premijer-liga',
  'Bosnia & Herzegovina|Premijer Liga': 'bosnia-&-herzegovina-premijer-liga',
  // Belarus
  'Belarus|Vysheyshaya Liga': 'belarus-vysshaya-liga',
  // Slovakia
  'Slovakia|Super Liga': 'slovakia-super-liga',
  'Slovakia|Niké Liga': 'slovakia-super-liga',
  // Slovenia
  'Slovenia|PrvaLiga': 'slovenia-prva-liga',
  'Slovenia|1. SNL': 'slovenia-prva-liga',
  // Cyprus
  'Cyprus|First Division': 'cyprus-1st-division',
  // Kosovo
  'Kosovo|Super League': 'kosovo-super-league',
  // --- South America ---
  'Argentina|Liga Profesional de Fútbol': 'argentina-liga-profesional',
  'Argentina|Primera Division': 'argentina-liga-profesional',
  'Argentina|Primera Nacional': 'argentina-primera-nacional',
  'Argentina|Primera B Metropolitana': 'argentina-primera-b',
  'Argentina|Copa Argentina': 'argentina-copa-argentina',
  'Brazil|Brasileirao Serie A': 'brazil-brasileiro-serie-a',
  'Brazil|Série A': 'brazil-brasileiro-serie-a',
  'Brazil|Serie A': 'brazil-brasileiro-serie-a',
  'Brazil|Série B': 'brazil-brasileiro-serie-b',
  'Brazil|Serie B': 'brazil-brasileiro-serie-b',
  'Brazil|Série C': 'brazil-brasileiro-serie-c',
  'Brazil|Copa do Nordeste': 'brazil-copa-do-nordeste',
  'Uruguay|Primera División': 'uruguay-primera-division',
  'Uruguay|Primera Division': 'uruguay-primera-division',
  'Colombia|Primera A': 'colombia-primera-a-apertura',
  'Colombia|Categoría Primera A': 'colombia-primera-a-apertura',
  'Chile|Primera División': 'chile-primera-division',
  'Chile|Primera Division': 'chile-primera-division',
  'Chile|Primera B': 'chile-primera-b',
  'Paraguay|Primera División': 'paraguay-division-de-honor-apertura',
  'Ecuador|LigaPro': 'ecuador-ligapro-primera-a',
  'Peru|Liga 1': 'peru-liga-1',
  'Bolivia|Liga de Fútbol Profesional Boliviano': 'bolivia-division-profesional',
  'Venezuela|Primera División': 'venezuela-primera-division',
  // --- CONCACAF ---
  'USA|Major League Soccer': 'usa-mls',
  'USA|MLS': 'usa-mls',
  'USA|USL Championship': 'usa-usl-championship',
  'USA|USL League One': 'usa-usl-league-one',
  'USA|USL Super League': 'usa-usl-super-league',
  'USA|NWSL': 'usa-nwsl',
  'Mexico|Liga MX': 'mexico-liga-mx-clausura',
  'Mexico|Liga de Expansión MX': 'mexico-liga-de-expansion-mx-clausura',
  'Mexico|Copa MX': 'mexico-copa-mx',
  'Canada|Canadian Premier League': 'canada-canadian-premier-league',
  'Guatemala|Liga Nacional': 'guatemala-liga-nacional-clausura',
  'Costa Rica|Primera Division': 'costa-rica-primera-division-clausura',
  'Panama|LPF': 'panama-liga-panamena-de-futbol-clausura',
  'Honduras|Liga Nacional': 'honduras-liga-nacional-apertura',
  'El Salvador|Primera Division': 'el-salvador-primera-division-apertura',
  // --- Africa ---
  'Nigeria|NPFL': 'nigeria-premier-league',
  'Nigeria|Nigerian Premier Football League': 'nigeria-premier-league',
  'Nigeria|Premier League': 'nigeria-premier-league',
  'Ghana|Ghana Premier League': 'ghana-premier-league',
  'Ghana|Premier League': 'ghana-premier-league',
  'South Africa|DStv Premiership': 'south-africa-premiership',
  'South Africa|PSL': 'south-africa-premiership',
  'South Africa|Premiership': 'south-africa-premiership',
  'Egypt|Egyptian Premier League': 'egypt-premier-league',
  'Egypt|Premier League': 'egypt-premier-league',
  'Morocco|Botola Pro': 'morocco-botola-pro-d2',
  'Tunisia|Ligue Professionnelle 1': 'tunisia-ligue-1',
  'Algeria|Ligue Professionnelle 1': 'algeria-ligue-1',
  'Cameroon|Elite One': 'cameroon-elite-one',
  'Kenya|Premier League': 'kenya-premier-league',
  'Kenya|Super League': 'kenya-super-league',
  'Tanzania|Premier League': 'tanzania-premier-league',
  'Uganda|Premier League': 'uganda-premier-league',
  'Zambia|Super League': 'zambia-super-league',
  'Zimbabwe|Premier Soccer League': 'zimbabwe-premier-soccer-league',
  'Rwanda|Premier League': 'rwanda-premier-league',
  'Senegal|Ligue 1': 'senegal-ligue-1',
  'Angola|Girabola': 'angola-girabola',
  'Ethiopia|Premier League': 'ethiopia-premier-league',
  'Burkina Faso|Première Division': 'burkina-faso-premiere-division',
  'Ivory Coast|Ligue 1': 'ivory-coast-ligue-1',
  "Côte d'Ivoire|Ligue 1": 'ivory-coast-ligue-1',
  // --- Asia ---
  'Japan|J1 League': 'japan-j1-league',
  'Japan|J. League': 'japan-j1-league',
  'Japan|J. League 2': 'japan-jleague-2',
  'Japan|J2 League': 'japan-jleague-2',
  'Japan|J3 League': 'japan-j3-league',
  'South Korea|K League 1': 'republic-of-korea-k-league-1',
  'South Korea|K League 2': 'republic-of-korea-k-league-2',
  'Republic of Korea|K League 1': 'republic-of-korea-k-league-1',
  'Republic of Korea|K League 2': 'republic-of-korea-k-league-2',
  'Republic of Korea|K3 League': 'republic-of-korea-k3-league',
  'China|Chinese Super League': 'china-chinese-super-league',
  'China|China League 1': 'china-china-league-1',
  'Saudi Arabia|Saudi Pro League': 'saudi-arabia-professional-league',
  'Saudi Arabia|Professional League': 'saudi-arabia-professional-league',
  'Saudi Arabia|First Division': 'saudi-arabia-first-division',
  'Iran|Persian Gulf Pro League': 'iran-persian-gulf-pro-league',
  'UAE|Arabian Gulf League': 'united-arab-emirates-arabian-gulf-league',
  'Qatar|Stars League': 'qatar-stars-league',
  'Kuwait|Premier League': 'kuwait-premier-league',
  'Bahrain|Premier League': 'bahrain-premier-league',
  'India|Indian Super League': 'india-super-league',
  'India|I-League': 'india-i-league',
  'Thailand|Thai League 1': 'thailand-thai-league-1',
  'Malaysia|Super League': 'malaysia-super-league',
  'Indonesia|Liga 1': 'indonesia-liga-1',
  'Vietnam|V.League 1': 'vietnam-v-league-1',
  'Singapore|Premier League': 'singapore-premier-league',
  'Philippines|PFL': 'philippines-pfl',
  // --- Oceania ---
  'Australia|A-League': 'australia-a-league',
  'Australia|A-League Men': 'australia-a-league',
  // --- International ---
  'International|UEFA Nations League': 'international-uefa-nations-league',
  'International|Nations League': 'international-uefa-nations-league',
  'International|FIFA World Cup': 'international-world-cup',
  'International|World Cup': 'international-world-cup',
  'International|African Cup of Nations': 'international-africa-cup-of-nations-qualification',
  'International|AFCON': 'international-africa-cup-of-nations-qualification',
  'International|Friendly': 'international-int-friendly-games',
  'International|International Friendlies': 'international-int-friendly-games',
  'International|Club Friendly': 'international-clubs-club-friendly-games',
  'International|CAF Champions League': 'international-clubs-caf-champions-league',
  'International|CAF Confederations Cup': 'international-clubs-caf-confederations-cup',
  'International|Copa Libertadores': 'international-clubs-copa-libertadores',
  'International|Copa Sudamericana': 'international-clubs-copa-sudamericana',
  'International|Champions League': 'international-clubs-uefa-champions-league',
  'International|UEFA Champions League': 'international-clubs-uefa-champions-league',
  'International|UEFA Europa League': 'international-clubs-uefa-europa-league',
  'International|Europa League': 'international-clubs-uefa-europa-league',
  'International|UEFA Conference League': 'international-clubs-uefa-conference-league',
  'International|Conference League': 'international-clubs-uefa-conference-league',
  'International|AFC Champions League': 'international-clubs-afc-champions-league-elite',
  'International|CONCACAF Champions Cup': 'international-clubs-concacaf-champions-cup',
  // UEFA fallbacks when country_name is "UEFA" or empty  
  'UEFA|Champions League': 'international-clubs-uefa-champions-league',
  'UEFA|Europa League': 'international-clubs-uefa-europa-league',
  'UEFA|Conference League': 'international-clubs-uefa-conference-league',
  'UEFA|Nations League': 'international-uefa-nations-league',

};

// Fuzzy fallback by tournament name only (for when country name doesn't match)
const FUZZY_MAP = {
  'champions league':   'international-clubs-uefa-champions-league',
  'europa league':      'international-clubs-uefa-europa-league',
  'conference league':  'international-clubs-uefa-conference-league',
  'nations league':     'international-uefa-nations-league',
  'copa libertadores':  'international-clubs-copa-libertadores',
  'copa sudamericana':  'international-clubs-copa-sudamericana',
  'caf champions':      'international-clubs-caf-champions-league',
  'afc champions':      'international-clubs-afc-champions-league-elite',
  'friendly':           'international-int-friendly-games',
};

// Leagues split into groups on odds-api.io — try all groups and merge
const MULTI_SLUG_MAP = {
  'Italy|Serie C': ['italy-serie-c-group-a', 'italy-serie-c-group-b', 'italy-serie-c-group-c'],
  'Italy|Serie D': ['italy-serie-d-group-a', 'italy-serie-d-group-b', 'italy-serie-d-group-c', 'italy-serie-d-group-d', 'italy-serie-d-group-e', 'italy-serie-d-group-f', 'italy-serie-d-group-g'],
};


async function ensureTables() {
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS odds_league_cache (league_slug TEXT PRIMARY KEY, events_json TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')))`);
    await db.execute(`CREATE TABLE IF NOT EXISTS fixture_odds (id INTEGER PRIMARY KEY AUTOINCREMENT, fixture_id TEXT NOT NULL UNIQUE, home REAL, draw REAL, away REAL, over_1_5 REAL, under_1_5 REAL, over_2_5 REAL, under_2_5 REAL, over_3_5 REAL, under_3_5 REAL, btts_yes REAL, btts_no REAL, over_under TEXT, bookmaker TEXT DEFAULT 'SportyBet', fetched_at TEXT DEFAULT (datetime('now')))`);
    for (const col of ['over_1_5','under_1_5','over_2_5','under_2_5','over_3_5','under_3_5','btts_yes','btts_no','bookmaker']) {
      try { await db.execute(`ALTER TABLE fixture_odds ADD COLUMN ${col} ${col==='bookmaker'?"TEXT DEFAULT 'SportyBet'":'REAL'}`); } catch {}
    }
    // Bet links
    try { await db.execute("ALTER TABLE fixture_odds ADD COLUMN bet_link_sportybet TEXT"); } catch {}
    try { await db.execute("ALTER TABLE fixture_odds ADD COLUMN bet_link_bet365 TEXT"); } catch {}
    try { await db.execute("ALTER TABLE fixture_odds ADD COLUMN ev_value REAL"); } catch {}
    try { await db.execute("ALTER TABLE fixture_odds ADD COLUMN ev_market TEXT"); } catch {}
  } catch (err) { console.error('[OddsService] Table init:', err.message); }
}
ensureTables();

// Clear stale league cache on startup so new slug mappings take effect immediately
// (league cache rebuilds automatically on next prediction request)
async function clearStaleLeagueCache() {
  try {
    const result = await db.execute("DELETE FROM odds_league_cache");
    console.log('[OddsService] Cleared league cache — fresh mappings will be fetched on demand');
  } catch (e) {
    console.warn('[OddsService] Could not clear league cache:', e.message);
  }
}
clearStaleLeagueCache();

// ── Team alias map: LiveScore name → odds-api.io name ──────────────────────
// Keys are normalized lowercase. Used when direct matching fails.
const TEAM_ALIASES = {
  // Brazil Serie A - nicknames vs official names
  'atletico pr':                    'ca paranaense pr',
  'athletico pr':                   'ca paranaense pr',
  'athletico paranaense':           'ca paranaense pr',
  'atletico paranaense':            'ca paranaense pr',
  'botafogo rj':                    'botafogo fr rj',
  'botafogo':                       'botafogo fr rj',
  'flamengo':                       'cr flamengo rj',
  'flamengo rj':                    'cr flamengo rj',
  'vasco':                          'cr vasco da gama rj',
  'vasco da gama':                  'cr vasco da gama rj',
  'vasco rj':                       'cr vasco da gama rj',
  'gremio':                         'gremio fb porto alegrense rs',
  'gremio rs':                      'gremio fb porto alegrense rs',
  'palmeiras':                      'se palmeiras sp',
  'corinthians':                    'corinthians sp',
  'sao paulo':                      'sao paulo sp',
  'internacional':                  'internacional rs',
  'inter rs':                       'internacional rs',
  'atletico mg':                    'atletico mineiro mg',
  'atletico mineiro':               'atletico mineiro mg',
  'cruzeiro':                       'cruzeiro ec mg',
  'bahia':                          'ec bahia ba',
  'vitoria':                        'ec vitoria ba',
  'fluminense':                     'fluminense fc rj',
  'bragantino':                     'red bull bragantino sp',
  'rb bragantino':                  'red bull bragantino sp',
  // Brazil Copa Nordeste
  'sport recife':                   'sc recife pe',
  'imperatriz':                     'sd imperatriz ma',
  'fortaleza':                      'fortaleza ec ce',
  'itabaiana':                      'ao itabaiana se',
  'fluminense ec pi':               'fluminense ec pi',
  'juazeirense':                    'sd juazeirense ba',
  'sousa pb':                       'sousa ec pb',
  'retro':                          'retro fc pe',
  // Argentina
  'san lorenzo':                    'ca san lorenzo de almagro',
  'lanus':                          'ca lanus',
  'racing':                         'racing club montevideo',
  'racing club':                    'racing club de avellaneda',
  'independiente':                  'ca independiente',
  'huracan':                        'ca huracan',
  'deportivo riestra':              'deportivo riestra afbc',
  'argentinos juniors':             'argentinos juniors',
  // Uruguay
  'cerro':                          'cerro largo fc',
  'boston river':                   'ca boston river',
  'danubio':                        'danubio fc',
  'juventud de las piedras':        'ca juventud de las piedras',
  'ca progreso montevideo':         'liverpool montevideo',
  // Colombia
  'cucuta':                         'cucuta deportivo fc',
  'deportivo pereira':              'deportivo pereira fc sa',
  'fortaleza':                      'fortaleza fc',
  'envigado':                       'envigado fc',
  'leones fc':                      'itagui leones fc',
  'internacional palmira':          'internacional fc de palmira',
  'deportes quindio':               'deportes quindio',
  'orsomarso':                      'orsomarso sc',
  'barranquilla fc':                'barranquilla fc',
  // England
  'man city':                       'manchester city',
  'man utd':                        'manchester united',
  'man united':                     'manchester united',
  'spurs':                          'tottenham hotspur',
  'wolves':                         'wolverhampton wanderers',
  // England FA Trophy / National League - add FC suffix handling
  'gateshead fc':                   'gateshead fc',
  'york city':                      'york city fc',
  'solihull moors':                 'solihull moors fc',
  'forest green rovers':            'forest green rovers',
  'tamworth':                       'tamworth fc',
  'eastleigh':                      'eastleigh fc',
  'truro city':                     'truro city',
  'boreham wood':                   'boreham wood fc',
  'woking':                         'woking fc',
  'southend united':                'hartlepool united', // wrong match - skip
  // Scotland - add FC suffix
  'raith rovers':                   'raith rovers fc',
  'partick thistle':                'partick thistle fc',
  'stranraer':                      'stranraer fc',
  'clyde':                          'clyde fc',
  'queen of south':                 'queen of the south fc',
  // Armenia
  'shirak ii':                      'fc shirak gyumri 2',
  'noah ii':                        'noah yerevan 2',
  'araks':                          'fc ararati araks',
  'lernayin artsakh':               'lernayin artsakh fc',
  // Jamaica
  'cavaliers fc':                   'cavalier fc',
  'dunbeholden fc':                 'dunbeholden fc',
  'racing united':                  'portmore united',
  // Philippines
  'philippine army':                'philippine army',
  'taguig':                         'taguig fc',
  'tuloy':                          'tuloy fc',
  'manila digger':                  'manila digger fc',
  // India
  'aizawl':                         'aizawl fc',
  'real kashmir':                   'real kashmir',
  'namdhari':                       'namdhari fc',
  'sreenidi deccan':                'sreenidi deccan fc',
  // Cameroon
  'canon de yaounde':               'fauve azur de yaounde',
  'fc gazelle':                     'gazelle fa de garoua',
  // Mexico
  'mineros de zacatecas':           'cd mineros de zacatecas',
  'tapatio':                        'tapatio fc',
  // Netherlands
  'cambuur':                        'sc cambuur',
  // Paraguay
  'guarani':                        'club guarani asuncion',
  '2 de mayo':                      'cs 2 de mayo',
  // Qatar
  'al rayyan sc':                   'al rayyan sc',
  // USA
  'lexington':                      'lexington sc',
  'brooklyn':                       'brooklyn fc',
  'sporting jax':                   'sporting jax',
  'one knoxville':                  'one knoxville sc',
  'corpus christi':                 'corpus christi fc',
  'greenville triumph sc':          'greenville triumph sc',
  // Bulgaria
  'cska 1948 sofia ii':             'pfc cska sofia ii',
  'cska sofia ii':                  'pfc cska sofia ii',
  'spartak pleven':                 'pfc spartak pleven',
  'belasitsa petrich':              'pfc belasitsa petrich',
  'sevlievo':                       'fk sevlievo',
  'dunav ruse':                     'fc dunav ruse',
  'hebar pazardzhik':               'fk hebar pazardzhik',
  // Trinidad & Tobago
  'caledonia':                      'caledonia aia',
  // Rwanda
  'bugesera':                       'bugesera fc',
  'al hilal omdurman':              'al hilal (sdn)',
  // Spain
  'atletico madrid':                'atletico de madrid',
  'atletico':                       'atletico de madrid',
  'betis':                          'real betis',
  // Germany
  'dortmund':                       'borussia dortmund',
  'm gladbach':                     'borussia monchengladbach',
  // Italy
  'inter milan':                    'inter',
  'ac milan':                       'milan',
  // Korea
  'republic of korea':              'south korea',
}

function normalize(name) {
  return String(name||'').toLowerCase()
    .replace(/\bfc\b|\bsc\b|\bac\b|\bcf\b|\bif\b|\bfk\b|\bsk\b|\bik\b|\bca\b|\bcr\b|\bec\b|\bse\b|\bcd\b|\bad\b|\bfr\b|\bfb\b/g,'')
    .replace(/[^a-z0-9\s]/g,'')
    .replace(/\s+/g,' ').trim();
}

// Extract trailing 2-letter state/country code (e.g. 'PR', 'RJ', 'MG', 'SP')
function getStateCode(name) {
  const m = String(name||'').trim().match(/\b([A-Z]{2})$/);
  return m ? m[1] : null;
}

function teamMatch(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Alias lookup both ways
  const aliasA = TEAM_ALIASES[na] || TEAM_ALIASES[String(a).toLowerCase().trim()];
  const aliasB = TEAM_ALIASES[nb] || TEAM_ALIASES[String(b).toLowerCase().trim()];
  if (aliasA && normalize(aliasA) === nb) return true;
  if (aliasB && normalize(aliasB) === na) return true;
  if (aliasA && aliasB && normalize(aliasA) === normalize(aliasB)) return true;

  // State code guard: if BOTH names have a 2-letter state suffix, they must match
  const stateA = getStateCode(String(a).trim());
  const stateB = getStateCode(String(b).trim());
  if (stateA && stateB && stateA !== stateB) return false; // different states = different club

  // Substring match
  if (na.length > 4 && nb.includes(na)) return true;
  if (nb.length > 4 && na.includes(nb)) return true;

  // Word-level match (meaningful words >= 4 chars)
  const wordsA = na.split(' ').filter(w => w.length >= 4);
  const wordsB = nb.split(' ').filter(w => w.length >= 4);
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wa === wb) return true;
      // 1-char edit distance for typos/abbreviations
      if (wa.length >= 5 && wb.length >= 5) {
        const shorter = wa.length <= wb.length ? wa : wb;
        const longer  = wa.length <= wb.length ? wb : wa;
        let diff = longer.length - shorter.length;
        for (let i = 0; i < shorter.length && diff <= 1; i++) {
          if (shorter[i] !== longer[i]) diff++;
        }
        if (diff <= 1) return true;
      }
    }
  }
  // First token match (city name)
  const firstA = na.split(' ')[0];
  const firstB = nb.split(' ')[0];
  if (firstA.length >= 5 && firstA === firstB) return true; // bumped to 5 to avoid false positives
  return false;
}

function getLeagueSlug(tournamentName, countryName) {
  if (!tournamentName) return null;
  const country = String(countryName||'').trim();
  const exactKey = `${country}|${tournamentName}`;
  // 0. Check multi-slug leagues (split into groups)
  if (MULTI_SLUG_MAP[exactKey]) return MULTI_SLUG_MAP[exactKey]; // returns array
  // 1. Exact country+tournament match
  if (EXACT_MAP[exactKey]) return EXACT_MAP[exactKey];
  // 2. Try common alternative country names
  const countryAliases = {
    'Republic of Korea': 'South Korea',
    'South Korea': 'Republic of Korea',
    "Côte d'Ivoire": 'Ivory Coast',
    'Ivory Coast': "Côte d'Ivoire",
    'Czech Republic': 'Czechia',
    'Czechia': 'Czech Republic',
    'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
    'Bosnia & Herzegovina': 'Bosnia and Herzegovina',
  };
  if (countryAliases[country]) {
    const altKey = `${countryAliases[country]}|${tournamentName}`;
    if (EXACT_MAP[altKey]) return EXACT_MAP[altKey];
  }
  // 3. Tournament name only (scan all entries)
  const nameOnly = Object.entries(EXACT_MAP).find(([k]) => k.split('|')[1] === tournamentName);
  if (nameOnly) return nameOnly[1];
  // 4. Fuzzy on tournament name
  const lower = tournamentName.toLowerCase();
  for (const [key, slug] of Object.entries(FUZZY_MAP)) {
    if (lower.includes(key)) return slug;
  }
  return null;
}

function parseBookmakerOdds(markets) {
  const r = { home:null,draw:null,away:null,over_1_5:null,under_1_5:null,over_2_5:null,under_2_5:null,over_3_5:null,under_3_5:null,btts_yes:null,btts_no:null };
  if (!Array.isArray(markets)) return r;
  for (const market of markets) {
    const name = String(market.name||'').toLowerCase();
    const odds = Array.isArray(market.odds) ? market.odds : [];
    if (name==='ml'||name==='1x2'||name==='match result'||name==='match winner') {
      const row=odds[0]||{};
      if (row.home) r.home=parseFloat(row.home);
      if (row.draw) r.draw=parseFloat(row.draw);
      if (row.away) r.away=parseFloat(row.away);
    }
    if (name==='totals'||name==='goals over/under'||name==='total goals'||name.includes('total')) {
      for (const row of odds) {
        const hdp=parseFloat(row.hdp);
        if (hdp===1.5){if(row.over)r.over_1_5=parseFloat(row.over);if(row.under)r.under_1_5=parseFloat(row.under);}
        if (hdp===2.5){if(row.over)r.over_2_5=parseFloat(row.over);if(row.under)r.under_2_5=parseFloat(row.under);}
        if (hdp===3.5){if(row.over)r.over_3_5=parseFloat(row.over);if(row.under)r.under_3_5=parseFloat(row.under);}
      }
    }
    if (name==='both teams to score'||name==='btts'||name==='gg/ng'||name==='both to score') {
      const row=odds[0]||{};
      if(row.yes)r.btts_yes=parseFloat(row.yes);
      if(row.no)r.btts_no=parseFloat(row.no);
    }
  }
  return r;
}

async function fetchLeagueEvents(leagueSlug) {
  if (!ODDS_API_KEY) return [];
  // Handle array of slugs (for leagues split into groups like Italy Serie C)
  if (Array.isArray(leagueSlug)) {
    const all = [];
    for (const slug of leagueSlug) {
      const events = await fetchLeagueEvents(slug);
      all.push(...events);
    }
    return all;
  }
  try {
    const cached = await db.execute({ sql:`SELECT events_json FROM odds_league_cache WHERE league_slug=? AND fetched_at>datetime('now','-${LEAGUE_CACHE_HOURS} hours') LIMIT 1`, args:[leagueSlug] });
    if (cached.rows?.[0]?.events_json) { return JSON.parse(cached.rows[0].events_json); }
  } catch {}
  try {
    const url=`${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${encodeURIComponent(leagueSlug)}&limit=200`;
    const res=await fetch(url);
    if (!res.ok) { console.error(`[OddsService] ${res.status} for ${leagueSlug}`); return []; }
    const data=await res.json();
    const events=(Array.isArray(data)?data:(data.data||[])).filter(e=>!e.status||e.status==='upcoming'||e.status==='pending');
    await db.execute({ sql:`INSERT OR REPLACE INTO odds_league_cache (league_slug,events_json,fetched_at) VALUES (?,?,datetime('now'))`, args:[leagueSlug,JSON.stringify(events)] });
    console.log(`[OddsService] Fetched ${events.length} events for ${leagueSlug}`);
    return events;
  } catch (err) { console.error('[OddsService] fetchLeagueEvents:', err.message); return []; }
}

async function fetchEventOdds(eventId) {
  if (!ODDS_API_KEY||!eventId) return null;
  try {
    const url=`${ODDS_API_BASE}/odds?apiKey=${ODDS_API_KEY}&eventId=${eventId}&bookmakers=${encodeURIComponent(BOOKMAKERS)}`;
    const res=await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function fetchAndCacheOddsForFixture(fixtureId, homeTeam, awayTeam, tournamentName, countryName) {
  if (!ODDS_API_KEY) {
    if (!globalThis.__oddsKeyWarned) { console.warn('[OddsService] ODDS_API_KEY not set'); globalThis.__oddsKeyWarned=true; }
    return null;
  }
  // Check fixture cache
  try {
    const cached=await db.execute({ sql:`SELECT * FROM fixture_odds WHERE fixture_id=? AND fetched_at>datetime('now','-${FIXTURE_CACHE_HOURS} hours') LIMIT 1`, args:[String(fixtureId)] });
    if (cached.rows?.[0]?.home) {
      const r=cached.rows[0];
      return {home:r.home,draw:r.draw,away:r.away,over_1_5:r.over_1_5,under_1_5:r.under_1_5,over_2_5:r.over_2_5,under_2_5:r.under_2_5,over_3_5:r.over_3_5,under_3_5:r.under_3_5,btts_yes:r.btts_yes,btts_no:r.btts_no,betLinkSportybet:r.bet_link_sportybet,betLinkBet365:r.bet_link_bet365};
    }
  } catch {}

  const leagueSlug=getLeagueSlug(tournamentName, countryName);
  if (!leagueSlug) {
    console.log(`[OddsService] No slug found: "${countryName}|${tournamentName}" — not in mapping`);
    return null;
  }
  console.log(`[OddsService] Mapped "${countryName}|${tournamentName}" → ${leagueSlug}`);

  const events=await fetchLeagueEvents(leagueSlug);
  if (!events.length) { console.log(`[OddsService] No events returned for ${leagueSlug}`); return null; }

  const matched=events.find(ev=>teamMatch(ev.home,homeTeam)&&teamMatch(ev.away,awayTeam));
  if (!matched) {
    console.log(`[OddsService] No team match: "${homeTeam}" vs "${awayTeam}" in ${events.length} ${leagueSlug} events`);
    // Log a few event names to help debug
    events.slice(0,3).forEach(e=>console.log(`  [OddsService]  sample: ${e.home} vs ${e.away}`));
    return null;
  }

  console.log(`[OddsService] Matched ${matched.id}: ${matched.home} vs ${matched.away}`);
  // Extract direct bet links from event data
  const betLinkSportybet = matched.urls?.SportyBet || matched.bookmakerIds?.SportyBet ? `https://www.sportybet.com/ng/sport/football/event/${matched.bookmakerIds?.SportyBet||matched.id}` : null;
  const betLinkBet365 = matched.urls?.Bet365 || null;
  const oddsData=await fetchEventOdds(matched.id);
  if (!oddsData) return null;

  const bkData=oddsData.bookmakers||{};
  const markets=bkData['SportyBet']||bkData['Bet365'];
  const bookmakerUsed=bkData['SportyBet']?'SportyBet':bkData['Bet365']?'Bet365':null;
  if (!markets) { console.log(`[OddsService] No SportyBet/Bet365 data for event ${matched.id}`); return null; }

  const odds=parseBookmakerOdds(markets);
  const overUnder=JSON.stringify({over_2_5:odds.over_2_5,under_2_5:odds.under_2_5,over_1_5:odds.over_1_5,under_1_5:odds.under_1_5,over_3_5:odds.over_3_5,under_3_5:odds.under_3_5});
  try {
    await db.execute({ sql:`INSERT OR REPLACE INTO fixture_odds (fixture_id,home,draw,away,over_1_5,under_1_5,over_2_5,under_2_5,over_3_5,under_3_5,btts_yes,btts_no,over_under,bookmaker,bet_link_sportybet,bet_link_bet365,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`, args:[String(fixtureId),odds.home,odds.draw,odds.away,odds.over_1_5,odds.under_1_5,odds.over_2_5,odds.under_2_5,odds.over_3_5,odds.under_3_5,odds.btts_yes,odds.btts_no,overUnder,bookmakerUsed||'SportyBet',betLinkSportybet||null,betLinkBet365||null] });
    console.log(`[OddsService] ✅ Cached odds ${fixtureId} (${bookmakerUsed}) 1X2: ${odds.home}/${odds.draw}/${odds.away}`);
  } catch (err) { console.error('[OddsService] DB write:', err.message); }
  return odds;
}

// ── Fetch value bets from odds-api.io for a specific event ──────────────────────
// Returns value bets with EV > 100 (bookmaker underpricing)
export async function fetchValueBetsForEvent(eventId) {
  if (!ODDS_API_KEY || !eventId) return [];
  try {
    const url = `${ODDS_API_BASE}/value-bets?apiKey=${ODDS_API_KEY}&sport=football&bookmaker=SportyBet&eventId=${eventId}&limit=20`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const bets = Array.isArray(data) ? data : [];
    return bets
      .filter(b => b.expectedValue > 100) // EV > 100 = value
      .map(b => ({
        market: b.market?.name,
        side: b.betSide,
        ev: b.expectedValue,
        sportyOdds: b.bookmakerOdds?.home || b.bookmakerOdds?.away,
        fairOdds: b.betSide === 'home' ? b.market?.home : b.market?.away,
        betLink: b.bookmakerOdds?.href,
      }));
  } catch { return []; }
}

// ── Get bet links for an event directly ───────────────────────────────────
export async function getEventBetLinks(eventId) {
  if (!ODDS_API_KEY || !eventId) return {};
  try {
    const data = await fetchEventOdds(eventId);
    return data?.urls || {};
  } catch { return {}; }
}
