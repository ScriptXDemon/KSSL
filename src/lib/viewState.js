/* WHAT A VIEW REMEMBERS WHILE YOU STAY IN ITS PILLAR -- and forgets when you leave.
 *
 * Reported as: on Competitive, open Competitor, pick BAE, step across to Partnerships --
 * come back and BAE should still be selected. But go out to Market and back, and
 * everything should be default again.
 *
 * The first half already worked. The second could not, because seven pages were
 * persisting their selection to **localStorage**:
 *
 *     kssl_profile_cid   kssl_products_cid   kssl_geo_state
 *     kssl_part_state    kssl_pat_state      kssl_pos_selected   kssl_gap_cat
 *
 * localStorage does not merely survive a pillar switch; it survives the tab, the
 * browser and the machine's next reboot. A reader who opened BAE once in September was
 * still landing on BAE in October, on a dashboard whose whole job is "what is new". The
 * page was not failing to reset -- it had been asked to remember for ever.
 *
 * So the durability is the bug, and this module is the same key/value shape with the
 * lifetime the reader actually expects: in memory, cleared by a pillar change
 * (AppState.setPillar), gone when the tab closes.
 *
 * WHY NOT sessionStorage. The feed's page number IS in sessionStorage, deliberately: a
 * reader expects a reload to keep their place in a long list. A SELECTION is a train of
 * thought, and a reload is where a train of thought ends. The two want different
 * lifetimes and they get them.
 *
 * WHY A MODULE AND NOT REACT STATE. The seven call sites read their value inside a
 * `useState` initialiser, which runs before any effect and cannot call a hook
 * conditionally. A plain function reads the same on the first render as on the tenth,
 * which is what those initialisers were already assuming of localStorage. The swap is
 * therefore a rename at each site rather than a restructure of seven pages.
 *
 * The API mirrors Storage on purpose (getItem/setItem/removeItem), so a call site reads
 * the same after the change as before and the diff shows the LIFETIME changing rather
 * than the logic.
 */
let store = Object.create(null);

export function getItem(key) {
  const v = store[key];
  return v === undefined ? null : v;
}

export function setItem(key, value) {
  store[key] = String(value);
}

export function removeItem(key) {
  delete store[key];
}

/* Called by AppState.setPillar on a real pillar change. Everything a view was holding
   for the reader goes at once -- there is no per-pillar partition, because a view
   belongs to exactly one pillar and the rail rebuilds on the switch anyway. */
export function clearViewState() {
  store = Object.create(null);
}

/* For tests: what is being held right now. */
export function viewStateKeys() {
  return Object.keys(store);
}

export default { getItem, setItem, removeItem, clearViewState, viewStateKeys };
