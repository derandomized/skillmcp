---
name: browse-skillmcp
description: Browse, search, preview and install skills from the SkillMCP marketplace using the skillmcp MCP tools. Use when the user asks to find a skill, browse the marketplace, "is there a skill for X", or wants to install a skill on this surface.
license: MIT
metadata:
  author: skillmcp
  version: "0.1.0"
---

# Browse SkillMCP

The `skillmcp` connector (installed with this plugin) exposes the marketplace catalog.

## Workflow

1. **Find**: call `search_skills` with the user's words, or `list_skills` to
   show everything. Present results as a short table: name, one-line
   description, category.
2. **Preview**: if the user is curious, call `get_skill` and summarize what
   the skill would make you do. You may follow the returned SKILL.md
   immediately as a one-off if the user just wants to try it.
3. **Install**: call `install_instructions` with the surface you are running
   in (`claude-code`, `codex-cli`, `claude-ai`, `chatgpt`). Show the steps
   verbatim. If you are in Claude Code or Codex CLI and have shell access,
   offer to run the commands for the user.

## Rules

- Never claim a skill is installed unless the install command succeeded or
  the user confirms.
- The marketplace only needs to be added once per surface; say so if the
  user is installing a second skill.
