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

const errors = [];
const namespaces = fs
  .readdirSync(path.join(localeRoot, "pt-BR"))
  .filter((name) => name.endsWith(".json"));

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
  `Frontend i18n check passed (${namespaces.length} namespaces, pt-BR).`,
);
