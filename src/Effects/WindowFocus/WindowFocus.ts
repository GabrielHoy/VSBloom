/**
 * Handles managing the CSS classes that are applied to the body
 * element when the window is blurred, left blurred for a long time,
 * and then succinctly refocused.
 */

import bloom from 'bloom';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';

const effectConfig = {
    longTermUnfocusTransitionThreshold: 10000,
};

const vsbloom = window.__VSBLOOM__;
let janitor: Janitor;

let currentUnfocusUUID: string | null = null;
let currentUnfocusClass: string | null = null;
let currentRefocusClass: string | null = null;
let isLongTermUnfocused = false;

function OnWindowBlurred() {
    const myUnfocusEvent = crypto.randomUUID();
    currentUnfocusUUID = myUnfocusEvent;

    document.body.classList.add('vsbloom-short-term-unfocused');
    currentUnfocusClass = 'vsbloom-short-term-unfocused';
    // wait for long focus too
    setTimeout(() => {
        if (currentUnfocusUUID === myUnfocusEvent) {
            isLongTermUnfocused = true;
            document.body.classList.add('vsbloom-long-term-unfocused');
            document.body.classList.remove('vsbloom-short-term-unfocused');
            currentUnfocusClass = 'vsbloom-long-term-unfocused';
        }
    }, effectConfig.longTermUnfocusTransitionThreshold);
    //if we were previously 'refocused', remove it
    //so the unfocus class can take over
    if (currentRefocusClass) {
        document.body.classList.remove(currentRefocusClass);
        currentRefocusClass = null;
    }
}

function OnWindowFocused() {
    if (currentUnfocusUUID) {
        currentUnfocusUUID = null;
        if (isLongTermUnfocused) {
            currentRefocusClass = 'vsbloom-long-term-refocus';
            document.body.classList.add('vsbloom-long-term-refocus');
            document.body.classList.remove('vsbloom-long-term-unfocused');
            currentUnfocusClass = null;
            isLongTermUnfocused = false;
        } else {
            currentRefocusClass = 'vsbloom-short-term-refocus';
            document.body.classList.add('vsbloom-short-term-refocus');
            document.body.classList.remove('vsbloom-short-term-unfocused');
            currentUnfocusClass = null;
        }
    }
}

/**
 * Used to remove all focus effects and get the name of
 * any current "refocus class" - i.e the short-term vs
 * long-term class name, if for one wished to reapply whatever
 * class name it was previously after this function for some reason
 */
function RemoveFocusEffectsAndGetCurrentFocusClasses(): [string | null, string | null] {
    const storedRefocusClass = currentRefocusClass;
    const storedUnfocusClass = currentUnfocusClass;
    if (document && document.body) {
        if (storedRefocusClass) {
            document.body.classList.remove(storedRefocusClass);
        }
        if (storedUnfocusClass) {
            document.body.classList.remove(storedUnfocusClass);
        }
    }

    currentRefocusClass = null;
    currentUnfocusClass = null;
    return [storedRefocusClass, storedUnfocusClass];
}

export async function Start(configResolver: EffectConfigResolver) {
    janitor = new bloom.janitors.Janitor();

    //trigger focus/unfocus callbacks when electron window loses/gains focus
    window.addEventListener('blur', OnWindowBlurred);
    window.addEventListener('focus', OnWindowFocused);
    janitor.Add(() => {
        window.removeEventListener('blur', OnWindowBlurred);
        window.removeEventListener('focus', OnWindowFocused);
        RemoveFocusEffectsAndGetCurrentFocusClasses();
    });

    //react to our config changing
    const lngTmUnfcsThrsMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('longTermUnfocusTransitionThreshold'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'long term unfocus transition threshold changed to ' + changedValue);
            effectConfig.longTermUnfocusTransitionThreshold = (changedValue as number) * 1000;
            if (currentUnfocusUUID) {
                OnWindowFocused();
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(lngTmUnfcsThrsMutator));
}

export function Stop() {
    janitor.Destroy();
}