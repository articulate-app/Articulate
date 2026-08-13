"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { X, User, Bell, Shield, CreditCard, Sparkles, Users, ChevronLeft, FolderKanban, Wrench } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Dropzone } from "../dropzone";
import { useTaskAttachmentsUpload } from "../../hooks/use-task-attachments-upload";
import {
  getActiveUserWorkloadSetting,
  upsertCurrentDailyCapacity,
  parseDailyCapacityInput,
  DEFAULT_DAILY_CAPACITY_HOURS,
} from "../../lib/services/user-workload-settings";
import { AiTokenLimitsSettingsPanel } from "./ai-token-limits-settings";
import { SettingsBillingPanel } from "./settings-billing-panel";
import { SettingsTeamsPanel, type SettingsTeamsDetailState } from "./settings-teams-panel";
import { BrowserHelperDevicesSettings } from "./browser-helper-devices-settings";
import { UserProjectsSettingsSection } from "../users/user-projects-settings-section";
import { UserSkillsSettingsSection } from "../users/user-skills-settings-section";
import { cn } from "@/lib/utils";

type SettingsCategory =
  | "account"
  | "notifications"
  | "security"
  | "billing"
  | "teams"
  | "projects"
  | "skills"
  | "ai-limits";

const CATEGORIES: { id: SettingsCategory; label: string; icon: typeof User }[] = [
  { id: "account", label: "Account", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "teams", label: "Teams", icon: Users },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "skills", label: "Skills", icon: Wrench },
  { id: "ai-limits", label: "AI limits", icon: Sparkles },
];

interface SettingsPanelProps {
  open: boolean;
  onClose?: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("account");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [sendInvoices, setSendInvoices] = useState(false);
  const [sendContent, setSendContent] = useState(false);
  const [sendInspiration, setSendInspiration] = useState(false);
  const [sendReports, setSendReports] = useState(false);
  const [dailyCapacity, setDailyCapacity] = useState(String(DEFAULT_DAILY_CAPACITY_HOURS));
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [teamsDetail, setTeamsDetail] = useState<SettingsTeamsDetailState>({ open: false });
  const [teamsBackRequestId, setTeamsBackRequestId] = useState(0);
  const [isBillingHistoryExpanded, setIsBillingHistoryExpanded] = useState(false);
  const [billingHistoryBackRequestId, setBillingHistoryBackRequestId] = useState(0);
  const router = useRouter();

  const handleTeamsDetailChange = useCallback((next: SettingsTeamsDetailState) => {
    setTeamsDetail((prev) => {
      if (!next.open && !prev.open) return prev
      if (next.open && prev.open && next.title === prev.title) return prev
      return next
    })
  }, []);

  const handleBillingHistoryExpandedChange = useCallback((expanded: boolean) => {
    setIsBillingHistoryExpanded(expanded)
  }, []);

  const attachmentsUpload = useTaskAttachmentsUpload({
    tableName: "users",
    recordId: userId,
    bucketName: "attachments",
  });

  const profileImageUrl =
    attachmentsUpload.attachments.length > 0 && attachmentsUpload.signedUrls[attachmentsUpload.attachments[0].id]
      ? attachmentsUpload.signedUrls[attachmentsUpload.attachments[0].id]
      : null;

  useEffect(() => {
    if (!open) return;

    // DropdownMenu can leave body pointer-events:none when opening this dialog from the avatar menu.
    const clearPointerEvents = () => {
      document.body.style.pointerEvents = "";
    };
    clearPointerEvents();
    const clearTimers = [
      window.setTimeout(clearPointerEvents, 0),
      window.setTimeout(clearPointerEvents, 50),
      window.setTimeout(clearPointerEvents, 150),
    ];

    const liveParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : searchParams;
    const requested = liveParams.get("settingsCategory");
    if (
      requested === "account"
      || requested === "notifications"
      || requested === "security"
      || requested === "billing"
      || requested === "teams"
      || requested === "projects"
      || requested === "skills"
      || requested === "ai-limits"
    ) {
      setActiveCategory(requested);
    }

    return () => {
      clearTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [open, searchParams]);

  useEffect(() => {
    if (!open) {
      setTeamsDetail({ open: false })
      setIsBillingHistoryExpanded(false)
      return
    }
    if (activeCategory !== "teams") {
      setTeamsDetail({ open: false })
    }
    if (activeCategory !== "billing") {
      setIsBillingHistoryExpanded(false)
    }
  }, [open, activeCategory]);

  useEffect(() => {
    if (!open) return;
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      const supabase = createClientComponentClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      const { data: userRows, error: userError } = await supabase
        .from("users")
        .select("id, full_name, email, created_at, send_invoices, send_content, send_inspiration, send_reports, auth_user_id")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();
      if (userError || !userRows) {
        setError("User profile not found");
        setLoading(false);
        return;
      }
      setProfile(userRows);
      setFullName(userRows.full_name || "");
      setSendInvoices(!!userRows.send_invoices);
      setSendContent(!!userRows.send_content);
      setSendInspiration(!!userRows.send_inspiration);
      setSendReports(!!userRows.send_reports);
      setCreatedAt(userRows.created_at || null);
      setEmail(userRows.email || "");
      setUserId(userRows.id);
      try {
        const activeSetting = await getActiveUserWorkloadSetting(userRows.id);
        setDailyCapacity(
          String(activeSetting?.daily_capacity_hours ?? DEFAULT_DAILY_CAPACITY_HOURS),
        );
      } catch {
        setDailyCapacity(String(DEFAULT_DAILY_CAPACITY_HOURS));
      }
      setLoading(false);
    };
    fetchProfile();
  }, [open]);

  const handleSave = async () => {
    if (!profile) return;
    const parsedCapacity = parseDailyCapacityInput(dailyCapacity);
    if (parsedCapacity === null) {
      setError("Daily capacity must be a number greater than 0");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClientComponentClient();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        send_invoices: sendInvoices,
        send_content: sendContent,
        send_inspiration: sendInspiration,
        send_reports: sendReports,
      })
      .eq("id", profile.id);
    if (updateError) {
      setError("Failed to update settings");
      setSaving(false);
      return;
    }
    try {
      await upsertCurrentDailyCapacity(profile.id, parsedCapacity);
    } catch {
      setError("Failed to update daily capacity");
      setSaving(false);
      return;
    }
    setProfile({
      ...profile,
      full_name: fullName,
      send_invoices: sendInvoices,
      send_content: sendContent,
      send_inspiration: sendInspiration,
      send_reports: sendReports,
    });
    setDailyCapacity(String(parsedCapacity));
    setSaving(false);
  };

  function getInitials(name: string, mail: string) {
    if (name) {
      const parts = name.trim().split(" ");
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (mail) return mail[0].toUpperCase();
    return "U";
  }

  const showFooter = activeCategory === "account" || activeCategory === "notifications";

  const renderAccount = () => (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {profileImageUrl ? (
          <img
            src={profileImageUrl}
            alt="Profile"
            className="h-14 w-14 rounded-full border border-gray-200 object-cover"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xl font-semibold text-gray-700">
            {getInitials(fullName, email)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-900">{fullName || "—"}</div>
          <div className="truncate text-sm text-gray-500">{email}</div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Profile picture</label>
        <Dropzone
          tableName="users"
          recordId={userId}
          bucketName="attachments"
          attachments={attachmentsUpload.attachments}
          signedUrls={attachmentsUpload.signedUrls}
          isUploading={attachmentsUpload.isUploading}
          uploadError={attachmentsUpload.uploadError}
          uploadFiles={attachmentsUpload.uploadFiles}
          deleteAttachment={attachmentsUpload.deleteAttachment}
          onChange={attachmentsUpload.fetchAttachments}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Full name</label>
        <Input value={fullName} onChange={e => setFullName(e.target.value)} disabled={saving} className="w-full" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
        <Input value={email} disabled className="w-full bg-gray-50" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Daily capacity (hours)</label>
        <Input
          type="number"
          min="0"
          step="0.5"
          value={dailyCapacity}
          onChange={e => setDailyCapacity(e.target.value)}
          disabled={saving}
          className="w-full"
        />
        <p className="mt-1 text-xs text-gray-500">Used to calculate your daily occupation and availability.</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Created at</label>
        <Input value={createdAt ? new Date(createdAt).toLocaleString() : "-"} disabled className="w-full bg-gray-50" />
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-1">
      <p className="mb-3 text-sm text-gray-500">Choose which emails you want to receive.</p>
      {[
        { id: "send-invoices", label: "Receive invoices", value: sendInvoices, set: setSendInvoices },
        { id: "send-content", label: "Receive content", value: sendContent, set: setSendContent },
        { id: "send-inspiration", label: "Receive inspiration", value: sendInspiration, set: setSendInspiration },
        { id: "send-reports", label: "Receive reports", value: sendReports, set: setSendReports },
      ].map(item => (
        <div key={item.id} className="flex items-center justify-between border-b border-gray-100 py-3 last:border-b-0">
          <span className="text-sm text-gray-700">{item.label}</span>
          <Select value={item.value ? "on" : "off"} onValueChange={(v) => item.set(v === "on")} disabled={saving}>
            <SelectTrigger className="h-8 w-auto gap-1 border-0 bg-transparent px-2 text-gray-900 hover:bg-gray-100 focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="min-w-[7rem]">
              <SelectItem value="on">On</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 py-3">
        <div>
          <div className="text-sm font-medium text-gray-900">Password</div>
          <p className="text-sm text-gray-500">Change the password used to sign in.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/auth/update-password")}>
          Update password
        </Button>
      </div>
      <BrowserHelperDevicesSettings />
    </div>
  );

  const renderBilling = () => (
    <SettingsBillingPanel
      isActive={open && activeCategory === "billing"}
      onBillingHistoryExpandedChange={handleBillingHistoryExpandedChange}
      billingHistoryBackRequestId={billingHistoryBackRequestId}
    />
  );

  const renderAiLimits = () => <AiTokenLimitsSettingsPanel />;

  const renderMyProjects = () => {
    const numericUserId = Number(userId)
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return <div className="py-12 text-center text-sm text-gray-500">Loading projects...</div>
    }
    return <UserProjectsSettingsSection userId={numericUserId} />
  }

  const renderMySkills = () => {
    const numericUserId = Number(userId)
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return <div className="py-12 text-center text-sm text-gray-500">Loading skills...</div>
    }
    return <UserSkillsSettingsSection userId={numericUserId} />
  }

  const renderTeams = () => {
    const numericUserId = Number(userId)
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return <div className="py-12 text-center text-sm text-gray-500">Loading teams...</div>
    }
    return (
      <SettingsTeamsPanel
        userId={numericUserId}
        isActive={open && activeCategory === "teams"}
        onDetailOpenChange={handleTeamsDetailChange}
        backRequestId={teamsBackRequestId}
      />
    )
  }

  const renderCategory = () => {
    switch (activeCategory) {
      case "account":
        return renderAccount();
      case "notifications":
        return renderNotifications();
      case "security":
        return renderSecurity();
      case "billing":
        return renderBilling();
      case "teams":
        return renderTeams();
      case "projects":
        return renderMyProjects();
      case "skills":
        return renderMySkills();
      case "ai-limits":
        return renderAiLimits();
      default:
        return null;
    }
  };

  const activeLabel = CATEGORIES.find(c => c.id === activeCategory)?.label ?? "Settings";
  const isTeamsDetailOpen = activeCategory === "teams" && teamsDetail.open;
  const isBillingHistoryFull = activeCategory === "billing" && isBillingHistoryExpanded;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(78vh,620px)] w-[min(820px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl duration-200 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Settings</DialogPrimitive.Title>

          <aside className="flex w-52 shrink-0 flex-col border-r border-gray-100 bg-gray-50/60 p-3">
            <div className="px-2 pb-2 pt-1 text-base font-semibold text-gray-900">Settings</div>
            <nav className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {CATEGORIES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveCategory(id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeCategory === id
                      ? "bg-gray-200/70 font-medium text-gray-900"
                      : "text-gray-600 hover:bg-gray-100",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex min-w-0 items-center gap-1">
                {isTeamsDetailOpen || isBillingHistoryFull ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isBillingHistoryFull) {
                        setBillingHistoryBackRequestId((id) => id + 1)
                        return
                      }
                      setTeamsBackRequestId((id) => id + 1)
                    }}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                    aria-label={isBillingHistoryFull ? "Back to billing" : "Back to teams"}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                ) : null}
                <h2 className="truncate text-sm font-medium text-gray-900">
                  {isBillingHistoryFull
                    ? "Billing history"
                    : isTeamsDetailOpen
                      ? (teamsDetail.title ?? "Team")
                      : activeLabel}
                </h2>
              </div>
              <DialogPrimitive.Close
                aria-label="Close settings"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div
              className={cn(
                "min-h-0 flex-1",
                // Keep scrollbar on the content edge (same as teams list). Full history
                // owns padding internally so its nested list scrollbar also aligns.
                isBillingHistoryFull ? "overflow-hidden p-0" : "overflow-auto px-6 py-5",
              )}
            >
              {loading ? (
                <div className="flex items-center justify-center py-12 text-sm text-gray-500">Loading settings...</div>
              ) : error && !profile ? (
                <div className="flex items-center justify-center py-12 text-sm text-red-500">{error}</div>
              ) : (
                renderCategory()
              )}
            </div>

            {showFooter && !loading && profile ? (
              <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-3">
                <span className="text-xs text-red-500">{error || ""}</span>
                <Button size="sm" onClick={handleSave} disabled={saving || !fullName.trim()}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
