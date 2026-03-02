<script lang="ts">
    import { fly } from 'svelte/transition';
	import type { Texts } from '../../../utils/texts.js';
	import type { RgbaColor, HsvaColor } from '../../colord';
    import { backOut, linear } from 'svelte/easing';
	import { Separator } from '../../../../separator';

	interface Props {
		/** if set to false, disables the alpha channel */
		isAlpha: boolean;
		/** rgb color */
		rgb: RgbaColor;
		/** hsv color */
		hsv: HsvaColor;
		/** hex color */
		hex: string;
		/** configure which hex, rgb and hsv inputs will be visible and in which order. If overridden, it is necessary to provide at least one value */
		textInputModes: Array<'hex' | 'rgb' | 'hsv'>;
		/** all translation tokens used in the library; can be partially overridden; see [full object type](https://github.com/Ennoriel/svelte-awesome-color-picker/blob/master/src/lib/utils/texts.ts) */
		texts: Texts;
		/** listener, dispatch an event when one of the color changes */
		onInput: (color: { hsv?: HsvaColor; rgb?: RgbaColor; hex?: string }) => void;
	}

	let {
		isAlpha,
		rgb = $bindable(),
		hsv = $bindable(),
		hex = $bindable(),
		textInputModes,
		texts,
		onInput
	}: Props = $props();

	const HEX_COLOR_REGEX = /^#?([A-F0-9]{6}|[A-F0-9]{8})$/i;

	let mode: 'hex' | 'rgb' | 'hsv' = $state(textInputModes[0] || 'hex');

	let nextMode = $derived(textInputModes[(textInputModes.indexOf(mode) + 1) % textInputModes.length]);

	let h = $derived(Math.round(hsv.h));
	let s = $derived(Math.round(hsv.s));
	let v = $derived(Math.round(hsv.v));
	let a = $derived(hsv.a === undefined ? 1 : Math.round(hsv.a * 100) / 100);

	type InputEvent = Event & { currentTarget: EventTarget & HTMLInputElement };

	function updateHex(e: InputEvent) {
		const target = e.target as HTMLInputElement;
		if (HEX_COLOR_REGEX.test(target.value)) {
			hex = target.value;
			onInput({ hex });
		}
	}

	function updateRgb(property: string) {
		return function (e: InputEvent) {
			let value = parseFloat((e.target as HTMLInputElement).value);
			rgb = { ...rgb, [property]: isNaN(value) ? 0 : value };
			onInput({ rgb });
		};
	}

	function updateHsv(property: string) {
		return function (e: InputEvent) {
			let value = parseFloat((e.target as HTMLInputElement).value);
			hsv = { ...hsv, [property]: isNaN(value) ? 0 : value };
			onInput({ hsv });
		};
	}
</script>

<div class="text-input">
	<div class="input-container">
		{#if mode === 'hex'}
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }}
				aria-label={texts.label.hex} value={hex} oninput={updateHex} style:flex={4} />
		{:else if mode === 'rgb'}
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }} aria-label={texts.label.r} value={rgb.r} type="number" min="0" max="255" oninput={updateRgb('r')} />
			<Separator orientation="vertical" class="-mx-2" style="background: linear-gradient(to bottom, transparent, var(--vscode-editor-foreground), transparent); "/>
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }} aria-label={texts.label.g} value={rgb.g} type="number" min="0" max="255" oninput={updateRgb('g')} />
			<Separator orientation="vertical" class="-mx-2" style="background: linear-gradient(to bottom, transparent, var(--vscode-editor-foreground), transparent); "/>
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }} aria-label={texts.label.b} value={rgb.b} type="number" min="0" max="255" oninput={updateRgb('b')} />
		{:else}
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }} aria-label={texts.label.h} value={h} type="number" min="0" max="360" oninput={updateHsv('h')} />
			<Separator orientation="vertical" class="-mx-2" style="background: linear-gradient(to bottom, transparent, var(--vscode-editor-foreground), transparent); "/>
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }} aria-label={texts.label.s} value={s} type="number" min="0" max="100" oninput={updateHsv('s')} />
			<Separator orientation="vertical" class="-mx-2" style="background: linear-gradient(to bottom, transparent, var(--vscode-editor-foreground), transparent); "/>
			<input
			in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }} aria-label={texts.label.v} value={v} type="number" min="0" max="100" oninput={updateHsv('v')} />
		{/if}
		{#if isAlpha}
			{#key mode}
			<Separator orientation="vertical" class="-mx-2" style="background: linear-gradient(to bottom, transparent, var(--vscode-editor-foreground), transparent); "/>
				<input
				in:fly={{ y: "-25%", duration: 250, easing: backOut, opacity: 0 }}
					aria-label={texts.label.a}
					value={a}
					type="number"
					min="0"
					max="1"
					step="0.01"
					oninput={mode === 'hsv' ? updateHsv('a') : updateRgb('a')}
				/>
			{/key}
		{/if}
	</div>

	{#if textInputModes.length > 1}
	<Separator orientation="horizontal" class="translate-y-1" style="background: linear-gradient(to right, transparent, var(--vscode-editor-foreground), var(--vscode-editor-foreground), transparent); "/>
		<button type="button" onclick={() => (mode = nextMode)}>
			<span class="disappear" aria-hidden="true">{texts.color[mode]}</span>
			<span class="appear">{texts.changeTo} {texts.color[nextMode]}</span>
		</button>
	{:else}
		<div class="button-like">{texts.color[mode]}</div>
	{/if}
</div>

<!-- 
@component text inputs for the hex, rgb and hsv colors. This component cannot be imported
directly but can be overridden.

**Import**
_N.A._

**Use**
_N.A._

**Props**
@prop isAlpha: boolean — if set to false, disables the alpha channel
@prop rgb: RgbaColor — rgb color
@prop hsv: HsvaColor — hsv color
@prop hex: string — hex color
@prop textInputModes: Array&lt;'hex' | 'rgb' | 'hsv'&gt; — configure which hex, rgb and hsv inputs will be visible and in which order. If overridden, it is necessary to provide at least one value
@prop texts: Texts — all translation tokens used in the library; can be partially overridden; see [full object type](https://github.com/Ennoriel/svelte-awesome-color-picker/blob/master/src/lib/utils/texts.ts)
@prop onInput: (color: { hsv?: HsvaColor; rgb?: RgbaColor; hex?: string }) =&gt; void — listener, dispatch an event when one of the color changes
-->
<style>
	.text-input {
		margin: calc(var(--spacing) * 1.5) 0 0 0;
		position: absolute;
		bottom: calc(var(--spacing) * 0.5);
		left: 50%;
		transform: translateX(-100%);
		width: 100%;
		height: calc(var(--spacing) * 17.5);
	}
	.input-container {
		/* position: absolute;
		bottom: calc(var(--spacing) * 7.5);
		left: 50%;
		transform: translateX(-50%);
		width: 100%; */
		display: flex;
		flex: 1;
		gap: calc(var(--spacing) * 3);
		justify-content: center;
	}
	input,
	button,
	.button-like {
		flex: 2;
		border: calc(var(--spacing) * 0.25) solid color-mix(in srgb, var(--input) 50%, transparent);
		background-color: var(--cp-input-color, #eee);
		color: var(--cp-text-color, var(--cp-border-color));
		padding: 0;
		border-radius: calc(var(--spacing) * 2);
		height: calc(var(--spacing) * 7.5);
		line-height: 1;/*calc(var(--spacing) * 7.5);*/
		text-align: center;
		transition: scale 0.618s var(--vsbloom-bouncy-ease);
		user-select: none;
	}
	input {
		width: calc(var(--spacing) * 17.5);
		height: calc(var(--spacing) * 7.5);
		font-family: inherit;
		color: var(--foreground);
	}

	button,
	.button-like {
		position: relative;
		flex: 1;
		margin: calc(var(--spacing) * 2) 0 0 0;
		height: calc(var(--spacing) * 10);
		color: var(--foreground);
		width: 75%;
		transition: background-color 0.2s, scale 0.618s var(--vsbloom-bouncy-ease);
		cursor: pointer;
		font-family: inherit;
	}

	.button-like {
		cursor: default;
		/* position: absolute;
		bottom: calc(var(--spacing) * 0.75);
		left: 50%;
		transform: translateX(-50%);
		width: 50%; */
	}

	.appear,
	.disappear {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 100%;
		transition: all 0.1618s;
	}
	.disappear {
		/* color: color-mix(in srgb, currentColor 75%, transparent); */
	}
	button:hover .appear {
		text-decoration: underline;
	}
	button:hover .disappear,
	.appear {
		opacity: 0;
	}

	.disappear,
	button:hover .appear {
		opacity: 1;
	}

	button:hover {
		background-color: var(--cp-button-hover-color, #ccc);
	}

	input:focus,
	button:focus {
		outline: none;
	}

	input:focus-visible,
	button:focus-visible {
		outline: calc(var(--spacing) * 0.25) solid var(--focus-color, var(--border));
		/* outline-offset: calc(var(--spacing) * 0.25); */
	}

	input:hover,
	button:hover,
	.button-like:hover {
		scale: 1.05;
		border: calc(var(--spacing) * 0.25) solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	input:active,
	button:active,
	.button-like:active {
		scale: 0.975;
		border: calc(var(--spacing) * 0.25) solid var(--border);
	}
</style>
