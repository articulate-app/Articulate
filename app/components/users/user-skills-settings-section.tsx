"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit, Loader2, Search, Trash2 } from "lucide-react"

import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { AddDashedButton } from "../ui/add-dashed-button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { toast } from "../ui/use-toast"
import {
  addUserContentSkill,
  deleteUserContentSkill,
  getContentTypes,
  getLanguages,
  getProductionTypes,
  getUserContentSkills,
  updateUserContentSkill,
  type UserContentSkill,
} from "../../lib/services/userSkillsAndMemberships"

type SortField =
  | "content_type_title"
  | "production_type_title"
  | "language_name"
  | "valid_from"
  | "price_novat"
  | "price_withvat"
type SortOrder = "asc" | "desc"

type UserSkillsSettingsSectionProps = {
  userId: number
}

export function UserSkillsSettingsSection({ userId }: UserSkillsSettingsSectionProps) {
  const queryClient = useQueryClient()
  const [showSkillDialog, setShowSkillDialog] = useState(false)
  const [editingSkill, setEditingSkill] = useState<UserContentSkill | null>(null)
  const [skillsSearch, setSkillsSearch] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const skillsSortField = "valid_from" as SortField
  const skillsSortOrder = "desc" as SortOrder
  const [skillForm, setSkillForm] = useState({
    contentTypeId: "",
    productionTypeId: "",
    languageId: "",
    validFrom: new Date().toISOString().split("T")[0],
    priceNoVat: "",
    priceWithVat: "",
    notes: "",
  })

  const { data: skills, isLoading } = useQuery({
    queryKey: ["user-content-skills", userId],
    queryFn: async () => {
      const result = await getUserContentSkills(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: contentTypes } = useQuery({
    queryKey: ["content-types"],
    queryFn: async () => {
      const result = await getContentTypes()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: productionTypes } = useQuery({
    queryKey: ["production-types"],
    queryFn: async () => {
      const result = await getProductionTypes()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: languages } = useQuery({
    queryKey: ["languages"],
    queryFn: async () => {
      const result = await getLanguages()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const filteredAndSortedSkills = useMemo(() => {
    if (!skills) return []

    const filtered = skills.filter((skill) => {
      if (!skillsSearch) return true
      const searchLower = skillsSearch.toLowerCase()
      return (
        skill.content_type_title?.toLowerCase().includes(searchLower) ||
        skill.production_type_title?.toLowerCase().includes(searchLower) ||
        skill.language_name?.toLowerCase().includes(searchLower) ||
        skill.language_code?.toLowerCase().includes(searchLower) ||
        skill.notes?.toLowerCase().includes(searchLower)
      )
    })

    filtered.sort((a, b) => {
      let aVal = a[skillsSortField]
      let bVal = b[skillsSortField]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === "string") aVal = aVal.toLowerCase()
      if (typeof bVal === "string") bVal = bVal.toLowerCase()

      if (aVal < bVal) return skillsSortOrder === "asc" ? -1 : 1
      if (aVal > bVal) return skillsSortOrder === "asc" ? 1 : -1
      return 0
    })

    return filtered
  }, [skills, skillsSearch, skillsSortField, skillsSortOrder])

  const handleOpenSkillDialog = (skill?: UserContentSkill) => {
    if (skill) {
      setEditingSkill(skill)
      setSkillForm({
        contentTypeId: String(skill.content_type_id || ""),
        productionTypeId: String(skill.production_type_id || ""),
        languageId: String(skill.language_id || ""),
        validFrom: skill.valid_from || new Date().toISOString().split("T")[0],
        priceNoVat: skill.price_novat || "",
        priceWithVat: skill.price_withvat || "",
        notes: skill.notes || "",
      })
    } else {
      setEditingSkill(null)
      setSkillForm({
        contentTypeId: "",
        productionTypeId: "",
        languageId: "",
        validFrom: new Date().toISOString().split("T")[0],
        priceNoVat: "",
        priceWithVat: "",
        notes: "",
      })
    }
    setShowSkillDialog(true)
  }

  const handleSaveSkill = async () => {
    setIsSubmitting(true)
    try {
      if (editingSkill) {
        const { error } = await updateUserContentSkill({
          costId: editingSkill.id,
          contentTypeId: parseInt(skillForm.contentTypeId, 10),
          productionTypeId: parseInt(skillForm.productionTypeId, 10),
          languageId: parseInt(skillForm.languageId, 10),
          validFrom: skillForm.validFrom,
          priceNoVat: parseFloat(skillForm.priceNoVat),
          priceWithVat: parseFloat(skillForm.priceWithVat),
          notes: skillForm.notes || null,
        })
        if (error) throw error
      } else {
        const { error } = await addUserContentSkill({
          userId,
          contentTypeId: parseInt(skillForm.contentTypeId, 10),
          productionTypeId: parseInt(skillForm.productionTypeId, 10),
          languageId: parseInt(skillForm.languageId, 10),
          validFrom: skillForm.validFrom,
          priceNoVat: parseFloat(skillForm.priceNoVat),
          priceWithVat: parseFloat(skillForm.priceWithVat),
          notes: skillForm.notes || undefined,
        })
        if (error) throw error
      }

      toast({
        title: "Success",
        description: `Skill ${editingSkill ? "updated" : "added"} successfully`,
      })
      queryClient.invalidateQueries({ queryKey: ["user-content-skills", userId] })
      setShowSkillDialog(false)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save skill",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSkill = async (skillId: number) => {
    try {
      const { error } = await deleteUserContentSkill(skillId)
      if (error) throw error
      toast({ title: "Success", description: "Skill deleted successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-content-skills", userId] })
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to delete skill",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Skills</h3>
            <p className="mt-0.5 text-xs text-gray-500">Your pricing and language skills.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search..."
              value={skillsSearch}
              onChange={(e) => setSkillsSearch(e.target.value)}
              className="h-8 w-40 pl-8 text-sm"
            />
          </div>
        </div>

        {filteredAndSortedSkills.length > 0 ? (
          <div>
            {filteredAndSortedSkills.map((skill) => {
              const languageLabel = skill.language_name || skill.language_code
              return (
                <div
                  key={skill.id}
                  className="flex items-start justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {skill.content_type_title}
                    </div>
                    {skill.production_type_title ? (
                      <p className="mt-0.5 truncate text-sm text-gray-500">
                        {skill.production_type_title}
                      </p>
                    ) : null}
                    {skill.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{skill.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {languageLabel ? (
                      <Badge variant="secondary" className="mr-1 text-[11px]">
                        {languageLabel}
                      </Badge>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700"
                      onClick={() => handleOpenSkillDialog(skill)}
                      aria-label="Edit skill"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                      onClick={() => void handleDeleteSkill(skill.id)}
                      aria-label="Delete skill"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-6 text-sm text-gray-500">
            {skillsSearch ? "No skills match your search" : "No content skills yet."}
          </p>
        )}

        <AddDashedButton
          label="Add skill"
          className="mt-0"
          onClick={() => handleOpenSkillDialog()}
        />
      </div>

      <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSkill ? "Edit" : "Add"} Content Skill</DialogTitle>
            <DialogDescription>Define a content skill for this user</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Content Type *</Label>
              <Select
                value={skillForm.contentTypeId}
                onValueChange={(value) => setSkillForm({ ...skillForm, contentTypeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select content type" />
                </SelectTrigger>
                <SelectContent className="z-[90]">
                  {contentTypes?.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Production Type *</Label>
              <Select
                value={skillForm.productionTypeId}
                onValueChange={(value) => setSkillForm({ ...skillForm, productionTypeId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select production type" />
                </SelectTrigger>
                <SelectContent className="z-[90]">
                  {productionTypes?.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Language *</Label>
              <Select
                value={skillForm.languageId}
                onValueChange={(value) => setSkillForm({ ...skillForm, languageId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent className="z-[90]">
                  {languages?.map((lang) => (
                    <SelectItem key={lang.id} value={String(lang.id)}>
                      {lang.long_name} ({lang.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valid From *</Label>
              <Input
                type="date"
                value={skillForm.validFrom}
                onChange={(e) => setSkillForm({ ...skillForm, validFrom: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Price (No VAT) *</Label>
              <Input
                type="number"
                step="0.01"
                value={skillForm.priceNoVat}
                onChange={(e) => setSkillForm({ ...skillForm, priceNoVat: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Price (With VAT) *</Label>
              <Input
                type="number"
                step="0.01"
                value={skillForm.priceWithVat}
                onChange={(e) => setSkillForm({ ...skillForm, priceWithVat: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={skillForm.notes}
                onChange={(e) => setSkillForm({ ...skillForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkillDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveSkill()} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingSkill ? "Update" : "Add"} Skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
