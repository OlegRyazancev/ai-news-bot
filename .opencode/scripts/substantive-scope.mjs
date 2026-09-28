#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  open,
  realpath,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'ai-news-bot/substantive-scope@1';

const execFileAsync = promisify(execFile);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const ZERO_MODE = '000000';
const REGULAR_MODES = new Set(['100644', '100755']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const STATE_START = '<!-- task-orchestration-state:start -->';
const STATE_END = '<!-- task-orchestration-state:end -->';
const STATE_SENTINEL = '<orchestration-state>';
const STATE_LAYOUT = [
  ['heading', '## Task-level orchestration state'],
  ['blank'],
  ['heading', '### Architect'],
  ['field', 'Classification'],
  ['field', 'Classification reason'],
  ['field', 'Analysis status'],
  ['field', 'Context revision'],
  ['field', 'Outcome'],
  ['field', 'Decision Gate'],
  ['field', 'Decision reference'],
  ['field', 'Applied constraints'],
  ['blank'],
  ['heading', '### Stage plan'],
  ['field', 'Approval'],
  ['field', 'Approval context'],
  ['blank'],
  ['heading', '### Reviewer'],
  ['field', 'Classification'],
  ['field', 'Classification reason'],
  ['field', 'Last completed pass'],
  ['field', 'Reviewed scope revision'],
  ['field', 'Unresolved finding IDs'],
  ['field', 'Confirmed fixes'],
  ['field', 'Verification after fixes'],
  ['field', 'Remaining rechecks'],
  ['field', 'Accepted residual risks'],
  ['field', 'Review gate'],
];

export class SubstantiveScopeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SubstantiveScopeError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new SubstantiveScopeError(code, message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function decodeUtf8(bytes, context) {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    fail('INVALID_UTF8', `${context} is not valid UTF-8`);
  }
}

function splitNul(buffer, context) {
  if (buffer.length === 0) return [];
  if (buffer.at(-1) !== 0) {
    fail('INVALID_GIT_OUTPUT', `${context} is not NUL-terminated`);
  }

  const records = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    records.push(buffer.subarray(start, index));
    start = index + 1;
  }
  return records;
}

function compareGitPaths(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function validateGitPath(gitPath) {
  if (typeof gitPath !== 'string' || gitPath.length === 0) {
    fail('INVALID_PATH', 'Git path must be a non-empty string');
  }
  if (gitPath.includes('\0') || gitPath.includes('\\') || gitPath.startsWith('/')) {
    fail('INVALID_PATH', `Unsafe Git path: ${JSON.stringify(gitPath)}`);
  }

  const components = gitPath.split('/');
  if (components.some((component) => component === '' || component === '.' || component === '..')) {
    fail('PATH_TRAVERSAL', `Git path escapes or ambiguously addresses the repository: ${JSON.stringify(gitPath)}`);
  }
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(gitPath)) {
    fail('INVALID_PATH', `Absolute Windows path is not allowed: ${JSON.stringify(gitPath)}`);
  }
  if (Buffer.from(gitPath, 'utf8').toString('utf8') !== gitPath) {
    fail('INVALID_UTF8', `Git path is not stable UTF-8: ${JSON.stringify(gitPath)}`);
  }
  return gitPath;
}

function validateSchema(schema) {
  if (typeof schema !== 'string' || schema.length === 0) {
    fail('INVALID_SCHEMA', 'A schema string is required');
  }
  if (schema !== SCHEMA) {
    fail('UNKNOWN_SCHEMA', `Unsupported substantive-scope schema: ${schema}`);
  }
}

function validateReviewBase(reviewBase) {
  if (typeof reviewBase !== 'string' || !COMMIT_PATTERN.test(reviewBase)) {
    fail('INVALID_REVIEW_BASE', 'review_base must be a full lowercase Git commit object ID');
  }
}

async function runGit(repoRoot, args) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: repoRoot,
      encoding: 'buffer',
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
      },
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout;
  } catch (error) {
    const stderr = Buffer.isBuffer(error?.stderr)
      ? error.stderr.toString('utf8').trim()
      : String(error?.stderr ?? '').trim();
    const safeDetail = stderr.split(/\r?\n/u)[0].slice(0, 300);
    fail('GIT_COMMAND_FAILED', safeDetail || `git ${args[0]} failed`);
  }
}

async function resolveRepository(repoRoot) {
  const requestedRoot = await realpath(path.resolve(repoRoot));
  const output = await runGit(requestedRoot, ['rev-parse', '--show-toplevel']);
  const gitRootText = decodeUtf8(output, 'Git repository root').trim();
  const gitRoot = await realpath(gitRootText);
  if (gitRoot !== requestedRoot) {
    fail('INVALID_REPOSITORY_ROOT', 'repoRoot must be the Git working-tree root');
  }
  return requestedRoot;
}

async function resolveReviewBase(repoRoot, reviewBase) {
  validateReviewBase(reviewBase);
  const output = await runGit(repoRoot, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${reviewBase}^{commit}`,
  ]);
  const resolved = decodeUtf8(output, 'review_base').trim();
  if (resolved !== reviewBase) {
    fail('INVALID_REVIEW_BASE', 'review_base did not resolve to the exact supplied commit object ID');
  }
  return resolved;
}

function parseTree(buffer) {
  const entries = new Map();
  for (const recordBuffer of splitNul(buffer, 'git ls-tree output')) {
    const record = decodeUtf8(recordBuffer, 'Git tree record');
    const tab = record.indexOf('\t');
    const match = tab === -1
      ? null
      : /^([0-7]{6}) ([a-z]+) ([0-9a-f]+)$/u.exec(record.slice(0, tab));
    if (!match) fail('INVALID_GIT_OUTPUT', 'Malformed git ls-tree record');
    const gitPath = validateGitPath(record.slice(tab + 1));
    if (entries.has(gitPath)) fail('DUPLICATE_PATH', `Duplicate base path: ${JSON.stringify(gitPath)}`);
    entries.set(gitPath, { mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function parseIndex(buffer) {
  const entries = new Map();
  for (const recordBuffer of splitNul(buffer, 'git ls-files output')) {
    const record = decodeUtf8(recordBuffer, 'Git index record');
    const tab = record.indexOf('\t');
    const match = tab === -1
      ? null
      : /^([0-7]{6}) ([0-9a-f]+) ([0-3])$/u.exec(record.slice(0, tab));
    if (!match) fail('INVALID_GIT_OUTPUT', 'Malformed git ls-files record');
    const gitPath = validateGitPath(record.slice(tab + 1));
    if (match[3] !== '0') fail('UNMERGED_INDEX', `Unmerged index path: ${JSON.stringify(gitPath)}`);
    if (entries.has(gitPath)) fail('DUPLICATE_PATH', `Duplicate index path: ${JSON.stringify(gitPath)}`);
    entries.set(gitPath, { mode: match[1], oid: match[2] });
  }
  return entries;
}

function parseStatus(buffer) {
  const entries = new Map();
  for (const recordBuffer of splitNul(buffer, 'git status output')) {
    const record = decodeUtf8(recordBuffer, 'Git status record');
    let parsed;

    if (record.startsWith('1 ')) {
      const match = /^1 ([^ ]{2}) ([^ ]+) ([0-7]{6}) ([0-7]{6}) ([0-7]{6}) ([0-9a-f]+) ([0-9a-f]+) ([\s\S]+)$/u.exec(record);
      if (!match) fail('INVALID_GIT_OUTPUT', 'Malformed ordinary git status record');
      parsed = {
        path: validateGitPath(match[8]),
        status: match[1],
        worktreeMode: match[5],
        untracked: false,
      };
    } else if (record.startsWith('? ')) {
      parsed = {
        path: validateGitPath(record.slice(2)),
        status: '??',
        worktreeMode: null,
        untracked: true,
      };
    } else if (record.startsWith('2 ')) {
      fail('RENAME_DETECTION_ENABLED', 'Git status returned a rename despite --no-renames');
    } else if (record.startsWith('u ')) {
      fail('UNMERGED_INDEX', 'Unmerged worktree state is not supported');
    } else {
      fail('INVALID_GIT_OUTPUT', 'Unsupported git status record');
    }

    if (entries.has(parsed.path)) {
      fail('DUPLICATE_PATH', `Duplicate status path: ${JSON.stringify(parsed.path)}`);
    }
    entries.set(parsed.path, parsed);
  }
  return entries;
}

function sameIndexAndBase(baseEntry, indexEntry) {
  return baseEntry !== undefined
    && indexEntry !== undefined
    && baseEntry.type === 'blob'
    && baseEntry.mode === indexEntry.mode
    && baseEntry.oid === indexEntry.oid;
}

function assertSupportedMode(mode, gitPath, side) {
  if (mode !== ZERO_MODE && !REGULAR_MODES.has(mode)) {
    fail('UNSUPPORTED_FILE_TYPE', `${side} path is not a regular Git file: ${JSON.stringify(gitPath)}`);
  }
}

function buildInspection(reviewBase, baseEntries, indexEntries, statusEntries) {
  const candidates = new Set();
  for (const gitPath of new Set([...baseEntries.keys(), ...indexEntries.keys()])) {
    if (!sameIndexAndBase(baseEntries.get(gitPath), indexEntries.get(gitPath))) {
      candidates.add(gitPath);
    }
  }
  for (const gitPath of statusEntries.keys()) candidates.add(gitPath);

  const paths = [...candidates].sort(compareGitPaths).map((gitPath) => {
    const base = baseEntries.get(gitPath);
    const index = indexEntries.get(gitPath);
    const status = statusEntries.get(gitPath);

    if (base && base.type !== 'blob') {
      fail('UNSUPPORTED_FILE_TYPE', `Base path is not a blob: ${JSON.stringify(gitPath)}`);
    }
    if (base) assertSupportedMode(base.mode, gitPath, 'Base');
    if (index) assertSupportedMode(index.mode, gitPath, 'Index');

    let finalMode;
    if (status?.untracked) finalMode = null;
    else if (status) finalMode = status.worktreeMode;
    else finalMode = index?.mode ?? ZERO_MODE;
    if (finalMode !== null) assertSupportedMode(finalMode, gitPath, 'Worktree');

    return {
      path: gitPath,
      base_mode: base?.mode ?? ZERO_MODE,
      base_oid: base?.oid ?? null,
      index_mode: index?.mode ?? ZERO_MODE,
      index_oid: index?.oid ?? null,
      worktree_mode: finalMode,
      status: status?.status ?? '  ',
    };
  });

  const canonical = {
    schema: SCHEMA,
    review_base: reviewBase,
    paths,
  };
  return {
    ...canonical,
    inspection_sha256: sha256(canonicalBytes(canonical)),
  };
}

async function inspectResolved(repoRoot, reviewBase) {
  const [treeOutput, indexOutput, statusOutput] = await Promise.all([
    runGit(repoRoot, ['ls-tree', '-rz', '--full-tree', reviewBase]),
    runGit(repoRoot, ['ls-files', '--stage', '-z']),
    runGit(repoRoot, [
      '-c',
      'status.renames=false',
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--no-renames',
    ]),
  ]);
  return buildInspection(
    reviewBase,
    parseTree(treeOutput),
    parseIndex(indexOutput),
    parseStatus(statusOutput),
  );
}

export async function inspectScope({
  repoRoot = process.cwd(),
  reviewBase,
  schema,
}) {
  validateSchema(schema);
  const root = await resolveRepository(repoRoot);
  const base = await resolveReviewBase(root, reviewBase);
  return inspectResolved(root, base);
}

function validateApprovedPaths(approvedPaths) {
  if (!Array.isArray(approvedPaths)) {
    fail('INVALID_APPROVED_PATHS', 'approved_paths must be an array');
  }
  const seen = new Set();
  for (const gitPath of approvedPaths) {
    validateGitPath(gitPath);
    if (seen.has(gitPath)) {
      fail('DUPLICATE_PATH', `Duplicate approved path: ${JSON.stringify(gitPath)}`);
    }
    seen.add(gitPath);
  }
  return [...seen].sort(compareGitPaths);
}

function inspectionPaths(inspection) {
  return inspection.paths.map((entry) => entry.path);
}

function assertExactPathSet(actual, approved) {
  if (actual.length !== approved.length || actual.some((value, index) => value !== approved[index])) {
    fail('APPROVED_PATH_SET_MISMATCH', 'approved_paths does not exactly match the inspected path set');
  }
}

function assertInsideRepository(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('PATH_ESCAPE', 'Resolved path escapes the repository');
  }
}

async function resolveRegularPath(repoRoot, gitPath) {
  const components = gitPath.split('/');
  let current = repoRoot;
  const componentSnapshots = [];
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    assertInsideRepository(repoRoot, current);
    let stats;
    try {
      stats = await lstat(current, { bigint: true });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { exists: false, absolutePath: current, componentSnapshots };
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      fail('SYMLINK_NOT_ALLOWED', `Symlink path component is not allowed: ${JSON.stringify(gitPath)}`);
    }
    if (index < components.length - 1 && !stats.isDirectory()) {
      fail('INVALID_PATH_COMPONENT', `Non-directory parent in path: ${JSON.stringify(gitPath)}`);
    }
    if (index === components.length - 1 && !stats.isFile()) {
      fail('UNSUPPORTED_FILE_TYPE', `Final path is not a regular file: ${JSON.stringify(gitPath)}`);
    }
    componentSnapshots.push({ absolutePath: current, snapshot: statSnapshot(stats) });
  }

  const resolved = await realpath(current);
  assertInsideRepository(repoRoot, resolved);
  return { exists: true, absolutePath: current, componentSnapshots };
}

function statSnapshot(stats) {
  return {
    dev: String(stats.dev),
    ino: String(stats.ino),
    mode: String(stats.mode),
    nlink: String(stats.nlink),
    size: String(stats.size),
    mtime_ns: String(stats.mtimeNs),
    ctime_ns: String(stats.ctimeNs),
  };
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

async function readStableFile(repoRoot, gitPath) {
  const resolved = await resolveRegularPath(repoRoot, gitPath);
  if (!resolved.exists) return { exists: false };

  const noFollow = process.platform === 'win32' ? 0 : (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(resolved.absolutePath, fsConstants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) {
      fail('UNSUPPORTED_FILE_TYPE', `Opened path is not a regular file: ${JSON.stringify(gitPath)}`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const beforeSnapshot = statSnapshot(before);
    const afterSnapshot = statSnapshot(after);
    if (!sameSnapshot(beforeSnapshot, afterSnapshot) || BigInt(bytes.length) !== after.size) {
      fail('FILE_CHANGED_DURING_READ', `File changed while being read: ${JSON.stringify(gitPath)}`);
    }

    const pathStats = await lstat(resolved.absolutePath, { bigint: true });
    const pathSnapshot = statSnapshot(pathStats);
    if (!sameSnapshot(afterSnapshot, pathSnapshot)) {
      fail('FILE_REPLACED_DURING_READ', `File identity changed while being read: ${JSON.stringify(gitPath)}`);
    }
    const resolvedAfterOpen = await realpath(resolved.absolutePath);
    assertInsideRepository(repoRoot, resolvedAfterOpen);
    return {
      exists: true,
      bytes,
      snapshot: afterSnapshot,
      absolutePath: resolved.absolutePath,
      componentSnapshots: resolved.componentSnapshots,
      executable: (Number(after.mode) & 0o111) !== 0,
    };
  } finally {
    await handle.close();
  }
}

async function verifyStableFile(readResult, gitPath) {
  if (!readResult.exists) {
    const current = await resolveRegularPath(readResult.repoRoot, gitPath);
    if (current.exists) fail('FILE_APPEARED_DURING_CALCULATION', `File appeared: ${JSON.stringify(gitPath)}`);
    return;
  }
  for (const component of readResult.componentSnapshots) {
    const componentStats = await lstat(component.absolutePath, { bigint: true });
    if (componentStats.isSymbolicLink() || !sameSnapshot(component.snapshot, statSnapshot(componentStats))) {
      fail('PATH_CHANGED_DURING_CALCULATION', `Path component changed: ${JSON.stringify(gitPath)}`);
    }
  }
  const stats = await lstat(readResult.absolutePath, { bigint: true });
  if (!stats.isFile() || !sameSnapshot(readResult.snapshot, statSnapshot(stats))) {
    fail('FILE_CHANGED_DURING_CALCULATION', `File changed during calculation: ${JSON.stringify(gitPath)}`);
  }
  const resolved = await realpath(readResult.absolutePath);
  assertInsideRepository(readResult.repoRoot, resolved);
}

async function readBaseBlob(repoRoot, oid) {
  if (!COMMIT_PATTERN.test(oid)) fail('INVALID_OBJECT_ID', 'Invalid base blob object ID');
  return runGit(repoRoot, ['cat-file', 'blob', oid]);
}

function splitTextLines(bytes, context) {
  const text = decodeUtf8(bytes, context);
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') continue;
    const bodyEnd = index > start && text[index - 1] === '\r' ? index - 1 : index;
    lines.push({ text: text.slice(start, bodyEnd), ending: text.slice(bodyEnd, index + 1) });
    start = index + 1;
  }
  if (start < text.length) lines.push({ text: text.slice(start), ending: '' });
  else if (text.length === 0) lines.push({ text: '', ending: '' });
  return lines;
}

function markerIndexes(lines, marker) {
  const indexes = [];
  lines.forEach((line, index) => {
    if (line.text === marker) indexes.push(index);
  });
  return indexes;
}

export function normalizeOrchestrationState(bytes) {
  const lines = splitTextLines(bytes, 'Stage checklist');
  const starts = markerIndexes(lines, STATE_START);
  const ends = markerIndexes(lines, STATE_END);
  if (starts.length === 0 && ends.length === 0) {
    return { bytes, applied: false };
  }
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0]) {
    fail('INVALID_STATE_SECTION', 'Stage checklist must contain one ordered task-orchestration-state marker pair');
  }

  const section = lines.slice(starts[0] + 1, ends[0]);
  if (section.length !== STATE_LAYOUT.length) {
    fail('INVALID_STATE_SECTION', 'Task orchestration state does not match the canonical schema');
  }

  section.forEach((line, index) => {
    const [kind, expected] = STATE_LAYOUT[index];
    if (kind === 'blank' && line.text !== '') {
      fail('INVALID_STATE_SECTION', 'Unexpected text in task orchestration state');
    }
    if (kind === 'heading' && line.text !== expected) {
      fail('INVALID_STATE_SECTION', `Expected canonical state heading: ${expected}`);
    }
    if (kind === 'field') {
      const prefix = `- **${expected}:** `;
      if (!line.text.startsWith(prefix) || line.text.length === prefix.length) {
        fail('INVALID_STATE_SECTION', `Expected one-line canonical state field: ${expected}`);
      }
      line.text = `${prefix}${STATE_SENTINEL}`;
    }
  });

  return {
    bytes: Buffer.from(lines.map((line) => `${line.text}${line.ending}`).join(''), 'utf8'),
    applied: true,
  };
}

function deriveFinalMode(inspectionEntry, readResult) {
  if (!readResult.exists) return ZERO_MODE;
  if (inspectionEntry.worktree_mode !== null) return inspectionEntry.worktree_mode;
  return readResult.executable ? '100755' : '100644';
}

function operationFor(baseMode, finalMode) {
  if (baseMode === ZERO_MODE) return 'add';
  if (finalMode === ZERO_MODE) return 'delete';
  if (baseMode !== finalMode) return 'type-change';
  return 'modify';
}

function normalizeIfChecklist(bytes, gitPath, stateChecklistPath) {
  if (gitPath !== stateChecklistPath) return { bytes, applied: false };
  return normalizeOrchestrationState(bytes);
}

export async function calculateScope({
  repoRoot = process.cwd(),
  reviewBase,
  schema,
  expectedInspectionSha256,
  approvedPaths,
  stateChecklistPath = null,
}) {
  validateSchema(schema);
  if (typeof expectedInspectionSha256 !== 'string' || !SHA256_PATTERN.test(expectedInspectionSha256)) {
    fail('INVALID_INSPECTION_HASH', 'expected_inspection_sha256 must be a lowercase SHA-256');
  }
  const approved = validateApprovedPaths(approvedPaths);
  if (stateChecklistPath !== null) {
    validateGitPath(stateChecklistPath);
    if (!approved.includes(stateChecklistPath)) {
      fail('INVALID_STATE_CHECKLIST', 'state_checklist_path must be null or an approved inspected path');
    }
  }

  const root = await resolveRepository(repoRoot);
  const base = await resolveReviewBase(root, reviewBase);
  const beforeInspection = await inspectResolved(root, base);
  if (beforeInspection.inspection_sha256 !== expectedInspectionSha256) {
    fail('INSPECTION_MISMATCH', 'Current inspection does not match expected_inspection_sha256');
  }
  assertExactPathSet(inspectionPaths(beforeInspection), approved);

  const readResults = new Map();
  const manifest = [];
  for (const entry of beforeInspection.paths) {
    const readResult = await readStableFile(root, entry.path);
    readResult.repoRoot = root;
    readResults.set(entry.path, readResult);

    const finalMode = deriveFinalMode(entry, readResult);
    assertSupportedMode(finalMode, entry.path, 'Final');
    if ((entry.worktree_mode === ZERO_MODE) !== !readResult.exists && entry.worktree_mode !== null) {
      fail('WORKTREE_METADATA_MISMATCH', `Git metadata and filesystem disagree for ${JSON.stringify(entry.path)}`);
    }

    const baseExists = entry.base_mode !== ZERO_MODE;
    const finalExists = finalMode !== ZERO_MODE;
    let finalNormalized = null;
    let baseNormalized = null;
    let normalizationApplied = false;

    if (finalExists) {
      const normalized = normalizeIfChecklist(readResult.bytes, entry.path, stateChecklistPath);
      finalNormalized = normalized.bytes;
      normalizationApplied ||= normalized.applied;
    }
    if (baseExists && finalExists) {
      const baseBytes = await readBaseBlob(root, entry.base_oid);
      const normalized = normalizeIfChecklist(baseBytes, entry.path, stateChecklistPath);
      baseNormalized = normalized.bytes;
      normalizationApplied ||= normalized.applied;
    }

    if (
      baseExists
      && finalExists
      && entry.base_mode === finalMode
      && Buffer.compare(baseNormalized, finalNormalized) === 0
    ) {
      continue;
    }

    manifest.push({
      path: entry.path,
      operation: operationFor(entry.base_mode, finalMode),
      old_mode: entry.base_mode,
      new_mode: finalMode,
      base_oid: entry.base_oid,
      content_sha256: finalExists ? sha256(finalNormalized) : null,
      normalization: normalizationApplied ? 'task-orchestration-state-v1' : 'none',
    });
  }

  for (const [gitPath, readResult] of readResults) {
    await verifyStableFile(readResult, gitPath);
  }
  const afterInspection = await inspectResolved(root, base);
  if (afterInspection.inspection_sha256 !== expectedInspectionSha256) {
    fail('INSPECTION_CHANGED_DURING_CALCULATION', 'Inspection manifest changed during calculation');
  }
  assertExactPathSet(inspectionPaths(afterInspection), approved);
  for (const [gitPath, readResult] of readResults) {
    await verifyStableFile(readResult, gitPath);
  }

  const substantiveScope = {
    schema: SCHEMA,
    review_base: base,
    normalized_final_content_manifest: manifest,
  };
  return {
    ...substantiveScope,
    inspection_sha256: expectedInspectionSha256,
    substantive_scope_sha256: sha256(canonicalBytes(substantiveScope)),
  };
}

async function readRequest() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  let request;
  try {
    request = JSON.parse(decodeUtf8(bytes, 'CLI request'));
  } catch (error) {
    if (error instanceof SubstantiveScopeError) throw error;
    fail('INVALID_REQUEST', 'stdin must contain one UTF-8 JSON request');
  }
  if (request === null || Array.isArray(request) || typeof request !== 'object') {
    fail('INVALID_REQUEST', 'CLI request must be a JSON object');
  }
  return request;
}

async function runCli() {
  const request = await readRequest();
  let result;
  if (request.action === 'inspect') {
    result = await inspectScope({
      repoRoot: request.repo_root ?? process.cwd(),
      reviewBase: request.review_base,
      schema: request.schema,
    });
  } else if (request.action === 'calculate') {
    result = await calculateScope({
      repoRoot: request.repo_root ?? process.cwd(),
      reviewBase: request.review_base,
      schema: request.schema,
      expectedInspectionSha256: request.expected_inspection_sha256,
      approvedPaths: request.approved_paths,
      stateChecklistPath: request.state_checklist_path ?? null,
    });
  } else {
    fail('INVALID_ACTION', 'action must be inspect or calculate');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  runCli().catch((error) => {
    const code = error instanceof SubstantiveScopeError ? error.code : 'INTERNAL_ERROR';
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${JSON.stringify({ error: code, message })}\n`);
    process.exitCode = 1;
  });
}
