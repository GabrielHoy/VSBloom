/**
 * Handles managing the CSS classes that are applied to the body
 * element when the window is blurred, left blurred for a long time,
 * and then succinctly refocused.
 */

import bloom from 'bloom';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';

const effectConfig = {
    enabled: true,
    activeLineAnimationDuration: 0.35,
    activeLineOffset: 3,
    activeLineGlowSize: 2.5,
    activeLineSkewAngle: -7.5,
};

const vsbloom = window.__VSBLOOM__;
let janitor: Janitor;

const effectConfigKeyToCSSVar = {
    activeLineAnimationDuration: ['--vsbloom-active-line-animation-duration', 's'],
    activeLineOffset: ['--vsbloom-active-line-number-offset', 'px'],
    activeLineGlowSize: ['--vsbloom-active-line-number-glow-size', 'px'],
    activeLineSkewAngle: ['--vsbloom-active-line-number-skew-angle', 'deg']
};

export async function Start(configResolver: EffectConfigResolver) {
    janitor = new bloom.janitors.Janitor();

    for (const [effectConfigKey, [cssVar, cssVarUnit]] of Object.entries(effectConfigKeyToCSSVar)) {
        const mutator = await bloom.configs.RegisterEffectConfigMutator({
            pathResolver: configResolver.GetPropertyPath(effectConfigKey),
            internalValueMutator: (changedValue, isInit) => {
                if (!isInit) {
                    vsbloom.Log('debug', effectConfigKey + ' changed to ' + changedValue);
                    effectConfig[effectConfigKey as keyof typeof effectConfig] = changedValue as never;
                    document.documentElement.style.setProperty(cssVar, changedValue + cssVarUnit);
                }
            }
        });
        janitor.Add(() => bloom.configs.UnregisterEffectConfigMutator(mutator));
    }
}

export function Stop() {
    janitor.Destroy();
}