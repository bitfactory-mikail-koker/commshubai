import type { Database } from "@/lib/database.types";

type PublicSchema = Database["public"];
export type Row<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Insert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type Update<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type ContentStatus = PublicSchema["Enums"]["content_status"];
export type ContentType = PublicSchema["Enums"]["content_type"];
export type Classification = PublicSchema["Enums"]["classification"];
export type AgentKind = PublicSchema["Enums"]["agent_kind"];

export type Organization = Row<"organizations">;
export type Profile = Row<"profiles">;
export type Role = Row<"roles">;
export type Integration = Row<"integrations">;
export type SourceMessage = Row<"source_messages">;
export type Signal = Row<"content_signals">;
export type Opportunity = Row<"content_opportunities">;
export type Agent = Row<"agents">;
export type AgentRun = Row<"agent_runs">;
export type AgentTask = Row<"agent_tasks">;
export type AgentMessage = Row<"agent_messages">;
export type Interview = Row<"interviews">;
export type InterviewMessage = Row<"interview_messages">;
export type Article = Row<"articles">;
export type ContentVersion = Row<"content_versions">;
export type Review = Row<"reviews">;
export type Approval = Row<"approvals">;
export type Comment = Row<"comments">;
export type Newsletter = Row<"newsletters">;
export type NewsletterItem = Row<"newsletter_items">;
export type SocialPost = Row<"social_posts">;
export type CalendarEntry = Row<"content_calendar">;
export type BrandGuidelines = Row<"brand_guidelines">;
export type BrandAsset = Row<"brand_assets">;
export type AuditLog = Row<"audit_logs">;
export type FunctionalRole = Row<"functional_roles">;
export type Team = Row<"teams">;
export type Project = Row<"projects">;
export type ProjectMember = Row<"project_members">;
export type Channel = Row<"channels">;
export type EmojiRule = Row<"emoji_rules">;
export type OutreachGroup = Row<"outreach_groups">;
export type Rhythm = Row<"rhythms">;
export type ApprovalRule = Row<"approval_rules">;
export type BotMessage = Row<"bot_messages">;

// --- Narrowed unions for text columns guarded by CHECK constraints ----------
export type SignalCategory =
  | "customer_case"
  | "team_achievement"
  | "new_employee"
  | "management_update"
  | "project_milestone"
  | "organizational_update"
  | "commercial_update"
  | "other";
export type SignalAudience = "external" | "internal" | "both";
export type SignalStatus = "new" | "needs_info" | "in_progress" | "converted" | "dismissed" | "duplicate";
export type Confidentiality = "public_ok" | "internal_only" | "needs_permission" | "confidential";
export type ExternalPermission = "not_required" | "unknown" | "requested" | "granted" | "denied";
export type SourceKind = "slack" | "jira" | "teamleader" | "email" | "manual";
export type IntegrationProvider = "slack" | "jira" | "teamleader" | "email" | "cms" | "linkedin";
export type IntegrationStatus = "not_connected" | "demo" | "connected" | "error";
export type InterviewStatus =
  | "draft"
  | "requested"
  | "scheduled"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "cancelled";
export type InterviewKind = "customer_case" | "employee_intro" | "management" | "expert" | "team" | "other";
export type NewsletterStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "sent"
  | "archived";
export type SocialStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";
export type ApprovalDecision = "pending" | "approved" | "rejected" | "changes_requested" | "withdrawn";
export type ApprovalEntity = "article" | "newsletter" | "social_post";
export type AuditCategory =
  | "discovered"
  | "used"
  | "generated"
  | "requested"
  | "performed"
  | "approval"
  | "handoff"
  | "system";
export type TaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled";

// --- JSON column shapes ------------------------------------------------------
export type SignalEntities = {
  customer?: string | null;
  project?: string | null;
  people?: string[];
};

export type Stakeholder = {
  name: string;
  role: string;
  profile_id?: string | null;
  reason?: string;
};

export type InterviewQuestion = { id: string; text: string; topic?: string };

export type InterviewSummary = {
  summary: string;
  key_points: string[];
  quotes: { text: string; speaker: string }[];
  follow_ups: string[];
};

export type SourceRef = {
  source_message_id?: string | null;
  interview_id?: string | null;
  source: string;
  label: string;
  url?: string | null;
  occurred_at?: string | null;
};

export type BrandIssue = {
  severity: "info" | "warning" | "error";
  type:
    | "word_to_avoid"
    | "terminology"
    | "unverified_number"
    | "unverified_quote"
    | "open_placeholder"
    | "long_sentence"
    | "confidential";
  message: string;
  excerpt?: string;
};

export type BrandCheck = {
  checked_at: string;
  score: number;
  issues: BrandIssue[];
};

export type RunStep = {
  key: string;
  label: string;
  status: "completed" | "failed" | "skipped";
  tool?: string;
  detail?: string;
  at: string;
};

export type TermRule = { term: string; instead_of: string; note?: string };

// --- Redactie ------------------------------------------------------------------
export type ApprovalKind = "piece" | "quote" | "passage";
export type OpportunityStatus = "proposed" | "accepted" | "in_progress" | "converted" | "declined" | "snoozed";
export type SignalOrigin = "emoji" | "listen" | "tip" | "mail" | "manual" | "rhythm" | "interview";
export type FollowMode = "emoji_only" | "listen" | "active";
export type ChannelBureau = "internal" | "external" | "both";
export type ChannelConfidentiality = "internal_only" | "external_after_approval";
export type EmojiAction = "external_news" | "customer_case" | "internal_newsletter" | "social_post" | "interview" | "exclude";
export type ExternalNaming = "unknown" | "allowed" | "anonymous" | "not_allowed";
export type RhythmKey = "team_round" | "md_update" | "internal_newsletter" | "external_newsletter" | "weekly_overview";
export type BotMessageKind =
  | "channel_intro"
  | "thread_reply"
  | "interview_invite"
  | "interview_message"
  | "reminder"
  | "approval_request"
  | "weekly_overview"
  | "input_request"
  | "mail_reply"
  | "notice";
export type BotMessageStatus = "shadow" | "simulated" | "sent" | "blocked" | "failed" | "scheduled";

/** One step of an approval rule. Steps are handled in order. */
export type RuleStep = {
  who: "interviewees" | "project_roles" | "functional_roles" | "persons" | "editors";
  /** Functional role keys, for project_roles and functional_roles. */
  roles?: string[];
  profile_ids?: string[];
  /** Number of approvals needed (not used for interviewees: each approves their own part). */
  min?: number;
  label?: string;
};

export type OrgSettings = {
  require_four_eyes?: boolean;
  retention_days?: number;
  default_review_days?: number;
  bot_name?: string;
  shadow_mode?: boolean;
  bot_paused?: boolean;
  pilot_only?: boolean;
  min_days_between_requests?: number;
  work_start?: string;
  work_end?: string;
  lookback_max_days?: number;
  ai_budget_eur?: number;
  usd_to_eur?: number;
  mail_domain?: string;
  mailbox_address?: string;
  contact_person?: string;
  signal_retention_months?: number;
  demo_scenario?: {
    source_message_id?: string;
    started_at?: string;
  } | null;
};
