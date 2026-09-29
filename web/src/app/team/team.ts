// The people on the "Our team" page, in the order shown. For each: name,
// role, one or two sentences about them, and optionally a photo (a square
// image in public/team/, e.g. "/team/jane.jpg") and a profile link.
// Empty, the page says introductions are coming.
export type Member = { name: string; role: string; about: string; photo?: string; link?: string };

export const TEAM: Member[] = [];
