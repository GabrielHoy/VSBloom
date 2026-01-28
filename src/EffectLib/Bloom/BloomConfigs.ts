/**
 * BloomConfigs - Common Utilities for Extension Config Management
 * 
 ** Common usage:
 * ```ts
 *  const mutator = await RegisterEffectConfigMutator({
 *      pathResolver: 'cursorTrail.enabled',
 *      internalValueMutator: (changedValue: boolean) => {
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

import type { VSBloomClientConfig, VSBloomConfigValue } from "../../ExtensionBridge/Bridge";
import { GetEffectConfigValueNoDefault } from "../../ExtensionBridge/Bridge";
import type { VSBloomConfigUpdateEvent } from "../../ExtensionBridge/ElectronGlobals";

export type ExtensionConfigPathResolver = string | ((config: VSBloomClientConfig) => VSBloomConfigValue);
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
    pathResolver: ExtensionConfigPathResolver,
    internalValueMutator: (changedValue: VSBloomConfigValue) => void
}

const internalEffectConfigMutators: Map<EffectConfigMutator, VSBloomConfigValue> = new Map();
function OnExtensionConfigUpdate(event: VSBloomConfigUpdateEvent): void {
    const { current: currentVSCConfig, previous } = event.detail;
    for (const [mutator, currentCfgVal] of internalEffectConfigMutators) {
        const newValue = typeof mutator.pathResolver === 'string' ? GetEffectConfigValueNoDefault(currentVSCConfig, mutator.pathResolver) : mutator.pathResolver(currentVSCConfig);
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
    } else if (isExtensionConfigUpdateEventListenerRegistered && internalEffectConfigMutators.size === 0) {
        //Event listener for extension config update event is registered but there are no internal effect config mutators registered
        //let's unregister the event listener accordingly
        isExtensionConfigUpdateEventListenerRegistered = false;
        window.removeEventListener('vsbloom-config-update', OnExtensionConfigUpdate);
    }
}

export async function RegisterEffectConfigMutator(mutator: EffectConfigMutator): Promise<EffectConfigMutator> {
    // Check if the config is available, otherwise wait for the first vsbloom-config-update event
    let currentExtensionConfig: VSBloomClientConfig | undefined = window.__VSBLOOM__.extensionConfig;

    if (!currentExtensionConfig) {
        // Wait for the first vsbloom-config-update event and extract the config
        currentExtensionConfig = await new Promise<VSBloomClientConfig>((resolve, reject) => {
            function handleEvent(event: Event) {
                try {
                    const customEvent = event as VSBloomConfigUpdateEvent;
                    //unregister the listener we've setup after the first invocation
                    window.removeEventListener("vsbloom-config-update", handleEvent);
                    if (customEvent.detail && customEvent.detail.current) {
                        resolve(customEvent.detail.current);
                    } else {
                        reject(
                            new Error(
                                "Received a vsbloom-config-update event but no config was present in event.detail(?)"
                            )
                        );
                    }
                } catch (e) {
                    reject(e);
                }
            }
            window.addEventListener("vsbloom-config-update", handleEvent);
        });
    }

    const curExtVal = typeof mutator.pathResolver === 'string' ? GetEffectConfigValueNoDefault(currentExtensionConfig, mutator.pathResolver) : mutator.pathResolver(currentExtensionConfig);

    //mutate the internal value of the effect config accordingly
    //so that it's in sync with the current extension config value
    //at the time of value mutator registration
    mutator.internalValueMutator(curExtVal);

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