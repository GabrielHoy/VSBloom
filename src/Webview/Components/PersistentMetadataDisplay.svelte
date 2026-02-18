<script module>
    import { vscode } from "../Util/VSCodeAPI"

    vscode.ObserveBloomToSvelteMessage('meta-update', (data) => {
        extensionMetadata.metaLoaded = true;
        extensionMetadata.lastMetaUpdateTimestamp = Date.now();

        extensionMetadata.extensionVersion = data.extensionVersion;
        extensionMetadata.isDevEnvironment = data.isDevEnvironment;
        extensionMetadata.isClientPatched = data.isClientPatched;
        extensionMetadata.clientPatchVersion = data.clientPatchVersion;

        extensionMetadata.isClientPatchOutOfDate = extensionMetadata.clientPatchVersion !== data.clientPatchVersion;
    });
</script>

<script lang="ts">
    import { extensionMetadata } from "../Global/Metadata.svelte";
    import { fade, fly } from "svelte/transition";
    import { backIn, backOut, elasticOut } from "svelte/easing";
</script>

<div class="metadata-display-container">
    {#if extensionMetadata.metaLoaded}
        <span class="client-meta stand-out-on-hover" in:fly={{ y: "100%", duration: 1000, delay: 750, easing: backOut }} title="You're on a {extensionMetadata.isDevEnvironment ? 'Development' : 'Production'} build of the VS: Bloom extension.">
            {extensionMetadata.isDevEnvironment ? "dev" : "prod"}
        </span>
        <span class="client-meta" in:fly={{ y: "100%", duration: 4000, delay: 500, easing: elasticOut }}>/</span>
        <span
            class="client-meta stand-out-on-hover"
            title="The current version of the VS: Bloom extension is {extensionMetadata.extensionVersion}."
            in:fly={{ y: "100%", duration: 1000, delay: 1000, easing: backOut }}
        >
            e-{extensionMetadata.extensionVersion}
        </span>
        <span class="client-meta" in:fly={{ y: "100%", duration: 4000, delay: 600, easing: elasticOut }}>/</span>
        <span class="client-meta stand-out-on-hover {extensionMetadata.isClientPatchOutOfDate ? "outdated" : ""}" in:fly={{ y: "100%", duration: 1000, delay: 1250, easing: backOut }} title={extensionMetadata.isClientPatched ? `The Electron Workbench is currently patched with a variant of the VS: Bloom Client generated under extension version ${extensionMetadata.clientPatchVersion}.${!extensionMetadata.isClientPatchOutOfDate ? " You're up to date!" : " You should likely re-patch your Electron Workbench to avoid possible issues with VS: Bloom."}` : "The Electron Workbench does not currently seem to be patched with any variant of the VS: Bloom Client."}>
            c-{extensionMetadata.isClientPatched ? extensionMetadata.clientPatchVersion : "null"}
        </span>
    {:else}
        <span
            class="metadata-loading"
            in:fade={{ duration: 1000 }}
            out:fly={{ y: "100%", duration: 500, opacity: 0, easing: backIn }}
        >
            handshake in progress...
        </span>
    {/if}
</div>


<style>
    .metadata-display-container {
        display: flex;
        flex-direction: row;
        align-items: end;
        justify-content: flex-start;

        position: absolute;
        top: 0;
        left: 0.125rem;
        width: calc(100vw - 0.125rem);
        height: calc(100vh - 0.125rem);
        padding: 0;
        margin: 0;

        user-select: none;
        pointer-events: none;

        overflow: hidden;
    }
    .metadata-loading {
        --unclamped-font-scaling: calc((8px / var(--scale-factor)) * 3.141592653);
        --clamped-font-size: min(0.875vmax, var(--unclamped-font-scaling));

        color: color-mix(in srgb, color-mix(in srgb, var(--inverted-vsbloom-shadowing-color) 50%, var(--inverted-vsbloom-extremum-theme-color) 50%) 25%, transparent 75%);

        position: absolute;
        left: 0.5em;
        bottom: 0.275em;
        font-size: var(--clamped-font-size);
    }
    .client-meta {
        --unclamped-font-scaling: calc((8px / var(--scale-factor)) * 3.141592653);
        --clamped-font-size: min(0.875vmax, var(--unclamped-font-scaling));

        color: color-mix(in srgb, var(--inverted-vsbloom-shadowing-color) 25%, transparent 75%);

        font-size: var(--clamped-font-size);
        font-style: italic;

        &.outdated {
            color: color-mix(in srgb, var(--vscode-errorForeground) 75%, transparent 25%);
            font-style: normal;
            font-weight: bolder;
        }
    }
    .stand-out-on-hover {
        transition: color 0.5s var(--vsbloom-bouncy-ease), transform 0.5s var(--vsbloom-bouncy-ease), font-size 0.5s var(--vsbloom-bouncy-ease);
        pointer-events: all;
        &:hover {
            &.outdated {
                color: var(--vscode-errorForeground);
            }
            &:not(.outdated) {
                color: color-mix(in srgb, var(--vscode-editor-foreground) 75%, transparent 25%);
            }
            font-size: calc(var(--clamped-font-size) * 1.25);
            text-decoration: underline;
        }
    }
</style>