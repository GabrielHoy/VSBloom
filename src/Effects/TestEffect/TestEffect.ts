//does mainly nothing for now just a debug test effect
import type { VSBloomConfigUpdateEvent } from '../../ExtensionBridge/ElectronGlobals';

window.__VSBLOOM__.SendLog('info', 'Test effect script loaded!');


const cleanupTasks: (() => void)[] = [];

export function Start() {
    const vsbloom = window.__VSBLOOM__;

    const config = vsbloom.extensionConfig;
    if (config) {
        vsbloom.SendLog('debug', 'Current config:', config);
    }

    const container = document.createElement('div');
    cleanupTasks.push(() => { container.remove(); });
    container.id = 'vsbloom-test-effect';
    container.style.position = 'fixed';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '9999';

    function OnConfigUpdated(event: VSBloomConfigUpdateEvent) {
        const { current, previous } = event.detail;
        vsbloom.SendLog('info', 'Configuration updated!', { 
            current, 
            hadPrevious: !!previous 
        });
    }

    window.addEventListener('vsbloom-config-update', OnConfigUpdated);
    cleanupTasks.push(() => { window.removeEventListener('vsbloom-config-update', OnConfigUpdated); });

    function OnMouseMove(event: MouseEvent) {
        const x = event.clientX;
        const y = event.clientY;
    }

    document.addEventListener('mousemove', OnMouseMove);
    cleanupTasks.push(() => { document.removeEventListener('mousemove', OnMouseMove); });

}

export function Stop() {
    cleanupTasks.forEach(task => task());
    cleanupTasks.length = 0;

    window.__VSBLOOM__.SendLog('debug', 'Test effect cleaned up');
}