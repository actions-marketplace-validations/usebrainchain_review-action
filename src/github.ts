const API = process.env.GITHUB_API_URL ?? "https://api.github.com";

async function call(token: string, path: string, init: RequestInit & { accept?: string } = {}): Promise<Response> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: init.accept ?? "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "brainchain-review-action",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path}: ${(await response.text()).slice(0, 200)}`);
  return response;
}

export async function diff(token: string, repo: string, number: number): Promise<string> {
  return (await call(token, `/repos/${repo}/pulls/${number}`, { accept: "application/vnd.github.diff" })).text();
}

interface IssueComment {
  id: number;
  body?: string;
  html_url: string;
  user?: { type?: string };
}

/** Posts the review, or replaces this action's earlier review on the same pull request. */
export async function comment(token: string, repo: string, number: number, body: string, marker: string): Promise<string> {
  for (let page = 1; page <= 10; page++) {
    const comments = (await (await call(token, `/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`)).json()) as IssueComment[];
    const earlier = comments.find((c) => c.user?.type === "Bot" && c.body?.includes(marker));
    if (earlier) {
      // A review left by another bot identity cannot be edited with this token; the paid review is posted anew instead.
      const edited = await call(token, `/repos/${repo}/issues/comments/${earlier.id}`, { method: "PATCH", body: JSON.stringify({ body }) }).catch(() => undefined);
      if (edited) return ((await edited.json()) as IssueComment).html_url;
      break;
    }
    if (comments.length < 100) break;
  }
  const response = await call(token, `/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return ((await response.json()) as IssueComment).html_url;
}
