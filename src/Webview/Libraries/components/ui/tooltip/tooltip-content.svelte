<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { cn } from '$webview-svelte-lib/utils.js';
	import TooltipPortal from './tooltip-portal.svelte';
	import type { ComponentProps } from 'svelte';
	import type { WithoutChildrenOrChild } from '$webview-svelte-lib/utils.js';
	import { directories } from '../../../../Global/Directories.svelte';
	import NoiseBG from '../../../../Components/UX/NoiseBG.svelte';
	import NoiseScrollTicker from '../../../../Components/UX/NoiseScrollTicker.svelte';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 0,
		side = 'top',
		children,
		arrowClasses,
		portalProps,
		style: toolTipStyling = '',
		...restProps
	}: TooltipPrimitive.ContentProps & {
		arrowClasses?: string;
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
	} = $props();
</script>

<TooltipPortal {...portalProps}>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		{side}
		// style={`background-image: url('${directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png'); ${toolTipStyling}`}
		style={`${toolTipStyling}`}
		class={cn(
			'shad-tooltip-content',
			// "bg-foreground text-background animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--bits-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
			'bg-transparent text-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--bits-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance',
			'border',
			className,
		)}
		{...restProps}
	>
		<!--
            We need to establish another NoiseScrollTicker context here
            due to the portalling of the tooltip content outside of the
            primary scope that the main Webview's NoiseScrollTicker context
            is confined to.
        -->
		<NoiseScrollTicker>
			<div
				class="tooltip-bg-container bg-background w-[calc(100%-2px)] h-[calc(100%-2px)] translate-x-px translate-y-px absolute top-0 left-0 pointer-events-none select-none rounded-md"
			>
				<NoiseBG
					opacity={0.45}
					useChromaBG={true}
					doDefaultAnimation={false}
					scaleFactor={1}
					scrollSpeed={16.18}
					class="noise-bg blur-[1px] brightness-75 saturate-50 tooltip-noise-bg w-full h-full rounded-md absolute top-0 left-0 pointer-events-none select-none "
				/>
			</div>
			<div
				class={cn(
					'border-r border-b',
					'bg-transparent z-20 size-5 rotate-225 rounded-[2px] absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none',
				)}
			>
				<div
					class="tooltip-bg-container overflow-hidden bg-background rounded-[2px] w-full h-full absolute top-0 left-0 pointer-events-none select-none"
				>
					<NoiseBG
						opacity={0.45}
						useChromaBG={true}
						doDefaultAnimation={false}
						scaleFactor={1}
						reverseDirection={true}
						scrollSpeed={16.18}
						class="noise-bg blur-[1px] brightness-75 saturate-50 tooltip-noise-bg w-[calc(100%+10px)] h-[calc(100%+10px)] translate-x-[-5px] translate-y-[-5px] absolute top-0 left-0 pointer-events-none select-none "
					/>
				</div>
			</div>
			<div
				class={cn(
					'bloom-image-container z-40 overflow-visible bg-transparent size-4 absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none select-none',
				)}
			>
				<img
					class="bloom-image w-full h-full -translate-y-1/2 pointer-events-none select-none"
					src="{directories.imagery}/webview/logoPointed.svg"
					alt="VS: Bloom Icon Pin"
				/>
			</div>
			<div class="relative z-30">
				{@render children?.()}
			</div>

			<TooltipPrimitive.Arrow>
				{#snippet child({ props })}
					<div
						class={cn(
							// 'bg-foreground z-50 size-2.5 rotate-45 rounded-[2px]',
							// 'blur-[1px] brightness-75 saturate-50',
							'shad-tooltip-arrow',
							'border-r border-b',
							'bg-transparent z-50 size-2.5 rotate-45 rounded-[2px]',
							'data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%_+_2px)]',
							'data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%_+_1px)]',
							'data-[side=right]:translate-x-[calc(50%_+_2px)] data-[side=right]:translate-y-1/2',
							'data-[side=left]:-translate-y-[calc(50%_-_3px)]',
							arrowClasses,
						)}
						{...props}
						style={` ${props.style ?? ''}`}
					>
						<div
							class="tooltip-bg-container overflow-hidden bg-background rounded-[2px] w-full h-full absolute top-0 left-0 pointer-events-none select-none"
						>
							<NoiseBG
								opacity={0.45}
								useChromaBG={true}
								doDefaultAnimation={false}
								scaleFactor={1}
								scrollSpeed={16.18}
								class="noise-bg blur-[1px] brightness-75 saturate-50 tooltip-noise-bg w-[calc(100%+10px)] h-[calc(100%+10px)] translate-x-[-5px] translate-y-[-5px] absolute top-0 left-0 pointer-events-none select-none "
							/>
						</div>
					</div>
				{/snippet}
			</TooltipPrimitive.Arrow>
		</NoiseScrollTicker>
	</TooltipPrimitive.Content>
</TooltipPortal>

<style>
	.shad-tooltip-content,
	.shad-tooltip-arrow {
		--bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
		--scroll-anim-offset-x: calc(
			var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x)
		);

		background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
		background-repeat: repeat;
	}

	.shad-tooltip-content {
		--scroll-anim-offset-y: calc(
			var(--bg-size-scaled) * (var(--scroll-anim-parallaxed-progress-y) * 0.7071067)
		);
		/* animation: scrollNoise 16.18s linear infinite; */
	}

	.shad-tooltip-arrow {
		--scroll-anim-offset-y: calc(
			var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y)
		);

		background-position: var(--scroll-anim-offset-x) var(--scroll-anim-offset-y);

		/* animation: scrollNoiseOffsetNeg45Deg 16.18s linear infinite; */
	}

	.bloom-image {
		display: block;
		width: auto;
		margin: 0 auto;
		pointer-events: none;
		user-select: none;
		filter: drop-shadow(0 0 1.75vh rgba(0, 0, 0, 0.5));
	}
</style>
