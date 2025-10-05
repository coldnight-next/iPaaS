import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Input,
  Select,
  Space,
  Tag,
  List,
  Avatar,
  Typography,
  Divider,
  Empty,
  Spin,
  Button,
  Tooltip,
  Badge
} from 'antd'
import {
  SearchOutlined,
  ShopOutlined,
  DatabaseOutlined,
  FilterOutlined,
  ClearOutlined,
  HistoryOutlined,
  StarOutlined,
  StarFilled
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { debounce } from 'lodash'

const { Text, Paragraph } = Typography

interface Product {
  id: string
  platform: 'netsuite' | 'shopify'
  platform_product_id: string
  name: string
  sku?: string
  description?: string
  price?: number
  inventory_quantity?: number
  is_active: boolean
  tags?: string[]
  last_platform_sync?: string
  created_at: string
}

interface SearchResult {
  product: Product
  score: number
  matches: {
    field: string
    value: string
    highlight: string[]
  }[]
}

interface SearchHistory {
  id: string
  query: string
  filters: Record<string, any>
  timestamp: Date
  resultCount: number
}

interface EnhancedProductSearchProps {
  onProductSelect?: (product: Product) => void
  onSearchResults?: (results: SearchResult[]) => void
  placeholder?: string
  showFilters?: boolean
  showHistory?: boolean
  maxResults?: number
  enableFuzzyMatching?: boolean
}

const EnhancedProductSearch: React.FC<EnhancedProductSearchProps> = ({
  onProductSelect,
  onSearchResults,
  placeholder = "Search products by name, SKU, or description...",
  showFilters = true,
  showHistory = true,
  maxResults = 50,
  enableFuzzyMatching = true
}) => {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({
    platform: 'all',
    status: 'all',
    hasInventory: 'all'
  })
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Load search history and favorites on mount
  useEffect(() => {
    loadSearchHistory()
    loadFavorites()
  }, [])

  const loadSearchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10)

      if (error) throw error

      setSearchHistory(data?.map(item => ({
        id: item.id,
        query: item.query,
        filters: item.filters || {},
        timestamp: new Date(item.timestamp),
        resultCount: item.result_count || 0
      })) || [])
    } catch (error) {
      console.error('Failed to load search history:', error)
    }
  }

  const loadFavorites = () => {
    const saved = localStorage.getItem('product_search_favorites')
    if (saved) {
      setFavorites(new Set(JSON.parse(saved)))
    }
  }

  const saveToHistory = async (searchQuery: string, resultCount: number) => {
    if (!searchQuery.trim()) return

    try {
      await supabase.from('search_history').insert({
        query: searchQuery,
        filters,
        result_count: resultCount,
        timestamp: new Date().toISOString()
      })

      loadSearchHistory() // Refresh history
    } catch (error) {
      console.error('Failed to save search history:', error)
    }
  }

  const toggleFavorite = (productId: string) => {
    const newFavorites = new Set(favorites)
    if (newFavorites.has(productId)) {
      newFavorites.delete(productId)
    } else {
      newFavorites.add(productId)
    }
    setFavorites(newFavorites)
    localStorage.setItem('product_search_favorites', JSON.stringify([...newFavorites]))
  }

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce(async (searchQuery: string, searchFilters: typeof filters) => {
      if (!searchQuery.trim()) {
        setResults([])
        setShowSuggestions(false)
        return
      }

      setLoading(true)
      try {
        // Build search query
        let supabaseQuery = supabase
          .from('products')
          .select('*')
          .limit(maxResults)

        // Apply filters
        if (searchFilters.platform !== 'all') {
          supabaseQuery = supabaseQuery.eq('platform', searchFilters.platform)
        }

        if (searchFilters.status !== 'all') {
          supabaseQuery = supabaseQuery.eq('is_active', searchFilters.status === 'active')
        }

        if (searchFilters.hasInventory !== 'all') {
          const hasInventory = searchFilters.hasInventory === 'yes'
          supabaseQuery = supabaseQuery.gt('inventory_quantity', hasInventory ? 0 : -1)
        }

        const { data: products, error } = await supabaseQuery

        if (error) throw error

        // Perform fuzzy search and scoring
        const searchResults = enableFuzzyMatching
          ? performFuzzySearch(products || [], searchQuery)
          : performExactSearch(products || [], searchQuery)

        // Sort by score and limit results
        searchResults.sort((a, b) => b.score - a.score)
        const limitedResults = searchResults.slice(0, maxResults)

        setResults(limitedResults)
        setShowSuggestions(true)

        // Save to history
        await saveToHistory(searchQuery, limitedResults.length)

        // Notify parent component
        if (onSearchResults) {
          onSearchResults(limitedResults)
        }

      } catch (error) {
        console.error('Search failed:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300),
    [maxResults, enableFuzzyMatching, onSearchResults]
  )

  // Trigger search when query or filters change
  useEffect(() => {
    debouncedSearch(query, filters)
  }, [query, filters, debouncedSearch])

  const performFuzzySearch = (products: Product[], searchQuery: string): SearchResult[] => {
    const query = searchQuery.toLowerCase().trim()
    const results: SearchResult[] = []

    for (const product of products) {
      const matches: SearchResult['matches'] = []
      let totalScore = 0

      // Search in name (highest weight)
      const nameMatch = fuzzyMatch(product.name || '', query)
      if (nameMatch.score > 0) {
        matches.push({
          field: 'name',
          value: product.name || '',
          highlight: nameMatch.highlights
        })
        totalScore += nameMatch.score * 3 // Higher weight for name
      }

      // Search in SKU
      if (product.sku) {
        const skuMatch = fuzzyMatch(product.sku, query)
        if (skuMatch.score > 0) {
          matches.push({
            field: 'sku',
            value: product.sku,
            highlight: skuMatch.highlights
          })
          totalScore += skuMatch.score * 2 // Medium weight for SKU
        }
      }

      // Search in description
      if (product.description) {
        const descMatch = fuzzyMatch(product.description, query)
        if (descMatch.score > 0) {
          matches.push({
            field: 'description',
            value: product.description,
            highlight: descMatch.highlights
          })
          totalScore += descMatch.score * 1 // Lower weight for description
        }
      }

      // Search in tags
      if (product.tags && product.tags.length > 0) {
        for (const tag of product.tags) {
          const tagMatch = fuzzyMatch(tag, query)
          if (tagMatch.score > 0) {
            matches.push({
              field: 'tags',
              value: tag,
              highlight: tagMatch.highlights
            })
            totalScore += tagMatch.score * 1.5
            break // Only count first matching tag
          }
        }
      }

      if (totalScore > 0) {
        results.push({
          product,
          score: totalScore,
          matches
        })
      }
    }

    return results
  }

  const performExactSearch = (products: Product[], searchQuery: string): SearchResult[] => {
    const query = searchQuery.toLowerCase().trim()
    const results: SearchResult[] = []

    for (const product of products) {
      const matches: SearchResult['matches'] = []
      let totalScore = 0

      // Exact matches get higher scores
      if ((product.name || '').toLowerCase().includes(query)) {
        matches.push({
          field: 'name',
          value: product.name || '',
          highlight: [query]
        })
        totalScore += 10
      }

      if ((product.sku || '').toLowerCase().includes(query)) {
        matches.push({
          field: 'sku',
          value: product.sku || '',
          highlight: [query]
        })
        totalScore += 8
      }

      if ((product.description || '').toLowerCase().includes(query)) {
        matches.push({
          field: 'description',
          value: product.description || '',
          highlight: [query]
        })
        totalScore += 5
      }

      if (totalScore > 0) {
        results.push({
          product,
          score: totalScore,
          matches
        })
      }
    }

    return results
  }

  const fuzzyMatch = (text: string, query: string): { score: number; highlights: string[] } => {
    const textLower = text.toLowerCase()
    const queryLower = query.toLowerCase()

    // Exact match gets highest score
    if (textLower === queryLower) {
      return { score: 10, highlights: [query] }
    }

    // Starts with query
    if (textLower.startsWith(queryLower)) {
      return { score: 8, highlights: [query] }
    }

    // Contains query
    if (textLower.includes(queryLower)) {
      return { score: 6, highlights: [query] }
    }

    // Fuzzy matching - check if all query characters exist in order
    let queryIndex = 0
    let matchCount = 0

    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        matchCount++
        queryIndex++
      }
    }

    if (matchCount === queryLower.length) {
      return { score: Math.max(2, matchCount / queryLower.length * 4), highlights: [query] }
    }

    return { score: 0, highlights: [] }
  }

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights.length) return text

    let result = text
    for (const highlight of highlights) {
      const regex = new RegExp(`(${highlight})`, 'gi')
      result = result.replace(regex, '<mark>$1</mark>')
    }

    return result
  }

  const handleHistorySelect = (historyItem: SearchHistory) => {
    setQuery(historyItem.query)
    setFilters(historyItem.filters)
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setShowSuggestions(false)
  }

  const renderProductItem = (result: SearchResult) => {
    const { product, matches } = result
    const isFavorite = favorites.has(product.id)

    return (
      <List.Item
        key={product.id}
        onClick={() => onProductSelect?.(product)}
        style={{ cursor: 'pointer' }}
        actions={[
          <Tooltip title={isFavorite ? "Remove from favorites" : "Add to favorites"}>
            <Button
              type="text"
              icon={isFavorite ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                toggleFavorite(product.id)
              }}
              size="small"
            />
          </Tooltip>
        ]}
      >
        <List.Item.Meta
          avatar={
            <Badge
              count={product.platform === 'shopify' ? <ShopOutlined /> : <DatabaseOutlined />}
              style={{
                backgroundColor: product.platform === 'shopify' ? '#52c41a' : '#1890ff'
              }}
            >
              <Avatar
                style={{
                  backgroundColor: product.is_active ? '#52c41a' : '#f5222d'
                }}
              >
                {product.name?.charAt(0).toUpperCase() || '?'}
              </Avatar>
            </Badge>
          }
          title={
            <div>
              <Text strong>
                <span dangerouslySetInnerHTML={{
                  __html: highlightText(product.name || '', matches.find(m => m.field === 'name')?.highlight || [])
                }} />
              </Text>
              {product.sku && (
                <Text type="secondary" style={{ marginLeft: '8px' }}>
                  SKU: <span dangerouslySetInnerHTML={{
                    __html: highlightText(product.sku, matches.find(m => m.field === 'sku')?.highlight || [])
                  }} />
                </Text>
              )}
            </div>
          }
          description={
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {product.description && (
                <Paragraph
                  ellipsis={{ rows: 1, expandable: false }}
                  style={{ margin: 0 }}
                >
                  <span dangerouslySetInnerHTML={{
                    __html: highlightText(product.description, matches.find(m => m.field === 'description')?.highlight || [])
                  }} />
                </Paragraph>
              )}

              <Space wrap size="small">
                <Tag color={product.platform === 'shopify' ? 'green' : 'blue'}>
                  {product.platform.toUpperCase()}
                </Tag>

                {product.price && (
                  <Tag color="gold">
                    ${product.price.toFixed(2)}
                  </Tag>
                )}

                {product.inventory_quantity !== undefined && (
                  <Tag color={product.inventory_quantity > 0 ? 'green' : 'red'}>
                    Stock: {product.inventory_quantity}
                  </Tag>
                )}

                {product.tags && product.tags.slice(0, 2).map(tag => (
                  <Tag key={tag} size="small">
                    <span dangerouslySetInnerHTML={{
                      __html: highlightText(tag, matches.find(m => m.field === 'tags')?.highlight || [])
                    }} />
                  </Tag>
                ))}

                {matches.length > 0 && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Matched in: {matches.map(m => m.field).join(', ')}
                  </Text>
                )}
              </Space>
            </Space>
          }
        />
      </List.Item>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder={placeholder}
          prefix={<SearchOutlined />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          suffix={
            query && (
              <Button
                type="text"
                icon={<ClearOutlined />}
                onClick={clearSearch}
                size="small"
              />
            )
          }
          style={{ flex: 1 }}
        />

        {showFilters && (
          <>
            <Select
              value={filters.platform}
              onChange={(value) => setFilters(prev => ({ ...prev, platform: value }))}
              style={{ width: '120px' }}
              size="small"
            >
              <Select.Option value="all">All Platforms</Select.Option>
              <Select.Option value="shopify">Shopify</Select.Option>
              <Select.Option value="netsuite">NetSuite</Select.Option>
            </Select>

            <Select
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              style={{ width: '100px' }}
              size="small"
            >
              <Select.Option value="all">All Status</Select.Option>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="inactive">Inactive</Select.Option>
            </Select>

            <Select
              value={filters.hasInventory}
              onChange={(value) => setFilters(prev => ({ ...prev, hasInventory: value }))}
              style={{ width: '130px' }}
              size="small"
            >
              <Select.Option value="all">All Inventory</Select.Option>
              <Select.Option value="yes">In Stock</Select.Option>
              <Select.Option value="no">Out of Stock</Select.Option>
            </Select>
          </>
        )}
      </Space.Compact>

      {/* Search Suggestions/Results */}
      {showSuggestions && (query || results.length > 0) && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid #d9d9d9',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            maxHeight: '400px',
            overflow: 'auto'
          }}
        >
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <Spin size="small" />
              <div style={{ marginTop: '8px' }}>Searching...</div>
            </div>
          ) : results.length > 0 ? (
            <List
              size="small"
              dataSource={results}
              renderItem={renderProductItem}
              style={{ margin: 0 }}
            />
          ) : query ? (
            <Empty
              description="No products found"
              style={{ padding: '20px' }}
            />
          ) : null}

          {/* Search History */}
          {showHistory && searchHistory.length > 0 && !query && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ padding: '8px 16px' }}>
                <Text strong style={{ fontSize: '12px' }}>
                  <HistoryOutlined style={{ marginRight: '4px' }} />
                  Recent Searches
                </Text>
              </div>
              <List
                size="small"
                dataSource={searchHistory.slice(0, 3)}
                renderItem={(item) => (
                  <List.Item
                    style={{ padding: '4px 16px', cursor: 'pointer' }}
                    onClick={() => handleHistorySelect(item)}
                  >
                    <Text ellipsis style={{ fontSize: '12px' }}>
                      "{item.query}" ({item.resultCount} results)
                    </Text>
                  </List.Item>
                )}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default EnhancedProductSearch