import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Database } from '@/lib/database.types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Link, 
  Unlink, 
  Search,
  Plus,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react'

type Product = Database['public']['Tables']['products']['Row']
type ItemMapping = Database['public']['Tables']['item_mappings']['Row']

interface ProductWithMapping extends Product {
  mapping?: ItemMapping
}

export default function ProductMappingManager() {
  const [shopifyProducts, setShopifyProducts] = useState<ProductWithMapping[]>([])
  const [netsuiteItems, setNetsuiteItems] = useState<Product[]>([])
  const [itemMappings, setItemMappings] = useState<ItemMapping[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedNetsuiteItem, setSelectedNetsuiteItem] = useState<string>('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    await Promise.all([
      loadProducts(),
      loadMappings()
    ])
    setIsLoading(false)
  }

  const loadProducts = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    // Load Shopify products
    const { data: shopifyData, error: shopifyError } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('platform', 'shopify')
      .order('name')

    if (!shopifyError && shopifyData) {
      setShopifyProducts(shopifyData)
    }

    // Load NetSuite items
    const { data: netsuiteData, error: netsuiteError } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('platform', 'netsuite')
      .order('name')

    if (!netsuiteError && netsuiteData) {
      setNetsuiteItems(netsuiteData)
    }
  }

  const loadMappings = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { data, error } = await supabase
      .from('item_mappings')
      .select('*')
      .eq('user_id', user.user.id)

    if (!error && data) {
      setItemMappings(data)
      
      // Merge mappings with products
      setShopifyProducts(prev => 
        prev.map(product => ({
          ...product,
          mapping: data.find(m => m.shopify_product_id === product.id)
        }))
      )
    }
  }

  const handleCreateMapping = async () => {
    if (!selectedProduct || !selectedNetsuiteItem) return

    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { error } = await supabase
      .from('item_mappings')
      .insert({
        user_id: user.user.id,
        shopify_product_id: selectedProduct.id,
        netsuite_product_id: selectedNetsuiteItem,
        sync_enabled: true,
        sync_status: 'pending',
        mapping_type: 'manual'
      })

    if (!error) {
      await loadData()
      setIsDialogOpen(false)
      setSelectedProduct(null)
      setSelectedNetsuiteItem('')
    }
  }

  const handleDeleteMapping = async (mappingId: string) => {
    const { error } = await supabase
      .from('item_mappings')
      .delete()
      .eq('id', mappingId)

    if (!error) {
      await loadData()
    }
  }

  const handleAutoMatch = async () => {
    setIsLoading(true)
    
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    // Auto-match by SKU
    for (const shopifyProduct of shopifyProducts) {
      if (shopifyProduct.mapping) continue // Skip already mapped
      if (!shopifyProduct.sku) continue

      const netsuiteMatch = netsuiteItems.find(
        item => item.sku && item.sku.toLowerCase() === shopifyProduct.sku?.toLowerCase()
      )

      if (netsuiteMatch) {
        await supabase
          .from('item_mappings')
          .insert({
            user_id: user.user.id,
            shopify_product_id: shopifyProduct.id,
            netsuite_product_id: netsuiteMatch.id,
            sync_enabled: true,
            sync_status: 'pending',
            mapping_type: 'auto_sku'
          })
      }
    }

    await loadData()
    setIsLoading(false)
  }

  const handleExportMappings = () => {
    const csv = [
      ['Shopify Product', 'Shopify SKU', 'NetSuite Item', 'NetSuite SKU', 'Status'],
      ...shopifyProducts
        .filter(p => p.mapping)
        .map(p => {
          const netsuiteProduct = netsuiteItems.find(i => i.id === p.mapping?.netsuite_product_id)
          return [
            p.name || '',
            p.sku || '',
            netsuiteProduct?.name || '',
            netsuiteProduct?.sku || '',
            p.mapping?.sync_status || ''
          ]
        })
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'product-mappings.csv'
    a.click()
  }

  const filteredProducts = shopifyProducts.filter(product => {
    const matchesSearch = 
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesFilter = 
      filterStatus === 'all' ||
      (filterStatus === 'mapped' && product.mapping) ||
      (filterStatus === 'unmapped' && !product.mapping)

    return matchesSearch && matchesFilter
  })

  const stats = {
    total: shopifyProducts.length,
    mapped: shopifyProducts.filter(p => p.mapping).length,
    unmapped: shopifyProducts.filter(p => !p.mapping).length,
    synced: itemMappings.filter(m => m.sync_status === 'synced').length
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Product Mappings</h1>
          <p className="text-muted-foreground">
            Map Shopify products to NetSuite items for order sync
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAutoMatch} variant="outline" disabled={isLoading}>
            {isLoading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Link className="w-4 h-4 mr-2" />
            )}
            Auto-Match by SKU
          </Button>
          <Button onClick={handleExportMappings} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mapped
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-2xl font-bold">{stats.mapped}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unmapped
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <XCircle className="w-4 h-4 text-red-500 mr-2" />
              <span className="text-2xl font-bold">{stats.unmapped}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Synced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.synced}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="mapped">Mapped Only</SelectItem>
                <SelectItem value="unmapped">Unmapped Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Product List */}
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredProducts.map((product) => {
              const netsuiteProduct = product.mapping 
                ? netsuiteItems.find(i => i.id === product.mapping?.netsuite_product_id)
                : null

              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent"
                >
                  <div className="flex-1">
                    <div className="font-semibold">{product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      SKU: {product.sku || 'N/A'}
                    </div>
                  </div>

                  <div className="flex-1 px-4">
                    {product.mapping ? (
                      <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="text-sm font-medium">
                            {netsuiteProduct?.name || 'Unknown'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {netsuiteProduct?.sku || 'N/A'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Unlink className="w-4 h-4" />
                        <span className="text-sm">Not mapped</span>
                      </div>
                    )}
                  </div>

                  <div>
                    {product.mapping ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMapping(product.mapping!.id)}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    ) : (
                      <Dialog open={isDialogOpen && selectedProduct?.id === product.id} onOpenChange={(open) => {
                        setIsDialogOpen(open)
                        if (!open) {
                          setSelectedProduct(null)
                          setSelectedNetsuiteItem('')
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => setSelectedProduct(product)}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Map
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create Product Mapping</DialogTitle>
                            <DialogDescription>
                              Map "{product.name}" to a NetSuite item
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4 py-4">
                            <div>
                              <Label>Shopify Product</Label>
                              <div className="p-3 bg-accent rounded-md">
                                <div className="font-medium">{product.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  SKU: {product.sku || 'N/A'}
                                </div>
                              </div>
                            </div>

                            <div>
                              <Label htmlFor="netsuite-item">NetSuite Item</Label>
                              <Select
                                value={selectedNetsuiteItem}
                                onValueChange={setSelectedNetsuiteItem}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select NetSuite item" />
                                </SelectTrigger>
                                <SelectContent>
                                  {netsuiteItems.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.name} {item.sku ? `(${item.sku})` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsDialogOpen(false)
                                setSelectedProduct(null)
                                setSelectedNetsuiteItem('')
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleCreateMapping}
                              disabled={!selectedNetsuiteItem}
                            >
                              Create Mapping
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
