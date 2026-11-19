-- ============================================================
-- D-REC HEALTHCARE PLATFORM — EXTRACTION & LAB RESULTS SCHEMA
-- Additive migration for Automatic Medical Report Scanning
-- ============================================================

-- 1. Laboratory Results Table
CREATE TABLE IF NOT EXISTS public.lab_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medical_document_id UUID REFERENCES public.medical_documents(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  result_value TEXT NOT NULL,
  unit TEXT,
  reference_range TEXT,
  result_status TEXT NOT NULL DEFAULT 'unknown' CHECK (result_status IN ('normal', 'high', 'low', 'critical', 'unknown')),
  test_date DATE,
  source_hospital TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lab results"
  ON public.lab_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lab results"
  ON public.lab_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lab results"
  ON public.lab_results FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lab results"
  ON public.lab_results FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_lab_results_user ON public.lab_results(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_doc ON public.lab_results(medical_document_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_date ON public.lab_results(test_date DESC);

CREATE TRIGGER update_lab_results_modtime
  BEFORE UPDATE ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Document Extractions History Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medical_document_id UUID NOT NULL REFERENCES public.medical_documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'needs_review', 'applied', 'failed', 'cancelled')),
  extracted_data JSONB,
  warnings TEXT[] DEFAULT '{}',
  extractor_version TEXT NOT NULL DEFAULT '1.0.0',
  processed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own document extractions"
  ON public.document_extractions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document extractions"
  ON public.document_extractions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own document extractions"
  ON public.document_extractions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document extractions"
  ON public.document_extractions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_extractions_user ON public.document_extractions(user_id);
CREATE INDEX IF NOT EXISTS idx_extractions_doc ON public.document_extractions(medical_document_id);

CREATE TRIGGER update_extractions_modtime
  BEFORE UPDATE ON public.document_extractions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. Medical Record Sources (Traceability Table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_record_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medical_document_id UUID NOT NULL REFERENCES public.medical_documents(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('medication', 'allergy', 'consultation', 'lab_result', 'reminder', 'diagnosis')),
  record_id TEXT NOT NULL,
  source_page INTEGER,
  source_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.medical_record_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own record sources"
  ON public.medical_record_sources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own record sources"
  ON public.medical_record_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own record sources"
  ON public.medical_record_sources FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own record sources"
  ON public.medical_record_sources FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sources_user ON public.medical_record_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_doc ON public.medical_record_sources(medical_document_id);
CREATE INDEX IF NOT EXISTS idx_sources_record ON public.medical_record_sources(record_type, record_id);

