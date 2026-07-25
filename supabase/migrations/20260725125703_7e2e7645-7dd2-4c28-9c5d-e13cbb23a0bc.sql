CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lower(coalesce((auth.jwt() ->> 'email')::text, '')) IN ('iamjiroyano@gmail.com', 'hajime015@gmail.com')
$$;

DROP POLICY IF EXISTS "admin delete" ON public.allowed_emails;
CREATE POLICY "admin delete" ON public.allowed_emails
  FOR DELETE TO authenticated
  USING (is_admin() AND lower(email) NOT IN ('iamjiroyano@gmail.com', 'hajime015@gmail.com'));