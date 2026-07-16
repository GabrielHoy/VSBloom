/**
 * Provides the Webview with the consumer end of VSBloom's binary data-plane -
 * the high-throughput streams that end up getting sent into the webview using
 * `webview.postMessage`. See {@link src/ExtensionBridge/BinaryTransport.ts}.
 *
 * Frames are fed in from SvelteMounter's `binary-frame` observer. Read the newest
 * frame per channel via `GetLatest`, or react to arrivals via `Subscribe`.
 *
 * This hub is non-reactive, similar to {@link nonReactiveWebviewSharedState};
 * A reactive `$state` wrapper for a specific channel can be layered on top in a
 * `.svelte.ts` module when a component actually needs live-updating UI...
 */

import { BinaryStreamHub } from '../../ExtensionBridge/BinaryTransport';
import { RegisterBuiltinBinaryChannels } from '../../ExtensionBridge/BinaryChannels';

export const webviewBinaryStreamHub: BinaryStreamHub = new BinaryStreamHub();

// Register channel decoders so relayed frames are decoded once on ingest, before
// fan-out to whatever webview code Subscribes / GetLatest's(?).
RegisterBuiltinBinaryChannels(webviewBinaryStreamHub);
