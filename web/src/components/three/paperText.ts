// The manuscript the landing's paper writes: shared by the 3D sheet
// (clayDesk.ts draws it onto the sheet) and the phone layout's HTML page
// (_home/TypedPaper.tsx). An illustration, not a real paper.
export const PAPER_PARTS = [
  { key: "title", text: "Seasonal nitrate flux in headwater streams under shifting snowmelt" },
  { key: "authors", text: "Asha Rao¹, Mikael Lindqvist², Tobi Okafor¹" },
  { key: "affil", text: "¹ Department of Earth Sciences   ² Institute for Hydrology" },
  { key: "label", text: "Abstract" },
  {
    key: "abstract",
    text: "Earlier snowmelt is changing when nitrogen leaves mountain catchments. From six years of high-frequency sensor records in 14 streams, we find that spring nitrate pulses now arrive 11 days earlier and carry 23% more of the annual load, most strongly below 1,200 m.",
  },
  { key: "keywords", text: "Keywords: nitrate · snowmelt · headwater streams · high-frequency sensing" },
] as const;

export type PaperPartKey = (typeof PAPER_PARTS)[number]["key"];
export const PAPER_TOTAL = PAPER_PARTS.reduce((n, p) => n + p.text.length, 0);
export const TYPE_CHARS_PER_SECOND = 95;
