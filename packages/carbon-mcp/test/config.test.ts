import { describe, expect, it } from "vitest";
import { DEFAULT_HOST, DEFAULT_PORT, readConfig } from "../src/config.js";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("readConfig", () => {
  it("needs only a token", () => {
    expect(readConfig([], { CARBON_TOKEN: TOKEN })).toEqual({ host: DEFAULT_HOST, port: DEFAULT_PORT, token: TOKEN });
    expect(readConfig([], { CARBON_TOKEN: " 042137 " }).token).toBe("042137");
  });

  it("reads the environment, and options win over it", () => {
    const env = { CARBON_HOST: "192.168.1.20", CARBON_PORT: "12000", CARBON_TOKEN: TOKEN };
    expect(readConfig([], env)).toEqual({ host: "192.168.1.20", port: 12000, token: TOKEN });
    expect(readConfig(["--host", "10.0.0.5", "--port", "12001"], env)).toEqual({ host: "10.0.0.5", port: 12001, token: TOKEN });
    expect(readConfig(["--token", "042137"], {}).token).toBe("042137");
  });

  it("explains what's missing or wrong", () => {
    expect(() => readConfig([], {})).toThrow(/Set CARBON_TOKEN/);
    expect(() => readConfig([], { CARBON_TOKEN: TOKEN, CARBON_HOST: "localhost" })).toThrow(/IPv4 address/);
    expect(() => readConfig([], { CARBON_TOKEN: TOKEN, CARBON_HOST: "http://127.0.0.1" })).toThrow(/IPv4 address/);
    expect(() => readConfig([], { CARBON_TOKEN: TOKEN, CARBON_HOST: "::1" })).toThrow(/IPv4 address/);
    for (const port of ["0", "70000", "10767.5", "http"]) {
      expect(() => readConfig([], { CARBON_TOKEN: TOKEN, CARBON_PORT: port }), port).toThrow(/whole number/);
    }
    expect(() => readConfig(["--verbose", "1"], { CARBON_TOKEN: TOKEN })).toThrow(/Unknown option/);
    expect(() => readConfig(["token", TOKEN], {})).toThrow(/Unknown option/);
    expect(() => readConfig(["--port"], { CARBON_TOKEN: TOKEN })).toThrow(/needs a value/);
  });

  it("never repeats a token in a message", () => {
    const wrong = "not-the-right-shape-secret";
    let message = "";
    try {
      readConfig(["--token", wrong], {});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/doesn't look like/);
    expect(message).not.toContain(wrong);
  });
});
