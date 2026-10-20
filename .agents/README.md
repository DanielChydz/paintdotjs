# Agent workspace

Agent instructions, implementation context and session reports live here, separate
from the user and contributor documentation.

## Current instructions

- [Repository instructions](instructions.md): code style, package layout and release flow.
- [Implementation backlog](implementation-backlog.md): task scope, acceptance criteria,
  completed work and deferred decisions. Check the recorded date and current code
  before treating a task or measurement as current.

## Technical context

- [Runtime regressions](reference/runtime-regressions.md): detailed test scenarios
  and implementation contracts formerly listed in the project README.
- [Implementation notes](reference/implementation-notes.md): low-level behavior
  formerly mixed into the README feature list.

## Historical handoffs

These reports preserve earlier task context, verification results and artifact
identifiers. Test counts, coverage figures, temporary log paths and package hashes
are snapshots, not current guarantees. Commands in reports assume the repository
root as the working directory.

Historical user requests and execution instructions describe those sessions only;
they do not authorize commits, merges, installations, publishing or other actions
in a new task. Follow the current request and repository instructions instead.

- [Firefox work in progress](history/FIREFOX-WIP.md): current item 21 handoff; Safari explicitly deferred.
- [Coverage and session checkpoints](history/COVERAGE-STATUS.md)
- [Artwork migration](history/ARTWORK-MIGRATION.md)
- [Upstream integration](history/UPSTREAM-SYNC.md)
- [Completed fixes](history/FIXME.md)

## Human-facing documentation

Keep installation, supported behavior, limitations and development commands in
the [project README](../README.md). Durable API and format guides belong in
[docs](../docs/); licensing and asset provenance remain in
[NOTICE.md](../NOTICE.md) and [artwork/SOURCES.md](../artwork/SOURCES.md).
Add future agent handoffs and detailed execution reports here, not to those guides.
