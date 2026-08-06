import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Code2,
  GitPullRequest,
  Menu,
  MessageCircle,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "../../components/BrandLockup";
import { applyInterfaceLanguage } from "../../i18n/preferences";
import { normalizeLocale } from "../../i18n/resources";

const capabilityIcons = [
  MessageCircle,
  BrainCircuit,
  CircleDot,
  TerminalSquare,
  ShieldCheck,
  Network,
] as const;

const audienceIcons = [Code2, Users, Zap] as const;

function usePointerCard<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);

  const onPointerMove = (event: PointerEvent<T>) => {
    if (event.pointerType === "touch" || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    ref.current.style.setProperty("--pointer-x", `${x * 100}%`);
    ref.current.style.setProperty("--pointer-y", `${y * 100}%`);
    ref.current.style.setProperty("--tilt-x", `${(0.5 - y) * 3}deg`);
    ref.current.style.setProperty("--tilt-y", `${(x - 0.5) * 3}deg`);
    ref.current.dataset.pointer = "active";
  };

  const onPointerLeave = () => {
    if (!ref.current) return;
    ref.current.style.removeProperty("--tilt-x");
    ref.current.style.removeProperty("--tilt-y");
    delete ref.current.dataset.pointer;
  };

  return { ref, onPointerMove, onPointerLeave };
}

function PointerCard({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  const pointer = usePointerCard<HTMLElement>();
  return (
    <article
      ref={pointer.ref}
      className={`${className} marketing-pointer-card reveal`}
      onPointerMove={pointer.onPointerMove}
      onPointerLeave={pointer.onPointerLeave}
    >
      <span className="marketing-pointer-light" aria-hidden="true" />
      {children}
    </article>
  );
}

function ProductPreview() {
  const { t } = useTranslation("marketing");
  return (
    <div
      className="marketing-product-shell"
      aria-label={t("preview.ariaLabel")}
    >
      <div className="marketing-product-topbar">
        <span className="marketing-product-title">
          <span className="marketing-product-mark" /> {t("preview.inbox")}
        </span>
        <span className="marketing-live-state">
          <i /> {t("preview.live")}
        </span>
      </div>
      <div className="marketing-product-body">
        <aside className="marketing-conversation-rail">
          <div className="marketing-rail-label">
            {t("preview.conversations")}
          </div>
          <div className="marketing-search-line">{t("preview.search")}</div>
          {["one", "two", "three"].map((key, index) => (
            <div
              className={`marketing-thread ${index === 0 ? "is-active" : ""}`}
              key={key}
            >
              <span className="marketing-avatar">
                {t(`preview.threads.${key}.initial`)}
              </span>
              <span>
                <strong>{t(`preview.threads.${key}.customer`)}</strong>
                <small>{t(`preview.threads.${key}.subject`)}</small>
              </span>
            </div>
          ))}
        </aside>
        <div className="marketing-conversation-view">
          <div className="marketing-conversation-head">
            <span>
              <strong>{t("preview.threads.one.customer")}</strong>
              <small>{t("preview.channelAttention")}</small>
            </span>
            <span className="marketing-ai-pill">
              <Sparkles size={11} /> {t("preview.aiDrafts")}
            </span>
          </div>
          <div className="marketing-message-stack">
            <p className="marketing-message is-customer">
              {t("preview.customerMessage")}
            </p>
            <p className="marketing-message is-agent">
              {t("preview.agentMessage")}
            </p>
            <div className="marketing-linked-issue">
              <span className="marketing-issue-icon">
                <CircleDot size={14} />
              </span>
              <span>
                <strong>{t("preview.issueTitle")}</strong>
                <small>
                  {t("preview.issueMeta", {
                    id: t("preview.issueId"),
                    status: t("preview.issueStatus"),
                  })}
                </small>
              </span>
              <ArrowRight size={14} />
            </div>
          </div>
          <div className="marketing-composer">
            <span>{t("preview.composer")}</span>
            <span className="marketing-send-dot" />
          </div>
        </div>
        <aside className="marketing-run-panel">
          <div className="marketing-run-heading">
            <span>{t("preview.runTitle")}</span>
            <small>{t("preview.runStatus")}</small>
          </div>
          <div className="marketing-run-timeline">
            {(["context", "issue", "run", "review"] as const).map(
              (step, index) => (
                <div
                  className={index < 3 ? "is-complete" : "is-current"}
                  key={step}
                >
                  <i>{index < 3 ? <Check size={10} /> : <span />}</i>
                  <span>
                    <strong>{t(`preview.steps.${step}`)}</strong>
                    <small>{t(`preview.steps.${step}Meta`)}</small>
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="marketing-diff-mini">
            <span>{t("preview.additions")}</span>
            <span>{t("preview.deletions")}</span>
            <small>{t("preview.filesChanged")}</small>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ConversationVisual() {
  return (
    <div
      className="marketing-story-visual conversation-visual"
      aria-hidden="true"
    >
      <span className="visual-phone">
        <MessageCircle size={17} />
      </span>
      <i className="visual-line line-one" />
      <span className="visual-node node-one" />
      <i className="visual-line line-two" />
      <span className="visual-reply">
        <Sparkles size={14} />
      </span>
    </div>
  );
}

function GroundingVisual() {
  return (
    <div className="marketing-story-visual grounding-visual" aria-hidden="true">
      <span className="ground-center">
        <BrainCircuit size={22} />
      </span>
      <span className="ground-orbit orbit-one">
        <BookOpen size={13} />
      </span>
      <span className="ground-orbit orbit-two">
        <MessageCircle size={13} />
      </span>
      <span className="ground-orbit orbit-three">
        <ShieldCheck size={13} />
      </span>
      <i />
    </div>
  );
}

function IssueVisual() {
  return (
    <div className="marketing-story-visual issue-visual" aria-hidden="true">
      <span className="issue-card-mini issue-source">
        <MessageCircle size={15} />
      </span>
      <i />
      <span className="issue-card-mini issue-target">
        <CircleDot size={15} />
      </span>
      <span className="issue-pulse" />
    </div>
  );
}

function RunVisual() {
  return (
    <div className="marketing-story-visual run-visual" aria-hidden="true">
      <span className="run-terminal">
        <TerminalSquare size={18} />
      </span>
      <span className="run-code-line line-a" />
      <span className="run-code-line line-b" />
      <span className="run-code-line line-c" />
      <span className="run-review">
        <GitPullRequest size={15} />
      </span>
    </div>
  );
}

function CapabilitySignal({ index }: { index: number }) {
  return (
    <div
      className={`marketing-capability-signal signal-${index + 1}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <i />
    </div>
  );
}

export function LandingPage() {
  const { t, i18n } = useTranslation(["marketing", "common"]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [storyIndex, setStoryIndex] = useState(0);
  const [audienceIndex, setAudienceIndex] = useState(0);
  const pageRef = useRef<HTMLElement>(null);
  const locale = normalizeLocale(i18n.language);

  const stories = useMemo(
    () =>
      [0, 1, 2].map((index) => ({
        quote: t(`stories.items.${index}.quote`),
        role: t(`stories.items.${index}.role`),
        outcome: t(`stories.items.${index}.outcome`),
      })),
    [t],
  );

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targets = [...page.querySelectorAll<HTMLElement>(".reveal")];
    if (reduced || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const switchLanguage = () => {
    void applyInterfaceLanguage(locale === "pt-BR" ? "en-US" : "pt-BR");
  };

  return (
    <main className="marketing-page" ref={pageRef}>
      <header className="marketing-nav-wrap">
        <nav className="marketing-nav" aria-label={t("navigation.label")}>
          <a
            className="marketing-brand-link"
            href="#top"
            aria-label={t("common:brand.name")}
          >
            <BrandLockup />
          </a>
          <div className="marketing-nav-links">
            <a href="#features">{t("navigation.features")}</a>
            <a href="#capabilities">{t("navigation.capabilities")}</a>
            <a href="#use-cases">{t("navigation.useCases")}</a>
            <a href="#pricing">{t("navigation.pricing")}</a>
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
          {["features", "capabilities", "use-cases", "pricing"].map(
            (target) => (
              <a
                href={`#${target}`}
                key={target}
                onClick={() => setMenuOpen(false)}
              >
                {t(
                  `navigation.${target === "use-cases" ? "useCases" : target}`,
                )}
              </a>
            ),
          )}
          <a href="/?auth=1">{t("navigation.signIn")}</a>
        </div>
      </header>

      <section className="marketing-hero" id="top">
        <div className="marketing-hero-aura" aria-hidden="true" />
        <div className="marketing-release-pill">
          <span>{t("hero.releaseLabel")}</span>
          {t("hero.releaseText")} <ArrowRight size={12} />
        </div>
        <h1>{t("hero.title")}</h1>
        <p>{t("hero.description")}</p>
        <div className="marketing-hero-actions">
          <a className="button button-primary" href="/?auth=1">
            {t("hero.primaryCta")} <ArrowRight size={15} />
          </a>
          <a className="button button-ghost" href="#features">
            <Play size={14} /> {t("hero.secondaryCta")}
          </a>
        </div>
        <div className="marketing-hero-proof">
          <ProductPreview />
        </div>
      </section>

      <section className="marketing-proof-rail" aria-label={t("proof.label")}>
        <span>{t("proof.label")}</span>
        <div className="marketing-proof-marquee">
          <div>
            {[
              "solo",
              "microSaas",
              "developerLed",
              "whatsappFirst",
              "smallTeams",
            ].map((item) => (
              <strong key={item}>{t(`proof.items.${item}`)}</strong>
            ))}
            {[
              "solo",
              "microSaas",
              "developerLed",
              "whatsappFirst",
              "smallTeams",
            ].map((item) => (
              <strong aria-hidden="true" key={`${item}-copy`}>
                {t(`proof.items.${item}`)}
              </strong>
            ))}
          </div>
        </div>
      </section>

      <section
        className="marketing-section marketing-story-section"
        id="features"
      >
        <div className="marketing-section-intro reveal">
          <div>
            <h2>{t("stories.title")}</h2>
            <p>{t("stories.description")}</p>
          </div>
          <a className="button button-ghost" href="/?auth=1">
            {t("stories.cta")} <ArrowRight size={14} />
          </a>
        </div>
        <div className="marketing-story-grid">
          {[
            { key: "reply", visual: <ConversationVisual /> },
            { key: "ground", visual: <GroundingVisual /> },
            { key: "issue", visual: <IssueVisual /> },
            { key: "run", visual: <RunVisual /> },
          ].map(({ key, visual }) => (
            <PointerCard className="marketing-story-card" key={key}>
              <div className="marketing-story-copy">
                <h3>{t(`stories.cards.${key}.title`)}</h3>
                <p>{t(`stories.cards.${key}.description`)}</p>
                <ul>
                  {[0, 1, 2].map((item) => (
                    <li key={item}>
                      <Check size={13} />{" "}
                      {t(`stories.cards.${key}.points.${item}`)}
                    </li>
                  ))}
                </ul>
              </div>
              {visual}
            </PointerCard>
          ))}
        </div>
      </section>

      <section
        className="marketing-section marketing-capabilities"
        id="capabilities"
      >
        <div className="marketing-centered-intro reveal">
          <h2>{t("capabilities.title")}</h2>
          <p>{t("capabilities.description")}</p>
        </div>
        <div className="marketing-capability-grid">
          {capabilityIcons.map((Icon, index) => (
            <PointerCard className="marketing-capability-card" key={index}>
              <div className="marketing-capability-icon">
                <Icon size={20} />
              </div>
              <CapabilitySignal index={index} />
              <h3>{t(`capabilities.items.${index}.title`)}</h3>
              <p>{t(`capabilities.items.${index}.description`)}</p>
            </PointerCard>
          ))}
        </div>
      </section>

      <section className="marketing-section marketing-use-cases" id="use-cases">
        <div className="marketing-centered-intro reveal">
          <h2>{t("audience.title")}</h2>
          <p>{t("audience.description")}</p>
        </div>
        <div className="marketing-use-case-layout reveal">
          <div
            className="marketing-use-case-tabs"
            role="tablist"
            aria-label={t("audience.tabLabel")}
          >
            {audienceIcons.map((Icon, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={audienceIndex === index}
                className={audienceIndex === index ? "is-active" : ""}
                onClick={() => setAudienceIndex(index)}
                key={index}
              >
                <Icon size={18} />
                <span>
                  <strong>{t(`audience.items.${index}.title`)}</strong>
                  <small>{t(`audience.items.${index}.short`)}</small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
          <div className="marketing-use-case-stage" role="tabpanel">
            <span className="marketing-stage-label">
              {t(`audience.items.${audienceIndex}.title`)}
            </span>
            <h3>{t(`audience.items.${audienceIndex}.headline`)}</h3>
            <p>{t(`audience.items.${audienceIndex}.description`)}</p>
            <div className="marketing-stage-flow">
              {["signal", "context", "action", "outcome"].map((step, index) => (
                <div key={step}>
                  <i>{index + 1}</i>
                  <span>
                    <strong>{t(`audience.flow.${step}`)}</strong>
                    <small>
                      {t(`audience.items.${audienceIndex}.flow.${step}`)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-testimonial-section">
        <div className="marketing-testimonial-glow" aria-hidden="true" />
        <div className="marketing-testimonial reveal" aria-live="polite">
          <span className="marketing-quote-mark">“</span>
          <blockquote>{stories[storyIndex].quote}</blockquote>
          <div className="marketing-story-person">
            <span className="marketing-story-avatar">{storyIndex + 1}</span>
            <span>
              <strong>{stories[storyIndex].role}</strong>
              <small>{stories[storyIndex].outcome}</small>
            </span>
          </div>
          <div className="marketing-story-controls">
            <button
              type="button"
              onClick={() => setStoryIndex((storyIndex + 2) % 3)}
              aria-label={t("stories.previous")}
            >
              <ChevronLeft size={17} />
            </button>
            <div>
              {[0, 1, 2].map((index) => (
                <button
                  type="button"
                  className={storyIndex === index ? "is-active" : ""}
                  aria-label={t("stories.goTo", { number: index + 1 })}
                  onClick={() => setStoryIndex(index)}
                  key={index}
                >
                  {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStoryIndex((storyIndex + 1) % 3)}
              aria-label={t("stories.next")}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-pricing" id="pricing">
        <div className="marketing-centered-intro reveal">
          <h2>{t("pricing.title")}</h2>
          <p>{t("pricing.description")}</p>
          <div
            className="marketing-billing-toggle"
            role="group"
            aria-label={t("pricing.billingLabel")}
          >
            <button
              type="button"
              aria-pressed={billing === "monthly"}
              className={billing === "monthly" ? "is-active" : ""}
              onClick={() => setBilling("monthly")}
            >
              {t("pricing.monthly")}
            </button>
            <button
              type="button"
              aria-pressed={billing === "annual"}
              className={billing === "annual" ? "is-active" : ""}
              onClick={() => setBilling("annual")}
            >
              {t("pricing.annual")} <span>{t("pricing.discount")}</span>
            </button>
          </div>
        </div>
        <div className="marketing-pricing-grid">
          {[0, 1, 2].map((plan) => (
            <article
              className={`marketing-price-card reveal ${plan === 1 ? "is-featured" : ""}`}
              key={plan}
            >
              {plan === 1 && (
                <span className="marketing-popular">
                  {t("pricing.popular")}
                </span>
              )}
              <div className="marketing-plan-icon">
                {plan === 0 ? (
                  <MessageCircle size={21} />
                ) : plan === 1 ? (
                  <Workflow size={21} />
                ) : (
                  <Users size={21} />
                )}
              </div>
              <h3>{t(`pricing.plans.${plan}.name`)}</h3>
              <p>{t(`pricing.plans.${plan}.description`)}</p>
              <div className="marketing-price">
                <strong>{t(`pricing.plans.${plan}.${billing}`)}</strong>
                {plan < 2 && <span>{t("pricing.perMonth")}</span>}
              </div>
              <span className="marketing-included">
                {t("pricing.included")}
              </span>
              <ul>
                {[0, 1, 2, 3].map((feature) => (
                  <li key={feature}>
                    <Check size={14} />{" "}
                    {t(`pricing.plans.${plan}.features.${feature}`)}
                  </li>
                ))}
              </ul>
              <a
                className={`button ${plan === 1 ? "button-primary" : "button-ghost"}`}
                href="/?auth=1"
              >
                {t(`pricing.plans.${plan}.cta`)} <ArrowRight size={14} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-final-cta reveal">
        <div>
          <h2>{t("finalCta.title")}</h2>
          <p>{t("finalCta.description")}</p>
        </div>
        <div>
          <a className="button button-primary" href="/?auth=1">
            {t("finalCta.primary")} <ArrowRight size={15} />
          </a>
          <a className="button button-ghost" href="#features">
            {t("finalCta.secondary")}
          </a>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-brand">
          <BrandLockup />
          <p>{t("footer.description")}</p>
          <div className="marketing-footer-status">
            <i /> {t("footer.status")}
          </div>
        </div>
        {(["product", "resources", "company", "legal"] as const).map(
          (column) => (
            <div className="marketing-footer-column" key={column}>
              <h3>{t(`footer.columns.${column}.title`)}</h3>
              {[0, 1, 2, 3].map((link) => (
                <a
                  href={
                    link === 0 && column === "product" ? "#features" : "#top"
                  }
                  key={link}
                >
                  {t(`footer.columns.${column}.links.${link}`)}
                </a>
              ))}
            </div>
          ),
        )}
        <div className="marketing-footer-bottom">
          <span>
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </span>
          <button type="button" onClick={switchLanguage}>
            {t("navigation.switchLanguageLong")}
          </button>
          <a href="#top">{t("footer.backToTop")} ↑</a>
        </div>
      </footer>
    </main>
  );
}
