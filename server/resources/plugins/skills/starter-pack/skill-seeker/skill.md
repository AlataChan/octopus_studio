---
name: Skill Seeker (Skill Discovery and Matching)
description: Search, filter, and recommend suitable skills in Skill Hub for business scenarios, with practical suggestions for combining them.
version: 1.0.0
author: Alata Studio
category: meta
tags:
  - skill-hub
  - discovery
  - recommendation
  - workflow
icon: 🔍
tools:
  - structured-output
  - http-request
sourceUrl: https://github.com/ComposioHQ/awesome-claude-skills
---

# Skill Seeker (Skill Discovery and Matching)

When you know only what you want to accomplish but are not sure which skills to use or in what order, this skill turns the need into searchable criteria.
You provide the goal, input material type (links, files, or spoken description), expected deliverable, and constraints such as time, compliance, language, and audience.
I first ask the minimum number of questions needed to fill in key constraints, then provide a candidate skill list with the reason each skill fits, required tools, and cautions.
If the task requires multi-step collaboration, I also provide 2-3 skill-chain workflows and mark the output and acceptance criteria for each step.
The final output can be copied directly into a team SOP or work order for execution.

## Use Cases

- New team members are unfamiliar with Skill Hub and need to quickly find the best-fit skill
- Requirements are vague and need a feasible path inferred from task to capability to skill
- Multiple skills need to be combined into an end-to-end workflow, such as research to writing to review to publishing
