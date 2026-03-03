/**
 * Unused for this effect.
 */

import bloom from 'bloom';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';
import effectConfigJSON from './ExplorerOverhaul.json';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';

const [ effectConfig, effectConfigKeyToCSSVar ] = bloom.configs.GetReducedTypeScriptVariablesFromEffectJSON(effectConfigJSON);
let janitor: Janitor;


export async function Start(configResolver: EffectConfigResolver) {
    janitor = new bloom.janitors.Janitor();
    await bloom.configs.SetupEffectConfigMutatorsForEffectConfigChanges(effectConfig, effectConfigKeyToCSSVar, configResolver, janitor);
}

export function Stop() {
    janitor.Destroy();
}