import { useEffect, useState, type FocusEvent } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  Bug,
  Check,
  CheckCircle2,
  CircleDot,
  Copy,
  Database,
  GitBranch,
  GitPullRequest,
  Inbox,
  LockKeyhole,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  TerminalSquare,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLockup, BrandMark } from "../../components/BrandLockup";
import {
  applyInterfaceLanguage,
  saveInterfaceLanguage,
} from "../../i18n/preferences";
import { normalizeLocale } from "../../i18n/resources";
import { supabase } from "../../lib/supabase";
import {
  nextPlaybackScene,
  playbackScenes,
  type PlaybackSceneId,
} from "./playback";

const featureCards = [
  { key: "triage", icon: Inbox },
  { key: "investigate", icon: TerminalSquare },
  { key: "act", icon: ShieldCheck },
  { key: "remember", icon: Database },
] as const;

const loopSteps = [
  { key: "message", icon: MessageCircle },
  { key: "context", icon: CircleDot },
  { key: "triage", icon: Bot },
  { key: "evidence", icon: TerminalSquare },
  { key: "fix", icon: GitPullRequest },
  { key: "verify", icon: CheckCircle2 },
  { key: "reply", icon: ArrowRight },
] as const;

const proofItems = ["whatsapp", "context", "evidence", "verified"] as const;

const specimenNavigation = [
  { key: "inbox", icon: Inbox },
  { key: "issues", icon: Bug },
  { key: "runs", icon: TerminalSquare },
  { key: "knowledge", icon: BookOpen },
] as const;

function ProductWindow() {
  const { t } = useTranslation("marketing");
  const [scene, setScene] = useState<PlaybackSceneId>("signal");
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [playing, setPlaying] = useState(() => !reducedMotion);
  const [interacting, setInteracting] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
      if (event.matches) setPlaying(false);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!playing || interacting || reducedMotion) return undefined;
    const timer = window.setInterval(
      () => setScene((current) => nextPlaybackScene(current)),
      3200,
    );
    return () => window.clearInterval(timer);
  }, [interacting, playing, reducedMotion]);

  const stepIndex = playbackScenes.indexOf(scene);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setInteracting(false);
    }
  };

  return (
    <div
      className="marketing-product-window"
      aria-label={t("playback.ariaLabel")}
      aria-describedby="marketing-playback-description"
      data-scene={scene}
      data-playing={playing ? "true" : "false"}
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={handleBlur}
    >
      <p id="marketing-playback-description" className="sr-only">
        {t("playback.description")}
      </p>
      <span className="marketing-playback-cursor" aria-hidden="true" />
      <div className="marketing-browser-bar">
        <span className="marketing-browser-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="marketing-browser-address">
          <LockKeyhole size={11} /> {t("specimen.address")}
        </span>
        <span className="marketing-browser-controls" aria-hidden="true">
          <Plus size={14} />
          <Copy size={13} />
        </span>
      </div>

      <div className="marketing-app-shell">
        <aside className="marketing-app-sidebar">
          <BrandLockup compact />
          <div className="marketing-app-sidebar-nav">
            {specimenNavigation.map(({ key, icon: Icon }, index) => (
              <span className={index === 0 ? "is-active" : ""} key={key}>
                <Icon size={14} />
                {t(`specimen.nav.${key}`)}
                {index === 0 ? <em>2</em> : null}
              </span>
            ))}
          </div>
          <div className="marketing-app-sidebar-foot">
            <span>{t("specimen.ownerInitials")}</span>
            <div>
              <strong>{t("specimen.owner")}</strong>
              <small>{t("specimen.plan")}</small>
            </div>
          </div>
        </aside>

        <div className="marketing-app-main">
          <div className="marketing-app-topbar">
            <span className="marketing-app-search">
              <Search size={13} />
              {t("specimen.search")}
            </span>
            <span className="marketing-app-actions" aria-hidden="true">
              <CircleDot size={14} />
              <Bell size={14} />
              <Plus size={14} />
            </span>
          </div>

          <div className="marketing-case-grid">
            <aside className="marketing-case-list">
              <div className="marketing-case-list-heading">
                <span>{t("specimen.railLabel")}</span>
                <strong>02</strong>
              </div>
              <div className="marketing-case-row is-selected">
                <span className="marketing-case-avatar">L</span>
                <span>
                  <strong>{t("specimen.customer")}</strong>
                  <small>{t("specimen.subject")}</small>
                </span>
                <em>1</em>
              </div>
              <div className="marketing-case-row">
                <span className="marketing-case-avatar is-muted">P</span>
                <span>
                  <strong>{t("specimen.secondaryCustomer")}</strong>
                  <small>{t("specimen.secondarySubject")}</small>
                </span>
              </div>
              <div className="marketing-case-list-foot">
                <i aria-hidden="true" />
                {t("specimen.railFoot")}
              </div>
            </aside>

            <section className="marketing-conversation">
              <div className="marketing-conversation-heading">
                <div>
                  <span>{t("specimen.conversationLabel")}</span>
                  <strong>{t("specimen.customer")}</strong>
                </div>
                <span>{t("specimen.channel")}</span>
              </div>
              <div className="marketing-messages">
                <div
                  className={`marketing-message is-inbound${scene === "signal" ? " is-focus" : ""}`}
                >
                  <span>{t("specimen.inboundLabel")}</span>
                  <p>{t("specimen.inboundMessage")}</p>
                  <small>{t("specimen.inboundTime")}</small>
                </div>
                <div
                  className={`marketing-message is-outbound${scene === "verify" ? " is-focus" : ""}`}
                >
                  <span>{t("specimen.outboundLabel")}</span>
                  <p>{t("specimen.outboundMessage")}</p>
                  <small>{t("specimen.outboundTime")}</small>
                </div>
              </div>
              <div
                className={`marketing-linked-issue${scene === "investigate" ? " is-focus" : ""}`}
              >
                <CircleDot size={14} />
                <span>
                  <strong>{t("specimen.issueTitle")}</strong>
                  <small>{t("specimen.issueMeta")}</small>
                </span>
                <ArrowRight size={14} />
              </div>
            </section>

            <aside className="marketing-evidence-panel">
              <div className="marketing-evidence-heading">
                <span>{t("specimen.spineLabel")}</span>
                <strong>{t("specimen.spineTitle")}</strong>
              </div>
              <div className="marketing-evidence-list">
                {(["context", "evidence", "next"] as const).map(
                  (item, index) => {
                    const status =
                      index < stepIndex
                        ? "is-done"
                        : index === stepIndex
                          ? "is-next"
                          : "is-upcoming";
                    return (
                      <div key={item} className={status}>
                        <i>
                          {index < stepIndex ? <Check size={9} /> : <span />}
                        </i>
                        <span>
                          <strong>{t(`specimen.spine.${item}.title`)}</strong>
                          <small>{t(`specimen.spine.${item}.detail`)}</small>
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
              <div
                className={`marketing-review-gate${scene === "verify" ? " is-ready" : ""}`}
              >
                <ShieldCheck size={13} />
                {t("specimen.reviewGate")}
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div className="marketing-playback-controls">
        <div className="marketing-playback-scenes">
          {playbackScenes.map((id) => (
            <button
              key={id}
              type="button"
              className={id === scene ? "is-active" : ""}
              aria-current={id === scene ? "true" : undefined}
              onClick={() => setScene(id)}
            >
              {t(`playback.scenes.${id}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="marketing-playback-toggle"
          onClick={() => setPlaying((current) => !current)}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? t("playback.pause") : t("playback.play")}
        </button>
      </div>
    </div>
  );
}

function FeatureVisual({
  feature,
}: {
  feature: (typeof featureCards)[number]["key"];
}) {
  const { t } = useTranslation("marketing");

  if (feature === "triage") {
    return (
      <div className="marketing-feature-visual is-triage" aria-hidden="true">
        {(["one", "two", "three"] as const).map((item, index) => (
          <span key={item} className={index === 0 ? "is-active" : ""}>
            <i>{index === 0 ? "L" : index === 1 ? "P" : "M"}</i>
            <b>{t(`capabilities.visuals.triage.${item}`)}</b>
            <small>{index === 0 ? "now" : `${index + 2}m`}</small>
          </span>
        ))}
      </div>
    );
  }

  if (feature === "investigate") {
    return (
      <div className="marketing-feature-visual is-terminal" aria-hidden="true">
        <div className="marketing-terminal-top">
          <i /> <i /> <i />
          <span>{t("capabilities.visuals.investigate.label")}</span>
        </div>
        <p>
          <em>01</em>
          <Check size={11} /> {t("capabilities.visuals.investigate.context")}
        </p>
        <p>
          <em>02</em>
          <Check size={11} /> {t("capabilities.visuals.investigate.reproduce")}
        </p>
        <p className="is-running">
          <em>03</em>
          <span /> {t("capabilities.visuals.investigate.rootCause")}
        </p>
      </div>
    );
  }

  if (feature === "act") {
    return (
      <div className="marketing-feature-visual is-policy" aria-hidden="true">
        <span>
          <MessageCircle size={14} />
          <b>{t("capabilities.visuals.act.reply")}</b>
          <CheckCircle2 size={14} />
        </span>
        <span>
          <TerminalSquare size={14} />
          <b>{t("capabilities.visuals.act.investigate")}</b>
          <CheckCircle2 size={14} />
        </span>
        <span className="is-locked">
          <GitBranch size={14} />
          <b>{t("capabilities.visuals.act.ship")}</b>
          <LockKeyhole size={14} />
        </span>
      </div>
    );
  }

  return (
    <div className="marketing-feature-visual is-memory" aria-hidden="true">
      <BrandMark />
      <div>
        {(["verified", "related", "resolved"] as const).map((item) => (
          <span key={item}>
            {t(`capabilities.visuals.memory.${item}.case`)}
            <b>{t(`capabilities.visuals.memory.${item}.status`)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function FounderBoundary() {
  const { t } = useTranslation("marketing");

  return (
    <div
      className="marketing-boundary-window"
      aria-label={t("boundary.ariaLabel")}
    >
      <div className="marketing-boundary-window-top">
        <span>
          <BrandMark /> {t("boundary.caseLabel")}
        </span>
        <span>
          <i /> {t("boundary.status")}
        </span>
      </div>
      <div className="marketing-boundary-window-body">
        <div className="marketing-boundary-summary">
          <span>{t("boundary.summaryLabel")}</span>
          <strong>{t("boundary.summary")}</strong>
          <p>{t("boundary.evidence")}</p>
        </div>
        <div className="marketing-boundary-action">
          <ShieldCheck size={20} />
          <span>
            <strong>{t("boundary.actionTitle")}</strong>
            <small>{t("boundary.actionDetail")}</small>
          </span>
          <span className="marketing-boundary-action-cta">
            {t("boundary.action")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t, i18n } = useTranslation("marketing");
  const [menuOpen, setMenuOpen] = useState(false);
  const locale = normalizeLocale(i18n.language);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const switchLanguage = () => {
    const nextLocale = locale === "pt-BR" ? "en-US" : "pt-BR";
    void applyInterfaceLanguage(nextLocale);
    if (supabase) {
      void saveInterfaceLanguage(supabase, nextLocale).catch(() => {
        void applyInterfaceLanguage(nextLocale);
      });
    }
  };

  return (
    <main className="marketing-page" id="top">
      <header className="marketing-nav-wrap">
        <nav className="marketing-nav" aria-label={t("navigation.label")}>
          <a
            className="marketing-brand-link"
            href="#top"
            aria-label={t("brand")}
          >
            <BrandLockup compact />
          </a>
          <div className="marketing-nav-links">
            <a href="#features">{t("navigation.product")}</a>
            <a href="#loop">{t("navigation.howItWorks")}</a>
            <a href="#founders">{t("navigation.forFounders")}</a>
            <a href="#design-partners">{t("navigation.designPartners")}</a>
          </div>
          <div className="marketing-nav-actions">
            <button
              className="marketing-language"
              type="button"
              onClick={switchLanguage}
            >
              {t("navigation.switchLanguageShort")}
            </button>
            <a className="marketing-login" href="/?auth=1">
              {t("navigation.signIn")}
            </a>
            <a className="button button-primary" href="/?auth=1">
              {t("navigation.getStarted")}
            </a>
            <button
              className="marketing-menu-button"
              type="button"
              aria-label={
                menuOpen ? t("navigation.closeMenu") : t("navigation.openMenu")
              }
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>
        <div className={`marketing-mobile-menu ${menuOpen ? "is-open" : ""}`}>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            {t("navigation.product")}
          </a>
          <a href="#loop" onClick={() => setMenuOpen(false)}>
            {t("navigation.howItWorks")}
          </a>
          <a href="#founders" onClick={() => setMenuOpen(false)}>
            {t("navigation.forFounders")}
          </a>
          <a href="#design-partners" onClick={() => setMenuOpen(false)}>
            {t("navigation.designPartners")}
          </a>
          <a href="/?auth=1" onClick={() => setMenuOpen(false)}>
            {t("navigation.signIn")}
          </a>
        </div>
      </header>

      <section className="marketing-hero" id="product">
        <div className="marketing-hero-glow" aria-hidden="true" />
        <div className="marketing-container marketing-hero-inner">
          <a className="marketing-announcement" href="#design-partners">
            <span>{t("hero.badge")}</span>
            {t("hero.announcement")}
            <ArrowRight size={14} />
          </a>
          <h1>
            <span>{t("hero.titleLead")}</span>
            <span className="marketing-hero-accent">
              {t("hero.titleAccent")}
            </span>
          </h1>
          <p>{t("hero.description")}</p>
          <div className="marketing-hero-actions">
            <a className="button button-primary" href="/?auth=1">
              {t("hero.primaryCta")} <ArrowRight size={15} />
            </a>
            <a className="button button-secondary" href="#loop">
              {t("hero.secondaryCta")}
            </a>
          </div>
          <ProductWindow />
        </div>
      </section>

      <section
        className="marketing-proof-strip"
        aria-label={t("proof.ariaLabel")}
      >
        <div className="marketing-proof-track">
          {[...proofItems, ...proofItems].map((item, index) => (
            <span key={`${item}-${index}`}>
              <CheckCircle2 size={15} />
              {t(`proof.items.${item}`)}
            </span>
          ))}
        </div>
      </section>

      <section className="marketing-capabilities" id="features">
        <div className="marketing-container">
          <div className="marketing-section-heading is-centered">
            <h2>{t("capabilities.title")}</h2>
            <p>{t("capabilities.description")}</p>
            <a className="button button-secondary" href="#loop">
              {t("capabilities.cta")} <ArrowRight size={14} />
            </a>
          </div>
          <div className="marketing-feature-grid">
            {featureCards.map(({ key, icon: Icon }) => (
              <article className={`marketing-feature-card is-${key}`} key={key}>
                <span className="marketing-feature-icon">
                  <Icon size={18} />
                </span>
                <h3>{t(`capabilities.items.${key}.title`)}</h3>
                <p>{t(`capabilities.items.${key}.description`)}</p>
                <ul>
                  {(["one", "two", "three"] as const).map((item) => (
                    <li key={item}>
                      <Check size={13} />
                      {t(`capabilities.items.${key}.points.${item}`)}
                    </li>
                  ))}
                </ul>
                <FeatureVisual feature={key} />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-loop-section" id="loop">
        <div className="marketing-container">
          <div className="marketing-section-heading is-centered">
            <h2>{t("loop.title")}</h2>
            <p>{t("loop.description")}</p>
          </div>
          <div
            className="marketing-loop-window"
            aria-label={t("loop.ariaLabel")}
          >
            <div className="marketing-loop-progress" aria-hidden="true">
              <span />
              <i />
            </div>
            <div className="marketing-loop-steps">
              {loopSteps.map(({ key, icon: Icon }, index) => (
                <div key={key} className={index === 0 ? "is-current" : ""}>
                  <span>
                    <Icon size={16} />
                  </span>
                  <strong>{t(`loop.steps.${key}.title`)}</strong>
                  <small>{t(`loop.steps.${key}.detail`)}</small>
                </div>
              ))}
            </div>
            <div className="marketing-loop-result">
              <CheckCircle2 size={17} />
              <span>
                <strong>{t("loop.resultTitle")}</strong>
                <small>{t("loop.resultDetail")}</small>
              </span>
              <span className="marketing-loop-result-status">
                {t("loop.resultStatus")}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-founder-section" id="founders">
        <div className="marketing-container marketing-founder-grid">
          <div className="marketing-founder-copy">
            <h2>{t("founders.title")}</h2>
            <p>{t("founders.description")}</p>
            <div className="marketing-founder-principles">
              {(["repeat", "risk", "decision"] as const).map((item) => (
                <span key={item}>
                  <Check size={14} />
                  {t(`founders.principles.${item}`)}
                </span>
              ))}
            </div>
          </div>
          <FounderBoundary />
        </div>
      </section>

      <section className="marketing-partner-section" id="design-partners">
        <div className="marketing-container marketing-partner-panel">
          <BrandMark />
          <div>
            <span className="marketing-partner-label">
              {t("partners.label")}
            </span>
            <h2>{t("partners.title")}</h2>
            <p>{t("partners.description")}</p>
          </div>
          <a className="button button-primary" href="/?auth=1">
            {t("partners.cta")} <ArrowRight size={15} />
          </a>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-container marketing-footer-grid">
          <div className="marketing-footer-brand">
            <BrandLockup compact />
            <p>{t("footer.description")}</p>
          </div>
          <div className="marketing-footer-column">
            <strong>{t("footer.product")}</strong>
            <a href="#features">{t("navigation.product")}</a>
            <a href="#loop">{t("navigation.howItWorks")}</a>
            <a href="#founders">{t("navigation.forFounders")}</a>
          </div>
          <div className="marketing-footer-column">
            <strong>{t("footer.company")}</strong>
            <a href="#design-partners">{t("navigation.designPartners")}</a>
            <a href="/?auth=1">{t("navigation.signIn")}</a>
          </div>
          <div className="marketing-footer-status">
            <i />
            <span>{t("footer.status")}</span>
          </div>
          <div className="marketing-footer-bottom">
            <span>
              {t("footer.copyright", { year: new Date().getFullYear() })}
            </span>
            <button type="button" onClick={switchLanguage}>
              {t("navigation.switchLanguageShort")}
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
