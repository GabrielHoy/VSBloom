<script module lang="ts">
	import { directories } from '../Global/Directories.svelte';
	import gsap from 'gsap';

	export type BloomContainerAttachmentHandler = (el: HTMLDivElement) => void;
	export interface BloomIconContainerProps {
		onAttach?: BloomContainerAttachmentHandler;
		[key: string]: unknown;
	}
	export type BloomLayerAttachmentHandler = (
		el: HTMLImageElement,
		layerNumber: number,
		layerStaggering: number,
		layerName: BloomIconLayerName,
	) => void;
	export interface BloomIconLayerProps {
		onAttach?: BloomLayerAttachmentHandler;
		[key: string]: unknown;
	}
	export type BloomIconLayerName = keyof typeof bloomIconLayerStaggering;

	export function GetLayerNumberFromBloomIconLayerElement(element: HTMLImageElement): number {
		return parseInt(element.id.at(-1) ?? '0');
	}

	//The record's mapping here is from layer name -> stagger index,
	//since when staggering animations on different layers we
	//want some of the layers to start at equivalent staggers
	//instead of each layer starting at a different stagger index
	export const bloomIconLayerStaggering: Record<string, number> = {
		centerStar: 0,
		innerCorePetals: 1,
		coreHexagon: 2,
		mainPetals: 3,
		outerSmallPetals: 4,
		outerLargePetals: 4,
	};
	//Counts the number of unique staggerings(values) in the bloomIconLayerStaggering record
	export const numUniqueBloomIconLayerStaggers = Object.values(bloomIconLayerStaggering).reduce(
		(() => {
			const seenStaggers = new Set<number>();
			return (builder, curVal, curIdx, array) => {
				if (seenStaggers.has(curVal)) {
					return builder;
				}
				seenStaggers.add(curVal);

				return builder + 1;
			};
		})(),
		0,
	);

	//Simple ordered array of layer names for easy iteration/reference
	export const bloomIconLayers: BloomIconLayerName[] = [
		'centerStar',
		'innerCorePetals',
		'coreHexagon',
		'mainPetals',
		'outerSmallPetals',
		'outerLargePetals',
	];

	function HandleIconContainerAttachment(
		el: HTMLDivElement,
		containerProps: { onAttach?: (el: HTMLDivElement) => void } & { [key: string]: unknown },
	) {
		containerProps?.onAttach?.(el);
	}

	function HandleIconLayerAttachment(el: HTMLImageElement, layerProps: BloomIconLayerProps) {
		const layerNum = GetLayerNumberFromBloomIconLayerElement(el);
		const layerName = bloomIconLayers[layerNum - 1];

		layerProps.onAttach?.(el, layerNum, bloomIconLayerStaggering[layerName], layerName);
	}

	export function TweenInBloomIconLayerAnimation(
		el: HTMLImageElement,
		layerNumber: number,
		layerStaggering: number,
		layerName: BloomIconLayerName,
		timeScale: number = 1,
		layerTimeline: gsap.core.Timeline = gsap.timeline({}),
	) {
		const isOuterSmallPetals = layerName === 'outerSmallPetals';
		const beginningLayerRotationDeg = layerStaggering * (180 / numUniqueBloomIconLayerStaggers);
		const extraStaggerIfOuterSmallPetals = isOuterSmallPetals
			? (numUniqueBloomIconLayerStaggers - 1) * 0.25
			: 0;
		const scaleEasing = isOuterSmallPetals ? 'elastic.out(1, 0.618)' : 'back.out';

		el.style.opacity = '0';

		return layerTimeline
			.invalidate()
			.from(el, {
				filter: 'blur(0.25rem)',
				scale: 0,
				rotate: `${layerName === 'outerSmallPetals' ? 0 : beginningLayerRotationDeg}deg`,
				delay: (0.5 + layerStaggering * 0.1 + extraStaggerIfOuterSmallPetals) / timeScale,
			})
			.to(
				el,
				{
					opacity: 1,
					duration: 0.31415 / timeScale,
					ease: 'power2.inOut',
				},
				'<',
			)
			.to(
				el,
				{
					scale: 1,
					duration:
						(1 + layerStaggering * 0.25 + extraStaggerIfOuterSmallPetals) / timeScale,
					ease: scaleEasing,
				},
				'<',
			)
			.to(
				el,
				{
					filter: 'blur(0rem)',
					duration: isOuterSmallPetals
						? 0
						: (0.314 + layerStaggering * 0.314) / timeScale,
					ease: 'circ.out',
				},
				'<',
			)
			.to(
				el,
				{
					rotate: '0deg',
					duration: (1.314 + layerStaggering * 0.5) / timeScale,
					ease: 'elastic.out(1, 0.618)',
				},
				'<',
			)
			.addPause()
			.play();
	}

	export function TweenOutBloomIconLayerAnimation(
		el: HTMLImageElement,
		layerNumber: number,
		layerStaggering: number,
		layerName: BloomIconLayerName,
		timeScale: number = 1,
		layerTimeline: gsap.core.Timeline = gsap.timeline({}),
	) {
		const isOuterSmallPetals = layerName === 'outerSmallPetals';
		const beginningLayerRotationDeg = layerStaggering * (180 / numUniqueBloomIconLayerStaggers);
		const extraStaggerIfOuterSmallPetals = isOuterSmallPetals
			? ((numUniqueBloomIconLayerStaggers - 1) * 0.25) / timeScale
			: 0;

		return layerTimeline
			.invalidate()
			.to(el, {
				opacity: 0,
				scale: 0,
				filter: `blur(${isOuterSmallPetals ? 0 : 0.25}rem)`,
				rotate: `-${isOuterSmallPetals ? 0 : beginningLayerRotationDeg * 0.75}deg`,
				duration:
					(2.0 - layerStaggering * 0.1 - extraStaggerIfOuterSmallPetals / 2) / timeScale,
				ease: 'back.in',
				delay: (layerStaggering * 0.075 + (isOuterSmallPetals ? 0 : 0.618)) / timeScale,
			})
			.addPause()
			.play();
	}
</script>

<script lang="ts">
	let logoComponents = $derived(directories.imagery + '/logo/components/');

	let {
		containerProps = {},
		layerProps = {},
	}: {
		containerProps?: BloomIconContainerProps;
		layerProps?: BloomIconLayerProps;
	} = $props();
</script>

<!-- <img src="{directories.imagery}/logo/logo.png" alt="VSBloom Icon" {...restProps} /> -->
<!-- The VSBloom Logo here is made up of 6 different webp layers to allow for dynamic animation. -->
<div
	class="vsbloom-icon-layer-container"
	{@attach (el) => HandleIconContainerAttachment(el, containerProps)}
	{...containerProps}
>
	<img
		class="vsbloom-icon-layer"
		{...layerProps}
		{@attach (el) => HandleIconLayerAttachment(el, layerProps)}
		src="{logoComponents}/outerLargePetals.webp"
		id="vsbloom-icon-layer-6"
		alt="VSBloom Logo Outer Large Petals"
	/>
	<img
		class="vsbloom-icon-layer"
		{...layerProps}
		{@attach (el) => HandleIconLayerAttachment(el, layerProps)}
		src="{logoComponents}/outerSmallPetals.webp"
		id="vsbloom-icon-layer-5"
		alt="VSBloom Logo Outer Small Petals"
	/>
	<img
		class="vsbloom-icon-layer"
		{...layerProps}
		{@attach (el) => HandleIconLayerAttachment(el, layerProps)}
		src="{logoComponents}/mainPetals.webp"
		id="vsbloom-icon-layer-4"
		alt="VSBloom Logo Main Petals"
	/>
	<img
		class="vsbloom-icon-layer"
		{...layerProps}
		{@attach (el) => HandleIconLayerAttachment(el, layerProps)}
		src="{logoComponents}/coreHexagon.webp"
		id="vsbloom-icon-layer-3"
		alt="VSBloom Logo Core Hexagon"
	/>
	<img
		class="vsbloom-icon-layer"
		{...layerProps}
		{@attach (el) => HandleIconLayerAttachment(el, layerProps)}
		src="{logoComponents}/innerCorePetals.webp"
		id="vsbloom-icon-layer-2"
		alt="VSBloom Logo Inner Core Petals"
	/>
	<img
		class="vsbloom-icon-layer"
		{...layerProps}
		{@attach (el) => HandleIconLayerAttachment(el, layerProps)}
		src="{logoComponents}/centerStar.webp"
		id="vsbloom-icon-layer-1"
		alt="VSBloom Logo Center Star"
	/>
</div>

<style>
	.vsbloom-icon-layer-container {
		display: block;
		position: relative;
		width: 100%;
		height: 100%;
		aspect-ratio: 1/1;
	}
	.vsbloom-icon-layer {
		transform-origin: center center;
		transform-box: fill-box;
		position: absolute;
		top: 0;
		left: 0;
		width: auto;
		height: auto;
		object-fit: cover;
	}
</style>
