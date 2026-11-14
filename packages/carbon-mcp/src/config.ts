// Where Carbon is and how to pair with it, from the command line and the environment.
import { isIPv4 } from "node:net";

export interface Config {
  host: string;
  port: number;
  token: string;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 10767;
const FLAGS = ["host", "port", "token"] as const;
type Flag = (typeof FLAGS)[number];
const ENV: Record<Flag, string> = { host: "CARBON_HOST", port: "CARBON_PORT", token: "CARBON_TOKEN" };
const TOKEN = /^(?:[0-9a-f]{32}|\d{6})$/;
const MAX_PORT = 65_535;

/** `--host 1.2.3.4 --port 10767 --token …`; anything else is a mistake worth saying out loud. */
function readFlags(argv: readonly string[]): Partial<Record<Flag, string>> {
  const flags: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, "") as Flag;
    const value = argv[i + 1];
    if (!argv[i].startsWith("--") || !FLAGS.includes(name)) throw new Error(`Unknown option. Use ${FLAGS.map((f) => `--${f}`).join(", ")}.`);
    if (value === undefined) throw new Error(`--${name} needs a value.`);
    flags[name] = value;
  }
  return flags;
}

/** Options win over environment variables. Messages never repeat the token. */
export function readConfig(argv: readonly string[], env: Record<string, string | undefined>): Config {
  const flags = readFlags(argv);
  const pick = (flag: Flag) => (flags[flag] ?? env[ENV[flag]] ?? "").trim();
  const host = pick("host") || DEFAULT_HOST;
  const port = pick("port") ? Number(pick("port")) : DEFAULT_PORT;
  const token = pick("token");
  // Carbon's remote listens on IPv4 only, and refuses requests that name a host.
  if (!isIPv4(host)) throw new Error(`${ENV.host} must be an IPv4 address such as ${DEFAULT_HOST}; Carbon refuses host names.`);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) throw new Error(`${ENV.port} must be a whole number between 1 and ${MAX_PORT}.`);
  if (!token) throw new Error(`Set ${ENV.token} to the developer token from Carbon's Settings → Remote → Copy developer token.`);
  if (!TOKEN.test(token)) throw new Error(`${ENV.token} doesn't look like Carbon's developer token (32 characters) or pairing code (6 digits).`);
  return { host, port, token };
}
