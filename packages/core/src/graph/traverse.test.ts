import { describe, expect, it } from 'vitest';
import { loadPipeline } from '../config/load.js';
import { ancestors, artifactSources, descendants } from './traverse.js';

const diamond = loadPipeline(`
jobs:
  root:
    script: echo
    artifacts:
      paths: [dist]
  left:
    script: echo
    needs: [root]
    artifacts:
      paths: [left.txt]
  right:
    script: echo
    needs: [root]
  join:
    script: echo
    needs: [left, right]
  publish:
    script: echo
    needs: [join]
`).graph;

describe('descendants', () => {
  it('collects the full downstream closure', () => {
    expect([...descendants(diamond, 'root')].sort()).toEqual(['join', 'left', 'publish', 'right']);
  });

  it('visits a diamond join only once', () => {
    expect([...descendants(diamond, 'left')].sort()).toEqual(['join', 'publish']);
  });

  it('returns an empty set for a leaf', () => {
    expect(descendants(diamond, 'publish').size).toBe(0);
  });
});

describe('ancestors', () => {
  it('collects the full upstream closure', () => {
    expect([...ancestors(diamond, 'publish')].sort()).toEqual(['join', 'left', 'right', 'root']);
  });

  it('returns an empty set for a root job', () => {
    expect(ancestors(diamond, 'root').size).toBe(0);
  });
});

describe('artifactSources', () => {
  it('only lists direct dependencies that publish artifacts', () => {
    expect(artifactSources(diamond, 'join')).toEqual(['left']);
    expect(artifactSources(diamond, 'left')).toEqual(['root']);
  });

  it('does not reach through transitive dependencies', () => {
    expect(artifactSources(diamond, 'publish')).toEqual([]);
  });
});
