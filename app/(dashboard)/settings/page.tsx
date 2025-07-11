"use client";

import { useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { useRouter } from "next/navigation";
import { Toggle } from "../../components/ui/toggle";
import { Dropzone } from "../../components/dropzone";
import { useTaskAttachmentsUpload } from "../../hooks/use-task-attachments-upload";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null); // Auth user
  const [profile, setProfile] = useState<any>(null); // Public users table
  const [fullName, setFullName] = useState("");
  const [sendInvoices, setSendInvoices] = useState(false);
  const [sendContent, setSendContent] = useState(false);
  const [sendInspiration, setSendInspiration] = useState(false);
  const [sendReports, setSendReports] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const router = useRouter();

  // Profile picture upload
  const attachmentsUpload = useTaskAttachmentsUpload({
    tableName: "users",
    recordId: userId,
    bucketName: "attachments",
  });

  // Get the first image attachment (if any)
  const profileImageUrl =
    attachmentsUpload.attachments.length > 0 && attachmentsUpload.signedUrls[attachmentsUpload.attachments[0].id]
      ? attachmentsUpload.signedUrls[attachmentsUpload.attachments[0].id]
      : null;

  useEffect(() => {
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
      setUser(authData.user);
      // Fetch from public.users where auth_user_id = authData.user.id
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
      setLoading(false);
    };
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!profile) return;
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
    } else {
      setProfile({
        ...profile,
        full_name: fullName,
        send_invoices: sendInvoices,
        send_content: sendContent,
        send_inspiration: sendInspiration,
        send_reports: sendReports,
      });
    }
    setSaving(false);
  };

  function getInitials(name: string, email: string) {
    if (name) {
      const parts = name.trim().split(" ");
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (email) return email[0].toUpperCase();
    return "U";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading settings...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="flex flex-col items-center gap-2">
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt="Profile"
              className="w-16 h-16 rounded-full object-cover border border-gray-300"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl font-bold text-gray-700 border border-gray-300">
              {getInitials(fullName, email)}
            </div>
          )}
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Picture</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <Input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              disabled={saving}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input value={email} disabled className="w-full bg-gray-100" />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <label className="block text-sm font-medium text-gray-700">Preferences</label>
            <div className="flex items-center gap-2">
              <Toggle pressed={sendInvoices} onPressedChange={setSendInvoices} id="send-invoices" />
              <label htmlFor="send-invoices" className="text-sm">Receive invoices</label>
            </div>
            <div className="flex items-center gap-2">
              <Toggle pressed={sendContent} onPressedChange={setSendContent} id="send-content" />
              <label htmlFor="send-content" className="text-sm">Receive content</label>
            </div>
            <div className="flex items-center gap-2">
              <Toggle pressed={sendInspiration} onPressedChange={setSendInspiration} id="send-inspiration" />
              <label htmlFor="send-inspiration" className="text-sm">Receive inspiration</label>
            </div>
            <div className="flex items-center gap-2">
              <Toggle pressed={sendReports} onPressedChange={setSendReports} id="send-reports" />
              <label htmlFor="send-reports" className="text-sm">Receive reports</label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Created At</label>
            <Input value={createdAt ? new Date(createdAt).toLocaleString() : "-"} disabled className="w-full bg-gray-100" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2 items-stretch">
          <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/auth/update-password")}>Update Password</Button>
        </CardFooter>
      </Card>
    </div>
  );
} 