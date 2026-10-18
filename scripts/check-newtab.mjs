#!/usr/bin/env node
// Fails if extension/newtab.html or extension/newtab.js is not exactly what
// extension/build-newtab.py generates from the current index.html - i.e. if
// someone edited index.html and forgot `npm run build:newtab`.
//
//   npm run check:newtab
//
// build-newtab.py writes next to itself, so the check copies it and index.html
// into the same layout in a temp directory and runs it there. The comparison is
// against the real generator's output, byte for byte, and the committed files
// are never touched.

import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GENERATED = ['newtab.html', 'newtab.js'];

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Regenerates the new tab page for the repo at `root` in a scratch directory
 * and compares it with the committed copies.
 *
 * Resolves to a list of { file, problem } for every generated file that is
 * missing or differs; an empty list means everything is in sync. Rejects if
 * the generator itself fails.
 */
export async function checkNewtab(root = REPO_ROOT, { python = process.env.PYTHON || 'python3' } = {}) {
  const work = await mkdtemp(path.join(tmpdir(), 'simplehome-newtab-'));
  try {
    await mkdir(path.join(work, 'extension'));
    await copyFile(path.join(root, 'index.html'), path.join(work, 'index.html'));
    await copyFile(path.join(root, 'extension', 'build-newtab.py'), path.join(work, 'extension', 'build-newtab.py'));

    const run = spawnSync(python, ['build-newtab.py'], { cwd: path.join(work, 'extension'), encoding: 'utf8' });
    if (run.error) throw new Error(`could not run ${python}: ${run.error.message}`);
    if (run.status !== 0) {
      throw new Error(`build-newtab.py exited with ${run.status}: ${(run.stderr || run.stdout).trim()}`);
    }

    const problems = [];
    for (const file of GENERATED) {
      const expected = await readFile(path.join(work, 'extension', file), 'utf8');
      let actual;
      try {
        actual = await readFile(path.join(root, 'extension', file), 'utf8');
      } catch {
        problems.push({ file, problem: 'missing' });
        continue;
      }
      if (actual !== expected) problems.push({ file, problem: firstDifference(expected, actual) });
    }
    return problems;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function firstDifference(expected, actual) {
  const want = expected.split('\n');
  const have = actual.split('\n');
  const clip = (line) =>
    line === undefined ? '<end of file>' : JSON.stringify(line.length > 100 ? line.slice(0, 100) + '…' : line);
  for (let i = 0; i < Math.max(want.length, have.length); i++) {
    if (want[i] !== have[i]) {
      return `differs from line ${i + 1}: expected ${clip(want[i])}, found ${clip(have[i])}`;
    }
  }
  return 'differs';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const problems = await checkNewtab();
    if (problems.length) {
      for (const { file, problem } of problems) console.error(`extension/${file} is out of date: ${problem}`);
      console.error('\nRegenerate it from index.html with `npm run build:newtab` and commit the result.');
      process.exitCode = 1;
    } else {
      console.log(`extension/${GENERATED.join(' and ')} match index.html`);
    }
  } catch (err) {
    console.error(`check-newtab: ${err.message}`);
    process.exitCode = 2;
  }
}
