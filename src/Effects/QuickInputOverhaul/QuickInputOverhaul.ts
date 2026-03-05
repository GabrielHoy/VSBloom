/**
 * A visual overhaul of the Quick-Input Menu.
 */

import bloom from 'bloom';
import type { EffectConfigResolver } from 'src/EffectLib/Bloom/Configs';
import type { Janitor } from 'src/EffectLib/Bloom/Janitors';
import effectConfigJSON from './QuickInputOverhaul.jsonc';

const [effectConfig, effectConfigKeyToCSSVar] =
	bloom.configs.GetReducedTypeScriptVariablesFromEffectJSON(effectConfigJSON);
// const vsbloom = window.__VSBLOOM__;
let janitor: Janitor;

export async function Start(configResolver: EffectConfigResolver) {
	janitor = new bloom.janitors.Janitor();

	await bloom.configs.SetupEffectConfigMutatorsForEffectConfigChanges(
		effectConfig,
		effectConfigKeyToCSSVar,
		configResolver,
		janitor,
	);
}

export function Stop() {
	janitor.Destroy();
}
