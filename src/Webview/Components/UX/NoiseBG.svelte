<script lang="ts">
	import { directories } from '../../Global/Directories.svelte';

	let {
		scrollSpeed = 1,
		scaleFactor = 1,
		opacity = 1,
		doDefaultAnimation = true,
		style: nsStyling = '',
		useChromaBG = false,
		reverseDirection = false,
		...restProps
	} = $props();
</script>

<div
	class="noise-bg"
	style="background-image: url('{directories.imagery}/webview/bluenoise/opaque_{useChromaBG
		? 'rgba'
		: 'mono'}.png'); --bg-size-scaled: calc(({128 *
		scaleFactor}px / var(--scale-factor)) * 2.1); {doDefaultAnimation
		? `animation: scrollNoise ${16.18 * scrollSpeed}s linear infinite; `
		: ''}opacity: {opacity}{reverseDirection ? '; transform: rotate(180deg)' : ''}; {nsStyling}"
	{...restProps}
></div>

<style>
	.noise-bg {
		/* background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px); */
		/* background-repeat: repeat; */
		pointer-events: none;
		user-select: none;

		--bg-size-scaled: calc((160px / var(--scale-factor)) * 2.1);
		--scroll-anim-offset-x: calc(
			var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-x)
		);

		background-size: var(--bg-size-scaled, 128px) var(--bg-size-scaled, 128px);
		background-repeat: repeat;
		--scroll-anim-offset-y: calc(
			var(--bg-size-scaled) * var(--scroll-anim-parallaxed-progress-y)
		);

		background-position: var(--scroll-anim-offset-x) var(--scroll-anim-offset-y);
	}
</style>
