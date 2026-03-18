/**
 * This file handles mounting the Webview.svelte component
 * into the webview's body element, identified by the
 * element having the "page" id - this is how the
 * Svelte "application" ends up getting mounted into
 * the webview's DOM.
 */
import { mount } from 'svelte';
import { AssignCurrentEffectSettings } from './Global/Settings.svelte';
import { vscode } from './Util/VSCodeAPI';
import WebviewPage from './Webview.svelte';

// Hookup Bloom -> Svelte message listeners for general state management
vscode.ObserveBloomToSvelteMessage('sync-settings-list', (data) => {
	console.log('Syncing settings list', data);
	AssignCurrentEffectSettings(data);
});

const webviewPage = mount(WebviewPage, {
	// biome-ignore lint/style/noNonNullAssertion: <we ensure this is always present in the DOM via the static HTML we generate, this non-null assertion is safe>
	target: document.getElementById('mount-sentinel-element')!,
});

//Once we've mounted the webview Svelte page,
//let's let the extension know that we're ready
//to receive messages - this will also trigger
//some initial data to be sent to us from the
//extension side.
vscode.PostToExtension({
	type: 'webview-ready',
	data: undefined,
});

export default webviewPage;
