import type { ProofStatus } from "../model/proof";

export function statusTone(status: ProofStatus) {
  return {
    missing: "missing",
    draft: "draft",
    reviewed: "reviewed",
    stale: "stale",
    reverted: "reverted",
  }[status];
}
