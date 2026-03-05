<script lang="ts">
	import type { PageDescriptor } from '../../Global/Pages.svelte';
	import { pageData, SetCurrentPage } from '../../Global/Pages.svelte';
	import Splash from '../Splash.svelte';
	import PageContainer from '../PageContainer.svelte';
	// import Button from "../Primitives/Button.svelte";
	import { vscode } from '../../Util/VSCodeAPI';
	import { Button } from '$webview-svelte-lib/components/ui/button';
	import { Spinner } from '$webview-svelte-lib/components/ui/spinner';

	let pageNameSwappingTo: string | null = $state(null);
</script>

{#snippet PageSwapButton(descriptor: PageDescriptor)}
	<Button
		disabled={descriptor.notFinished || pageNameSwappingTo !== null}
		title={descriptor.description}
		class="page-swap-button"
		onclick={(e) => {
			pageNameSwappingTo = descriptor.name;
			setTimeout(() => {
				SetCurrentPage(descriptor.name);
			}, 250);
		}}
		ondisabledclick={(e) => {
			e.currentTarget.animate(
				[
					{
						color: 'red',
						filter: 'blur(2.5px) contrast(150%)',
						scale: 0.9,
						transform: 'skewX(-7.5deg)',
						rotate: Math.sign(Math.random() - 0.5) * 2.5 + 'deg',
					},
					{
						color: 'currentColor',
						filter: 'blur(0px) contrast(100%)',
						scale: 1,
						transform: 'skewX(0deg)',
						rotate: '0deg',
					},
				],
				{
					duration: 1000,
					easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
				},
			);
			vscode.NotifyUser(
				'warning',
				`The "${descriptor.name}" page isn't finished yet, check back later!`,
			);
		}}
	>
		{#if pageNameSwappingTo === descriptor.name}
			<Spinner />
		{/if}
		{descriptor.name}
	</Button>
{/snippet}

<PageContainer>
	<!-- main vsbloom logo & splash text for main page -->
	<Splash subTitle="Main Menu" />

	<!-- container for the 'main' page navigation buttons -->
	<div class="page-selection-container">
		{#each pageData.pages.values() as descriptor (descriptor.name)}
			<!--
                ignore current page, don't want to show a nav button to where we already are
                (same deal with pages that are not 'meant' to be shown to the user)
            -->
			{#if descriptor.name !== pageData.currentPage && !descriptor.hideFromUser}
				{@render PageSwapButton(descriptor)}
			{/if}
		{/each}
	</div>
</PageContainer>

<style>
	.page-selection-container {
		/* width: 75%; */
		min-width: max-content;
		max-width: 17.5vw;
		height: fit-content;
		position: absolute;
		top: 57.5%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0 auto;

		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: stretch;
		text-align: center;
		gap: 0.5rem 0rem;
	}
</style>
