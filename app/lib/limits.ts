// Guest allowance, per day. Read by the server (to enforce) and the page
// (to tell guests what they get). The household has no limits.
// perVisitor: each guest. total: all guests together, the cap on spending.
export const GUEST_LIMITS = {
  scan: { perVisitor: 5, total: 30, noun: "scans" },
  search: { perVisitor: 3, total: 20, noun: "recipe searches" },
} as const;
