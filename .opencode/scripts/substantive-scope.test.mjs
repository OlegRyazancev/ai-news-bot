import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  SCHEMA,
  calculateScope,
  inspectScope,
} from './substantive-scope.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(new URL('./substantive-scope.mjs', import.meta.url));

async function git(repoRoot, ...args) {
  const result = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function createRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'substantive-scope-'));
  await git(repoRoot, 'init', '--quiet');
  await git(repoRoot, 'config', 'user.email', 'fixture@example.invalid');
  await git(repoRoot, 'config', 'user.name', 'Fixture User');
  await git(repoRoot, 'config', 'core.autocrlf', 'false');
  await writeFile(path.join(repoRoot, 'seed.txt'), 'seed\n', 'utf8');
  await git(repoRoot, 'add', '--', 'seed.txt');
  await git(repoRoot, 'commit', '--quiet', '-m', 'fixture base');
  const reviewBase = await git(repoRoot, 'rev-parse', 'HEAD');
  return { repoRoot, reviewBase };
}

async function withRepo(callback) {
  const fixture = await createRepo();
  try {
    await callback(fixture);
  } finally {
    await rm(fixture.repoRoot, { recursive: true, force: true });
  }
}

async function inspect(fixture) {
  return inspectScope({
    repoRoot: fixture.repoRoot,
    reviewBase: fixture.reviewBase,
    schema: SCHEMA,
  });
}

async function calculate(fixture, inspection, stateChecklistPath = null) {
  return calculateScope({
    repoRoot: fixture.repoRoot,
    reviewBase: fixture.reviewBase,
    schema: SCHEMA,
    expectedInspectionSha256: inspection.inspection_sha256,
    approvedPaths: inspection.paths.map((entry) => entry.path),
    stateChecklistPath,
  });
}

async function assertScopeError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function runCli(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH], {
      cwd: request.repo_root,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf8');
      const errorOutput = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) {
        reject(new Error(`CLI failed (${code}): ${errorOutput}`));
        return;
      }
      resolve(JSON.parse(output));
    });
    child.stdin.end(Buffer.from(JSON.stringify(request), 'utf8'));
  });
}

function orchestrationState(classification) {
  return [
    '<!-- task-orchestration-state:start -->',
    '## Task-level orchestration state',
    '',
    '### Architect',
    `- **Classification:** ${classification}`,
    '- **Classification reason:** confirmed',
    '- **Analysis status:** completed',
    '- **Context revision:** v1',
    '- **Outcome:** accepted',
    '- **Decision Gate:** resolved',
    '- **Decision reference:** docs/DECISIONS.md',
    '- **Applied constraints:** bounded',
    '',
    '### Stage plan',
    '- **Approval:** confirmed',
    '- **Approval context:** user approved',
    '',
    '### Reviewer',
    '- **Classification:** required',
    '- **Classification reason:** application code',
    '- **Last completed pass:** initial',
    '- **Reviewed scope revision:** unconfirmed',
    '- **Unresolved finding IDs:** none',
    '- **Confirmed fixes:** none',
    '- **Verification after fixes:** not-applicable',
    '- **Remaining rechecks:** 2',
    '- **Accepted residual risks:** none',
    '- **Review gate:** pending',
    '<!-- task-orchestration-state:end -->',
  ].join('\n');
}

test('reviewed untracked content keeps its fingerprint after commit', async () => {
  await withRepo(async (fixture) => {
    await writeFile(path.join(fixture.repoRoot, 'feature.txt'), 'same bytes\n', 'utf8');
    const before = await inspect(fixture);
    const reviewed = await calculate(fixture, before);

    await git(fixture.repoRoot, 'add', '--', 'feature.txt');
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'add feature');
    const after = await inspect(fixture);
    const committed = await calculate(fixture, after);

    assert.equal(committed.substantive_scope_sha256, reviewed.substantive_scope_sha256);
    assert.deepEqual(committed.normalized_final_content_manifest, reviewed.normalized_final_content_manifest);
  });
});

test('a real content change changes the fingerprint', async () => {
  await withRepo(async (fixture) => {
    await writeFile(path.join(fixture.repoRoot, 'feature.txt'), 'version one\n', 'utf8');
    const firstInspection = await inspect(fixture);
    const first = await calculate(fixture, firstInspection);

    await writeFile(path.join(fixture.repoRoot, 'feature.txt'), 'version two\n', 'utf8');
    const secondInspection = await inspect(fixture);
    const second = await calculate(fixture, secondInspection);

    assert.notEqual(second.substantive_scope_sha256, first.substantive_scope_sha256);
  });
});

test('rename is canonical delete plus add before and after commit', async () => {
  await withRepo(async (fixture) => {
    await writeFile(path.join(fixture.repoRoot, 'old.txt'), 'rename bytes\n', 'utf8');
    await git(fixture.repoRoot, 'add', '--', 'old.txt');
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'add old path');
    fixture.reviewBase = await git(fixture.repoRoot, 'rev-parse', 'HEAD');

    await rename(path.join(fixture.repoRoot, 'old.txt'), path.join(fixture.repoRoot, 'new.txt'));
    const before = await calculate(fixture, await inspect(fixture));
    assert.deepEqual(
      before.normalized_final_content_manifest.map(({ path: gitPath, operation }) => [gitPath, operation]),
      [['new.txt', 'add'], ['old.txt', 'delete']],
    );

    await git(fixture.repoRoot, 'add', '-A');
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'rename path');
    const after = await calculate(fixture, await inspect(fixture));
    assert.equal(after.substantive_scope_sha256, before.substantive_scope_sha256);
  });
});

test('file additions and deletions are represented explicitly', async () => {
  await withRepo(async (fixture) => {
    await writeFile(path.join(fixture.repoRoot, 'remove.txt'), 'remove me\n', 'utf8');
    await git(fixture.repoRoot, 'add', '--', 'remove.txt');
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'add removable file');
    fixture.reviewBase = await git(fixture.repoRoot, 'rev-parse', 'HEAD');

    await unlink(path.join(fixture.repoRoot, 'remove.txt'));
    await writeFile(path.join(fixture.repoRoot, 'add.txt'), 'add me\n', 'utf8');
    const result = await calculate(fixture, await inspect(fixture));
    assert.deepEqual(
      result.normalized_final_content_manifest.map(({ path: gitPath, operation }) => [gitPath, operation]),
      [['add.txt', 'add'], ['remove.txt', 'delete']],
    );
  });
});

test('binary files use exact-byte hashing', async () => {
  await withRepo(async (fixture) => {
    const binaryPath = path.join(fixture.repoRoot, 'binary.dat');
    await writeFile(binaryPath, Buffer.from([0, 255, 1, 13, 10, 128]));
    const first = await calculate(fixture, await inspect(fixture));
    await writeFile(binaryPath, Buffer.from([0, 255, 1, 13, 10, 129]));
    const second = await calculate(fixture, await inspect(fixture));
    assert.notEqual(second.substantive_scope_sha256, first.substantive_scope_sha256);
  });
});

test('Git file mode changes are substantive', async () => {
  await withRepo(async (fixture) => {
    const scriptPath = path.join(fixture.repoRoot, 'run.sh');
    await writeFile(scriptPath, '#!/bin/sh\nexit 0\n', 'utf8');
    await git(fixture.repoRoot, 'add', '--', 'run.sh');
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'add script');
    fixture.reviewBase = await git(fixture.repoRoot, 'rev-parse', 'HEAD');

    if (process.platform !== 'win32') await chmod(scriptPath, 0o755);
    await git(fixture.repoRoot, 'update-index', '--chmod=+x', '--', 'run.sh');
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'make executable');

    const result = await calculate(fixture, await inspect(fixture));
    assert.equal(result.normalized_final_content_manifest.length, 1);
    assert.equal(result.normalized_final_content_manifest[0].operation, 'type-change');
    assert.equal(result.normalized_final_content_manifest[0].old_mode, '100644');
    assert.equal(result.normalized_final_content_manifest[0].new_mode, '100755');
  });
});

test('bounded orchestration-state values are normalized', async () => {
  await withRepo(async (fixture) => {
    const checklistPath = 'docs/checklists/99-fixture.md';
    await mkdir(path.join(fixture.repoRoot, 'docs', 'checklists'), { recursive: true });
    await writeFile(
      path.join(fixture.repoRoot, checklistPath),
      `# Fixture\n\n${orchestrationState('required')}\n\n## Acceptance\n- unchanged\n`,
      'utf8',
    );
    await git(fixture.repoRoot, 'add', '--', checklistPath);
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'add checklist');
    fixture.reviewBase = await git(fixture.repoRoot, 'rev-parse', 'HEAD');

    const cleanResult = await calculate(fixture, await inspect(fixture));
    const checklist = await readFile(path.join(fixture.repoRoot, checklistPath), 'utf8');
    await writeFile(
      path.join(fixture.repoRoot, checklistPath),
      checklist.replace('- **Classification:** required', '- **Classification:** not-required'),
      'utf8',
    );

    const stateOnly = await calculate(fixture, await inspect(fixture), checklistPath);
    assert.equal(stateOnly.substantive_scope_sha256, cleanResult.substantive_scope_sha256);
    assert.deepEqual(stateOnly.normalized_final_content_manifest, []);
  });
});

test('substantive checklist text is not normalized away', async () => {
  await withRepo(async (fixture) => {
    const checklistPath = 'docs/checklists/99-fixture.md';
    await mkdir(path.join(fixture.repoRoot, 'docs', 'checklists'), { recursive: true });
    await writeFile(
      path.join(fixture.repoRoot, checklistPath),
      `# Fixture\n\n${orchestrationState('required')}\n\n## Acceptance\n- original\n`,
      'utf8',
    );
    await git(fixture.repoRoot, 'add', '--', checklistPath);
    await git(fixture.repoRoot, 'commit', '--quiet', '-m', 'add checklist');
    fixture.reviewBase = await git(fixture.repoRoot, 'rev-parse', 'HEAD');
    const cleanResult = await calculate(fixture, await inspect(fixture));

    const checklist = await readFile(path.join(fixture.repoRoot, checklistPath), 'utf8');
    await writeFile(
      path.join(fixture.repoRoot, checklistPath),
      checklist
        .replace('- **Classification:** required', '- **Classification:** not-required')
        .replace('- original', '- substantively changed'),
      'utf8',
    );
    const changed = await calculate(fixture, await inspect(fixture), checklistPath);

    assert.notEqual(changed.substantive_scope_sha256, cleanResult.substantive_scope_sha256);
    assert.equal(changed.normalized_final_content_manifest[0].normalization, 'task-orchestration-state-v1');
  });
});

test('independent CLI processes produce the same inspection and fingerprint', async () => {
  await withRepo(async (fixture) => {
    await writeFile(path.join(fixture.repoRoot, 'repeat.txt'), 'repeatable\n', 'utf8');
    const inspectRequest = {
      action: 'inspect',
      schema: SCHEMA,
      review_base: fixture.reviewBase,
      repo_root: fixture.repoRoot,
    };
    const firstInspection = await runCli(inspectRequest);
    const secondInspection = await runCli(inspectRequest);
    assert.deepEqual(secondInspection, firstInspection);

    const calculateRequest = {
      action: 'calculate',
      schema: SCHEMA,
      review_base: fixture.reviewBase,
      repo_root: fixture.repoRoot,
      expected_inspection_sha256: firstInspection.inspection_sha256,
      approved_paths: firstInspection.paths.map((entry) => entry.path),
      state_checklist_path: null,
    };
    const first = await runCli(calculateRequest);
    const second = await runCli(calculateRequest);
    assert.deepEqual(second, first);
  });
});

test('path traversal and symlink Git modes fail closed', async () => {
  await withRepo(async (fixture) => {
    await assertScopeError(
      calculateScope({
        repoRoot: fixture.repoRoot,
        reviewBase: fixture.reviewBase,
        schema: SCHEMA,
        expectedInspectionSha256: '0'.repeat(64),
        approvedPaths: ['../escape'],
      }),
      'PATH_TRAVERSAL',
    );

    const targetPath = path.join(fixture.repoRoot, 'target.txt');
    const symlinkPath = path.join(fixture.repoRoot, 'untracked-link');
    await writeFile(targetPath, 'target\n', 'utf8');
    try {
      await symlink('target.txt', symlinkPath, 'file');
      const symlinkInspection = await inspect(fixture);
      await assertScopeError(calculate(fixture, symlinkInspection), 'SYMLINK_NOT_ALLOWED');
      await unlink(symlinkPath);
    } catch (error) {
      if (error?.code !== 'EPERM') throw error;
    }
    await unlink(targetPath);

    const linkTarget = path.join(fixture.repoRoot, '.link-target');
    await writeFile(linkTarget, 'outside-target', 'utf8');
    const oid = await git(fixture.repoRoot, 'hash-object', '-w', '--', '.link-target');
    await unlink(linkTarget);
    await git(fixture.repoRoot, 'update-index', '--add', '--cacheinfo', '120000', oid, 'link');
    await assertScopeError(inspect(fixture), 'UNSUPPORTED_FILE_TYPE');
  });
});

test('calculate rejects a changed inspection manifest', async () => {
  await withRepo(async (fixture) => {
    await writeFile(path.join(fixture.repoRoot, 'first.txt'), 'first\n', 'utf8');
    const approvedInspection = await inspect(fixture);
    await writeFile(path.join(fixture.repoRoot, 'second.txt'), 'second\n', 'utf8');

    await assertScopeError(calculate(fixture, approvedInspection), 'INSPECTION_MISMATCH');
  });
});

test('invalid and unknown schemas are rejected', async () => {
  await withRepo(async (fixture) => {
    await assertScopeError(
      inspectScope({ repoRoot: fixture.repoRoot, reviewBase: fixture.reviewBase }),
      'INVALID_SCHEMA',
    );
    await assertScopeError(
      inspectScope({
        repoRoot: fixture.repoRoot,
        reviewBase: fixture.reviewBase,
        schema: 'ai-news-bot/substantive-scope@2',
      }),
      'UNKNOWN_SCHEMA',
    );
  });
});
