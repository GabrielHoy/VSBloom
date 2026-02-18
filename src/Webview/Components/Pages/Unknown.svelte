<script lang="ts">
    import { directories } from "../../Global/Directories.svelte";
    import { pageData, type PageDescriptor } from "../../Global/Pages.svelte";
    import PageContainer from "../PageContainer.svelte";

    function ReturnToMainPage() {
        pageData.currentPage = "Main Menu";
    }
</script>

<div class="main-page-container">
	<h1 class="title-text center-text">Unknown Page</h1>
    <h5 class="subtitle-remark center-text">Oops. This is definitely an error.</h5>

    <div class="debug-info-container">
        <p class="debug-key center-text"><i>Current Page ID:</i></p>
        <p class="debug-value center-text">{pageData.currentPage}</p>
    </div>
    <div class="debug-info-container">
        <p class="debug-key center-text"><i>Known Page ID's:</i></p>
        {#each pageData.pages.keys() as pageId}
            <p class="debug-value center-text">{pageId}</p>
        {/each}
    </div>

    <div class="return-interaction-container center-text">
        <button class="return-to-main-page-button center-text" on:click={ReturnToMainPage}>Return to Main Page</button>
    </div>
</div>

<style>
    @keyframes titleTextShadowPulse {
        0% {
            text-shadow: 0px 0px 1px color-mix(in srgb, var(--vscode-errorForeground) 50%, var(--vscode-disabledForeground) 50%);
        }
        100% {
            text-shadow: 0px 0px 2.125px color-mix(in srgb, var(--vscode-errorForeground) 50%, var(--vscode-disabledForeground) 50%);
        }
    }

    .main-page-container {
        width: auto;
        height: auto;
        padding-top: 1rem;
    }
    .center-text {
        text-align: center;
    }
    .title-text {
        color: var(--vscode-errorForeground);
        font-weight: bold;
        margin: 0 auto;
        animation: titleTextShadowPulse 0.618s ease-in-out infinite alternate;
    }
    .subtitle-remark {
        color: var(--vscode-disabledForeground);
        font-style: italic;
        margin: 0 auto;
        margin-bottom: 2.5rem;
    }
    .debug-info-container {
        background-color: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-editorWidget-border);
        padding: 0.25rem 0.5rem;
        width: fit-content;
        height: auto;
        margin: 0 auto;
        margin-bottom: 0.5rem;
        border-radius: 1rem;
        transition: padding 0.618s var(--vsbloom-bouncy-ease), border-color 0.618s var(--vsbloom-bouncy-ease), border-radius 0.618s var(--vsbloom-bouncy-ease);

        &:hover {
            border-color: var(--vscode-foreground);
            padding: 0.325rem 0.618rem;
            border-radius: 0.75rem;
        }
    }
    .debug-key {
        font-size: 0.75rem;
        margin: 0 auto;
        font-weight: bold;
    }
    .debug-value {
        font-size: 0.5rem;
        margin: 0 auto;
    }
    .return-interaction-container {
        width: 100%;
        height: auto;
        margin: 0 auto;
        margin-top: 3rem;
    }
    .return-to-main-page-button {
        margin: 0 auto;
        padding: 0.4rem 0.8rem;
        border-radius: 0.5rem;
        text-align: center;
        color: var(--vscode-button-secondaryForeground);
        background-color: var(--vscode-button-secondaryBackground);
        border: 1px solid var(--vscode-button-separator);
        transition: background-color 0.618s var(--vsbloom-bouncy-ease), filter 0.618s var(--vsbloom-bouncy-ease), border-color 0.618s var(--vsbloom-bouncy-ease), border-radius 0.618s var(--vsbloom-bouncy-ease), transform 0.618s var(--vsbloom-bouncy-ease), padding 0.618s var(--vsbloom-bouncy-ease);
        cursor: pointer;

        &:hover {
            background-color: var(--vscode-button-background);
            border-color: var(--vscode-foreground);
            padding: 0.5rem 1rem;
            transform: scale(1.075);
        }
        &:active {
            filter: brightness(125%);
            transform: scale(0.9);
            padding: 0.375rem 0.75rem;
            border-radius: 0.25rem;
        }
    }
</style>