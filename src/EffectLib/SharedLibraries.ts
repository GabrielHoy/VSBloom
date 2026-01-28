/**
 * VSBloom Shared Libraries Runtime
 * 
 * This file bundles shared libraries (like GSAP) that are used across
 * multiple effects. It is built as an IIFE and injected into workbench.html
 * BEFORE the VSBloom Client, ensuring libraries are available immediately
 * when effects load.
 * 
 * Effects access these libraries via shim files that re-export from
 * window.__VSBLOOM__.libs, allowing clean `import gsap from 'gsap'` syntax.
 */

/// <reference lib="dom" />

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as motion from 'motion';
import bloom from './Bloom/Bloom';

//Initialize __VSBLOOM__ if not present,
//this should always be the case since SharedLibs loads before Client.
if (!(window as any).__VSBLOOM__) {
    (window as any).__VSBLOOM__ = {};
}

gsap.registerPlugin(ScrollTrigger);

//Expose libraries on the global
(window as any).__VSBLOOM__.libs = {
    gsap,
    motion,
    bloom,
};

console.log('[VSBloom]: Successfully Pre-loaded the following Client Effect Libraries:', Object.keys((window as any).__VSBLOOM__.libs));