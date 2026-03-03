import type { Component } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import Main from "../Components/Pages/Main.svelte";
import Unknown from "../Components/Pages/Unknown.svelte";
import Settings from "../Components/Pages/Settings/Settings.svelte";
import GettingStarted from "../Components/Pages/GettingStarted.svelte";
import { MutatePersistentState } from "./PersistentWebviewState.svelte";
import { vscode } from "../Util/VSCodeAPI";

export interface PageDescriptor {
    name: string;
    icon: string; //assumed to be relative to the imagery directory
    description: string;
    component: Component;

    hideFromUser?: boolean;
    notFinished?: boolean;
};

//list of all available pages in the webview menu,
//excluding 'open in browser' https pages of course
const pageList: SvelteMap<PageDescriptor["name"], PageDescriptor> = $state(new SvelteMap([
    ["Getting Started", {
        name: "Getting Started",
        icon: "logo.png",
        description: "Provides an overview and introduction to the VS: Bloom extension and what it has to offer.",
        component: GettingStarted,
        notFinished: true
    }],
    ["Main Menu", {
        name: "Main Menu",
        icon: "logo.png",
        description: "The main page of VS: Bloom.",
        component: Main
    }],
    ["Extension Settings", {
        name: "Extension Settings",
        icon: "webview/settings.png",
        description: "Configure various aspects of the VS: Bloom extension and the configurations it provides.",
        notFinished: false,
        component: Settings
    }],
    ["Unknown", {
        name: "Unknown",
        icon: "logo.png",
        description: "Unknown/Non-existant page...if you see this you should probably report it as a bug!",
        hideFromUser: true,
        component: Unknown
    }]
]));

export const pageData = $state({
    pages: pageList,
    currentPage: "Main Menu",
});

export function SetCurrentPage(pageName: PageDescriptor["name"]) {
    pageData.currentPage = pageName;
    if (pageData.pages.has(pageName) && pageName !== "Unknown") {
        MutatePersistentState({ currentPage: pageName });
        // set the webview title to the page name, or reset it to the default title if we're going back to the main menu
        vscode.ChangeTitle(pageName === "Main Menu" ? undefined : pageName);
    }
}