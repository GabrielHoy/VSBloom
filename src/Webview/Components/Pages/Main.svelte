<script lang="ts">
    import type { PageDescriptor } from "../../Global/Pages.svelte";
    import { pageData, SetCurrentPage } from "../../Global/Pages.svelte";
    import Splash from "../Splash.svelte";
    import PageContainer from "../PageContainer.svelte";
    // import Button from "../Primitives/Button.svelte";
    import { vscode } from "../../Util/VSCodeAPI";
    import { Button } from "$webview-svelte-lib/components/ui/button";
    import { Spinner } from "$webview-svelte-lib/components/ui/spinner";
    
    let pageNameSwappingTo: string | null = $state(null);
</script>

{#snippet PageSwapButton(descriptor: PageDescriptor)}
    <Button
        disabled={descriptor.notFinished || (pageNameSwappingTo !== null)}
        title={descriptor.description}
        class="page-swap-button"
        onclick={() => {
            pageNameSwappingTo = descriptor.name;
            setTimeout(() => {
                SetCurrentPage(descriptor.name);
            }, 250);
        }}
        ondisabledclick={() => {
            vscode.NotifyUser("warning", `The "${descriptor.name}" page isn't finished yet, check back later!`);
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
                ignore current page, dont want to show a nav button to where we already are
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