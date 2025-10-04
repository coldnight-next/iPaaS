import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * CurrencyService handles currency conversion and exchange rate management
 * Uses caching to minimize API calls and improve performance
 */
export class CurrencyService {
  private supabase: SupabaseClient;
  private static readonly CACHE_DURATION_MS = 3600000; // 1 hour
  private static readonly API_BASE_URL = 'https://api.exchangerate-api.com/v4/latest';
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get exchange rate between two currencies
   * Uses cached rate if available and fresh, otherwise fetches from API
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    // Same currency, no conversion needed
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    // Try to get from cache first
    const cachedRate = await this.getCachedRate(fromCurrency, toCurrency);
    if (cachedRate !== null) {
      console.log(`Using cached rate for ${fromCurrency} -> ${toCurrency}: ${cachedRate}`);
      return cachedRate;
    }

    // Fetch fresh rate from API
    console.log(`Fetching fresh rate for ${fromCurrency} -> ${toCurrency}`);
    const rate = await this.fetchRateFromAPI(fromCurrency, toCurrency);

    // Cache the rate
    await this.cacheRate(fromCurrency, toCurrency, rate);

    return rate;
  }

  /**
   * Convert amount from one currency to another
   */
  async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    const converted = amount * rate;
    
    // Round to 2 decimal places for currency
    return Math.round(converted * 100) / 100;
  }

  /**
   * Get conversion data including rate and converted amount
   */
  async getConversionData(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<{
    originalAmount: number;
    originalCurrency: string;
    convertedAmount: number;
    targetCurrency: string;
    exchangeRate: number;
  }> {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = await this.convertAmount(amount, fromCurrency, toCurrency);

    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      convertedAmount,
      targetCurrency: toCurrency,
      exchangeRate: rate,
    };
  }

  /**
   * Get cached exchange rate if available and not expired
   */
  private async getCachedRate(
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    try {
      const { data, error } = await this.supabase
        .from('currency_rates')
        .select('rate, updated_at')
        .eq('from_currency', fromCurrency.toUpperCase())
        .eq('to_currency', toCurrency.toUpperCase())
        .single();

      if (error || !data) {
        return null;
      }

      // Check if cache is still valid
      const updatedAt = new Date(data.updated_at).getTime();
      const now = Date.now();
      const age = now - updatedAt;

      if (age < CurrencyService.CACHE_DURATION_MS) {
        return data.rate;
      }

      // Cache expired
      return null;
    } catch (error) {
      console.error('Error getting cached rate:', error);
      return null;
    }
  }

  /**
   * Fetch exchange rate from external API
   */
  private async fetchRateFromAPI(
    fromCurrency: string,
    toCurrency: string
  ): Promise<number> {
    try {
      const response = await fetch(
        `${CurrencyService.API_BASE_URL}/${fromCurrency.toUpperCase()}`
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.rates || !data.rates[toCurrency.toUpperCase()]) {
        throw new Error(`Rate not found for ${toCurrency}`);
      }

      return data.rates[toCurrency.toUpperCase()];
    } catch (error) {
      console.error('Error fetching rate from API:', error);
      throw new Error(
        `Failed to fetch exchange rate for ${fromCurrency} -> ${toCurrency}: ${error.message}`
      );
    }
  }

  /**
   * Cache exchange rate in database
   */
  private async cacheRate(
    fromCurrency: string,
    toCurrency: string,
    rate: number
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('currency_rates')
        .upsert(
          {
            from_currency: fromCurrency.toUpperCase(),
            to_currency: toCurrency.toUpperCase(),
            rate,
            updated_at: new Date().toISOString(),
            source: 'exchangerate-api',
          },
          {
            onConflict: 'from_currency,to_currency',
          }
        );

      if (error) {
        console.error('Error caching rate:', error);
      }
    } catch (error) {
      console.error('Error caching rate:', error);
    }
  }

  /**
   * Get all supported currencies from cache
   */
  async getSupportedCurrencies(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('currency_rates')
        .select('from_currency, to_currency');

      if (error || !data) {
        return ['USD', 'EUR', 'GBP', 'CAD', 'AUD']; // Default currencies
      }

      // Get unique currencies
      const currencies = new Set<string>();
      data.forEach((row) => {
        currencies.add(row.from_currency);
        currencies.add(row.to_currency);
      });

      return Array.from(currencies).sort();
    } catch (error) {
      console.error('Error getting supported currencies:', error);
      return ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
    }
  }

  /**
   * Refresh all cached rates (useful for scheduled jobs)
   */
  async refreshAllRates(baseCurrency: string = 'USD'): Promise<void> {
    const currencies = await this.getSupportedCurrencies();

    for (const currency of currencies) {
      if (currency !== baseCurrency) {
        try {
          await this.getExchangeRate(baseCurrency, currency);
          console.log(`Refreshed rate for ${baseCurrency} -> ${currency}`);
        } catch (error) {
          console.error(`Failed to refresh rate for ${currency}:`, error);
        }
      }
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<void> {
    const expiryDate = new Date(Date.now() - CurrencyService.CACHE_DURATION_MS * 24); // Keep 24 hours worth

    try {
      const { error } = await this.supabase
        .from('currency_rates')
        .delete()
        .lt('updated_at', expiryDate.toISOString());

      if (error) {
        console.error('Error clearing expired cache:', error);
      } else {
        console.log('Cleared expired currency rate cache');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }
}
