# Local model validation

Run on 11 November 2026 with the real downloaded Qwen3:4b model through Ollama on Apple M1. No paid AI API or model stub was used for these eight cases.

| Case | Expected classification | Result | Seconds |
|---|---|---|---|
| draft readiness | clarify | PASS | 61 |
| explicit extra | extra | PASS | 14 |
| included delivery | included | PASS | 45 |
| ambiguity | clarify | PASS | 41 |
| unknown revision usage | clarify | PASS | 28 |
| document instruction attack | clarify | PASS | 33 |
| already accepted extra | included | PASS | 30 |
| contradictory scope | clarify | PASS | 45 |

Reproduce with `npm run evaluate:ai` after starting Ollama and downloading `qwen3:4b`. Results depend on hardware and model version; these small synthetic checks do not establish general accuracy.

The first evaluation exposed a conflicting-clause error. A conservative guard now downgrades detected agreement conflicts, unknown revision usage and instruction-like requests to clarification after the model responds. Model inference still generates the findings and reasons; guardrails cannot create a chargeable classification. Human review and client approval remain mandatory.

`npm test` passed 41 fixture/unit/HTTP tests; `npm run build` passed. Fixture tests cover local-only routing, fabricated-evidence rejection, failure without cloud fallback, source fingerprints, conflict downgrade, roles, budgets and payment recovery. They do not call an AI service.
