import type { VerdictReport } from "@cryptkeeper/agent";

export type DealState =
  | "Sealed"
  | "Buried"
  | "Exhumed"
  | "Released"
  | "LaidToRest"
  | "Disputed"
  | "Settled"
  | "Cancelled";

export interface Deal {
  id: string;
  buyer: string;
  seller: string;
  /** Amount in wei, as a decimal string (avoids BigInt JSON issues). */
  amountWei: string;
  deadline: number; // unix ms
  description: string;
  state: DealState;
  createdAt: number; // unix ms
  evidenceUrl: string;
  evidenceHash: string;
  evidenceSubmittedAt: number | null;
  late: boolean;
  verdict: VerdictReport | null;
  settlementProposer: "" | "buyer" | "seller";
  settlementSellerShareBps: number | null;
}

/** The seeded demo deal's delivery evidence (see DEMO-EVIDENCE.md at repo root). */
export const DEMO_GOOD_URL =
  "https://raw.githubusercontent.com/catalysdrop/kiroween-cryptkeeper-escrow/main/DEMO-EVIDENCE.md";
export const DEMO_GOOD_HASH =
  "3d683e966b93c20faf26e5dce97d102dd6559fe400fccf44962e7c1251ff8402";
/** A bad-evidence example: a real URL with a deliberately wrong hash. */
export const DEMO_BAD_URL = "https://example.com/";
export const DEMO_BAD_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const STATE_INFO: Record<DealState, { label: string; blurb: string; color: string }> = {
  Sealed: {
    label: "Sealed",
    blurb: "Deal drafted. The vault is empty — the buyer has not locked funds yet.",
    color: "#a89ec4",
  },
  Buried: {
    label: "Buried",
    blurb: "Funds are locked in the vault. The seller can now deliver the work.",
    color: "#8b5cf6",
  },
  Exhumed: {
    label: "Exhumed",
    blurb: "Evidence is on the table. The Keeper is inspecting it.",
    color: "#f5c542",
  },
  Released: {
    label: "Released",
    blurb: "The Keeper verified the delivery. The seller has been paid.",
    color: "#7dffb2",
  },
  LaidToRest: {
    label: "Laid to Rest",
    blurb: "The deal is closed and the buyer was refunded.",
    color: "#8a8a9e",
  },
  Disputed: {
    label: "Disputed",
    blurb: "The evidence is ambiguous. Funds are frozen until both sides agree a split.",
    color: "#ff6b6b",
  },
  Settled: {
    label: "Settled",
    blurb: "Both sides agreed a split. The vault is empty.",
    color: "#7dd3fc",
  },
  Cancelled: {
    label: "Cancelled",
    blurb: "The buyer cancelled the draft before funding it.",
    color: "#8a8a9e",
  },
};

const STORAGE_KEY = "cryptkeeper-deals-v1";

function seedDeals(): Deal[] {
  const now = Date.now();
  const created = Date.parse("2026-11-27T00:00:00Z");
  return [
    {
      id: "demo-1",
      buyer: "0xB0B00000000000000000000000000000000000B0B",
      seller: "0x5E1100000000000000000000000000000000005E11",
      amountWei: "500000000000000000", // 0.5 BNB
      deadline: Date.parse("2026-12-04T00:00:00Z"),
      description: "Build a one-page landing site for a haunted bakery.",
      state: "Exhumed",
      createdAt: created,
      evidenceUrl: DEMO_GOOD_URL,
      evidenceHash: DEMO_GOOD_HASH,
      evidenceSubmittedAt: now - 3600_000,
      late: false,
      verdict: null,
      settlementProposer: "",
      settlementSellerShareBps: null,
    },
    {
      id: "demo-2",
      buyer: "0xB0B00000000000000000000000000000000000B0B",
      seller: "0xDEAD00000000000000000000000000000000DEAD",
      amountWei: "200000000000000000", // 0.2 BNB
      deadline: Date.parse("2026-12-04T00:00:00Z"),
      description: "Design a spooky logo set (3 variants).",
      state: "Buried",
      createdAt: created,
      evidenceUrl: "",
      evidenceHash: "",
      evidenceSubmittedAt: null,
      late: false,
      verdict: null,
      settlementProposer: "",
      settlementSellerShareBps: null,
    },
    {
      id: "demo-3",
      buyer: "0xB0B00000000000000000000000000000000000B0B",
      seller: "0xCAFE00000000000000000000000000000000CAFE",
      amountWei: "100000000000000000", // 0.1 BNB
      deadline: Date.parse("2026-12-04T00:00:00Z"),
      description: "Write the Keeper's launch announcement (EN + ID).",
      state: "Sealed",
      createdAt: created,
      evidenceUrl: "",
      evidenceHash: "",
      evidenceSubmittedAt: null,
      late: false,
      verdict: null,
      settlementProposer: "",
      settlementSellerShareBps: null,
    },
  ];
}

export function loadDeals(): Deal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Deal[];
  } catch {
    // corrupted storage -> reseed
  }
  const seeded = seedDeals();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

export function saveDeals(deals: Deal[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deals));
}

export function resetDemo(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
