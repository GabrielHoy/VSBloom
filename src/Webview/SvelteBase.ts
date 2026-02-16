/**
 * This file handles mounting the Page.svelte component
 * into the webview's body element, identified by the
 * element having the "page" id - this is how the
 * Svelte "application" ends up getting mounted into
 * the webview's DOM.
 */
import { mount } from "svelte";
import Page from "./Page.svelte";
import { vscode } from "./Util/VSCodeAPI";

const page = mount(Page, { target: document.getElementById("page")! });

setTimeout(() => {
    vscode.PostToExtension({
        type: 'send-notification',
        data: {
            type: 'info',
            message: 'Test Notification from Svelte Base'
        }
    });
}, 5000);

export default page;