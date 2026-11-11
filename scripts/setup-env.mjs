#!/usr/bin/env node
/**
 * Writes .env.local for local development from the running local Supabase
 * stack, and generates the local secrets. Run after `npm run db:start`.
 *
 *   npm run setup:env            creates .env.local (refuses to overwrite)
 *   npm run setup:env -- --force overwrites an existing .env.local
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target) && !process.argv.includes("--force")) {
  console.error(`${target} bestaat al. Gebruik --force om hem te overschrijven.`);
  process.exit(1);
}

let status;
try {
  status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch {
  console.error("De lokale Supabase draait niet. Start Docker en voer eerst `npm run db:start` uit.");
  process.exit(1);
}
const values = Object.fromEntries(
  status
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const publishable = values.PUBLISHABLE_KEY || values.ANON_KEY;
const secret = values.SECRET_KEY || values.SERVICE_ROLE_KEY;
if (!values.API_URL || !publishable || !secret) {
  console.error("Kon de Supabase-sleutels niet lezen uit `npx supabase status -o env`.");
  process.exit(1);
}

const template = readFileSync(".env.example", "utf8");
const set = {
  NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SECRET_KEY: secret,
  INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  CRON_SECRET: randomBytes(24).toString("hex"),
  INBOUND_MAIL_SECRET: randomBytes(24).toString("hex"),
  INTEGRATION_ALLOW_PRIVATE_HOSTS: "true",
};
const output = template
  .split("\n")
  .map((line) => {
    const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
    return key && key in set ? `${key}=${set[key]}` : line;
  })
  .join("\n");
writeFileSync(target, output);
console.log(`${target} geschreven. Supabase API: ${values.API_URL}`);
console.log("Vul optioneel ANTHROPIC_API_KEY in; zonder sleutel draait de AI-laag in demo-modus.");
