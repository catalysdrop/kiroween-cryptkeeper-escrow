import { NextResponse } from "next/server";
import { verifyEvidence } from "@cryptkeeper/agent";

/**
 * POST /api/verdict — run the Keeper agent server-side.
 * Body: { url, claimedHash, dealCreatedAt, deadline, submittedAt? }
 * Returns the full VerdictReport. Same code path the on-chain flow uses.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (
    typeof b.url !== "string" ||
    typeof b.claimedHash !== "string" ||
    typeof b.dealCreatedAt !== "number" ||
    typeof b.deadline !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing fields: url, claimedHash, dealCreatedAt, deadline." },
      { status: 400 },
    );
  }
  try {
    const report = await verifyEvidence({
      url: b.url,
      claimedHash: b.claimedHash,
      dealCreatedAt: b.dealCreatedAt,
      deadline: b.deadline,
      submittedAt: typeof b.submittedAt === "number" ? b.submittedAt : undefined,
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Keeper failed." },
      { status: 422 },
    );
  }
}
