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
└──────────┘   server-sent events     └───────────────┬────────────────────────┘
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
repository persistence, startup recovery, and the REST API end to end. On the
front end only the pure pieces are covered — duration and size formatting and
the SVG graph layout — because rendering tests would have needed a DOM
environment for very little extra confidence.

Two seams make this practical: `JobExecutor`, which lets the engine be tested
with a scripted executor, and `DockerClient`, which lets the Docker executor be
tested without a daemon. The artifact tests deliberately use the real filesystem
and the real `tar` implementation, because that is exactly the part where a fake
would prove nothing.

## License

MIT
