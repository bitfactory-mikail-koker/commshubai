import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { guardedFetch, isPublicAddress, OutboundBlockedError } from "@/lib/integrations/outbound";

describe("isPublicAddress", () => {
  it("accepts public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("rejects every internal range, including mapped IPv6 and the cloud metadata address", () => {
    const internal = [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.1",
      "172.16.5.5",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.1",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
    ];
    for (const address of internal) expect(isPublicAddress(address), address).toBe(false);
  });

  it("rejects anything that is not an address", () => {
    expect(isPublicAddress("example.com")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
    expect(isPublicAddress("999.1.1.1")).toBe(false);
  });
});

describe("guardedFetch", () => {
  let server: Server;
  let redirectTarget = "";
  let port = 0;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: redirectTarget }).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    delete process.env.INTEGRATION_ALLOW_PRIVATE_HOSTS;
  });

  const blocked = async (url: string) => {
    const attempt = guardedFetch(url, {}, 3000);
    await expect(attempt).rejects.toSatisfy((error: unknown) => error instanceof OutboundBlockedError || (error instanceof Error && error.cause instanceof OutboundBlockedError));
  };

  it("refuses literal internal addresses", async () => {
    await blocked("https://127.0.0.1/");
    await blocked("https://169.254.169.254/latest/meta-data/");
    await blocked("https://10.1.2.3/");
    await blocked("https://[::1]/");
    await blocked("https://[::ffff:127.0.0.1]/");
  });

  it("refuses a host name that resolves to an internal address", async () => {
    await blocked("https://localhost/");
  });

  it("refuses plain http, credentials and unparsable URLs", async () => {
    await blocked(`http://127.0.0.1:${port}/`);
    await blocked("http://example.com/");
    await blocked("https://user:secret@example.com/");
    await blocked("not a url");
  });

  it("reaches a local server only when private hosts are allowed", async () => {
    await blocked(`https://127.0.0.1:${port}/`);
    process.env.INTEGRATION_ALLOW_PRIVATE_HOSTS = "true";
    const response = await guardedFetch(`http://127.0.0.1:${port}/`, {}, 3000);
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("never follows a redirect, even when private hosts are allowed", async () => {
    process.env.INTEGRATION_ALLOW_PRIVATE_HOSTS = "true";
    redirectTarget = "http://169.254.169.254/latest/meta-data/";
    await expect(guardedFetch(`http://127.0.0.1:${port}/redirect`, {}, 3000)).rejects.toBeInstanceOf(OutboundBlockedError);
  });
});
