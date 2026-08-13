---
name: MCP Integration Guide (Enterprise Tool Onboarding)
description: Help you connect enterprise systems to MCP: clarify use cases, define permission boundaries, design the connection approach, and list the minimum viable interfaces.
version: 1.0.0
author: Alata Studio
category: development
tags:
  - mcp
  - integration
  - security
  - api
icon: 🔌
tools:
  - structured-output
  - http-request
---

# MCP Integration Guide (Enterprise Tool Onboarding)

This skill turns the idea of connecting an enterprise system into an implementation-ready plan.
You provide the system name, current interface style (REST, GraphQL, or SDK), authentication method, and typical business use cases.
I first define the minimum permission boundary: what data is needed, which operations require human confirmation, and which can be automated.
Then I produce an integration checklist covering endpoints, methods, parameters, returned fields, error and retry strategies, plus audit and rate-limit recommendations.
If you are not sure where to start, I prioritize a read-only MVP path with the smallest practical interface set.

## Example Deliverables

- Integration scope definition (readable/writable operations and operations requiring confirmation)
- API list and field mapping table
- Risk points and pre-launch checklist
