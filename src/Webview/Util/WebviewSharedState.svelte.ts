/**
 * Provides the Webview with a copy of VSBloom's shared state,
 * see {@link src/ExtensionBridge/SharedState.ts} for more details
 * on what VSBloom's shared state is/what fields it has.
 */

import { defaultVSBloomSharedState, type VSBloomSharedState } from "../../ExtensionBridge/SharedState";
import { RemoteState } from "../../ExtensionBridge/SynchronizedState";
import { vscode } from './VSCodeAPI';

export const nonReactiveWebviewSharedState: RemoteState<VSBloomSharedState> = new RemoteState(defaultVSBloomSharedState);

function RequestNewSharedStateSnapshot() {
    vscode.PostToExtension({
        type: 'request-shared-state-snapshot',
        data: undefined
    });
}

nonReactiveWebviewSharedState.OnDesync(() => RequestNewSharedStateSnapshot());

/**
 * A Svelte-reactive copy of VSBloom's shared state, kept
 * up to date with the latest snapshot of the shared state
 * from the nonReactiveWebviewSharedState variable.
 */
export const sharedState = $state({
    state: nonReactiveWebviewSharedState.state
});
nonReactiveWebviewSharedState.Subscribe(() => {
    sharedState.state = nonReactiveWebviewSharedState.state;
});