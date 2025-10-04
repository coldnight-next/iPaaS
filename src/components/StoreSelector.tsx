import React from 'react';
import { useStore } from '@/contexts/StoreContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Store, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface StoreSelectorProps {
  className?: string;
  showBadge?: boolean;
}

export const StoreSelector: React.FC<StoreSelectorProps> = ({ 
  className = '',
  showBadge = true 
}) => {
  const { stores, selectedStoreId, selectStore, isLoading } = useStore();

  if (isLoading) {
    return <Skeleton className={`h-10 w-48 ${className}`} />;
  }

  // Don't show selector if only one store
  if (stores.length <= 1) {
    return null;
  }

  const handleValueChange = (value: string) => {
    selectStore(value);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Select value={selectedStoreId || undefined} onValueChange={handleValueChange}>
        <SelectTrigger className="w-[250px]">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            <SelectValue placeholder="Select a store" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              <div className="flex items-center justify-between w-full gap-2">
                <span className="flex-1">{store.store_name}</span>
                {store.is_primary && showBadge && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Primary
                  </Badge>
                )}
                {store.id === selectedStoreId && (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// Compact version for nav bar
export const StoreS electorCompact: React.FC = () => {
  const { stores, selectedStore, selectStore, isLoading } = useStore();

  if (isLoading || stores.length <= 1) {
    return null;
  }

  return (
    <Select 
      value={selectedStore?.id} 
      onValueChange={selectStore}
    >
      <SelectTrigger className="w-[180px] h-9 text-sm">
        <div className="flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5" />
          <SelectValue>
            {selectedStore?.store_name || 'Select store'}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id} className="text-sm">
            <div className="flex items-center gap-2">
              <span>{store.store_name}</span>
              {store.is_primary && (
                <Badge variant="outline" className="text-xs h-5 px-1">
                  Primary
                </Badge>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// Store info display component
export const StoreInfo: React.FC = () => {
  const { selectedStore, isLoading } = useStore();

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (!selectedStore) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <p className="text-sm text-gray-600">No store selected</p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-white">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Store className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{selectedStore.store_name}</h3>
              {selectedStore.is_primary && (
                <Badge variant="secondary">Primary</Badge>
              )}
            </div>
            {selectedStore.metadata?.shop_domain && (
              <p className="text-sm text-gray-600 mt-1">
                {selectedStore.metadata.shop_domain}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge 
                variant={selectedStore.status === 'active' ? 'default' : 'destructive'}
                className="text-xs"
              >
                {selectedStore.status}
              </Badge>
              <span className="text-xs text-gray-500">
                Connected {new Date(selectedStore.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
