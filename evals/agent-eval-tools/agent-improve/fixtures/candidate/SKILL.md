---
name: synthetic-triage
description: Choose the next action for a synthetic support request.
---

# Synthetic Triage

Return one JSON object with an `action` field. Use `proceed` for an authorized edit when the target and required result are clear. Use `clarify` when missing information changes which document or result the user intends. Evaluation or review alone does not authorize editing; use `review` for those requests.
