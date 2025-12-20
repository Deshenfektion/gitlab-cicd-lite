# Architecture

## Packages

| Package        | Responsibility                                                                      |
| -------------- | ----------------------------------------------------------------------------------- |
| `@cicd/core`   | Configuration, dependency graph, state machine, scheduler, run loop. No I/O at all. |
| `@cicd/runner` | Executors, workspaces, artifact storage, Docker plumbing.                           |
| `@cicd/server` | REST API, persistence, orchestration, event bus.                                    |
| `@cicd/web`    | React interface.                                                                    |
| `@cicd/cli`    | Command line entry point.                                                           |

Dependencies point in one direction only:

```
web ──► server ──► runner ──► core
 cli ──────────────┘  │          ▲
                      └──────────┘
```

`core` defines the interfaces that the outer layers implement. Nothing in `core`
imports `node:fs`, `dockerode`, `express` or `better-sqlite3`.

## From YAML to a graph

`loadPipeline(source)` runs four steps and either returns a validated pipeline
or throws a `ConfigError` describing every problem it found:

1. **Parse** — the YAML document is turned into a plain object.
2. **Validate the shape** — a Zod schema checks types and rejects unknown keys.
3. **Normalize** — defaults are merged in, scalars are widened to lists and
   durations are converted to milliseconds. The result is a
   `PipelineDefinition` in which every job is fully specified.
4. **Build and validate the graph** — dependency edges are resolved, and the
   graph is checked for cycles and for `needs` edges that point forwards.

Keeping these steps separate means the messy part (user input) is confined to
the first two, and everything after normalization works on a strongly typed,
fully populated structure.

## Dependency resolution

There are two ways a job can gain a dependency:

- **Explicit** — the job declares `needs: [other]`.
- **Implicit** — the job declares no `needs`, so it inherits the stage order and
  depends on every job in the closest preceding stage that actually contains
  jobs.

Linking only to the _closest_ populated stage rather than to every earlier stage
keeps the edge count low without changing the semantics: the dependency is
transitive anyway. Empty stages are skipped rather than blocking the pipeline.

Both kinds of edge end up in the same structure, so from the scheduler's point
of view stages are only a convenience for writing configuration. The real
execution model is the graph.

## Layers

`topologicalLayers` assigns each job the depth of its deepest dependency plus
one. Jobs in the same layer have no path between them and may therefore run
concurrently. The layering is used by the UI to draw the graph; the scheduler
does not need it, because it can start any job whose dependencies are complete
without waiting for a whole layer to finish.

## The state machine

Job statuses and the only transitions the engine permits:

```
          ┌──────────────► skipped ──┐
          │                          │
       pending ──► running ──► success
          │  ▲        │
          │  │        ├──────► failed ──┐
          ▼  │        │                 │
      canceled ◄──────┘                 │
          │                             │
          └───────── retry ─────────────┘  (failed / canceled / skipped → pending)
```

Every change goes through `assertTransition`, so an impossible sequence throws
instead of silently corrupting state. `skipped → pending` exists because
retrying an upstream job has to make its skipped descendants runnable again.

The pipeline status is derived, never stored independently: all pending is
`pending`, anything unfinished is `running`, otherwise `failed` beats `canceled`
beats `success`. A `failed` job with `allow_failure: true` is counted as a
success for this purpose and for unblocking its dependents.

## Scheduling versus execution

`PipelineScheduler` is deliberately synchronous and free of side effects:

- `ready()` — pending jobs whose dependencies have all effectively succeeded.
- `start(name)` — marks a job running and returns its attempt number.
- `complete(name, outcome)` — records the result, consults the retry policy, and
  either requeues the job or marks the downstream closure `skipped`.
- `cancel()` — moves every unfinished job to `canceled` and reports which ones
  were actually running.

`PipelineRun` wraps it with everything asynchronous: a concurrency limit, abort
signals, per-attempt timeouts, retry backoff, and a listener that reports
lifecycle events outward. Because the scheduler is pure, nearly every rule about
ordering, skipping and retrying can be tested without timers or processes.

The run loop is event driven rather than poll driven. It launches everything
that is ready, then parks on a promise that is resolved whenever a job finishes
or a retry delay expires. A `signaled` flag guards against the wake-up that
arrives between launching and parking.

## Executors

```ts
interface JobExecutor {
  readonly id: string;
  run(context: JobContext): Promise<JobOutcome>;
}
```

`JobContext` carries the job definition, the attempt number, the dependencies
that publish artifacts, an `AbortSignal`, and callbacks for log lines and
collected artifacts. Two implementations exist:

- **`DockerExecutor`** — creates a container from the job's image with the
  workspace bind-mounted at `/workspace`, attaches to the multiplexed output
  stream, waits for the exit code and always removes the container. It talks to
  a narrow `DockerClient` interface rather than to `dockerode` directly, which
  is what makes it testable without a daemon.
- **`ShellExecutor`** — runs the script through `/bin/sh` in a detached process
  group so that aborting kills the whole tree, not just the shell.

Both build the same script: `set -e`, then each command echoed and executed, so
the log shows what ran.

## Artifacts

The artifact path is deliberately boring, because that is where correctness
matters more than cleverness:

1. Before a job starts, its workspace is recreated from scratch.
2. For each dependency that declares `artifacts`, the stored `tar.gz` is
   extracted into that workspace.
3. The script runs.
4. On success, the declared paths that actually exist are archived to
   `<artifactRoot>/<pipelineId>/<jobName>.tar.gz`, and the executor reports the
   archive through `onArtifact`.

The engine never reads or writes a file; it only forwards the metadata to the
listener, which stores a row. A sweeper deletes archives and rows once
`expires_at` has passed.

## Persistence

SQLite through `better-sqlite3`, opened with WAL, `foreign_keys = ON` and a busy
timeout. Migrations are an ordered list of SQL strings applied inside a
transaction and recorded in `schema_migrations`.

| Table              | Purpose                                                        |
| ------------------ | -------------------------------------------------------------- |
| `pipelines`        | One row per run, including the original configuration text.    |
| `jobs`             | Status, attempt, timing, exit code and failure detail.         |
| `job_dependencies` | Resolved edges, so the graph can be read back without parsing. |
| `job_logs`         | Append-only output, keyed by job and attempt.                  |
| `artifacts`        | Archive metadata and expiry.                                   |
| `runners`          | Registered executors and their concurrency.                    |

The configuration text is kept on the pipeline row so that a retry replays
exactly the definition the run started with, even if the source file changed.

Everything cascades from `pipelines`, so deleting a pipeline cleans up its jobs,
edges, logs and artifact rows in one statement.

## Delivering updates to the browser

The server publishes every job and pipeline transition, plus every log line, to
an in-process `EventBus` keyed by pipeline id. `GET /api/pipelines/:id/events`
subscribes an SSE connection to that topic and sends a snapshot first, so a
client that connects mid-run does not have to reconcile a partial picture.

The UI opens one stream per pipeline it is viewing. Log lines are appended
directly (deduplicated by sequence number) and any status event triggers a
refetch of the pipeline, which keeps the rendered state authoritative rather
than reconstructed from events. A slow poll remains as a safety net because the
stream has no resume cursor: a dropped connection loses the events it missed.

## Orchestration

`Orchestrator` is the only place where the engine, the database and the runner
meet. It loads the stored configuration, builds a `PipelineRun`, and translates
listener callbacks into repository writes and event-bus publications. It also
holds the set of active runs so that a cancellation can reach the right one.

A retry does not create a new pipeline: `planJobRetry` and `planPipelineRetry`
reset the affected jobs to `pending`, then hand the current job statuses to a
new `PipelineRun` as its initial state. The scheduler resumes from there, so
jobs that already succeeded are never executed twice.

Because the active-run map lives in memory, the server marks any pipeline still
`running` at startup as `canceled` — it cannot have survived the restart.

A crash also leaves the job's container behind, still running. Every container
is created with a `cicd.pipeline` label, so on startup the server lists
containers carrying that label and removes them. The shell executor has no
equivalent handle on its processes, so an ungraceful shutdown can orphan them;
that is one more reason the Docker executor is the default.
