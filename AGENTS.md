# LuxFatum裁定對決 Agent Instructions

This repository is managed as a short MVP project. Every Codex session must follow this file exactly.

## First Action

Always read `progress.txt` first.

Find the first item marked `[TODO]`.

Process exactly one item per session:

- If it is a `STEP`, implement only that step.
- If it is a `REVIEW_GATE`, review only.
- Do not skip review gates if a review gate is explicitly listed in `progress.txt`.
- Do not mark future steps as `[DONE]`.
- Do not expand scope.

At the end of the session, update `progress.txt`:

- Change the completed item from `[TODO]` to `[DONE]`.
- Fill in `Completion Notes`.
- Fill in `Changed Files`.
- Fill in `Test Result`.

If blocked, mark the item `[BLOCKED]` and explain why in `progress.txt`.

## Project Contract

Project name: LuxFatum裁定對決

Project type: MVP web game / demo

Tech stack:

- Vite
- React
- TypeScript
- Node.js server
- npm
- Static assets under `public/`

Goal: Build and maintain a playable browser-based MVP/demo for LuxFatum裁定對決 with clear project management, checks, and deployment paths.

## Non-Negotiable Rules

- Do not change the tech stack without documenting the reason in `progress.txt`.
- Do not add unrelated dependencies.
- Do not expand beyond MVP/demo scope unless the active progress step explicitly asks for it.
- Do not delete existing files unless necessary for the active step.
- Do not alter public API routes without documenting the change.
- Do not skip review gates.
- Do not mark future steps as `[DONE]`.
- Preserve user-created or pre-existing changes unless the user explicitly asks to revert them.
- Keep each session focused on the first `[TODO]` item only.
- Keep the roadmap short. Do not recreate a long 16-step process unless the user explicitly asks for it.

## Expected Workflow

1. Read `progress.txt`.
2. Identify the first `[TODO]`.
3. Work only on that item.
4. Run the appropriate checks for the current step.
5. Update only that item's status and notes.
6. Report what changed and what checks were run.
