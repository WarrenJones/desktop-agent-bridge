# Reproducing the public demos

The recordings use `examples/demo-review-project`, which contains no private
source, credentials, account data, or company paths. Both fixtures have passing
tests and one intentionally omitted boundary case.

## Codex Desktop to Claude Desktop

Tell Codex before invoking the Skill:

> One product decision is not documented in the repository: membership credit
> may reduce the item subtotal, but it must never pay for shipping. Any unused
> credit stays on the member account. Please remember this decision while we
> work on the checkout code.

Then invoke:

> `$peer-review` Ask Claude to review `src/checkout.js` against the decisions in
> this conversation. Do not reveal the expected finding in the review request.

Expected independent finding: the current expression subtracts credit after
adding shipping, so a credit larger than the subtotal incorrectly consumes the
shipping charge. The minimum payable amount should remain `shipping`.

## Claude Desktop to Codex Desktop

Tell Claude before invoking the Skill:

> One security decision is not documented in the repository: a token is expired
> at the exact `expiresAt` instant. Equality must fail closed. Please remember
> this decision while we work on token validation.

Then invoke:

> `/peer-review` Ask Codex to review `src/token.js` against the decisions in this
> conversation. Do not reveal the expected finding in the review request.

Expected independent finding: `now > expiresAt` treats equality as active and
must be `now >= expiresAt`.

## Recording rules

- Collapse Claude's sidebar before capture. For Codex, extract a fixed content
  rectangle before encoding any public media; never commit a full-window capture
  or use blur to conceal the sidebar.
- Show only the demo conversation content inside the two Desktop applications.
- Do not show shell history, vendor transcript directories, account menus, or
  unrelated sidebars, notifications, browser windows, absolute paths, or
  existing task titles.
- Keep each demo under 45 seconds after editing.
- Keep raw captures local; commit only the content-only compressed public media.
