import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Mandrill inbound webhook.
 *
 * Routes:
 * - reply+thread{id}@reply.whyarticulate.com → mentions
 * - ai@reply.whyarticulate.com / ai+*@… → ai-chat (as the sender user)
 *
 * Secrets:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - MANDRILL_INBOUND_WEBHOOK_SECRET (query ?token=…)
 * - MANDRILL_API_KEY (optional; enables AI email replies)
 *
 * Mandrill routes (same webhook URL):
 * - Pattern: reply+*
 * - Pattern: ai*
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("MANDRILL_INBOUND_WEBHOOK_SECRET") ?? "";
const MANDRILL_API_KEY = Deno.env.get("MANDRILL_API_KEY") ?? "";
const AI_INBOUND_ADDRESS = "ai@reply.whyarticulate.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, HEAD, OPTIONS",
};

type MandrillInboundMsg = {
  email?: string;
  from_email?: string;
  from_name?: string;
  subject?: string;
  text?: string | null;
  html?: string | null;
  to?: Array<[string, string | null]>;
  headers?: Record<string, string>;
  ts?: number;
};

type MandrillEvent = {
  event?: string;
  msg?: MandrillInboundMsg;
  ts?: number;
};

type InboundKind = "mention_reply" | "ai_chat" | "unknown";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function isAuthorized(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("Missing MANDRILL_INBOUND_WEBHOOK_SECRET");
    return false;
  }
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return safeEqual(token, WEBHOOK_SECRET);
}

function recipientAddresses(msg: MandrillInboundMsg): string[] {
  return [
    msg.email,
    ...(msg.to ?? []).map((pair) => pair?.[0]),
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function classifyInbound(msg: MandrillInboundMsg): InboundKind {
  for (const address of recipientAddresses(msg)) {
    const local = address.split("@")[0] ?? "";
    if (/^reply\+thread\d+$/i.test(local)) return "mention_reply";
    if (/^ai(\+.*)?$/i.test(local)) return "ai_chat";
  }
  return "unknown";
}

function extractCommentThreadId(msg: MandrillInboundMsg): number | null {
  for (const address of recipientAddresses(msg)) {
    const match = address.match(/reply\+thread(\d+)@/i);
    if (match) {
      const threadId = Number(match[1]);
      if (Number.isFinite(threadId) && threadId > 0) return threadId;
    }
  }
  return null;
}

function extractExplicitAiUserId(msg: MandrillInboundMsg): number | null {
  for (const address of recipientAddresses(msg)) {
    const match = address.match(/^ai\+user(\d+)@/i);
    if (match) {
      const userId = Number(match[1]);
      if (Number.isFinite(userId) && userId > 0) return userId;
    }
  }
  return null;
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cutPatterns = [
    /^on\s.+wrote:\s*$/i,
    /^from:\s.+/i,
    /^-{2,}\s*original message\s*-{2,}/i,
    /^_{5,}\s*$/,
    /^-{5,}\s*$/,
    /^sent from my /i,
    /^get outlook for /i,
  ];

  const kept: string[] = [];
  for (const line of lines) {
    if (cutPatterns.some((pattern) => pattern.test(line.trim()))) break;
    if (line.trim() === "--") break;
    kept.push(line);
  }

  while (kept.length > 0 && /^\s*>/.test(kept[kept.length - 1] ?? "")) {
    kept.pop();
  }

  return kept.join("\n").trim();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToCommentHtml(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`);

  return paragraphs.join("") || "<p></p>";
}

function textToEmailHtml(text: string) {
  return textToCommentHtml(text);
}

function extractReplyBody(msg: MandrillInboundMsg) {
  const rawText =
    typeof msg.text === "string" && msg.text.trim()
      ? msg.text
      : typeof msg.html === "string" && msg.html.trim()
      ? stripHtml(msg.html)
      : "";

  return stripQuotedReply(rawText);
}

/** Prefer body; if empty (common for short mobile emails), fall back to subject. */
function extractAiPrompt(msg: MandrillInboundMsg) {
  const body = extractReplyBody(msg);
  if (body) return body;

  const subject = String(msg.subject ?? "")
    .replace(/^(re|fw|fwd)\s*:\s*/i, "")
    .trim();
  return subject;
}

function providerMessageId(msg: MandrillInboundMsg, eventTs?: number) {
  const headers = msg.headers ?? {};
  const messageId =
    headers["Message-Id"] ??
    headers["Message-ID"] ??
    headers["message-id"];

  if (typeof messageId === "string" && messageId.trim()) {
    return messageId.trim();
  }

  const basis = [
    msg.from_email ?? "",
    msg.email ?? "",
    msg.subject ?? "",
    String(eventTs ?? msg.ts ?? ""),
    (msg.text ?? msg.html ?? "").slice(0, 500),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) >>> 0;
  }
  return `synthetic:${hash.toString(16)}:${basis.length}`;
}

async function resolveUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("view_users_with_email")
    .select("user_id, email, auth_user_id, full_name")
    .ilike("email", normalized)
    .limit(5);

  if (error) {
    console.error("User lookup error", error);
    return null;
  }

  const exact = (data ?? []).find(
    (row) => (row.email ?? "").toLowerCase() === normalized,
  );
  if (!exact?.user_id) return null;
  return {
    userId: Number(exact.user_id),
    email: String(exact.email ?? normalized).toLowerCase(),
    authUserId: exact.auth_user_id ? String(exact.auth_user_id) : null,
    fullName: exact.full_name ? String(exact.full_name) : null,
  };
}

async function canUserReply(threadId: number, userId: number) {
  const { data: thread } = await supabase
    .from("threads")
    .select("id, created_by")
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return { allowed: false as const, reason: "thread_not_found" };
  if (thread.created_by === userId) return { allowed: true as const };

  const { data: watcher } = await supabase
    .from("thread_watchers")
    .select("id")
    .eq("thread_id", threadId)
    .eq("watcher_id", userId)
    .maybeSingle();

  if (watcher) return { allowed: true as const };

  const { data: priorMention } = await supabase
    .from("mentions")
    .select("id")
    .eq("thread_id", threadId)
    .eq("created_by", userId)
    .limit(1)
    .maybeSingle();

  if (priorMention) return { allowed: true as const };

  const { data: threadMentions } = await supabase
    .from("mentions")
    .select("id")
    .eq("thread_id", threadId);

  const mentionIds = (threadMentions ?? []).map((row) => row.id);
  if (mentionIds.length > 0) {
    const { data: target } = await supabase
      .from("mention_targets")
      .select("id")
      .eq("user_id", userId)
      .in("mention_id", mentionIds)
      .limit(1)
      .maybeSingle();

    if (target) return { allowed: true as const };
  }

  return { allowed: false as const, reason: "forbidden" };
}

async function createUserAccessToken(email: string) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    console.error("generateLink failed", error);
    return null;
  }

  const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  });

  if (verifyError || !sessionData?.session?.access_token) {
    console.error("verifyOtp failed", verifyError);
    return null;
  }

  return sessionData.session.access_token;
}

async function ensureEmailAiThread(userId: number) {
  const { data: existing, error: existingError } = await supabase
    .from("ai_threads")
    .select("id")
    .eq("created_by", userId)
    .eq("scope", "global")
    .eq("is_deleted", false)
    .filter("metadata->>source", "eq", "email_inbound")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("Email AI thread lookup failed", existingError);
  }
  if (existing?.id) return String(existing.id);

  const { data: created, error: createError } = await supabase
    .from("ai_threads")
    .insert({
      created_by: userId,
      scope: "global",
      visibility: "private",
      is_collaborative: false,
      title: "Email",
      metadata: { source: "email_inbound" },
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw createError ?? new Error("Failed to create email AI thread");
  }

  return String(created.id);
}

async function invokeAiChatAsUser(args: {
  accessToken: string;
  threadId: string;
  message: string;
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    "Content-Type": "application/json",
  };
  if (SUPABASE_ANON_KEY) {
    headers.apikey = SUPABASE_ANON_KEY;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      thread_id: args.threadId,
      message: args.message,
      stream: false,
      context_source: "email",
    }),
  });

  const bodyText = await res.text();
  let parsed: any = null;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    console.error("ai-chat failed", res.status, bodyText.slice(0, 1000));
    return {
      ok: false as const,
      status: res.status,
      error: parsed?.error ?? bodyText.slice(0, 500),
    };
  }

  const assistantContent =
    typeof parsed?.message?.content === "string"
      ? parsed.message.content
      : typeof parsed?.content === "string"
      ? parsed.content
      : "";

  return {
    ok: true as const,
    assistantContent: assistantContent.trim(),
    assistantMessageId: parsed?.message?.id ? String(parsed.message.id) : null,
    runId: parsed?.run_id ? String(parsed.run_id) : null,
  };
}

async function sendAiEmailReply(args: {
  toEmail: string;
  subject: string;
  bodyText: string;
}) {
  if (!MANDRILL_API_KEY) {
    console.warn("MANDRILL_API_KEY missing; skipping AI email reply");
    return { ok: false as const, reason: "missing_mandrill_key" };
  }

  const subject = args.subject?.trim().toLowerCase().startsWith("re:")
    ? args.subject.trim()
    : `Re: ${args.subject?.trim() || "Articulate AI"}`;

  const payload = {
    key: MANDRILL_API_KEY,
    message: {
      from_email: "app@whyarticulate.com",
      from_name: "Articulate AI",
      headers: {
        "Reply-To": AI_INBOUND_ADDRESS,
      },
      to: [{ email: args.toEmail, type: "to" }],
      subject,
      text: args.bodyText,
      html: textToEmailHtml(args.bodyText),
    },
  };

  const res = await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("Mandrill AI reply failed", bodyText);
    return { ok: false as const, reason: bodyText.slice(0, 300) };
  }

  try {
    const parsed = JSON.parse(bodyText);
    const rejected = Array.isArray(parsed)
      ? parsed.filter((row) => row?.status === "rejected" || row?.status === "invalid")
      : [];
    if (rejected.length > 0) {
      console.error("Mandrill AI reply rejected", rejected);
      return { ok: false as const, reason: JSON.stringify(rejected) };
    }
  } catch {
    // ignore
  }

  return { ok: true as const };
}

async function processMentionReply(msg: MandrillInboundMsg, eventTs?: number) {
  const threadId = extractCommentThreadId(msg);
  if (!threadId) {
    console.warn("No thread id in recipient", msg.email, msg.to);
    return { ok: false, reason: "missing_thread_id" };
  }

  const fromEmail = (msg.from_email ?? "").trim().toLowerCase();
  if (!fromEmail) {
    return { ok: false, reason: "missing_from_email" };
  }

  const user = await resolveUserByEmail(fromEmail);
  if (!user) {
    console.warn("Unknown sender email", fromEmail);
    return { ok: false, reason: "unknown_sender" };
  }

  const access = await canUserReply(threadId, user.userId);
  if (!access.allowed) {
    console.warn("Sender not allowed", {
      fromEmail,
      userId: user.userId,
      threadId,
      reason: access.reason,
    });
    return { ok: false, reason: access.reason };
  }

  const replyText = extractReplyBody(msg);
  if (!replyText) {
    console.warn("Empty reply body after strip", { threadId, fromEmail });
    return { ok: false, reason: "empty_body" };
  }

  const messageKey = providerMessageId(msg, eventTs);

  const { data: existing } = await supabase
    .from("inbound_email_replies")
    .select("id, mention_id")
    .eq("provider_message_id", messageKey)
    .maybeSingle();

  if (existing) {
    return { ok: true, deduped: true, kind: "mention_reply", mention_id: existing.mention_id };
  }

  const { data: latestMention } = await supabase
    .from("mentions")
    .select("id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const comment = textToCommentHtml(replyText);

  const { data: mention, error: mentionError } = await supabase
    .from("mentions")
    .insert({
      thread_id: threadId,
      comment,
      attachment: null,
      reply_to_id: latestMention?.id ?? null,
      created_by: user.userId,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (mentionError || !mention) {
    console.error("Mention insert failed", mentionError);
    return { ok: false, reason: "insert_failed" };
  }

  await supabase.from("thread_watchers").upsert(
    {
      thread_id: threadId,
      watcher_id: user.userId,
      added_by: user.userId,
    },
    { onConflict: "thread_id,watcher_id", ignoreDuplicates: true },
  );

  const { error: trackError } = await supabase.from("inbound_email_replies").insert({
    provider_message_id: messageKey,
    kind: "mention_reply",
    thread_id: threadId,
    mention_id: mention.id,
    from_email: fromEmail,
  });

  if (trackError) {
    if (trackError.code === "23505") {
      return { ok: true, deduped: true, kind: "mention_reply", mention_id: mention.id };
    }
    console.error("Failed to track inbound reply", trackError);
  }

  console.log("Inbound mention reply created", {
    mention_id: mention.id,
    thread_id: threadId,
    user_id: user.userId,
  });

  return { ok: true, kind: "mention_reply", mention_id: mention.id, thread_id: threadId };
}

async function processAiChat(msg: MandrillInboundMsg, eventTs?: number) {
  const fromEmail = (msg.from_email ?? "").trim().toLowerCase();
  if (!fromEmail) {
    return { ok: false, reason: "missing_from_email" };
  }

  const user = await resolveUserByEmail(fromEmail);
  if (!user) {
    console.warn("Unknown AI sender email", fromEmail);
    return { ok: false, reason: "unknown_sender" };
  }

  const explicitUserId = extractExplicitAiUserId(msg);
  if (explicitUserId != null && explicitUserId !== user.userId) {
    console.warn("AI address user mismatch", {
      fromEmail,
      explicitUserId,
      userId: user.userId,
    });
    return { ok: false, reason: "user_mismatch" };
  }

  const bodyText = extractReplyBody(msg);
  const replyText = bodyText || extractAiPrompt(msg);
  if (!replyText) {
    console.warn("Empty AI email body and subject", {
      fromEmail,
      subject: msg.subject ?? null,
    });
    return { ok: false, reason: "empty_body" };
  }
  console.log("AI email prompt source", {
    fromEmail,
    usedSubjectFallback: !bodyText,
    promptPreview: replyText.slice(0, 160),
  });

  const messageKey = providerMessageId(msg, eventTs);
  const { data: existing } = await supabase
    .from("inbound_email_replies")
    .select("id, ai_thread_id, assistant_message_id")
    .eq("provider_message_id", messageKey)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      deduped: true,
      kind: "ai_chat",
      ai_thread_id: existing.ai_thread_id,
      assistant_message_id: existing.assistant_message_id,
    };
  }

  const aiThreadId = await ensureEmailAiThread(user.userId);
  const accessToken = await createUserAccessToken(user.email);
  if (!accessToken) {
    return { ok: false, reason: "auth_session_failed" };
  }

  const aiResult = await invokeAiChatAsUser({
    accessToken,
    threadId: aiThreadId,
    message: replyText,
  });

  if (!aiResult.ok) {
    await supabase.from("inbound_email_replies").insert({
      provider_message_id: messageKey,
      kind: "ai_chat",
      ai_thread_id: aiThreadId,
      from_email: fromEmail,
    });
    return {
      ok: false,
      reason: "ai_chat_failed",
      ai_thread_id: aiThreadId,
      error: aiResult.error,
    };
  }

  const assistantText =
    aiResult.assistantContent ||
    "Done — I processed your email in Articulate. Open the AI pane to see details.";

  const emailReply = await sendAiEmailReply({
    toEmail: fromEmail,
    subject: msg.subject ?? "Articulate AI",
    bodyText: assistantText,
  });

  const { error: trackError } = await supabase.from("inbound_email_replies").insert({
    provider_message_id: messageKey,
    kind: "ai_chat",
    ai_thread_id: aiThreadId,
    assistant_message_id: aiResult.assistantMessageId,
    from_email: fromEmail,
  });

  if (trackError && trackError.code !== "23505") {
    console.error("Failed to track inbound AI email", trackError);
  }

  console.log("Inbound AI chat processed", {
    ai_thread_id: aiThreadId,
    user_id: user.userId,
    run_id: aiResult.runId,
    emailed: emailReply.ok,
  });

  return {
    ok: true,
    kind: "ai_chat",
    ai_thread_id: aiThreadId,
    assistant_message_id: aiResult.assistantMessageId,
    emailed: emailReply.ok,
  };
}

async function processInboundMessage(msg: MandrillInboundMsg, eventTs?: number) {
  const kind = classifyInbound(msg);
  if (kind === "mention_reply") {
    return processMentionReply(msg, eventTs);
  }
  if (kind === "ai_chat") {
    return processAiChat(msg, eventTs);
  }
  console.warn("Unrecognized inbound recipient", msg.email, msg.to);
  return { ok: false, reason: "unrecognized_recipient" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS" || req.method === "HEAD") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let events: MandrillEvent[] = [];

    if (contentType.includes("application/json")) {
      const body = await req.json();
      const raw = body?.mandrill_events ?? body;
      events = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    } else {
      const form = await req.formData();
      const raw = form.get("mandrill_events");
      if (typeof raw === "string" && raw.trim()) {
        events = JSON.parse(raw);
      }
    }

    if (!Array.isArray(events) || events.length === 0) {
      return jsonResponse({ ok: true, empty: true });
    }

    const results = [];
    for (const event of events) {
      if (event?.event && event.event !== "inbound") {
        results.push({ ok: true, ignored: true, event: event.event });
        continue;
      }
      if (!event?.msg) {
        results.push({ ok: false, reason: "missing_msg" });
        continue;
      }
      results.push(await processInboundMessage(event.msg, event.ts));
    }

    return jsonResponse({ ok: true, results });
  } catch (error) {
    console.error("inbound-email-reply fatal", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
