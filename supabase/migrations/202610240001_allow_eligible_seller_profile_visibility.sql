-- ARC_SILK v117: permit public profile visibility only for eligible sellers.
-- This migration was applied to the connected Supabase project.
CREATE OR REPLACE FUNCTION public.guard_profile_privilege_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  submitted_listing_count integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Profile ownership cannot be changed';
    END IF;

    IF NEW.is_seller IS DISTINCT FROM OLD.is_seller THEN
      IF OLD.is_seller = false AND NEW.is_seller = true THEN
        SELECT count(*) INTO submitted_listing_count
        FROM public.marketplace_listings
        WHERE seller_id = OLD.user_id AND status = 'submitted';

        IF submitted_listing_count < 5 THEN
          RAISE EXCEPTION 'Submit at least five listings before seller activation';
        END IF;
      ELSE
        RAISE EXCEPTION 'Seller status changes require an authorized workflow';
      END IF;
    END IF;

    IF NEW.is_public IS DISTINCT FROM OLD.is_public THEN
      IF NEW.is_public = false THEN
        NULL;
      ELSE
        SELECT count(*) INTO submitted_listing_count
        FROM public.marketplace_listings
        WHERE seller_id = OLD.user_id AND status = 'submitted';

        IF NOT NEW.is_seller OR submitted_listing_count < 5 THEN
          RAISE EXCEPTION 'Public seller profiles require seller activation and at least five submitted listings';
        END IF;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
