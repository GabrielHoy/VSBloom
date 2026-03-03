<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from "bits-ui";
	import CheckIcon from "@lucide/svelte/icons/check";
	import IndeterminateIcon from "@lucide/svelte/icons/loader-circle"
	import XIcon from "@lucide/svelte/icons/x";
	import { cn, type WithoutChildrenOrChild } from "$webview-svelte-lib/utils.js";
	import { directories } from "../../../../Global/Directories.svelte";
    import { fade, scale } from "svelte/transition";
    import { cubicInOut, cubicOut, linear } from "svelte/easing";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> & { size?: number } = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	data-slot="checkbox"
	class={cn(
		`transition-all duration-300 border-input bg-input/30 hover:bg-input/50 hover:border-foreground hover:scale-[1.25] data-[state=checked]:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive peer flex size-4 rounded-xs shrink-0 items-center justify-center border shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50`,
		className
	)}
	bind:checked
	bind:indeterminate
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		<div
			data-slot="checkbox-indicator"
			class="checkbox-indicator transition-none"
			style="background-image: url('{directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png');"
		>
			{#key checked || indeterminate}
				<div
					class="checkbox-icon-container icon-{checked ? 'check' : indeterminate ? 'indeterminate' : 'x'}"
					in:fade={{ duration: 175, easing: cubicInOut, delay: 75 }}
					out:scale={{ duration: 100, easing: linear }}
				>
					{#if checked}
						<CheckIcon class="size-3.5" />
					{:else if indeterminate}
						<span class="w-full h-full absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-xs scale-75">
							...
						</span>
						<IndeterminateIcon class="size-3.5 animate-spin" />
					{:else}
						<XIcon class="size-3.5 opacity-25" />
					{/if}
				</div>
			{/key}
		</div>
	{/snippet}
</CheckboxPrimitive.Root>

<style>
	.checkbox-indicator {
		--bg-size-scaled: calc((160px / var(--scale-factor)) * 1.42);
		
		display: flex;
		align-items: center;
		justify-content: center;

		cursor: pointer;
		
		width: 100%;
		height: 100%;

		color: var(--border);
		background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
		background-repeat: repeat;

		animation: scrollNoise 16.18s linear infinite;
	}

	@keyframes checkIconAnim {
		0% {
			transform: scale(0);
			rotate: -45deg;
		}
		50% {
			transform: scale(1.1618);
		}
		75% {
			rotate: 8deg;
		}
		100% {
			transform: scale(1);
		}
	}
	@keyframes xIconAnim {
		0% {
			transform: scale(0);
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			color: currentColor;
		}
	}
	.checkbox-icon-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;

		&.icon-check {
			transform: scale(0);
			animation: checkIconAnim 0.5s ease-in-out forwards;
			animation-delay: 0.1s;
		}
		&.icon-indeterminate {
			opacity: 1;
			color: white;
			background-color: black;
		}
		&.icon-x {
			transform: scale(0);
			animation: xIconAnim 0.618s var(--vsbloom-bouncy-ease) forwards;
			animation-delay: 0.1s;
		}
	}
</style>