---
name: update-token-prices description: >- Creates or updates backend/token_price.json with current LLM input/output token prices for the four largest providers (openai, anthropic, google, meta). Use when the user asks to refresh token prices, update token_price.json, sync LLM pricing, or recreate the token price catalog.
---

# Update token prices

Maintain `backend/token_price.json`: a JSON array of model pricing entries used by the teacher-wang app.

## Output file

Path: `backend/token_price.json`

Structure (valid JSON — quoted keys):

```json
[
  {
    "companyName": "<COMPANY_NAME>",
    "modelName": "<MODEL_NAME>",
    "inputPrice": <TOKEN_INPUT_PRICE>,
    "outputPrice": <TOKEN_OUTPUT_PRICE>
  }
]
```

### Field rules

| Field | Rule |
| --- | --- |
| `companyName` | Lowercase slug among: `openai`, `anthropic`, `google`, `meta` |
| `modelName` | Exact public API model id / marketing name from the official pricing page |
| `inputPrice` | USD **per 1 million input tokens** (number, not a string) |
| `outputPrice` | USD **per 1 million output tokens** (number, not a string) |

Include the main current chat / reasoning text models for each company (flagship, mid-tier, and budget when published). Prefer **standard** (non-batch, non-flex, non-priority) short-context rates when a page lists several tiers.

Omit image-only, audio-only, video, realtime, and embedding models unless the user asks for them.

Also keep models this app is known to use (for example `gpt-4o-mini`) even if they are older than the latest flagship line.

## Official pricing sources (fetch these first)

Always prefer the **official** docs below over third-party blogs. Use WebFetch / WebSearch against these URLs when creating or updating the file:

### Company pricing pages

| Company | Primary pricing URL |
| --- | --- |
| OpenAI | https://developers.openai.com/api/docs/pricing |
| Anthropic | https://platform.claude.com/docs/en/about-claude/pricing |
| Google | https://ai.google.dev/gemini-api/docs/pricing |
| Meta | https://dev.meta.ai/docs/getting-started/pricing-rate-limits |

### Useful model / docs links

- OpenAI GPT-4o mini (per-model pricing): https://developers.openai.com/api/docs/models/gpt-4o-mini
- OpenAI GPT-4o (per-model pricing): https://developers.openai.com/api/docs/models/gpt-4o
- OpenAI models index: https://developers.openai.com/api/docs/models
- Anthropic markdown pricing mirror: https://platform.claude.com/docs/en/about-claude/pricing.md
- Google Gemini pricing markdown: https://ai.google.dev/gemini-api/docs/pricing.md
- Meta Model API overview: https://dev.meta.ai/docs/getting-started/overview
- Meta models list: https://dev.meta.ai/docs/getting-started/models

### Fallbacks

- OpenAI legacy pricing path (often redirects): https://platform.openai.com/docs/pricing
- Aggregator cross-check only (never sole source): https://www.metacto.com/blogs/

## Keep this URL list up to date

**Each time this skill runs**, update the useful URL sections in **this** `SKILL.md` whenever possible:

1. If an official page moved, replace the stale URL with the working one.
2. If you discover a clearer per-model pricing page (like the GPT-4o mini model page), add it under **Useful model / docs links**.
3. If a new flagship model page is the best source for a price used in `token_price.json`, add that link.
4. Remove URLs that 404 or permanently redirect away from pricing content.
5. Do not leave duplicate links; keep the list short and high-signal.

Treat refreshing these URLs as part of a successful price update, not an optional extra.

## Workflow

Copy this checklist and track progress:

```
Token price update:
- [ ] Fetch OpenAI pricing
- [ ] Fetch Anthropic pricing
- [ ] Fetch Google Gemini pricing
- [ ] Fetch Meta pricing
- [ ] Build the JSON array (all four companies)
- [ ] Write backend/token_price.json
- [ ] Validate JSON parses and fields look correct
- [ ] Update useful URLs in this SKILL.md when new/better links were found
```

### Steps

1. **Fetch** each official pricing page (and useful per-model pages when needed).
2. **Extract** current standard input/output prices for the active text models.
3. **Merge** into one array covering all four `companyName` values.
4. **Write** `backend/token_price.json` with stable formatting:
   - 2-space indent
   - trailing newline
   - models grouped by company in this order: `openai`, `anthropic`, `google`, `meta`
5. **Validate** by parsing the file as JSON and confirming every object has the four required keys with numeric prices ≥ 0.
6. **Update this skill’s URL lists** whenever a better or corrected link was found during the run.

### Create vs update

- **Create**: if `backend/token_price.json` is missing, write a full catalog from the four sources.
- **Update**: replace the file contents with a freshly fetched catalog (do not leave stale models that no longer appear on official pricing pages unless the user asks to keep legacy ids, or the model is still configured in this app).

## Example entry

```json
{
  "companyName": "openai",
  "modelName": "gpt-4o-mini",
  "inputPrice": 0.15,
  "outputPrice": 0.6
}
```

Prices are always **USD per 1M tokens**.
