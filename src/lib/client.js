/* The client this dataset describes. Set once from data.client at load; every
   on-screen mention of the client reads it from here. No default: with no
   client record the name is the empty string, never a stand-in. */
let current = null;

export function setClient(client) {
  current = client && typeof client === "object" ? client : null;
}

export function clientName() {
  return (current && current.name) || "";
}

export function clientShort() {
  return (current && (current.short || current.name)) || "";
}
