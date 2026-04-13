#!/usr/bin/env node

const input = process.argv[2];

if (!input) {
  console.error("Usage: url-slug.js <url>");
  process.exit(1);
}

let parsed;

try {
  parsed = new URL(input);
} catch (error) {
  console.error(`Invalid URL: ${input}`);
  process.exit(1);
}

function sanitize(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
const pathPart = pathname ? pathname.split("/").slice(0, 4).join("-") : "root";
const slug = sanitize(`${parsed.hostname}-${pathPart}`) || "site-root";

process.stdout.write(slug);
