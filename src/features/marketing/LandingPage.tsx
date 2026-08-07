import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Code2,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  HeartPulse,
  Menu,
  MessageCircle,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandLockup } from "../../components/BrandLockup";
import {
  applyInterfaceLanguage,
  saveInterfaceLanguage,
} from "../../i18n/preferences";
import { normalizeLocale } from "../../i18n/resources";
import { supabase } from "../../lib/supabase";

const loopSteps = [
  { key: "signal", icon: MessageCircle },
  { key: "suspicion", icon: SearchCheck },
  { key: "evidence", icon: ClipboardCheck },
  { key: "investigation", icon: Bot },
  { key: "verdict", icon: ShieldCheck },
  { key: "decision", icon: ShieldCheck },
  { key: "fix", icon: Code2 },
  { key: "checks", icon: CheckCircle2 },
  { key: "pullRequest", icon: GitPullRequest },
  { key: "approval", icon: ShieldCheck },
  { key: "release", icon: GitCommitHorizontal },
  { key: "health", icon: HeartPulse },
  { key: "customer", icon: CheckCircle2 },
] as const;

const connectorNames = ["openai", "anthropic", "google", "verboo"] as const;

function LoopCasePreview() {
  const { t } = useTranslation("marketing");
  return (
    <div className="marketing-loop-console reveal">
      <div className="marketing-loop-console-head">
        <div>
          <span>{t("loopLanding.casePreview.case")}</span>
          <strong>{t("loopLanding.casePreview.title")}</strong>
        </div>
        <span className="marketing-case-state">
          <CircleDot size={10} /> {t("loopLanding.casePreview.state")}
        </span>
      </div>
      <ol
        className="marketing-loop-track"
        aria-label={t("loopLanding.loop.progressLabel")}
      >
        {loopSteps.map(({ key, icon: Icon }, index) => (
          <li
            className={
              index < 7 ? "is-complete" : index === 7 ? "is-current" : ""
            }
            key={key}
          >
            <span>{index < 4 ? <Check size={13} /> : <Icon size={13} />}</span>
            <strong>{t(`loopLanding.steps.${key}.title`)}</strong>
          </li>
        ))}
      </ol>
      <div className="marketing-case-grid">
        <div className="marketing-case-evidence">
          <span>{t("loopLanding.casePreview.evidence")}</span>
          {["trace", "release", "reproduction"].map((item) => (
            <div key={item}>
              <CheckCircle2 size={13} />
              <span>
                <strong>
                  {t(`loopLanding.casePreview.items.${item}.title`)}
                </strong>
                <small>
                  {t(`loopLanding.casePreview.items.${item}.detail`)}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="marketing-case-verdict">
          <span>{t("loopLanding.casePreview.verdict")}</span>
          <strong>{t("loopLanding.casePreview.confirmed")}</strong>
          <p>{t("loopLanding.casePreview.verdictDetail")}</p>
          <div>
            <span>{t("loopLanding.casePreview.agent")}</span>
            <code>claude cli</code>
          </div>
          <div>
            <span>{t("loopLanding.casePreview.next")}</span>
            <code>{t("loopLanding.casePreview.fixRun")}</code>
          </div>
        </div>
      </div>
    </div>
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
              <small>
                {t("preview.channel")} · {t("preview.needsAttention")}
              </small>
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
                  {t("preview.issueId")} · {t("preview.issueStatus")}
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

export function LandingPage() {
  const { t, i18n } = useTranslation(["marketing", "common"]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
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
    <main className="marketing-page">
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
          {[
            ["features", "features"],
            ["capabilities", "capabilities"],
            ["use-cases", "useCases"],
            ["pricing", "pricing"],
          ].map(([target, label]) => (
            <a
              href={`#${target}`}
              key={target}
              onClick={() => setMenuOpen(false)}
            >
              {t(`navigation.${label}`)}
            </a>
          ))}
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
        <p>{t("loopLanding.hero.description")}</p>
        <div className="marketing-hero-actions">
          <a className="button button-primary" href="/?auth=1">
            {t("navigation.getStarted")} <ArrowRight size={15} />
          </a>
          <a className="button button-ghost" href="#features">
            {t("loopLanding.hero.secondaryCta")}
          </a>
        </div>
        <div className="marketing-hero-proof">
          <ProductPreview />
        </div>
      </section>

      <section
        className="marketing-connector-rail"
        aria-label={t("loopLanding.connectors.label")}
      >
        <span>{t("loopLanding.connectors.label")}</span>
        <div>
          {connectorNames.map((connector) => (
            <span key={connector}>
              <TerminalSquare size={14} />{" "}
              {t(`loopLanding.connectors.${connector}`)}
            </span>
          ))}
        </div>
        <span>{t("loopLanding.connectors.github")}</span>
      </section>

      <section
        className="marketing-section marketing-loop-section"
        id="features"
      >
        <div className="marketing-section-copy reveal">
          <h2>{t("loopLanding.loop.title")}</h2>
          <p>{t("loopLanding.loop.description")}</p>
        </div>
        <LoopCasePreview />
      </section>

      <section
        className="marketing-section marketing-evidence-section"
        id="capabilities"
      >
        <div className="marketing-evidence-copy reveal">
          <h2>{t("loopLanding.evidence.title")}</h2>
          <p>{t("loopLanding.evidence.description")}</p>
          <div className="marketing-decision-rule">
            <ShieldCheck size={18} />
            <span>
              <strong>{t("loopLanding.evidence.ruleTitle")}</strong>
              <small>{t("loopLanding.evidence.ruleDetail")}</small>
            </span>
          </div>
        </div>
        <div className="marketing-evidence-ledger reveal">
          {["suspicion", "proof", "verdict", "action"].map((item, index) => (
            <div key={item}>
              <span>
                {index < 3 ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </span>
              <div>
                <strong>{t(`loopLanding.evidence.items.${item}.title`)}</strong>
                <p>{t(`loopLanding.evidence.items.${item}.detail`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="marketing-section marketing-execution-section"
        id="use-cases"
      >
        <div className="marketing-execution-map reveal">
          <div className="marketing-execution-github">
            <GitBranch size={20} />
            <strong>{t("loopLanding.execution.githubTitle")}</strong>
            <p>{t("loopLanding.execution.githubDetail")}</p>
          </div>
          <div className="marketing-execution-line" aria-hidden="true" />
          <div className="marketing-execution-runner">
            <TerminalSquare size={20} />
            <strong>{t("loopLanding.execution.runnerTitle")}</strong>
            <p>{t("loopLanding.execution.runnerDetail")}</p>
          </div>
          <div className="marketing-execution-line" aria-hidden="true" />
          <div className="marketing-execution-pr">
            <GitPullRequest size={20} />
            <strong>{t("loopLanding.execution.prTitle")}</strong>
            <p>{t("loopLanding.execution.prDetail")}</p>
          </div>
        </div>
        <div className="marketing-execution-copy reveal">
          <h2>{t("loopLanding.execution.title")}</h2>
          <p>{t("loopLanding.execution.description")}</p>
          <ul>
            {["token", "workspace", "checks", "approval"].map((item) => (
              <li key={item}>
                <Check size={13} /> {t(`loopLanding.execution.items.${item}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="marketing-section marketing-pricing" id="pricing">
        <div className="marketing-pricing-intro reveal">
          <h2>{t("loopLanding.pricing.title")}</h2>
          <p>{t("loopLanding.pricing.description")}</p>
          <div
            className="marketing-billing-toggle"
            role="group"
            aria-label={t("pricing.billingLabel")}
          >
            <button
              className={billing === "monthly" ? "is-active" : ""}
              type="button"
              onClick={() => setBilling("monthly")}
            >
              {t("pricing.monthly")}
            </button>
            <button
              className={billing === "annual" ? "is-active" : ""}
              type="button"
              onClick={() => setBilling("annual")}
            >
              {t("pricing.annual")}
            </button>
          </div>
        </div>
        <div className="marketing-pricing-layout reveal">
          <article className="marketing-plan-featured">
            <div>
              <span>{t("pricing.plans.1.name")}</span>
              <strong>{t(`pricing.plans.1.${billing}`)}</strong>
              <small>{t("pricing.perMonth")}</small>
            </div>
            <p>{t("loopLanding.pricing.builderDescription")}</p>
            <ul>
              {[0, 1, 2, 3].map((feature) => (
                <li key={feature}>
                  <Check size={13} />{" "}
                  {t(`loopLanding.pricing.features.${feature}`)}
                </li>
              ))}
            </ul>
            <a className="button button-primary" href="/?auth=1">
              {t("navigation.getStarted")} <ArrowRight size={14} />
            </a>
          </article>
          <div className="marketing-plan-alternatives">
            {([0, 2] as const).map((plan) => (
              <article key={plan}>
                <span>{t(`pricing.plans.${plan}.name`)}</span>
                <strong>{t(`pricing.plans.${plan}.${billing}`)}</strong>
                <p>{t(`pricing.plans.${plan}.description`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-final-cta reveal">
        <div>
          <h2>{t("loopLanding.finalCta.title")}</h2>
          <p>{t("loopLanding.finalCta.description")}</p>
        </div>
        <a className="button button-primary" href="/?auth=1">
          {t("navigation.getStarted")} <ArrowRight size={15} />
        </a>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-brand">
          <BrandLockup />
          <p>{t("loopLanding.footer.description")}</p>
        </div>
        <nav aria-label={t("loopLanding.footer.label")}>
          <a href="#features">{t("navigation.features")}</a>
          <a href="#capabilities">{t("navigation.capabilities")}</a>
          <a href="#use-cases">{t("navigation.useCases")}</a>
          <a href="#pricing">{t("navigation.pricing")}</a>
        </nav>
        <div className="marketing-footer-bottom">
          <span>
            {t("loopLanding.footer.copyright", {
              year: new Date().getFullYear(),
            })}
          </span>
          <a href="#top">
            {t("footer.backToTop")} <ExternalLink size={12} />
          </a>
        </div>
      </footer>
    </main>
  );
}
