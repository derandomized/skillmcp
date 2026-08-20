---
name: commit-haiku
description: Summarize a code change, diff, or pull request as a three-line haiku (5-7-5 syllables) followed by a one-sentence plain summary. Use when the user asks for a commit haiku, a poetic diff summary, or says "haiku this change".
license: MIT
metadata:
  author: skillmcp
  version: "0.1.0"
---

# Commit Haiku

Turn a diff or description of a change into a haiku.

## Steps

1. Identify the single most important effect of the change (what a user or
   maintainer would care about), not the mechanics.
2. Write a haiku: three lines, 5 / 7 / 5 syllables. Count carefully.
3. Below the haiku, add one plain sentence (max 20 words) stating the change
   literally, so the haiku is never the only record.

## Rules

- If you were given a diff, read it before writing. Do not invent behavior.
- If the change is trivial (typo, whitespace), say so in the plain sentence.
- Never include file paths or identifiers inside the haiku; save them for the
  plain sentence.

## Example

Input: a diff that adds a null check before dereferencing `user.email`.

Output:

```
A quiet guard stands
where once the null wind blew through —
inbox safe tonight

Adds a null check on user.email before sending notifications.
```
