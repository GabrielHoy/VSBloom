//does mainly nothing for now just a debug test effect
import type { VSBloomConfigUpdateEvent } from '../../ExtensionBridge/ElectronGlobals';
import type { WatchHandle } from 'bloom';
import bloom from 'bloom';
import gsap from 'gsap';

const cleanupTasks: (() => void)[] = [];

export async function Start() {
    const vsbloom = window.__VSBLOOM__;
    vsbloom.Log('debug', 'Starting Cursor Trails effect');

}

export function Stop() {
    cleanupTasks.forEach(task => task());
    cleanupTasks.length = 0;
}