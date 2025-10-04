-- Create function to find or create customer mapping
-- This function is used by the OrderSyncService to ensure customers exist before creating orders

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS find_or_create_customer_mapping;

CREATE OR REPLACE FUNCTION find_or_create_customer_mapping(
  p_user_id UUID,
  p_shopify_customer_id TEXT,
  p_email TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_company TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_mapping_id UUID;
BEGIN
  -- First, try to find existing mapping by Shopify customer ID
  SELECT id INTO v_mapping_id
  FROM customer_mappings
  WHERE user_id = p_user_id
    AND shopify_customer_id = p_shopify_customer_id
  LIMIT 1;

  -- If found, return it
  IF v_mapping_id IS NOT NULL THEN
    RETURN v_mapping_id;
  END IF;

  -- If not found by ID, try to find by email (for duplicate prevention)
  SELECT id INTO v_mapping_id
  FROM customer_mappings
  WHERE user_id = p_user_id
    AND email = p_email
    AND email IS NOT NULL
  LIMIT 1;

  -- If found by email, update with Shopify customer ID and return
  IF v_mapping_id IS NOT NULL THEN
    UPDATE customer_mappings
    SET shopify_customer_id = p_shopify_customer_id,
        first_name = p_first_name,
        last_name = p_last_name,
        company = p_company,
        updated_at = NOW()
    WHERE id = v_mapping_id;
    
    RETURN v_mapping_id;
  END IF;

  -- If still not found, create new mapping
  INSERT INTO customer_mappings (
    user_id,
    shopify_customer_id,
    email,
    first_name,
    last_name,
    company,
    sync_status
  )
  VALUES (
    p_user_id,
    p_shopify_customer_id,
    p_email,
    p_first_name,
    p_last_name,
    p_company,
    'pending'
  )
  RETURNING id INTO v_mapping_id;

  RETURN v_mapping_id;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION find_or_create_customer_mapping IS 
  'Finds an existing customer mapping or creates a new one. Prevents duplicates by checking Shopify ID first, then email.';
