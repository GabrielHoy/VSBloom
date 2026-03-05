<script lang="ts">
	import { vscode } from '../../../Util/VSCodeAPI';
	import { colord } from 'colord';
	import PageContainer from '../../PageContainer.svelte';
	import PageHeader from '../../PageHeader.svelte';
	import * as Tabs from '$webview-svelte-lib/components/ui/tabs/index';
	import * as Accordion from '$webview-svelte-lib/components/ui/accordion/index';
	import * as Select from '$webview-svelte-lib/components/ui/select/index';
	import * as Dialog from '$webview-svelte-lib/components/ui/dialog/index';
	import { buttonVariants } from '$webview-svelte-lib/components/ui/button';
	import { Separator } from '$webview-svelte-lib/components/ui/separator';
	import { Checkbox } from '$webview-svelte-lib/components/ui/checkbox';
	import { Input } from '$webview-svelte-lib/components/ui/input';
	import {
		persistentState,
		MutatePersistentState,
	} from '../../../Global/PersistentWebviewState.svelte';
	import { fade, fly } from 'svelte/transition';
	import { backIn, backOut } from 'svelte/easing';
	import Markdown from 'svelte-exmarkdown';
	import BadgeInfoIcon from '@lucide/svelte/icons/badge-info';
	import type { Snippet } from 'svelte';
	import ColorWrapper from './ColorWrapper.svelte';
	import ColorPicker from '$webview-svelte-lib/components/ui/ColorPicker';
	import ColorPickerPreview from './ColorPickerPreview.svelte';
	import {
		effectSettings,
		UpdateEffectSetting,
		type PropertyEntry,
	} from '../../../Global/Settings.svelte';

	function GetPrettifiedPropertyPathSegments(internalPath: string): string[] {
		// skip `vsbloom.` prefix, capitalize first letter, insert space before each capital letter
		return internalPath
			.split('.')
			.slice(1)
			.map((part) =>
				part
					// insert a space before any capital letters (except at the start)
					// this also excludes capital letters that are preceded by a hyphen to look prettier
					.replace(/(?<!-)([A-Z])/g, ' $1')
					// capitalize the first letter
					.replace(/^./, (first) => first.toUpperCase())
					// remove any leading/trailing whitespace
					.trim(),
			);
	}

	const prettifiedCategoryNameMapping: Record<string, string> = {
		'VS: Bloom': 'General',
		'Electron Patcher': 'Patcher',
		'Effect Rendering': 'Renderer',
		'Editor Effects': 'Editor',
		'Window Effects': 'Window',
	};
	const blacklistedPathsForWebviewSettingsDisplay: string[] = [
		'vsbloom.extensionConfigurationsNote', //this just brings the user to the menu when clicked - and they'd already be here if they're on this page
		'vsbloom.statusBarIcon', //only other setting within "General", so hiding this makes things neater and gets rid of the entire category
	];
	const configPropInputTypeSnippets: Record<
		string,
		(propData: ProcessedPropertyEntry, topLevelCatIdx: number) => ReturnType<Snippet>
	> = {
		boolean: BooleanInput,
		number: NumberInput,
		string: StringInput,
	};

	let effectSettingsByCategoryName = $derived(
		effectSettings.default.reduce(
			(esBuilder, category) => {
				esBuilder[category.title] = category;
				return esBuilder;
			},
			{} as Record<string, (typeof effectSettings.default)[number]>,
		),
	);

	let currentlySelectedCategory = $state(
		persistentState.settingsPage.currentCategory ?? effectSettings.default[1].title,
	);

	// title animation & change handling depending on selected category
	$effect(() => {
		const prettyCatTitle: string | undefined =
			prettifiedCategoryNameMapping[currentlySelectedCategory];
		vscode.ChangeTitle(prettyCatTitle ? `${prettyCatTitle} Settings` : 'Extension Settings');
	});

	type ProcessedPropertyEntry = PropertyEntry & {
		settingPath: string;
		step?: number;
		cssUnit?: string;
		enum?: (string | number)[];
		isColor?: boolean;
		settingsEditorDisplayName?: string | { text: string; useMarkdown?: boolean };
	};

	let subcategoriesExpanded: Map<string, string[]> = $state(
		persistentState.settingsPage.subcategoriesExpanded
			? new Map<string, string[]>(
					Object.entries(persistentState.settingsPage.subcategoriesExpanded),
				)
			: new Map<string, string[]>(),
	);

	let propSubcategoryData = $derived(
		effectSettings.default.reduce<Record<string, Record<string, ProcessedPropertyEntry[]>>>(
			(acc, category) => {
				const subcategories: Record<string, ProcessedPropertyEntry[]> = {};

				for (const [propPath, propData] of Object.entries(category.properties)) {
					if (
						blacklistedPathsForWebviewSettingsDisplay.some((bp) =>
							propPath.startsWith(bp),
						)
					) {
						continue;
					}

					const pathCategory = propPath.split('.').slice(0, 2).join('.');
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
			},
			{},
		),
	);

	let disabledProps: Set<string> = $derived(
		Object.entries(effectSettings.values).reduce<Set<string>>((builderSet, [path, value]) => {
			if (path.endsWith('.enabled')) {
				return builderSet;
			}

			const possibleEnabledPath = path.split('.').slice(0, -1).join('.') + '.enabled';
			const hasEnabledProperty = effectSettings.values[possibleEnabledPath] !== undefined;
			if (hasEnabledProperty && !effectSettings.values[possibleEnabledPath]) {
				builderSet.add(path);
			}

			return builderSet;
		}, new Set<string>()),
	);

	let currentColorPickerHex: string = $state('#FFAFAFAF');

	//it's annoying that this has to be done so manually...am I doing something wrong?
	function resizeToTextContent(node: HTMLElement) {
		const input = node.querySelector('input');
		if (!input) return;

		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;

		function resize() {
			const extraTextPadding = input!.type === 'number' ? '0000' : '';

			ctx.font = getComputedStyle(input!).font;
			const maxChars = 42;
			const textWidth = ctx.measureText(
				input!.value ? (input!.value + extraTextPadding).slice(0, maxChars) : '',
			).width;
			const placeholderWidth = input!.placeholder
				? ctx.measureText((input!.placeholder + extraTextPadding).slice(0, maxChars)).width
				: 0;
			const cs = getComputedStyle(input!);
			const padding =
				parseFloat(cs.paddingLeft) +
				parseFloat(cs.paddingRight) +
				parseFloat(cs.borderLeftWidth) +
				parseFloat(cs.borderRightWidth);
			input!.style.width = `calc(((${Math.ceil(Math.max(textWidth, placeholderWidth)) / parseFloat(getComputedStyle(input!).fontSize)}) * 1em) + ${padding}px)`;
		}

		const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
		Object.defineProperty(input, 'value', {
			get() {
				return valueDesc.get!.call(this);
			},
			set(v) {
				valueDesc.set!.call(this, v);
				resize();
			},
			configurable: true,
		});

		resize();
		input.addEventListener('input', resize);

		// observe changes to the 'style' attribute for --scale-factor updates
		const rootObserver = new MutationObserver(() => {
			resize();
		});
		rootObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['style'],
		});

		return {
			destroy() {
				input!.removeEventListener('input', resize);
				rootObserver.disconnect();
				delete (input as any).value;
			},
		};
	}

	function IsValidEnum(
		toCheck: string | number | boolean,
		enumArray: (string | number | boolean)[],
	): boolean {
		return (
			enumArray.find((enumVal) =>
				typeof enumVal === 'number'
					? enumVal.toLocaleString() === toCheck.toLocaleString()
					: enumVal.toString() === toCheck.toString(),
			) !== undefined
		);
	}

	// Trigger a settings sync when loading the settings page at any point
	// to ensure we're up to date display wise
	vscode.PostToExtension({
		type: 'request-settings-sync',
		data: undefined,
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
		<div class="inline-flex relative align-middle">
			<Input
				type="number"
				value={effectSettings.values[propData.settingPath] ?? propData.default}
				step={propData.step ?? undefined}
				placeholder={propData.default.toLocaleString()}
				onchange={(e) => {
					if (Number.isNaN(e.currentTarget.valueAsNumber)) {
						e.currentTarget.value =
							(effectSettings.values[propData.settingPath] as string) ??
							propData.default.toLocaleString();
						e.currentTarget.animate(
							[
								{
									color: 'red',
									scale: 0.9,
									filter: 'blur(2.5px) contrast(150%)',
									rotate: Math.sign(Math.random() - 0.5) * 10 + 'deg',
								},
								{
									color: 'currentColor',
									scale: 1,
									filter: 'blur(0px) contrast(100%)',
									rotate: '0deg',
								},
							],
							{
								duration: 500,
								easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
							},
						);
						vscode.NotifyUser(
							'error',
							`${GetPrettifiedPropertyPathSegments(propData.settingPath).slice(1).join(' > ')}: Invalid/NaN value, resetting to last valid value.`,
						);
					} else {
						if (e.currentTarget.valueAsNumber === propData.default) {
							UpdateEffectSetting(propData.settingPath, undefined);
						} else {
							UpdateEffectSetting(
								propData.settingPath,
								e.currentTarget.valueAsNumber,
							);
						}
					}
				}}
			/>
			{#if propData.cssUnit}
				<span class="translate-y-4 text-sm absolute left-full">
					{propData.cssUnit}
				</span>
			{/if}
		</div>
	</div>
{/snippet}
{#snippet StringInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
	<div class="inline-flex align-middle px-1" use:resizeToTextContent>
		<div class="inline-flex relative align-middle">
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
			{#if propData.cssUnit}
				<span class="translate-y-4 text-sm absolute left-full">
					{propData.cssUnit}
				</span>
			{/if}
		</div>
	</div>
{/snippet}
{#snippet ColorInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
	<div class="inline-block align-middle px-1">
		<div class="inline-flex relative align-middle">
			<Dialog.Root
				onOpenChange={(isNowOpen: boolean) => {
					const defaultColorObj = colord(propData.default as string);
					if (isNowOpen) {
						const currentColorSetting = effectSettings.values[
							propData.settingPath
						] as string;

						if (!currentColorSetting || currentColorSetting === propData.default) {
							currentColorPickerHex = defaultColorObj.toHex();
							return;
						}

						const colorObj = colord(currentColorSetting);

						if (colorObj.isValid()) {
							currentColorPickerHex = colorObj.toHex();
						} else {
							vscode.NotifyUser(
								'error',
								`Setting "${propData.settingPath}" had an invalid current color value assigned when opening the color picker - clearing setting.`,
							);
							currentColorPickerHex = defaultColorObj.toHex();
							UpdateEffectSetting(propData.settingPath, undefined);
						}
					} else {
						const prevColorSetting = effectSettings.values[
							propData.settingPath
						] as string;

						const newColorSetting = currentColorPickerHex;
						const newColorObj = colord(newColorSetting);

						if (newColorObj.isValid()) {
							if (newColorObj.toHex() === defaultColorObj.toHex()) {
								// clear setting if it matches the default
								UpdateEffectSetting(propData.settingPath, undefined);
							} else {
								// set to new selected color value
								UpdateEffectSetting(propData.settingPath, newColorObj.toHex());
							}
						} else {
							vscode.NotifyUser(
								'error',
								`${propData.settingPath}: Invalid color input, resetting to last valid/default value.`,
							);
							if (prevColorSetting) {
								const lastColorObj = colord(prevColorSetting);
								if (lastColorObj.isValid()) {
									currentColorPickerHex = lastColorObj.toHex();
									return;
								}
							}
							// if we got here, the last color was invalid too - clear the setting to reset it to the default value
							currentColorPickerHex = defaultColorObj.toHex();
							UpdateEffectSetting(propData.settingPath, undefined);
						}
					}
				}}
			>
				<Dialog.Trigger
					type={'button'}
					class={[
						buttonVariants({ variant: 'bloom' }),
						'block hover:scale-110 active:scale-95 dark:hover:border-foreground \
                        self-center p-1 ps-1 pbe-1 pbs-1 pe-1',
					]}
				>
					<ColorPickerPreview
						color={colord(
							(effectSettings.values[propData.settingPath] as string) ??
								propData.default,
						)}
						class="aspect-square w-full h-full"
					/>
					<span class="color-picker-preview-hex-text self-center text-xs me-1 -ms-1">
						{effectSettings.values[propData.settingPath] ?? propData.default}
					</span>
				</Dialog.Trigger>
				<Dialog.Content
					class="text-center self-center block items-center justify-center text-sm"
					style="width: calc(var(--spacing) * 82.5); height: calc(var(--spacing) * 100); aspect-ratio: 1/1.5;"
					preventScroll={false} /* see other preventScroll note; must be disabled here for same reason */
				>
					<ColorPicker
						bind:hex={currentColorPickerHex}
						disableCloseClickOutside={false}
						position="responsive"
						isAlpha={true}
						isOpen={true}
						isDialog={false}
						sliderDirection="horizontal"
						components={{
							wrapper: ColorWrapper,
						}}
					/>
				</Dialog.Content>
			</Dialog.Root>
		</div>
	</div>
{/snippet}
{#snippet EnumInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
	<div class="inline-flex align-middle px-0.5">
		<Select.Root
			type="single"
			loop={true}
			value={effectSettings.values[propData.settingPath]?.toString() ??
				propData.default.toString()}
			onValueChange={(newVal) => {
				const isValidEnumValue = IsValidEnum(newVal, propData.enum!);
				if (!isValidEnumValue) {
					// invalid enum value that we're changing to - reset to last valid/default value
					vscode.NotifyUser(
						'error',
						`${GetPrettifiedPropertyPathSegments(propData.settingPath).slice(1).join(' > ')}: Invalid enum value, resetting to last valid/default value.`,
					);
					const isLastValueValidEnum = IsValidEnum(
						effectSettings.values[propData.settingPath] as any,
						propData.enum!,
					);
					if (isLastValueValidEnum) {
						UpdateEffectSetting(
							propData.settingPath,
							effectSettings.values[propData.settingPath],
						);
					} else {
						// if the last value was also invalid, just clear the setting to reset to its default
						UpdateEffectSetting(propData.settingPath, undefined);
					}
					return;
				}

				// valid enum value that we're changing to - update the setting or 'clear' it if it's the default value
				if (
					typeof propData.default === 'number'
						? newVal === propData.default.toLocaleString()
						: newVal === propData.default.toString()
				) {
					UpdateEffectSetting(propData.settingPath, undefined);
				} else {
					UpdateEffectSetting(propData.settingPath, newVal);
				}
			}}
		>
			<Select.Trigger
				class={effectSettings.values[propData.settingPath] !== undefined
					? !propData.enum!.includes(effectSettings.values[propData.settingPath] as any)
						? 'invalid-enum-value'
						: ''
					: ''}
			>
				{propData.enum?.find(
					(enumVal) => enumVal === effectSettings.values[propData.settingPath],
				) ??
					effectSettings.values[propData.settingPath] ??
					propData.default}
			</Select.Trigger>
			<!--
                quick note, preventScroll *MUST* be false here since bits-ui attempts to utilize
                inline style application on the `body` element if it is true, causing a CSP
                violation and the entire webview to break.
            -->
			<Select.Content preventScroll={false}>
				<Select.Group>
					{#each propData
						.enum!.slice()
						.sort((a, b) => {
							//sort enum values so that the currently selected value is at the top
							const selected = effectSettings.values[propData.settingPath];
							const selectedStr = (typeof selected === 'number' ? selected.toLocaleString() : selected?.toString?.()) ?? propData.default.toString();
							const aStr = typeof a === 'number' ? a.toLocaleString() : a.toString();
							const bStr = typeof b === 'number' ? b.toLocaleString() : b.toString();

							if (aStr === selectedStr) {
								return -1;
							}
							if (bStr === selectedStr) {
								return 1;
							}
							return 0;
						})
						.filter((enumVal) => {
							// after some more iteration, let's just remove the currently
							// selected value from the dropdown enum list entirely since it looks better
							// though i'll keep the above sort logic for now since it could be useful if i change my mind
							return enumVal !== (effectSettings.values[propData.settingPath] ?? propData.default);
						}) as enumVal}
						{@const stringifiedEnumVal =
							typeof enumVal === 'number'
								? enumVal.toLocaleString()
								: enumVal.toString()}
						{@const isCurrentlySelected =
							stringifiedEnumVal ===
							(typeof effectSettings.values[propData.settingPath] === 'number'
								? (
										effectSettings.values[propData.settingPath] as number
									).toLocaleString()
								: (
										effectSettings.values[propData.settingPath] ??
										propData.default
									).toString())}
						<Select.Item
							value={enumVal.toString()}
							label={stringifiedEnumVal}
							class={[
								'block pe-2 ps-2 text-center',
								!isCurrentlySelected ? 'text-center' : '',
							]}
						>
							{stringifiedEnumVal}
						</Select.Item>
						{#if isCurrentlySelected}
							<!-- add a separator below the currently selected value -->
							<Separator
								orientation="horizontal"
								class="mt-0.5 mb-3 -px-4 -mx-1"
								style="width: calc(100% + (var(--spacing) * 2)); /* background: linear-gradient(to right, transparent, var(--vscode-editor-foreground), transparent); */"
							/>
						{/if}
					{/each}
				</Select.Group>
			</Select.Content>
		</Select.Root>
	</div>
{/snippet}
{#snippet UnknownFallbackInput(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
	<div
		class="inline-block align-middle"
		title="This property type isn't supported by the VS: Bloom Settings Editor yet; you'll need to configure it via the default VS Code settings view to change it for now."
	>
		<BadgeInfoIcon
			class="size-7 fill-red-900 stroke-pink-300 -translate-y-1/8 transition-all duration-300 hover:scale-110 overflow-visible"
		></BadgeInfoIcon>
	</div>
{/snippet}

{#snippet ConfigurableProperty(propData: ProcessedPropertyEntry, topLevelCatIdx: number)}
	<div
		class="config-property {disabledProps.has(propData.settingPath)
			? 'disabled-config-property'
			: ''}"
	>
		<p class="config-property-entry mx-50 text-center flex justify-between items-center">
			<!-- <p class="config-property-entry"> -->
			<span
				class="config-property-name-text"
				title={propData.description
					? propData.description
					: 'No description is available for this property yet.'}
			>
				{#if propData.settingsEditorDisplayName && typeof propData.settingsEditorDisplayName === 'object' && 'text' in propData.settingsEditorDisplayName && 'useMarkdown' in propData.settingsEditorDisplayName && propData.settingsEditorDisplayName.useMarkdown === true}
					<!-- Display name for this property exists and is markdown -->
					<Markdown md={propData.settingsEditorDisplayName.text} />
				{:else if propData.settingsEditorDisplayName && (typeof propData.settingsEditorDisplayName === 'string' || 'text' in propData.settingsEditorDisplayName)}
					<!-- Display name for this property exists and is not markdown -->
					{typeof propData.settingsEditorDisplayName === 'string'
						? propData.settingsEditorDisplayName
						: propData.settingsEditorDisplayName.text}
				{:else}
					<!-- No display name for this property explicitly provided -->
					{GetPrettifiedPropertyPathSegments(propData.settingPath).slice(1).join(' > ')}:
				{/if}
			</span>

			{#if propData.enum}
				{@render EnumInput(propData, topLevelCatIdx)}
			{:else if propData.isColor}
				{@render ColorInput(propData, topLevelCatIdx)}
			{:else}
				{@render (configPropInputTypeSnippets[propData.type] ?? UnknownFallbackInput)(
					propData,
					topLevelCatIdx,
				)}
			{/if}
		</p>
	</div>
{/snippet}

<PageContainer>
	<PageHeader title="Extension Settings" />

	<div class="settings-container">
		<Tabs.Root
			value={currentlySelectedCategory}
			onValueChange={(newVal) => {
				currentlySelectedCategory = newVal;
				MutatePersistentState({
					settingsPage: { ...persistentState.settingsPage, currentCategory: newVal },
				});
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
								title={currentlySelectedCategory !== category.title
									? (category.categoryDescription ?? undefined)
									: undefined}
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
					<div class="category-description-container">
						{#key currentlySelectedCategory}
							<p
								class="category-description"
								in:fly={{
									delay: 100,
									duration: 100,
									opacity: 0,
									y: '100%',
									easing: backOut,
								}}
								out:fly={{ duration: 100, y: '-100%', easing: backIn }}
							>
								{effectSettingsByCategoryName[currentlySelectedCategory]
									.categoryDescription}
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
							value={Object.keys(propSubcategoryData[category.title]).length > 1
								? (subcategoriesExpanded.get(category.title) ?? [])
								: [Object.keys(propSubcategoryData[category.title])[0]]}
							onValueChange={(newVal) => {
								if (newVal.length === 0) {
									subcategoriesExpanded.delete(category.title);
								} else {
									subcategoriesExpanded.set(category.title, newVal);
								}

								if (subcategoriesExpanded.size === 0) {
									MutatePersistentState({
										settingsPage: {
											...persistentState.settingsPage,
											subcategoriesExpanded: undefined,
										},
									});
								} else {
									MutatePersistentState({
										settingsPage: {
											...persistentState.settingsPage,
											subcategoriesExpanded:
												Object.fromEntries(subcategoriesExpanded),
										},
									});
								}
							}}
						>
							{#each Object.entries(propSubcategoryData[category.title]) as [pathCategory, properties]}
								<Accordion.Item value={pathCategory}>
									<Accordion.Trigger class="select-none">
										{GetPrettifiedPropertyPathSegments(pathCategory).join(
											' > ',
										)}
									</Accordion.Trigger>
									<Accordion.Content class="mx-5 pb-1">
										<!-- <div class="config-property-list-container"> -->
										<div
											class="config-property-list-container mx-auto flex-col min-w-full w-max"
										>
											<!-- min-w-max -->
											{#each properties as propertyData, propIdx}
												{#if !propertyData.hideFromCustomEditor}
													{@render ConfigurableProperty(
														propertyData,
														catIdx,
													)}
													{#if propIdx !== properties.length - 1}
														<Separator
															orientation="horizontal"
															class="settings-prop-separator absolute m-auto text-center max-w-none max-h-none"
															style="width: 97.5vw; height: calc(1px / var(--tailwind-scaling)); background: linear-gradient(to right, transparent, var(--vscode-editor-foreground), var(--vscode-editor-foreground), transparent);"
														/>
													{/if}
												{/if}
											{/each}
										</div>
									</Accordion.Content>
								</Accordion.Item>
							{:else}
								<p>
									<i
										><u
											>No extension properties found for category "{category.title}"
											<b>(???)</b></u
										></i
									>
								</p>
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
		margin-inline: calc(var(--spacing) * 10);

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
		scale: 0.995 0.95;
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
