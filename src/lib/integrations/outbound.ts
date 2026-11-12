import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch } from "undici";
import { env } from "@/lib/env";

export class OutboundBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "OutboundBlockedError";
  }
}

export type OutboundInit = { method?: string; headers?: Record<string, string>; body?: string };

export type OutboundResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === "unicast";
}

type LookupCallback = (error: Error | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const blocked = addresses.find((entry) => !isPublicAddress(entry.address));
    if (blocked) return callback(new OutboundBlockedError(`De host ${hostname} verwijst naar een intern adres en is niet toegestaan.`), []);
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

const guardedAgent = new Agent({ connect: { lookup: guardedLookup as never } });

function assertAllowedTarget(url: URL, allowPrivate: boolean): void {
  if (url.username || url.password) throw new OutboundBlockedError("Een URL met inloggegevens is niet toegestaan.");
  const secure = url.protocol === "https:";
  if (!secure && !(allowPrivate && url.protocol === "http:")) throw new OutboundBlockedError("De URL moet met https:// beginnen.");
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    throw new OutboundBlockedError(`Het adres ${host} is een intern adres en is niet toegestaan.`);
  }
}

export async function guardedFetch(rawUrl: string, init: OutboundInit, timeoutMs: number): Promise<OutboundResponse> {
  if (!URL.canParse(rawUrl)) throw new OutboundBlockedError("De URL is ongeldig.");
  const url = new URL(rawUrl);
  const allowPrivate = env.integrationAllowPrivateHosts;
  assertAllowedTarget(url, allowPrivate);
  const response = await undiciFetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    ...(allowPrivate ? {} : { dispatcher: guardedAgent }),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new OutboundBlockedError("De server stuurt door naar een andere URL en dat is niet toegestaan.");
  }
  return { ok: response.ok, status: response.status, json: () => response.json() };
}
