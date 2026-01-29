/**
 * PixiJS Initialization Module
 * 
 * This module properly initializes PixiJS for use in VS Code's CSP-restricted
 * environment by applying the unsafe-eval polyfill.
 * 
 * The unsafe-eval polyfill is necessary because VS Code's Content Security Policy
 * blocks eval(), which PixiJS normally uses for shader compilation.
 */

/// <reference lib="dom" />

import * as pixi from 'pixi.js';

//Import the modified unsafe-eval polyfill (doesn't auto-call selfInstall)
//this will add selfInstall and other polyfill functions to window.PIXI - an empty object at this point
import './unsafe-eval.js';

//save the selfInstall function before we overwrite window.PIXI
const unsafeEvalPolyfill = (window as any).PIXI;

//now set window.PIXI to the real PixiJS module
(window as any).PIXI = pixi;

//call selfInstall() to apply the polyfill patches to the real PixiJS classes
if (unsafeEvalPolyfill?.selfInstall) {
    unsafeEvalPolyfill.selfInstall();
}

//re-export everything
export default pixi;
export * from 'pixi.js';
