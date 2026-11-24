# Forma PowerPoint compatibility

The [84-slide compatibility deck](<Forma PowerPoint Compatibility.pptx>) covers every transition choice, every animation preset, and representative editable objects. Each slide describes the expected result. The video, audio, picture, and lightweight 3D model are embedded.

## Desktop PowerPoint results

I opened the final export in PowerPoint for Mac 16.78.3. PowerPoint loaded all 84 slides without repair. Its object and animation counts matched the exported package on every slide.

| Slides | What PowerPoint recognized |
| --- | --- |
| 2–3 | Editable text and shapes, including the shape gallery and transformed objects |
| 4–5 | Five editable freeforms, the rectangle converted from ink, and four picture objects |
| 6–7 | A native table and four native charts |
| 8 | Embedded video and audio as two native media objects |
| 9 | Three main-sequence effects and one interactive sequence |
| 10–15 | Two native 3D models and Morph by object, word, and character |
| 16–17 | The hidden-slide flag and the three-second timed advance |
| 18–36 | All 202 gallery animation entries in the expected main sequences |
| 37–84 | All 48 transition gallery samples, including None |

Forma reimported the actual exported file with all animation and transition entries intact. Browser tests also exercised editing, lasso selection, point erasing, ink conversion, picture crop, comments, slide links, timeline controls, and export.

## One-click animation playback

PowerPoint could list the effects in the first export, but its Slide Show did not reliably start the effects scheduled after the first one. Forma now gives each effect an explicit position within its click step and retains its native Start setting and delay.

I captured the regenerated deck in desktop PowerPoint before and after one advance per slide. All 52 entrance tiles on slides 18–22 appeared, and all 12 exit tiles on slide 26 disappeared. On slide 9, one advance revealed both the On Click and With Previous objects. A full gallery sequence takes up to about eight seconds.

The 22 unit tests and 10 focused browser tests passed, including round-trips for After Previous, With Previous, delays, repeats, and separate click steps.

The earlier Slide Show check reached the media slide. PowerPoint’s scripting interface returned no playback position for either media object. Audio and video playback, preset-by-preset visual fidelity, and PowerPoint for the web still need direct viewing checks.

## Export defects found and fixed

- PowerPoint attempted to repair the initial export because Forma used the wrong identifier for the table object. Forma now exports the native identifier and repairs older Forma tables on re-export. [Microsoft’s supported graphic object identifiers](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/05d4382c-b474-4571-98bc-227f8c917033)
- Validation found an incorrect horizontal direction value for Checkerboard and Comb, and invalid whitespace attributes on generated text elements. The regenerated deck’s base Office XML, chart workbooks, and package relationships passed validation. [ECMA-376 Office Open XML schemas](https://ecma-international.org/publications-and-standards/standards/ecma-376/)

## Regenerate from Forma

Run the browser fixture using the normal Forma **Export PPTX** button.

```sh
FORMA_COMPAT_OUTPUT='artifacts/Forma PowerPoint Compatibility.pptx' npm run test:e2e -- tests/compatibility.spec.ts --workers=1
```
