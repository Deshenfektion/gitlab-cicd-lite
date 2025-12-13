# HTTP API

All endpoints are served under `/api`. Request and response bodies are JSON
unless noted otherwise. Timestamps are Unix milliseconds.

## Errors

| Status | Meaning                                               |
| ------ | ----------------------------------------------------- |
| `400`  | The request body was missing or malformed.            |
| `404`  | The pipeline, job, artifact or runner does not exist. |
| `409`  | The action conflicts with the current state.          |
| `422`  | The pipeline configuration is invalid.                |

A `422` carries every problem that validation found:

```json
{
  "error": "Invalid pipeline configuration (2 issue(s))",
  "issues": [
    { "path": "jobs.build.needs[0]", "message": "unknown job \"prepare\"" },
    { "path": "jobs.test.timeout", "message": "must be a duration like \"10m\"" }
  ]
}
```

## Pipelines

### `POST /api/pipelines`

Creates a pipeline from a configuration. It is not started.

```json
{ "name": "nightly", "config": "jobs:\n  build:\n    script: make\n" }
```

A raw YAML body is also accepted with `Content-Type: text/yaml`, in which case
the name comes from the `?name=` query parameter.

Returns `201` with the created pipeline.

### `GET /api/pipelines?limit=50`

Lists pipelines, newest first.

### `GET /api/pipelines/:id`

Returns the pipeline, its jobs, the resolved dependency edges and the execution
layers:

```json
{
  "pipeline": { "id": "…", "status": "running", "durationMs": null },
  "jobs": [{ "id": "…", "name": "build", "status": "success", "attempt": 1 }],
  "edges": [{ "from": "build", "to": "test" }],
  "layers": [["build"], ["test"]]
}
```

### `POST /api/pipelines/:id/start`

Starts a pending pipeline. Returns `202`, or `409` if it is already running or
finished.

### `POST /api/pipelines/:id/cancel`

Cancels a running pipeline. Running containers are stopped and queued jobs are
marked `canceled`. Returns `409` if the pipeline is not running.

### `POST /api/pipelines/:id/retry`

Resets every `failed`, `canceled` and `skipped` job to `pending` and runs the
pipeline again from the persisted state. Successful jobs keep their result and
are not executed a second time. Returns `409` if there is nothing to retry.

### `GET /api/pipelines/:id/artifacts`

Every artifact produced by the pipeline.

### `GET /api/pipelines/:id/events`

A server-sent event stream. The first event is `pipeline.snapshot`; afterwards
`job.status`, `job.log` and `pipeline.status` events arrive as they happen.

## Jobs

### `GET /api/jobs/:id`

A single job, including `exitCode`, `failureReason` and `failureMessage`.

### `GET /api/jobs/:id/logs?after=0`

Returns log lines with `seq` greater than `after`, plus a `nextCursor` for
incremental polling.

```json
{
  "jobId": "…",
  "status": "running",
  "lines": [{ "seq": 12, "attempt": 1, "stream": "stdout", "message": "$ make" }],
  "nextCursor": 12
}
```

### `GET /api/jobs/:id/logs/stream?after=0`

The same lines as a server-sent event stream: existing output is replayed first,
then new lines arrive live.

### `POST /api/jobs/:id/retry`

Resets this job and its downstream closure, then reruns the pipeline from the
persisted state. Returns `409` if the pipeline is still running.

### `GET /api/jobs/:id/artifacts`

The artifacts this job published.

## Artifacts

### `GET /api/artifacts/:id`

Artifact metadata.

### `GET /api/artifacts/:id/download`

Streams the `tar.gz` archive as `application/gzip`.

## Runners

### `GET /api/runners`

The registered runners, their executor kind, configured concurrency and how many
pipelines they are currently running.

### `GET /api/runners/:id`

A single runner.

## Health

### `GET /api/health`

`{ "status": "ok", "uptime": 42 }`
