<script lang="ts">
	import { pageData } from '../../Global/Pages.svelte';
	import PageContainer from '../PageContainer.svelte';
	import { Button } from '$webview-svelte-lib/components/ui/button';
	import { SetCurrentPage } from '../../Global/Pages.svelte';
</script>

<PageContainer>
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

	<div class="return-interaction center-text self-center mx-auto">
		<Button onclick={() => SetCurrentPage('Main Menu')} title="There's no place like home.">
			Return to Main Page
		</Button>
	</div>
</PageContainer>

<style>
	@keyframes titleTextShadowPulse {
		0% {
			text-shadow: 0px 0px 1px
				color-mix(
					in srgb,
					var(--vscode-errorForeground) 50%,
					var(--vscode-disabledForeground) 50%
				);
		}
		100% {
			text-shadow: 0px 0px 2.125px
				color-mix(
					in srgb,
					var(--vscode-errorForeground) 50%,
					var(--vscode-disabledForeground) 50%
				);
		}
	}
	.center-text {
		text-align: center;
	}
	.title-text {
		padding-top: 0.5rem;
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
		transition:
			padding 0.618s var(--vsbloom-bouncy-ease),
			border-color 0.618s var(--vsbloom-bouncy-ease),
			border-radius 0.618s var(--vsbloom-bouncy-ease);

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
	.return-interaction {
		width: fit-content;
		height: min-content;

		font-size: 1.5vmax;

		margin: 0 auto;
		margin-top: 3rem;
	}
</style>
