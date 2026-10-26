import { readFileSync } from "node:fs";

import * as core from "@actions/core";
import { createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { buildBrief } from "./brief.js";
import { check, post, type Outcome } from "./desk.js";
import { comment, diff } from "./github.js";
import { amount, preset as presetFor, units } from "./presets.js";
import { reviewComment } from "./review.js";

interface PullRequestEvent {
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    draft?: boolean;
    head: { repo: { full_name: string } | null };
    base: { repo: { full_name: string } };
  };
}

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

async function run(): Promise<void> {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) throw new Error("Run this action in a GitHub workflow, on pull_request events.");
  const event = JSON.parse(readFileSync(path, "utf8")) as PullRequestEvent;
  const pr = event.pull_request;
  if (!pr) {
    core.setFailed("Run this action on pull_request events.");
    return;
  }
  if (pr.draft) {
    core.notice("Draft pull request: no review requested.");
    return;
  }
  const repo = pr.base.repo.full_name;
  const key = core.getInput("payer-key");
  if (!key) {
    // Pull requests from forks get no secrets, so they are skipped rather than failed.
    core.notice(pr.head.repo?.full_name !== repo ? "Pull request from a fork: secrets are not available, so no review was paid for." : "payer-key is empty: no review was paid for.");
    return;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("payer-key must be a private key: 0x followed by 64 hex characters.");
  core.setSecret(key);

  const preset = presetFor(core.getInput("network") || "mainnet", core.getInput("pay-on") || "base");
  const maxPrice = units(core.getInput("max-price") || "1");
  const waitMinutes = Number(core.getInput("wait-minutes") || "20");
  if (!Number.isFinite(waitMinutes) || waitMinutes < 1 || waitMinutes > 300) throw new Error("wait-minutes must be between 1 and 300.");
  const token = core.getInput("github-token", { required: true });
  const account = privateKeyToAccount(key as `0x${string}`);

  const reader = createPublicClient({ transport: http(preset.rpc, { timeout: 15_000, retryCount: 2 }) });
  const balance = await reader.readContract({ address: preset.asset, abi: erc20, functionName: "balanceOf", args: [account.address] });
  if (balance < maxPrice) {
    throw new Error(`The paying wallet ${account.address} holds ${amount(balance)} ${preset.token} on ${preset.chain}; a review costs up to ${amount(maxPrice)}. Nothing was charged.`);
  }

  const brief = buildBrief({ number: pr.number, title: pr.title, body: pr.body, repo }, await diff(token, repo, pr.number));
  if (brief.skipped.length) core.info(`Left out of the brief: ${brief.skipped.join(", ")}`);
  if (brief.truncated) core.warning("The diff is longer than a BrainChain brief allows, so the review covers its first part only.");

  const posted = await post(preset, account, maxPrice, brief);
  core.setOutput("order", posted.order);
  core.info(`Paid ${amount(posted.price)} ${preset.token} on ${preset.chain}. Order ${posted.order}${posted.uncertain ? " (confirmation was lost; following it)" : ""}.`);

  const deadline = Date.now() + waitMinutes * 60_000;
  const progress: Record<string, string> = {
    paying: "The payment is settling.",
    paid: "Paid; posting the task on BrainChain.",
    open: "Waiting for Jev to hire a model.",
    hired: "A model is reviewing the diff.",
    delivered: "The review is in; Jev is grading it.",
    submitted: "The review is in; Jev is grading it.",
    graded: "Graded; fetching the review.",
  };
  let outcome: Outcome = { kind: "waiting", state: "paying" };
  let last = "";
  while (outcome.kind === "waiting" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    outcome = await check(preset, posted.order).catch((error: unknown): Outcome => ({ kind: "waiting", state: `unreachable (${String(error)})` }));
    if (outcome.kind === "waiting" && outcome.state !== last) {
      core.info(`${outcome.taskId ? `Task #${outcome.taskId}: ` : ""}${progress[outcome.state] ?? outcome.state}`);
      last = outcome.state;
    }
  }
  if ("taskId" in outcome && outcome.taskId) core.setOutput("task-id", outcome.taskId);

  switch (outcome.kind) {
    case "accepted": {
      core.setOutput("accepted", "true");
      const url = await comment(token, repo, pr.number, reviewComment(preset, posted, outcome));
      core.info(`Review posted: ${url}`);
      return;
    }
    case "rejected":
      core.setOutput("accepted", "false");
      core.notice(`Jev did not accept the review, so it is not posted and the ${amount(posted.price)} ${preset.token} is refunded to ${account.address} on ${preset.chain}.`);
      return;
    case "failed":
      throw new Error(outcome.reason);
    case "waiting":
      core.warning(`No graded review within ${waitMinutes} minutes. The order is still running: ${preset.desk}/x402/tasks/${posted.order}`);
  }
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error.message : String(error)));
