/**
 * Bug #167: gsd-tools.cjs does not support the `query` meta-command
 *
 * Workflow files invoke `$GSD_SDK query init.progress` etc.  The standalone
 * `gsd-sdk` binary strips `query` before forwarding, but callers that invoke
 * `node gsd-tools.cjs` directly (the preflight fallback path) hit
 * "Unknown command: query" because gsd-tools.cjs did not handle it.
 *
 * The fix adds a shim that strips the leading `query` token before the
 * existing dotted-form expansion, so the full chain is:
 *
 *   query init.progress  →  (strip query)  →  init.progress  →  (dot split)  →  init progress
 */
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const GSD_TOOLS = path.join(__dirname, '..', 'get-shit-done', 'bin', 'gsd-tools.cjs');

function run(...args) {
  return execFileSync(process.execPath, [GSD_TOOLS, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('query meta-command (#167)', () => {
  test('`query init.progress` produces the same output as `init progress`', () => {
    const withQuery = run('query', 'init.progress', '--raw');
    const withoutQuery = run('init', 'progress', '--raw');
    assert.equal(withQuery, withoutQuery);
  });

  test('`query` with dotted form expands correctly', () => {
    const result = run('query', 'init.progress', '--raw');
    assert.ok(result.length > 0, 'should produce non-empty output');
    const parsed = JSON.parse(result);
    assert.ok('executor_model' in parsed, 'init.progress should return config with executor_model');
  });
});
