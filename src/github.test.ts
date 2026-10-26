import { afterEach, describe, expect, it, vi } from "vitest";

import { comment } from "./github.js";

const MARKER = "<!-- brainchain-review -->";

afterEach(() => vi.unstubAllGlobals());

function github(existing: { id: number; body: string; type: string }[]) {
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ method: init.method ?? "GET", url });
    if ((init.method ?? "GET") === "GET") return Response.json(existing.map((c) => ({ id: c.id, body: c.body, html_url: `https://gh/c/${c.id}`, user: { type: c.type } })));
    return Response.json({ id: 99, html_url: init.method === "PATCH" ? String(url) : "https://gh/c/new" });
  });
  return calls;
}

describe("comment", () => {
  it("replaces this action's earlier review", async () => {
    const calls = github([{ id: 1, body: "looks good", type: "User" }, { id: 7, body: `${MARKER}\nold review`, type: "Bot" }]);
    await comment("t", "acme/api", 3, "new", MARKER);
    expect(calls.at(-1)).toMatchObject({ method: "PATCH" });
    expect(calls.at(-1)!.url).toMatch(/\/issues\/comments\/7$/);
  });

  it("posts anew when the earlier review cannot be edited", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push(method);
      if (method === "GET") return Response.json([{ id: 7, body: `${MARKER}\nold`, html_url: "x", user: { type: "Bot" } }]);
      if (method === "PATCH") return new Response("forbidden", { status: 403 });
      return Response.json({ html_url: "https://gh/c/new" });
    });
    expect(await comment("t", "acme/api", 3, "new", MARKER)).toBe("https://gh/c/new");
    expect(calls).toEqual(["GET", "PATCH", "POST"]);
  });

  it("posts a new comment when there is none, and never edits a person's comment that quotes the marker", async () => {
    const calls = github([{ id: 2, body: `quoting ${MARKER}`, type: "User" }]);
    await comment("t", "acme/api", 3, "new", MARKER);
    expect(calls.at(-1)).toMatchObject({ method: "POST" });
    expect(calls.at(-1)!.url).toMatch(/\/issues\/3\/comments$/);
  });
});
