import { globSync } from 'glob'
import { existsSync } from "fs";
import { argv } from "process";

interface declareExecConfig {
    async: boolean;
    cwd?: string;
    env?: object;
    mode?: "out-err" | "out" | "err" | "manual";
    stdin?: string | number | Blob | Request | Response | ReadableStream | Function | null | "inherit" | "pipe" | "ignore";
}

const prePipe = (opts: declareExecConfig) => {
    if (typeof opts.stdin == "string") {
        if (["inherit", "pipe", "ignore"].includes(opts.stdin ?? "")) {
            return opts.stdin;
        } else {
            return new Response(opts.stdin);
        }
    }

    if (typeof opts.stdin == "number") {
        return new Response(opts.stdin.toString());
    }

    if (opts.stdin instanceof Request || 
        opts.stdin instanceof Response || 
        opts.stdin instanceof Blob || 
        opts.stdin instanceof ReadableStream) {

        return opts.stdin;
    }

    return null;
}

// @ts-ignore ugh
globalThis.declareExec = (exec: string, opts: declareExecConfig = {async: false, mode: "out-err"}) => {
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
            let pip: null | string | Response | Request | Blob | ReadableStream = prePipe(opts);
            
            if (opts.stdin instanceof Function) {
                pip = "";
                while(true) {
                    let res = opts.stdin();
                    if (res) pip += res;
                    else break;
                }
                pip = new Response(pip);
            }

            const proc = Bun.spawnSync([exec, ...args], {
                cwd: opts.cwd ?? process.cwd(),
                // @ts-ignore bun docs
                env: opts.env ?? {...process.env},
                // @ts-ignore it works fine
                stdin: pip
            });

            if (proc.stdout && ["out-err", "out"].includes(opts.mode ?? "")) {
                console.write(proc.stdout);
            }

            if (proc.stderr && ["out-err", "err"].includes(opts.mode ?? "")) {
                console.write(proc.stderr);
            }

            if (proc.exitCode != 0) {
                console.error(`Process "${exec} ${args.join(" ")}" has exited with code ${proc.exitCode}`);
                process.exit(proc.exitCode);
            }

            if (opts.mode == "manual") return proc;
        }
    else
        return async (...args: string[]) => {
            let pip: null | string | Response | Request | Blob | ReadableStream = prePipe(opts);

            if (opts.stdin instanceof Function) pip = "pipe";

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
                // @ts-ignore it works fine
                stdin: pip
            });

            if (proc.stdout && ["out-err", "out"].includes(opts.mode ?? "")) for await (const chunk of proc.stdout) console.write(chunk);
            if (proc.stderr && ["out-err", "err"].includes(opts.mode ?? "")) for await (const chunk of proc.stderr) console.write(chunk);

            if (opts.stdin instanceof Function) {
                const funcPipeHandle = async () => {
                    // @ts-ignore it is a function
                    let res = opts.stdin(proc);
                    if (res?.then) res = await res;

                    if (res) {
                        // @ts-ignore bun docs said
                        proc.stdin!.write(res);

                        if (res.endsWith("\n")) {
                            // @ts-ignore bun docs idk
                            proc.stdin!.flush();
                        }
                        funcPipeHandle();
                    }
                    // @ts-ignore bun docs
                    // proc.stdin!.end();
                }
                funcPipeHandle();
            }

            if (opts.mode == "manual") return proc;
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
