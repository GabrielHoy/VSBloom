import * as acorn from 'acorn';

/**
 * Checks if the given JavaScript code is valid by running it through the Acorn parser.
 * 
 * @param jsCode - The JavaScript code to check.
 * @param acornOptions - The options to pass to the Acorn parser.
 * @returns A tuple containing a boolean indicating if the code is valid - along with an error if it is not.
 */
export function IsJSValid(jsCode: string, acornOptions?: acorn.Options): [boolean, Error | undefined] {
    try {
        acorn.parse(jsCode, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            ...acornOptions
        });
        return [true, undefined];
    } catch (err) {
        return [false, err as Error];
    }
}
