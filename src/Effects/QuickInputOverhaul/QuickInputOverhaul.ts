/**
 * A visual overhaul of the Quick-Input Menu.
 */

import bloom from 'bloom';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import { type EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';
import effectConfigJSON from './QuickInputOverhaul.json';

const [ effectConfig, effectConfigKeyToCSSVar ] = bloom.configs.GetReducedTypeScriptVariablesFromEffectJSON(effectConfigJSON);
const vsbloom = window.__VSBLOOM__;
let janitor: Janitor;


export async function Start(configResolver: EffectConfigResolver) {
    janitor = new bloom.janitors.Janitor();

    await bloom.configs.SetupEffectConfigMutatorsForEffectConfigChanges(effectConfig, effectConfigKeyToCSSVar, configResolver, janitor);
}

export function Stop() {
    janitor.Destroy();
}