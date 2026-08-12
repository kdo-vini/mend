/* global process, console */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const localeRoot = path.join(sourceRoot, "i18n", "locales");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(filename);
    return filename.endsWith(".tsx") ? [filename] : [];
  });
}

function flatten(value, prefix = "") {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce(
    (result, [key, child]) => ({
      ...result,
      ...flatten(child, prefix ? `${prefix}.${key}` : key),
    }),
    {},
  );
}

function placeholders(value) {
  return [...value.matchAll(/{{\s*([^}\s]+)\s*}}/g)]
    .map((match) => match[1])
    .sort()
    .join(",");
}

const errors = [];
const locales = ["en-US", "pt-BR"];
const namespaces = fs
  .readdirSync(path.join(localeRoot, "en-US"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5));

for (const namespace of namespaces) {
  const catalogs = locales.map((locale) => {
    const filename = path.join(localeRoot, locale, `${namespace}.json`);
    try {
      return flatten(JSON.parse(fs.readFileSync(filename, "utf8")));
    } catch (error) {
      errors.push(`${filename}: ${error.message}`);
      return {};
    }
  });
  const [english, portuguese] = catalogs;
  for (const key of new Set([
    ...Object.keys(english),
    ...Object.keys(portuguese),
  ])) {
    if (!(key in english) || !(key in portuguese)) {
      const missing = [
        !(key in english) ? "en-US" : null,
        !(key in portuguese) ? "pt-BR" : null,
      ]
        .filter(Boolean)
        .join(", ");
      errors.push(`${namespace}.${key}: missing in ${missing}`);
    } else if (placeholders(english[key]) !== placeholders(portuguese[key]))
      errors.push(`${namespace}.${key}: interpolation placeholders differ`);
  }
}

for (const filename of walk(sourceRoot)) {
  if (filename.includes(`${path.sep}components${path.sep}ui${path.sep}`))
    continue;
  const source = fs.readFileSync(filename, "utf8");
  if (!source.includes("<") || source.includes("i18n-exempt:")) continue;
  if (!/useTranslation\s*\(|i18n\.t\s*\(/.test(source)) {
    errors.push(
      `${path.relative(root, filename)}: add useTranslation() or an i18n-exempt reason`,
    );
  }
}

if (errors.length) {
  console.error("Frontend i18n check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Frontend i18n check passed (${namespaces.length} namespaces, ${locales.length} locales).`,
);
