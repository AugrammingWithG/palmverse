---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/style.css","src/core/ui.ts"]
---

# Surface: Palmverse app shell (landing + in-scene HUD)

Mode: Persuade for the landing (TikTok visitors, desktop-led); Operate-quiet for the in-scene HUD.
Audience: first-time visitors from a TikTok link, plus the creator recording clips.
Action: Start camera (primary), try with mouse (secondary).
Constraints: UI must never cover hands while playing; R hides everything; debug stats behind H/G.
Direction: pinned by the user's references (night botanical, roman/italic serif mixing, glowing glass pill, pearl iridescent button). No concept roll.

## Direction contract

THESIS: The landing is a living night meadow you can already touch. Glowing WebGL flowers grow up from the bottom edge and turn toward your cursor (your "sun") before the camera is even on. It refuses the centered card on a gradient.

OWN-WORLD: Near-black, green-black ground with a teal clearing haze; glowing petals (rose, amber, violet); cyan mushroom caps; firefly lime; starlight white. Type: a grotesk (Geist) with single Instrument Serif italic letters set inside words; serif words held in a glowing glass capsule with a light line beneath; a pearl iridescent pill as the primary action; authored 4-point sparkle marks.

STORY: Visitors see flowers bloom and follow their cursor, read "Little worlds that live in [your hands]", press Start camera, and the meadow wilts away into the terrarium in their palm.

FIRST VIEWPORT: The wordmark sits top-left and the privacy line top-right. The headline is centered at about 34% height (grotesk, 72px), with the glass pill (serif, 88px) under it. The lede sits below that, then the pearl button with a quiet text link. The meadow fills the bottom 45%, and a three-part footer runs across it.

FORM: pinned by the user's references (no seed roll); seed key: none (user-pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: the flowers lean toward the pointer and the cursor orb lights them; on start, the meadow wilts before the first scene appears. In-scene, the HUD fades after 4 s idle; on each scene change a gesture caption appears ("*Left palm* holds the garden") and then dissolves.
