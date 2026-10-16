/* WHAT THE LABEL MEANS, under the label.
 *
 * "At a glance" prints a typed span the extractor pulled out of the article, under the
 * name the extractor's own vocabulary gives it (glance.py). Those names are precise and
 * several of them are not self-evident to a reader who is not the person who wrote the
 * schema: "Counterparty" is the single most common question, and "Primary lens",
 * "Programme" and "System" all mean something narrower than the everyday word.
 *
 * Requested as: "for each parameter of at a glance below it write what it means".
 *
 * TWO RULES SHAPE WHAT IS WRITTEN HERE.
 *
 *   1. A gloss describes THE FIELD, never the row's value. "Counterparty" is glossed as
 *      "the other party to the deal" for every card; it never says who. A per-row
 *      sentence would be a claim about that article, and this file is not looking at
 *      the article.
 *
 *   2. An unglossed key renders nothing. There is deliberately no fallback that
 *      paraphrases the key back at the reader -- "Quantity: the quantity" is noise, and
 *      an invented gloss on a field this file has not been told about would be worse.
 *      The keys are a closed vocabulary written by glance.py; a new one arrives with its
 *      own line here.
 *
 * The keys below are every one the served store actually carries, counted over the 2,293
 * detail records: Company, Category and Date on all of them, then Primary lens (900),
 * System (377), Key person (354), Programme and Deal value (142), Counterparty (122),
 * Investment (37), Customer (26), Budget and Quantity (20), Supplier (9), Rival (6).
 * Date, Stance, Publisher and Primary lens are filtered out before render (DetailPanel),
 * so their glosses are here for the day that changes rather than for today.
 */

const MEANING = {
  company: "the company this signal is about",
  category: "the product class the signal falls in",
  date: "when the article was published, not when it was read",
  "primary lens": "the analytical angle this signal was filed under",
  system: "the platform or equipment named in the article",
  "key person": "the person the article quotes or names as acting",
  programme: "the named procurement or development programme",
  "deal value": "the contract sum as the article states it",
  counterparty: "the other party to the deal",
  investment: "money committed to build capacity, not to buy equipment",
  customer: "who is buying, or receiving",
  budget: "money allocated, not yet contracted",
  quantity: "how many units the article states",
  supplier: "who is selling, or delivering",
  rival: "the competitor named alongside",
  publisher: "the outlet that ran the article",
  stance: "whether this reads as a threat or one to watch",
};

/* The label as stored is what glance.py and Tenders.jsx typed, so match case- and
   space-insensitively rather than on the exact string. Returns "" when this file has
   nothing to say, which the render treats as "print no line". */
export function glanceMeaning(key) {
  const k = String(key == null ? "" : key).trim().toLowerCase().replace(/\s+/g, " ");
  return MEANING[k] || "";
}

export const GLANCE_KEYS = Object.keys(MEANING);

export default glanceMeaning;
