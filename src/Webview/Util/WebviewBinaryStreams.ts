/**
 * Provides the Webview with the consumer end of VSBloom's binary data-plane -
 * the high-throughput streams that end up getting sent into the webview using
 * `webview.postMessage`. See {@link src/ExtensionBridge/BinaryTransport.ts}.
 *
 * Frames are fed in from SvelteMounter's `binary-frame` observer. `Listen` for a
 * channel to poll its newest frame, or `Subscribe` to react to arrivals - either
 * way, the hold is what tells the extension host to actually send us the channel.
 * **Release / unsubscribe on teardown**, or this webview keeps a firehose running
 * across the whole of VSBloom's topology for a component that no longer exists.
 *
 * This hub is non-reactive, similar to {@link nonReactiveWebviewSharedState};
 * A reactive `$state` wrapper for a specific channel can be layered on top in a
 * `.svelte.ts` module when a component actually needs live-updating UI...
 */

import { BinaryStreamHub } from '../../ExtensionBridge/BinaryTransport';
import { RegisterBuiltinBinaryChannels } from '../../ExtensionBridge/BinaryChannels';
import { vscode } from './VSCodeAPI';

export const webviewBinaryStreamHub: BinaryStreamHub = new BinaryStreamHub();

// Register channel decoders so relayed frames are decoded once on ingest, before
// fan-out to whatever webview code holds a channel.
RegisterBuiltinBinaryChannels(webviewBinaryStreamHub);

// Frames reach us via `postMessage`, but that only carries data *inward* - the host
// has no way to know this webview wants a channel unless we tell it. Report demand
// edges back upstream so the producer can gate on them.
webviewBinaryStreamHub.SetDemandObserver((channelId, hasDemand) => {
	vscode.PostToExtension({
		type: 'binary-channel-demand',
		data: { channelId, hasDemand },
	});
});
