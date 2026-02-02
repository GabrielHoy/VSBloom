/**
 * PixiJS Initialization Module
 * 
 * This module properly initializes PixiJS for use in VS Code's CSP-restricted
 * environment by applying the unsafe-eval polyfill and math-extras.
 * 
 * The unsafe-eval polyfill is necessary because VS Code's Content Security Policy
 * blocks eval(), which PixiJS normally uses for shader compilation.
 */

/// <reference lib="dom" />

import * as pixi from 'pixi.js';

// Import the modified polyfills (they don't auto-install anymore)
// These add their install functions to window.PIXI (an empty object at this point)
import './unsafe-eval.js';
import './math-extras.js';

// Save the polyfill install functions before we overwrite window.PIXI
const polyfills = (window as any).PIXI;

// Now set window.PIXI to the real PixiJS module
(window as any).PIXI = pixi;

// Call the install functions to apply the polyfill patches to the real PixiJS classes
if (polyfills?.selfInstall) {
    polyfills.selfInstall();
}
if (polyfills?.installMathExtras) {
    polyfills.installMathExtras();
}

// Re-export everything
export default pixi;
export * from 'pixi.js';
