# Architecture

## Packages

| Package        | Responsibility                                                       |
| -------------- | -------------------------------------------------------------------- |
| `@cicd/core`   | Configuration, dependency graph, scheduling. No I/O, no dependencies on the outside world. |

More packages will be added as the runner and the server take shape.

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

Linking only to the *closest* populated stage rather than to every earlier stage
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

## Errors

`ConfigError` carries a list of `{ path, message }` issues rather than a single
string. Validation collects everything it can find in one pass so that a user
fixing their configuration sees all problems at once instead of one per run.
