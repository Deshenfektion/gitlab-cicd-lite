# gitlab-cicd-lite

A miniature CI/CD platform inspired by GitLab CI.

The goal of this project is to understand how modern CI systems actually work
underneath the YAML: how a pipeline definition becomes a dependency graph, how
that graph is scheduled, and how jobs end up running inside containers.

It is deliberately not a GitLab clone. It implements the core architecture
(configuration, graph, state machine, scheduler, runner, artifacts) and leaves
out everything else.

## Status

Early work in progress.

## License

MIT
