
import path from "node:path";
import fs from "node:fs";
import * as jsonc from "jsonc-parser";
import type { EffectConfig } from "./PackageBuilder";

const EFFECT_SRC_DIR = "src/Effects";

const cachedEffectConfigFiles: Record<string, EffectConfig> = {};

export async function ResolveEffectNameFromFilePath(filePath: string): Promise<string> {
    return path.basename(filePath, path.extname(filePath));
}

export async function GetEffectConfig(filePath: string): Promise<EffectConfig> {
    const effectName = await ResolveEffectNameFromFilePath(filePath);

    if (cachedEffectConfigFiles[effectName]) {
        return cachedEffectConfigFiles[effectName];
    }

    let effectConfigFile = path.join(EFFECT_SRC_DIR, effectName, `${effectName}.jsonc`);
    if (!fs.existsSync(effectConfigFile)) {
        //try normal json
        effectConfigFile = path.join(EFFECT_SRC_DIR, effectName, `${effectName}.json`);
        if (!fs.existsSync(effectConfigFile)) {
            //well that's a bummer
            throw new Error(`GetEffectConfig - Effect "${effectName}" does not have a configuration file at "${effectConfigFile}" (???)`);
        }
    }

    let effectConfig: EffectConfig;
    if (effectConfigFile.endsWith(".jsonc")) {
        effectConfig = jsonc.parse(fs.readFileSync(effectConfigFile, "utf8")) as EffectConfig;
    } else {
        effectConfig = JSON.parse(fs.readFileSync(effectConfigFile, "utf8")) as EffectConfig;
    }
    cachedEffectConfigFiles[effectName] = effectConfig;

    return effectConfig;
}

export async function IsEffectEnabled(filePath: string): Promise<boolean> {
    const effectConfig = await GetEffectConfig(filePath);
    return !effectConfig.disabled;
}