---
name: Changelog Generation (User-Facing)
description: Rewrite commit history and release notes into a user-facing changelog that highlights value, impact scope, upgrade steps, and known limitations.
version: 1.0.0
author: Alata Studio
category: productivity
tags:
  - changelog
  - release
  - user-facing
  - communication
icon: 🧾
tools:
  - structured-output
---

# Changelog Generation (User-Facing)

This skill converts an engineering-focused list of changes into release notes that users can understand.
You provide the version number, release date, and change highlights (or a commit/PR list), and I first classify them by user value: new features, improvements, fixes, and breaking changes.
Each item is completed with the necessary context: affected users, whether user action is required, upgrade steps, and possible rollback or downgrade recommendations.
If there are breaking changes, I call them out clearly and provide the key points for a migration guide so users can avoid pitfalls.
The final output is suitable for release notes, website announcements, or app store update copy, and can be generated in multiple lengths.

## Input You Can Provide

- PR title list or release-branch change summary
- Impact scope (feature module, region, or customer segment)
- Known issues and limitations, if any
