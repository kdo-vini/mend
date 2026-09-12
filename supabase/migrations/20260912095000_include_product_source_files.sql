alter table public.knowledge_sources
  alter column include_patterns set default
  '["README.md","package.json","docs/**/*.md","docs/**/*.mdx","openapi*.json","openapi*.yaml","openapi*.yml","src/**/*.ts","src/**/*.tsx","src/**/*.js","src/**/*.jsx","src/**/*.svelte","server/**/*.ts","app/**/*.ts","app/**/*.tsx","app/**/*.svelte","packages/**/*.ts","packages/**/*.tsx","admin-dashboard/src/**/*.ts","admin-dashboard/src/**/*.svelte","src/i18n/locales/**/*.json"]'::jsonb;

update public.knowledge_sources
set include_patterns =
  '["README.md","package.json","docs/**/*.md","docs/**/*.mdx","openapi*.json","openapi*.yaml","openapi*.yml","src/**/*.ts","src/**/*.tsx","src/**/*.js","src/**/*.jsx","src/**/*.svelte","server/**/*.ts","app/**/*.ts","app/**/*.tsx","app/**/*.svelte","packages/**/*.ts","packages/**/*.tsx","admin-dashboard/src/**/*.ts","admin-dashboard/src/**/*.svelte","src/i18n/locales/**/*.json"]'::jsonb,
    updated_at = now()
where include_patterns =
  '["README.md","docs/**/*.md","docs/**/*.mdx","openapi*.json","openapi*.yaml","openapi*.yml","src/**/*.ts","src/**/*.tsx","server/**/*.ts","app/**/*.ts","app/**/*.tsx","packages/**/*.ts","packages/**/*.tsx","src/i18n/locales/**/*.json"]'::jsonb;
