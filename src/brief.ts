// A pull request as a BrainChain brief. The desk takes a title of up to 120
// characters, a brief of up to 4,000 and two or three quality levels of up to
// 200 each, best first; the work is paid if it reaches the second level.

export const LIMITS = { title: 120, brief: 4_000, level: 200 } as const;

export const LEVELS = [
  "Names real defects in the diff with file, line and a concrete fix, or correctly finds none, and invents nothing",
  "Accurate and useful: at least one real point about the diff, nothing invented, though it may miss a defect",
  "Generic, wrong about the code, or reports problems that are not in the diff",
];

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  repo: string;
}

/** Files whose diffs say little about correctness and crowd out the rest. */
const NOISE = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/,
  /\.min\.(js|css)$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf)$/,
  /(^|\/)(dist|build|vendor|node_modules)\//,
  /\.snap$/,
];

interface FileDiff {
  path: string;
  text: string;
}

/** Splits a unified diff into one entry per file. */
export function splitDiff(diff: string): FileDiff[] {
  const parts = diff.split(/^(?=diff --git )/m).filter((part) => part.startsWith("diff --git "));
  return parts.map((text) => {
    const match = /^diff --git a\/(.+?) b\/(.+)$/m.exec(text);
    return { path: match?.[2] ?? match?.[1] ?? "", text };
  });
}

const cut = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`);

export function buildBrief(pr: PullRequest, diff: string): { title: string; brief: string; levels: string[]; skipped: string[]; truncated: boolean } {
  const files = splitDiff(diff);
  const skipped = files.filter((f) => NOISE.some((pattern) => pattern.test(f.path))).map((f) => f.path);
  const kept = files.filter((f) => !skipped.includes(f.path));

  const description = (pr.body ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
  const head = [
    `Review pull request #${pr.number} to ${pr.repo}. Report real defects only: bugs, security problems, broken edge cases and mistakes that would fail in use. For each, name the file and line from the diff, say what goes wrong and give the fix. If the change looks correct, say so in one line and name what you checked. Skip style and formatting. Start with the findings, with no title, in Markdown under 300 words.`,
    "",
    `Title: ${cut(pr.title, 200)}`,
    ...(description ? [`Description: ${cut(description, 500)}`] : []),
    ...(skipped.length ? [`Not shown (lockfiles, build output, binaries): ${cut(skipped.join(", "), 200)}`] : []),
    "",
  ].join("\n");

  const open = "```diff\n";
  const close = "\n```";
  const note = (shown: number, total: number) => `\nThe diff is cut at ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} characters. Review only what is shown.`;
  const body = kept.map((f) => f.text.trimEnd()).join("\n");
  const room = LIMITS.brief - head.length - open.length - close.length;

  let shown = body;
  let truncated = false;
  if (body.length > room) {
    truncated = true;
    // Leave space for the note, then cut on a line boundary.
    const budget = room - note(body.length, body.length).length;
    const slice = body.slice(0, Math.max(0, budget));
    shown = slice.slice(0, Math.max(0, slice.lastIndexOf("\n")));
  }
  const brief = body.length === 0 ? `${head}The diff has no reviewable changes.` : `${head}${open}${shown}${close}${truncated ? note(shown.length, body.length) : ""}`;

  return { title: cut(`Review PR #${pr.number}: ${pr.title}`, LIMITS.title), brief, levels: LEVELS, skipped, truncated };
}
