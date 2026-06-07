<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import SelectPortal from './select-portal.svelte';
	import SelectScrollUpButton from './select-scroll-up-button.svelte';
	import SelectScrollDownButton from './select-scroll-down-button.svelte';
	import { cn, type WithoutChild } from '$webview-svelte-lib/utils.js';
	import type { ComponentProps } from 'svelte';
	import type { WithoutChildrenOrChild } from '$webview-svelte-lib/utils.js';
	import { directories } from '../../../../Global/Directories.svelte';
	import { fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import NoiseBG from '../../../../Components/UX/NoiseBG.svelte';
	import NoiseScrollTicker from '../../../../Components/UX/NoiseScrollTicker.svelte';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		preventScroll = true,
		style: selStyling,
		...restProps
	}: WithoutChild<SelectPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPortal>>;
	} = $props();
</script>

<SelectPortal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		data-slot="select-content"
		class={cn(
			'transition-all duration-300 bg-popover text-popover-foreground/75 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-0 data-[state=open]:zoom-in-0 data-[side=bottom]:slide-in-from-top-25 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--bits-select-content-available-height) min-w-32 origin-(--bits-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-sm border border-current/75 shadow-md data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
			className,
		)}
		// style={`background-image: url('${directories.imagery}/webview/bluenoise/opaque_mono_90p_transparent.png'); ${selStyling ?? ""}`}
		style={`${selStyling ?? ''}`}
		{...restProps}
	>
		<SelectScrollUpButton />
		<SelectPrimitive.Viewport
			class={cn(
				'h-(--bits-select-anchor-height) w-full min-w-(--bits-select-anchor-width) scroll-my-1 p-1',
			)}
		>
			<NoiseScrollTicker>
				<NoiseBG
					opacity={0.45}
					useChromaBG={true}
					doDefaultAnimation={false}
					scaleFactor={1}
					scrollSpeed={1}
					class={cn(
						'noise-bg select-noise-bg w-full h-full absolute top-0 left-0 pointer-events-none select-none ',
					)}
					style="filter: blur(calc((0.85px / var(--scale-factor)) * 2.1)) brightness(75%) saturate(50%);"
				/>
			</NoiseScrollTicker>
			{@render children?.()}
		</SelectPrimitive.Viewport>
		<SelectScrollDownButton />
	</SelectPrimitive.Content>
</SelectPortal>
