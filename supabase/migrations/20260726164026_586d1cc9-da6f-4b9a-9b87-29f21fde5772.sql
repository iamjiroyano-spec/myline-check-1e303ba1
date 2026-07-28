CREATE TABLE public.staff_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX staff_logins_name_key ON public.staff_logins (lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_logins TO authenticated;
GRANT ALL ON public.staff_logins TO service_role;

ALTER TABLE public.staff_logins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their staff logins"
ON public.staff_logins FOR ALL TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_staff_logins_updated_at
BEFORE UPDATE ON public.staff_logins
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();