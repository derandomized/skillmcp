import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export const INBOX = process.env.SKILLMCP_INBOX ?? join(homedir(), ".skillmcp", "inbox");
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Submission {
  name: string;
  displayName: string;
  description: string;
  category: string;
  keywords: string[];
  body: string;
  submitter: { name: string; email?: string; surface?: string };
  submittedAt: string;
  id: string;
}

export function validateSubmission(s: Omit<Submission, "id" | "submittedAt">): string[] {
  const e: string[] = [];
  if (!NAME_RE.test(s.name) || s.name.length > 64) e.push("name: lowercase letters, digits, single hyphens; ≤64 chars");
  if (!s.description || s.description.length > 1024) e.push("description: 1–1024 chars");
  if (!s.body.trim()) e.push("body: empty");
  if (s.body.split("\n").length > 500) e.push("body: > 500 lines; move detail into references");
  if (/^---\s*$/m.test(s.body.split("\n")[0] ?? "")) e.push("body: do not include YAML frontmatter; it is generated");
  if (/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})/.test(s.body)) e.push("body: looks like it contains a credential");
  if (/ignore (all )?(previous|prior) instructions/i.test(s.body)) e.push("body: prompt-injection phrase");
  if (!s.submitter?.name) e.push("submitter.name required");
  if (s.submitter?.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.submitter.email)) e.push("submitter.email invalid");
  return e;
}

export function saveSubmission(s: Omit<Submission, "id" | "submittedAt">): Submission {
  mkdirSync(INBOX, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${s.name}-${randomBytes(3).toString("hex")}`;
  const full: Submission = { ...s, id, submittedAt: new Date().toISOString() };
  const p = join(INBOX, `${id}.json`);
  if (existsSync(p)) throw new Error("id collision");
  writeFileSync(p, JSON.stringify(full, null, 2));
  return full;
}
