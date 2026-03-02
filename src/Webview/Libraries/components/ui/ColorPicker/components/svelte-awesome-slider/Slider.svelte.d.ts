interface Props {
    /** min value of the slider */
    min?: string | number;
    /** max value of the slider */
    max?: string | number;
    /** step value of the slider */
    step?: string | number;
    /** value of the slider */
    value?: number;
    /**
     * method to convert the current value to a string representation of the value for the `aria-valuetext` attribute.
     * For example, a battery meter value might be conveyed as aria-valuetext="8% (34 minutes) remaining".
     * See [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-valuetext)
     */
    ariaValueText?: (current: number) => string;
    /** input name of the slider */
    name?: string | undefined;
    /** direction of the slider */
    direction?: 'horizontal' | 'vertical';
    /** if true, the min and max values will be reversed */
    reverse?: boolean;
    /** disables mouse events */
    keyboardOnly?: boolean;
    /** div element representing the slider */
    slider?: HTMLDivElement | undefined;
    /** aria-label props */
    ariaLabel?: string | undefined;
    /** aria-labelledby props */
    ariaLabelledBy?: string | undefined;
    /** aria-controls props */
    ariaControls?: string | undefined;
    /** indicate if the slider is being dragged */
    isDragging?: boolean;
    /** listener, dispatch an event when the user drags, clicks or tabs at the slider */
    onInput?: (value: number) => void;
}
/**
 * **Props**
 * @prop min: string | number = 0 — min value of the slider
 * @prop max: string | number = 100 — max value of the slider
 * @prop step: string | number = 1 — step value of the slider
 * @prop value: number = 50 — value of the slider
 * @prop ariaValueText: (current: number) =&gt; string = (current) — method to convert the current value to a string representation of the value for the `aria-valuetext` attribute. For example, a battery meter value might be conveyed as aria-valuetext="8% (34 minutes) remaining". See [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-valuetext)
 * @prop name: string | undefined — input name of the slider
 * @prop direction: 'horizontal' | 'vertical' = 'horizontal' — direction of the slider
 * @prop reverse: boolean = false — if true, the min and max values will be reversed
 * @prop keyboardOnly: boolean = false — disables mouse events
 * @prop slider: HTMLDivElement | undefined — div element representing the slider
 * @prop ariaLabel: string | undefined — aria-label props
 * @prop ariaLabelledBy: string | undefined — aria-labelledby props
 * @prop ariaControls: string | undefined — aria-controls props
 * @prop isDragging: boolean = false — indicate if the slider is being dragged
 * @prop onInput: (value: number) =&gt; void — listener, dispatch an event when the user drags, clicks or tabs at the slider
 */
declare const Slider: import("svelte").Component<Props, {}, "value">;
type Slider = ReturnType<typeof Slider>;
export default Slider;
