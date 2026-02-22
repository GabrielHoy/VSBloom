import type { Component } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import Main from "../Components/Pages/Main.svelte";
import Unknown from "../Components/Pages/Unknown.svelte";
import Settings from "../Components/Pages/Settings.svelte";
import GettingStarted from "../Components/Pages/GettingStarted.svelte";

export interface PageDescriptor {
    name: string;
    icon: string; //assumed to be relative to the images directory
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
        description: "Configure various aspects of the VS: Bloom extension and its behavior.",
        notFinished: true,
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
}