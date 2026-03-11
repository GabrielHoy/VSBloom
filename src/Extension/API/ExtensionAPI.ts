import { EffectManager } from '../../Effects/EffectManager';
import { type DeferredResultConsumer } from './DeferredResults';
import { VSBloomBridgeServer } from '../../ExtensionBridge/Server';

export enum UnpatchedClientState {
    /**
     * The client is simply not patched right now.
     */
    NOT_PATCHED = 'NOT_PATCHED',

    /**
     * The user previously told VSBloom not to keep prompting
     * them about patching the client, so the extension is dormant.
     */
    PATCH_PROMPT_SUPPRESSED = 'PATCH_PROMPT_SUPPRESSED',

    /**
     * The user declined the patch prompt during this activation.
     */
    PATCH_PROMPT_DECLINED = 'PATCH_PROMPT_DECLINED',

    /**
     * The client was patched during this activation, but the window
     * has not yet been reloaded so the patch is not running yet.
     */
    PATCHED_RELOAD_REQUIRED = 'PATCHED_RELOAD_REQUIRED',

    /**
     * The client appears patched, but VSBloom failed to finish
     * bootstrapping its runtime services for this window.
     */
    ACTIVATION_FAILED = 'ACTIVATION_FAILED',
}

export interface UnpatchedExtensionAPI {
    isClientPatched: false;
    unpatchedClientState: UnpatchedClientState;
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