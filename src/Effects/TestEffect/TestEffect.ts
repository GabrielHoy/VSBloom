//does mainly nothing for now just a debug test effect
import type { VSBloomConfigUpdateEvent } from '../../ExtensionBridge/ElectronGlobals';
import type { WatchHandle } from 'bloom';
import gsap from 'gsap';
import bloom from 'bloom';

window.__VSBLOOM__.Log('info', 'Test effect script loaded!');

const cleanupTasks: (() => void)[] = [];
const watchers: WatchHandle[] = [];

export async function Start() {
    const vsbloom = window.__VSBLOOM__;
    vsbloom.Log('debug', 'Test effect script Start() called');

    const config = vsbloom.extensionConfig;
    if (config) {
        vsbloom.Log('debug', 'Current config:', config);
    }

    //wait for the workbench to be ready before doing anything
    const workbench = await bloom.waitFor('.monaco-workbench');
    vsbloom.Log('debug', 'Workbench ready:', workbench.className);

    //watch for new editor tabs and animate them
    const tabWatcher = bloom.watchContainer('.tabs-container', {
        onChildAdded: (tab: Element) => {
            vsbloom.Log('debug', 'New tab added for animation:', tab.className);
            //animate new tabs sliding in with gsap
            gsap.fromTo(tab, 
                { opacity: 0, y: -8 },
                { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' }
            );
        },
        onContainerRecreated: () => {
            vsbloom.Log('debug', 'Tabs container was recreated');
        },
        processExisting: false, //don't animate tabs that already exist
    });
    
    watchers.push(tabWatcher);

    //watch for sidebar items
    const sidebarWatcher = bloom.watchElements('.monaco-list-row', {
        within: '.sidebar',
        onAdded: (row: Element) => {
            //subtle fade-in for new sidebar items
            gsap.fromTo(row, { opacity: 0.5 }, { opacity: 1, duration: 0.15 });
        },
        processExisting: false, //only new items are processed
    });
    
    watchers.push(sidebarWatcher);

    //config update listener for the actual extension cfg
    function OnConfigUpdated(event: VSBloomConfigUpdateEvent) {
        const { current, previous } = event.detail;
        vsbloom.Log('info', 'Configuration updated!', { 
            current, 
            hadPrevious: !!previous
        });
    }

    window.addEventListener('vsbloom-config-update', OnConfigUpdated);
    cleanupTasks.push(() => { 
        window.removeEventListener('vsbloom-config-update', OnConfigUpdated); 
    });
}

export function Stop() {
    //stop all DOM watchers
    watchers.forEach(watcher => watcher.stop());
    watchers.length = 0;

    //run other cleanup tasks
    cleanupTasks.forEach(task => task());
    cleanupTasks.length = 0;

    window.__VSBLOOM__.Log('debug', 'Test effect cleaned up');
}