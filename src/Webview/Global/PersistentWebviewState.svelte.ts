/**
 * Allows for saving&restoration of persistent state across
 * "reloads" of the WebView menu, since navigating away
 * from the tab and back to it in VSCode will trigger
 * the webview to be unloaded and reloaded -- and
 * forcing the user back to things like the main menu
 * upon every click off&onto the menu tab is awful UX.
 */

import { vscode } from "../Util/VSCodeAPI";
import type { PageDescriptor } from "./Pages.svelte";

export interface PersistentWebviewState {
    currentPage: PageDescriptor["name"];
    settingsPage: {
        currentCategory?: string;
    }
}

export const defaultPersistentState: PersistentWebviewState = {
    currentPage: "Main Menu",
    settingsPage: {
        currentCategory: undefined
    }
};

export const persistentState: PersistentWebviewState = $state(defaultPersistentState);

export function MutatePersistentState(newState: Partial<PersistentWebviewState>) {
    Object.assign(persistentState, newState);
    vscode.SetState(persistentState);
}

export function LoadPersistentState() {
    const storedState: PersistentWebviewState = vscode.GetState() as PersistentWebviewState;
    if (storedState && typeof storedState === "object") {
        for (const [key, val] of Object.entries(storedState)) {
            if (key in persistentState) {
                (persistentState as any)[key] = val;
            }
        }
    }
}