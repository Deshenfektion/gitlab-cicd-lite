# gitlab-cicd-lite

A miniature CI/CD platform inspired by GitLab CI: it parses a pipeline
definition, turns it into a dependency graph, schedules the jobs, runs them
inside Docker containers, streams their logs, and hands artifacts from one job
to the next.

It is deliberately **not** a GitLab clone. The goal was to understand what sits
underneath the YAML — the graph, the state machine, the scheduler, the runner —
and to build those parts properly rather than to reproduce a feature list.

```
┌──────────┐   POST /api/pipelines    ┌────────────────────────────────────────┐
│  Web UI  │ ───────────────────────► │              @cicd/server              │
│  (React) │ ◄─────────────────────── │  express · sqlite · orchestrator · sse │
└──────────┘   SSE + polling          └───────────────┬────────────────────────┘
                                                      │
                                   ┌──────────────────┴──────────────────┐
                                   ▼                                     ▼
                          ┌────────────────┐                   ┌──────────────────┐
                          │  @cicd/core    │                   │  @cicd/runner    │
                          │  config → DAG  │                   │  docker / shell  │
                          │  state machine │                   │  logs, artifacts │
                          │  scheduler     │                   │  workspaces      │
                          └────────────────┘                   └──────────────────┘
```

## Motivation

Most CI systems look simple from the outside: you write some YAML and jobs run.
The interesting problems are hidden behind that:

- What exactly does `needs` mean when stages also imply an order?
- How do you know a job may start, and how do you notice a pipeline is finished?
- What happens to the twelve jobs downstream of the one that just failed?
- How do you cancel a job that is currently inside `docker wait`?
- How does a file produced in one container appear in the next one?

Each of those is a small, well-defined systems problem, and each one is
implemented here rather than delegated to a library.

## Features

- **Configuration** — a small YAML dialect with `stages`, `jobs`, `needs`,
  `image`, `script`, `artifacts`, `retry`, `timeout` and `allow_failure`,
  validated with a schema that rejects unknown keys and reports every problem at
  once with a path.
- **Dependency graph** — explicit `needs` edges and implicit stage edges are
  resolved into one DAG, checked for cycles, unknown references and `needs` that
  point forwards.
- **Scheduler** — a pure, synchronous state machine that answers "which jobs may
  start now?" and records outcomes. Independent jobs run concurrently up to a
  configurable limit.
- **Retries** — per-job retry budgets restricted by failure kind
  (`script_failure`, `runner_failure`, `timeout`) with exponential backoff.
- **Failure propagation** — the downstream closure of a failed job is marked
  `skipped`; `allow_failure` jobs are tolerated once their retries are spent.
- **Cancellation** — cancelling aborts running containers and cancels queued
  jobs; a server restart marks interrupted runs as cancelled instead of leaving
  them stuck.
- **Docker runner** — pulls images, creates containers, demultiplexes the Docker
  stream into stdout/stderr, collects exit codes and always cleans up. A shell
  executor exists for development and tests.
- **Artifacts** — declared paths are archived as `tar.gz`, restored into the
  workspaces of dependent jobs, downloadable over HTTP, and swept when they
  expire.
- **Live output** — logs are persisted per attempt and streamed over
  server-sent events.
- **Web UI** — pipeline list, dependency graph, per-job detail, log viewer,
  artifacts and retry buttons.
- **CLI** — run, validate or inspect a pipeline without a server.

## Architecture

The repository is an npm workspace with five packages:

| Package        | Responsibility                                                                     |
| -------------- | ---------------------------------------------------------------------------------- |
| `@cicd/core`   | Config parsing, graph building, state machine, scheduler, run loop. No I/O at all. |
| `@cicd/runner` | Executors (Docker, shell), workspaces, artifact store, log handling.               |
| `@cicd/server` | REST API, SQLite persistence, orchestration, event bus, static hosting of the UI.  |
| `@cicd/web`    | React interface.                                                                   |
| `@cicd/cli`    | Command line entry point.                                                          |

The dependency direction is strictly one-way: `core` knows nothing about
Docker, HTTP or SQLite. It defines the ports (`JobExecutor`, `RunListener`) and
everything else plugs into them. That is what makes the engine testable without
a container runtime and the runner testable without a Docker daemon.

See [docs/architecture.md](docs/architecture.md) for the details,
[docs/configuration.md](docs/configuration.md) for the configuration reference
and [docs/api.md](docs/api.md) for the HTTP API.

## Design decisions

**The graph is the execution model, stages are sugar.** Stages are expanded into
edges during normalization and then forgotten. A job with no `needs` depends on
every job in the _closest preceding populated_ stage, which is the transitive
reduction of "all earlier stages" — same semantics, far fewer edges.

**Scheduling is separated from execution.** `PipelineScheduler` is synchronous
and side-effect free: it holds job statuses and answers `ready()`, `start()` and
`complete()`. `PipelineRun` owns the async part — concurrency, timeouts, abort
signals, retry backoff. Almost all engine behaviour is therefore testable
without touching a clock or a process.

**Retries live in the engine, not the runner.** The executor reports _what_
happened (`script_failure`, `runner_failure`, `timeout`); the scheduler decides
whether that is worth another attempt. A runner that had to know about retry
policy would be much harder to replace.

**Timeouts are enforced by the run loop, not trusted to the executor.** The loop
races the executor against a timer and aborts the shared `AbortSignal`. An
executor that ignores the signal still cannot make a job outlive its timeout; it
only fails to clean up promptly.

**The state machine rejects illegal transitions loudly.** Every status change
goes through `assertTransition`. Bugs like "job finished twice" surface as
errors instead of quietly corrupting a pipeline's status.

**Artifacts move through the workspace, not through the engine.** The run loop
passes each job the list of dependencies that publish artifacts; the executor
restores them into the workspace before the script runs and archives the
declared paths afterwards. The engine never touches a file.

**SQLite with WAL.** A single-node CI system does not need Postgres. Foreign
keys are on, migrations are ordered and transactional, and cascading deletes
keep jobs, logs and artifacts consistent with their pipeline.

## Running locally

Requirements: Node.js 22 or newer, and Docker if you want the Docker executor.

```bash
npm install
npm run build
```

Start the API and the UI:

```bash
npm run dev          # server on :3000
npm run dev:web      # vite dev server on :5173, proxies /api
```

After `npm run build` the server also serves the built UI, so `:3000` alone is
enough.

Useful environment variables:

| Variable        | Default           | Meaning                                       |
| --------------- | ----------------- | --------------------------------------------- |
| `PORT`          | `3000`            | HTTP port.                                    |
| `DATA_DIR`      | `./data`          | Root for the database, workspaces, artifacts. |
| `EXECUTOR`      | `docker`          | `docker` or `shell`.                          |
| `CONCURRENCY`   | `4`               | Maximum jobs running at once per pipeline.    |
| `DOCKER_SOCKET` | dockerode default | Path to the Docker socket.                    |
| `LOG_LEVEL`     | `info`            | pino log level.                               |

### With Docker

```bash
docker compose up --build
```

The compose file mounts the Docker socket and binds the data directory at the
_same absolute path_ inside and outside the container. That matters: job
containers are started by the host daemon, so the workspace path the server asks
it to bind-mount must exist on the host.

### From the command line

```bash
node packages/cli/dist/main.js validate examples/node-app.ci.yml
node packages/cli/dist/main.js graph examples/fan-out.ci.yml
node packages/cli/dist/main.js run examples/fan-out.ci.yml --executor shell --verbose
```

```
› prepare
✓ prepare
› check-a
› check-b
✓ check-a
✓ check-b
› report
✓ report

✓ pipeline success in 0s
```

## Testing

```bash
npm test           # all packages
npm run lint
npm run typecheck
```

The suite covers duration and schema parsing, graph construction and cycle
detection, topological layering, every legal and illegal state transition,
scheduling and concurrency, retry policy and backoff, `allow_failure`,
cancellation, timeouts, the Docker executor lifecycle (against an in-memory
Docker client), real `tar.gz` artifact round trips and handover between jobs,
repository persistence, startup recovery, and the REST API end to end.

Two seams make this practical: `JobExecutor`, which lets the engine be tested
with a scripted executor, and `DockerClient`, which lets the Docker executor be
tested without a daemon. The artifact tests deliberately use the real filesystem
and the real `tar` implementation, because that is exactly the part where a fake
would prove nothing.

## Limitations

This is a learning project, and it stops well short of a production CI system:

- **Single node.** The orchestrator holds running pipelines in memory. Two
  server processes against the same database would both try to schedule work.
- **No authentication or authorization.** Every endpoint is open.
- **No isolation between pipelines.** Job containers get the default bridge
  network and a bind-mounted workspace; a malicious pipeline is not contained.
  Mounting the Docker socket also means the server is effectively root on the
  host.
- **No log rotation.** Logs are rows in SQLite; a very chatty job will grow the
  database.
- **Artifacts are local files.** No object storage, no deduplication, and the
  whole archive is buffered by the client on download.
- **No caching, no `include`, no templates, no matrix builds, no manual gates,
  no scheduled pipelines.**
- **The UI polls.** The SSE endpoints exist and work, but the React pages use
  polling because it was simpler to keep correct across retries.

## Future improvements

- Move scheduling state into the database with optimistic locking so several
  server instances can share the work.
- Register runners over HTTP and let them pull jobs, rather than executing them
  in the API process.
- Replace UI polling with the existing event stream.
- Add a cache key mechanism, separate from artifacts, for dependency reuse.
- Pluggable artifact storage with an S3 backend.
- Structured job output (test reports, coverage) as first-class artifacts.

## License

MIT
