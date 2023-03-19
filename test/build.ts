// @ts-nocheck

async function all() {
    await TSBUILD("busybox", "prepare", "config", "build", "rootfs");
    await TSBUILD("kernel", "prepare", "config", "build");
}

export {all};
