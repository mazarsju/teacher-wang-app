# Notionists parameter reference

HTTP API: `https://api.dicebear.com/10.x/notionists/svg?<params>`

PNG previews (for visual selection): same path with `/png` and `size=256`.

Array/enum values can be comma-separated when allowing several options for the PRNG. Prefer a **single** forced variant when the user is specific.

## Core params

| Param | Notes |
| --- | --- |
| `seed` | Stable string from character name/role |
| `size` | Optional; SVG is vector — usually omit |
| `backgroundColor` | Hex without `#` (e.g. `ffffff`). Omit for transparent/default |
| `flip` | `none`, `horizontal`, `vertical`, `both` |
| `rotate`, `scale`, `translateX`, `translateY`, `borderRadius` | Layout tweaks |

## Component params

Each component has `*Probability` (0–100) and usually `*Variant`.

| Component | Probability | Variant enum count |
| --- | --- | --- |
| `beard` | `beardProbability` | 12 (`variant01`–`variant12`) |
| `glasses` | `glassesProbability` | 11 (`variant01`–`variant11`) |
| `hair` | `hairProbability` | `hat` + `variant01`–`variant63` |
| `eyes` | `eyesProbability` | 5 |
| `eyebrows` | `eyebrowsProbability` | 13 |
| `mouth` | `mouthProbability` | 30 |
| `nose` | `noseProbability` | 20 |
| `clothes` | `clothesProbability` | 25 |
| `clothesGraphic` | `clothesGraphicProbability` | `electric`, `galaxy`, `saturn` |
| `gesture` | `gestureProbability` | see below |
| `head` | `headProbability` | `variant01` only |

### Gestures

`hand`, `handPhone`, `ok`, `okLongArm`, `point`, `pointLongArm`, `waveLongArm`, `waveLongArms`, `waveOkLongArms`, `wavePointLongArms`

## Natural-language → variant cheatsheet

Curated from Notionists previews. When wrong, re-check with PNG previews.

### Glasses (`glassesVariant`)

| User says | Prefer | Notes |
| --- | --- | --- |
| rounded / round clear glasses | `variant03` | Clear oval/round frames (good default for “round glasses”) |
| round sunglasses / circular dark lenses | `variant09` | Solid round dark lenses |
| rectangular clear frames | `variant08` | Thin rect frames |
| rectangular / boxy sunglasses | `variant07`, `variant02`, `variant06` | Dark lenses |
| flat-top / brow-bar sunglasses | `variant01` | |
| heart / quirky shades | `variant05` | |
| no glasses | `glassesProbability=0` | |

### Beard (`beardVariant`)

Notionists beards are **black fills** — ignore “white / grey beard” as color; match **shape** only.

| User says | Prefer | Notes |
| --- | --- | --- |
| Ho Chi Minh / thin wispy goatee + mustache | `variant05` | Mustache + small chin goatee |
| anchor goatee / pointed chin beard | `variant08`, `variant11` | Van Dyke-ish |
| circle beard / full mouth goatee | `variant01` | Beard ring around mouth |
| full / thick beard | `variant02` | Fuller jaw beard |
| mustache only | `variant03` | Strong mustache |
| light stubble / hint of mustache | `variant04` | Minimal |
| no beard / clean-shaven | `beardProbability=0` | |

### Hair (`hairVariant` / probability) — required

**Always** set `hairProbability=100` and a `hairVariant`. Never use `hairProbability=0`.

| User says | Prefer |
| --- | --- |
| (unspecified) / default | `hairVariant=variant25` (short neat hair) |
| bald / balding / old / sparse | short hair still — e.g. `variant25`, `variant15`; never remove hair |
| hat | `hairVariant=hat` |
| short / long / styled | Preview a few `variantNN` PNGs; Notionists has 63 hair cuts — do not guess blindly when the user is specific |

### Mouth (`mouthVariant`) — banned set

**Never use:** `variant05`, `variant06`, `variant16`.

Allowed: `variant01`–`variant04`, `variant07`–`variant15`, `variant17`–`variant30`.

For a friendly / “sympathique” smile, preview allowed mouths (e.g. `variant01`, `variant10`, `variant20`) — do not fall back to banned ones.

### Eyes (`eyesVariant`) — banned set

**Never use:** `variant02`, `variant04`.

Allowed: `variant01`, `variant03`, `variant05`.

### Age / “wise” vibe

No dedicated age param. Approximate with:

- Glasses on + calm/neutral mouth
- Beard if described
- Short neat hair (`hairProbability=100` + short `hairVariant`)
- Slightly heavy / thoughtful eyebrows (preview `eyebrowsVariant` if needed)

### Clothes / gesture

**Default: no gesture.** Always set `gestureProbability=0` unless the user explicitly requests a gesture, pose, or hand prop. Do not add waves / OK / phone hands from soft cues like “friendly”.

| User says | Prefer |
| --- | --- |
| holding phone | `gestureVariant=handPhone`, `gestureProbability=100` |
| waving | `waveLongArm` / `waveLongArms` |
| pointing | `point` / `pointLongArm` |
| OK hand | `ok` / `okLongArm` |
| (unspecified) / no props | `gestureProbability=0` |
| graphic tee | set `clothesGraphicProbability=100` + graphic variant |

## Circular background post-process

Reference look: `frontend/src/assets/avatars/teacher.svg`.

After downloading the raw DiceBear SVG:

| Step | Action |
| --- | --- |
| Keep character | Do not edit `<defs>` feature groups or `<use href=… transform=…>` |
| Clip | Change `<clipPath>…<rect …/></clipPath>` → `<circle cx="872" cy="872" r="872"/>` (from viewBox) |
| Background | Insert `<circle cx="872" cy="872" r="872" fill="#……"/>` after `</defs>` |
| Color | User hex if given; else random pastel via `apply-circle-background.py` |
| Size | `width="512" height="512"` on root `<svg>` |

Script:

```bash
python3 .cursor/skills/generate-dicebear-avatar/scripts/apply-circle-background.py \
  avatar.svg -o avatar.svg --seed teacher-wang
# or: --color '#dbeafe'
```

`download-avatar.sh` runs this automatically for SVG outputs unless `--skip-circle-bg` is passed.

## Teacher Wang example

Description: old wise man, rounded glasses, Ho Chi Minh beard.

```text
seed=teacher-wang
glassesProbability=100
glassesVariant=variant03
beardProbability=100
beardVariant=variant05
hairProbability=100
hairVariant=variant25
gestureProbability=0
# then apply circular background (random pastel, or e.g. #dbeafe)
```

URL shape (raw DiceBear, before circle post-process):

```text
https://api.dicebear.com/10.x/notionists/svg?seed=teacher-wang&glassesProbability=100&glassesVariant=variant03&beardProbability=100&beardVariant=variant05&hairProbability=100&hairVariant=variant25&gestureProbability=0
```
