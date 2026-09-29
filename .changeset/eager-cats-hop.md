---
type: Fixed
pr: 0
---
**`milestone: null` in STATE.md no longer produces a false "asserted ... matches no ROADMAP heading" warning** — the literal string `null` is now normalized to a real absence, mirroring the convention already used by the statusline hook. When the ROADMAP has real milestone sections, progress counters are withheld (left at their stored values) instead of being silently recomputed from a whole-document or on-disk scan that could conflate a foreign milestone's phases; a flat (unsectioned) ROADMAP is unaffected.
