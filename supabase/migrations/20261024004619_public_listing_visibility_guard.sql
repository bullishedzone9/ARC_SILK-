-- ARC_SILK: public marketplace reads must respect seller profile visibility.
-- Sellers can always read their own listings. Everyone else can read active listings
-- only while the owning seller profile is both public and seller-enabled.
DROP POLICY IF EXISTS "Listings visible to owner or active public listings"
  ON public.marketplace_listings;

CREATE POLICY "Listings visible to owner or active public listings"
  ON public.marketplace_listings
  FOR SELECT
  USING (
    (SELECT auth.uid()) = seller_id
    OR (
      status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS seller_profile
        WHERE seller_profile.user_id = marketplace_listings.seller_id
          AND seller_profile.is_public = true
          AND seller_profile.is_seller = true
      )
    )
  );
