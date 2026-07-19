import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('UI Style Design Compliance Tests', () => {
  it('should position the toast-container in the top-left corner to prevent blocking active elements', () => {
    const cssPath = path.resolve('src/style.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Extract CSS rules inside .toast-container { ... }
    const match = cssContent.match(/\.toast-container\s*\{([^}]+)\}/);
    expect(match).not.toBeNull();

    const rules = match![1];

    // Expect top-left positioning rules
    expect(rules).toContain('left: 20px');
    expect(rules).not.toContain('left: 50%');
    expect(rules).not.toContain('translateX(-50%)');
  });
});
