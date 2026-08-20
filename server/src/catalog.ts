import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type Surface = "claude-code" | "codex-cli" | "claude-ai" | "chatgpt";

export interface Skill {
  name: string;
  description: string;
  license?: string;
  metadata?: Record<string, string>;
  path: string; // repo-relative path to SKILL.md
  bodyChars: number;
}
export interface Plugin {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  keywords: string[];
  skills: Skill[];
  hasMcp: boolean;
  installs: Record<Surface, string[]>;
}
export interface Catalog {
  marketplace: {
    name: string; displayName: string; description: string;
    repository: string; homepage: string; owner: { name: string };
  };
  plugins: Plugin[];
}

const here = dirname(fileURLToPath(import.meta.url));
// server/src or server/dist -> repo root
export const REPO_ROOT = process.env.SKILLMCP_REPO_ROOT ?? join(here, "..", "..");
const CATALOG_URL = process.env.SKILLMCP_CATALOG_URL; // optional: raw GitHub URL of catalog/index.json
const RAW_BASE = process.env.SKILLMCP_RAW_BASE;       // optional: raw GitHub base for SKILL.md files
const TTL_MS = Number(process.env.SKILLMCP_CATALOG_TTL_MS ?? 5 * 60 * 1000);

let cached: { at: number; catalog: Catalog } | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.catalog;
  let catalog: Catalog;
  if (CATALOG_URL) {
    const r = await fetch(CATALOG_URL, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) throw new Error(`catalog fetch failed: ${r.status}`);
    catalog = (await r.json()) as Catalog;
  } else {
    catalog = JSON.parse(readFileSync(join(REPO_ROOT, "catalog", "index.json"), "utf8"));
  }
  cached = { at: Date.now(), catalog };
  return catalog;
}

export async function readSkillMarkdown(skill: Skill): Promise<string> {
  if (RAW_BASE) {
    const r = await fetch(`${RAW_BASE.replace(/\/$/, "")}/${skill.path}`);
    if (!r.ok) throw new Error(`SKILL.md fetch failed: ${r.status}`);
    return r.text();
  }
  const p = join(REPO_ROOT, skill.path);
  if (!existsSync(p)) throw new Error(`missing ${skill.path}`);
  return readFileSync(p, "utf8");
}

export function findPlugin(catalog: Catalog, name: string): Plugin | undefined {
  return catalog.plugins.find((p) => p.name === name || p.skills.some((s) => s.name === name));
}

export function search(catalog: Catalog, query: string, category?: string): Plugin[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.plugins
    .filter((p) => !category || p.category.toLowerCase() === category.toLowerCase())
    .map((p) => {
      const hay = [p.name, p.displayName, p.description, p.category, ...p.keywords,
        ...p.skills.flatMap((s) => [s.name, s.description])].join(" ").toLowerCase();
      const score = terms.length ? terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) : 1;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
