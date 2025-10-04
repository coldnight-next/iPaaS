import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export interface Store {
  id: string;
  store_name: string;
  is_primary: boolean;
  platform: string;
  status: string;
  metadata: {
    shop_domain?: string;
    shop_name?: string;
    [key: string]: any;
  };
  store_metadata: any;
  created_at: string;
}

interface StoreContextType {
  stores: Store[];
  selectedStore: Store | null;
  selectedStoreId: string | null;
  isLoading: boolean;
  error: string | null;
  selectStore: (storeId: string) => Promise<void>;
  refreshStores: () => Promise<void>;
  setPrimaryStore: (storeId: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

interface StoreProviderProps {
  children: ReactNode;
}

export const StoreProvider: React.FC<StoreProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load stores and user preferences
  const loadStores = async () => {
    if (!user) {
      setStores([]);
      setSelectedStoreId(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch all Shopify stores for the user
      const { data: storesData, error: storesError } = await supabase
        .from('connections')
        .select('*')
        .eq('platform', 'shopify')
        .eq('status', 'active')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (storesError) throw storesError;

      setStores(storesData || []);

      // If no stores, clear selection
      if (!storesData || storesData.length === 0) {
        setSelectedStoreId(null);
        setIsLoading(false);
        return;
      }

      // Load user preferences to get selected store
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('selected_store_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Determine which store to select
      let storeToSelect: string | null = null;

      if (prefs?.selected_store_id) {
        // Use saved preference if the store still exists
        const storeExists = storesData.some(s => s.id === prefs.selected_store_id);
        if (storeExists) {
          storeToSelect = prefs.selected_store_id;
        }
      }

      if (!storeToSelect) {
        // If no preference or store doesn't exist, use primary store
        const primaryStore = storesData.find(s => s.is_primary);
        storeToSelect = primaryStore?.id || storesData[0]?.id || null;

        // Save this as preference
        if (storeToSelect) {
          await supabase
            .from('user_preferences')
            .upsert({
              user_id: user.id,
              selected_store_id: storeToSelect
            });
        }
      }

      setSelectedStoreId(storeToSelect);
    } catch (err) {
      console.error('Error loading stores:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stores');
    } finally {
      setIsLoading(false);
    }
  };

  // Load stores on mount and when user changes
  useEffect(() => {
    loadStores();
  }, [user?.id]);

  // Select a store and save preference
  const selectStore = async (storeId: string) => {
    if (!user) return;

    try {
      setError(null);

      // Update local state immediately for better UX
      setSelectedStoreId(storeId);

      // Save preference to database
      const { error: updateError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          selected_store_id: storeId
        });

      if (updateError) throw updateError;

      console.log('Store selected:', storeId);
    } catch (err) {
      console.error('Error selecting store:', err);
      setError(err instanceof Error ? err.message : 'Failed to select store');
      // Revert selection on error
      await loadStores();
    }
  };

  // Set a store as primary
  const setPrimaryStore = async (storeId: string) => {
    if (!user) return;

    try {
      setError(null);

      // Call the database function to set primary store
      const { error: setPrimaryError } = await supabase
        .rpc('set_primary_store', {
          p_user_id: user.id,
          p_connection_id: storeId
        });

      if (setPrimaryError) throw setPrimaryError;

      // Refresh stores to update UI
      await loadStores();

      console.log('Primary store set:', storeId);
    } catch (err) {
      console.error('Error setting primary store:', err);
      setError(err instanceof Error ? err.message : 'Failed to set primary store');
    }
  };

  // Refresh stores list
  const refreshStores = async () => {
    await loadStores();
  };

  // Get the selected store object
  const selectedStore = stores.find(s => s.id === selectedStoreId) || null;

  const value: StoreContextType = {
    stores,
    selectedStore,
    selectedStoreId,
    isLoading,
    error,
    selectStore,
    refreshStores,
    setPrimaryStore,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

// Custom hook to use the store context
export const useStore = (): StoreContextType => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
