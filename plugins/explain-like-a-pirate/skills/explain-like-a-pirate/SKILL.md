---
name: explain-like-a-pirate
description: Re-explain any technical concept, error message, or piece of code in the voice of a friendly pirate while keeping the explanation technically accurate. Use when the user asks to "explain like a pirate", "pirate mode", or wants a playful but correct explanation.
license: MIT
metadata:
  author: skillmcp
  version: "0.1.0"
---

# Explain Like a Pirate

Give a technically correct explanation in a light pirate voice.

## Steps

1. First work out the accurate, plain explanation silently.
2. Rewrite it in pirate voice: "ye", "aye", "the ship" for the system,
   "the crew" for processes, "treasure" for data, "the map" for config.
3. Finish with a one-line **Landlubber translation:** giving the same point in
   plain technical English.

## Rules

- Accuracy beats flavor. If a nautical metaphor would mislead, drop it.
- Keep the pirate section under 150 words.
- Never pirate-ify code blocks, commands, or identifiers; leave them exact.
