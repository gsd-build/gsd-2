// GSD — status-guards unit tests

import test from 'node:test';
import assert from 'node:assert/strict';

import { isClosedStatus, isFutureMilestoneStatus } from '../status-guards.ts';

test('isClosedStatus: "complete" returns true', () => {
  assert.equal(isClosedStatus('complete'), true);
});

test('isClosedStatus: "done" returns true', () => {
  assert.equal(isClosedStatus('done'), true);
});

test('isClosedStatus: "skipped" returns true', () => {
  assert.equal(isClosedStatus('skipped'), true);
});

test('isClosedStatus: "closed" returns true', () => {
  assert.equal(isClosedStatus('closed'), true);
});

test('isClosedStatus: "pending" returns false', () => {
  assert.equal(isClosedStatus('pending'), false);
});

test('isClosedStatus: "in_progress" returns false', () => {
  assert.equal(isClosedStatus('in_progress'), false);
});

test('isClosedStatus: "active" returns false', () => {
  assert.equal(isClosedStatus('active'), false);
});

test('isClosedStatus: "" (empty string) returns false', () => {
  assert.equal(isClosedStatus(''), false);
});

test('isFutureMilestoneStatus includes future milestone aliases', () => {
  assert.equal(isFutureMilestoneStatus('pending'), true);
  assert.equal(isFutureMilestoneStatus('queued'), true);
  assert.equal(isFutureMilestoneStatus('planned'), true);
});

test('isFutureMilestoneStatus excludes active and closed milestones', () => {
  assert.equal(isFutureMilestoneStatus('active'), false);
  assert.equal(isFutureMilestoneStatus('complete'), false);
  assert.equal(isFutureMilestoneStatus('parked'), false);
});
