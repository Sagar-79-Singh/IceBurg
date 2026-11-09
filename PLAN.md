# IceBurg — UI redesign plan

**Palette.** Deep Sea #0A1A26 is the water above the line, Crevasse #06101A the water below it,
Glacier #12303F the sidebar's carved ice, Frost #DCEFF7 the text, and one cold highlight
#EAF8FF reserved for the waterline glint. Meltwater #5BC0DE appears in exactly three places:
the waterline, the lit facet, the sonar ring. Light theme is polar white #F2F9FC with deep
blue ink #0C2A3A, same structure, accent deepened to keep contrast. No gradients anywhere —
depth is drawn, not shaded.

**Type.** Bricolage Grotesque for the chat title and empty-state heading (weight 600–700,
tracking −0.03em, 26–40px) against Martian Mono at 11–13px for depth labels, model, time and
token estimates. Instrument Sans 17px/1.65 for everything read as prose. The size gap between
display and mono label *is* the hierarchy; nothing sits at 10px.

**Layout.** Left-aligned, not centred: sidebar of ice-cut facets, then a 54px depth gauge in the
left margin, then the conversation with a wide asymmetric right margin holding quiet mono
metadata (model, tokens, time). Breaking the centre is the point.

**Four signature elements.**
1. *Waterline title* — the title sits on a 1.5px animated SVG ripple with #EAF8FF glint; a
   mirrored, 14%-opacity reflection hangs under it; the first message starts below the line.
2. *Depth gauge* — 54px vertical rule in the left margin, one tick per message, mono label
   ("0 m", "8 m", "16 m" at 2 m per message), current scroll position in accent.
3. *Sonar streaming* — the streaming cursor emits one soft expanding ring per pulse; it stops
   the moment the answer ends. The only decorative motion in the app.
4. *Faceted sidebar* — clip-path ice facets: active chat is a lit facet with a sharper edge and
   the accent; inactive ones are quiet cut lines, the whole rail sliced along its outer edge.

**Checked against the avoid list.** No gradient glows or glass panels, no blur, no sparkle icons.
Facets are clipped polygons with hairline edges, not rounded cards, and no two elements share a
radius. Buttons are text ("Send", "Light"), never icon-only toolbars. No ALL-CAPS eyebrows
("Depth", not "DEPTH"). No "→" glyphs. No fade-ins: motion only answers ripple, sonar, facet
state and copy confirmation. Reduced motion stops the ripple and the ring.

**Icon.** The app icon becomes part of the interface, as with Claude, Cursor or Codex: a 22px
iceberg mark in the header, and the same mark as the window/taskbar icon on all three platforms,
plus the larger window-button silhouette on Windows and Linux.
