<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { directories } from '../../../../Global/Directories.svelte';

	let {
		ref = $bindable(null),
		style: trigStyling,
		bgScrollSpeedMult = 1,
		bgNoiseBlurAdjustment = '0px',
		...restProps
	}: DialogPrimitive.TriggerProps & {
		bgScrollSpeedMult?: number;
		bgNoiseBlurAdjustment?: string;
	} = $props();
</script>

<DialogPrimitive.Trigger
	bind:ref
	data-slot="dialog-trigger"
	style="
		--bg-image-url: url('{directories.imagery}/webview/bluenoise/opaque_mono.png');
		--bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
		--scroll-anim-offset-x: calc(var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x) * var(--bg-scroll-speed-mult));
		--scroll-anim-offset-y: calc(var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y) * var(--bg-scroll-speed-mult));
		--bg-scroll-speed-mult: {bgScrollSpeedMult};
		--bg-noise-blur-adjustment: {bgNoiseBlurAdjustment};
        ${trigStyling ?? ''}
	"
	{...restProps}
/>

<style>
	:global(.shad-button[data-slot='dialog-trigger']) {
		position: relative;
		overflow: hidden;
	}

	:global(.shad-button[data-slot='dialog-trigger']::before) {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		user-select: none;
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0.25;
		background-image: var(--bg-image-url);
		background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
		background-repeat: repeat;
		background-position: var(--scroll-anim-offset-x) var(--scroll-anim-offset-y);
		filter: blur(
			calc(((1.25px / var(--scale-factor)) * 2.1) + var(--bg-noise-blur-adjustment))
		);
	}
</style>
