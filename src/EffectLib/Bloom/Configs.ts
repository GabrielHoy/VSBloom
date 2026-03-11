/**
 * BloomConfigs - Common Utilities for Extension Config Management
 *
 ** Common usage:
 * ```ts
 *  const mutator = await RegisterEffectConfigMutator({
 *      pathResolver: 'cursorTrail.enabled',
 *      internalValueMutator: (changedValue: boolean, isInitialRegistration: boolean) => {
 *          MUTATE_SOME_INTERNAL_MAGIC_NUMBER = changedValue;
 *      }
 *  });
 *
 **  <...later on when the mutator is no longer needed...>
 *  UnregisterEffectConfigMutator(mutator);
 *
 * ```
 */

/// <reference lib="dom" />

import type { VSBloomClientConfig, VSBloomConfigValue } from '../../ExtensionBridge/API';
import {
	GetEffectConfigValueNoDefault,
	GetInternalPathForEffectProperty,
} from '../../ExtensionBridge/API';
import type { VSBloomConfigUpdateEvent } from '../../ExtensionBridge/ElectronGlobals';
import type { Janitor } from './Janitors';

export type ExtensionConfigPathResolver =
	| string
	| ((config: VSBloomClientConfig) => VSBloomConfigValue);
/**
 * A function that mutates the internal value of an effect
 * based on the extension configuration value
 *
 * pathResolver defines a function that, given the extension configuration,
 * returns the correct configuration value to use for that effect config.
 *
 * internalValueMutator defines a function that, given a configuration value
 * which is newer(and different) than the previous extension config value,
 * mutates the internal value of the effect's configuration/constants/etc
 * accordingly.
 */
export type EffectConfigMutator = {
	pathResolver: ExtensionConfigPathResolver;
	internalValueMutator: (changedValue: VSBloomConfigValue, initial?: boolean) => void;
};

export type EffectConfigJSON = {
	effectDisplayName: string;
	cssVarPrefix?: string;
	configurableProperties: {
		name: string;
		default: unknown;
		cssUnit?: string;
	}[];
};

export type CSSVariableData = {
	cssVarName: string;
	cssVarUnit: string;
};

export type ReducedEffectConfigVariableRecord = Record<
	EffectConfigJSON['configurableProperties'][number]['name'],
	EffectConfigJSON['configurableProperties'][number]['default']
>;
export type ReducedEffectConfigKeyToCSSVariableDataRecord = Record<
	EffectConfigJSON['configurableProperties'][number]['name'],
	CSSVariableData
>;

const internalEffectConfigMutators: Map<EffectConfigMutator, VSBloomConfigValue> = new Map();
function OnExtensionConfigUpdate(event: VSBloomConfigUpdateEvent): void {
	const { current } = event.detail;
	for (const [mutator, currentCfgVal] of internalEffectConfigMutators) {
		const newValue =
			typeof mutator.pathResolver === 'string'
				? GetEffectConfigValueNoDefault(current, mutator.pathResolver)
				: mutator.pathResolver(current);
		if (newValue !== currentCfgVal) {
			mutator.internalValueMutator(newValue);
			internalEffectConfigMutators.set(mutator, newValue);
		}
	}
}

//Called when an internal effect config mutator is set
//or removed from the internalEffectConfigMutators set
let isExtensionConfigUpdateEventListenerRegistered = false;
function OnInternalEffectConfigMutatorSetUpdate() {
	if (!isExtensionConfigUpdateEventListenerRegistered && internalEffectConfigMutators.size > 0) {
		//Event listener for extension config update event is not registered yet
		//but there are internal effect config mutators registered
		//let's register the event listener accordingly
		isExtensionConfigUpdateEventListenerRegistered = true;
		window.addEventListener('vsbloom-config-update', OnExtensionConfigUpdate);
	} else if (
		isExtensionConfigUpdateEventListenerRegistered &&
		internalEffectConfigMutators.size === 0
	) {
		//Event listener for extension config update event is registered but there are no internal effect config mutators registered
		//let's unregister the event listener accordingly
		isExtensionConfigUpdateEventListenerRegistered = false;
		window.removeEventListener('vsbloom-config-update', OnExtensionConfigUpdate);
	}
}

export async function RegisterEffectConfigMutator(
	mutator: EffectConfigMutator,
): Promise<EffectConfigMutator> {
	// Check if the config is available, otherwise wait for the first vsbloom-config-update event
	let currentExtensionConfig: VSBloomClientConfig | undefined =
		window.__VSBLOOM__.extensionConfig;

	if (!currentExtensionConfig) {
		// Wait for the first vsbloom-config-update event and extract the config
		currentExtensionConfig = await new Promise<VSBloomClientConfig>((resolve, reject) => {
			function handleEvent(event: Event) {
				try {
					const customEvent = event as VSBloomConfigUpdateEvent;
					//unregister the listener we've setup after the first invocation
					window.removeEventListener('vsbloom-config-update', handleEvent);
					if (customEvent.detail?.current) {
						resolve(customEvent.detail.current);
					} else {
						reject(
							new Error(
								'Received a vsbloom-config-update event but no config was present in event.detail(?)',
							),
						);
					}
				} catch (e) {
					reject(e);
				}
			}
			window.addEventListener('vsbloom-config-update', handleEvent);
		});
	}

	const curExtVal =
		typeof mutator.pathResolver === 'string'
			? GetEffectConfigValueNoDefault(currentExtensionConfig, mutator.pathResolver)
			: mutator.pathResolver(currentExtensionConfig);

	//mutate the internal value of the effect config accordingly
	//so that it's in sync with the current extension config value
	//at the time of value mutator registration
	mutator.internalValueMutator(curExtVal, true);

	//add the mutator to the internalEffectConfigMutators map
	//so that we can track its state and mutate the internal
	//value of the effect config accordingly when the extension
	//config updates
	internalEffectConfigMutators.set(mutator, curExtVal);

	OnInternalEffectConfigMutatorSetUpdate();

	return mutator;
}

export function UnregisterEffectConfigMutator(mutator: EffectConfigMutator): void {
	if (!internalEffectConfigMutators.has(mutator)) {
		throw new Error('Cannot unregister an effect config mutator that is not registered');
	}

	//remove the mutator from the internalEffectConfigMutators map
	internalEffectConfigMutators.delete(mutator);
	OnInternalEffectConfigMutatorSetUpdate();
}

export class EffectConfigResolver {
	private effectDisplayName: string;

	constructor(effectDisplayName: string) {
		this.effectDisplayName = effectDisplayName;
	}

	public GetPropertyPath(propName: string): string {
		return GetInternalPathForEffectProperty(this.effectDisplayName, propName);
	}
}

export function EffectConfigVariableReducer(
	cfgVars: ReducedEffectConfigVariableRecord,
	property: EffectConfigJSON['configurableProperties'][number],
) {
	cfgVars[property.name as keyof typeof cfgVars] = property.default;

	return cfgVars;
}

export function GetReducedEffectConfigJSONToConfigKeyToCSSVariables(
	effectCfgJSON: EffectConfigJSON,
) {
	return effectCfgJSON.configurableProperties.reduce(
		(
			cfgVars: ReducedEffectConfigKeyToCSSVariableDataRecord,
			property: EffectConfigJSON['configurableProperties'][number],
		) => {
			if (
				!('cssUnit' in property) ||
				!property.cssUnit ||
				typeof property.cssUnit !== 'string'
			) {
				return cfgVars;
			}
			if (
				!('cssVarPrefix' in effectCfgJSON) ||
				!effectCfgJSON.cssVarPrefix ||
				typeof effectCfgJSON.cssVarPrefix !== 'string'
			) {
				throw new Error(
					`The effect config JSON for effect display name "${(effectCfgJSON as unknown as { effectDisplayName: string }).effectDisplayName}" has no "cssVarPrefix" field, but has a property named ${property.name} which defines a "cssUnit" field to facilitate automatic forwarding of the VS Code extension config value into a CSS variable. If you define "cssUnit" variables for an effect property, you *must* also define a "cssVarPrefix" field in the effect config JSON - even if it is an empty string.`,
				);
			}

			cfgVars[property.name as keyof typeof cfgVars] = {
				cssVarName: `--vsbloom-${(effectCfgJSON.cssVarPrefix.length > 0 ? `${effectCfgJSON.cssVarPrefix}-` : '') + property.name.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
				cssVarUnit: property.cssUnit,
			};

			return cfgVars;
		},
		{} as ReducedEffectConfigKeyToCSSVariableDataRecord,
	);
}

export function GetReducedTypeScriptVariablesFromEffectJSON(
	effectCfgJSON: EffectConfigJSON,
): [ReducedEffectConfigVariableRecord, ReducedEffectConfigKeyToCSSVariableDataRecord] {
	return [
		effectCfgJSON.configurableProperties.reduce(
			EffectConfigVariableReducer,
			{} as ReducedEffectConfigVariableRecord,
		),
		GetReducedEffectConfigJSONToConfigKeyToCSSVariables(effectCfgJSON),
	];
}

/**
 *
 * This function is used to setup effect config mutators for the effect config variables that are to be mutated when the effect config changes.
 * It is used to forward the effect config values to the CSS variables defined in the effect config JSON as well.
 *
 * @param effectConfig - A record of the effect config variables that are to be mutated when the effect config changes
 * @param effectConfigKeyToCSSVar - A record of the effect config keys to CSS variable data to which the effect config values are to be forwarded
 * @param configResolver - The effect config resolver object passed to the effect's Start function
 * @param janitor - The janitor to which the effect config mutators are to be added, to faciliate cleanup of the mutators when the effect is stopped
 *
 * @returns A promise that resolves when the effect config mutators are fully setup
 */
export async function SetupEffectConfigMutatorsForEffectConfigChanges(
	effectConfig: ReducedEffectConfigVariableRecord,
	effectConfigKeyToCSSVar: ReducedEffectConfigKeyToCSSVariableDataRecord,
	configResolver: EffectConfigResolver,
	janitor: Janitor,
) {
	for (const [propName, _defaultPropVal] of Object.entries(effectConfig)) {
		const doesPropHaveCSSVarData = effectConfigKeyToCSSVar[propName] !== undefined;
		const { cssVarName, cssVarUnit } = doesPropHaveCSSVarData
			? effectConfigKeyToCSSVar[propName]
			: {};

		const mutator = await RegisterEffectConfigMutator({
			pathResolver: configResolver.GetPropertyPath(propName),
			internalValueMutator: (changedValue, isInit) => {
				effectConfig[propName as keyof typeof effectConfig] = changedValue;

				if (doesPropHaveCSSVarData) {
					document.documentElement.style.setProperty(
						// biome-ignore lint/style/noNonNullAssertion: <These are inherently checked to exist via the doesPropHaveCSSVarData check above>
						cssVarName!,
						// biome-ignore lint/style/noNonNullAssertion: <These are inherently checked to exist via the doesPropHaveCSSVarData check above>
						changedValue + cssVarUnit!,
					);
				}

				if (!isInit) {
					window.__VSBLOOM__.Log('debug', `${propName} changed to ${changedValue}`);
				}
			},
		});
		janitor.Add(() => UnregisterEffectConfigMutator(mutator));
	}
}
