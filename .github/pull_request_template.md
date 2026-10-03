## What and why

## Checks

- [ ] `cd web && npm run check` passes
- [ ] Smokes for the flows this touches pass (`node scripts/smoke/check_<flow>.mjs` against `npm run dev`)
- [ ] The three privacy rules still hold (nothing new leaves the device without an opt-in notice)
- [ ] No em dashes in user-visible copy; guide screenshots re-taken if a tool page changed
