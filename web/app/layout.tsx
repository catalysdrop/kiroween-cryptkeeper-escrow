import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryptKeeper Escrow — the haunted AI escrow desk",
  description:
    "An AI agent guards freelance and bounty deals: the buyer locks payment in a smart contract, the seller submits delivery evidence, and the Crypt Keeper verifies it before the money moves.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="row">
            <Link className="brand" href="/">
              🪦 Crypt<span>Keeper</span> Escrow
            </Link>
            <nav className="main">
              <Link href="/">Deals</Link>
              <Link href="/deals/new">Open a deal</Link>
              <Link href="https://github.com/catalysdrop/kiroween-cryptkeeper-escrow" target="_blank" rel="noreferrer">
                GitHub
              </Link>
            </nav>
          </div>
        </header>
        <main className="container">
          <div className="demo-banner">
            <b>Demo mode.</b> This build runs on simulated chain state in
            your browser — no wallet, no real funds. The Keeper&apos;s
            verification runs for real against the live internet via{" "}
            <code>/api/verdict</code>.
          </div>
          {children}
          <footer className="site">
            CryptKeeper Escrow — Kiroween 2026 (Frankenstein). Built
            spec-first with Kiro. The smart contract is written for
            testnet/local use; no mainnet, no real money moves here.
          </footer>
        </main>
      </body>
    </html>
  );
}
