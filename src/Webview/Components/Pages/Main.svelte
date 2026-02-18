<script lang="ts">
    import { directories } from "../../Global/Directories.svelte";
    import type { PageDescriptor } from "../../Global/Pages.svelte";
    import { pageData } from "../../Global/Pages.svelte";
    import Splash from "../Splash.svelte";
    import PageButton from "../UX/PageButton.svelte";
    import PageContainer from "../PageContainer.svelte";
</script>

{#snippet PageSwapButton(descriptor: PageDescriptor)}
    <div class={["page-swap-button-container", descriptor.notFinished && "unfinished"]}>
        <PageButton pageName={descriptor.name} unfinished={descriptor.notFinished}>{descriptor.name}</PageButton>
    </div>
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
    .page-swap-button-container {
        display: inline-block;
        width: 100%;
        transition: margin-top 1s var(--vsbloom-bouncy-ease), margin-bottom 1s var(--vsbloom-bouncy-ease);

        --button-height: max(1.25rem, 3.25vmax);
        height: var(--button-height);

        &:not(.unfinished) {
            &:hover {
                margin-top: 0.1em;
                margin-bottom: 0.1em;
            }
    
            &:active {
                margin-top: 0.25em;
                margin-bottom: 0.25em;
            }
        }
    }
</style>