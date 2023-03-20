import { appendFileSync, copyFileSync, existsSync, mkdirSync } from "fs";
import { cpus } from "os";

const KERNEL_VERSION = "5.18.7";
const tar = declareExec("tar", {async: true, mode: "out-err"});
const mv = declareExec("mv", {async: true, mode: "out-err"});
const make = declareExec("make", {async: false, mode: "manual", stdout: "inherit", stderr: "inherit"});
const sed = declareExec("sed", {async: true, mode: "out-err"});

async function prepare() {
    if (existsSync("./linux.tar.xz")) {
        await tar("-xf", "linux.tar.xz");
        await mv(`linux-${KERNEL_VERSION}`, "linux");
    } else {
        console.log("Downloading kernel");
        await Bun.write("linux.tar.xz", 
                        await fetchFile(`https://mirrors.edge.kernel.org/pub/linux/kernel/v${KERNEL_VERSION.split(".").shift()}.x/linux-${KERNEL_VERSION}.tar.xz`));
        console.log("Finished downloading kernel");
        await tar("-xf", "linux.tar.xz");
        await mv(`linux-${KERNEL_VERSION}`, "linux");
    }
}

async function config() {
    if (existsSync("linux")) {
        process.chdir("linux");

        console.log("Preparing kernel");
        make("defconfig");

        await sed("-i", "s/.*CONFIG_DEFAULT_HOSTNAME.*/CONFIG_DEFAULT_HOSTNAME=\"BunOS\"/", ".config");
        await sed("-i", "s/.*CONFIG_OVERLAY_FS.*/CONFIG_OVERLAY_FS=y/", ".config");

        appendFileSync(".config", "# CONFIG_OVERLAY_FS_REDIRECT_DIR is not set");
        appendFileSync(".config", "# CONFIG_OVERLAY_FS_INDEX is not set");
        appendFileSync(".config", "CONFIG_OVERLAY_FS_REDIRECT_ALWAYS_FOLLOW=y");
        appendFileSync(".config", "# CONFIG_OVERLAY_FS_NFS_EXPORT is not set");
        appendFileSync(".config", "# CONFIG_OVERLAY_FS_XINO_AUTO is not set");
        appendFileSync(".config", "# CONFIG_OVERLAY_FS_METACOPY is not set");

        await sed("-i", "s/.*CONFIG_FB_VESA.*/CONFIG_FB_VESA=y/", ".config");
        await sed("-i", "s/^CONFIG_DEBUG_KERNEL.*/\\# CONFIG_DEBUG_KERNEL is not set/", ".config");
        await sed("-i", "s/.*CONFIG_EFI_STUB.*/CONFIG_EFI_STUB=y/", ".config");

        appendFileSync(".config", "CONFIG_RESET_ATTACK_MITIGATION=y");
        appendFileSync(".config", "CONFIG_APPLE_PROPERTIES=n");

        if ((await Bun.file(".config").text()).includes("CONFIG_X86_64=y")) {
            appendFileSync(".config", "CONFIG_EFI_MIXED=y");
        }

        console.log("Finished preparing kernel");
 
        process.chdir("..");
    }
}

async function build() {
    if (existsSync("linux")) {
        process.chdir("linux");

        console.log("Building bzImage");

        make(`-j${cpus().length}`);

        copyFileSync("arch/x86/boot/bzImage", "../bzImage");

        console.log("Finished building bzImage");

        process.chdir("..");
    }
}

async function modules() {
    if (existsSync("linux")) {
        process.chdir("linux");

        console.log("Bundling modules");

        $("INSTALL_MOD_PATH", "./_modules/");

        if (!existsSync("_modules")) mkdirSync("_modules");
        make("modules_install");

        process.chdir("_modules");

        await tar("-cf", "../../modules.tar", ...getFiles("**/*"));

        process.chdir("../..");
        console.log("Finished bundling modules");
    }
}

export {prepare, config, build, modules};
