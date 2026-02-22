<script lang="ts">
    import { vscode } from "../../Util/VSCodeAPI";
    import { directories } from "../../Global/Directories.svelte";
    import { onMount } from "svelte";

    let {
        onclick,
        ondisabledclick = () => {},
        disabled = false,
        tooltip,
        children
    }: {
        onclick: () => void;
        ondisabledclick?: () => void;
        disabled?: boolean;
        tooltip?: string;
        children?: any;
    }= $props();

</script>

<button
    class="button-clicker {disabled ? 'disabled' : 'clickable'}"
    title={tooltip ?? undefined}
    onclick={disabled ? ondisabledclick : onclick}
    style="background-image: url('{directories.images}/webview/bluenoise/opaque_mono_90p_transparent.png');"
>
    {@render children()}
</button>

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
        font-size: inherit;

        width: 100%;
        height: 100%;

        background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
        background-repeat: repeat;
        background-blend-mode: overlay;
    }
    .clickable {
        --bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
        
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

    .disabled {
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