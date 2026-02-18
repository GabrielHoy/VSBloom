<script lang="ts">
    import { vscode } from "../../Util/VSCodeAPI";
    import { pageData } from "../../Global/Pages.svelte";
    import { directories } from "../../Global/Directories.svelte";

    let {
        pageName = "Unknown",
        children,
        unfinished = false
    }= $props();

    let descriptor = $derived(pageData.pages.get(pageName));
</script>

{#if unfinished}
    <button
        class="button-clicker not-finished-yet"
        title="This page is not finished yet, check back later!"
        onclick={() => {
            vscode.NotifyUser("warning", `[VSBloom]: The "${pageName}" page isn't finished yet, check back later!`);
        }}
        style="background-image: url('{directories.images}/webview/bluenoise/opaque_mono_90p_transparent.png');"
    >
        {@render children()}
    </button>
{:else}
    <button
        class="button-clicker clickable"
        title={descriptor?.description ?? "No Description Available(?)"}
        onclick={() => {
            pageData.currentPage = pageName;
        }}
        style="background-image: url('{directories.images}/webview/bluenoise/opaque_mono_90p_transparent.png');"
    >
        {@render children()}
    </button>
{/if}

<style>
    @keyframes scrollNoise {
        0% { background-position: 0 0; }
        100% { background-position: var(--bg-size-scaled) var(--bg-size-scaled); }
    }

    .button-clicker {
        color: var(--vscode-button-secondaryForeground);
        background-color: var(--vscode-button-secondaryBackground);
        border: 1px solid var(--vscode-button-separator);
        border-radius: 0.375em;
        padding: 0.25em 0.4em;
        display: block;
        user-select: none;
        transform-origin: center;

        width: 100%;
        height: var(--button-height);
        font-size: calc(var(--button-height) / 2);

        background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
        background-repeat: repeat;
        background-blend-mode: overlay;
    }
    .clickable {
        --bg-size-scaled: calc((128px / var(--scale-factor)) * 2.1);
        
        cursor: pointer;
        transition: transform 0.5s var(--vsbloom-bouncy-ease), box-shadow 0.5s var(--vsbloom-bouncy-ease), border-color 0.5s var(--vsbloom-bouncy-ease), filter 0.5s var(--vsbloom-bouncy-ease);

        &:hover {
            border-color: var(--vscode-foreground);
            transform: scale(1.075);
            box-shadow: 0 0 0.125em var(--vsbloom-text-border-color);
            filter: brightness(125%);
        }

        &:active {
            transform: scale(0.9);
            box-shadow: 0 0 0.5em var(--vsbloom-text-border-color);
            filter: brightness(90%);
        }

        animation: scrollNoise 16.18s linear infinite;
    }

    .not-finished-yet {
        --bg-size-scaled: calc((128px / var(--scale-factor)) * 2.1);

        filter: grayscale(50%) blur(0.015em);
        cursor: not-allowed;
        font-style: oblique;
        font-weight: lighter;

        color: color-mix(in srgb, var(--vscode-disabledForeground) 50%, var(--vscode-button-secondaryForeground) 50%);
        opacity: 0.5;

        animation: scrollNoise 16.18s linear infinite;
    }
</style>