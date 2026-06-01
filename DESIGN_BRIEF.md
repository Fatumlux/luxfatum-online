# LuxFatum裁定對決 Design Brief

## Project Summary

LuxFatum裁定對決 is an MVP/demo browser game. The current repository uses Vite, React, TypeScript, npm, and a Node.js server for local and deployable web builds.

## Product Goal

Create a playable and maintainable web game demo that can be developed step by step without uncontrolled scope growth.

## Target Experience

- A clear browser-first game interface.
- Fast local iteration with `npm run dev`.
- A buildable static web output through Vite.
- Server support through `server.js` for deployment and downloads.
- Documentation clear enough for a non-technical owner to continue by asking Codex to process the next task.

## MVP Boundaries

This project is treated as an MVP/demo unless otherwise specified.

The MVP should prioritize:

- A stable project structure.
- A reliable run/build/check flow.
- Core game loop clarity.
- Basic UI readability.
- Minimal deployment readiness.

The MVP should avoid:

- Unrelated frameworks.
- Large new dependencies.
- Major feature expansion outside the active progress step.
- Unplanned changes to public API routes.

## Technical Baseline

- Runtime: Node.js
- Package manager: npm
- Frontend: Vite + React + TypeScript
- Entry point: `index.html` -> `src/main.tsx`
- Web build output: `web-build/`
- Server entry: `server.js`

## Design Principles

- Keep the game screen usable before making it decorative.
- Prefer readable controls, stable layout, and direct player feedback.
- Keep visual changes tied to game meaning.
- Keep documentation and project state synchronized with `progress.txt`.

## Current Session Scope

This bootstrap session only establishes the project management scaffold for `STEP_01_PROJECT_CONTRACT_AND_SCAFFOLD`.

It does not implement new gameplay, new UI flows, persistence, tests, packaging, or deployment changes.
