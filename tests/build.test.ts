import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Build Output Integration Tests', () => {
  it('should verify dist directory output contains index.html and JS/CSS assets', () => {
    const distPath = path.resolve('dist');
    const indexPath = path.join(distPath, 'index.html');
    const assetsPath = path.join(distPath, 'assets');

    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(assetsPath)).toBe(true);

    const assetFiles = fs.readdirSync(assetsPath);
    const hasJs = assetFiles.some((file) => file.endsWith('.js'));
    const hasCss = assetFiles.some((file) => file.endsWith('.css'));

    expect(hasJs).toBe(true);
    expect(hasCss).toBe(true);
  });
});
