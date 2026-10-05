---
name: synthetic-retention
description: Classify a fictional record under the supplied retention policy.
---

# Synthetic Retention

Return one JSON object with an `action` field: `keep`, `delete`, or `review`.

A legal hold always means `keep`. Without a legal hold, a record is eligible for deletion at an age of 7 days or more. Eligible records require deletion approval: choose `delete` when approval exists and `review` otherwise. Younger records remain `keep`.

Classify the record only; do not delete anything or use tools.
