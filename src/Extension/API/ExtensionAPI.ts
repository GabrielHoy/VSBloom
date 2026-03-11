import { EffectManager } from '../../Effects/EffectManager';
import { type DeferredResultConsumer } from './DeferredResults';
import { VSBloomBridgeServer } from '../../ExtensionBridge/Server';

export interface UnpatchedExtensionAPI {
    isClientPatched: false;
}

export interface PatchedExtensionAPI {
    isClientPatched: true;

    GetEffectManager: () => EffectManager;
    GetBridgeServer: () => VSBloomBridgeServer;
}

export type ExtensionAPI = UnpatchedExtensionAPI | PatchedExtensionAPI;
export type ExtensionAPIProviderPromise = DeferredResultConsumer<ExtensionAPI>;

/**
 * Public extension exports forwarded by VS Code to consumer extensions.
 *
 * This wrapper must remain a plain object rather than a Thenable itself,
 * otherwise VS Code will await it during activation and block on the
 * deferred API result instead of forwarding it as the extension export.
 */
export interface VSBloomExtensionExports {
    extensionAPI: ExtensionAPIProviderPromise;
}