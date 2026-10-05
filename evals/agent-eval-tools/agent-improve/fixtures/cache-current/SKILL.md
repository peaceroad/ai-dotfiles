---
name: fictional-cache-policy
description: Classify fictional cache records under the supplied reuse policy without fetching data or changing storage.
---

# Fictional cache policy

Classify each record using `references/policy.md`. Return one JSON object mapping each input record ID to `reuse`, `revalidate`, `fetch`, or `blocked`, without commentary. Do not perform any of those actions.

Inputs may specify common defaults and per-record overrides. Merge them before classification; an explicit null overrides a default. Omitted booleans are false. Non-boolean values do not count as true. A missing or invalid numeric value is unknown; do not coerce strings into numbers.

Apply the policy in order. Authorization, tenant, integrity, and forced-refresh checks take precedence over cache age. Expired records always require revalidation under this version of the policy, including when offline.
