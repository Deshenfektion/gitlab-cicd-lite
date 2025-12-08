# Pipeline configuration

A pipeline is described by a single YAML document. The syntax is inspired by
GitLab CI but intentionally much smaller: there are no templates, includes,
rules, matrices or `extends`.

```yaml
stages:
  - build
  - test

default:
  image: node:22-alpine
  timeout: 30m

jobs:
  compile:
    stage: build
    script:
      - npm ci
      - npm run build
    artifacts:
      paths:
        - dist
      expire_in: 7d

  unit:
    stage: test
    needs: [compile]
    script: npm test
    retry:
      max: 2
      when: [runner_failure, timeout]
```

## Top level keys

| Key       | Type                  | Default                 | Description                         |
| --------- | --------------------- | ----------------------- | ----------------------------------- |
| `stages`  | list of strings       | `[build, test, deploy]` | Declares the stage order.           |
| `default` | map                   | `{}`                    | Values inherited by every job.      |
| `jobs`    | map of job name → job | required                | The jobs that make up the pipeline. |

Unknown keys are rejected rather than ignored, so a typo such as `neds:` fails
validation instead of silently changing the meaning of a pipeline.

## Job keys

| Key             | Type                      | Default                          | Description                                      |
| --------------- | ------------------------- | -------------------------------- | ------------------------------------------------ |
| `script`        | string or list of strings | required                         | Commands executed in order inside the container. |
| `stage`         | string                    | `test`, else the first stage     | The stage this job belongs to.                   |
| `image`         | string                    | `default.image` or `alpine:3.20` | Container image used to run the job.             |
| `needs`         | string or list of strings | `[]`                             | Explicit job dependencies.                       |
| `artifacts`     | map                       | none                             | Files to keep after the job succeeds.            |
| `retry`         | int or map                | `0`                              | How often a failed job is retried.               |
| `timeout`       | duration                  | `default.timeout` or `1h`        | Wall clock limit for a single attempt.           |
| `allow_failure` | boolean                   | `false`                          | Let the pipeline continue when this job fails.   |

## Durations

Durations are written as a sequence of `<number><unit>` segments, where the unit
is one of `ms`, `s`, `m`, `h` or `d`. Segments are added together, so `1h30m` is
90 minutes. Zero and negative values are rejected.

## Artifacts

```yaml
artifacts:
  name: build-output
  paths:
    - dist
    - reports/junit.xml
  expire_in: 7d
```

`paths` are resolved relative to the job workspace. `name` defaults to the job
name and `expire_in` defaults to seven days.

## Retry

`retry` accepts either a plain number or a map:

```yaml
retry: 2

retry:
  max: 2
  when: [script_failure, runner_failure, timeout]
```

`when` restricts which failures are retried. `always` covers every failure kind
and is the default.

## allow_failure

A job marked `allow_failure: true` still reports `failed`, but it does not block
its dependents and it does not turn the pipeline red:

```yaml
jobs:
  lint:
    script: npm run lint
    allow_failure: true
  deploy:
    needs: [lint]
    script: ./deploy.sh
```

Retries are evaluated first. A job only becomes a tolerated failure once its
retry budget is exhausted.
