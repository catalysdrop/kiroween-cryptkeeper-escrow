/**
 * Shared types for the Crypt Keeper verification agent.
 */

export type Verdict = "RELEASE" | "REFUND" | "DISPUTE";

export type CheckStatus = "passed" | "failed" | "neutral";

export interface EvidenceCheck {
  /** Machine-readable check id: reachability | integrity | github | freshness */
  name: string;
  /** Human-readable label shown in the UI. */
  label: string;
  status: CheckStatus;
  /** What the check observed (shown to the user). */
  detail: string;
  /** Weight in the score (0..1). Neutral checks are excluded from scoring. */
  weight: number;
}

export interface VerdictReport {
  verdict: Verdict;
  /** Weighted score over applicable checks, 0..1. */
  score: number;
  /** Score before the lateness cap was applied (same as score when on time). */
  rawScore: number;
  /** True when the evidence arrived after the deadline. */
  late: boolean;
  /** Per-check results, in evaluation order. */
  checks: EvidenceCheck[];
  /** One-line human summary of why this verdict was issued. */
  summary: string;
  /** Keeper flavour text — decoration only, never affects the verdict. */
  quip: string;
}

export interface VerifyInput {
  /** Evidence URL submitted by the seller (http/https only). */
  url: string;
  /** SHA-256 hex (64 chars) the seller claims matches the content. */
  claimedHash: string;
  /** Deal creation time, unix ms. */
  dealCreatedAt: number;
  /** Deal deadline, unix ms. */
  deadline: number;
  /** Evidence submission time, unix ms. Defaults to now. */
  submittedAt?: number;
}

export interface VerifyOptions {
  /** Fetch implementation (defaults to global fetch). Inject a fake in tests. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Max response body in bytes. Default 5 * 1024 * 1024. */
  maxBodyBytes?: number;
}
