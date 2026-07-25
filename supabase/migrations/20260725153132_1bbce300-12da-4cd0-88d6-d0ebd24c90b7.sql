
CREATE TABLE public.shared_receivings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  brand_name TEXT NOT NULL DEFAULT 'LUMA',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, record_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_receivings TO authenticated;
GRANT ALL ON public.shared_receivings TO service_role;

ALTER TABLE public.shared_receivings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their shared receivings"
  ON public.shared_receivings FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their shared receivings"
  ON public.shared_receivings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their shared receivings"
  ON public.shared_receivings FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their shared receivings"
  ON public.shared_receivings FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.get_shared_receiving(_id uuid)
RETURNS TABLE (
  id uuid,
  brand_name text,
  payload jsonb,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.brand_name, s.payload, s.updated_at
  FROM public.shared_receivings s
  WHERE s.id = _id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_receiving(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_receiving(uuid) TO anon, authenticated;
