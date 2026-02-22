/**
 * Allows for saving&restoration of persistent state across
 * "reloads" of the WebView menu, since navigating away
 * from the tab and back to it in VSCode will trigger
 * the webview to be unloaded and reloaded -- and
 * forcing the user back to things like the main menu
 * upon every click off&onto the menu tab is awful UX.
 */

import { vscode } from "../Util/VSCodeAPI";

export interface PersistentWebviewState {
    
}

export const persistentState = {

}