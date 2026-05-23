---
type: Fixed
pr: 167
---
gsd-tools.cjs now accepts the query meta-command prefix — node gsd-tools.cjs query init.progress works the same as gsd-sdk query init.progress. Previously, callers invoking gsd-tools.cjs directly (the workflow preflight fallback path) hit Unknown command: query because the CJS CLI did not strip the query prefix that the SDK binary handles internally.
