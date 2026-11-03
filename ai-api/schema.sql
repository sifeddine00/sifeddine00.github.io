-- =========================================================================
-- Schéma de la table chat_logs pour Cloudflare D1
-- Enregistre chaque interaction entre les visiteurs et l'assistant IA
-- =========================================================================

CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  lang TEXT DEFAULT 'fr',
  country TEXT DEFAULT 'XX',
  user_question TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  model_used TEXT,
  duration_ms INTEGER DEFAULT 0
);

-- Index pour recherche rapide et tri chronologique
CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_lang ON chat_logs(lang);
