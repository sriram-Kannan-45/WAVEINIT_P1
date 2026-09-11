'use strict';
const path = require('path');
const { getUploadsRoot, resolveUploadsPath } = require('../src/config/paths');

describe('resolveUploadsPath', () => {
  const root = path.resolve(getUploadsRoot());

  test('maps /uploads/... web URLs under the shared uploads root', () => {
    const resolved = resolveUploadsPath('/uploads/materials/1788603215327-SRIRAM_TEMPORARY_PROVISIONAL.pdf');
    expect(resolved).toBe(path.join(root, 'materials', '1788603215327-SRIRAM_TEMPORARY_PROVISIONAL.pdf'));
  });

  test('maps leading-slash-less uploads/... references under the uploads root', () => {
    const resolved = resolveUploadsPath('uploads/notes/note-1.txt');
    expect(resolved).toBe(path.join(root, 'notes', 'note-1.txt'));
  });

  test('returns OS-absolute filesystem paths unchanged', () => {
    const absolute = path.join(root, 'somewhere', 'file.pdf');
    expect(resolveUploadsPath(absolute)).toBe(absolute);
  });

  test('handles null/undefined without crashing', () => {
    expect(resolveUploadsPath(null)).toBeNull();
    expect(resolveUploadsPath(undefined)).toBeUndefined();
  });
});