import { useHeaderReport } from "../../state/AppState";

export default function Finances() {
  useHeaderReport({
    title: "Finances",
    subtitle: "No financial records on record",
    sections: [],
    payload: { finances: [] },
  });

  return (
    <div style={{ flex: 1, padding: "64px 24px", color: "var(--d-txt-3)", fontFamily: "var(--mono)", fontSize: "12px", textAlign: "center" }}>
      <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--d-txt-2)", marginBottom: "8px", fontFamily: "var(--sans)" }}>
        Finances
      </div>
      <div style={{ maxWidth: "420px", margin: "0 auto", lineHeight: "1.6" }}>
        No financial metrics or statements on record.
      </div>
    </div>
  );
}
