# CLAUDE.md — AI Assistant Guide for Sosco-elevate-

This file provides guidance for AI assistants working in this repository.

## Repository Overview

**Sosco-elevate-** is a newly initialized repository. This document will serve as the
living reference for project structure, conventions, and workflows as the codebase grows.

## Project Structure

```
Sosco-elevate-/
├── CLAUDE.md                    # AI assistant guidance (this file)
└── sosco-elevate/
    ├── index.html               # Login page (static HTML/CSS, Apple-style UI)
    ├── manifest.webmanifest     # Web app manifest (home-screen install)
    └── icons/
        ├── icon.svg             # App icon source (1024×1024, full-bleed)
        ├── apple-touch-icon.png # 180×180, iPhone/iPad home screen
        └── icon-192.png, icon-512.png
```

> **Note:** Update this section as directories and files are added.

## Getting Started

This repository does not yet have a build system, dependencies, or runnable code.
When the project is scaffolded, document the setup steps here:

```bash
# Example (update when applicable):
# git clone <repo-url>
# cd Sosco-elevate-
# <install dependencies command>
# <build command>
# <run command>
```

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

> **To be defined.** As the project takes shape, document:
>
> - High-level architecture (monolith, microservices, serverless, etc.)
> - Key design decisions and trade-offs
> - External service dependencies
> - Database schema or data model overview
> - API patterns (REST, GraphQL, gRPC, etc.)

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
