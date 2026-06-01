import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import css from "@eslint/css";
import typescriptEslint from "typescript-eslint";

export default [
    {
        ignores: [
            "src/EffectLib/PixiJS/**",
        ]
    },
    {
        ...js.configs.recommended,
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        ignores: [
            "src/Webview/Libraries/**/*.d.ts",
            "src/Webview/Libraries/**/*.svelte.d.ts"
        ]
    },
    ...typescriptEslint.configs.recommended,
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        ignores: [
            "src/Webview/Libraries/**/*.d.ts",
            "src/Webview/Libraries/**/*.svelte.d.ts"
        ],

        plugins: {
            "@typescript-eslint": typescriptEslint.plugin,
        },

        languageOptions: {
            parser: typescriptEslint.parser,
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },

        rules: {
            "@typescript-eslint/naming-convention": ["warn", {
                selector: "import",
                format: ["camelCase", "PascalCase"],
            }],

            curly: "warn",
            eqeqeq: "warn",
            "no-throw-literal": "warn",
            semi: "warn",
            "no-empty": ["warn", { allowEmptyCatch: true }],
            "preserve-caught-error": "off",
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", {
                vars: "all",
                varsIgnorePattern: "^_",
                args: "after-used",
                argsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
            }]
        }
    },
    {
        files: ["**/*.json"],
        ignores: ["tsconfig.json"],
        language: "json/json",
        ...json.configs.recommended,
        plugins: { json },
    },
    {
        files: ["**/*.jsonc", "**/tsconfig.json"],
        language: "json/jsonc",
        ...json.configs.recommended,
        plugins: { json }
    },
    {
        files: ["**/*.css"],
        ignores: ["src/Webview/CSS/shadcn.css"],
        language: "css/css",
        ...css.configs.recommended,
        plugins: { css },
        rules: {
            "css/use-baseline": "off",
            "css/no-important": "off",
            "css/no-invalid-properties": "off",
        }
    }
];
