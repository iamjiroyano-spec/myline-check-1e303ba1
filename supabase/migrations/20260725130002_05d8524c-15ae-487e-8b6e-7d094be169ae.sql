
ALTER TABLE public.allowed_emails
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Allow admins to toggle the flag
DROP POLICY IF EXISTS "admin update" ON public.allowed_emails;
CREATE POLICY "admin update"
  ON public.allowed_emails
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (
    public.is_admin()
    AND lower(email) <> ALL (ARRAY['iamjiroyano@gmail.com'::text, 'hajime015@gmail.com'::text])
  );

-- Recognize either the hardcoded root admins or anyone flagged in allowed_emails
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    lower(coalesce((auth.jwt() ->> 'email')::text, '')) IN ('iamjiroyano@gmail.com', 'hajime015@gmail.com')
    OR EXISTS (
      SELECT 1 FROM public.allowed_emails ae
      WHERE ae.is_admin = true
        AND lower(ae.email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
    )
$function$;
