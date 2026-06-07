<script lang="ts">
	import { onMount } from 'svelte';
	import { directories } from '../Global/Directories.svelte';
	import VSBloomIcon, {
		TweenInBloomIconLayerAnimation,
		TweenOutBloomIconLayerAnimation,
		type BloomIconLayerName,
	} from './VSBloomIcon.svelte';
	import gsap from 'gsap';

	let {
		visible = true,
		text = 'VS: Bloom',
		height = '25vh',
		paddingTop = '2.25vh',
		subTitle = '',
		maxHeightVh = 25,
		minHeightVh = 15,
		iconAnimationTimescale = 1.314,
	} = $props();

	let textBaseSize = $derived(
		`calc(clamp(${minHeightVh * 0.25}vh, ${height} * 0.25 - 0.125em, ${maxHeightVh * 0.25}vh))`,
	);
	let subTextBaseSize = $derived(
		`calc(clamp(${minHeightVh * 0.1}vh, ${height} * 0.1 - 0.025em, ${maxHeightVh * 0.1}vh))`,
	);

	function BloomIconContainerAttachment(el: HTMLDivElement) {
		const containerTimeline = gsap.timeline({});
		const initialTranslateY = '2rem';

		el.style.translate = `0 ${initialTranslateY}`;

		containerTimeline
			.from(el, {
				translateY: initialTranslateY,
			})
			.to(el, {
				translateY: '0rem',
				duration: 2 / iconAnimationTimescale,
				ease: 'back.out',
			});
	}

	function BloomLayerIconAttachment(
		el: HTMLImageElement,
		layerNumber: number,
		layerStaggering: number,
		layerName: BloomIconLayerName,
	) {
		const layerTimeline = TweenInBloomIconLayerAnimation(
			el,
			layerNumber,
			layerStaggering,
			layerName,
			iconAnimationTimescale,
		);

		// setTimeout(() => {
		// 	TweenOutBloomIconLayerAnimation(
		// 		el,
		// 		layerNumber,
		// 		layerStaggering,
		// 		layerName,
		// 		iconAnimationTimescale,
		// 		layerTimeline,
		// 	);
		// }, 6000);
	}
</script>

{#if visible}
	<div
		class="splash-container"
		style="padding-top: {paddingTop}; max-height: {maxHeightVh}vh; min-height: {minHeightVh}vh; font-size: {textBaseSize};"
	>
		<div
			class="block w-auto h-full aspect-square mx-auto my-0 pointer-events-none select-none transition-all duration-500"
			style="height: calc({height} * 0.6); max-height: {maxHeightVh *
				0.6}vh; min-height: {minHeightVh *
				0.6}vh; filter: drop-shadow(0 0 1.75vh rgba(0, 0, 0, 0.5));"
		>
			<div
				class="block w-full h-full mx-0 my-0 absolute top-0 left-0"
				{@attach BloomIconContainerAttachment}
			>
				<VSBloomIcon
					containerProps={{
						class: 'w-auto h-full mx-auto my-0',
					}}
					layerProps={{
						style: 'opacity: 0;',
						onAttach: BloomLayerIconAttachment,
					}}
				/>
			</div>
		</div>
		<p
			class="splash-title transition-all duration-200"
			style="line-height: {textBaseSize}; height: {textBaseSize}; margin-top: calc({textBaseSize} * 0.2); max-height: {maxHeightVh *
				0.25}vh; min-height: {minHeightVh * 0.25}vh;"
		>
			{text}
		</p>
		<span class="header-separator-decoration" style="max-width: calc({textBaseSize} * 6.18);"
		></span>
		<p
			class="splash-sub-title transition-all duration-200"
			style="font-size: {subTextBaseSize}; line-height: {subTextBaseSize}; height: {subTextBaseSize}; max-height: {maxHeightVh *
				0.1}vh; min-height: {minHeightVh * 0.1}vh;"
		>
			{subTitle}
		</p>
	</div>
{/if}

<style>
	.splash-container {
		display: block;
		width: auto;
		padding: 0 0 0 0;
		margin: 0 auto;
	}
	.splash-title {
		text-align: center;
		width: auto;
		margin: 0 auto;
		pointer-events: none;
		user-select: none;
		white-space: nowrap;
	}
	.splash-sub-title {
		text-align: center;
		width: auto;
		margin: 0 auto;
		pointer-events: none;
		user-select: none;
		white-space: nowrap;
	}
	.header-separator-decoration {
		display: block;
		width: 8em;
		height: 1px;
		background: linear-gradient(
			to right,
			transparent,
			var(--vscode-editor-foreground),
			transparent
		);
		margin: 0.075em auto 0.075em auto;
	}
</style>
