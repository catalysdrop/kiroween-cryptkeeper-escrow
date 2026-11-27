/**
 * The Crypt Keeper — a deterministic, explainable delivery-verification agent.
 *
 * No LLM calls, no API keys, no paid services. The Keeper runs a pipeline
 * of evidence checks, scores them, and issues a verdict:
 *
 *   score >= 0.8 AND integrity passed  -> RELEASE
 *   score <= 0.4 OR integrity failed   -> REFUND
 *   otherwise                          -> DISPUTE
 *
 * Late evidence (submitted after the deadline) caps the score at 0.79,
 * so a late delivery can never earn RELEASE — at best DISPUTE.
 *
 * Every check that errors counts as FAILED (fail closed). Checks that do
 * not apply (e.g. the GitHub check for a non-GitHub URL) are NEUTRAL
 * and excluded from the score.
 */

import { createHash } from "node:crypto";
import type { EvidenceCheck, Verdict, VerdictReport, VerifyInput, VerifyOptions } from "./types.js";

const RELEASE_THRESHOLD = 0.8;
const REFUND_THRESHOLD = 0.4;
const LATE_SCORE_CAP = 0.79;
const MAX_REDIRECTS = 3;

const QUIPS: Record<Verdict, string[]> = {
  RELEASE: [
    "The grave gives up its gold — the work checks out, every bone in place.",
    "Dug it up, dusted it off, verified it twice. Pay the seller.",
  ],
  REFUND: [
    "This grave is empty — the evidence does not hold up. The gold stays buried with its owner.",
    "The Keeper rattles his keys: no delivery here. Refund it is.",
  ],
  DISPUTE: [
    "Something stirs in the dark, but the Keeper cannot name it yet. A human must decide.",
    "Half-buried, half-found. This one needs living eyes on it.",
  ],
};

function isHex64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

/** SSRF guard: only public http/https hosts. */
function isPublicHttpUrl(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  const m172 = /^172\.(\d+)\./.exec(host);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return false;
  if (/^0\./.test(host) || /^169\.254\./.test(host)) return false;
  return true;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: ctrl.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

/** Follow redirects manually (max 3), return the final response. */
async function fetchFollowing(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchWithTimeout(fetchImpl, current, timeoutMs);
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      if (hop === MAX_REDIRECTS) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("unreachable");
}

function parseGitHubRepo(url: string): { owner: string; repo: string } | null {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i.exec(url.trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export async function verifyEvidence(input: VerifyInput, options: VerifyOptions = {}): Promise<VerdictReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBodyBytes = options.maxBodyBytes ?? 5 * 1024 * 1024;

  if (!isHex64(input.claimedHash)) {
    throw new Error("claimedHash must be a 64-character hex SHA-256");
  }
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new Error("url is not a valid URL");
  }
  if (!isPublicHttpUrl(url)) {
    throw new Error("url must be a public http(s) URL");
  }

  const submittedAt = input.submittedAt ?? Date.now();
  const late = submittedAt > input.deadline;

  const checks: EvidenceCheck[] = [];
  let body: Buffer | null = null;
  let lastModified: string | null = null;

  // 1. Reachability ---------------------------------------------------
  let reachable = false;
  try {
    const res = await fetchFollowing(fetchImpl, input.url, timeoutMs);
    lastModified = res.headers.get("last-modified");
    if (res.status >= 200 && res.status < 400) {
      reachable = true;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBodyBytes) {
        checks.push({
          name: "reachability",
          label: "Evidence URL reachable",
          status: "failed",
          detail: `Content is ${(buf.length / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit.`,
          weight: 0.25,
        });
      } else {
        body = buf;
        checks.push({
          name: "reachability",
          label: "Evidence URL reachable",
          status: "passed",
          detail: `HTTP ${res.status} — the link answers.`,
          weight: 0.25,
        });
      }
    } else {
      checks.push({
        name: "reachability",
        label: "Evidence URL reachable",
        status: "failed",
        detail: `HTTP ${res.status} — the link does not answer properly.`,
        weight: 0.25,
      });
    }
  } catch (err) {
    checks.push({
      name: "reachability",
      label: "Evidence URL reachable",
      status: "failed",
      detail: `Fetch failed: ${err instanceof Error ? err.message : "unknown error"}.`,
      weight: 0.25,
    });
  }

  // 2. Integrity (SHA-256 of fetched content vs claimed hash) ---------
  if (body !== null) {
    const actual = createHash("sha256").update(body).digest("hex");
    const match = actual.toLowerCase() === input.claimedHash.toLowerCase();
    checks.push({
      name: "integrity",
      label: "Content hash matches the claim",
      status: match ? "passed" : "failed",
      detail: match
        ? "SHA-256 of the fetched content matches the seller's claimed hash exactly."
        : "SHA-256 mismatch — the content is not what the seller claimed it was.",
      weight: 0.45,
    });
  } else {
    checks.push({
      name: "integrity",
      label: "Content hash matches the claim",
      status: "failed",
      detail: "No content could be fetched, so the hash cannot be verified.",
      weight: 0.45,
    });
  }

  // 3. GitHub repo check (only for github.com URLs) -------------------
  const gh = parseGitHubRepo(input.url);
  if (gh) {
    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        `https://api.github.com/repos/${gh.owner}/${gh.repo}`,
        timeoutMs,
      );
      if (res.status === 200) {
        const data = (await res.json()) as { private?: boolean; size?: number };
        const ok = data.private !== true;
        checks.push({
          name: "github",
          label: "GitHub repository exists and is public",
          status: ok ? "passed" : "failed",
          detail: ok
            ? `${gh.owner}/${gh.repo} exists and is public.`
            : `${gh.owner}/${gh.repo} is private.`,
          weight: 0.15,
        });
      } else if (res.status === 404) {
        checks.push({
          name: "github",
          label: "GitHub repository exists and is public",
          status: "failed",
          detail: `${gh.owner}/${gh.repo} does not exist (404).`,
          weight: 0.15,
        });
      } else {
        checks.push({
          name: "github",
          label: "GitHub repository exists and is public",
          status: "failed",
          detail: `GitHub API answered HTTP ${res.status}.`,
          weight: 0.15,
        });
      }
    } catch (err) {
      checks.push({
        name: "github",
        label: "GitHub repository exists and is public",
        status: "failed",
        detail: `GitHub API check failed: ${err instanceof Error ? err.message : "unknown error"}.`,
        weight: 0.15,
      });
    }
  } else {
    checks.push({
      name: "github",
      label: "GitHub repository exists and is public",
      status: "neutral",
      detail: "Not a GitHub URL — this check does not apply.",
      weight: 0.15,
    });
  }

  // 4. Freshness (Last-Modified vs deal creation) ---------------------
  if (lastModified) {
    const lm = Date.parse(lastModified);
    if (Number.isNaN(lm)) {
      checks.push({
        name: "freshness",
        label: "Content is fresh (newer than the deal)",
        status: "neutral",
        detail: "Last-Modified header is unparsable — this check does not apply.",
        weight: 0.15,
      });
    } else if (lm >= input.dealCreatedAt) {
      checks.push({
        name: "freshness",
        label: "Content is fresh (newer than the deal)",
        status: "passed",
        detail: `Last modified ${new Date(lm).toISOString()} — after the deal was created.`,
        weight: 0.15,
      });
    } else {
      checks.push({
        name: "freshness",
        label: "Content is fresh (newer than the deal)",
        status: "failed",
        detail: `Last modified ${new Date(lm).toISOString()} — before the deal was created. The link may point at old work.`,
        weight: 0.15,
      });
    }
  } else {
    checks.push({
      name: "freshness",
      label: "Content is fresh (newer than the deal)",
      status: "neutral",
      detail: "No Last-Modified header — this check does not apply.",
      weight: 0.15,
    });
  }

  // Scoring (applicable checks only) -----------------------------------
  const applicable = checks.filter((c) => c.status !== "neutral");
  const totalWeight = applicable.reduce((s, c) => s + c.weight, 0);
  const earned = applicable
    .filter((c) => c.status === "passed")
    .reduce((s, c) => s + c.weight, 0);
  const rawScore = totalWeight > 0 ? earned / totalWeight : 0;
  const score = late ? Math.min(rawScore, LATE_SCORE_CAP) : rawScore;

  const integrity = checks.find((c) => c.name === "integrity");
  const integrityPassed = integrity?.status === "passed";

  let verdict: Verdict;
  let summary: string;
  if (!integrityPassed) {
    verdict = "REFUND";
    summary = "The delivered content does not match the seller's hash claim — the deal is refunded.";
  } else if (score >= RELEASE_THRESHOLD) {
    verdict = "RELEASE";
    summary = `All decisive checks passed (score ${score.toFixed(2)}). The seller is paid.`;
  } else if (score <= REFUND_THRESHOLD) {
    verdict = "REFUND";
    summary = `Too many checks failed (score ${score.toFixed(2)}). The buyer is refunded.`;
  } else {
    verdict = "DISPUTE";
    summary = `Evidence is ambiguous (score ${score.toFixed(2)}). Funds stay frozen until a human decides.`;
  }
  if (late && verdict === "RELEASE") {
    // Unreachable by construction (cap is 0.79 < 0.8), kept as a guard.
    verdict = "DISPUTE";
    summary = "Evidence is late — a human must decide.";
  }
  if (late) {
    summary += " Note: the evidence arrived after the deadline.";
  }

  const quips = QUIPS[verdict];
  const quip = quips[Math.floor(Math.random() * quips.length)];

  return { verdict, score, rawScore, late, checks, summary, quip };
}
