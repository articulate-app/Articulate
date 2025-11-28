"use client"

import React, { useState, useCallback } from 'react'
import { Button } from '../../../app/components/ui/button'
import { Badge } from '../../../app/components/ui/badge'
import { Checkbox } from '../../../app/components/ui/checkbox'
import { Input } from '../../../app/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../../../app/components/ui/popover'
import { X, Plus, Search } from 'lucide-react'
import { toast } from '../../../app/components/ui/use-toast'

interface Channel {
  channel_id: number
  name: string
  selected: boolean
}

interface ChannelsSelectorProps {
  channels: Channel[]
  loading: boolean
  error: string | null
  onUpdateChannels: (channelIds: number[]) => Promise<void>
}

export function ChannelsSelector({ 
  channels, 
  loading, 
  error, 
  onUpdateChannels 
}: ChannelsSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([])
  const [isUpdating, setIsUpdating] = useState(false)

  // Initialize selected channels from props
  React.useEffect(() => {
    const selected = channels.filter(c => c.selected).map(c => c.channel_id)
    setSelectedChannelIds(selected)
  }, [channels])

  const handleChannelToggle = useCallback((channelId: number, checked: boolean) => {
    setSelectedChannelIds(prev => 
      checked 
        ? [...prev, channelId]
        : prev.filter(id => id !== channelId)
    )
  }, [])

  const handleSave = useCallback(async () => {
    setIsUpdating(true)
    try {
      await onUpdateChannels(selectedChannelIds)
      setIsOpen(false)
      toast({
        title: "Channels updated",
        description: `${selectedChannelIds.length} channel(s) selected.`,
      })
    } catch (err: any) {
      toast({
        title: "Failed to update channels",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }, [selectedChannelIds, onUpdateChannels])

  const handleRemoveChannel = useCallback(async (channelId: number) => {
    const newSelection = selectedChannelIds.filter(id => id !== channelId)
    setIsUpdating(true)
    try {
      await onUpdateChannels(newSelection)
      toast({
        title: "Channel removed",
        description: "Channel has been removed from selection.",
      })
    } catch (err: any) {
      toast({
        title: "Failed to remove channel",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }, [selectedChannelIds, onUpdateChannels])

  const filteredChannels = channels.filter(channel =>
    channel.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedChannels = channels.filter(c => selectedChannelIds.includes(c.channel_id))

  if (error) {
    return (
      <div className="text-sm text-red-500">
        Error loading channels: {error}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-400">Channels</label>
      
      {/* Selected channels display */}
      <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
        {selectedChannels.map(channel => (
          <Badge 
            key={channel.channel_id} 
            variant="secondary" 
            className="flex items-center gap-1 px-2 py-1"
          >
            {channel.name}
            <button
              onClick={() => handleRemoveChannel(channel.channel_id)}
              className="ml-1 hover:text-red-600"
              disabled={isUpdating}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        
        {/* Add channel button */}
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={loading || isUpdating}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search channels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            
            <div className="max-h-60 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  Loading channels...
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  {searchQuery ? "No channels found" : "No channels available"}
                </div>
              ) : (
                filteredChannels.map(channel => (
                  <div
                    key={channel.channel_id}
                    className="flex items-center space-x-2 p-2 hover:bg-gray-50"
                  >
                    <Checkbox
                      checked={selectedChannelIds.includes(channel.channel_id)}
                      onCheckedChange={(checked) => 
                        handleChannelToggle(channel.channel_id, !!checked)
                      }
                    />
                    <span className="text-sm flex-1">{channel.name}</span>
                  </div>
                ))
              )}
            </div>
            
            {selectedChannelIds.length > 0 && (
              <div className="p-3 border-t bg-gray-50">
                <Button
                  onClick={handleSave}
                  className="w-full"
                  size="sm"
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving...' : `Save ${selectedChannelIds.length} channel${selectedChannelIds.length > 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
