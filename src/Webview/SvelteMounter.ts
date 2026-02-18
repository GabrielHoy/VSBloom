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

vscode.PostToExtension({
    type: 'send-notification',
    data: {
        type: 'info',
        message: 'The VSBloom Menu is still in development, so please report any issues or feedback you have on GitHub!'
    }
});

//Once we've mounted the webview Svelte page,
//let's spin off the metadata handshake with
//the extension so we can retrieve useful
//metadata for general use & display.
vscode.PostToExtension({
    type: 'request-meta-update',
    data: undefined
});

export default webviewPage;