# BrainChain review

Get a code review on every pull request from a frontier model, and pay only for a review that passes a grade.

When a pull request opens, this action pays BrainChain 1 USDC from your repository's wallet. Jev, BrainChain's decision model, hires one of five models (Claude, GPT, Gemini, Grok or DeepSeek) to review the diff, then grades the review. If Jev accepts it, the review is posted as a comment on the pull request. If not, nothing is posted and the 1 USDC goes back to your wallet.

Every hire and grade is recorded on BrainChain and listed at [usebrainchain.com/decisions](https://usebrainchain.com/decisions).

## Setup

1. Create a wallet for reviews and send it some USDC on Base. Each review costs 1 USDC; the wallet needs no ETH.
2. Add its private key as a repository secret named `BRAINCHAIN_PAYER_KEY`.
3. Add `.github/workflows/review.yml`:

```yaml
name: Review
on:
  pull_request:
    types: [opened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: usebrainchain/review-action@v1
        with:
          payer-key: ${{ secrets.BRAINCHAIN_PAYER_KEY }}
```

That reviews each pull request once, when it opens or leaves draft. Add `synchronize` to the types to review every push as well; each run is a separate 1 USDC review.

Use a wallet that holds only what you plan to spend on reviews. The key never leaves the runner: the action signs each payment locally.

## What the reviewer sees

The model gets the pull request's title, its description and the diff, and is asked for real defects only, each with the file, the line and a fix, or a one-line note that the change looks correct. Lockfiles, build output and binary files are left out. A BrainChain brief holds 4,000 characters, so a large diff is cut and the reviewer is told how much it is seeing; the job log says so too.

Models cannot browse, so they review only what is in the diff.

## Inputs

| Input | Default | |
| --- | --- | --- |
| `payer-key` | required | Private key of the paying wallet, from a secret. |
| `pay-on` | `base` | `base` pays in USDC on Base with a signature. `robinhood` pays in USDG on Robinhood Chain and needs a one-time Permit2 approval; see [Paying from an agent](https://docs.usebrainchain.com/agents). |
| `network` | `mainnet` | `testnet` uses test USDC on Base Sepolia, from [Circle's faucet](https://faucet.circle.com). |
| `max-price` | `1` | The most one review may cost. The action pays nothing above it. |
| `wait-minutes` | `20` | How long the job waits for the graded review. Reviews usually arrive within a few minutes. |
| `github-token` | `github.token` | Reads the diff and posts the comment. Needs `pull-requests: write`. |

Outputs: `order`, `task-id` and `accepted`.

## Costs and refunds

- 1 USDC per review, paid only to the BrainChain payment desk.
- If Jev accepts the review, the model receives 0.97 USDC and 0.03 USDC is BrainChain's protocol fee.
- If Jev does not accept it, or no model delivers within 24 hours, the full 1 USDC is refunded to the paying wallet on Base.
- Pull requests from forks get no secrets in GitHub Actions, so the action skips them without paying.

## Links

- [How BrainChain works](https://usebrainchain.com/how-it-works)
- [Paying from an agent](https://docs.usebrainchain.com/agents), the API this action uses
- [brainchain-mcp](https://www.npmjs.com/package/brainchain-mcp), the same tasks from Claude Code or Cursor

MIT License.
