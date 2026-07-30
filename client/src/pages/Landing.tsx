import { useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Dna,
  Flame,
  Gauge,
  Goal,
  Layers3,
  LockKeyhole,
  Radio,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-70px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.62, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const leagueSignals = [
  "Premier League",
  "Champions League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "NBA",
  "Europa League",
  "Ligue 1",
];

const modelSteps = [
  {
    number: "01",
    icon: ScanLine,
    title: "Scan the slate",
    copy: "Fixtures, form, injuries, lineups and market movement arrive in one match feed.",
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "Run the models",
    copy: "Probability, expected goals and value signals are calculated for every supported market.",
  },
  {
    number: "03",
    icon: Target,
    title: "Act on the edge",
    copy: "Strong opportunities rise to the top, with the reasoning and risk visible before you decide.",
  },
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.88], [1, 0.28]);

  const startTrial = () => setLocation("/login?mode=signup");
  const signIn = () => setLocation("/login");

  return (
    <div className="landing-2627">
      <div className="landing-2627__backdrop" aria-hidden="true">
        <div className="landing-2627__pitch" />
        <div className="landing-2627__halo" />
        <div className="landing-2627__noise" />
      </div>

      <nav className="landing-nav" aria-label="Public navigation">
        <div className="landing-nav__inner">
          <Link href="/home" className="landing-brand" aria-label="ScorePhantom home">
            <span className="landing-brand__mark">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="" />
            </span>
            <span className="landing-brand__wordmark">
              SCORE<span>PHANTOM</span>
            </span>
          </Link>

          <div className="landing-nav__season">
            <span />
            New season · 26/27
          </div>

          <div className="landing-nav__actions">
            <button type="button" onClick={signIn} className="landing-nav__login">
              Sign in
            </button>
            <button type="button" onClick={startTrial} className="landing-nav__cta">
              Start free <ArrowRight />
            </button>
          </div>
        </div>
      </nav>

      <main>
        <section ref={heroRef} className="landing-hero">
          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="landing-hero__inner">
            <div className="landing-hero__copy">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="landing-kicker"
              >
                <Radio />
                Live match intelligence
                <span>Football + Basketball</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.08 }}
              >
                See the game
                <span>before the noise.</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.16 }}
                className="landing-hero__lede"
              >
                ScorePhantom turns match data, model probability and market movement into
                one clear matchday decision system.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.24 }}
                className="landing-hero__actions"
              >
                <button type="button" onClick={startTrial} className="landing-button landing-button--primary">
                  Enter ScorePhantom <ChevronRight />
                </button>
                <button
                  type="button"
                  onClick={() => setLocation("/login")}
                  className="landing-button landing-button--ghost"
                >
                  <Activity /> Explore the product
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.36 }}
                className="landing-trust"
              >
                <span><Check /> 7-day free trial</span>
                <span><Check /> No card required</span>
                <span><ShieldCheck /> Transparent record</span>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 26, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.82, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="matchday-console"
            >
              <div className="matchday-console__glow" />
              <div className="matchday-console__topbar">
                <span className="matchday-console__live"><i /> Model live</span>
                <span>Matchday 01 · 20:00 WAT</span>
              </div>

              <div className="matchday-console__league">
                <Trophy />
                Premier League
                <span>London · England</span>
              </div>

              <div className="matchday-console__teams">
                <div>
                  <span className="team-monogram team-monogram--home">A</span>
                  <strong>Arsenal</strong>
                  <small>Home · W W D W W</small>
                </div>
                <div className="matchday-console__versus">
                  <span>Kickoff</span>
                  <strong>20:00</strong>
                  <small>Emirates</small>
                </div>
                <div>
                  <span className="team-monogram team-monogram--away">C</span>
                  <strong>Chelsea</strong>
                  <small>Away · W D L W D</small>
                </div>
              </div>

              <div className="matchday-console__signal">
                <div>
                  <span className="signal-label"><Flame /> Phantom signal</span>
                  <strong>Over 2.5 goals</strong>
                  <small>Attack profiles create a high-tempo script</small>
                </div>
                <div className="signal-confidence">
                  <span>78</span>
                  <small>confidence</small>
                </div>
              </div>

              <div className="probability-grid">
                {[
                  { label: "Home", value: 56, color: "green" },
                  { label: "Draw", value: 24, color: "blue" },
                  { label: "Away", value: 20, color: "orange" },
                ].map((item) => (
                  <div key={item.label}>
                    <span>{item.label}<b>{item.value}%</b></span>
                    <i><em className={`is-${item.color}`} style={{ width: `${item.value}%` }} /></i>
                  </div>
                ))}
              </div>

              <div className="matchday-console__footer">
                <span><Gauge /> +14.2% model edge</span>
                <span><CircleDot /> Lineup monitored</span>
                <span><Zap /> 24 signals checked</span>
              </div>
            </motion.div>
          </motion.div>
        </section>

        <section className="signal-marquee" aria-label="Supported competitions">
          <div className="signal-marquee__track">
            {[...leagueSignals, ...leagueSignals].map((league, index) => (
              <span key={`${league}-${index}`}>
                <i />
                {league}
              </span>
            ))}
          </div>
        </section>

        <section className="landing-proof">
          <div className="landing-container landing-proof__grid">
            {[
              { value: "1K+", label: "Members", icon: Users },
              { value: "500+", label: "Weekly signals", icon: Activity },
              { value: "24/7", label: "Market monitoring", icon: Radio },
              { value: "2", label: "Sports engines", icon: Dna },
            ].map(({ value, label, icon: Icon }, index) => (
              <Reveal key={label} delay={index * 0.06} className="landing-proof__item">
                <Icon />
                <div><strong>{value}</strong><span>{label}</span></div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-container">
            <Reveal className="landing-section__heading">
              <span className="landing-eyebrow"><Sparkles /> Built for matchday</span>
              <h2>From 300 fixtures to the <span>one signal that matters.</span></h2>
              <p>
                ScorePhantom removes the tab switching, spreadsheet work and guesswork.
                Every layer of analysis resolves into a decision you can understand.
              </p>
            </Reveal>

            <div className="model-steps">
              {modelSteps.map(({ number, icon: Icon, title, copy }, index) => (
                <Reveal key={number} delay={index * 0.09} className="model-step">
                  <span className="model-step__number">{number}</span>
                  <span className="model-step__icon"><Icon /></span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  {index < modelSteps.length - 1 && <span className="model-step__line" />}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--tight">
          <div className="landing-container bento">
            <Reveal className="bento-card bento-card--wide bento-card--green">
              <div className="bento-card__copy">
                <span className="landing-eyebrow"><TrendingUp /> Value engine</span>
                <h3>Probability is useful. Mispriced probability is the edge.</h3>
                <p>
                  Compare the model against available market prices and see where the gap is
                  large enough to deserve attention.
                </p>
              </div>
              <div className="edge-visual">
                <div>
                  <span>Model</span><strong>62%</strong>
                  <i><em style={{ width: "62%" }} /></i>
                </div>
                <div>
                  <span>Market</span><strong>48%</strong>
                  <i><em style={{ width: "48%" }} /></i>
                </div>
                <span className="edge-visual__badge">+14% value edge</span>
              </div>
            </Reveal>

            <Reveal className="bento-card bento-card--sim" delay={0.05}>
              <span className="landing-eyebrow"><Dna /> Match simulator</span>
              <div className="mini-pitch">
                <span className="mini-pitch__circle" />
                <i className="mini-player mini-player--one" />
                <i className="mini-player mini-player--two" />
                <i className="mini-player mini-player--three" />
                <i className="mini-ball" />
              </div>
              <h3>Watch the likely match script unfold.</h3>
            </Reveal>

            <Reveal className="bento-card" delay={0.08}>
              <span className="landing-eyebrow"><Layers3 /> ACCA Lab</span>
              <div className="acca-visual">
                {["Over 1.5 goals", "Home +1.5", "Under 4.5 goals"].map((pick, index) => (
                  <span key={pick}><i>{index + 1}</i>{pick}<Check /></span>
                ))}
              </div>
              <h3>Build smarter combinations around a risk target.</h3>
            </Reveal>

            <Reveal className="bento-card bento-card--wide bento-card--record" delay={0.1}>
              <div className="record-visual">
                {[42, 58, 48, 70, 64, 78, 73, 86, 82, 92].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="bento-card__copy">
                <span className="landing-eyebrow"><BarChart3 /> Public track record</span>
                <h3>No disappearing losses. No mystery statistics.</h3>
                <p>
                  Wins, losses, voids and confidence calibration remain visible, so the model
                  earns trust over time.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-container transparency-panel">
            <Reveal className="transparency-panel__copy">
              <span className="landing-eyebrow"><LockKeyhole /> Confidence, not certainty</span>
              <h2>Built to help you decide. <span>Never to promise an outcome.</span></h2>
              <p>
                Each signal shows confidence, model reasoning and risk context. You stay in
                control, and every result remains part of the record.
              </p>
              <button type="button" onClick={() => setLocation("/login")} className="landing-text-link">
                See how the model explains a pick <ArrowRight />
              </button>
            </Reveal>
            <Reveal className="transparency-panel__rules" delay={0.08}>
              {[
                { icon: Goal, title: "Specific", copy: "One selection, clear market and confidence." },
                { icon: Activity, title: "Explainable", copy: "Form, goals, matchup and pricing signals." },
                { icon: Trophy, title: "Tracked", copy: "Settled outcomes remain in the public record." },
              ].map(({ icon: Icon, title, copy }) => (
                <div key={title}>
                  <span><Icon /></span>
                  <div><strong>{title}</strong><p>{copy}</p></div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="landing-final">
          <div className="landing-final__glow" aria-hidden="true" />
          <Reveal className="landing-container landing-final__inner">
            <span className="landing-eyebrow"><Zap /> Your matchday starts here</span>
            <h2>Stop chasing tips.<br /><span>Build a repeatable process.</span></h2>
            <p>
              Get the complete ScorePhantom system free for seven days. No card required.
            </p>
            <button type="button" onClick={startTrial} className="landing-button landing-button--primary">
              Start your free trial <ArrowRight />
            </button>
            <small>Premium is ₦3,000/month after trial · Cancel anytime</small>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <div className="landing-brand">
            <span className="landing-brand__mark">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="" />
            </span>
            <span className="landing-brand__wordmark">SCORE<span>PHANTOM</span></span>
          </div>
          <div className="landing-footer__links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="https://wa.me/2348117024699" target="_blank" rel="noreferrer">Support</a>
          </div>
          <p>Data-led analysis, not guaranteed outcomes. 18+ only. Please play responsibly.</p>
        </div>
      </footer>
    </div>
  );
}
