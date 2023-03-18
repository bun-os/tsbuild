import { existsSync } from "fs";

interface declareExecConfig {
    async: boolean;
    cwd?: string;
    env?: Record<string, string>;
    stdin?:
        | "pipe"
        | "inherit"
        | "ignore"
        | ReadableStream
        | Blob
        | Response
        | Request
        | number
        | null;
    stdout?:
        | "pipe"
        | "inherit"
        | "ignore"
        | TypedArray
        | DataView
        | null;
    stderr?:
        | "pipe"
        | "inherit"
        | "ignore"
        | TypedArray
        | DataView
        | null;
}

// @ts-ignore ugh
globalThis.declareExec = (exec: string, opts: declareExecConfig = {async: false}) => {
    if (!process.env.PATH) {
        console.error("PATH env variable was not found!");
        process.exit(1);
    }
    const paths = process.env.PATH.split(":");

    let exists = false;

    paths.forEach((path: string) => {
        const file = path + "/" + exec;
        if (existsSync(file)) exists = true;
    });

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
                stdin: opts.stdin ?? null,
                stdout: opts.stdout ?? "pipe",
                stderr: opts.stderr ?? "inherit"
            });
            if (proc.stdout) console.write(proc.stdout!.toString());
            if (proc.stderr) console.write(proc.stderr!.toString());
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
                stdin: opts.stdin ?? null,
                stdout: opts.stdout ?? "pipe",
                stderr: opts.stderr ?? "inherit"
            });
            if (proc.stdout) for await (const chunk of proc.stdout) console.write(new TextDecoder().decode(chunk));
            if (proc.stderr) for await (const chunk of proc.stderr) console.write(new TextDecoder().decode(chunk)); 
        }
}

require(`${process.cwd()}/build.ts`);
