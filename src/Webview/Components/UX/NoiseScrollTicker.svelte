<!-- 
    MouseLocationProvider is a component
    that reflects the current position of
    the mouse cursor in the webview, in
    a few different formats.
-->
<script module lang="ts">
	import { mouseLocation } from './MouseLocationProvider.svelte';

	interface ScrollTickContainer {
		element: HTMLElement;
		scrollDuration: number;
		scrollBeginTimestamp: number;
		endScrollValue: number;
	}

	const scrollTickContainers: Record<string, ScrollTickContainer> = {};

	function TickNoiseScrollCSS() {
		const now = performance.now();
		for (const container of Object.values(scrollTickContainers)) {
			const scrollDurationMS = container.scrollDuration * 1000;
			let dT = now - container.scrollBeginTimestamp;

			if (dT > container.scrollDuration) {
				container.scrollBeginTimestamp += scrollDurationMS;
				dT -= scrollDurationMS;
			}

			const scrollProgress = dT / scrollDurationMS;
			const curScrollValue = container.endScrollValue * scrollProgress;

			container.element.style.setProperty(
				'--scroll-anim-progress',
				curScrollValue.toString(),
			);

			const parallaxFactor = 0.05;

			container.element.style.setProperty(
				'--scroll-anim-parallaxed-progress-x',
				(curScrollValue + mouseLocation.normalized.x * parallaxFactor).toString(),
			);
			container.element.style.setProperty(
				'--scroll-anim-parallaxed-progress-y',
				(curScrollValue + mouseLocation.normalized.y * parallaxFactor).toString(),
			);
		}

		requestAnimationFrame(TickNoiseScrollCSS);
	}

	requestAnimationFrame(TickNoiseScrollCSS);
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		scrollDuration = 16.18,
		endScrollValue = 1,
		...restProps
	}: {
		children: Snippet;
		[key: string]: any;
	} = $props();

	function RegisterNoiseScrollTicker(node: HTMLElement) {
		const nodeID = node.id;

		const scrollTickContainer: ScrollTickContainer = {
			element: node,
			scrollDuration,
			scrollBeginTimestamp: performance.now(),
			endScrollValue,
		};

		scrollTickContainers[nodeID] = scrollTickContainer;
		return () => {
			delete scrollTickContainers[nodeID];
		};
	}
</script>

<span class="noise-scroll-ticker contents" {@attach RegisterNoiseScrollTicker}>
	{@render children?.()}
</span>
