
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agent_messages": {
                  Row: {
                    "article_id": string | null,"body": string,"created_at": string,"from_agent_id": string,"id": string,"opportunity_id": string | null,"organization_id": string,"payload": NonNullable<Json>,"responded_at": string | null,"response": string | null,"signal_id": string | null,"status": string,"subject": string,"to_agent_id": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id"?: string | null,"body": string,"created_at"?: string,"from_agent_id": string,"id"?: string,"opportunity_id"?: string | null,"organization_id": string,"payload"?: NonNullable<Json>,"responded_at"?: string | null,"response"?: string | null,"signal_id"?: string | null,"status"?: string,"subject": string,"to_agent_id": string,"type": string
                  }
                  Update: {
                    "article_id"?: string | null,"body"?: string,"created_at"?: string,"from_agent_id"?: string,"id"?: string,"opportunity_id"?: string | null,"organization_id"?: string,"payload"?: NonNullable<Json>,"responded_at"?: string | null,"response"?: string | null,"signal_id"?: string | null,"status"?: string,"subject"?: string,"to_agent_id"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_messages_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_from_agent_id_fkey"
      columns: ["from_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "content_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_signal_id_fkey"
      columns: ["signal_id"]
isOneToOne: false
      referencedRelation: "content_signals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_messages_to_agent_id_fkey"
      columns: ["to_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_runs": {
                  Row: {
                    "agent_id": string | null,"ai_provider": string | null,"error": string | null,"finished_at": string | null,"id": string,"input": NonNullable<Json>,"organization_id": string,"output": NonNullable<Json>,"pipeline": string,"started_at": string,"status": string,"steps": NonNullable<Json>,"trigger": string,"triggered_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"ai_provider"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"organization_id": string,"output"?: NonNullable<Json>,"pipeline": string,"started_at"?: string,"status"?: string,"steps"?: NonNullable<Json>,"trigger"?: string,"triggered_by"?: string | null
                  }
                  Update: {
                    "agent_id"?: string | null,"ai_provider"?: string | null,"error"?: string | null,"finished_at"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"organization_id"?: string,"output"?: NonNullable<Json>,"pipeline"?: string,"started_at"?: string,"status"?: string,"steps"?: NonNullable<Json>,"trigger"?: string,"triggered_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_runs_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_runs_triggered_by_fkey"
      columns: ["triggered_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_tasks": {
                  Row: {
                    "agent_id": string | null,"attempts": number,"completed_at": string | null,"created_at": string,"created_by": string | null,"dedupe_key": string | null,"description": string | null,"error": string | null,"id": string,"max_attempts": number,"organization_id": string,"payload": NonNullable<Json>,"priority": number,"related_entity_id": string | null,"related_entity_type": string | null,"result": Json | null,"run_id": string | null,"scheduled_for": string,"started_at": string | null,"status": string,"title": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"description"?: string | null,"error"?: string | null,"id"?: string,"max_attempts"?: number,"organization_id": string,"payload"?: NonNullable<Json>,"priority"?: number,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"result"?: Json | null,"run_id"?: string | null,"scheduled_for"?: string,"started_at"?: string | null,"status"?: string,"title": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string | null,"attempts"?: number,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"description"?: string | null,"error"?: string | null,"id"?: string,"max_attempts"?: number,"organization_id"?: string,"payload"?: NonNullable<Json>,"priority"?: number,"related_entity_id"?: string | null,"related_entity_type"?: string | null,"result"?: Json | null,"run_id"?: string | null,"scheduled_for"?: string,"started_at"?: string | null,"status"?: string,"title"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_tasks_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_tasks_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_tasks_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"agents": {
                  Row: {
                    "allowed_sources": (string)[],"allowed_tools": (string)[],"approval_requirements": NonNullable<Json>,"config": NonNullable<Json>,"created_at": string,"description": string,"id": string,"kind": Database["public"]['Enums']["agent_kind"],"last_run_at": string | null,"mission": string,"name": string,"organization_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_sources"?: (string)[],"allowed_tools"?: (string)[],"approval_requirements"?: NonNullable<Json>,"config"?: NonNullable<Json>,"created_at"?: string,"description"?: string,"id"?: string,"kind": Database["public"]['Enums']["agent_kind"],"last_run_at"?: string | null,"mission"?: string,"name": string,"organization_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "allowed_sources"?: (string)[],"allowed_tools"?: (string)[],"approval_requirements"?: NonNullable<Json>,"config"?: NonNullable<Json>,"created_at"?: string,"description"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["agent_kind"],"last_run_at"?: string | null,"mission"?: string,"name"?: string,"organization_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agents_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_usage": {
                  Row: {
                    "cost_eur": number,"created_at": string,"id": string,"input_tokens": number,"model": string,"organization_id": string,"output_tokens": number,"task": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_eur"?: number,"created_at"?: string,"id"?: string,"input_tokens"?: number,"model": string,"organization_id": string,"output_tokens"?: number,"task": string
                  }
                  Update: {
                    "cost_eur"?: number,"created_at"?: string,"id"?: string,"input_tokens"?: number,"model"?: string,"organization_id"?: string,"output_tokens"?: number,"task"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_rules": {
                  Row: {
                    "content_key": string,"deadline_days": number,"id": string,"organization_id": string,"quotes_by_interviewee": boolean,"steps": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_key": string,"deadline_days"?: number,"id"?: string,"organization_id": string,"quotes_by_interviewee"?: boolean,"steps"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "content_key"?: string,"deadline_days"?: number,"id"?: string,"organization_id"?: string,"quotes_by_interviewee"?: boolean,"steps"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_rules_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_rules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"approvals": {
                  Row: {
                    "base_version": number | null,"decided_at": string | null,"decided_by": string | null,"decision": string,"decision_note": string | null,"due_at": string | null,"eligible_profile_ids": (string)[],"entity_id": string,"entity_type": string,"escalated_at": string | null,"id": string,"item_id": string | null,"kind": string,"organization_id": string,"quote_text": string | null,"reminded_at": string | null,"requested_at": string,"requested_by_agent_id": string | null,"requested_by_profile_id": string | null,"scope": Database["public"]['Enums']["classification"],"step": number,"step_label": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base_version"?: number | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: string,"decision_note"?: string | null,"due_at"?: string | null,"eligible_profile_ids"?: (string)[],"entity_id": string,"entity_type": string,"escalated_at"?: string | null,"id"?: string,"item_id"?: string | null,"kind"?: string,"organization_id": string,"quote_text"?: string | null,"reminded_at"?: string | null,"requested_at"?: string,"requested_by_agent_id"?: string | null,"requested_by_profile_id"?: string | null,"scope"?: Database["public"]['Enums']["classification"],"step"?: number,"step_label"?: string | null,"version"?: number
                  }
                  Update: {
                    "base_version"?: number | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: string,"decision_note"?: string | null,"due_at"?: string | null,"eligible_profile_ids"?: (string)[],"entity_id"?: string,"entity_type"?: string,"escalated_at"?: string | null,"id"?: string,"item_id"?: string | null,"kind"?: string,"organization_id"?: string,"quote_text"?: string | null,"reminded_at"?: string | null,"requested_at"?: string,"requested_by_agent_id"?: string | null,"requested_by_profile_id"?: string | null,"scope"?: Database["public"]['Enums']["classification"],"step"?: number,"step_label"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "approvals_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_requested_by_agent_id_fkey"
      columns: ["requested_by_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approvals_requested_by_profile_id_fkey"
      columns: ["requested_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"article_signals": {
                  Row: {
                    "article_id": string,"created_at": string,"organization_id": string,"signal_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": string,"created_at"?: string,"organization_id": string,"signal_id": string
                  }
                  Update: {
                    "article_id"?: string,"created_at"?: string,"organization_id"?: string,"signal_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "article_signals_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "article_signals_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "article_signals_signal_id_fkey"
      columns: ["signal_id"]
isOneToOne: false
      referencedRelation: "content_signals"
      referencedColumns: ["id"]
    }
                  ]
                },"articles": {
                  Row: {
                    "agent_id": string | null,"author_profile_id": string | null,"body_html": string,"brand_check": Json | null,"channel": string | null,"classification": Database["public"]['Enums']["classification"],"content_type": Database["public"]['Enums']["content_type"],"created_at": string,"created_by": string | null,"current_version": number,"excerpt": string | null,"external_permission": string,"generation_provider": string | null,"id": string,"interview_id": string | null,"is_demo": boolean,"opportunity_id": string | null,"organization_id": string,"publication_mode": string | null,"publish_at": string | null,"published_at": string | null,"published_url": string | null,"reviewer_id": string | null,"source_refs": NonNullable<Json>,"status": Database["public"]['Enums']["content_status"],"subtitle": string | null,"tags": (string)[],"target_audience": string | null,"title": string,"updated_at": string,"written_for_profile_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"author_profile_id"?: string | null,"body_html"?: string,"brand_check"?: Json | null,"channel"?: string | null,"classification": Database["public"]['Enums']["classification"],"content_type": Database["public"]['Enums']["content_type"],"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"excerpt"?: string | null,"external_permission"?: string,"generation_provider"?: string | null,"id"?: string,"interview_id"?: string | null,"is_demo"?: boolean,"opportunity_id"?: string | null,"organization_id": string,"publication_mode"?: string | null,"publish_at"?: string | null,"published_at"?: string | null,"published_url"?: string | null,"reviewer_id"?: string | null,"source_refs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["content_status"],"subtitle"?: string | null,"tags"?: (string)[],"target_audience"?: string | null,"title": string,"updated_at"?: string,"written_for_profile_id"?: string | null
                  }
                  Update: {
                    "agent_id"?: string | null,"author_profile_id"?: string | null,"body_html"?: string,"brand_check"?: Json | null,"channel"?: string | null,"classification"?: Database["public"]['Enums']["classification"],"content_type"?: Database["public"]['Enums']["content_type"],"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"excerpt"?: string | null,"external_permission"?: string,"generation_provider"?: string | null,"id"?: string,"interview_id"?: string | null,"is_demo"?: boolean,"opportunity_id"?: string | null,"organization_id"?: string,"publication_mode"?: string | null,"publish_at"?: string | null,"published_at"?: string | null,"published_url"?: string | null,"reviewer_id"?: string | null,"source_refs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["content_status"],"subtitle"?: string | null,"tags"?: (string)[],"target_audience"?: string | null,"title"?: string,"updated_at"?: string,"written_for_profile_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "articles_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_author_profile_id_fkey"
      columns: ["author_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_interview_id_fkey"
      columns: ["interview_id"]
isOneToOne: false
      referencedRelation: "interviews"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "content_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "articles_written_for_profile_id_fkey"
      columns: ["written_for_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_agent_id": string | null,"actor_profile_id": string | null,"actor_type": string,"category": string,"created_at": string,"entity_id": string | null,"entity_type": string | null,"id": string,"metadata": NonNullable<Json>,"organization_id": string,"requires_approval": boolean,"summary": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_agent_id"?: string | null,"actor_profile_id"?: string | null,"actor_type": string,"category"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id": string,"requires_approval"?: boolean,"summary": string
                  }
                  Update: {
                    "action"?: string,"actor_agent_id"?: string | null,"actor_profile_id"?: string | null,"actor_type"?: string,"category"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id"?: string,"requires_approval"?: boolean,"summary"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_agent_id_fkey"
      columns: ["actor_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_actor_profile_id_fkey"
      columns: ["actor_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"bot_messages": {
                  Row: {
                    "blocked_reason": string | null,"body": string,"counts_as_request": boolean,"created_at": string,"entity_id": string | null,"entity_type": string | null,"error": string | null,"id": string,"kind": string,"medium": string,"organization_id": string,"recipient_label": string | null,"recipient_profile_id": string | null,"send_after": string | null,"slack_channel_id": string | null,"status": string,"thread_ts": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_reason"?: string | null,"body": string,"counts_as_request"?: boolean,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"error"?: string | null,"id"?: string,"kind": string,"medium": string,"organization_id": string,"recipient_label"?: string | null,"recipient_profile_id"?: string | null,"send_after"?: string | null,"slack_channel_id"?: string | null,"status": string,"thread_ts"?: string | null
                  }
                  Update: {
                    "blocked_reason"?: string | null,"body"?: string,"counts_as_request"?: boolean,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string | null,"error"?: string | null,"id"?: string,"kind"?: string,"medium"?: string,"organization_id"?: string,"recipient_label"?: string | null,"recipient_profile_id"?: string | null,"send_after"?: string | null,"slack_channel_id"?: string | null,"status"?: string,"thread_ts"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bot_messages_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bot_messages_recipient_profile_id_fkey"
      columns: ["recipient_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_assets": {
                  Row: {
                    "category": string,"created_at": string,"extracted_text": string | null,"id": string,"mime_type": string | null,"name": string,"organization_id": string,"size_bytes": number | null,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"extracted_text"?: string | null,"id"?: string,"mime_type"?: string | null,"name": string,"organization_id": string,"size_bytes"?: number | null,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"extracted_text"?: string | null,"id"?: string,"mime_type"?: string | null,"name"?: string,"organization_id"?: string,"size_bytes"?: number | null,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_assets_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_assets_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_guidelines": {
                  Row: {
                    "boilerplate": string,"brand_personality": string,"communication_policies": string,"created_at": string,"id": string,"organization_id": string,"preferred_terminology": NonNullable<Json>,"sentence_structure": string,"tone_external": string,"tone_internal": string,"tone_social": string,"updated_at": string,"updated_by": string | null,"words_to_avoid": (string)[],"writing_style": string
                  }
                  ComputedFields: never
                  Insert: {
                    "boilerplate"?: string,"brand_personality"?: string,"communication_policies"?: string,"created_at"?: string,"id"?: string,"organization_id": string,"preferred_terminology"?: NonNullable<Json>,"sentence_structure"?: string,"tone_external"?: string,"tone_internal"?: string,"tone_social"?: string,"updated_at"?: string,"updated_by"?: string | null,"words_to_avoid"?: (string)[],"writing_style"?: string
                  }
                  Update: {
                    "boilerplate"?: string,"brand_personality"?: string,"communication_policies"?: string,"created_at"?: string,"id"?: string,"organization_id"?: string,"preferred_terminology"?: NonNullable<Json>,"sentence_structure"?: string,"tone_external"?: string,"tone_internal"?: string,"tone_social"?: string,"updated_at"?: string,"updated_by"?: string | null,"words_to_avoid"?: (string)[],"writing_style"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_guidelines_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_guidelines_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"channels": {
                  Row: {
                    "bureau": string,"confidentiality": string,"created_at": string,"expectation": string,"explain_every_days": number,"follow_mode": string,"followed": boolean,"has_external_members": boolean,"id": string,"is_demo": boolean,"is_private": boolean,"joined_at": string | null,"last_explained_at": string | null,"lookback_days": number,"name": string,"organization_id": string,"project_id": string | null,"slack_channel_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bureau"?: string,"confidentiality"?: string,"created_at"?: string,"expectation"?: string,"explain_every_days"?: number,"follow_mode"?: string,"followed"?: boolean,"has_external_members"?: boolean,"id"?: string,"is_demo"?: boolean,"is_private"?: boolean,"joined_at"?: string | null,"last_explained_at"?: string | null,"lookback_days"?: number,"name": string,"organization_id": string,"project_id"?: string | null,"slack_channel_id": string,"updated_at"?: string
                  }
                  Update: {
                    "bureau"?: string,"confidentiality"?: string,"created_at"?: string,"expectation"?: string,"explain_every_days"?: number,"follow_mode"?: string,"followed"?: boolean,"has_external_members"?: boolean,"id"?: string,"is_demo"?: boolean,"is_private"?: boolean,"joined_at"?: string | null,"last_explained_at"?: string | null,"lookback_days"?: number,"name"?: string,"organization_id"?: string,"project_id"?: string | null,"slack_channel_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "channels_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "channels_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_agent_id": string | null,"author_profile_id": string | null,"body": string,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"organization_id": string,"parent_id": string | null,"quote": string | null,"resolved": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "author_agent_id"?: string | null,"author_profile_id"?: string | null,"body": string,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"organization_id": string,"parent_id"?: string | null,"quote"?: string | null,"resolved"?: boolean
                  }
                  Update: {
                    "author_agent_id"?: string | null,"author_profile_id"?: string | null,"body"?: string,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"organization_id"?: string,"parent_id"?: string | null,"quote"?: string | null,"resolved"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_agent_id_fkey"
      columns: ["author_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_author_profile_id_fkey"
      columns: ["author_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    }
                  ]
                },"content_calendar": {
                  Row: {
                    "classification": Database["public"]['Enums']["classification"] | null,"created_at": string,"created_by": string | null,"entity_id": string | null,"entity_type": string | null,"entry_type": string,"id": string,"notes": string | null,"organization_id": string,"starts_at": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classification"?: Database["public"]['Enums']["classification"] | null,"created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"entry_type": string,"id"?: string,"notes"?: string | null,"organization_id": string,"starts_at": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "classification"?: Database["public"]['Enums']["classification"] | null,"created_at"?: string,"created_by"?: string | null,"entity_id"?: string | null,"entity_type"?: string | null,"entry_type"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"starts_at"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_calendar_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_calendar_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"content_opportunities": {
                  Row: {
                    "angle": string,"article_id": string | null,"assigned_agent_id": string | null,"briefing": string | null,"classification": Database["public"]['Enums']["classification"],"created_at": string,"decline_reason": string | null,"external_permission": string,"final_check_at": string | null,"final_check_by": string | null,"id": string,"internal_only": boolean,"is_demo": boolean,"organization_id": string,"origin": string,"priority": number,"project_id": string | null,"proposed_interviewee_ids": (string)[],"referred_by_agent_id": string | null,"release_reason": string | null,"released_external_at": string | null,"released_external_by": string | null,"signal_id": string | null,"snoozed_until": string | null,"stakeholders": NonNullable<Json>,"status": string,"suggested_content_type": Database["public"]['Enums']["content_type"],"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "angle"?: string,"article_id"?: string | null,"assigned_agent_id"?: string | null,"briefing"?: string | null,"classification": Database["public"]['Enums']["classification"],"created_at"?: string,"decline_reason"?: string | null,"external_permission"?: string,"final_check_at"?: string | null,"final_check_by"?: string | null,"id"?: string,"internal_only"?: boolean,"is_demo"?: boolean,"organization_id": string,"origin"?: string,"priority"?: number,"project_id"?: string | null,"proposed_interviewee_ids"?: (string)[],"referred_by_agent_id"?: string | null,"release_reason"?: string | null,"released_external_at"?: string | null,"released_external_by"?: string | null,"signal_id"?: string | null,"snoozed_until"?: string | null,"stakeholders"?: NonNullable<Json>,"status"?: string,"suggested_content_type": Database["public"]['Enums']["content_type"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "angle"?: string,"article_id"?: string | null,"assigned_agent_id"?: string | null,"briefing"?: string | null,"classification"?: Database["public"]['Enums']["classification"],"created_at"?: string,"decline_reason"?: string | null,"external_permission"?: string,"final_check_at"?: string | null,"final_check_by"?: string | null,"id"?: string,"internal_only"?: boolean,"is_demo"?: boolean,"organization_id"?: string,"origin"?: string,"priority"?: number,"project_id"?: string | null,"proposed_interviewee_ids"?: (string)[],"referred_by_agent_id"?: string | null,"release_reason"?: string | null,"released_external_at"?: string | null,"released_external_by"?: string | null,"signal_id"?: string | null,"snoozed_until"?: string | null,"stakeholders"?: NonNullable<Json>,"status"?: string,"suggested_content_type"?: Database["public"]['Enums']["content_type"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_opportunities_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_assigned_agent_id_fkey"
      columns: ["assigned_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_final_check_by_fkey"
      columns: ["final_check_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_referred_by_agent_id_fkey"
      columns: ["referred_by_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_released_external_by_fkey"
      columns: ["released_external_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_opportunities_signal_id_fkey"
      columns: ["signal_id"]
isOneToOne: false
      referencedRelation: "content_signals"
      referencedColumns: ["id"]
    }
                  ]
                },"content_signals": {
                  Row: {
                    "audience": string,"category": string,"confidentiality": string,"created_at": string,"detected_at": string,"detection_provider": string,"duplicate_of_id": string | null,"emoji": string | null,"entities": NonNullable<Json>,"id": string,"is_demo": boolean,"missing_information": NonNullable<Json>,"organization_id": string,"origin": string,"primary_source_id": string | null,"project_id": string | null,"related_signal_ids": (string)[],"relevance_score": number,"score_rationale": string,"status": string,"submitted_by": string | null,"suggested_action": string,"suggested_agent": Database["public"]['Enums']["agent_kind"],"summary": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": string,"category": string,"confidentiality"?: string,"created_at"?: string,"detected_at"?: string,"detection_provider"?: string,"duplicate_of_id"?: string | null,"emoji"?: string | null,"entities"?: NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"missing_information"?: NonNullable<Json>,"organization_id": string,"origin"?: string,"primary_source_id"?: string | null,"project_id"?: string | null,"related_signal_ids"?: (string)[],"relevance_score": number,"score_rationale"?: string,"status"?: string,"submitted_by"?: string | null,"suggested_action"?: string,"suggested_agent": Database["public"]['Enums']["agent_kind"],"summary": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "audience"?: string,"category"?: string,"confidentiality"?: string,"created_at"?: string,"detected_at"?: string,"detection_provider"?: string,"duplicate_of_id"?: string | null,"emoji"?: string | null,"entities"?: NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"missing_information"?: NonNullable<Json>,"organization_id"?: string,"origin"?: string,"primary_source_id"?: string | null,"project_id"?: string | null,"related_signal_ids"?: (string)[],"relevance_score"?: number,"score_rationale"?: string,"status"?: string,"submitted_by"?: string | null,"suggested_action"?: string,"suggested_agent"?: Database["public"]['Enums']["agent_kind"],"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_signals_duplicate_of_id_fkey"
      columns: ["duplicate_of_id"]
isOneToOne: false
      referencedRelation: "content_signals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_signals_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_signals_primary_source_id_fkey"
      columns: ["primary_source_id"]
isOneToOne: false
      referencedRelation: "source_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_signals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_signals_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"content_versions": {
                  Row: {
                    "article_id": string,"body_html": string,"change_summary": string | null,"created_at": string,"created_by_agent_id": string | null,"created_by_profile_id": string | null,"id": string,"organization_id": string,"subtitle": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": string,"body_html"?: string,"change_summary"?: string | null,"created_at"?: string,"created_by_agent_id"?: string | null,"created_by_profile_id"?: string | null,"id"?: string,"organization_id": string,"subtitle"?: string | null,"title": string,"version": number
                  }
                  Update: {
                    "article_id"?: string,"body_html"?: string,"change_summary"?: string | null,"created_at"?: string,"created_by_agent_id"?: string | null,"created_by_profile_id"?: string | null,"id"?: string,"organization_id"?: string,"subtitle"?: string | null,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_versions_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_versions_created_by_agent_id_fkey"
      columns: ["created_by_agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_versions_created_by_profile_id_fkey"
      columns: ["created_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_versions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"emoji_rules": {
                  Row: {
                    "action": string,"created_at": string,"direct_start": boolean,"emoji": string,"enabled": boolean,"goal": string,"id": string,"organization_id": string,"shortcode": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"direct_start"?: boolean,"emoji": string,"enabled"?: boolean,"goal": string,"id"?: string,"organization_id": string,"shortcode": string,"sort_order"?: number
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"direct_start"?: boolean,"emoji"?: string,"enabled"?: boolean,"goal"?: string,"id"?: string,"organization_id"?: string,"shortcode"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "emoji_rules_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"functional_roles": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"key": string,"name": string,"organization_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"id"?: string,"key": string,"name": string,"organization_id": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"key"?: string,"name"?: string,"organization_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "functional_roles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_credentials": {
                  Row: {
                    "encrypted_payload": string,"integration_id": string,"organization_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "encrypted_payload": string,"integration_id": string,"organization_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "encrypted_payload"?: string,"integration_id"?: string,"organization_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_credentials_integration_id_fkey"
      columns: ["integration_id"]
isOneToOne: true
      referencedRelation: "integrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_credentials_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "integration_credentials_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"integrations": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"display_name": string,"has_credentials": boolean,"id": string,"last_error": string | null,"last_sync_at": string | null,"last_sync_count": number | null,"last_sync_status": string | null,"last_tested_at": string | null,"organization_id": string,"provider": string,"scopes": (string)[],"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"display_name": string,"has_credentials"?: boolean,"id"?: string,"last_error"?: string | null,"last_sync_at"?: string | null,"last_sync_count"?: number | null,"last_sync_status"?: string | null,"last_tested_at"?: string | null,"organization_id": string,"provider": string,"scopes"?: (string)[],"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"display_name"?: string,"has_credentials"?: boolean,"id"?: string,"last_error"?: string | null,"last_sync_at"?: string | null,"last_sync_count"?: number | null,"last_sync_status"?: string | null,"last_tested_at"?: string | null,"organization_id"?: string,"provider"?: string,"scopes"?: (string)[],"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integrations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"interview_messages": {
                  Row: {
                    "author_profile_id": string | null,"content": string,"created_at": string,"id": string,"interview_id": string,"organization_id": string,"question_id": string | null,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_profile_id"?: string | null,"content": string,"created_at"?: string,"id"?: string,"interview_id": string,"organization_id": string,"question_id"?: string | null,"role": string
                  }
                  Update: {
                    "author_profile_id"?: string | null,"content"?: string,"created_at"?: string,"id"?: string,"interview_id"?: string,"organization_id"?: string,"question_id"?: string | null,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interview_messages_author_profile_id_fkey"
      columns: ["author_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interview_messages_interview_id_fkey"
      columns: ["interview_id"]
isOneToOne: false
      referencedRelation: "interviews"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interview_messages_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"interviews": {
                  Row: {
                    "agent_id": string | null,"article_id": string | null,"classification": Database["public"]['Enums']["classification"],"completed_at": string | null,"created_at": string,"created_by": string | null,"follow_up_actions": NonNullable<Json>,"id": string,"interviewee_name": string,"interviewee_profile_id": string | null,"interviewee_role": string | null,"invite_choice": string | null,"is_demo": boolean,"kind": string,"metadata": NonNullable<Json>,"opportunity_id": string | null,"organization_id": string,"purpose": string,"questions": NonNullable<Json>,"redirect_to": string | null,"reminded_at": string | null,"requested_at": string | null,"scheduled_at": string | null,"status": string,"summary": Json | null,"summary_confirmed_at": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"article_id"?: string | null,"classification"?: Database["public"]['Enums']["classification"],"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"follow_up_actions"?: NonNullable<Json>,"id"?: string,"interviewee_name": string,"interviewee_profile_id"?: string | null,"interviewee_role"?: string | null,"invite_choice"?: string | null,"is_demo"?: boolean,"kind"?: string,"metadata"?: NonNullable<Json>,"opportunity_id"?: string | null,"organization_id": string,"purpose"?: string,"questions"?: NonNullable<Json>,"redirect_to"?: string | null,"reminded_at"?: string | null,"requested_at"?: string | null,"scheduled_at"?: string | null,"status"?: string,"summary"?: Json | null,"summary_confirmed_at"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string | null,"article_id"?: string | null,"classification"?: Database["public"]['Enums']["classification"],"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"follow_up_actions"?: NonNullable<Json>,"id"?: string,"interviewee_name"?: string,"interviewee_profile_id"?: string | null,"interviewee_role"?: string | null,"invite_choice"?: string | null,"is_demo"?: boolean,"kind"?: string,"metadata"?: NonNullable<Json>,"opportunity_id"?: string | null,"organization_id"?: string,"purpose"?: string,"questions"?: NonNullable<Json>,"redirect_to"?: string | null,"reminded_at"?: string | null,"requested_at"?: string | null,"scheduled_at"?: string | null,"status"?: string,"summary"?: Json | null,"summary_confirmed_at"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interviews_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_interviewee_profile_id_fkey"
      columns: ["interviewee_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_opportunity_id_fkey"
      columns: ["opportunity_id"]
isOneToOne: false
      referencedRelation: "content_opportunities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"newsletter_items": {
                  Row: {
                    "article_id": string | null,"contributor_profile_id": string | null,"created_at": string,"custom_summary": string | null,"custom_title": string | null,"id": string,"included": boolean,"interview_id": string | null,"newsletter_id": string,"organization_id": string,"position": number,"section": string
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id"?: string | null,"contributor_profile_id"?: string | null,"created_at"?: string,"custom_summary"?: string | null,"custom_title"?: string | null,"id"?: string,"included"?: boolean,"interview_id"?: string | null,"newsletter_id": string,"organization_id": string,"position"?: number,"section"?: string
                  }
                  Update: {
                    "article_id"?: string | null,"contributor_profile_id"?: string | null,"created_at"?: string,"custom_summary"?: string | null,"custom_title"?: string | null,"id"?: string,"included"?: boolean,"interview_id"?: string | null,"newsletter_id"?: string,"organization_id"?: string,"position"?: number,"section"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "newsletter_items_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "newsletter_items_contributor_profile_id_fkey"
      columns: ["contributor_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "newsletter_items_interview_id_fkey"
      columns: ["interview_id"]
isOneToOne: false
      referencedRelation: "interviews"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "newsletter_items_newsletter_id_fkey"
      columns: ["newsletter_id"]
isOneToOne: false
      referencedRelation: "newsletters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "newsletter_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"newsletters": {
                  Row: {
                    "agent_id": string | null,"created_at": string,"created_by": string | null,"current_version": number,"edition_type": string,"generation_provider": string | null,"id": string,"intro_html": string,"is_demo": boolean,"kind": Database["public"]['Enums']["agent_kind"],"organization_id": string,"outro_html": string,"period_month": string,"send_at": string | null,"send_mode": string | null,"sent_at": string | null,"status": string,"subject": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"edition_type"?: string,"generation_provider"?: string | null,"id"?: string,"intro_html"?: string,"is_demo"?: boolean,"kind": Database["public"]['Enums']["agent_kind"],"organization_id": string,"outro_html"?: string,"period_month": string,"send_at"?: string | null,"send_mode"?: string | null,"sent_at"?: string | null,"status"?: string,"subject"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "agent_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"edition_type"?: string,"generation_provider"?: string | null,"id"?: string,"intro_html"?: string,"is_demo"?: boolean,"kind"?: Database["public"]['Enums']["agent_kind"],"organization_id"?: string,"outro_html"?: string,"period_month"?: string,"send_at"?: string | null,"send_mode"?: string | null,"sent_at"?: string | null,"status"?: string,"subject"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "newsletters_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "newsletters_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "newsletters_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"locale": string,"name": string,"settings": NonNullable<Json>,"slug": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"locale"?: string,"name": string,"settings"?: NonNullable<Json>,"slug": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"locale"?: string,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"outreach_group_members": {
                  Row: {
                    "group_id": string,"organization_id": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"organization_id": string,"profile_id": string
                  }
                  Update: {
                    "group_id"?: string,"organization_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outreach_group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "outreach_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_group_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_group_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"outreach_groups": {
                  Row: {
                    "after_no_reply": string,"bureau": Database["public"]['Enums']["agent_kind"],"created_at": string,"enabled": boolean,"frequency": string,"functional_role_id": string | null,"goal": string,"id": string,"last_run_at": string | null,"member_kind": string,"name": string,"organization_id": string,"reminder_after_days": number,"reminder_count": number,"team_id": string | null,"updated_at": string,"weekday": number,"window_end": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "after_no_reply"?: string,"bureau"?: Database["public"]['Enums']["agent_kind"],"created_at"?: string,"enabled"?: boolean,"frequency"?: string,"functional_role_id"?: string | null,"goal"?: string,"id"?: string,"last_run_at"?: string | null,"member_kind"?: string,"name": string,"organization_id": string,"reminder_after_days"?: number,"reminder_count"?: number,"team_id"?: string | null,"updated_at"?: string,"weekday"?: number,"window_end"?: string,"window_start"?: string
                  }
                  Update: {
                    "after_no_reply"?: string,"bureau"?: Database["public"]['Enums']["agent_kind"],"created_at"?: string,"enabled"?: boolean,"frequency"?: string,"functional_role_id"?: string | null,"goal"?: string,"id"?: string,"last_run_at"?: string | null,"member_kind"?: string,"name"?: string,"organization_id"?: string,"reminder_after_days"?: number,"reminder_count"?: number,"team_id"?: string | null,"updated_at"?: string,"weekday"?: number,"window_end"?: string,"window_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outreach_groups_functional_role_id_fkey"
      columns: ["functional_role_id"]
isOneToOne: false
      referencedRelation: "functional_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_groups_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outreach_groups_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "category": string,"description": string,"key": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"description"?: string,"key": string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "category"?: string,"description"?: string,"key"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profile_functional_roles": {
                  Row: {
                    "created_at": string,"functional_role_id": string,"organization_id": string,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"functional_role_id": string,"organization_id": string,"profile_id": string
                  }
                  Update: {
                    "created_at"?: string,"functional_role_id"?: string,"organization_id"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_functional_roles_functional_role_id_fkey"
      columns: ["functional_role_id"]
isOneToOne: false
      referencedRelation: "functional_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_functional_roles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_functional_roles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "absent_until": string | null,"avatar_color": string,"bot_follows": boolean,"bot_may_contact": boolean,"contact_opt_out": boolean,"contact_paused_until": string | null,"created_at": string,"department": string | null,"email": string,"full_name": string,"id": string,"in_pilot": boolean,"is_active": boolean,"job_title": string | null,"last_requested_at": string | null,"organization_id": string,"role_id": string,"slack_user_id": string | null,"team_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "absent_until"?: string | null,"avatar_color"?: string,"bot_follows"?: boolean,"bot_may_contact"?: boolean,"contact_opt_out"?: boolean,"contact_paused_until"?: string | null,"created_at"?: string,"department"?: string | null,"email": string,"full_name": string,"id": string,"in_pilot"?: boolean,"is_active"?: boolean,"job_title"?: string | null,"last_requested_at"?: string | null,"organization_id": string,"role_id": string,"slack_user_id"?: string | null,"team_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "absent_until"?: string | null,"avatar_color"?: string,"bot_follows"?: boolean,"bot_may_contact"?: boolean,"contact_opt_out"?: boolean,"contact_paused_until"?: string | null,"created_at"?: string,"department"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"in_pilot"?: boolean,"is_active"?: boolean,"job_title"?: string | null,"last_requested_at"?: string | null,"organization_id"?: string,"role_id"?: string,"slack_user_id"?: string | null,"team_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"project_members": {
                  Row: {
                    "confirmed": boolean,"created_at": string,"organization_id": string,"profile_id": string,"project_id": string,"project_role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed"?: boolean,"created_at"?: string,"organization_id": string,"profile_id": string,"project_id": string,"project_role"?: string
                  }
                  Update: {
                    "confirmed"?: boolean,"created_at"?: string,"organization_id"?: string,"profile_id"?: string,"project_id"?: string,"project_role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_members_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_members_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "anonymous_label": string | null,"client_name": string | null,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"external_naming": string,"id": string,"is_demo": boolean,"name": string,"notes": string | null,"organization_id": string,"proposed_by_bot": boolean,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymous_label"?: string | null,"client_name"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"external_naming"?: string,"id"?: string,"is_demo"?: boolean,"name": string,"notes"?: string | null,"organization_id": string,"proposed_by_bot"?: boolean,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "anonymous_label"?: string | null,"client_name"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"external_naming"?: string,"id"?: string,"is_demo"?: boolean,"name"?: string,"notes"?: string | null,"organization_id"?: string,"proposed_by_bot"?: boolean,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "article_id": string,"created_at": string,"id": string,"notes": string | null,"organization_id": string,"recommendation": string,"reviewer_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "article_id": string,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id": string,"recommendation": string,"reviewer_id": string,"version": number
                  }
                  Update: {
                    "article_id"?: string,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"recommendation"?: string,"reviewer_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rhythms": {
                  Row: {
                    "created_at": string,"days_of_month": (number)[],"deadline_days": number,"enabled": boolean,"group_id": string | null,"id": string,"key": string,"last_run_at": string | null,"name": string,"organization_id": string,"time_of_day": string,"updated_at": string,"weekday": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"days_of_month"?: (number)[],"deadline_days"?: number,"enabled"?: boolean,"group_id"?: string | null,"id"?: string,"key": string,"last_run_at"?: string | null,"name": string,"organization_id": string,"time_of_day"?: string,"updated_at"?: string,"weekday"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"days_of_month"?: (number)[],"deadline_days"?: number,"enabled"?: boolean,"group_id"?: string | null,"id"?: string,"key"?: string,"last_run_at"?: string | null,"name"?: string,"organization_id"?: string,"time_of_day"?: string,"updated_at"?: string,"weekday"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rhythms_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "outreach_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rhythms_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "created_at": string,"permission_key": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"permission_key": string,"role_id": string
                  }
                  Update: {
                    "created_at"?: string,"permission_key"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string,"id": string,"is_system": boolean,"key": string,"name": string,"organization_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"id"?: string,"is_system"?: boolean,"key": string,"name": string,"organization_id": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"id"?: string,"is_system"?: boolean,"key"?: string,"name"?: string,"organization_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"signal_sources": {
                  Row: {
                    "created_at": string,"organization_id": string,"relation": string,"signal_id": string,"source_message_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"relation"?: string,"signal_id": string,"source_message_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"relation"?: string,"signal_id"?: string,"source_message_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "signal_sources_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signal_sources_signal_id_fkey"
      columns: ["signal_id"]
isOneToOne: false
      referencedRelation: "content_signals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "signal_sources_source_message_id_fkey"
      columns: ["source_message_id"]
isOneToOne: false
      referencedRelation: "source_messages"
      referencedColumns: ["id"]
    }
                  ]
                },"social_posts": {
                  Row: {
                    "agent_id": string | null,"article_id": string | null,"body": string,"created_at": string,"created_by": string | null,"current_version": number,"generation_provider": string | null,"id": string,"is_demo": boolean,"organization_id": string,"platform": string,"publication_mode": string | null,"publish_at": string | null,"published_at": string | null,"published_url": string | null,"status": string,"updated_at": string,"variant": string | null,"written_for_profile_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agent_id"?: string | null,"article_id"?: string | null,"body": string,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"generation_provider"?: string | null,"id"?: string,"is_demo"?: boolean,"organization_id": string,"platform"?: string,"publication_mode"?: string | null,"publish_at"?: string | null,"published_at"?: string | null,"published_url"?: string | null,"status"?: string,"updated_at"?: string,"variant"?: string | null,"written_for_profile_id"?: string | null
                  }
                  Update: {
                    "agent_id"?: string | null,"article_id"?: string | null,"body"?: string,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"generation_provider"?: string | null,"id"?: string,"is_demo"?: boolean,"organization_id"?: string,"platform"?: string,"publication_mode"?: string | null,"publish_at"?: string | null,"published_at"?: string | null,"published_url"?: string | null,"status"?: string,"updated_at"?: string,"variant"?: string | null,"written_for_profile_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "social_posts_agent_id_fkey"
      columns: ["agent_id"]
isOneToOne: false
      referencedRelation: "agents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_posts_article_id_fkey"
      columns: ["article_id"]
isOneToOne: false
      referencedRelation: "articles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_posts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_posts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "social_posts_written_for_profile_id_fkey"
      columns: ["written_for_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"source_messages": {
                  Row: {
                    "author_name": string | null,"author_profile_id": string | null,"body": string,"channel": string | null,"channel_id": string | null,"created_at": string,"excluded": boolean,"external_id": string | null,"id": string,"ingested_at": string,"integration_id": string | null,"is_demo": boolean,"metadata": NonNullable<Json>,"occurred_at": string,"organization_id": string,"processed_at": string | null,"slack_ts": string | null,"source": string,"title": string | null,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name"?: string | null,"author_profile_id"?: string | null,"body": string,"channel"?: string | null,"channel_id"?: string | null,"created_at"?: string,"excluded"?: boolean,"external_id"?: string | null,"id"?: string,"ingested_at"?: string,"integration_id"?: string | null,"is_demo"?: boolean,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id": string,"processed_at"?: string | null,"slack_ts"?: string | null,"source": string,"title"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "author_name"?: string | null,"author_profile_id"?: string | null,"body"?: string,"channel"?: string | null,"channel_id"?: string | null,"created_at"?: string,"excluded"?: boolean,"external_id"?: string | null,"id"?: string,"ingested_at"?: string,"integration_id"?: string | null,"is_demo"?: boolean,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"organization_id"?: string,"processed_at"?: string | null,"slack_ts"?: string | null,"source"?: string,"title"?: string | null,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "source_messages_author_profile_id_fkey"
      columns: ["author_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_messages_channel_id_fkey"
      columns: ["channel_id"]
isOneToOne: false
      referencedRelation: "channels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_messages_integration_id_fkey"
      columns: ["integration_id"]
isOneToOne: false
      referencedRelation: "integrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "source_messages_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "bootstrap_organization":
{ Args: { "p_org_id": string }; Returns: undefined
                           },
"bootstrap_redactie":
{ Args: { "p_org_id": string }; Returns: undefined
                           },
"current_org_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"has_human_approval":
{ Args: { "p_entity_id": string,"p_entity_type": string,"p_version": number }; Returns: boolean
                           },
"has_permission":
{ Args: { "p_key": string }; Returns: boolean
                           },
"is_approver_of":
{ Args: { "p_entity_id": string,"p_entity_type": string }; Returns: boolean
                           },
"is_editorial":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_involved_in_article":
{ Args: { "p_article_id": string }; Returns: boolean
                           },
"is_project_member":
{ Args: { "p_project_id": string }; Returns: boolean
                           },
"search_all":
{ Args: { "p_kind"?: string,"p_like": string,"p_limit"?: number,"p_offset"?: number,"p_tsquery": string }; Returns: Json
                           }
          }
          Enums: {
            "agent_kind": "external"|"internal","classification": "internal"|"external","content_status": "new_signal"|"research"|"interview_requested"|"interview_completed"|"draft"|"in_review"|"changes_requested"|"approved"|"scheduled"|"published"|"archived","content_type": "news_article"|"website_article"|"customer_case"|"interview"|"internal_update"|"employee_introduction"|"social_post"|"newsletter"|"management_update"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "agent_kind": ["external", "internal"],"classification": ["internal", "external"],"content_status": ["new_signal", "research", "interview_requested", "interview_completed", "draft", "in_review", "changes_requested", "approved", "scheduled", "published", "archived"],"content_type": ["news_article", "website_article", "customer_case", "interview", "internal_update", "employee_introduction", "social_post", "newsletter", "management_update"]
          }
        }
} as const
