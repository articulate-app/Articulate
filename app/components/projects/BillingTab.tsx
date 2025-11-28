"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Badge } from "../ui/badge"
import { Loader2 } from "lucide-react"
import { toast } from "../ui/use-toast"
import {
  getProjectBilling,
  updateProjectBilling,
  type ProjectBillingProfile,
} from "../../lib/services/projects-briefing"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

interface BillingTabProps {
  projectId: number
}

export function BillingTab({ projectId }: BillingTabProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const [formData, setFormData] = useState<Partial<ProjectBillingProfile>>({})
  const [projectData, setProjectData] = useState<any>(null)
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set())

  // Fetch billing profile from view
  const { data: billingProfile, isLoading, error } = useQuery({
    queryKey: ["project-billing", projectId],
    queryFn: async () => {
      const result = await getProjectBilling(projectId)
      if (result.error) throw result.error
      return result.data
    },
  })

  // Fetch actual project data to check which fields are overridden
  const { data: projectRaw } = useQuery({
    queryKey: ["project-raw", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (billingProfile) {
      setFormData(billingProfile)
    }
  }, [billingProfile])

  useEffect(() => {
    if (projectRaw) {
      setProjectData(projectRaw)
    }
  }, [projectRaw])

  const isFieldOverridden = (field: string): boolean => {
    if (!projectData) return false
    const dbField = field.startsWith("billing_")
      ? field
      : field === "invoice_provider_name"
      ? "invoice_provider_name"
      : field
    return projectData[dbField] !== null && projectData[dbField] !== undefined
  }

  const getDisplayValue = (field: string): any => {
    if (!billingProfile) return null
    // Map database field names to view field names
    const viewFieldMap: Record<string, string> = {
      currency_code: "currency_code",
      vat_rate: "vat_rate",
      invoice_due_days: "invoice_due_days",
      billing_frequency: "billing_frequency",
      billing_type_id: "billing_type_id",
      billing_business_name: "business_name",
      billing_vat_number: "vat_number",
      billing_address_line1: "address_line1",
      billing_address_line2: "address_line2",
      billing_city: "city",
      billing_postcode: "postcode",
      billing_region: "region",
      billing_country_code: "country_code",
      invoice_provider_name: "invoice_provider_name",
    }
    const viewField = viewFieldMap[field] || field
    return (billingProfile as any)[viewField] ?? null
  }

  const handleSave = useCallback(
    async (field: string, value: any) => {
      if (savingFields.has(field)) return

      setSavingFields((prev) => new Set(prev).add(field))

      const patch: any = {}
      patch[field] = value === "" ? null : value

      try {
        const { error: updateError } = await updateProjectBilling(
          projectId,
          patch
        )

        if (updateError) {
          toast({
            title: "Error",
            description: `Failed to save ${field}: ${updateError.message}`,
            variant: "destructive",
          })
          if (billingProfile) {
            setFormData(billingProfile)
          }
        } else {
          toast({
            title: "Saved",
            description: `${field} updated successfully`,
          })
          queryClient.invalidateQueries({
            queryKey: ["project-billing", projectId],
          })
          queryClient.invalidateQueries({
            queryKey: ["project-raw", projectId],
          })
        }
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Failed to save",
          variant: "destructive",
        })
        if (billingProfile) {
          setFormData(billingProfile)
        }
      } finally {
        setSavingFields((prev) => {
          const next = new Set(prev)
          next.delete(field)
          return next
        })
      }
    },
    [projectId, savingFields, billingProfile, queryClient]
  )

  const handleBlur = useCallback(
    (field: string, currentValue: any) => {
      if (!billingProfile) return

      const originalValue = getDisplayValue(field)
      const normalizedCurrent =
        currentValue === "" ? null : currentValue

      if (normalizedCurrent !== originalValue) {
        handleSave(field, normalizedCurrent)
      }
    },
    [billingProfile, handleSave, getDisplayValue]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-red-600">
        Error loading billing profile: {String(error)}
      </div>
    )
  }

  if (!billingProfile) {
    return <div className="p-6 text-gray-500">No billing data found</div>
  }

  const isSaving = (field: string) => savingFields.has(field)

  const FieldWrapper = ({
    field,
    label,
    children,
  }: {
    field: string
    label: string
    children: React.ReactNode
  }) => {
    const isOverridden = isFieldOverridden(field)
    const displayValue = getDisplayValue(field)

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={field}>{label}</Label>
          {!isOverridden && displayValue && (
            <Badge variant="outline" className="text-xs">
              Fallback
            </Badge>
          )}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Billing Information</h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Currency Code */}
          <FieldWrapper field="currency_code" label="Currency Code">
            <Input
              id="currency_code"
              value={formData.currency_code || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  currency_code: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("currency_code", e.target.value)}
              disabled={isSaving("currency_code")}
              className={isSaving("currency_code") ? "opacity-50" : ""}
              placeholder="USD"
            />
          </FieldWrapper>

          {/* VAT Rate */}
          <FieldWrapper field="vat_rate" label="VAT Rate">
            <Input
              id="vat_rate"
              type="number"
              step="0.01"
              value={formData.vat_rate?.toString() || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  vat_rate: e.target.value ? parseFloat(e.target.value) : null,
                }))
              }
              onBlur={(e) =>
                handleBlur(
                  "vat_rate",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
              disabled={isSaving("vat_rate")}
              className={isSaving("vat_rate") ? "opacity-50" : ""}
              placeholder="0.00"
            />
          </FieldWrapper>

          {/* Invoice Due Days */}
          <FieldWrapper field="invoice_due_days" label="Invoice Due Days">
            <Input
              id="invoice_due_days"
              type="number"
              value={formData.invoice_due_days?.toString() || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  invoice_due_days: e.target.value
                    ? parseInt(e.target.value, 10)
                    : null,
                }))
              }
              onBlur={(e) =>
                handleBlur(
                  "invoice_due_days",
                  e.target.value ? parseInt(e.target.value, 10) : null
                )
              }
              disabled={isSaving("invoice_due_days")}
              className={isSaving("invoice_due_days") ? "opacity-50" : ""}
              placeholder="30"
            />
          </FieldWrapper>

          {/* Billing Frequency */}
          <FieldWrapper field="billing_frequency" label="Billing Frequency">
            <Input
              id="billing_frequency"
              value={formData.billing_frequency || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  billing_frequency: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("billing_frequency", e.target.value)}
              disabled={isSaving("billing_frequency")}
              className={isSaving("billing_frequency") ? "opacity-50" : ""}
              placeholder="Monthly"
            />
          </FieldWrapper>

          {/* Business Name */}
          <FieldWrapper field="billing_business_name" label="Business Name">
            <Input
              id="billing_business_name"
              value={formData.business_name || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  business_name: e.target.value,
                }))
              }
              onBlur={(e) =>
                handleBlur("billing_business_name", e.target.value)
              }
              disabled={isSaving("billing_business_name")}
              className={isSaving("billing_business_name") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* VAT Number */}
          <FieldWrapper field="billing_vat_number" label="VAT Number">
            <Input
              id="billing_vat_number"
              value={formData.vat_number || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  vat_number: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("billing_vat_number", e.target.value)}
              disabled={isSaving("billing_vat_number")}
              className={isSaving("billing_vat_number") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* Address Line 1 */}
          <FieldWrapper field="billing_address_line1" label="Address Line 1">
            <Input
              id="billing_address_line1"
              value={formData.address_line1 || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  address_line1: e.target.value,
                }))
              }
              onBlur={(e) =>
                handleBlur("billing_address_line1", e.target.value)
              }
              disabled={isSaving("billing_address_line1")}
              className={isSaving("billing_address_line1") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* Address Line 2 */}
          <FieldWrapper field="billing_address_line2" label="Address Line 2">
            <Input
              id="billing_address_line2"
              value={formData.address_line2 || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  address_line2: e.target.value,
                }))
              }
              onBlur={(e) =>
                handleBlur("billing_address_line2", e.target.value)
              }
              disabled={isSaving("billing_address_line2")}
              className={isSaving("billing_address_line2") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* City */}
          <FieldWrapper field="billing_city" label="City">
            <Input
              id="billing_city"
              value={formData.city || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, city: e.target.value }))
              }
              onBlur={(e) => handleBlur("billing_city", e.target.value)}
              disabled={isSaving("billing_city")}
              className={isSaving("billing_city") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* Postcode */}
          <FieldWrapper field="billing_postcode" label="Postcode">
            <Input
              id="billing_postcode"
              value={formData.postcode || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  postcode: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("billing_postcode", e.target.value)}
              disabled={isSaving("billing_postcode")}
              className={isSaving("billing_postcode") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* Region */}
          <FieldWrapper field="billing_region" label="Region">
            <Input
              id="billing_region"
              value={formData.region || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  region: e.target.value,
                }))
              }
              onBlur={(e) => handleBlur("billing_region", e.target.value)}
              disabled={isSaving("billing_region")}
              className={isSaving("billing_region") ? "opacity-50" : ""}
            />
          </FieldWrapper>

          {/* Country Code */}
          <FieldWrapper field="billing_country_code" label="Country Code">
            <Input
              id="billing_country_code"
              value={formData.country_code || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  country_code: e.target.value,
                }))
              }
              onBlur={(e) =>
                handleBlur("billing_country_code", e.target.value)
              }
              disabled={isSaving("billing_country_code")}
              className={isSaving("billing_country_code") ? "opacity-50" : ""}
              placeholder="US"
              maxLength={2}
            />
          </FieldWrapper>

          {/* Invoice Provider Name */}
          <FieldWrapper
            field="invoice_provider_name"
            label="Invoice Provider Name"
          >
            <Input
              id="invoice_provider_name"
              value={formData.invoice_provider_name || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  invoice_provider_name: e.target.value,
                }))
              }
              onBlur={(e) =>
                handleBlur("invoice_provider_name", e.target.value)
              }
              disabled={isSaving("invoice_provider_name")}
              className={isSaving("invoice_provider_name") ? "opacity-50" : ""}
            />
          </FieldWrapper>
        </div>
    </div>
  )
}

