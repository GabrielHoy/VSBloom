import type { Texts } from '../../../utils/texts.js';
interface Props {
    /** Optional array of color swatches to display */
    swatches?: string[];
    /** listener, dispatch an event when the user select a swatch color */
    selectSwatch: (color: string) => void;
    /** all translation tokens used in the library; can be partially overridden; see [full object type](https://github.com/Ennoriel/svelte-awesome-color-picker/blob/master/src/lib/utils/texts.ts) */
    texts: Texts;
}
declare const Swatches: import("svelte").Component<Props, {}, "">;
type Swatches = ReturnType<typeof Swatches>;
export default Swatches;
