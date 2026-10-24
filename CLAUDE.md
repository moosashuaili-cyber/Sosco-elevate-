# CLAUDE.md — AI Assistant Guide for Sosco-elevate-

This file provides guidance for AI assistants working in this repository.

## Repository Overview

**SOSCO ELEVATE** is an employee evaluation app for SOSCO (Middle East Brigade, MEB):
performance reviews with self-assessment, goals/KPIs, timed exams, and dashboards.
Plain HTML/CSS/JS with no build step, styled after iOS (system colors, light/dark).
Data is in Firebase (Auth + Firestore) when configured, otherwise a localStorage demo.

## Project Structure

```
Sosco-elevate-/
├── CLAUDE.md                    # AI assistant guidance (this file)
├── SETUP.md                     # How to connect Firebase and create the first admin
├── firebase.json                # Hosting (sosco-elevate/) + Firestore rules
├── firestore.rules              # Role-based access: admin / manager / employee
└── sosco-elevate/               # The web app (deployed as-is)
    ├── index.html               # App shell + all CSS (tokens at the top)
    ├── manifest.webmanifest     # Home-screen install
    ├── icons/                   # App icon (SVG source + PNGs)
    └── js/                      # Classic scripts, loaded in this order:
        ├── firebase-config.js   # null = demo mode; paste Firebase web config to go live
        ├── store.js             # Data layer: cache + Demo/Firebase backends + demo seed
        ├── core.js              # App namespace: helpers, scoring, navigation, render
        ├── home.js              # Sign-in, setup, employee home, manager/admin dashboard
        ├── reviews.js           # Review cycles, self-assessment, manager review, sign-off
        ├── goals.js             # Goals/KPIs and progress logging
        ├── exams.js             # Timed exams: builder, taking, results
        ├── people.js            # Team, profiles, admin people & departments
        └── main.js              # Event wiring and start-up
```

## Getting Started

No build step or dependencies. Open `sosco-elevate/index.html` in a browser.

Demo accounts (demo mode only, seeded in `js/store.js`):
`admin`/`admin123`, `manager`/`manager123`, `manager2`/`manager123`,
`employee` … `employee6` / `employee123`, and `newhire`/`welcome123` (must change
password at first sign-in). "Reset demo data" on Home restores the seed.

To go live, follow SETUP.md.

## Development Workflow

### Branching

- The default branch is `main`.
- Feature branches should use descriptive names (e.g., `feature/add-auth`, `fix/login-bug`).
- Claude Code branches follow the pattern `claude/<description>-<sessionId>`.

### Commits

- Write clear, concise commit messages that explain **why** a change was made.
- Keep commits focused — one logical change per commit.

### Pull Requests

- PRs should include a summary and test plan.
- Link related issues when applicable.

## Code Conventions

> **To be defined.** When the project adopts a language, framework, or style guide,
> document the conventions here. Include:
>
> - Language and runtime versions
> - Linting and formatting tools (e.g., ESLint, Prettier, Black, rustfmt)
> - Naming conventions (files, variables, functions, classes)
> - Directory organization patterns
> - Import ordering rules
> - Error handling patterns

## Testing

> **To be defined.** When tests are added, document:
>
> - Test framework and runner
> - How to run the full test suite
> - How to run a single test
> - Test file naming and location conventions
> - Coverage requirements

## Common Commands

> **To be defined.** Add frequently used commands here as the project grows:
>
> | Command | Description |
> |---------|-------------|
> | `TBD`   | Install dependencies |
> | `TBD`   | Run dev server |
> | `TBD`   | Run tests |
> | `TBD`   | Build for production |
> | `TBD`   | Lint / format |

## Architecture Notes

- **Rendering:** each screen is a function in `App.views` returning an HTML string;
  `App.render()` swaps `#app`. Clicks go through `data-action` (handlers in
  `App.actions`); `data-action="go" data-view=… data-id=…` navigates.
- **Data:** screens read `Store.all(c)` / `Store.get(c, id)` and write `Store.put(c, doc)`.
  Writes update the cache immediately; the backend saves in the background.
  Firebase mode subscribes with `onSnapshot` queries matching what `firestore.rules`
  allows for the user's role.
- **Collections:** `users` (role, deptId, managerId), `departments`, `cycles`
  (competencies, dates, goalsWeight), `appraisals` (id `cycleId_uid`, stage
  self → review → ack → done), `goals`, `exams`, `examKeys` (answers, owner-only),
  `attempts` (id `examId_uid`).
- **Scoring:** `App.result()` = weighted competency ratings blended with weighted
  goal ratings by `cycle.goalsWeight`. Exam scores are marked by the exam owner's
  client in `App.reconcile()`, since only owners can read `examKeys`.
- **Accounts:** admins create users with a temporary password and
  `mustChangePassword: true`; `App.render()` forces the `password` view until it is
  cleared. Changing a manager goes through `assignManager()` in `people.js`, which also
  moves open appraisals and goals and refuses reporting loops.
- When changing who can read or write something, update `firestore.rules` and the
  queries in `store.js` together.

## AI Assistant Guidelines

When working in this repository, AI assistants should:

1. **Read before writing** — Always read existing files before proposing changes.
2. **Stay focused** — Only make changes that are directly requested. Avoid scope creep.
3. **Keep it simple** — Prefer the simplest solution that solves the problem.
4. **Respect existing patterns** — Follow conventions already established in the codebase.
5. **Update this file** — When adding significant new tooling, directories, or conventions,
   update CLAUDE.md to reflect the current state of the project.
6. **Don't over-engineer** — No premature abstractions, unnecessary error handling for
   impossible scenarios, or features that weren't requested.
7. **Security first** — Never commit secrets, credentials, or `.env` files.
