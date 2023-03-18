import { globSync } from 'glob';
import { existsSync } from "fs";
import { argv } from "process";

interface declareExecConfig {
    async: boolean;
    cwd?: string;
    env?: object; 
}

// @ts-ignore ugh
globalThis.declareExec = (exec: string, opts: declareExecConfig = {async: false}) => {
    if (!process.env.PATH) {
        console.error("PATH env variable was not found!");
        process.exit(1);
    }

    let exists = false;

    if (!(exec.startsWith("/") || exec.startsWith("."))) {
        const paths = process.env.PATH.split(":");

        paths.forEach((path: string) => {
            const file = path + "/" + exec;
            if (existsSync(file)) exists = true;
        });
    } else {
        if (existsSync(exec)) exists = true;
    }

    if (!exists) {
        console.error(`Could not find "${exec}" in PATH`);
        process.exit(1);
    }

    if (!opts.async)
        return (...args: string[]) => {
            const proc = Bun.spawnSync([exec, ...args], {
                cwd: opts.cwd ?? process.cwd(),
                // @ts-ignore bun docs
                env: opts.env ?? {...process.env},
            });

            if (proc.stdout) {
                console.write(proc.stdout);
            }

            if (proc.stderr) {
                console.write(proc.stderr);
            }

            if (proc.exitCode != 0) {
                console.error(`Process "${exec} ${args.join(" ")}" has exited with code ${proc.exitCode}`);
                process.exit(proc.exitCode);
            }
        }
    else
        return async (...args: string[]) => {
            const proc = Bun.spawn([exec, ...args], {
                onExit(..._) {
                    if (proc.exitCode != 0) {
                        console.error(`Process "${exec} ${args.join(" ")}" has exited with code ${proc.exitCode}`);
                        process.exit(proc.exitCode ?? 1);
                    }
                },
                cwd: opts.cwd ?? process.cwd(),
                // @ts-ignore bun docs
                env: opts.env ?? {...process.env},
            });
            if (proc.stdout) for await (const chunk of proc.stdout) console.write(chunk);
            if (proc.stderr) for await (const chunk of proc.stderr) console.write(chunk); 
        }
}

// @ts-ignore ugh
globalThis.getFiles = (pattern: string) => globSync(pattern);

const mod = require(`${process.cwd()}/build.ts`);

argv.shift()
argv.shift()

for (const fun of process.argv) {
    let res: any = null;
    const func = mod[fun];
    if (!func) {
        console.error(`Unknown target "${fun}"`);
        process.exit(1);
    }

    res = func();
    if (res?.then) await res;
}
