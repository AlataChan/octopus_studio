---
name: Technical Documentation (README/ADR/Spec)
description: Turn technical plans into maintainable documentation: README files, ADRs, API references, and design specs, with emphasis on boundaries, examples, and decision records.
version: 1.0.0
author: Alata Studio
category: communication
tags:
  - docs
  - readme
  - adr
  - spec
icon: 📚
tools:
  - structured-output
---

# Technical Documentation (README/ADR/Spec)

This skill turns a plan that can be explained verbally into technical documentation that others can understand and continue working from.
You provide the background, goals, current state, constraints, and target readers (development, QA, operations, or product), and I will first choose the right document type and template.
For README files, I emphasize quick starts, configuration options, FAQs, and contribution guidance; for ADRs, I record decisions, alternatives, and the reasons behind trade-offs.
For specs, I complete API contracts, data structures, error codes, and compatibility strategies, then add minimal runnable examples and acceptance criteria.
The output is designed to be copied directly into a repository whenever possible, with a list of missing items that require your confirmation.

## Sections You Can Paste Directly

- Background and problem definition
- Solution overview and key decisions
- How to run it and examples
- Risks and rollback strategy
