<script lang="ts">
    import type { Snippet } from "svelte";
    import { directories } from "../../../Global/Directories.svelte";

    let {
        wrapper = $bindable(),
        isOpen,
        isDialog,
        children,
    }: {
        wrapper: HTMLElement | undefined;
        isOpen: boolean;
        isDialog: boolean;
        children: Snippet;
    } = $props();
</script>

<div
    class="color-wrapper items-center justify-center w-full h-full max-w-full max-h-full"
    bind:this={wrapper}
    class:is-open={isOpen}
    role={isDialog ? 'dialog' : undefined}
    aria-label="Color Picker"
>
    {@render children()}
</div>

<style>
    .color-wrapper {
        --cp-bg-color: var(--background);
        --cp-border-color: var(--border);
        --cp-text-color: var(--color-primary-foreground);
        --cp-input-color: color-mix(in srgb, var(--input) 50%, transparent);
        --cp-button-hover-color: var(--input);
		padding: 2.5%;
		margin: 0;
	}
	.is-open {
        
	}
	[role='dialog'] {
		/* position: absolute;
		top: calc(var(--input-size, 25px) + 12px);
		left: 0; */
		z-index: var(--picker-z-index, 2);
	}
</style>