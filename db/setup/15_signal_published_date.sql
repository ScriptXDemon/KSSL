-- The card date of a competitive signal is the PUBLICATION date of its article, not the date of the event the
-- article reports (competitive_signal.event_date, which stays). Filled from the article's own record
-- (staging.source_document.published_at, matched on competitive_signal_detail.source_url) or, where that is empty,
-- from the article page's own date markers (scripts/backfill_published_dates.py). NULL = the article states no date.
-- Idempotent; run on the staging DB (staging schema) and the serving DB (serving schema): Approve copies by column name.
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['staging', 'serving'] LOOP
    IF to_regclass(format('%I.competitive_signal', s)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.competitive_signal ADD COLUMN IF NOT EXISTS published_date date', s);
      EXECUTE format($c$COMMENT ON COLUMN %I.competitive_signal.published_date IS
        'publication date of the signal''s article (card date); event_date is the date of the event it reports'$c$, s);
    END IF;
  END LOOP;
END $$;
