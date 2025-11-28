"use client"

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Button } from '../../app/components/ui/button'
import { Input } from '../../app/components/ui/input'
import { Textarea } from '../../app/components/ui/textarea'
import { Badge } from '../../app/components/ui/badge'
import { Checkbox } from '../../app/components/ui/checkbox'
import { Check, AlertCircle, Info } from 'lucide-react'
import { toast } from '../../app/components/ui/use-toast'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import debounce from 'lodash.debounce'
import { calculateKeywordDensity, getDensityColor, extractPlainText } from './utils/keyword-density'
import { CTTVariantSEO } from './hooks/use-ctt-variant-seo'

interface SEOPanelProps {
  variantSEO: CTTVariantSEO | null | undefined
  isLoading: boolean
  onUpdateKeywords: (payload: { primaryKeyword: string; secondaryKeywords: string }) => Promise<void>
  onToggleSEORequired: (seoRequired: boolean) => Promise<void>
  isUpdatingKeywords: boolean
  isTogglingSEO: boolean
  cttId: string | null
  channelId: number | null
  languageId: number | null
  variantId?: string | null
  variantBriefingTypeId?: number | null
  taskId?: number | null // For task channel SEO
}

export function SEOPanel({ 
  variantSEO, 
  isLoading, 
  onUpdateKeywords, 
  onToggleSEORequired,
  isUpdatingKeywords,
  isTogglingSEO,
  cttId, 
  channelId, 
  languageId,
  variantId,
  variantBriefingTypeId,
  taskId
}: SEOPanelProps) {
  // Use seo_required and seo_source from variantSEO (from merged view v_ctt_variant_seo_full)
  // No need for separate flags query - it's all included in variantSEO now
  
  const [primaryKeyword, setPrimaryKeyword] = useState('')
  const [secondaryKeywords, setSecondaryKeywords] = useState('')
  const supabase = createClientComponentClient()
  
  // Fetch all component outputs for this variation to calculate keyword density
  const [componentOutputs, setComponentOutputs] = useState<string[]>([])
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  
  useEffect(() => {
    const loadComponentOutputs = async () => {
      // For task channels, use task_component_outputs
      if (taskId && channelId && languageId !== null && !cttId) {
        setIsLoadingContent(true)
        try {
          const { data, error } = await supabase
            .from('task_component_outputs')
            .select('content_text')
            .eq('task_id', taskId)
            .eq('channel_id', channelId)
          
          if (error) throw error
          
          const texts = (data || []).map(item => item.content_text || '').filter(Boolean)
          setComponentOutputs(texts)
        } catch (err: any) {
          console.error('Failed to load task component outputs for density:', err)
          setComponentOutputs([])
        } finally {
          setIsLoadingContent(false)
        }
        return
      }
      
      // For CTT variants (original behavior)
      if (!cttId || languageId === null) {
        setComponentOutputs([])
        return
      }
      
      setIsLoadingContent(true)
      try {
        // If variant has a briefing type, fetch outputs from variant-specific components
        if (variantId && variantBriefingTypeId) {
          // Get variant components
          const { data: variantComponents, error: variantComponentsError } = await supabase.rpc('briefing_components_for_variant', {
            p_variant_id: variantId,
          })
          
          if (variantComponentsError) throw variantComponentsError
          
          // Get component IDs that are selected for this variant
          const selectedComponentIds = (variantComponents || [])
            .filter((comp: any) => comp.selected)
            .map((comp: any) => comp.component_id)
          
          if (selectedComponentIds.length === 0) {
            setComponentOutputs([])
            setIsLoadingContent(false)
            return
          }
          
          // Fetch outputs for variant's selected components
          let query = supabase
            .from('content_types_tasks_component_outputs')
            .select('content_html, content_text')
            .eq('ctt_id', cttId)
            .eq('language_id', languageId)
            .in('briefing_component_id', selectedComponentIds)
          
          if (channelId === null) {
            query = query.is('channel_id', null)
          } else {
            query = query.eq('channel_id', channelId)
          }
          
          const { data, error } = await query
          
          if (error) throw error
          
          const texts = (data || []).map(item => item.content_html || item.content_text || '').filter(Boolean)
          setComponentOutputs(texts)
        } else {
          // Fall back to CTT-level component outputs (old behavior)
          let query = supabase
            .from('content_types_tasks_component_outputs')
            .select('content_html, content_text')
            .eq('ctt_id', cttId)
            .eq('language_id', languageId)
          
          if (channelId === null) {
            query = query.is('channel_id', null)
          } else {
            query = query.eq('channel_id', channelId)
          }
          
          const { data, error } = await query
          
          if (error) throw error
          
          const texts = (data || []).map(item => item.content_html || item.content_text || '').filter(Boolean)
          setComponentOutputs(texts)
        }
      } catch (err: any) {
        console.error('Failed to load component outputs for density:', err)
        setComponentOutputs([])
      } finally {
        setIsLoadingContent(false)
      }
    }
    
    loadComponentOutputs()
  }, [cttId, channelId, languageId, variantId, variantBriefingTypeId, taskId, supabase])
  
  // Calculate combined text from all component outputs
  const combinedText = React.useMemo(() => {
    return componentOutputs.map(extractPlainText).join(' ')
  }, [componentOutputs])
  
  // Parse secondary keywords
  const secondaryKeywordsArray = React.useMemo(() => {
    if (!secondaryKeywords) return []
    return secondaryKeywords.split(',').map(k => k.trim()).filter(k => k)
  }, [secondaryKeywords])
  
  // Calculate densities
  const primaryDensity = React.useMemo(() => 
    primaryKeyword ? calculateKeywordDensity(combinedText, primaryKeyword) : 0,
    [combinedText, primaryKeyword]
  )
  
  const secondaryDensities = React.useMemo(() => 
    secondaryKeywordsArray.map(keyword => ({
      keyword,
      density: calculateKeywordDensity(combinedText, keyword)
    })),
    [combinedText, secondaryKeywordsArray]
  )
  
  const isUserTypingRef = useRef(false)
  const lastSyncedSeoDataRef = useRef<string | null>(null)
  
  // Use refs to store latest values - updated immediately on change
  const primaryKeywordRef = useRef(primaryKeyword)
  const secondaryKeywordsRef = useRef(secondaryKeywords)
  const onUpdateKeywordsRef = useRef(onUpdateKeywords)
  
  // Keep refs in sync with state
  useEffect(() => {
    primaryKeywordRef.current = primaryKeyword
  }, [primaryKeyword])
  
  useEffect(() => {
    secondaryKeywordsRef.current = secondaryKeywords
  }, [secondaryKeywords])
  
  // Sync local state with variantSEO prop (only when data changes, not when user is typing)
  useEffect(() => {
    if (!variantSEO || isUserTypingRef.current) return
    
    // Create a key to track if variantSEO actually changed
    const seoDataKey = `${variantSEO.primary_keyword || ''}|${JSON.stringify(variantSEO.secondary_keywords)}`
    
    // Only sync if data changed
    if (seoDataKey !== lastSyncedSeoDataRef.current) {
      const newPrimary = variantSEO.primary_keyword || ''
      const secondaryStr = Array.isArray(variantSEO.secondary_keywords)
        ? variantSEO.secondary_keywords.join(', ')
        : (typeof variantSEO.secondary_keywords === 'string' ? variantSEO.secondary_keywords : '')
      
      setPrimaryKeyword(newPrimary)
      setSecondaryKeywords(secondaryStr)
      
      // Also update refs immediately
      primaryKeywordRef.current = newPrimary
      secondaryKeywordsRef.current = secondaryStr
      
      lastSyncedSeoDataRef.current = seoDataKey
    }
  }, [variantSEO])
  
  // Keep callback ref updated
  useEffect(() => {
    onUpdateKeywordsRef.current = onUpdateKeywords
  }, [onUpdateKeywords])

  // Debounced update function - reads from refs to get latest values
  const debouncedUpdateSEORef = useRef(
    debounce(() => {
      const primary = primaryKeywordRef.current
      const secondary = secondaryKeywordsRef.current
      console.log('=== Debounced update triggered ===')
      console.log('Reading from refs:', { 
        primary, 
        secondary,
        primaryType: typeof primary,
        secondaryType: typeof secondary,
        primaryLength: primary?.length,
        secondaryLength: secondary?.length
      })
      // The mutation expects an object { primaryKeyword, secondaryKeywords }
      const payload = { primaryKeyword: primary, secondaryKeywords: secondary }
      console.log('Calling onUpdateKeywordsRef.current with payload:', payload)
      if (onUpdateKeywordsRef.current) {
        onUpdateKeywordsRef.current(payload).catch(err => {
          console.error('Failed to update keywords:', err)
          toast({
            title: 'Error',
            description: 'Failed to save keywords',
            variant: 'destructive'
          })
        })
      } else {
        console.error('onUpdateKeywordsRef.current is null/undefined!')
      }
    }, 700)
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateSEORef.current.cancel()
    }
  }, [])

  // Handle primary keyword change
  const handlePrimaryKeywordChange = useCallback((value: string) => {
    console.log('handlePrimaryKeywordChange called with value:', value)
    isUserTypingRef.current = true
    setPrimaryKeyword(value)
    // Update ref immediately so debounced function always has latest value
    primaryKeywordRef.current = value
    console.log('Updated primaryKeywordRef.current to:', primaryKeywordRef.current)
    // Trigger debounced update - it will read latest values from refs
    debouncedUpdateSEORef.current()
    // Reset typing flag after debounce delay
    setTimeout(() => {
      isUserTypingRef.current = false
    }, 800)
  }, [])

  // Handle secondary keywords change
  const handleSecondaryKeywordsChange = useCallback((value: string) => {
    isUserTypingRef.current = true
    setSecondaryKeywords(value)
    // Update ref immediately so debounced function always has latest value
    secondaryKeywordsRef.current = value
    // Trigger debounced update - it will read latest values from refs
    debouncedUpdateSEORef.current()
    // Reset typing flag after debounce delay
    setTimeout(() => {
      isUserTypingRef.current = false
    }, 800)
  }, [])

  // Handle SEO override toggle for variant
  const handleSEOOverrideToggle = useCallback(async (checked: boolean) => {
    try {
      await onToggleSEORequired(checked)
      toast({
        title: 'Success',
        description: `SEO requirement ${checked ? 'enabled' : 'disabled'} for this variation`
      })
    } catch (err: any) {
      console.error('Failed to toggle SEO override:', err)
      toast({
        title: 'Error',
        description: 'Failed to update SEO requirement',
        variant: 'destructive'
      })
    }
  }, [onToggleSEORequired])



  // For task channels, always show (don't require languageId check)
  // For CTT variants, require languageId
  const isTaskChannel = !cttId && taskId
  
  if (!isTaskChannel && languageId === null) {
    return (
      <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
        <Info className="w-5 h-5 mx-auto mb-2 text-gray-400" />
        <div className="text-sm">Select a variation to configure SEO.</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="text-sm text-gray-500">Loading SEO settings...</div>
      </div>
    )
  }

  // For task channels, always show the panel (can override)
  // For CTT variants, only show if SEO is required
  if (!isTaskChannel && (!variantSEO || !variantSEO.seo_required)) {
    return (
      <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">
        <Info className="w-5 h-5 mx-auto mb-2 text-gray-400" />
        <div className="text-sm">SEO not required for this variation.</div>
      </div>
    )
  }
  
  // Determine if SEO is actually required (either effective or overridden)
  const seoIsRequired = variantSEO?.seo_required || variantSEO?.seo_required_override === true

  // Get badge info based on seo_source from variantSEO
  // Map view source values to badge text
  const getBadgeInfo = () => {
    if (!variantSEO?.seo_source) return { text: 'Inherited', variant: 'outline' as const }
    
    if (variantSEO.seo_source === 'variant') {
      return { text: 'Overridden here', variant: 'default' as const }
    } else if (variantSEO.seo_source === 'project_content_type_channel' || variantSEO.seo_source === 'project_content_type') {
      return { text: 'Project setting', variant: 'secondary' as const }
    } else if (variantSEO.seo_source === 'content_type_channel' || variantSEO.seo_source === 'content_type') {
      return { text: 'Content type default', variant: 'outline' as const }
    } else {
      return { text: 'Inherited', variant: 'outline' as const }
    }
  }

  const badgeInfo = getBadgeInfo()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-medium text-gray-900">SEO Settings</h3>
          <Badge variant={badgeInfo.variant} className="text-xs">
            {badgeInfo.text}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Checkbox
            checked={variantSEO?.seo_required_override === true}
            onCheckedChange={handleSEOOverrideToggle}
            className="text-sm"
            disabled={isLoading || isTogglingSEO}
          />
          <label className="text-sm text-gray-700 cursor-pointer" onClick={() => {
            if (!isLoading && !isTogglingSEO) {
              handleSEOOverrideToggle(!(variantSEO?.seo_required_override === true))
            }
          }}>
            Require SEO for this variation
          </label>
        </div>
      </div>

      {/* SEO Fields - Only show if SEO is required (either effective or overridden) */}
      {seoIsRequired && (
        <>
          <div className="grid grid-cols-1 gap-4">
            {/* Primary Keyword */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Primary Keyword</label>
              <Input
                value={primaryKeyword}
                onChange={(e) => handlePrimaryKeywordChange(e.target.value)}
                placeholder="Primary keyword for this variation"
                className="w-full"
                disabled={isUpdatingKeywords || isLoading}
              />
            </div>

            {/* Secondary Keywords */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Secondary Keywords</label>
              <Textarea
                value={secondaryKeywords}
                onChange={(e) => handleSecondaryKeywordsChange(e.target.value)}
                placeholder="Additional keywords (comma-separated)"
                className="w-full"
                rows={3}
                disabled={isUpdatingKeywords || isLoading}
              />
            </div>
          </div>

          {/* Keyword Density Table */}
          {(primaryKeyword || secondaryKeywordsArray.length > 0) && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Keyword density</h4>
          {isLoadingContent ? (
            <div className="text-sm text-gray-500 py-2">Loading component content...</div>
          ) : !combinedText ? (
            <div className="text-sm text-gray-500 py-2">
              No component content available yet. Add content to components to see keyword density.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {primaryKeyword && (
                    <tr>
                      <td className="px-3 py-2 text-left">{primaryKeyword}</td>
                      <td className={`px-3 py-2 text-right font-medium ${getDensityColor(primaryDensity).color}`}>
                        {primaryDensity.toFixed(1)}%
                      </td>
                    </tr>
                  )}
                  {secondaryDensities.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-left">{item.keyword}</td>
                      <td className={`px-3 py-2 text-right font-medium ${getDensityColor(item.density).color}`}>
                        {item.density.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          )}
        </>
      )}

      {/* Save Status */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isUpdatingKeywords ? (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
              Saving...
            </div>
          ) : variantSEO?.updated_at ? (
            <div className="flex items-center gap-2 text-green-600">
              <Check className="w-4 h-4" />
              Saved {new Date(variantSEO.updated_at).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
