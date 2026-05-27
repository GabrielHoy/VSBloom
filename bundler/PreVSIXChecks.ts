/**
 * Runs unit tests via vitest and extension-host tests via vscode-test (Mocha)
 * in order to ensure the extension is ready for packaging.
 * 
 * The intention behind this file is to ensure that the extension is ready to be
 * deployed as a new version to the VS Code and OpenVSX Marketplaces for wide-spread
 * public distribution: All unit tests should either pass or have a *very* good reason for
 * failing in a specific circumstance or version, if they're going to fail in a build
 * that ultimately gets deployed.
 * 
 */
import * as chalk from 'chalk';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { stdin as processIn, stdout as processOut } from 'node:process';

const c = new chalk.Instance({ level: process.env.FORCE_COLOR ? 3 : chalk.level });


type TestFailure = {
    suite: string;
    name: string;
    reason: string;
};

type SuiteResult = {
    label: string;
    failures: TestFailure[];
    warnings: string[];
    exitCode: number;
};

// Vitest JSON reporter output shape; well - the subset we care about at least
type VitestJsonResult = {
    testResults?: Array<{
        testFilePath?: string;
        status?: string;
        assertionResults?: Array<{
            status?: string;
            title?: string;
            fullName?: string;
            failureMessages?: string[];
        }>;
    }>;
};

function DispatchProcess(
    args: string[],
    extraEnv?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        const proc = spawn(args[0], args.slice(1), {
            shell: true,
            cwd: process.cwd(),
            env: { ...process.env, FORCE_COLOR: '1', ...extraEnv },
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (chunk: Buffer) => {
            const s = chunk.toString();
            process.stdout.write(s);
            stdout += s;
        });
        proc.stderr?.on('data', (chunk: Buffer) => {
            const s = chunk.toString();
            process.stderr.write(s);
            stderr += s;
        });
        proc.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    });
}

function CollectWarnings(text: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line && /vsbloom\s+warning/i.test(line) && !seen.has(line)) {
            seen.add(line);
            result.push(line);
        }
    }

    return result;
}

async function RunUnitTests(): Promise<SuiteResult> {
    const label = `Unit Tests: ${c.bold.cyan('vitest')}`;
    console.log(c.bold.white(`\n==> ${label} <==\n`));

    const tmpFile = path.join(os.tmpdir(), `vsbloom-vitest-${Date.now()}.json`);

    // Two reporters: verbose for live terminal output; json to a temp file for parsing
    const { stdout, stderr, exitCode } = await DispatchProcess([
        'npx', 'vitest', 'run',
        '--reporter=verbose',
        '--reporter=json',
        `--outputFile=${tmpFile}`,
    ]);

    const failures: TestFailure[] = [];

    if (fs.existsSync(tmpFile)) {
        try {
            const json: VitestJsonResult = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
            for (const suite of (json.testResults ?? [])) {
                const suiteName = suite.testFilePath ? path.basename(suite.testFilePath) : '(unknown file)';
                for (const test of (suite.assertionResults ?? [])) {
                    if (test.status === 'failed') {
                        failures.push({
                            suite: suiteName,
                            name: test.fullName ?? test.title ?? '(unnamed)',
                            reason: test.failureMessages?.[0]?.split('\n')[0] ?? 'Unknown failure',
                        });
                    }
                }
            }
        } catch { /* fall through; exit code will still flag a failure */ }
        fs.rmSync(tmpFile, { force: true });
    }

    // If the process failed but JSON parsing found no failures, add a generic entry
    if (exitCode !== 0 && failures.length === 0) {
        failures.push({
            suite: 'vitest',
            name: 'Unit test suite',
            reason: 'Tests failed: see output above for details',
        });
    }

    return { label, failures, warnings: CollectWarnings(stdout + stderr), exitCode };
}

function ParseMochaFailures(combined: string): TestFailure[] {
    const failures: TestFailure[] = [];
    const lines = combined.split('\n');

    // Mocha failure block begins after a line matching `  N failing`
    let inFailures = false;

    // State for the current failure entry; we'll flush it when we encounter a new failure block
    let currentSuite = '';
    let currentName = '';
    let awaitingName = false;
    let awaitingReason = false;

    function flush() {
        if (currentSuite) {
            failures.push({
                suite: currentSuite,
                name: currentName || '(unknown test)',
                reason: '(see output above)',
            });
        }
        currentSuite = '';
        currentName = '';
        awaitingName = false;
        awaitingReason = false;
    }

    for (const line of lines) {
        if (!inFailures) {
            if (/^\s+\d+\s+failing/.test(line)) {
                inFailures = true;
            }
            continue;
        }

        // "  1) Suite Name"; the start of a failure block
        const entryMatch = line.match(/^\s+(\d+)\)\s+(.+)/);
        if (entryMatch) {
            flush();
            currentSuite = entryMatch[2].trim();
            awaitingName = true;
            awaitingReason = false;
            continue;
        }

        if (!currentSuite) {
            continue;
        }

        // "       test name:"; the specific test within the suite
        if (awaitingName && /^\s{6,}[^:]+:$/.test(line)) {
            currentName = line.trim().replace(/:$/, '');
            awaitingName = false;
            awaitingReason = true;
            continue;
        }

        // First non-empty line after the test name is the error
        if (awaitingReason && line.trim()) {
            failures[failures.length] = {
                suite: currentSuite,
                name: currentName || '(unknown test)',
                reason: line.trim(),
            };
            // Reset so we don't re-capture more lines for the same entry;
            // we'll flush it when we encounter a new failure block
            currentSuite = '';
            currentName = '';
            awaitingName = false;
            awaitingReason = false;
        }
    }

    flush();
    return failures;
}

async function runHostTests(): Promise<SuiteResult> {
    const label = `Extension Host Tests: ${c.bold.cyan('vscode-test')}`;
    console.log(c.bold.white(`\n==> ${label} <==\n`));

    // Build TypeScript test sources first;
    // this stands as a prerequisite for the extension-host tests.
    console.log(c.dim(`  Building test sources via ${c.bold.underline.white('tsc')}...\n`));
    const buildResult = await DispatchProcess(['npx', 'tsc', '-p', 'tsconfig.test-host.json']);
    if (buildResult.exitCode !== 0) {
        return {
            label,
            failures: [{
                suite: 'TypeScript Build',
                name: 'tsc -p tsconfig.test-host.json',
                reason:
                    (buildResult.stderr + buildResult.stdout)
                        .split('\n')
                        .find((l) => l.trim() && /error/i.test(l))?.trim()
                    ?? 'Compilation failed: see output above',
            }],
            warnings: CollectWarnings(buildResult.stdout + buildResult.stderr),
            exitCode: buildResult.exitCode,
        };
    }

    const { stdout, stderr, exitCode } = await DispatchProcess(['npx', 'vscode-test']);
    const combined = stdout + stderr;

    let failures = ParseMochaFailures(combined);

    if (exitCode !== 0 && failures.length === 0) {
        failures = [{
            suite: 'vscode-test',
            name: 'Extension host test run',
            reason:
                combined.split('\n').find((l) => l.trim() && /fail|error/i.test(l))?.trim()
                ?? 'Tests failed: see output above for details',
        }];
    }

    return { label, failures, warnings: CollectWarnings(combined), exitCode };
}

async function PromptForContinuation(results: SuiteResult[]): Promise<boolean> {
    const allFailures = results.flatMap((r) =>
        r.failures.map((f) => ({ ...f, suiteLabel: r.label })),
    );
    const allWarnings = results.flatMap((r) =>
        r.warnings.map((w) => ({ text: w, suiteLabel: r.label })),
    );

    if (allFailures.length === 0 && allWarnings.length === 0) {
        return true;
    }

    const divider = c.bold.red('='.repeat(64));
    console.log(`\n${divider}`);

    if (allFailures.length > 0) {
        console.log(c.bold.red(`\n  The following tests have failed:\n`));
        for (const f of allFailures) {
            console.log(
                `  ${c.yellow(`[${f.suiteLabel}]`)}  ${c.bold.white(f.name)}`,
            );
            console.log(`  ${c.dim(`in: ${f.suite}`)}`);
            console.log(`  ${c.red(`    |-> ${f.reason}`)}\n`);
        }
    }

    if (allWarnings.length > 0) {
        console.log(c.bold.yellow(`\n  The following warnings were emitted:\n`));

        await new Promise(resolve => setTimeout(resolve, 1000));
        
        for (const w of allWarnings) {
            console.log(`  ${c.dim(`[${w.suiteLabel}]`)}  ${c.yellow(w.text)}`);
        }
        console.log();
    }

    console.log(divider);

    if (!processIn.isTTY) {
        console.log(
            c.bold.red('\n  Non-interactive session detected; aborting VSIX packaging.\n'),
        );
        return false;
    }

    const rl = createInterface({ input: processIn, output: processOut });
    try {
        const answer = await rl.question(
            `\n  ${c.bold.yellow('Continue packaging to VSIX?')}  ${c.white('[')}${c.bold.green('Y')}${c.white('/')}${c.bold.red('N')}${c.white(']')}: `,
        );
        return answer.trim().toLowerCase() === 'y';
    } finally {
        rl.close();
    }
}

async function main(): Promise<void> {
    console.log(
        c.bold.rgb(41, 184, 219)('\n  VSBloom Pre-VSIX Package Generation: Validating Unit & Extension Host Tests\n'),
    );

    const unitResult = await RunUnitTests();
    const hostResult = await runHostTests();

    const allPassed =
        unitResult.failures.length === 0 &&
        unitResult.warnings.length === 0 &&
        hostResult.failures.length === 0 &&
        hostResult.warnings.length === 0;

    if (allPassed) {
        console.log(c.bold.green('\n  All tests passed! Proceeding to VSIX packaging...\n'));
        process.exit(0);
    }

    const shouldContinue = await PromptForContinuation([unitResult, hostResult]);

    if (!shouldContinue) {
        console.log(c.bold.red('\n  VSIX packaging cancelled.\n'));
        process.exit(1);
    }

    console.log(c.bold.yellow('\n  Proceeding to VSIX packaging with unresolved issues...\n'));
    console.log(c.bold.underline.redBright("  Bypass these checks at your own peril!"));
    process.exit(0);
}

main().catch((err: unknown) => {
    console.error(c.bold.red('\n  PreVSIXChecks encountered an unexpected error:'), err);
    process.exit(1);
});
