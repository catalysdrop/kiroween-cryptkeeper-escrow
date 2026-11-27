"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DEMO_BAD_HASH,
  DEMO_BAD_URL,
  DEMO_GOOD_HASH,
  DEMO_GOOD_URL,
  loadDeals,
  saveDeals,
  STATE_INFO,
  type Deal,
  type DealState,
} from "../../../lib/demo";
import { formatBnb, formatDate, shortAddress } from "../../../lib/format";
import type { VerdictReport } from "@cryptkeeper/agent";

const FLOW: DealState[] = ["Sealed", "Buried", "Exhumed", "Released"];
const TERMINAL: DealState[] = ["Released", "LaidToRest", "Disputed", "Settled", "Cancelled"];

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actingAs, setActingAs] = useState<"buyer" | "seller">("seller");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceHash, setEvidenceHash] = useState("");
  const [shareBps, setShareBps] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const found = loadDeals().find((d) => d.id === params.id);
    if (found) setDeal(found);
    else setNotFound(true);
  }, [params.id]);

  function update(mut: (d: Deal) => Deal) {
    setDeal((prev) => {
      if (!prev) return prev;
      const next = mut({ ...prev });
      const all = loadDeals().map((d) => (d.id === next.id ? next : d));
      saveDeals(all);
      return next;
    });
  }

  function fund() {
    setError("");
    update((d) => ({ ...d, state: "Buried" }));
    setNote("Funds buried in the vault. The seller can now deliver.");
  }

  function cancel() {
    update((d) => ({ ...d, state: "Cancelled" }));
    setNote("Draft cancelled. Nothing was funded, nothing moves.");
  }

  function submitEvidence(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!deal) return;
    if (!/^https?:\/\/.+/.test(evidenceUrl.trim())) {
      setError("Evidence URL must start with http:// or https://");
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(evidenceHash.trim())) {
      setError("Content hash must be 64 hex characters (SHA-256).");
      return;
    }
    const now = Date.now();
    update((d) => ({
      ...d,
      state: "Exhumed",
      evidenceUrl: evidenceUrl.trim(),
      evidenceHash: evidenceHash.trim().toLowerCase(),
      evidenceSubmittedAt: now,
      late: now > d.deadline,
    }));
    setNote("Evidence exhumed. Ask the Keeper to inspect it.");
  }

  async function askKeeper() {
    if (!deal) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: deal.evidenceUrl,
          claimedHash: deal.evidenceHash,
          dealCreatedAt: deal.createdAt,
          deadline: deal.deadline,
          submittedAt: deal.evidenceSubmittedAt ?? Date.now(),
        }),
      });
      const data = (await res.json()) as VerdictReport | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `Keeper failed (HTTP ${res.status})`);
      }
      const report = data as VerdictReport;
      const nextState: DealState =
        report.verdict === "RELEASE"
          ? "Released"
          : report.verdict === "REFUND"
            ? "LaidToRest"
            : "Disputed";
      update((d) => ({ ...d, verdict: report, state: nextState }));
      setNote(
        report.verdict === "RELEASE"
          ? "The Keeper verified the delivery — the seller is paid."
          : report.verdict === "REFUND"
            ? "The Keeper rejected the evidence — the buyer is refunded."
            : "The Keeper cannot decide — funds frozen, humans must settle.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Keeper request failed.");
    } finally {
      setBusy(false);
    }
  }

  function proposeSettlement() {
    if (!deal) return;
    const bps = Number(shareBps);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      setError("Seller share must be a whole number of basis points (0–10000).");
      return;
    }
    setError("");
    update((d) => ({
      ...d,
      settlementProposer: actingAs,
      settlementSellerShareBps: bps,
    }));
    setNote(`Settlement proposed: seller ${bps / 100}% / buyer ${100 - bps / 100}%. The other side must accept.`);
  }

  function acceptSettlement() {
    if (!deal) return;
    update((d) => ({ ...d, state: "Settled" }));
    setNote("Settlement accepted. The vault is empty.");
  }

  function timeoutRefund() {
    if (!deal) return;
    update((d) => ({ ...d, state: "LaidToRest" }));
    setNote("Deadline passed with no delivery — the buyer is refunded.");
  }

  if (notFound) {
    return (
      <>
        <h1>Deal not found</h1>
        <p className="muted">This deal does not exist in demo storage. It may have been reset.</p>
        <Link className="btn" href="/">
          Back to deals
        </Link>
      </>
    );
  }
  if (!deal) return <p className="muted">Loading deal…</p>;

  const info = STATE_INFO[deal.state];
  const pastDeadline = Date.now() > deal.deadline;
  const timelineStates: DealState[] =
    deal.state === "LaidToRest"
      ? ["Sealed", "Buried", "LaidToRest"]
      : deal.state === "Disputed" || deal.state === "Settled"
        ? ["Sealed", "Buried", "Exhumed", "Disputed"]
        : deal.state === "Cancelled"
          ? ["Sealed", "Cancelled"]
          : FLOW;
  const currentIdx = timelineStates.indexOf(deal.state);

  return (
    <>
      <Link href="/">← All deals</Link>
      <h1 style={{ marginTop: 12 }}>{deal.description}</h1>
      <p>
        <span className="badge" style={{ color: info.color }}>
          <span className="dot" />
          {info.label}
        </span>
      </p>
      <p className="muted">{info.blurb}</p>

      <div className="card">
        <dl className="kv">
          <dt>Amount</dt>
          <dd>{formatBnb(deal.amountWei)}</dd>
          <dt>Buyer</dt>
          <dd>
            <code>{deal.buyer}</code>
          </dd>
          <dt>Seller</dt>
          <dd>
            <code>{deal.seller}</code>
          </dd>
          <dt>Deadline</dt>
          <dd>
            {formatDate(deal.deadline)} {pastDeadline && deal.state === "Buried" ? "(passed)" : ""}
          </dd>
          <dt>Created</dt>
          <dd>{formatDate(deal.createdAt)}</dd>
          {deal.evidenceUrl && (
            <>
              <dt>Evidence</dt>
              <dd>
                <a href={deal.evidenceUrl} target="_blank" rel="noreferrer">
                  {deal.evidenceUrl}
                </a>
              </dd>
              <dt>Claimed hash</dt>
              <dd>
                <code>{deal.evidenceHash}</code>
              </dd>
            </>
          )}
        </dl>
      </div>

      <h2>Where is this deal?</h2>
      <ol className="timeline">
        {timelineStates.map((s, i) => (
          <li key={s} className={i < currentIdx ? "done" : i === currentIdx ? "now" : ""}>
            <div className="t">{STATE_INFO[s].label}</div>
            <div className="d">{STATE_INFO[s].blurb}</div>
          </li>
        ))}
      </ol>

      {note && <p className="card" style={{ borderColor: "#2c4a35" }}>{note}</p>}
      {error && <p className="error">{error}</p>}

      {/* ---- State actions ---- */}
      {deal.state === "Sealed" && (
        <div className="card">
          <h3>Bury the gold</h3>
          <p className="muted">
            Fund the deal with exactly {formatBnb(deal.amountWei)}. In demo
            mode this just moves the deal state — no real funds.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={fund}>
              Fund {formatBnb(deal.amountWei)}
            </button>
            <button className="btn danger" onClick={cancel}>
              Cancel draft
            </button>
          </div>
        </div>
      )}

      {deal.state === "Buried" && (
        <div className="card">
          <h3>Submit delivery evidence</h3>
          <p className="muted">
            As the seller, paste the delivery URL and the SHA-256 hash of
            its content. The Keeper will fetch the URL and compare the hash.
          </p>
          <form onSubmit={submitEvidence}>
            <label className="field" htmlFor="url">
              Delivery URL
            </label>
            <input
              id="url"
              type="text"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://…"
            />
            <label className="field" htmlFor="hash">
              Content SHA-256
            </label>
            <input
              id="hash"
              type="text"
              value={evidenceHash}
              onChange={(e) => setEvidenceHash(e.target.value)}
              placeholder="64 hex characters"
            />
            <div className="btn-row">
              <button className="btn" type="submit">
                Submit evidence
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setEvidenceUrl(DEMO_GOOD_URL);
                  setEvidenceHash(DEMO_GOOD_HASH);
                }}
              >
                Fill demo evidence (good)
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setEvidenceUrl(DEMO_BAD_URL);
                  setEvidenceHash(DEMO_BAD_HASH);
                }}
              >
                Fill bad evidence
              </button>
            </div>
          </form>
          {pastDeadline && (
            <>
              <p className="muted">
                The deadline has passed with no delivery — the buyer can
                reclaim the funds.
              </p>
              <button className="btn danger" onClick={timeoutRefund}>
                Timeout refund (buyer)
              </button>
            </>
          )}
        </div>
      )}

      {deal.state === "Exhumed" && (
        <div className="card">
          <h3>Ask the Keeper</h3>
          <p className="muted">
            The Keeper fetches the evidence, hashes it, checks the repo and
            the freshness — then issues a verdict with every check listed.
          </p>
          <button className="btn" onClick={askKeeper} disabled={busy}>
            {busy ? "The Keeper is digging…" : "Ask the Keeper"}
          </button>
        </div>
      )}

      {deal.verdict && (
        <div
          className={`card verdict-${deal.verdict.verdict.toLowerCase()}`}
        >
          <h3>
            Keeper&apos;s verdict: {deal.verdict.verdict} (score{" "}
            {deal.verdict.score.toFixed(2)}
            {deal.late ? ", late delivery" : ""})
          </h3>
          <p>{deal.verdict.summary}</p>
          <ul className="checks">
            {deal.verdict.checks.map((c) => (
              <li key={c.name}>
                <span className={`st-${c.status}`}>
                  {c.status === "passed" ? "PASS" : c.status === "failed" ? "FAIL" : "—"}
                </span>{" "}
                <b>{c.label}</b> — {c.detail}
              </li>
            ))}
          </ul>
          <p className="muted small">“{deal.verdict.quip}”</p>
        </div>
      )}

      {deal.state === "Disputed" && (
        <div className="card">
          <h3>Settle the dispute</h3>
          <p className="muted">
            Propose a split (seller share in basis points: 10000 = 100%).
            The other side must accept the exact proposal.
          </p>
          <label className="field" htmlFor="actingAs">
            Acting as
          </label>
          <select
            id="actingAs"
            value={actingAs}
            onChange={(e) => setActingAs(e.target.value as "buyer" | "seller")}
          >
            <option value="buyer">Buyer ({shortAddress(deal.buyer)})</option>
            <option value="seller">Seller ({shortAddress(deal.seller)})</option>
          </select>
          <label className="field" htmlFor="share">
            Seller share (basis points)
          </label>
          <input
            id="share"
            type="number"
            min={0}
            max={10000}
            value={shareBps}
            onChange={(e) => setShareBps(e.target.value)}
          />
          {deal.settlementProposer && (
            <p className="muted">
              Current proposal: seller {deal.settlementSellerShareBps! / 100}%
              — proposed by the {deal.settlementProposer}.
            </p>
          )}
          <div className="btn-row">
            <button className="btn" onClick={proposeSettlement}>
              Propose split
            </button>
            {deal.settlementProposer && deal.settlementProposer !== actingAs && (
              <button className="btn secondary" onClick={acceptSettlement}>
                Accept split as {actingAs}
              </button>
            )}
          </div>
        </div>
      )}

      {TERMINAL.includes(deal.state) && deal.state !== "Disputed" && (
        <p className="muted">
          This deal is closed. <Link href="/">Back to all deals</Link> or{" "}
          <Link href="/deals/new">open a new one</Link>.
        </p>
      )}
    </>
  );
}
