import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateJavaCompatibility,
  parseJavaMajorRelease,
  validateArtifactId,
  validateLocation,
  validateNonEmpty,
  validateQualifiedName
} from '../../src/project/inputUtils.js';

test('parseJavaMajorRelease handles modern and legacy formats', () => {
  assert.equal(parseJavaMajorRelease('21.0.2'), 21);
  assert.equal(parseJavaMajorRelease('1.8.0_402'), 8);
  assert.equal(parseJavaMajorRelease(''), null);
});

test('evaluateJavaCompatibility rejects old or unreadable versions', () => {
  assert.equal(evaluateJavaCompatibility(17).status, 'ok');
  assert.equal(evaluateJavaCompatibility(8).status, 'unusable');
  assert.equal(evaluateJavaCompatibility(null).status, 'unusable');
});

test('validateArtifactId enforces expected format', () => {
  assert.equal(validateArtifactId('my-app'), null);
  assert.match(validateArtifactId('MyApp'), /Invalid artifactId/);
});

test('validateQualifiedName enforces minimum segments and syntax', () => {
  assert.equal(validateQualifiedName('com.exo', { minSegments: 2 }), null);
  assert.match(validateQualifiedName('com', { minSegments: 2 }), /at least 2 segments/);
  assert.match(validateQualifiedName('com.Exo', { minSegments: 2 }), /is invalid/);
});

test('validateLocation and validateNonEmpty reject invalid values', () => {
  assert.equal(validateNonEmpty('x', 'Name'), null);
  assert.match(validateNonEmpty('   ', 'Name'), /is empty/);
  assert.match(validateLocation(''), /is empty/);
});
