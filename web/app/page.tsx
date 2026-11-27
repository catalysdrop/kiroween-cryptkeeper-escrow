"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadDeals, resetDemo, STATE_INFO, type Deal } from "../lib/demo";
import { formatBnb, formatDate, shortAddress } from "../lib/format";

export default function HomePage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setDeals(loadDeals());
    setLoaded(true);
  }, []);

  return (
    <>
      <h1>The Keeper guards every deal.</h1>
      <p className="lede">
        A buyer locks payment in a smart-contract vault. A seller submits
        proof of delivery. The Crypt Keeper — an AI verification agent —
        digs up the truth and decides: release the gold, or send it back
        to its owner. No human middleman. No trust required.
      </p>

      <div className="steps">
        <div className="step">
          <b>1. Seal the deal</b>
          Buyer and seller agree an amount and a deadline.
        </div>
        <div className="step">
          <b>2. Bury the gold</b>
          The buyer locks the funds in the escrow contract.
        </div>
        <div className="step">
          <b>3. Exhume the evidence</b>
          The seller submits a delivery URL and its content hash.
        </div>
        <div className="step">
          <b>4. The Keeper decides</b>
          The agent verifies the evidence check by check — then the
          contract pays the seller, refunds the buyer, or freezes the
          funds for a human decision.
        </div>
      </div>

      <div className="btn-row">
        <Link className="btn" href="/deals/new">
          Open a deal
        </Link>
        <button
          className="btn secondary"
          onClick={() => {
            resetDemo();
            setDeals(loadDeals());
          }}
        >
          Reset demo deals
        </button>
      </div>

      <h2>Deals in the crypt</h2>
      {!loaded && <p className="muted">Loading deals…</p>}
      {loaded && deals.length === 0 && (
        <p className="muted">No deals yet. Open one — the Keeper is waiting.</p>
      )}
      <ul className="deal-list">
        {deals.map((d) => (
          <li key={d.id}>
            <Link className="deal-item" href={`/deals/${d.id}`}>
              <div className="card">
                <span className="badge" style={{ color: STATE_INFO[d.state].color }}>
                  <span className="dot" />
                  {STATE_INFO[d.state].label}
                </span>
                <h3 style={{ marginTop: 10 }}>{d.description}</h3>
                <div className="meta">
                  <span>{formatBnb(d.amountWei)}</span>
                  <span>
                    {shortAddress(d.buyer)} → {shortAddress(d.seller)}
                  </span>
                  <span>Deadline {formatDate(d.deadline)}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <h2>How the Keeper verifies</h2>
      <p>
        The Keeper is a deterministic agent — no black box. For every
        delivery it runs four checks and shows each result: is the URL
        reachable, does the content&apos;s SHA-256 match the seller&apos;s
        claim, does a linked GitHub repo exist and is it public, and is
        the content newer than the deal. A weighted score decides the
        verdict: <b>≥ 0.80 releases</b>, <b>≤ 0.40 refunds</b>, anything
        in between — or a late delivery — goes to dispute, where the
        humans settle it.
      </p>
      <p className="muted small">
        The same verification code runs in the demo (via{" "}
        <code>/api/verdict</code>) and in the on-chain flow. Read it in{" "}
        <code>agent/src/keeper.ts</code>.
      </p>
    </>
  );
}
