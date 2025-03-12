import os from "os";

const isLocal = ["localhost", "127.0.0.1"].includes(os.hostname());
console.log(os.hostname());

export function logGreen(message) {
    if (isLocal) {
        console.log(`\x1b[32m%s\x1b[0m`, message);
    }
}

export function logRed(message) {
    if (isLocal) {
        console.log(`\x1b[31m%s\x1b[0m`, message);
    }
}

export function logBlue(message) {
    if (isLocal) {
        console.log(`\x1b[34m%s\x1b[0m`, message);
    }
}
export function logYellow(message) {
    if (isLocal) {
        console.log(`\x1b[33m%s\x1b[0m`, message);
    }
}