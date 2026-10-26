import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { check, orderId, post } from "./desk.js";
import { amount, preset, units } from "./presets.js";
import { reviewComment } from "./review.js";

// Anvil's second default account: a public test key that holds nothing anywhere.
const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const base = preset("testnet", "base");
const brief = { title: "Review PR #1: x", brief: "Review it.", levels: ["a", "b", "c"] };

/** A desk offering USDG first and USDC second, as the real one does. */
function desk(terms: { payTo?: string; amount?: string } = {}, paid: (payment: { payload: unknown; accepted?: { network?: string } }) => Response = (p) => Response.json({ order: orderId(p) }, { status: 202 })) {
  const usdc = { scheme: "exact", network: base.network, amount: terms.amount ?? "1000000", asset: base.asset, payTo: terms.payTo ?? base.payTo, maxTimeoutSeconds: 300, extra: { name: "USDC", version: "2" } };
  const usdg = { ...usdc, network: "eip155:46630", asset: "0x1eC185467cA2D5d1c24f0EdCB91301Bca4d0a787", extra: { assetTransferMethod: "permit2" } };
  const header = Buffer.from(JSON.stringify({ x402Version: 2, resource: { url: `${base.desk}/x402/tasks` }, accepts: [usdg, usdc] })).toString("base64");
  const seen: { payload: unknown; accepted?: { network?: string } }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const signature = new Request(input, init).headers.get("payment-signature");
    if (!signature) return new Response("{}", { status: 402, headers: { "payment-required": header } });
    const payment = JSON.parse(Buffer.from(signature, "base64").toString("utf8")) as { payload: unknown; accepted?: { network?: string } };
    seen.push(payment);
    return paid(payment);
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe("post", () => {
  it("pays the Base accept with a transfer authorization and returns the order and price", async () => {
    const { fetchImpl, seen } = desk();
    const posted = await post(base, account, units("1"), brief, fetchImpl);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.accepted?.network).toBe("eip155:84532");
    expect(seen[0]!.payload).toHaveProperty("authorization");
    expect(posted).toEqual({ order: orderId(seen[0]!), price: 1_000_000n, uncertain: false });
  });

  it("pays no one but the desk, and never above max-price", async () => {
    for (const terms of [{ payTo: "0x000000000000000000000000000000000000dEaD" }, { amount: "2000000" }]) {
      const { fetchImpl, seen } = desk(terms);
      await expect(post(base, account, units("1"), brief, fetchImpl)).rejects.toThrow(/Nothing was charged/);
      expect(seen).toHaveLength(0);
    }
  });

  it("follows the order instead of paying again when the confirmation is lost", async () => {
    const { fetchImpl, seen } = desk({}, () => new Response("{}", { status: 502 }));
    const posted = await post(base, account, units("1"), brief, fetchImpl);
    expect(posted).toMatchObject({ order: orderId(seen[0]!), uncertain: true });
  });

  it("reports a refused brief as uncharged", async () => {
    const { fetchImpl } = desk({}, () => Response.json({ error: "brief must be 1 to 4,000 characters." }, { status: 400 }));
    await expect(post(base, account, units("1"), brief, fetchImpl)).rejects.toThrow("brief must be 1 to 4,000 characters. Nothing was charged.");
  });
});

describe("check", () => {
  const order = `0x${"ab".repeat(32)}`;
  const reply = (view: unknown, result = "Looks correct: the loop now stops after three tries.") =>
    (async (input: RequestInfo | URL) => (String(input).includes("/records/") ? new Response(result) : Response.json(view))) as typeof fetch;

  it("returns the accepted review text served by the desk", async () => {
    const view = { state: "posted", taskId: "4", task: { status: "graded", accepted: true }, result: `${base.desk}/records/0x1.txt` };
    expect(await check(base, order, reply(view))).toEqual({ kind: "accepted", taskId: "4", review: "Looks correct: the loop now stops after three tries." });
  });

  it("ignores a result link that is not the desk's", async () => {
    const view = { state: "posted", task: { status: "graded", accepted: true }, result: "https://elsewhere.example/x.txt" };
    expect((await check(base, order, reply(view))).kind).toBe("waiting");
  });

  it("treats a grade that did not accept, or any refund state, as rejected", async () => {
    for (const view of [{ state: "posted", task: { status: "graded", accepted: false } }, { state: "refunded" }, { state: "refunding" }]) {
      expect((await check(base, order, reply(view))).kind).toBe("rejected");
    }
  });

  it("keeps waiting while the task runs", async () => {
    expect(await check(base, order, reply({ state: "posted", taskId: "4", task: { status: "hired" } }))).toEqual({ kind: "waiting", taskId: "4", state: "hired" });
  });
});

describe("presets and amounts", () => {
  it("rejects unknown networks and malformed prices", () => {
    expect(() => preset("devnet", "base")).toThrow(/mainnet or testnet/);
    expect(() => preset("mainnet", "solana")).toThrow(/base or robinhood/);
    expect(() => units("0")).toThrow(/above zero/);
    expect(() => units("1.2345678")).toThrow(/max-price/);
    expect(units("2.5")).toBe(2_500_000n);
    expect(amount(970_000n)).toBe("0.97");
  });

  it("pins mainnet payments to the BrainChain desk", () => {
    expect(preset("mainnet", "base")).toMatchObject({ payTo: "0xafB0C4Ef895D4895040cdC6435B96D3EE8350c6E", network: "eip155:8453" });
  });
});

describe("reviewComment", () => {
  it("links the task on mainnet and states what the model earns", () => {
    const text = reviewComment(preset("mainnet", "base"), { order: `0x${"cd".repeat(32)}`, price: 1_000_000n, uncertain: false }, { kind: "accepted", taskId: "9", review: "  No defects found.  " });
    expect(text).toContain("### BrainChain review\n\nNo defects found.\n");
    expect(text).toContain("the model earns 0.97 USDC");
    expect(text).toContain("[task #9](https://usebrainchain.com/task?id=9)");
  });
});
