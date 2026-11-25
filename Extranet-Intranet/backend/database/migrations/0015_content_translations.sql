-- Multilingual content engine (Technical Spec §2.2): translations of user content into ES, EN, AR, HI and RU.
-- Rows are keyed by a hash of the source text (cache: the same text is translated once) and, for indexed
-- content such as community posts, by the source record so searches match any language.
CREATE TABLE IF NOT EXISTS content_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash CHAR(64) NOT NULL,
  lang VARCHAR(5) NOT NULL,
  text TEXT NOT NULL,
  source_lang VARCHAR(5),
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_hash, lang)
);

-- Which posts have been indexed, and in which language they were written.
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS source_hash CHAR(64);
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS lang VARCHAR(5);
CREATE INDEX IF NOT EXISTS idx_community_posts_hash ON community_posts(source_hash);
CREATE INDEX IF NOT EXISTS idx_content_translations_text ON content_translations USING GIN (to_tsvector('simple', text));
