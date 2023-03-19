// @ts-nocheck

import { existsSync, unlinkSync } from "node:fs";
import { cpus } from "node:os";

const BUSYBOX_VERSION="1.35.0";
const tar = declareExec("tar", {async: true, mode: "out-err"});
const mv = declareExec("mv", {async: true, mode: "out-err"});
const make = declareExec("make", {asnyc: true, mode: "manual", stdout: "inherit", stderr: "inherit"});
const sed = declareExec("sed", {async: true, mode: "out-err"});


async function prepare() {
    if (existsSync("./busybox.tar.bz2")) {
        await tar("-xf", "busybox.tar.bz2");
        await mv(`busybox-${BUSYBOX_VERSION}`, "busybox");
    } else {
        console.log("Downloading busybox");
        await Bun.write("busybox.tar.bz2", 
                        await fetchFile(`https://busybox.net/downloads/busybox-${BUSYBOX_VERSION}.tar.bz2`));
        console.log("Finished downloading busybox");
        await tar("-xf", "busybox.tar.bz2");
        await mv(`busybox-${BUSYBOX_VERSION}`, "busybox");
    }
}

async function config() {
    if (existsSync("busybox")) {
        process.chdir("busybox");

        await make("defconfig");
        await sed("-i", "s/.*CONFIG_STATIC.*/CONFIG_STATIC=y\\\\n/", ".config");

        process.chdir("..");
    }
}

async function build() {
    if (existsSync("busybox")) {
        process.chdir("busybox");

        const tmpMake = declareExec("make", {async: false, mode: "manual", stderr: "inherit", stdout: "inherit", stdin: "y\n", die: false})
        tmpMake("busybox");
        tmpMake("oldconfig");
        tmpMake("busybox", `-j${cpus().length}`);

        process.chdir("..");
    }
}

async function rootfs() {
    if (existsSync("busybox")) {
        process.chdir("busybox");

        await make("install");
        process.chdir("_install");

        unlinkSync("./linuxrc");

        await tar("-cf", "../../rootfs.tar", ...getFiles("**/*"));

        process.chdir("..");
        process.chdir("..");
    }
}

export {prepare, config, build, rootfs};
