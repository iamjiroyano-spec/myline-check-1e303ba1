CREATE TABLE public.shared_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  record_id text NOT NULL,
  brand_name text NOT NULL DEFAULT 'LUMA',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, record_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_closings TO authenticated;
GRANT ALL ON public.shared_closings TO service_role;

ALTER TABLE public.shared_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their shared closings" ON public.shared_closings
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert their shared closings" ON public.shared_closings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their shared closings" ON public.shared_closings
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their shared closings" ON public.shared_closings
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.get_shared_closing(_id uuid)
RETURNS TABLE(id uuid, brand_name text, payload jsonb, updated_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.brand_name, s.payload, s.updated_at
  FROM public.shared_closings s
  WHERE s.id = _id
  LIMIT 1;
$function$;