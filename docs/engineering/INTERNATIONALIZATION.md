# Frontend internationalization contract

Mend supports two interface locales: `pt-BR` and `en-US`. Every user-visible
frontend string must be represented in both locale catalogs before the change
is considered complete.

This includes page copy, buttons, labels, placeholders, tooltips, aria labels,
empty/loading/error states, confirmation dialogs, toasts, and fallback text
created by the client. Domain values such as issue status, priority, type, and
run mode are data, but their rendered labels must still use the active locale.

## Implementation rules

- Use `useTranslation` (or `t` passed from a translated parent) in every page,
  feature component, and app-shell component that renders user-facing copy.
- Add the same key and interpolation placeholders to
  `src/i18n/locales/en-US/*.json` and `src/i18n/locales/pt-BR/*.json`.
- Keep the active interface language controlled by the Profile language
  switcher. Use `applyInterfaceLanguage` for the immediate UI update and
  `saveInterfaceLanguage` for persistence; do not read the browser language
  directly for product copy.
- Do not put English or Portuguese product copy in constants, status maps, API
  adapters, or component props. Store a stable semantic value and translate it
  at render time.
- If a technical value must be shown verbatim (for example an API error), use a
  localized fallback and keep the raw value only as the detail.

## New feature checklist

1. Add keys to both catalogs in the feature namespace.
2. Render all copy through `t(...)` and verify the Profile toggle updates the
   feature without a reload.
3. Run `npm run i18n:check` and `npm run i18n:frontend` before submitting.
4. Add or update a test when the feature introduces a new language-dependent
   behavior.

The catalog parity test and frontend translation guard are part of the normal
validation gate. A missing locale key or a UI module without a translation
hook fails CI instead of becoming a silent untranslated screen.
