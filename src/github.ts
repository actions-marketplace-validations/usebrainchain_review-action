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

export async function comment(token: string, repo: string, number: number, body: string): Promise<string> {
  const response = await call(token, `/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return ((await response.json()) as { html_url: string }).html_url;
}
