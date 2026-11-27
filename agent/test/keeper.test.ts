import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { verifyEvidence } from "../src/keeper.js";

const GOOD_BODY = "delivered work v1 — landing page, all sections done";
const GOOD_HASH = createHash("sha256").update(GOOD_BODY).digest("hex");
const OTHER_BODY = "something else entirely";
const OTHER_HASH = createHash("sha256").update(OTHER_BODY).digest("hex");

const DEAL_CREATED = Date.parse("2026-11-27T00:00:00Z");
const DEADLINE = Date.parse("2026-12-04T00:00:00Z");
const ON_TIME = Date.parse("2026-11-28T00:00:00Z");
const FRESH_LM = "Sat, 28 Nov 2026 10:00:00 GMT"; // after deal creation
const STALE_LM = "Wed, 25 Nov 2026 10:00:00 GMT"; // before deal creation

function resp(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

/** Fake fetch routing canned URLs — no live internet in tests. */
const fakeFetch: typeof fetch = async (input: string | URL | Request) => {
  const url = String(input);
  switch (url) {
    case "https://example.com/good":
      return resp(GOOD_BODY, 200, { "last-modified": FRESH_LM });
    case "https://example.com/good-old":
      return resp(GOOD_BODY, 200, { "last-modified": STALE_LM });
    case "https://example.com/good-no-lm":
      return resp(GOOD_BODY, 200);
    case "https://example.com/bad":
      return resp(OTHER_BODY, 200, { "last-modified": FRESH_LM });
    case "https://example.com/down":
      throw new Error("fetch failed");
    case "https://example.com/redirect":
      return resp("", 302, { location: "https://example.com/good" });
    case "https://github.com/acme/landing":
      return resp(GOOD_BODY, 200, { "last-modified": FRESH_LM });
    case "https://api.github.com/repos/acme/landing":
      return resp(JSON.stringify({ private: false, size: 42 }), 200);
    case "https://github.com/acme/ghost":
      return resp(GOOD_BODY, 200, { "last-modified": FRESH_LM });
    case "https://api.github.com/repos/acme/ghost":
      return resp(JSON.stringify({ message: "Not Found" }), 404);
    case "https://github.com/acme/ghost-old":
      return resp(GOOD_BODY, 200, { "last-modified": STALE_LM });
    case "https://api.github.com/repos/acme/ghost-old":
      return resp(JSON.stringify({ message: "Not Found" }), 404);
    default:
      return resp("not found", 404);
  }
};

const base = {
  dealCreatedAt: DEAL_CREATED,
  deadline: DEADLINE,
  submittedAt: ON_TIME,
};

test("perfect evidence releases", async () => {
  const r = await verifyEvidence(
    { ...base, url: "https://example.com/good", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.verdict, "RELEASE");
  assert.equal(r.score, 1);
  assert.equal(r.late, false);
  assert.equal(r.checks.find((c) => c.name === "integrity")?.status, "passed");
});

test("hash mismatch refunds", async () => {
  const r = await verifyEvidence(
    { ...base, url: "https://example.com/bad", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.verdict, "REFUND");
  assert.equal(r.checks.find((c) => c.name === "integrity")?.status, "failed");
});

test("unreachable URL refunds", async () => {
  const r = await verifyEvidence(
    { ...base, url: "https://example.com/down", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.verdict, "REFUND");
  assert.equal(r.checks.find((c) => c.name === "reachability")?.status, "failed");
  assert.equal(r.checks.find((c) => c.name === "integrity")?.status, "failed");
});

test("redirects are followed", async () => {
  const r = await verifyEvidence(
    { ...base, url: "https://example.com/redirect", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.verdict, "RELEASE");
});

test("stale content lowers the score but still releases", async () => {
  // reachability + integrity pass (0.70), freshness fails (0.15),
  // github neutral -> applicable 0.85, score 0.70 / 0.85 = 0.823 -> RELEASE.
  const r = await verifyEvidence(
    { ...base, url: "https://example.com/good-old", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.checks.find((c) => c.name === "freshness")?.status, "failed");
  assert.ok(Math.abs(r.score - 0.7 / 0.85) < 1e-9);
  assert.equal(r.verdict, "RELEASE");
});

test("github 404 lowers the score but still releases", async () => {
  // reachability + integrity + freshness pass (0.85), github fails (0.15)
  // -> score 0.85 -> RELEASE, with the github check visibly failed.
  const r = await verifyEvidence(
    { ...base, url: "https://github.com/acme/ghost", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.checks.find((c) => c.name === "github")?.status, "failed");
  assert.ok(Math.abs(r.score - 0.85) < 1e-9);
  assert.equal(r.verdict, "RELEASE");
});

test("two failed minor checks give DISPUTE", async () => {
  // github 404 (fail) + stale content (fail), reachability + integrity
  // pass -> score 0.70 / 1.0 = 0.70, between the thresholds -> DISPUTE.
  const r = await verifyEvidence(
    { ...base, url: "https://github.com/acme/ghost-old", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.checks.find((c) => c.name === "github")?.status, "failed");
  assert.equal(r.checks.find((c) => c.name === "freshness")?.status, "failed");
  assert.ok(Math.abs(r.score - 0.7) < 1e-9);
  assert.equal(r.verdict, "DISPUTE");
});

test("late evidence is capped at 0.79 and disputes", async () => {
  const r = await verifyEvidence(
    {
      ...base,
      url: "https://example.com/good",
      claimedHash: GOOD_HASH,
      submittedAt: Date.parse("2026-12-05T00:00:00Z"), // past deadline
    },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.late, true);
  assert.equal(r.rawScore, 1);
  assert.equal(r.score, 0.79);
  assert.equal(r.verdict, "DISPUTE");
});

test("github repo that exists passes the github check", async () => {
  const r = await verifyEvidence(
    { ...base, url: "https://github.com/acme/landing", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.checks.find((c) => c.name === "github")?.status, "passed");
  assert.equal(r.verdict, "RELEASE");
});

test("no last-modified header is neutral", async () => {
  const r = await verifyEvidence(
    { ...base, url: "https://example.com/good-no-lm", claimedHash: GOOD_HASH },
    { fetchImpl: fakeFetch },
  );
  assert.equal(r.checks.find((c) => c.name === "freshness")?.status, "neutral");
  assert.equal(r.verdict, "RELEASE");
});

test("invalid claimed hash throws", async () => {
  await assert.rejects(
    verifyEvidence(
      { ...base, url: "https://example.com/good", claimedHash: "not-a-hash" },
      { fetchImpl: fakeFetch },
    ),
    /64-character hex/,
  );
});

test("private/localhost URL throws (SSRF guard)", async () => {
  await assert.rejects(
    verifyEvidence(
      { ...base, url: "http://127.0.0.1:8080/secret", claimedHash: GOOD_HASH },
      { fetchImpl: fakeFetch },
    ),
    /public http/,
  );
  await assert.rejects(
    verifyEvidence(
      { ...base, url: "file:///etc/passwd", claimedHash: GOOD_HASH },
      { fetchImpl: fakeFetch },
    ),
    /public http/,
  );
});

test("unused hash constant sanity: OTHER_HASH differs from GOOD_HASH", () => {
  assert.notEqual(OTHER_HASH, GOOD_HASH);
});
