#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { GitHub } from "./github.js";
import { collect } from "./collect.js";
import { buildDigest } from "./digest.js";
import { resolveLlm, llmGenerate } from "./llm.js";
import { buildSystem, buildUser } from "./prompt.js";
import { printSummary } from "./report.js";

/** Tiny .env loader — never overrides real env vars. */
function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

function stripFences(text: string): string {
  const m = text.match(/^\s*```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/);
  return (m ? m[1] : text).trim() + "\n";
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("gh-whoami")
    .description("Turn GitHub public data into an evidence-tagged profile README via LLM")
    .argument("<username>", "GitHub username")
    .option("--out <dir>", "output directory", "output")
    .option("--max-stars <n>", "cap on stars fetched", "2000")
    .option("--no-llm", "collect + digest only, skip generation")
    .version("0.1.0");
  program.parse();
  const opts = program.opts();
  const username = program.processedArgs[0] as string;

  loadEnvFile(".env");
  const maxStars = parseInt(opts.maxStars, 10) || 2000;

  console.log(`[1/4] Collecting public data for ${username} …`);
  const gh = new GitHub(process.env.GITHUB_TOKEN);
  const bundle = await collect(gh, username, maxStars);
  console.log(
    `      repos=${bundle.repos.length} stars=${bundle.stars.length} mergedPrs=${bundle.mergedPrs.length} events=${bundle.events.length}`,
  );

  console.log(`[2/4] Building digest …`);
  const digest = buildDigest(bundle);

  mkdirSync(opts.out, { recursive: true });
  const digestPath = `${opts.out}/${username}-digest.json`;
  writeFileSync(digestPath, JSON.stringify(digest, null, 2));

  const files = [digestPath];
  if (!opts.llm) {
    printSummary(digest, files);
    return;
  }

  const cfg = resolveLlm(process.env);
  if (!cfg) {
    console.log(`\n[skip] No LLM configuration found (LLM_* / ANTHROPIC_* / OPENAI_* env vars) — digest only.`);
    printSummary(digest, files);
    return;
  }

  console.log(`[3/4] Generating README via LLM (${cfg.provider} · ${cfg.model}) …`);
  const text = await llmGenerate(cfg, buildSystem(), buildUser(digest));

  const readmePath = `${opts.out}/${username}-README.md`;
  writeFileSync(readmePath, stripFences(text));
  files.push(readmePath);

  console.log(`[4/4] Done`);
  printSummary(digest, files);
}

main().catch((err: Error) => {
  console.error(`\nError: ${err.message}`);
  process.exitCode = 1;
});
