/**
 * Shim for BloomDOM library.
 * 
 * Allows effects to use clean import syntax:
 *   import bloom from 'bloom';
 *   import { waitFor, watch } from 'bloom';
 * 
 * The actual library is pre-loaded via SharedLibraries.ts and exposed
 * on window.__VSBLOOM__.libs.bloom
 */

/// <reference lib="dom" />

const libs = (window as any).__VSBLOOM__?.libs;

if (!libs?.bloom) {
    throw new Error("[VSBloom]: BloomDOM library not available. SharedLibraries may not have loaded correctly.");
}

// Re-export the bloom object as default
const bloom = libs.bloom;
export default bloom;

// Re-export all named exports
export const {
    waitFor,
    waitForOptional,
    watch
} = bloom;

// Re-export types from the actual module
export type {
    CleanupFn,
    WaitForOptions,
    WatchHandle,
    WatchConfig,
} from '../BloomDOM';
