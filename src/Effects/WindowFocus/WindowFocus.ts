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
    shortTermUnfocusEffectFilter: 'blur(0.35px) grayscale(25%)',
    shortTermUnfocusEffectTransitionDuration: 0.618,
    longTermUnfocusEffectFilter: 'blur(1.5px) grayscale(75%) brightness(95%)',
    longTermUnfocusEffectTransitionDuration: 1,
    windowRefocusEffectTransitionDuration: 1,
};

const vsbloom = window.__VSBLOOM__;
let janitor: Janitor;

let currentUnfocusUUID: string | null = null;
let currentUnfocusClass: string | null = null;
let currentRefocusClass: string | null = null;
let isLongTermUnfocused = false;

function OnWindowBlurred(event: Event) {
    if (document.hasFocus()) {
        //If the window got blurred but we
        //still have focus on the document,
        //we likely clicked into an iframe
        //or similar - regardless this isn't
        //an 'actual' unfocus event!
        return;
    }
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

function OnWindowFocused(event: Event) {
    if (!document.hasFocus()) {
        //If the window got 'focused' but we
        //don't have focus on the document...
        //im not sure what exactly this is,
        //but it's probably not an 'actual' focus event!
        console.debug('OnWindowFocused but hasFocus=false...?', event);
        return;
    }
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

    /* Short-Term -> Long-Term Unfocus Transition Threshold Mutator */
    const lngTmUnfcsThrsMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('longTermUnfocusTransitionThreshold'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'long term unfocus transition threshold changed to ' + changedValue);
            effectConfig.longTermUnfocusTransitionThreshold = (changedValue as number) * 1000;
            if (currentUnfocusUUID) {
                OnWindowFocused(new Event('focus'));
            }
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(lngTmUnfcsThrsMutator));

    /* Effect Filter Mutators */
    const shortTermUnfocusEffectFilterMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('shortTermUnfocusEffectFilter'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'short term unfocus effect filter changed to ' + changedValue);
            effectConfig.shortTermUnfocusEffectFilter = changedValue as string;
            document.documentElement.style.setProperty('--vsbloom-window-short-term-unfocus-filter', effectConfig.shortTermUnfocusEffectFilter);
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(shortTermUnfocusEffectFilterMutator));
    const longTermUnfocusEffectFilterMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('longTermUnfocusEffectFilter'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'long term unfocus effect filter changed to ' + changedValue);
            effectConfig.longTermUnfocusEffectFilter = changedValue as string;
            document.documentElement.style.setProperty('--vsbloom-window-long-term-unfocus-filter', effectConfig.longTermUnfocusEffectFilter);
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(longTermUnfocusEffectFilterMutator));

    /* Effect Transition Duration Mutators */
    const shortTermUnfocusEffectTransitionDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('shortTermUnfocusEffectTransitionDuration'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'short term unfocus effect transition duration changed to ' + changedValue);
            effectConfig.shortTermUnfocusEffectTransitionDuration = changedValue as number;
            document.documentElement.style.setProperty('--vsbloom-window-short-term-unfocus-anim-duration', effectConfig.shortTermUnfocusEffectTransitionDuration + 's');
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(shortTermUnfocusEffectTransitionDurationMutator));
    const longTermUnfocusEffectTransitionDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('longTermUnfocusEffectTransitionDuration'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'long term unfocus effect transition duration changed to ' + changedValue);
            effectConfig.longTermUnfocusEffectTransitionDuration = changedValue as number;
            document.documentElement.style.setProperty('--vsbloom-window-long-term-unfocus-anim-duration', effectConfig.longTermUnfocusEffectTransitionDuration + 's');
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(longTermUnfocusEffectTransitionDurationMutator));

    /* Window Refocus Effect Transition Duration Mutator */
    const windowRefocusEffectTransitionDurationMutator = await bloom.configs.RegisterEffectConfigMutator({
        pathResolver: configResolver.GetPropertyPath('windowRefocusEffectTransitionDuration'),
        internalValueMutator: (changedValue) => {
            vsbloom.Log('debug', 'window refocus effect transition duration changed to ' + changedValue);
            effectConfig.windowRefocusEffectTransitionDuration = changedValue as number;
            document.documentElement.style.setProperty('--vsbloom-window-refocus-anim-duration', effectConfig.windowRefocusEffectTransitionDuration + 's');
        }
    });
    janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(windowRefocusEffectTransitionDurationMutator));
}

export function Stop() {
    janitor.Destroy();
}