import { globSync } from 'glob'
import { existsSync } from "fs";
import { argv, stdout } from "process";
import { Subprocess } from 'bun';

interface declareExecConfig {
    async: boolean;
    cwd?: string;
    env?: object;
    mode?: "out-err" | "out" | "err" | "manual" | "manual-piped";
    stdin?: string | number | Blob | Request | Response | ReadableStream | Function | null | "inherit" | "pipe" | "ignore";
    stdout?: "inherit" | "pipe" | "ignore" | Blob | TypedArray | DataView | null;
    stderr?: "inherit" | "pipe" | "ignore" | Blob | TypedArray | DataView | null;
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

interface TSBuildSubprocess extends Subprocess {
    stdoutReader?: ReadableStreamDefaultReader;
    stderrReader?: ReadableStreamDefaultReader;
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
                stdin: pip,
                stdout: opts.stdout ?? "pipe",
                stderr: opts.stderr ?? "pipe"
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
            const oldMode = opts.mode;

            if (opts.stdin instanceof Function) {
                pip = "pipe";
                opts.mode = "manual-piped";
            }

            const proc: TSBuildSubprocess = Bun.spawn([exec, ...args], {
                onExit(..._) {
                    if (proc.exitCode != 0 && proc.exitCode != null) {
                        console.error(`Process "${exec} ${args.join(" ")}" has exited with code ${proc.exitCode}`);
                        process.exit(proc.exitCode ?? 1);
                    }
                },
                cwd: opts.cwd ?? process.cwd(),
                // @ts-ignore bun docs
                env: opts.env ?? {...process.env},
                // @ts-ignore it works fine
                stdin: pip,
                stderr: opts.stderr ?? "pipe",
                stdout: opts.stdout ?? "pipe"
            });

            // @ts-ignore what is your problem?
            if (proc.stdout && ["out-err", "out"].includes(opts.mode ?? "")) for await (const chunk of proc.stdout) console.write(chunk);
            if (proc.stderr && ["out-err", "err"].includes(opts.mode ?? "")) for await (const chunk of proc.stderr) console.write(chunk);

            if (opts.mode == "manual-piped") {
                // @ts-ignore it is
                proc.stderrReader = proc.stderr.getReader(); 
                // @ts-ignore it is
                proc.stdoutReader = proc.stdout.getReader();
                opts.mode = oldMode;
            }

            if (opts.stdin instanceof Function) {
                while (true) {
                    // @ts-ignore it is a function
                    let res = opts.stdin();
                    if (res?.then) res = await res;

                    if (res) {
                        // @ts-ignore bun docs said
                        proc.stdin!.write(res);

                        if (res.endsWith("\n")) {
                            // @ts-ignore bun docs idk
                            proc.stdin!.flush();
                        }

                        if (proc.stdoutReader && ["out-err", "out"].includes(opts.mode ?? "")) {
                            const {value: output, done} = await proc.stdoutReader.read();
                            if (done) break;
                            console.write(output);
                        }

                        if (proc.stderrReader && ["out-err", "err"].includes(opts.mode ?? "")) {
                            const {value: output, done} = await proc.stderrReader.read();
                            if (done) break;
                            console.write(output);
                        }
                    } else break;
                }
                proc.kill();
            }

            if (opts.mode == "manual") return proc;
        }
}

// @ts-ignore ugh
globalThis.getFiles = (pattern: string) => globSync(pattern);

// @ts-ignore ugh
globalThis.fetchFile = async (url: string) => {
    const req = await fetch(url);
    const res = await req.blob();
    return res;
}

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
