"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";
import { loadDeals, saveDeals, type Deal } from "../../../lib/demo";
import { isValidAddress } from "../../../lib/format";

const DEMO_BUYER = "0xB0B00000000000000000000000000000000000B0B";

export default function NewDealPage() {
  const router = useRouter();
  const [seller, setSeller] = useState("0x5E1100000000000000000000000000000000005E11");
  const [amount, setAmount] = useState("0.5");
  const [deadline, setDeadline] = useState("2026-12-04T00:00");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function createDeal(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isValidAddress(seller)) {
      setError("Seller address is not a valid Ethereum address.");
      return;
    }
    if (seller.toLowerCase() === DEMO_BUYER.toLowerCase()) {
      setError("Buyer and seller must be different addresses.");
      return;
    }
    let amountWei: string;
    try {
      amountWei = ethers.parseEther(amount).toString();
    } catch {
      setError("Amount must be a number, e.g. 0.5.");
      return;
    }
    if (BigInt(amountWei) <= 0n) {
      setError("Amount must be greater than 0.");
      return;
    }
    const deadlineMs = Date.parse(deadline);
    if (Number.isNaN(deadlineMs) || deadlineMs <= Date.now()) {
      setError("Deadline must be a date in the future.");
      return;
    }
    if (description.trim().length < 5) {
      setError("Describe the work in a few words (at least 5 characters).");
      return;
    }

    const deal: Deal = {
      id: `deal-${Date.now().toString(36)}`,
      buyer: DEMO_BUYER,
      seller,
      amountWei,
      deadline: deadlineMs,
      description: description.trim(),
      state: "Sealed",
      createdAt: Date.now(),
      evidenceUrl: "",
      evidenceHash: "",
      evidenceSubmittedAt: null,
      late: false,
      verdict: null,
      settlementProposer: "",
      settlementSellerShareBps: null,
    };
    const deals = loadDeals();
    deals.unshift(deal);
    saveDeals(deals);
    router.push(`/deals/${deal.id}`);
  }

  return (
    <>
      <h1>Open a deal</h1>
      <p className="lede">
        Describe the work, name the seller, set the amount and the
        deadline. In demo mode the deal is created as a <b>Sealed</b>{" "}
        draft — fund it from the deal page to bury the gold.
      </p>
      <form onSubmit={createDeal}>
        <label className="field" htmlFor="description">
          What is the work?
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Build a one-page landing site for a haunted bakery"
        />

        <label className="field" htmlFor="seller">
          Seller address
        </label>
        <input
          id="seller"
          type="text"
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
          placeholder="0x…"
        />
        <p className="hint">
          Demo buyer is <code>{DEMO_BUYER}</code>. Any valid address
          other than the buyer works as the seller.
        </p>

        <label className="field" htmlFor="amount">
          Amount (BNB)
        </label>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <label className="field" htmlFor="deadline">
          Deadline
        </label>
        <input
          id="deadline"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />

        {error && <p className="error">{error}</p>}
        <div className="btn-row">
          <button className="btn" type="submit">
            Seal the deal
          </button>
        </div>
      </form>
    </>
  );
}
