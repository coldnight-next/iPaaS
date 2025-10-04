import React, { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Store, 
  Plus, 
  MoreVertical, 
  Star, 
  StarOff, 
  Trash2, 
  RefreshCw,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Package,
  ShoppingCart
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface StoreStats {
  connection_id: string;
  total_orders: number;
  total_revenue: number;
  synced_orders: number;
  failed_orders: number;
  product_mappings: number;
  last_order_date: string | null;
}

export const Stores: React.FC = () => {
  const { stores, selectedStoreId, selectStore, setPrimaryStore, refreshStores } = useStore();
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [storeToEdit, setStoreToEdit] = useState<any>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const { toast } = useToast();

  // Load store statistics
  const loadStats = async () => {
    try {
      const { data, error } = await supabase
        .from('store_statistics')
        .select('*');

      if (error) throw error;

      setStoreStats(data || []);
    } catch (error) {
      console.error('Error loading store stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load store statistics',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [stores]);

  const handleSetPrimary = async (storeId: string) => {
    try {
      await setPrimaryStore(storeId);
      toast({
        title: 'Success',
        description: 'Primary store updated',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to set primary store',
        variant: 'destructive',
      });
    }
  };

  const handleEdit Store = (store: any) => {
    setStoreToEdit(store);
    setEditStoreName(store.store_name);
    setShowEditDialog(true);
  };

  const handleSaveStoreName = async () => {
    if (!storeToEdit) return;

    try {
      const { error } = await supabase
        .from('connections')
        .update({ store_name: editStoreName })
        .eq('id', storeToEdit.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Store name updated',
      });

      setShowEditDialog(false);
      await refreshStores();
      await loadStats();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update store name',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteStore = async () => {
    if (!storeToDelete) return;

    try {
      const { error } = await supabase
        .from('connections')
        .update({ status: 'inactive' })
        .eq('id', storeToDelete);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Store disconnected',
      });

      setShowDeleteDialog(false);
      setStoreToDelete(null);
      await refreshStores();
      await loadStats();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect store',
        variant: 'destructive',
      });
    }
  };

  const getStoreStats = (connectionId: string): StoreStats | undefined => {
    return storeStats.find(s => s.connection_id === connectionId);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stores</h1>
          <p className="text-gray-600 mt-1">
            Manage your connected Shopify stores
          </p>
        </div>
        <Button onClick={refreshStores}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* No stores message */}
      {stores.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No stores connected</h3>
            <p className="text-gray-600 text-center mb-4">
              Connect your first Shopify store to start syncing
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Connect Store
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Store cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => {
          const stats = getStoreStats(store.id);
          const isSelected = store.id === selectedStoreId;

          return (
            <Card 
              key={store.id} 
              className={`relative ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Store className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">
                        {store.store_name}
                      </CardTitle>
                      <CardDescription className="truncate">
                        {store.metadata?.shop_domain}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!store.is_primary && (
                        <>
                          <DropdownMenuItem onClick={() => handleSetPrimary(store.id)}>
                            <Star className="h-4 w-4 mr-2" />
                            Set as Primary
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => handleEditStore(store)}>
                        Edit Name
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => {
                          setStoreToDelete(store.id);
                          setShowDeleteDialog(true);
                        }}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 mt-3">
                  {store.is_primary && (
                    <Badge variant="default" className="gap-1">
                      <Star className="h-3 w-3" />
                      Primary
                    </Badge>
                  )}
                  {isSelected && (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  )}
                  <Badge 
                    variant={store.status === 'active' ? 'default' : 'destructive'}
                  >
                    {store.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                {/* Statistics */}
                {stats && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <ShoppingCart className="h-4 w-4" />
                        <span>Orders</span>
                      </div>
                      <span className="font-semibold">{stats.total_orders || 0}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <TrendingUp className="h-4 w-4" />
                        <span>Revenue</span>
                      </div>
                      <span className="font-semibold">
                        ${(stats.total_revenue || 0).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Package className="h-4 w-4" />
                        <span>Products</span>
                      </div>
                      <span className="font-semibold">{stats.product_mappings || 0}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Synced</span>
                      </div>
                      <span className="font-semibold text-green-600">
                        {stats.synced_orders || 0}
                      </span>
                    </div>

                    {stats.failed_orders > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <XCircle className="h-4 w-4" />
                          <span>Failed</span>
                        </div>
                        <span className="font-semibold text-red-600">
                          {stats.failed_orders}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Select store button */}
                {!isSelected && (
                  <Button 
                    className="w-full mt-4" 
                    variant="outline"
                    onClick={() => selectStore(store.id)}
                  >
                    Select Store
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Store?</DialogTitle>
            <DialogDescription>
              This will mark the store as inactive. Historical data will be preserved but
              no new syncs will occur.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteStore}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit store name dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Store Name</DialogTitle>
            <DialogDescription>
              Give this store a friendly name to easily identify it
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Store Name</Label>
              <Input
                id="store-name"
                value={editStoreName}
                onChange={(e) => setEditStoreName(e.target.value)}
                placeholder="e.g., Main Store, EU Store"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveStoreName}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
