// @ts-nocheck

import { Subprocess } from "bun";

const CC = declareExec("cc", {async: true, mode: "out-err"});
const CFLAGS = ["-Wall", "-Wextra"];

const test = () => {
    const main = declareExec("./main", {async: false, mode: "manual"});
    const proc = main(..."konkon kiitsune! watashi wa shirakami fubuki desu!".split(" "));

    console.write(proc.stdout);
}

async function build() {
    await CC(...getFiles("**/*.c"), ...CFLAGS, "-o", "main");
}

async function macka() {
    const macka = declareExec("cat", {async: true, mode: "out", stdin: () => {
        const res = prompt("Cat >");
        if (res)
            return res + "\n";
        return null;
    }});

    macka();
}

export {test, build, macka};
