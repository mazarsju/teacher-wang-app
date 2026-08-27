---
name: generate-dicebear-avatar description: >- Generates and downloads a DiceBear Notionists SVG avatar from a plain-text character description, mapping traits (age, glasses, beard, hair, clothes, gesture) to API parameters, then adds a circular colored background (like frontend/src/assets/avatars/teacher.svg) and clips content outside the circle. Use when the user asks to generate an avatar, create a DiceBear Notionists character, download avatar.svg, or describe a character for an avatar image.
---

# Generate DiceBear Notionists avatar

Create a deterministic Notionists SVG via the DiceBear HTTP API and save it as `avatar.svg` at the **repository root** (replace if it already exists), unless the user names another path.

Docs: [DiceBear](https://github.com/dicebear/dicebear) · [Notionists style](https://www.dicebear.com/styles/notionists/)

## Workflow

Copy and track:

```
Avatar Progress:
- [ ] Parse plain-text description into traits
- [ ] Map traits → Notionists query params (seed + variants + probabilities)
- [ ] Resolve ambiguous variants (preview PNG if needed)
- [ ] Download SVG to avatar.svg (or user path)
- [ ] Apply circular colored background (clip outside circle; keep character)
- [ ] Confirm path + key params + background color to the user
```

### 1. Parse the description

Extract intents such as:

| Trait | Examples |
| --- | --- |
| Identity / seed | name, role (“teacher wang”) → `seed` |
| Age / vibe | old, wise, young, stern |
| Hair | short, long, hat, sparse, styled (never bald — see hard rule) |
| Glasses | round, rectangular, sunglasses, none |
| Beard | goatee, Ho Chi Minh, full beard, mustache, none |
| Clothes / gesture | hoodie; gesture **only if user asks** (phone, wave, point) |
| Background color | explicit hex / named color → circle fill; else random pastel |

**Hard rule — always include hair:**

- Every avatar **must** have hair: set `hairProbability=100` and a concrete `hairVariant` (never `hairProbability=0`, never omit hair).
- If the user says “bald”, “balding”, or similar, still use a **short / sparse** hair variant — do not remove hair.

**Hard rule — banned face variants (never use):**

- Mouth: never `variant05`, `variant06`, or `variant16`
- Eyes: never `variant02` or `variant04`
- When forcing mouth/eyes, pick only from the allowed set. If the seed might land on a banned variant, set an explicit allowed `mouthVariant` / `eyesVariant` (do not leave those to chance when the brief needs a clear expression).

**Hard rule — no gesture unless asked:**

- Default: set `gestureProbability=0` on every avatar.
- Only set a `gestureVariant` / `gestureProbability=100` when the user **explicitly** asks for a gesture, pose, or prop (e.g. “waving”, “holding a phone”, “OK hand”). Do not infer gestures from vibe words like “friendly” or “sympathique”.

**Style limitations (tell the user briefly when relevant):**

- Notionists is black-and-white line art. There is **no white beard color** — facial hair renders as black fills. Prefer the closest **shape** (e.g. goatee).
- There is **no ethnicity option**. “Chinese” / similar cues inform hair, beard, glasses, and age vibes only — not skin tone or facial structure presets.

### 2. Map to API parameters

Always use style **`notionists`** and API version **`10.x`**.

Base URL:

```text
https://api.dicebear.com/10.x/notionists/svg
```

Rules:

1. Set `seed` from the character name/role (kebab-case or quoted phrase). Same seed + options → same avatar.
2. **Always** set `hairProbability=100` and pick a `hairVariant` (see hard rule).
3. **Always** set `gestureProbability=0` unless the user explicitly asks for a gesture (see hard rule).
4. For each other feature the user **wants**: set `*Probability=100` and pick a `*Variant`.
5. For each feature the user **rejects** (“no beard”, “no glasses”): set that feature’s `*Probability=0`. Do **not** apply this to hair.
6. Leave unspecified non-hair features unset so the seed can vary them — **except** when a strong character brief implies them (e.g. “old wise man with beard and glasses” → force beard + glasses on). Hair is never left to chance alone without an explicit variant when the brief is specific. Gesture is never inferred — only explicit requests.
7. Prefer curated mappings in [reference.md](reference.md). If still unsure, download 2–4 candidate PNG previews, inspect with the Read tool, pick the best variant, then download the final SVG.
8. Full option enums: [options.json](options.json) or `https://api.dicebear.com/10.x/notionists/options.json`.

### 3. Download + circular background (required)

Prefer the helper script (from repo root). It downloads the Notionists SVG, then post-processes it like `frontend/src/assets/avatars/teacher.svg`:

```bash
.claude/skills/generate-dicebear-avatar/scripts/download-avatar.sh \
  --out avatar.svg \
  --seed "teacher-wang" \
  --param glassesProbability=100 \
  --param glassesVariant=variant03 \
  --param beardProbability=100 \
  --param beardVariant=variant05 \
  --param hairProbability=100 \
  --param hairVariant=variant25 \
  --bg-color '#dbeafe'   # optional; omit for a random pastel
```

Or download with curl, then run:

```bash
python3 .claude/skills/generate-dicebear-avatar/scripts/apply-circle-background.py \
  avatar.svg -o avatar.svg --seed "teacher-wang"   # optional --color '#dbeafe'
```

**Post-process rules (do not skip for final SVG avatars):**

1. **Do not modify** character geometry (`<defs>` symbol groups / `<use>` transforms). Leave paths as DiceBear generated them.
2. Replace the default rectangular `clipPath` with a **full-viewBox circle** (`cx/cy` = center, `r` = half the smaller viewBox side — Notionists is `1744×1744` → `cx=872 cy=872 r=872`).
3. Insert a filled background `<circle>` with the same geometry **immediately after** `</defs>`, **before** the clipped character `<g>`.
4. Background fill: use the user’s color when specified; otherwise pick a **random pastel** hex (script does this). Pass `--seed` into the apply script so random colors stay reproducible per character when desired.
5. The circular clip removes anything outside the disc (arms/gestures that stick out are clipped — same as `teacher.svg`).
6. Set root `width="512" height="512"` like `teacher.svg` (script default).

Verify the file is SVG and contains both the background `fill="#..."` circle and a circular `clipPath`.

### 4. Report

Reply with:

- Output path
- Seed
- Background circle color used
- The main parameters chosen and how they map from the user’s text (1 short sentence each for glasses / beard / hair / etc.)

## Example

**User:** “Generate an avatar for teacher wang: old wise man, Chinese, rounded glasses, white Ho Chi Minh style beard.”

**Mapping:**

| Intent | Param |
| --- | --- |
| teacher wang | `seed=teacher-wang` |
| rounded glasses | `glassesProbability=100`, `glassesVariant=variant03` |
| Ho Chi Minh beard | `beardProbability=100`, `beardVariant=variant05` (shape; color stays black) |
| old / wise (still with hair) | `hairProbability=100`, `hairVariant=variant25` (short neat hair; never bald) |

Then download to `avatar.svg` and note the white-beard limitation.
