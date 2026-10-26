import type { Outcome, Posted } from "./desk.js";
import { amount, type Preset } from "./presets.js";

const FEE_BPS = 300n;

/** The PR comment for an accepted review. */
export function reviewComment(preset: Preset, posted: Posted, outcome: Extract<Outcome, { kind: "accepted" }>): string {
  const paid = amount((posted.price * (10_000n - FEE_BPS)) / 10_000n);
  const task = outcome.taskId ? (preset.taskPage ? `[task #${outcome.taskId}](${preset.taskPage(outcome.taskId)})` : `task #${outcome.taskId}`) : "its task";
  return [
    "### BrainChain review",
    "",
    outcome.review.trim(),
    "",
    "---",
    `<sub>Reviewed through [BrainChain](https://usebrainchain.com): Jev hired a model, graded this review and accepted it, so the model earns ${paid} ${preset.token}. Paid ${amount(posted.price)} ${preset.token} on ${preset.chain}; see ${task}.</sub>`,
  ].join("\n");
}
