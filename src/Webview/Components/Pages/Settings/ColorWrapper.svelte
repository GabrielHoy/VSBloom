<script lang="ts">
	import type { Snippet } from 'svelte';
	import { directories } from '../../../Global/Directories.svelte';
	import NoiseScrollTicker from '../../UX/NoiseScrollTicker.svelte';

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
		--cp-bg-color: var(--color-background);
		--cp-border-color: var(--color-border);
		--cp-text-color: var(--color-primary-foreground);
		--cp-input-color: color-mix(in srgb, var(--color-background) 50%, var(--color-input));
		--cp-button-hover-color: var(--color-input);

		--bg-size-scaled: calc((128px / var(--scale-factor)) * 2.1);
		--scroll-anim-offset-x: calc(
			var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x)
		);
		--scroll-anim-offset-y: calc(
			var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y)
		);

		padding: 2.5%;
		margin: 0;
	}
	[role='dialog'] {
		/* position: absolute;
		top: calc(var(--input-size, 25px) + 12px);
		left: 0; */
		z-index: var(--picker-z-index, 2);
	}
</style>
