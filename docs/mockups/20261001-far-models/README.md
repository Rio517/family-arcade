# Simpler buildings from high up

**Product direction:** late in a round the game should run smoothly on the
family's Mac and iPad. A Chrome performance trace of a level-17 round showed
the browser's graphics process busy 92% of the time, while the game's own
code took about 6 ms a frame. Most of the drawing is the city's houses,
shops, apartments and towers, each 1,200 to 1,900 triangles, drawn once for
the picture and again for the shadows.

**The proposal:** from about level 15, where people and street clutter
already disappear, draw the city with plainer copies of its buildings, and
switch back when the camera comes down. The plainer copies come from the same
builders with a lighter hand:

- rounded corners take two steps, and top edges lose their soft bevel
- small rounded windows get crisper corners
- round parts have fewer sides, never fewer than ten
- parts under 0.4 units every way are left out

Outlines, sizes, colours, windows, roofs and helipads stay.

**The cost and the gain:** about a third fewer triangles per frame at levels
15 to 17 (1.84M to 1.30M at level 17, in the main pass), and the same share
off the shadow pass.

## The page

[far-models.html](./far-models.html) opens from disk. Each comparison is the
same paused moment drawn twice, at the detail a Retina Mac draws in a
2320×1363 window, with a line to drag between today and the simpler models
and 2× and 4× zoom: close-ups of eight spots, the whole level-15 frame (the
closest they would be seen), the whole level-17 frame, and the model gallery.

The pictures were taken from the dev server with the simpler models swapped
into a running round by a throwaway script.

## Outcome

**Decision: the detailed models stay, everywhere.** Played up close, where
every round starts, the simpler buildings looked less friendly. Their code is
in the git history, in the commit "Gulp: simpler building models
everywhere", for a version used only from high up.
