# Word editor: known issues

The Word workspace in /write edits documents with Folio (`@stll/folio-react`,
Apache-2.0, pinned exact in `web/package.json`). These are the issues found
in its fidelity gate (`web/scripts/smoke/check_docx_fidelity.mjs`), what
they cost a user, and the issue text for Folio's tracker
(https://github.com/stella/folio/issues). Re-run the gate after any Folio
upgrade; a fixed issue shows up as a check turning green.

## 1. Two-column pages with a floating box draw words on top of each other

**What a user sees:** on a page of a multi-column section that also holds a
floating box (a Word frame or a picture with square wrapping), every
justified paragraph's words overlap, and left-aligned text runs past its
column. ACM's Word template shows it on page 1 (its copyright block is a
frame). The saved file is unaffected: only the drawing is wrong, and typing
and saving work.

**Found with:** the gate's "every line's text fits its line" check (2.10x on
ACM's template; about 1.0 on everything else).

**Cause (folio-core 0.54.1):** `layout-painter/renderPage.js`, where a page
has floating zones, re-measures each paragraph fragment with
`contentWidth = page.size.w - page.margins.left - page.margins.right`, the
full text width, and ignores the fragment's column (`fragment.x`,
`fragment.width`). Lines measured for the full width are then painted in a
column about half as wide; the justify step contracts the spaces by the
overflow.

**Issue draft:**

> **Multi-column page with a floating object: paragraphs re-measured at full
> page width, words overlap**
>
> Repro: a section with `<w:cols w:num="2"/>`, justified body paragraphs,
> and one floating object on the page: either a framed paragraph
> (`<w:framePr w:w="4680" w:h="1441" w:wrap="around" w:hAnchor="page"
> w:vAnchor="page" w:x="1089" w:y="12601"/>`) or an anchored picture with
> `<wp:wrapSquare/>`. Every justified line on that page holds about two
> lines of text and its words overlap; left-aligned lines overflow the
> column. With one column, or without the float, it lays out correctly.
>
> In `layout-painter/renderPage.js`, the fragment loop re-measures a
> paragraph when `floatingZonesForFragment(...)` is non-empty, passing the
> page's full `contentWidth`. A paragraph fragment in a column carries its
> own `x` and `width` (`paragraphLayout.js`), so the re-measure probably
> wants `fragment.width`, with each zone's `leftMargin`/`rightMargin`
> shifted into the column's coordinates
> (`columnLeft = fragment.x - page.margins.left`). We haven't tested a
> patch.

## 2. A comment anchored across table cells loses its anchor

**What a user sees:** after editing, a comment whose range ends between two
table cells no longer shows in Word. Its text is still in `comments.xml`,
but its start, end and reference marks are gone from the document. It
happens rarely; JMIR's author template has one (on an empty table row).

**Found with:** the gate's "everything it carries is still there" check
(JMIR: comment anchors 13 → 12, comment marks 13 → 12).

**Issue draft:**

> **Comment range ending at row level (between `w:tc` elements) is dropped
> on save**
>
> Repro: a table row where `<w:commentRangeStart w:id="26"/>` is in the
> first cell's (empty) paragraph, `<w:commentRangeEnd w:id="26"/>` is a
> direct child of `<w:tr>` between two `<w:tc>` elements (valid per
> CT_Row's range markup), and the `<w:commentReference w:id="26"/>` run is
> in the last cell. Open and save with any edit: `commentRangeStart`,
> `commentRangeEnd` and `commentReference` for that id are gone, while the
> comment remains in `comments.xml`, orphaned.

## 3. Old equations show as broken pictures

Equations made with Word's old Equation Editor 3.0 are OLE objects with a
WMF preview. The editor draws a broken-picture box for them; the equation
itself is kept in the saved file and shows normally in Word. Modern Word
equations (OMML) display and save correctly.

## 4. Pictures stored twice (avoided)

Mixing Folio's selective save with a full save stored an unchanged picture
a second time. `DocEditor.tsx` uses only the default (selective) save; the
gate's "no picture stored twice" check holds it.
