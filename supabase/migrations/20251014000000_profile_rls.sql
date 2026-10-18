-- ============================================================================
-- Profile page: gallery view, RLS hardening, signed avatar write.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- It is idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. nft_gallery view
--    NFTs the wallet owns that are NOT currently listed for sale, plus the
--    most recent sale price/token for each (NULL if never sold).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.nft_gallery AS
SELECT
  n.id                    AS nft_id,
  n.owner_address,
  n.token_id,
  n.token_uri,
  n.created_at            AS acquired_at,
  s.price                 AS last_sale_price,
  s.payment_token         AS last_sale_payment_token
FROM public.nfts n
LEFT JOIN LATERAL (
  SELECT price, payment_token, sold_at
  FROM public.sales
  WHERE nft_id = n.id
  ORDER BY sold_at DESC NULLS LAST, id DESC
  LIMIT 1
) s ON true
WHERE n.id NOT IN (
  SELECT nft_id FROM public.listings WHERE status = 'active'
);

-- ---------------------------------------------------------------------------
-- 2. Avatar write via SECURITY DEFINER function
--    The avatar API route verifies the personal_sign signature at the app
--    layer, then calls this function. Because anon has no direct UPDATE on
--    users (see step 3), the write goes through this function which runs
--    with the function owner's privileges.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_avatar(
  p_wallet      text,
  p_avatar_url  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET avatar_url = p_avatar_url, updated_at = now()
  WHERE lower(wallet) = lower(p_wallet);

  IF NOT FOUND THEN
    INSERT INTO public.users (wallet, avatar_url, created_at, updated_at)
    VALUES (p_wallet, p_avatar_url, now(), now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_avatar(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Revoke direct UPDATE on users from anon & authenticated, and drop any
--    permissive UPDATE policy that previously allowed browser-side writes.
--    The only path to change users.avatar_url is set_user_avatar().
--    (username writes go through a separate signed route, not anon UPDATE.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_update_policy" ON public.users;
DROP POLICY IF EXISTS "Enable update for users" ON public.users;
DROP POLICY IF EXISTS "Allow anon to update users" ON public.users;

REVOKE UPDATE ON public.users FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Enable Row Level Security on every public table that still lacks it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. SELECT policies (read-only, public) so the marketplace/profile pages can
--    render. These are intentionally permissive for reads — wallet-as-identity
--    has no auth session to scope against. Adjust/scoping belongs here.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_policy" ON public.users;
CREATE POLICY "users_select_policy" ON public.users
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "nfts_select_policy" ON public.nfts;
CREATE POLICY "nfts_select_policy" ON public.nfts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "listings_select_policy" ON public.listings;
CREATE POLICY "listings_select_policy" ON public.listings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "sales_select_policy" ON public.sales;
CREATE POLICY "sales_select_policy" ON public.sales
  FOR SELECT USING (true);

-- Views are SELECT-only and inherit RLS from their base tables; no policy
-- needed on nft_gallery itself.
