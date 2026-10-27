import type { Outcome, Posted } from "./desk.js";
import { amount, type Preset } from "./presets.js";

const FEE_BPS = 300n;
export const MARKER = "<!-- brainchain-review -->";
/** GitHub refuses comments over 65,536 characters; the footer needs the rest. */
const MAX_REVIEW = 60_000;

/**
 * Makes model output inert on the page: mentions notify no one, and an opened
 * HTML comment or tag cannot swallow the footer that says who wrote the review
 * and what it cost.
 */
export function neutralize(review: string): string {
  const text = review.length > MAX_REVIEW ? `${review.slice(0, MAX_REVIEW)}\n\n[The review is longer than a comment allows and was cut here.]` : review;
  return text
    .replace(/<!--/g, "&lt;!--")
    .replace(/<(\/?)(details|summary)\b/gi, "&lt;$1$2")
    .replace(/(^|[^\w`])@(?=[A-Za-z0-9])/g, "$1@\u200b");
}

/** The commit a review comment says it reviewed, if any. */
export function reviewedCommit(body: string): string | undefined {
  return body.includes(MARKER) ? /Reviewed at ([0-9a-f]{7})\./.exec(body)?.[1] : undefined;
}

/** The PR comment for an accepted review. */
export function reviewComment(preset: Preset, posted: Posted, outcome: Extract<Outcome, { kind: "accepted" }>, commit?: string): string {
  const paid = amount((posted.price * (10_000n - FEE_BPS)) / 10_000n);
  const task = outcome.taskId ? (preset.taskPage ? `[task #${outcome.taskId}](${preset.taskPage(outcome.taskId)})` : `task #${outcome.taskId}`) : "its task";
  return [
    MARKER,
    "### BrainChain review",
    "",
    neutralize(outcome.review.trim()),
    "",
    "---",
    `<sub>Reviewed through [BrainChain](https://usebrainchain.com): Jev hired a model, graded this review and accepted it, so the model earns ${paid} ${preset.token}. Paid ${amount(posted.price)} ${preset.token} on ${preset.chain}; see ${task}.${commit ? ` Reviewed at ${commit.slice(0, 7)}.` : ""}</sub>`,
  ].join("\n");
}
