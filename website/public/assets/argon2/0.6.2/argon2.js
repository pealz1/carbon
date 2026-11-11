var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
Symbol.dispose ??= Symbol("Symbol.dispose");
export var Argon2Type;
(function (Argon2Type) {
    Argon2Type[Argon2Type["Argon2d"] = 0] = "Argon2d";
    Argon2Type[Argon2Type["Argon2i"] = 1] = "Argon2i";
    Argon2Type[Argon2Type["Argon2id"] = 2] = "Argon2id";
})(Argon2Type || (Argon2Type = {}));
export var Argon2Version;
(function (Argon2Version) {
    Argon2Version[Argon2Version["Version10"] = 16] = "Version10";
    Argon2Version[Argon2Version["Version13"] = 19] = "Version13";
})(Argon2Version || (Argon2Version = {}));
export function typeFromEncoded(encoded) {
    if (!encoded?.length)
        return;
    if (encoded.startsWith("$argon2d$"))
        return Argon2Type.Argon2d;
    if (encoded.startsWith("$argon2i$"))
        return Argon2Type.Argon2i;
    if (encoded.startsWith("$argon2id$"))
        return Argon2Type.Argon2id;
}
export const defaultHashOptions = {
    hashLength: 32,
    timeCost: 3,
    memoryCost: 65_536,
    parallelism: 4,
    type: Argon2Type.Argon2id,
    version: Argon2Version.Version13
};
function validateHashOptions(opts) {
    if (!Number.isInteger(opts.hashLength))
        return "Hash length must be an integer";
    if (!Number.isInteger(opts.timeCost))
        return "Time cost must be an integer";
    if (!Number.isInteger(opts.memoryCost))
        return "Memory cost must be an integer";
    if (!Number.isInteger(opts.parallelism))
        return "Parallelism must be an integer";
    if (opts.hashLength < 4)
        return "Hash length is too small";
    if (opts.timeCost < 1)
        return "Time cost is too small";
    if (opts.memoryCost < 32)
        return "Memory cost is too small";
    if (opts.parallelism < 1)
        return "Parallelism is too small";
    if (!(opts.type in Argon2Type))
        return "Invalid type";
    if (!(opts.version in Argon2Version))
        return "Invalid version";
    if (opts.salt) {
        if (!(opts.salt instanceof Uint8Array))
            return "Salt must be of type Uint8Array";
        if (opts.salt.length < 8)
            return "Salt length is too small";
    }
}
export function generateSalt(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}
class Argon2 {
    #exports;
    #encoder = new TextEncoder();
    #decoder = new TextDecoder("utf8");
    constructor(instance) {
        this.#exports = instance.exports;
        this.#exports._initialize();
    }
    #heap() {
        return new Uint8Array(this.#exports.memory.buffer);
    }
    #toCString(value) {
        return this.#encoder.encode(value + "\0");
    }
    #fromCString(ptr, length) {
        const heap = this.#heap();
        if (length)
            return this.#decoder.decode(heap.subarray(ptr, ptr + length));
        let end = ptr;
        while (heap[end])
            ++end;
        return this.#decoder.decode(heap.subarray(ptr, end));
    }
    #malloc(length) {
        const ptr = this.#exports.malloc(length);
        return {
            ptr,
            [Symbol.dispose]: () => this.#exports.free(ptr)
        };
    }
    #copyToHeap(array) {
        const ptr = this.#malloc(array.length);
        this.#heap().set(array, ptr.ptr);
        return ptr;
    }
    #copyFromHeap(ptr, length) {
        return this.#heap().slice(ptr, ptr + length);
    }
    #copyStringToHeap(value) {
        return this.#copyToHeap(this.#toCString(value));
    }
    #errorMessage(error) {
        return this.#fromCString(this.#exports.argon2_error_message(error));
    }
    tryHash(password, options) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            if (password === null)
                return { success: false, error: "Password is null" };
            if (password === undefined)
                return { success: false, error: "Password is undefined" };
            if (typeof password !== "string")
                return { success: false, error: "Password must be of type string" };
            const opts = {
                ...defaultHashOptions,
                ...options
            };
            const error = validateHashOptions(opts);
            if (error)
                return { success: false, error };
            const salt = opts.salt ?? generateSalt(16);
            const encodedLength = this.#exports.argon2_encodedlen(opts.timeCost, opts.memoryCost, opts.parallelism, salt.length, opts.hashLength, opts.type);
            const passwordBytes = this.#encoder.encode(password);
            const passwordPtr = __addDisposableResource(env_1, this.#copyToHeap(passwordBytes), false);
            const saltPtr = __addDisposableResource(env_1, this.#copyToHeap(salt), false);
            const hashPtr = __addDisposableResource(env_1, this.#malloc(opts.hashLength), false);
            const encodedPtr = __addDisposableResource(env_1, this.#malloc(encodedLength), false);
            const result = this.#exports.argon2_hash(opts.timeCost, opts.memoryCost, opts.parallelism, passwordPtr.ptr, passwordBytes.length, saltPtr.ptr, salt.length, hashPtr.ptr, opts.hashLength, encodedPtr.ptr, encodedLength, opts.type, opts.version);
            if (result !== 0)
                return { success: false, error: this.#errorMessage(result) };
            const hash = this.#copyFromHeap(hashPtr.ptr, opts.hashLength);
            const encoded = this.#fromCString(encodedPtr.ptr, encodedLength - 1);
            return { success: true, data: { encoded, hash } };
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    }
    hash(password, options) {
        const result = this.tryHash(password, options);
        if (result.success)
            return result.data;
        throw Error(result.error);
    }
    tryVerify(encoded, password, type) {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            if (encoded === null)
                return { success: false, error: "Encoded string is null" };
            if (encoded === undefined)
                return { success: false, error: "Encoded string is undefined" };
            if (encoded === "")
                return { success: false, error: "Encoded string is empty" };
            if (password === null)
                return { success: false, error: "Password is null" };
            if (password === undefined)
                return { success: false, error: "Password is undefined" };
            if (typeof password !== "string")
                return { success: false, error: "Password must be of type string" };
            const $type = type ?? typeFromEncoded(encoded);
            if ($type === undefined || !($type in Argon2Type))
                return { success: false, error: "Invalid type" };
            const passwordBytes = this.#encoder.encode(password);
            const encodedPtr = __addDisposableResource(env_2, this.#copyStringToHeap(encoded), false);
            const passwordPtr = __addDisposableResource(env_2, this.#copyToHeap(passwordBytes), false);
            const result = this.#exports.argon2_verify(encodedPtr.ptr, passwordPtr.ptr, passwordBytes.length, $type);
            if (result !== 0)
                return { success: false, error: this.#errorMessage(result) };
            return { success: true };
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    }
    verify(encoded, password, type) {
        const result = this.tryVerify(encoded, password, type);
        if (!result.success)
            throw Error(result.error);
    }
}
export default Argon2;
