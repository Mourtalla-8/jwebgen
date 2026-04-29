import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateJavaCompatibility,
  parseJavaMajorRelease,
  validateArtifactId,
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
  assert.match(validateArtifactId('MyApp'), /artifactId invalide/);
});

test('validateQualifiedName enforces minimum segments and syntax', () => {
  assert.equal(validateQualifiedName('com.exo', { minSegments: 2 }), null);
  assert.match(validateQualifiedName('com', { minSegments: 2 }), /au moins 2 segments/);
  assert.match(validateQualifiedName('com.Exo', { minSegments: 2 }), /invalide/);
});
