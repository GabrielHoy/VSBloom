<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';
	import { cn, type WithElementRef } from '$webview-svelte-lib/utils.js';
	import { fly } from 'svelte/transition';
	import { backOut, cubicOut } from 'svelte/easing';
	import { directories } from '../../../../Global/Directories.svelte';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined }) & {
				bgScrollSpeedMult?: number;
				bgNoiseBlurAdjustment?: string;
			}
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		style: inpStyling,
		bgScrollSpeedMult = 1,
		bgNoiseBlurAdjustment = '0px',
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

<div
	class="vsbloom-input-container rounded-md"
	style={`--bg-image-url: url('${directories.imagery}/webview/bluenoise/opaque_mono.png'); --bg-scroll-speed-mult: ${bgScrollSpeedMult}; --bg-noise-blur-adjustment: ${bgNoiseBlurAdjustment};`}
>
	{#if type === 'file'}
		<input
			bind:this={ref}
			data-slot={dataSlot}
			class={cn(
				'shad-cn-input',
				'selection:bg-primary dark:bg-input/30 selection:text-primary-foreground border-input ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 pt-1.5 text-sm font-medium shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50',
				'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
				'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
				className,
			)}
			style={`${inpStyling}`}
			type="file"
			bind:files
			bind:value
			{...restProps}
		/>
	{:else}
		<input
			bind:this={ref}
			data-slot={dataSlot}
			class={cn(
				'shad-cn-input',
				'border-input bg-background dark:bg-input/30 selection:bg-primary selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-fit min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
				'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
				'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
				className,
			)}
			style={`${inpStyling}`}
			{type}
			bind:value
			{...restProps}
		/>
	{/if}
</div>

<style>
	.vsbloom-input-container {
		background: transparent;
		position: relative;
		overflow: hidden;

		&::before {
			--bg-size-scaled: calc((128px / var(--scale-factor)) * 2.1);

			--scroll-anim-offset-x: calc(
				var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x) *
					var(--bg-scroll-speed-mult)
			);
			--scroll-anim-offset-y: calc(
				var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y) *
					var(--bg-scroll-speed-mult)
			);

			content: '';
			border-radius: inherit;
			inset: 1px;
			z-index: 0;
			display: block;
			position: absolute;
			pointer-events: none;
			user-select: none;
			width: calc(100% - 2px);
			height: calc(100% - 2px);
			opacity: 0.45;
			background-image: var(--bg-image-url);
			background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
			background-repeat: repeat;
			background-position: var(--scroll-anim-offset-x) var(--scroll-anim-offset-y);

			filter: blur(
					calc(((0.9px / var(--scale-factor)) * 2.1) + var(--bg-noise-blur-adjustment))
				)
				brightness(75%) saturate(15%);
		}
	}
	.shad-cn-input {
		transition: width 0.618s var(--vsbloom-bouncy-ease);
		text-shadow: var(--vsbloom-text-drop-shadow);

		/* animation: scrollNoise 16.18s linear infinite; */
	}
</style>
