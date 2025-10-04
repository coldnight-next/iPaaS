-- Multi-Currency Support Migration
-- This migration adds multi-currency support to order_mappings and creates a currency_rates table

-- Add currency fields to order_mappings table
ALTER TABLE order_mappings
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 6) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS converted_amount NUMERIC(12, 2);

-- Create currency_rates table for caching exchange rates
CREATE TABLE IF NOT EXISTS currency_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(10, 6) NOT NULL,
  source TEXT DEFAULT 'exchangerate-api',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_currency_pair UNIQUE(from_currency, to_currency)
);

-- Create index for faster currency pair lookups
CREATE INDEX IF NOT EXISTS idx_currency_rates_pair 
ON currency_rates(from_currency, to_currency);

-- Create index for updated_at to help with cache invalidation
CREATE INDEX IF NOT EXISTS idx_currency_rates_updated 
ON currency_rates(updated_at DESC);

-- Add comments for documentation
COMMENT ON TABLE currency_rates IS 'Stores cached exchange rates between currency pairs';
COMMENT ON COLUMN currency_rates.from_currency IS 'Source currency code (e.g., USD, EUR, GBP)';
COMMENT ON COLUMN currency_rates.to_currency IS 'Target currency code';
COMMENT ON COLUMN currency_rates.rate IS 'Exchange rate from source to target currency';
COMMENT ON COLUMN currency_rates.source IS 'API source used to fetch the rate';
COMMENT ON COLUMN currency_rates.updated_at IS 'Last time the rate was updated';

COMMENT ON COLUMN order_mappings.currency IS 'Original order currency from Shopify';
COMMENT ON COLUMN order_mappings.base_currency IS 'Base currency for reporting (typically USD)';
COMMENT ON COLUMN order_mappings.exchange_rate IS 'Exchange rate applied at time of sync';
COMMENT ON COLUMN order_mappings.converted_amount IS 'Order total converted to base currency';

-- Update existing orders with default values
UPDATE order_mappings
SET 
  currency = COALESCE(currency, 'USD'),
  base_currency = COALESCE(base_currency, 'USD'),
  exchange_rate = COALESCE(exchange_rate, 1.0),
  converted_amount = COALESCE(converted_amount, total_amount)
WHERE currency IS NULL OR base_currency IS NULL;
