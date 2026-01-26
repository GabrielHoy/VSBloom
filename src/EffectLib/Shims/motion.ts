/**
 * Motion Shim for VSBloom Effects
 * 
 * This file acts as a shim that re-exports Motion from the pre-loaded
 * shared libraries on window.__VSBLOOM__.libs. Effects import from
 * 'motion' normally, and esbuild aliases resolve to this shim at build time.
 * 
 * This little 'hack' allows for idiomatic usage of Motion in
 * effects, i.e. `import { animate } from 'motion';`
 */

/// <reference lib="dom" />

const libs = (window as any).__VSBLOOM__?.libs;

if (!libs?.motion) {
    throw new Error("[VSBloom]: Motion was not available, VSBloom's SharedLibraries may not have loaded correctly.");
}

export const {
    animate,
    timeline,
    stagger,
    spring,
    scroll,
    inView,
    scrollInfo,
    createScopedAnimate,
    distance,
    distance2D,
} = libs.motion;

export const motion = libs.motion;

//re-export types for TypeScript support
export type * from 'motion';