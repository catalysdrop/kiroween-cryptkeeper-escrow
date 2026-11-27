import { ethers } from "ethers";

/** wei (decimal string) -> "0.5 BNB" */
export function formatBnb(amountWei: string): string {
  try {
    return `${ethers.formatEther(amountWei)} BNB`;
  } catch {
    return `${amountWei} wei`;
  }
}

export function shortAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isValidAddress(addr: string): boolean {
  try {
    return ethers.isAddress(addr);
  } catch {
    return false;
  }
}
