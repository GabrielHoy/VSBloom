/**
 * This file handles mounting the Webview.svelte component
 * into the webview's body element, identified by the
 * element having the "page" id - this is how the
 * Svelte "application" ends up getting mounted into
 * the webview's DOM.
 */
import { mount } from "svelte";
import WebviewPage from "./Webview.svelte";
import { vscode } from "./Util/VSCodeAPI";

const webviewPage = mount(WebviewPage, { target: document.getElementById("page")! });

//Once we've mounted the webview Svelte page,
//let's let the extension know that we're ready
//to receive messages - this will also trigger
//some initial data to be sent to us from the
//extension side.
vscode.PostToExtension({
    type: 'webview-ready',
    data: undefined
});

export default webviewPage;