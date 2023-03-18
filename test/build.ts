// @ts-nocheck
const CC = declareExec("cc", {async: true});
const CFLAGS = ["-Wall", "-Wextra"];

const test = async () => {
    declareExec("./main", {async: true})(..."konkon kiitsune! watashi wa shirakami fubuki desu!".split(" "));
}

async function build() {
    await CC(...getFiles("**/*.c"), ...CFLAGS, "-o", "main");
}

export {test, build};
