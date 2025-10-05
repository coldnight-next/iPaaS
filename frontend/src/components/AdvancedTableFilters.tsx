import React, { useState, useEffect, useMemo } from 'react'
import {
  Space,
  Button,
  Select,
  Input,
  DatePicker,
  Checkbox,
  Tag,
  Dropdown,
  Menu,
  Badge,
  Tooltip,
  Divider
} from 'antd'
import {
  FilterOutlined,
  SearchOutlined,
  ClearOutlined,
  SaveOutlined,
  BookOutlined,
  SettingOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RangePickerProps } from 'antd/es/date-picker'

export interface FilterOption {
  key: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'date' | 'daterange' | 'number' | 'boolean'
  options?: Array<{ value: any; label: string }>
  placeholder?: string
}

export interface FilterValue {
  key: string
  value: any
  operator?: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'in'
}

export interface SavedFilter {
  id: string
  name: string
  filters: FilterValue[]
  isDefault?: boolean
  createdAt: Date
}

interface AdvancedTableFiltersProps {
  filters: FilterOption[]
  onFiltersChange: (filters: FilterValue[]) => void
  onSearchChange?: (search: string) => void
  savedFilters?: SavedFilter[]
  onSaveFilter?: (name: string, filters: FilterValue[]) => void
  onLoadFilter?: (filter: SavedFilter) => void
  onDeleteFilter?: (filterId: string) => void
  loading?: boolean
  totalResults?: number
}

const AdvancedTableFilters: React.FC<AdvancedTableFiltersProps> = ({
  filters: filterOptions,
  onFiltersChange,
  onSearchChange,
  savedFilters = [],
  onSaveFilter,
  onLoadFilter,
  onDeleteFilter,
  loading = false,
  totalResults
}) => {
  const [activeFilters, setActiveFilters] = useState<FilterValue[]>([])
  const [searchText, setSearchText] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saveFilterName, setSaveFilterName] = useState('')

  // Load default filter on mount
  useEffect(() => {
    const defaultFilter = savedFilters.find(f => f.isDefault)
    if (defaultFilter && onLoadFilter) {
      onLoadFilter(defaultFilter)
      setActiveFilters(defaultFilter.filters)
    }
  }, [savedFilters, onLoadFilter])

  // Apply filters when they change
  useEffect(() => {
    onFiltersChange(activeFilters)
  }, [activeFilters, onFiltersChange])

  // Apply search when it changes
  useEffect(() => {
    if (onSearchChange) {
      onSearchChange(searchText)
    }
  }, [searchText, onSearchChange])

  const addFilter = (filterKey: string) => {
    const filterOption = filterOptions.find(f => f.key === filterKey)
    if (!filterOption) return

    const newFilter: FilterValue = {
      key: filterKey,
      value: getDefaultValue(filterOption.type),
      operator: getDefaultOperator(filterOption.type)
    }

    setActiveFilters(prev => [...prev, newFilter])
  }

  const updateFilter = (index: number, updates: Partial<FilterValue>) => {
    setActiveFilters(prev => prev.map((filter, i) =>
      i === index ? { ...filter, ...updates } : filter
    ))
  }

  const removeFilter = (index: number) => {
    setActiveFilters(prev => prev.filter((_, i) => i !== index))
  }

  const clearAllFilters = () => {
    setActiveFilters([])
    setSearchText('')
  }

  const saveCurrentFilters = () => {
    if (!saveFilterName.trim() || !onSaveFilter) return

    onSaveFilter(saveFilterName, activeFilters)
    setSaveFilterName('')
  }

  const loadSavedFilter = (filter: SavedFilter) => {
    if (onLoadFilter) {
      onLoadFilter(filter)
    }
    setActiveFilters(filter.filters)
  }

  const getDefaultValue = (type: FilterOption['type']) => {
    switch (type) {
      case 'multiselect':
        return []
      case 'boolean':
        return false
      case 'daterange':
        return null
      default:
        return ''
    }
  }

  const getDefaultOperator = (type: FilterOption['type']) => {
    switch (type) {
      case 'text':
        return 'contains'
      case 'number':
        return 'equals'
      case 'date':
      case 'daterange':
        return 'equals'
      default:
        return 'equals'
    }
  }

  const renderFilterInput = (filter: FilterValue, index: number) => {
    const option = filterOptions.find(f => f.key === filter.key)
    if (!option) return null

    const commonProps = {
      size: 'small' as const,
      style: { width: '100%', minWidth: '120px' },
      placeholder: option.placeholder || `Enter ${option.label.toLowerCase()}`,
      value: filter.value,
      onChange: (value: any) => updateFilter(index, { value })
    }

    switch (option.type) {
      case 'text':
        return (
          <Input
            {...commonProps}
            prefix={<SearchOutlined />}
          />
        )

      case 'select':
        return (
          <Select {...commonProps}>
            {option.options?.map(opt => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        )

      case 'multiselect':
        return (
          <Select
            {...commonProps}
            mode="multiple"
            maxTagCount={2}
          >
            {option.options?.map(opt => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        )

      case 'number':
        return (
          <Input
            {...commonProps}
            type="number"
          />
        )

      case 'boolean':
        return (
          <Select {...commonProps}>
            <Select.Option value={true}>Yes</Select.Option>
            <Select.Option value={false}>No</Select.Option>
          </Select>
        )

      case 'date':
        return (
          <DatePicker
            {...commonProps}
            format="YYYY-MM-DD"
          />
        )

      case 'daterange':
        return (
          <DatePicker.RangePicker
            {...commonProps}
            format="YYYY-MM-DD"
          />
        )

      default:
        return <Input {...commonProps} />
    }
  }

  const renderOperatorSelect = (filter: FilterValue, index: number) => {
    const option = filterOptions.find(f => f.key === filter.key)
    if (!option) return null

    const operators = getOperatorsForType(option.type)

    if (operators.length <= 1) return null

    return (
      <Select
        size="small"
        value={filter.operator}
        onChange={(operator) => updateFilter(index, { operator })}
        style={{ width: '100px' }}
      >
        {operators.map(op => (
          <Select.Option key={op.value} value={op.value}>
            {op.label}
          </Select.Option>
        ))}
      </Select>
    )
  }

  const getOperatorsForType = (type: FilterOption['type']) => {
    switch (type) {
      case 'text':
        return [
          { value: 'contains', label: 'Contains' },
          { value: 'equals', label: 'Equals' },
          { value: 'startsWith', label: 'Starts with' },
          { value: 'endsWith', label: 'Ends with' }
        ]
      case 'number':
        return [
          { value: 'equals', label: '=' },
          { value: 'greaterThan', label: '>' },
          { value: 'lessThan', label: '<' }
        ]
      case 'date':
      case 'daterange':
        return [
          { value: 'equals', label: 'Equals' },
          { value: 'greaterThan', label: 'After' },
          { value: 'lessThan', label: 'Before' },
          { value: 'between', label: 'Between' }
        ]
      default:
        return [{ value: 'equals', label: 'Equals' }]
    }
  }

  const availableFilters = filterOptions.filter(option =>
    !activeFilters.some(filter => filter.key === option.key)
  )

  const savedFiltersMenu = (
    <Menu>
      {savedFilters.map(filter => (
        <Menu.Item
          key={filter.id}
          onClick={() => loadSavedFilter(filter)}
          icon={filter.isDefault ? <BookOutlined /> : undefined}
        >
          <Space>
            {filter.name}
            {filter.isDefault && <Tag size="small" color="blue">Default</Tag>}
          </Space>
        </Menu.Item>
      ))}
      {savedFilters.length > 0 && <Menu.Divider />}
      {savedFilters.map(filter => (
        <Menu.Item
          key={`delete-${filter.id}`}
          danger
          onClick={() => onDeleteFilter?.(filter.id)}
        >
          Delete "{filter.name}"
        </Menu.Item>
      ))}
    </Menu>
  )

  const activeFiltersCount = activeFilters.length + (searchText ? 1 : 0)

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Main Filter Bar */}
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          {/* Search */}
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '200px' }}
            size="small"
          />

          {/* Add Filter Dropdown */}
          {availableFilters.length > 0 && (
            <Dropdown
              menu={{
                items: availableFilters.map(filter => ({
                  key: filter.key,
                  label: filter.label,
                  onClick: () => addFilter(filter.key)
                }))
              }}
              trigger={['click']}
            >
              <Button size="small" icon={<FilterOutlined />}>
                Add Filter
              </Button>
            </Dropdown>
          )}

          {/* Saved Filters */}
          {savedFilters.length > 0 && (
            <Dropdown overlay={savedFiltersMenu} trigger={['click']}>
              <Button size="small" icon={<BookOutlined />}>
                Saved Filters
              </Button>
            </Dropdown>
          )}

          {/* Clear All */}
          {activeFiltersCount > 0 && (
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={clearAllFilters}
              danger
            >
              Clear All
            </Button>
          )}
        </Space>

        {/* Results Count */}
        <Space>
          {totalResults !== undefined && (
            <span style={{ fontSize: '12px', color: '#666' }}>
              {loading ? 'Loading...' : `${totalResults.toLocaleString()} results`}
            </span>
          )}
          {activeFiltersCount > 0 && (
            <Badge count={activeFiltersCount} size="small">
              <Button size="small" type="text" icon={<FilterOutlined />} />
            </Badge>
          )}
        </Space>
      </Space>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <Space wrap size="small">
            {activeFilters.map((filter, index) => {
              const option = filterOptions.find(f => f.key === filter.key)
              if (!option) return null

              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#f5f5f5',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    gap: '8px'
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    {option.label}:
                  </span>

                  {renderOperatorSelect(filter, index)}

                  <div style={{ minWidth: '120px' }}>
                    {renderFilterInput(filter, index)}
                  </div>

                  <Button
                    size="small"
                    type="text"
                    icon={<ClearOutlined />}
                    onClick={() => removeFilter(index)}
                    style={{ color: '#f5222d' }}
                  />
                </div>
              )
            })}
          </Space>
        </div>
      )}

      {/* Save Filter Section */}
      {activeFilters.length > 0 && onSaveFilter && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Space>
            <Input
              size="small"
              placeholder="Filter name"
              value={saveFilterName}
              onChange={(e) => setSaveFilterName(e.target.value)}
              style={{ width: '150px' }}
            />
            <Button
              size="small"
              icon={<SaveOutlined />}
              onClick={saveCurrentFilters}
              disabled={!saveFilterName.trim()}
            >
              Save Filter
            </Button>
          </Space>
        </>
      )}
    </div>
  )
}

export default AdvancedTableFilters