<script lang="ts">
    import { vscode } from "../../Util/VSCodeAPI";
    import { directories } from "../../Global/Directories.svelte";
    import { pageData, type PageDescriptor } from "../../Global/Pages.svelte";
    import PageContainer from "../PageContainer.svelte";
    import PageHeader from "../PageHeader.svelte";
    import extensionPackageJSON from "../../../../package.json";
    import * as Tabs from '$webview-svelte-lib/components/ui/tabs/index';
    import * as Accordion from '$webview-svelte-lib/components/ui/accordion/index';
    import { Button } from '$webview-svelte-lib/components/ui/button';
    import { Separator } from "$webview-svelte-lib/components/ui/separator";
    import { Checkbox } from "$webview-svelte-lib/components/ui/checkbox";
    import { Input } from "$webview-svelte-lib/components/ui/input";
    import { persistentState, MutatePersistentState } from "../../Global/PersistentWebviewState.svelte";
    import { fade, fly } from "svelte/transition";
    import { backIn, backOut, cubicIn } from "svelte/easing";
    import BadgeInfoIcon from "@lucide/svelte/icons/badge-info"
    import type { Snippet } from "svelte";
    import { effectSettings, UpdateEffectSetting, type PropertyEntry } from "../../Global/Settings.svelte";

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
    const configPropInputTypeSnippets: Record<string, (propData: ProcessedPropertyEntry, topLevelCatIdx: number) => ReturnType<Snippet>> = {
        "boolean": BooleanInput,
        "number": NumberInput,
        "string": StringInput
    }
    
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

    type ProcessedPropertyEntry = PropertyEntry & {
        settingPath: string,
        step?: number,
        displayedUnit?: string,
        enum?: (string | number)[]
    };

    let subcategoriesExpanded: Map<string, string[]> = $state(persistentState.settingsPage.subcategoriesExpanded ? new Map<string, string[]>(Object.entries(persistentState.settingsPage.subcategoriesExpanded)) : new Map<string, string[]>());

    let propSubcategoryData = $derived(
        effectSettings.default.reduce<Record<string, Record<string, ProcessedPropertyEntry[]>>>((acc, category) => {
            const subcategories: Record<string, ProcessedPropertyEntry[]> = {};

            for (const [propPath, propData] of Object.entries(category.properties)) {
                if (blacklistedPathsForWebviewSettingsDisplay.some(bp => propPath.startsWith(bp))) {
                    continue;
                }

                const pathCategory = propPath.split(".").slice(0, 2).join(".");
                if (!subcategories[pathCategory]) {
                    subcategories[pathCategory] = [];
                }

                subcategories[pathCategory].push({
                    ...propData,
                    settingPath: propPath,
                    hideFromCustomEditor: propData.hideFromCustomEditor,
                });
            }

            acc[category.title] = subcategories;
            return acc;
        }, {})
    );

    let disabledProps: Set<string> = $derived(Object.entries(effectSettings.values).reduce<Set<string>>((builderSet, [path, value]) => {
        if (path.endsWith(".enabled")) {
            return builderSet;
        }

        const possibleEnabledPath = path.split(".").slice(0,-1).join(".") + ".enabled";
        const hasEnabledProperty = effectSettings.values[possibleEnabledPath] !== undefined;
        if (hasEnabledProperty && !effectSettings.values[possibleEnabledPath]) {
            builderSet.add(path);
        }

        return builderSet;
    }, new Set<string>()));

    //it's annoying that this has to be done so manually...am I doing something wrong?
    function resizeToTextContent(node: HTMLElement) {
        const input = node.querySelector('input');
        if (!input) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        function resize() {
            const extraTextPadding = input!.type === "number" ? "0000" : "";

            ctx.font = getComputedStyle(input!).font;
            const textWidth = ctx.measureText(input!.value ? input!.value + extraTextPadding : '').width;
            const placeholderWidth = input!.placeholder
                ? ctx.measureText(input!.placeholder + extraTextPadding).width
                : 0;
            const cs = getComputedStyle(input!);
            const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
                          + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
            input!.style.width = `calc(((${(Math.ceil(Math.max(textWidth, placeholderWidth))) / parseFloat(getComputedStyle(input!).fontSize)}) * 1em) + ${padding}px)`;
        }

        const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        Object.defineProperty(input, 'value', {
            get() { return valueDesc.get!.call(this); },
            set(v) { valueDesc.set!.call(this, v); resize(); },
            configurable: true,
        });

        resize();
        input.addEventListener('input', resize);

        // observe changes to the 'style' attribute for --scale-factor updates
        const rootObserver = new MutationObserver(() => {
            resize();
        });
        rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

        return {
            destroy() {
                input!.removeEventListener('input', resize);
                rootObserver.disconnect();
                delete (input as any).value;
            },
        };
    }

    // Trigger a settings sync when loading the settings page at any point
    // to ensure we're up to date display wise
    vscode.PostToExtension({
        type: 'request-settings-sync',
        data: undefined
    });
</script>

{#snippet BooleanInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
    <div class="inline-block align-middle px-2.5">
        <Checkbox
            style="transform: scale(1.618);"
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
{#snippet NumberInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
    <div class="inline-flex align-middle px-1" use:resizeToTextContent>
        <Input
            type="number"
            value={effectSettings.values[propData.settingPath] ?? propData.default}
            step={propData.step ?? undefined}
            placeholder={propData.default.toLocaleString()}
            onchange={(e) => {
                if (Number.isNaN(e.currentTarget.valueAsNumber)) {
                    e.currentTarget.value = effectSettings.values[propData.settingPath] ?? propData.default.toLocaleString();
                    e.currentTarget.animate([
                        {
                            color: "red",
                            scale: 0.9,
                            filter: "blur(2.5px) contrast(150%)",
                            rotate: (Math.sign(Math.random()-0.5) * 10) + "deg"
                        },
                        {
                            color: "currentColor",
                            scale: 1,
                            filter: "blur(0px) contrast(100%)",
                            rotate: "0deg"
                        },
                    ], {
                        duration: 500,
                        easing: "cubic-bezier(0.175, 0.885, 0.32, 1.275)"
                    });
                    vscode.NotifyUser("error", `${GetPrettifiedPropertyPathSegments(propData.settingPath).slice(1).join(" > ")}: Invalid/NaN value, resetting to last valid value.`);
                } else {
                    if (e.currentTarget.valueAsNumber === propData.default) {
                        UpdateEffectSetting(propData.settingPath, undefined);
                    } else {
                        UpdateEffectSetting(propData.settingPath, e.currentTarget.valueAsNumber);
                    }
                }

            }}
        />
        {#if propData.displayedUnit}
            <span class="translate-y-4 text-sm">
                {propData.displayedUnit}
            </span>
        {/if}
    </div>
{/snippet}
{#snippet StringInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
    <div class="inline-flex align-middle px-1" use:resizeToTextContent>
        <Input
            type="text"
            value={effectSettings.values[propData.settingPath] ?? propData.default}
            placeholder={propData.default.toLocaleString()}
            onchange={(e) => {
                if (e.currentTarget.value === propData.default) {
                    UpdateEffectSetting(propData.settingPath, undefined);
                } else {
                    UpdateEffectSetting(propData.settingPath, e.currentTarget.value);
                }
            }}
        />
        {#if propData.displayedUnit}
            <span class="translate-y-4 text-sm">
                {propData.displayedUnit}
            </span>
        {/if}
    </div>
{/snippet}
{#snippet EnumInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
    {@render UnknownFallbackInput(propData, topLevelCatIdx)}
{/snippet}
{#snippet UnknownFallbackInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
    <div class="inline-block align-middle" title="This property type isn't supported by the VS: Bloom Settings Editor yet; you'll need to configure it via the default VS Code settings view to change it for now.">
        <BadgeInfoIcon class="size-7 fill-red-900 stroke-pink-300 -translate-y-1/8 transition-all duration-300 hover:scale-110 overflow-visible"></BadgeInfoIcon>
    </div>
{/snippet}

{#snippet ConfigurableProperty(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
    <div class="config-property {disabledProps.has(propData.settingPath) ? 'disabled-config-property' : ''}">
        <p class="config-property-entry">
            <span
                class="config-property-name-text"
                title={propData.description ? propData.description : "No description is available for this property yet."}
            >
                {GetPrettifiedPropertyPathSegments(propData.settingPath).slice(1).join(" > ")}:
            </span>
            {#if propData.enum}
                {@render EnumInput(propData, topLevelCatIdx)}
            {:else}
                {@render (configPropInputTypeSnippets[propData.type] ?? UnknownFallbackInput)(propData, topLevelCatIdx)}
            {/if}
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
                MutatePersistentState({ settingsPage: { ...persistentState.settingsPage, currentCategory: newVal }});
            }}
        >
            <!-- Category tabs -->
            <div class="tab-list-container">
                <Tabs.List class="py-0.5">
                    {#each effectSettings.default as category, catIdx}
                        <!-- Only show tab if there are actually non-blacklisted properties to display -->
                        {#if Object.keys(propSubcategoryData[category.title]).length !== 0}
                            <Tabs.Trigger
                                class="select-none"
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
                        <Accordion.Root
                            type="multiple"
                            value={Object.keys(propSubcategoryData[category.title]).length > 1 ? (subcategoriesExpanded.get(category.title) ?? []) : [Object.keys(propSubcategoryData[category.title])[0]]}
                            onValueChange={(newVal) => {
                                if (newVal.length === 0) {
                                    subcategoriesExpanded.delete(category.title);
                                } else {
                                    subcategoriesExpanded.set(category.title, newVal);
                                }

                                if (subcategoriesExpanded.size === 0) {
                                    MutatePersistentState({ settingsPage: { ...persistentState.settingsPage, subcategoriesExpanded: undefined }});
                                } else {
                                    MutatePersistentState({ settingsPage: { 
                                        ...persistentState.settingsPage, 
                                        subcategoriesExpanded: Object.fromEntries(subcategoriesExpanded) 
                                    }});
                                }
                            }}
                        >
                            {#each Object.entries(propSubcategoryData[category.title]) as [pathCategory, properties]}
                                <Accordion.Item value={pathCategory}>
                                    <Accordion.Trigger
                                        class="select-none"
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
        user-select: none;
        pointer-events: none;
    }
    .category-description {
        position: absolute;
        transform: translateX(-50%);
    }
    .config-property-list-container {
        padding: 0.5em 0 0.5em 0;
    }
    .config-property {
        transition: all 0.5s var(--vsbloom-bouncy-ease);

        padding: 0.618em 0 0.618em 0;
        &:last-child {
            padding-bottom: 0;
        }
        &:first-child {
            padding-top: 0;
        }
    }
    .disabled-config-property {
        opacity: 0.75;
        scale: 0.95;
        translate: -2.5% 0;
        transform: skewX(-7.5deg);
        padding: 0.15em 0 0.15em 0;
        &:last-child {
            padding-bottom: 0;
        }
        &:first-child {
            padding-top: 0;
        }
    }
    .config-property-entry {
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