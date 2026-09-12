-- Repository sources may include implementation files because Mend must answer
-- from the current product behavior. The extractor still enforces its hard
-- denylist, binary detection and per-file/per-run size limits.
alter table public.knowledge_sources
  alter column include_patterns set default
  '["README.md","docs/**/*.md","docs/**/*.mdx","openapi*.json","openapi*.yaml","openapi*.yml","src/**/*.ts","src/**/*.tsx","server/**/*.ts","app/**/*.ts","app/**/*.tsx","packages/**/*.ts","packages/**/*.tsx","src/i18n/locales/**/*.json"]'::jsonb;

update public.knowledge_sources
set include_patterns =
  '["README.md","docs/**/*.md","docs/**/*.mdx","openapi*.json","openapi*.yaml","openapi*.yml","src/**/*.ts","src/**/*.tsx","server/**/*.ts","app/**/*.ts","app/**/*.tsx","packages/**/*.ts","packages/**/*.tsx","src/i18n/locales/**/*.json"]'::jsonb,
    updated_at = now()
where include_patterns =
  '["README.md","docs/**/*.md","docs/**/*.mdx","openapi*.json","src/i18n/locales/**/*.json"]'::jsonb;
