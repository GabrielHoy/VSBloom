<script lang="ts">
    import { vscode } from "../../../Util/VSCodeAPI";
    import { directories } from "../../../Global/Directories.svelte";
    import { pageData, type PageDescriptor } from "../../../Global/Pages.svelte";
    import PageContainer from "../../PageContainer.svelte";
    import PageHeader from "../../PageHeader.svelte";
    import extensionPackageJSON from "../../../../../package.json";
    import * as Tabs from '$webview-svelte-lib/components/ui/tabs/index';
    import * as Accordion from '$webview-svelte-lib/components/ui/accordion/index';
    import { Button } from '$webview-svelte-lib/components/ui/button';
    import { Separator } from "$webview-svelte-lib/components/ui/separator";
    import { Checkbox } from "$webview-svelte-lib/components/ui/checkbox";
    import { persistentState, MutatePersistentState } from "../../../Global/PersistentWebviewState.svelte";
    import { fade, fly } from "svelte/transition";
    import { backIn, backOut, cubicIn, cubicOut } from "svelte/easing";
    import BadgeInfoIcon from "@lucide/svelte/icons/badge-info"
    import type { Snippet } from "svelte";
    import { effectSettings, UpdateEffectSetting, type PropertyEntry } from "../../../Global/Settings.svelte";

    function GetPrettifiedPropertyPathSegments(internalPath: string): string[] {
        // skip `vsbloom.` prefix, capitalize first letter, insert space before each capital letter
        return internalPath
            .split('.')
            .slice(1)
            .map(part =>
                part
                    // insert a space before any capital letters (except at the start)
                    // this also excludes capital letters that are preceded by a hyphen to look prettier
                    .replace(/(?<!-)([A-Z])/g, ' $1')
                    // capitalize the first letter
                    .replace(/^./, first => first.toUpperCase())
                    // remove any leading/trailing whitespace
                    .trim()
            );
    }

    const prettifiedCategoryNameMapping: Record<string, string> = {
        "VS: Bloom": "General",
        "Electron Patcher": "Patcher",
        "Effect Rendering": "Renderer",
        "Editor Effects": "Editor",
        "Window Effects": "Window",
    };
    const blacklistedPathsForWebviewSettingsDisplay: string[] = [
        "vsbloom.extensionConfigurationsNote"
    ]
    
    let effectSettingsByCategoryName = $derived(effectSettings.default.reduce((esBuilder, category) => {
        esBuilder[category.title] = category;
        return esBuilder;
    }, {} as Record<string, typeof effectSettings.default[number]>));

    let currentlySelectedCategory = $state(persistentState.settingsPage.currentCategory ?? effectSettings.default[1].title);

    // title animation & change handling depending on selected category
    $effect(() => {
        const prettyCatTitle: string | undefined = prettifiedCategoryNameMapping[currentlySelectedCategory];
        vscode.ChangeTitle(prettyCatTitle ? `${prettyCatTitle} Settings` : "Extension Settings");
    });

    type PropertyEntryWithPath = PropertyEntry & { settingPath: string };

    let propSubcategoryData = $derived(
        effectSettings.default.reduce<Record<string, Record<string, PropertyEntryWithPath[]>>>((acc, category) => {
            const subcategories: Record<string, PropertyEntryWithPath[]> = {};

            for (const [propPath, propData] of Object.entries(category.properties)) {
                if (blacklistedPathsForWebviewSettingsDisplay.some(bp => propPath.startsWith(bp))) {
                    continue;
                }

                const pathCategory = propPath.split(".").slice(0, 2).join(".");
                if (!subcategories[pathCategory]) {
                    subcategories[pathCategory] = [];
                }
                subcategories[pathCategory].push({ ...propData, settingPath: propPath, hideFromCustomEditor: propData.hideFromCustomEditor });
            }

            acc[category.title] = subcategories;
            return acc;
        }, {})
    );

    const configPropInputTypeSnippets: Record<string, (propData: PropertyEntryWithPath, topLevelCatIdx: number) => ReturnType<Snippet>> = {
        "boolean": BooleanInput
    }

    // Trigger a settings sync when loading the settings page at any point
    // to ensure we're up to date display wise
    vscode.PostToExtension({
        type: 'request-settings-sync',
        data: undefined
    });
</script>

{#snippet BooleanInput(propData: PropertyEntryWithPath, topLevelCatIdx: number)}
    <div class="inline-block align-middle px-2.5">
        <Checkbox style="transform: scale(1.618);"
            indeterminate={effectSettings.values[propData.settingPath] === undefined}
            checked={effectSettings.values[propData.settingPath] === true}
            onCheckedChange={(newVal: boolean) => {
                if (newVal == propData.default) {
                    UpdateEffectSetting(propData.settingPath, undefined);
                    return;
                }

                UpdateEffectSetting(propData.settingPath, newVal);
            }}
        />
    </div>
{/snippet}
{#snippet UnknownFallbackInput(propData: PropertyEntryWithPath, topLevelCatIdx: number)}
    <div class="inline-block align-middle" title="This property type isn't supported by the VS: Bloom Settings Editor yet; you'll need to configure it via the default VS Code settings view to change it for now.">
        <BadgeInfoIcon class="size-7 fill-red-900 stroke-pink-300 -translate-y-1/8 transition-all duration-300 hover:scale-110 overflow-visible"></BadgeInfoIcon>
    </div>
{/snippet}


{#snippet ConfigurableProperty(propData: PropertyEntryWithPath, topLevelCatIdx: number)}
    <div class="config-property">
        <p class="config-property-name">
            <!-- dash between left padding and property name -->
            <span
                class="config-property-name-text"
                title={propData.description ?? "No description is available for this property yet."}
            >
                {GetPrettifiedPropertyPathSegments(propData.settingPath).slice(1).join(" > ")}:
            </span>
            {@render (configPropInputTypeSnippets[propData.type] ?? UnknownFallbackInput)(propData, topLevelCatIdx)}
        </p>
    </div>
{/snippet}

<PageContainer>
    <PageHeader title="Extension Settings"/>
    
    <div class="settings-container">
        <Tabs.Root
            value={currentlySelectedCategory}
            onValueChange={(newVal) => {
                currentlySelectedCategory = newVal;
                MutatePersistentState({ settingsPage: { currentCategory: newVal }});
            }}
        >
            <!-- Category tabs -->
            <div class="tab-list-container">
                <Tabs.List class="py-0.5">
                    {#each effectSettings.default as category, catIdx}
                        <!-- Only show tab if there are actually non-blacklisted properties to display -->
                        {#if Object.keys(propSubcategoryData[category.title]).length !== 0}
                            <Tabs.Trigger
                                value={category.title}
                                title={currentlySelectedCategory !== category.title ? category.categoryDescription ?? undefined : undefined}
                            >
                                {prettifiedCategoryNameMapping[category.title] ?? category.title}
                            </Tabs.Trigger>
                            {#if catIdx < effectSettings.default.length - 1}
                                <Separator
                                    orientation="vertical"
                                    class="mx-1"
                                    style="height: 75%; min-height: 25%; max-height: 75%; background: linear-gradient(to bottom, transparent, var(--vscode-editor-foreground), var(--vscode-editor-foreground), transparent);"
                                />
                            {/if}
                        {/if}
                    {/each}
                </Tabs.List>
                <!-- Description of the currently selected category - if applicable -->
                {#if effectSettingsByCategoryName[currentlySelectedCategory].categoryDescription}
                    <div
                        class="category-description-container"
                    >
                        {#key currentlySelectedCategory}
                        <p
                            class="category-description"
                            in:fly={{ delay: 100, duration: 100, opacity: 0, y: "100%", easing: backOut }}
                            out:fly={{ duration: 100, y: "-100%", easing: backIn }}
                        >
                            {effectSettingsByCategoryName[currentlySelectedCategory].categoryDescription}
                        </p>
                        {/key}
                    </div>
                {/if}
            </div>

            <!-- Each category's content -->
            {#each effectSettings.default as category, catIdx}
                <Tabs.Content value={category.title}>
                    <div class="settings-accordion">
                        <Accordion.Root type="multiple" value={Object.keys(propSubcategoryData[category.title]).length > 1 ? [] : [Object.keys(propSubcategoryData[category.title])[0]]}>
                            {#each Object.entries(propSubcategoryData[category.title]) as [pathCategory, properties]}
                                <Accordion.Item value={pathCategory}>
                                    <Accordion.Trigger
                                        class=""
                                    >
                                        {GetPrettifiedPropertyPathSegments(pathCategory).join(" > ")}
                                    </Accordion.Trigger>
                                    <Accordion.Content
                                        class="mx-5"
                                    >
                                        <div class="config-property-list-container">
                                            {#each properties as propertyData}
                                                {#if !propertyData.hideFromCustomEditor}
                                                    {@render ConfigurableProperty(propertyData, catIdx)}
                                                {/if}
                                            {/each}
                                        </div>
                                    </Accordion.Content>
                                </Accordion.Item>
                            {:else}
                                <p><i><u>No extension properties found for category "{category.title}" <b>(???)</b></u></i></p>
                            {/each}
                        </Accordion.Root>
                    </div>
                </Tabs.Content>
            {/each}
        </Tabs.Root>
    </div>
</PageContainer>

<style>
    .settings-container {
        padding: 1em 0em 0 0em;
        width: 100%;
        height: auto;
        display: block;
        justify-content: center;
        align-items: center;
    }
    .tab-list-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .category-description-container {
        text-align: center;
        font-size: 0.7em;
        font-style: oblique;
        opacity: 0.5;
        min-height: 0.7em;
        margin-bottom: 2em;
    }
    .category-description {
        position: absolute;
        transform: translateX(-50%);
    }
    .config-property-list-container {
        padding: 0.5em 0 0.5em 0;
    }
    .config-property {
        padding: 0.618em 0 0.618em 0;
        &:last-child {
            padding-bottom: 0;
        }
        &:first-child {
            padding-top: 0;
        }
    }
    .config-property-name {

        user-select: none;
        font-size: 1.3141592em;
    }
    .config-property-name-text {
        transition: border-bottom 0.1618s ease-in-out;
        border-bottom: 0px solid transparent;
        
        &:hover {
            cursor: help;
            border-bottom: 1px solid;
        }
    }
</style>