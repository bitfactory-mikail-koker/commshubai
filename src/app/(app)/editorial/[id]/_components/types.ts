import type {
  AgentKind,
  ApprovalDecision,
  Classification,
  ContentStatus,
  ContentType,
  ExternalPermission,
} from "@/lib/types";

export type Person = { full_name: string; avatar_color: string };
export type AgentRef = { kind: AgentKind; name: string };

export type EditorArticle = {
  id: string;
  title: string;
  subtitle: string | null;
  bodyHtml: string;
  status: ContentStatus;
  version: number;
  channel: string | null;
  contentType: ContentType;
  classification: Classification;
  publishAt: string | null;
  publishedAt: string | null;
};

export type VersionItem = {
  id: string;
  version: number;
  title: string;
  subtitle: string | null;
  body_html: string;
  change_summary: string | null;
  created_at: string;
  profile: Person | null;
  agent: AgentRef | null;
};

export type CommentItem = {
  id: string;
  body: string;
  quote: string | null;
  resolved: boolean;
  created_at: string;
  parent_id: string | null;
  author_profile_id: string | null;
  profile: Person | null;
  agent: AgentRef | null;
};

export type ApprovalItem = {
  id: string;
  version: number;
  decision: ApprovalDecision;
  decision_note: string | null;
  requested_at: string;
  decided_at: string | null;
  requester: Person | null;
  requesterAgent: AgentRef | null;
  decider: Person | null;
};

export type ReviewItem = {
  id: string;
  version: number;
  recommendation: string;
  notes: string | null;
  created_at: string;
  reviewer: Person | null;
};

export type ProfileOption = { id: string; full_name: string; job_title: string | null };

export type WorkflowArticle = {
  id: string;
  title: string;
  status: ContentStatus;
  version: number;
  classification: Classification;
  externalPermission: ExternalPermission;
  reviewerId: string | null;
  publishAt: string | null;
  publishedAt: string | null;
  publicationMode: string | null;
  hasBody: boolean;
};
