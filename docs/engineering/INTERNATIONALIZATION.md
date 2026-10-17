# Frontend copy contract

Mend is an internal Diagium tool and its interface is **Portuguese (pt-BR)
only**. There is no English catalog and no language switcher; the server
writes its copy (notifications, WhatsApp handoffs, agent intro) in pt-BR too.

Copy still goes through i18next so it lives in one place per feature and is
easy to review:

- Use `useTranslation` (or `t` passed from a translated parent) in every page,
  feature component and app-shell component that renders user-facing copy.
- Add keys to `src/i18n/locales/pt-BR/<namespace>.json`.
- Format dates and numbers with `appLocale` from `src/i18n/resources.ts`; do
  not read the browser language.
- Do not put product copy in constants, status maps, API adapters or component
  props. Store a stable semantic value and translate it at render time.
- If a technical value must be shown verbatim (for example an API error), use a
  translated fallback and keep the raw value only as the detail.

Run `npm run i18n:check` and `npm run i18n:frontend` before submitting. The
frontend guard fails CI when a UI module renders copy without a translation
hook or an `i18n-exempt:` reason.
