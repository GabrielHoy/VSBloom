/**
 * Shim for the Bloom library.
 */

/// <reference lib="dom" />

const libs = (window as any).__VSBLOOM__?.libs;

if (!libs?.bloom) {
    throw new Error("[VSBloom]: Bloom library not available, VSBloom's SharedLibraries may not have loaded correctly.");
}

const bloom = libs.bloom;
export default bloom;

export const {
    dom,
    configs,
} = bloom;