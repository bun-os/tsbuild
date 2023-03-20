import { SyncSubprocess } from "bun";
import { chmodSync, copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const tar = declareExec("tar", {async: false, mode: "manual", stderr: "inherit", stdout: "inherit"});

async function prepare() {
    if (!existsSync("../busybox/rootfs.tar")) {
        console.error("Build busybox first!");
        process.exit(1);
    }
    if (!existsSync("../kernel/modules.tar")) {
        console.error("Build kernel first!");
        process.exit(1);
    }

    if (!existsSync("initramfs")) mkdirSync("initramfs");
    for (const f of ["dev", "etc", "proc", "sys", "tmp"]) {
        if (!existsSync("initramfs/" + f)) mkdirSync("initramfs/" + f);
    }

    tar("-xf", "../busybox/rootfs.tar", "-C", "initramfs/");
    tar("-xf", "../kernel/modules.tar", "-C", "initramfs/");
}

async function bun() {
    if (existsSync("initramfs/bin/")) {
        console.log("Taking bun into roofs");

        if (!existsSync("initramfs/bin/bun")) copyFileSync(process.execPath, "initramfs/bin/bun");

        const out = (declareExec("ldd", {async: false, mode: "manual"})(process.execPath) as SyncSubprocess)!.stdout?.toString();
        if (out) {
            out.match(/\/usr\/.+?(?= \()/g)?.forEach(lib => {
                if (!existsSync(dirname("initramfs" + lib))) {
                    mkdirSync(dirname("initramfs" + lib), { recursive: true });
                }

                copyFileSync(lib, "initramfs" + lib);
            });
        }

        console.log("Bun now lives in rootfs");
    }
}

async function init() {
    if (existsSync("initramfs")) {
        console.log("Preparing minimal init");

        if (!existsSync("initramfs/init")) {
            writeFileSync("initramfs/init", `#!/bin/sh

dmesg -n 1
mount -t devtmpfs none /dev
mount -t proc none /proc
mount -t sysfs none /sys

cat /etc/art.txt
while true
do
	setsid cttyhack /bin/sh
done`);
        }
        chmodSync("initramfs/init", 0o755);

        console.log("Minimal init prepared");
    }
}

async function img() {
    if (!existsSync("initramfs")) {
        console.error("Create initramfs first!");
        process.exit(1);
    }
    process.chdir("initramfs");

    console.log("Creating initramfs");

    const cpio = declareExec("cpio", {async: false, mode: "manual", stdin: getFiles("**/*").join("\n"), stdout: Bun.file("../initrd")});
    cpio("-H", "newc", "-o");
    
    declareExec("gzip", {async: false, mode: "manual", stdin: Bun.file("../initrd"), stdout: Bun.file("../initrd.img")})();

    unlinkSync("../initrd");

    process.chdir("..");

    console.log("Finished creating initramfs");
}

export {prepare, bun, init, img};
