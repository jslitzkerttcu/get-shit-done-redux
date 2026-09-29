'use strict';

/**
 * milestone-explicit-null.test.cjs
 *
 * Regression coverage for #5038: `milestone: null` in STATE.md's frontmatter
 * is YAML null, not the four-character string "null". Two defects, both
 * confirmed by a maintainer (`trek-e`) against the shipped generated module:
 *
 *   1. `getMilestoneInfo` (src/roadmap-parser.cts) read the raw `milestone:`
 *      line with a regex and never normalized the literal text "null" to a
 *      real JS null, so an explicit `milestone: null` was treated as a real
 *      asserted milestone version matching no ROADMAP heading — producing a
 *      spurious "asserted ... matches no ROADMAP heading" warning.
 *   2. Fixing (1) in isolation makes the asserted-milestone-version value
 *      collapse to the SAME `null` that a STATE.md never mentioning
 *      `milestone:` at all already produces — but those two cases are not
 *      the same. A sectioned ROADMAP (milestone headings exist) has no way
 *      to know which section's phases an explicit "no milestone right now"
 *      should report, so the progress counters must still be withheld
 *      exactly like the existing asserted-but-unbound case (#3354/#4094) —
 *      just without that case's warning, since an explicit null is a
 *      deliberate assertion, not an error.
 *
 * All four cases drive the real CLI (`state json --raw`, via
 * `runGsdTools`/`runNode`) rather than calling `getMilestoneInfo` or
 * `buildStateFrontmatter` directly, per this repo's gate-verdict-altitude
 * testing convention. Fixtures below are original to this test (not lifted
 * from the issue's own diagnosis text, per the #2371 fixture-provenance
 * rule) — a two-section roadmap over unrelated subsystem names, distinct
 * sentinel progress counters chosen to differ from every value a recompute
 * could produce.
 */

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createTempProject, cleanup, TOOLS_PATH, TEST_ENV_BASE } = require('./helpers.cjs');
const { runNode } = require('./helpers/process-seam.cjs');
const { PROBE_TIMEOUT_MS } = require('./helpers/timeouts.cjs');

// A sectioned ROADMAP — two milestone headings, each owning its own phases.
// v0.4 is fully realized on disk; v0.5 is not asserted by any STATE.md fixture
// below, so it plays no role except making the document genuinely sectioned.
const SECTIONED_ROADMAP = [
  '# Widget Factory Roadmap',
  '',
  '## v0.4 — Conveyor',
  '### Phase 1: Belt Alignment',
  '### Phase 2: Motor Calibration',
  '',
  '## v0.5 — Packaging',
  '### Phase 3: Box Folding',
  '### Phase 4: Label Printing',
  '',
].join('\n');

// A flat ROADMAP — Phase headings only, no milestone sectioning at all.
const FLAT_ROADMAP = [
  '# Widget Factory Roadmap',
  '',
  '### Phase 1: Belt Alignment',
  '### Phase 2: Motor Calibration',
  '### Phase 3: Box Folding',
  '',
].join('\n');

// Sentinel stored counters for the WITHHOLD cases (1 and 3) — deliberately
// not equal to any value a whole-document count, a section count, or an
// on-disk phase-dir count for the sectioned fixture could produce, so a
// substituted value is unambiguous.
const STORED_TOTAL_PHASES = 41;
const STORED_COMPLETED_PHASES = 9;
const STORED_TOTAL_PLANS = 17;
const STORED_COMPLETED_PLANS = 5;

// Stored counters for the NOT-withheld cases (2 and 4) — deliberately at or
// below whatever the fresh scan will derive, so the pre-existing "preserve
// existing progress" ratchet (state-document.cts shouldPreserveExistingProgress,
// #3242 Bug A — ratchets completed_phases/completed_plans upward and is
// unrelated to this issue) cannot mask whether the withhold fired.
const LOW_STORED_TOTAL_PHASES = 1;
const LOW_STORED_COMPLETED_PHASES = 0;
const LOW_STORED_TOTAL_PLANS = 0;
const LOW_STORED_COMPLETED_PLANS = 0;

function writeRoadmap(tmpDir, content) {
  fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), content);
}

function seedPhaseDir(tmpDir, dirName) {
  const dir = path.join(tmpDir, '.planning', 'phases', dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '01-PLAN.md'), '# Plan\n');
}

/**
 * `milestoneLine` is inserted verbatim as the frontmatter's `milestone:`
 * value line, or omitted entirely when `null` (the baseline-sanity case).
 * `stored` supplies the four progress counters to seed into frontmatter.
 */
function writeStateMd(tmpDir, { milestoneLine, stored }) {
  const lines = [
    '---',
    'gsd_state_version: 1.0',
    ...(milestoneLine !== null ? [`milestone: ${milestoneLine}`] : []),
    'current_phase: "01"',
    'status: executing',
    'progress:',
    `  total_phases: ${stored.totalPhases}`,
    `  completed_phases: ${stored.completedPhases}`,
    `  total_plans: ${stored.totalPlans}`,
    `  completed_plans: ${stored.completedPlans}`,
    '  percent: 22',
    '---',
    '',
    '# GSD State',
    '',
    '## Current Position',
    '',
    '**Current Phase:** 01',
    '**Status:** Executing',
    '',
  ];
  fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), lines.join('\n'));
}

/** Same call, but over the process seam directly so stderr is observable —
 * `runGsdTools` discards stderr on a successful (exit 0) run. */
function stateJsonRawWithStderr(tmpDir) {
  const rec = runNode(
    [TOOLS_PATH, 'state', 'json', '--raw'],
    { cwd: tmpDir, env: { ...process.env, ...TEST_ENV_BASE }, timeoutMs: PROBE_TIMEOUT_MS },
  );
  assert.equal(rec.exitCode, 0, `state json --raw failed: ${rec.stderr}`);
  return { parsed: JSON.parse(rec.stdout), stderr: rec.stderr || '' };
}

describe('#5038 explicit `milestone: null` — no false warning, counters withheld under sectioning', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempProject();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  test('case 1: sectioned ROADMAP + explicit null — no warning, counters withheld at stored values', () => {
    writeRoadmap(tmpDir, SECTIONED_ROADMAP);
    writeStateMd(tmpDir, {
      milestoneLine: 'null',
      stored: {
        totalPhases: STORED_TOTAL_PHASES,
        completedPhases: STORED_COMPLETED_PHASES,
        totalPlans: STORED_TOTAL_PLANS,
        completedPlans: STORED_COMPLETED_PLANS,
      },
    });
    seedPhaseDir(tmpDir, '01-belt-alignment');
    seedPhaseDir(tmpDir, '02-motor-calibration');

    const { parsed, stderr } = stateJsonRawWithStderr(tmpDir);

    assert.ok(
      !stderr.includes('matches no ROADMAP heading'),
      `explicit \`milestone: null\` must never produce the asserted-but-unbound warning; got stderr=${JSON.stringify(stderr)}`,
    );
    assert.strictEqual(parsed.progress.total_phases, STORED_TOTAL_PHASES,
      `total_phases must stay at its stored value (withheld), not be recomputed from the whole document or disk. Got ${parsed.progress.total_phases}`);
    assert.strictEqual(parsed.progress.completed_phases, STORED_COMPLETED_PHASES,
      `completed_phases must stay at its stored value (withheld). Got ${parsed.progress.completed_phases}`);
    assert.strictEqual(parsed.progress.total_plans, STORED_TOTAL_PLANS,
      `total_plans must stay at its stored value (withheld). Got ${parsed.progress.total_plans}`);
    assert.strictEqual(parsed.progress.completed_plans, STORED_COMPLETED_PLANS,
      `completed_plans must stay at its stored value (withheld). Got ${parsed.progress.completed_plans}`);
  });

  test('case 2: flat ROADMAP + explicit null — whole-document count still used (pre-existing behavior unaffected)', () => {
    writeRoadmap(tmpDir, FLAT_ROADMAP);
    writeStateMd(tmpDir, {
      milestoneLine: 'null',
      stored: {
        totalPhases: LOW_STORED_TOTAL_PHASES,
        completedPhases: LOW_STORED_COMPLETED_PHASES,
        totalPlans: LOW_STORED_TOTAL_PLANS,
        completedPlans: LOW_STORED_COMPLETED_PLANS,
      },
    });
    seedPhaseDir(tmpDir, '01-belt-alignment');

    const { parsed, stderr } = stateJsonRawWithStderr(tmpDir);

    assert.ok(
      !stderr.includes('matches no ROADMAP heading'),
      `flat roadmap + explicit null must never warn; got stderr=${JSON.stringify(stderr)}`,
    );
    assert.strictEqual(parsed.progress.total_phases, 3,
      `a flat (unsectioned) roadmap has nothing to conflate — total_phases must be the whole-document heading count (3), not the withheld stored sentinel (${LOW_STORED_TOTAL_PHASES}) or the disk count (1). Got ${parsed.progress.total_phases}`);
  });

  test('case 3 (negative control): a real unbound version still warns AND withholds', () => {
    writeRoadmap(tmpDir, SECTIONED_ROADMAP);
    writeStateMd(tmpDir, {
      milestoneLine: 'v9.9',
      stored: {
        totalPhases: STORED_TOTAL_PHASES,
        completedPhases: STORED_COMPLETED_PHASES,
        totalPlans: STORED_TOTAL_PLANS,
        completedPlans: STORED_COMPLETED_PLANS,
      },
    });
    seedPhaseDir(tmpDir, '01-belt-alignment');
    seedPhaseDir(tmpDir, '02-motor-calibration');

    const { parsed, stderr } = stateJsonRawWithStderr(tmpDir);

    assert.ok(
      stderr.includes('matches no ROADMAP heading') && stderr.includes('v9.9'),
      `a genuinely asserted-but-unbound version must still produce the #3354/#3642 warning naming it; got stderr=${JSON.stringify(stderr)}`,
    );
    assert.strictEqual(parsed.progress.total_phases, STORED_TOTAL_PHASES,
      `an unbound real version must still withhold at the stored value, exactly as before this fix. Got ${parsed.progress.total_phases}`);
    assert.strictEqual(parsed.progress.completed_phases, STORED_COMPLETED_PHASES,
      `completed_phases must still withhold. Got ${parsed.progress.completed_phases}`);
  });

  test('case 4 (baseline sanity): no `milestone:` key at all, flat ROADMAP — untouched', () => {
    writeRoadmap(tmpDir, FLAT_ROADMAP);
    writeStateMd(tmpDir, {
      milestoneLine: null,
      stored: {
        totalPhases: LOW_STORED_TOTAL_PHASES,
        completedPhases: LOW_STORED_COMPLETED_PHASES,
        totalPlans: LOW_STORED_TOTAL_PLANS,
        completedPlans: LOW_STORED_COMPLETED_PLANS,
      },
    });
    seedPhaseDir(tmpDir, '01-belt-alignment');

    const { parsed, stderr } = stateJsonRawWithStderr(tmpDir);

    assert.ok(
      !stderr.includes('matches no ROADMAP heading'),
      `a fresh/pre-milestone project (no \`milestone:\` key) must never warn; got stderr=${JSON.stringify(stderr)}`,
    );
    assert.strictEqual(parsed.progress.total_phases, 3,
      `a fresh project with a flat roadmap must use the whole-document heading count (3), exactly as before this fix. Got ${parsed.progress.total_phases}`);
  });

  test('case 5 (write path): `state sync` withholds frontmatter counters too, without warning (must not diverge from the read path)', () => {
    // #5038 requirement 4: the write path (`state sync`, via
    // syncStateFrontmatter -> buildStateFrontmatter) must not diverge from
    // the read path (`state json`) exercised above. Runs the real write
    // (not --verify) so the persisted STATE.md frontmatter is what's checked.
    writeRoadmap(tmpDir, SECTIONED_ROADMAP);
    writeStateMd(tmpDir, {
      milestoneLine: 'null',
      stored: {
        totalPhases: STORED_TOTAL_PHASES,
        completedPhases: STORED_COMPLETED_PHASES,
        totalPlans: STORED_TOTAL_PLANS,
        completedPlans: STORED_COMPLETED_PLANS,
      },
    });
    seedPhaseDir(tmpDir, '01-belt-alignment');
    seedPhaseDir(tmpDir, '02-motor-calibration');

    const syncRec = runNode(
      [TOOLS_PATH, 'state', 'sync', '--raw'],
      { cwd: tmpDir, env: { ...process.env, ...TEST_ENV_BASE }, timeoutMs: PROBE_TIMEOUT_MS },
    );
    assert.equal(syncRec.exitCode, 0, `state sync failed: ${syncRec.stderr}`);
    assert.ok(
      !(syncRec.stderr || '').includes('matches no ROADMAP heading'),
      `state sync must never produce the asserted-but-unbound warning for an explicit null; got stderr=${JSON.stringify(syncRec.stderr)}`,
    );

    const { parsed } = stateJsonRawWithStderr(tmpDir);
    assert.strictEqual(parsed.progress.total_phases, STORED_TOTAL_PHASES,
      `state sync must persist the withheld (stored) total_phases, not a recomputed one. Got ${parsed.progress.total_phases}`);
    assert.strictEqual(parsed.progress.completed_phases, STORED_COMPLETED_PHASES,
      `state sync must persist the withheld (stored) completed_phases. Got ${parsed.progress.completed_phases}`);
  });
});
