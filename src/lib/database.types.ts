export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_run_events: {
        Row: {
          agent_run_id: string
          created_at: string
          event_type: string
          id: string
          message: string
          metadata_json: Json
          workspace_id: string
        }
        Insert: {
          agent_run_id: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata_json?: Json
          workspace_id: string
        }
        Update: {
          agent_run_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_events_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coding_run_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          branch_name: string | null
          billing_method?: string | null
          cache_json?: Json
          commit_sha: string | null
          connection_id?: string | null
          created_at: string
          created_by_user_id: string | null
          cost_amount_usd?: number | null
          cost_status?: string | null
          duration_ms?: number | null
          effort?: string | null
          finished_at: string | null
          id: string
          issue_id: string
          mode: string
          parent_run_id?: string | null
          progress: number
          provider?: string | null
          repository_id: string | null
          requested_config_json?: Json
          requested_model?: string | null
          research_artifact_id?: string | null
          real_model?: string
          result_json: Json
          stage?: string
          started_at: string | null
          status: string
          updated_at: string
          usage_json?: Json
          effective_config_json?: Json
          quota_json?: Json
          workspace_id: string
        }
        Insert: {
          branch_name?: string | null
          billing_method?: string | null
          cache_json?: Json
          commit_sha?: string | null
          connection_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          cost_amount_usd?: number | null
          cost_status?: string | null
          duration_ms?: number | null
          effort?: string | null
          finished_at?: string | null
          id?: string
          issue_id: string
          mode: string
          parent_run_id?: string | null
          progress?: number
          provider?: string | null
          repository_id?: string | null
          requested_config_json?: Json
          requested_model?: string | null
          research_artifact_id?: string | null
          real_model?: string
          result_json?: Json
          stage?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          usage_json?: Json
          effective_config_json?: Json
          quota_json?: Json
          workspace_id: string
        }
        Update: {
          branch_name?: string | null
          billing_method?: string | null
          cache_json?: Json
          commit_sha?: string | null
          connection_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          cost_amount_usd?: number | null
          cost_status?: string | null
          duration_ms?: number | null
          effort?: string | null
          finished_at?: string | null
          id?: string
          issue_id?: string
          mode?: string
          parent_run_id?: string | null
          progress?: number
          provider?: string | null
          repository_id?: string | null
          requested_config_json?: Json
          requested_model?: string | null
          research_artifact_id?: string | null
          real_model?: string
          result_json?: Json
          stage?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          usage_json?: Json
          effective_config_json?: Json
          quota_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coding_runs_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coding_runs_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coding_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_draft_knowledge: {
        Row: {
          draft_id: string
          knowledge_article_id: string
          rank: number
        }
        Insert: {
          draft_id: string
          knowledge_article_id: string
          rank?: number
        }
        Update: {
          draft_id?: string
          knowledge_article_id?: string
          rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_draft_knowledge_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "ai_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_draft_knowledge_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_drafts: {
        Row: {
          action: string
          body: string
          conversation_id: string
          created_at: string
          id: string
          idempotency_key: string
          mode: string
          policy_json: Json
          reviewed_at: string | null
          safety_reason: string | null
          source_message_id: string
          status: string
          triage_json: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action: string
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          mode: string
          policy_json?: Json
          reviewed_at?: string | null
          safety_reason?: string | null
          source_message_id: string
          status: string
          triage_json?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action?: string
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          mode?: string
          policy_json?: Json
          reviewed_at?: string | null
          safety_reason?: string | null
          source_message_id?: string
          status?: string
          triage_json?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_drafts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_outbound_messages: {
        Row: {
          conversation_id: string
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          provider_message_id: string | null
          sent_at: string | null
          source_message_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          provider_message_id?: string | null
          sent_at?: string | null
          source_message_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          provider_message_id?: string | null
          sent_at?: string | null
          source_message_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_outbound_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outbound_messages_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outbound_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata_json: Json
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata_json?: Json
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata_json?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_case_events: {
        Row: {
          bug_case_id: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          message: string
          metadata_json: Json
          stage: string
          workspace_id: string
        }
        Insert: {
          bug_case_id: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          message: string
          metadata_json?: Json
          stage: string
          workspace_id: string
        }
        Update: {
          bug_case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          message?: string
          metadata_json?: Json
          stage?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_case_events_bug_case_id_fkey"
            columns: ["bug_case_id"]
            isOneToOne: false
            referencedRelation: "bug_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_case_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_cases: {
        Row: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          customer_response_status: string
          decision: string
          deployment_url: string | null
          duplicate_of_issue_id: string | null
          evidence_json: Json
          fingerprint: string | null
          fix_agent_run_id: string | null
          health_status: string
          id: string
          investigation_agent_run_id: string | null
          issue_id: string
          last_error: string | null
          merge_sha: string | null
          pr_number: number | null
          pr_url: string | null
          signal_message_id: string | null
          stage: string
          started_at: string
          status: string
          suspicion_score: number | null
          updated_at: string
          verdict: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_response_status?: string
          decision?: string
          deployment_url?: string | null
          duplicate_of_issue_id?: string | null
          evidence_json?: Json
          fingerprint?: string | null
          fix_agent_run_id?: string | null
          health_status?: string
          id?: string
          investigation_agent_run_id?: string | null
          issue_id: string
          last_error?: string | null
          merge_sha?: string | null
          pr_number?: number | null
          pr_url?: string | null
          signal_message_id?: string | null
          stage?: string
          started_at?: string
          status?: string
          suspicion_score?: number | null
          updated_at?: string
          verdict?: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_response_status?: string
          decision?: string
          deployment_url?: string | null
          duplicate_of_issue_id?: string | null
          evidence_json?: Json
          fingerprint?: string | null
          fix_agent_run_id?: string | null
          health_status?: string
          id?: string
          investigation_agent_run_id?: string | null
          issue_id?: string
          last_error?: string | null
          merge_sha?: string | null
          pr_number?: number | null
          pr_url?: string | null
          signal_message_id?: string | null
          stage?: string
          started_at?: string
          status?: string
          suspicion_score?: number | null
          updated_at?: string
          verdict?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_duplicate_of_issue_id_fkey"
            columns: ["duplicate_of_issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_fix_agent_run_id_fkey"
            columns: ["fix_agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_investigation_agent_run_id_fkey"
            columns: ["investigation_agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: true
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_signal_message_id_fkey"
            columns: ["signal_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          connected_at: string | null
          created_at: string
          history_sync_complete: boolean
          history_sync_progress: number
          history_sync_updated_at: string | null
          id: string
          last_event_at: string | null
          name: string
          phone_number: string | null
          profile_name: string | null
          profile_picture_url: string | null
          provider: string
          provider_instance_name: string
          settings_json: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          history_sync_complete?: boolean
          history_sync_progress?: number
          history_sync_updated_at?: string | null
          id?: string
          last_event_at?: string | null
          name: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          provider?: string
          provider_instance_name: string
          settings_json?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          history_sync_complete?: boolean
          history_sync_progress?: number
          history_sync_updated_at?: string | null
          id?: string
          last_event_at?: string | null
          name?: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          provider?: string
          provider_instance_name?: string
          settings_json?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          channel_connection_id: string
          company_name: string | null
          created_at: string
          display_name: string
          id: string
          notes: string | null
          phone_number: string
          profile_picture_url: string | null
          provider_contact_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel_connection_id: string
          company_name?: string | null
          created_at?: string
          display_name: string
          id?: string
          notes?: string | null
          phone_number: string
          profile_picture_url?: string | null
          provider_contact_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel_connection_id?: string
          company_name?: string | null
          created_at?: string
          display_name?: string
          id?: string
          notes?: string | null
          phone_number?: string
          profile_picture_url?: string | null
          provider_contact_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_ai_state: {
        Row: {
          automation_state: string
          conversation_id: string
          created_at: string
          current_summary: string | null
          human_takeover_at: string | null
          human_takeover_by: string | null
          human_takeover_reason: string | null
          id: string
          last_decision: string | null
          last_decision_at: string | null
          last_decision_reason: string | null
          last_human_message_id: string | null
          last_triaged_at: string | null
          last_triaged_message_id: string | null
          latest_confidence: number | null
          latest_intent: string | null
          needs_human: boolean
          needs_human_reason: string | null
          paused_until: string | null
          sentiment: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          automation_state?: string
          conversation_id: string
          created_at?: string
          current_summary?: string | null
          human_takeover_at?: string | null
          human_takeover_by?: string | null
          human_takeover_reason?: string | null
          id?: string
          last_decision?: string | null
          last_decision_at?: string | null
          last_decision_reason?: string | null
          last_human_message_id?: string | null
          last_triaged_at?: string | null
          last_triaged_message_id?: string | null
          latest_confidence?: number | null
          latest_intent?: string | null
          needs_human?: boolean
          needs_human_reason?: string | null
          paused_until?: string | null
          sentiment?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          automation_state?: string
          conversation_id?: string
          created_at?: string
          current_summary?: string | null
          human_takeover_at?: string | null
          human_takeover_by?: string | null
          human_takeover_reason?: string | null
          id?: string
          last_decision?: string | null
          last_decision_at?: string | null
          last_decision_reason?: string | null
          last_human_message_id?: string | null
          last_triaged_at?: string | null
          last_triaged_message_id?: string | null
          latest_confidence?: number | null
          latest_intent?: string | null
          needs_human?: boolean
          needs_human_reason?: string | null
          paused_until?: string | null
          sentiment?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ai_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_ai_state_last_human_message_id_fkey"
            columns: ["last_human_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_ai_state_last_triaged_message_id_fkey"
            columns: ["last_triaged_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_ai_state_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_mode: string
          assigned_user_id: string | null
          attention_state: string
          channel_connection_id: string
          contact_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          last_read_at: string | null
          resolved_at: string | null
          snoozed_until: string | null
          status: string
          support_flow_state_json: Json
          unread_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_mode?: string
          assigned_user_id?: string | null
          attention_state?: string
          channel_connection_id: string
          contact_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          last_read_at?: string | null
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: string
          support_flow_state_json?: Json
          unread_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_mode?: string
          assigned_user_id?: string | null
          attention_state?: string
          channel_connection_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          last_read_at?: string | null
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: string
          support_flow_state_json?: Json
          unread_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          body: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          issue_id: string
          kind: string
          label: string
          message_id: string | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          issue_id: string
          kind: string
          label: string
          message_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          issue_id?: string
          kind?: string
          label?: string
          message_id?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      github_setup_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          repository_id: string | null
          state_hash: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          repository_id?: string | null
          state_hash: string
          user_id: string
          workspace_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          repository_id?: string | null
          state_hash?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "github_setup_states_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "repositories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "github_setup_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_connection_secrets: {
        Row: {
          access_token_encrypted: string | null
          connection_id: string
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connection_id: string
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          connection_id?: string
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "google_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      google_connections: {
        Row: {
          account_email: string | null
          account_name: string | null
          calendars_json: Json
          created_at: string
          created_by_user_id: string | null
          google_account_id: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
          scopes_json: Json
          selected_calendar_ids_json: Json
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          account_email?: string | null
          account_name?: string | null
          calendars_json?: Json
          created_at?: string
          created_by_user_id?: string | null
          google_account_id: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          scopes_json?: Json
          selected_calendar_ids_json?: Json
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          account_email?: string | null
          account_name?: string | null
          calendars_json?: Json
          created_at?: string
          created_by_user_id?: string | null
          google_account_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          scopes_json?: Json
          selected_calendar_ids_json?: Json
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          state_hash: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          state_hash: string
          user_id: string
          workspace_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          state_hash?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_comments: {
        Row: {
          author_type: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          issue_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_type?: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          issue_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_type?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          issue_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_comments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_labels: {
        Row: {
          issue_id: string
          label_id: string
        }
        Insert: {
          issue_id: string
          label_id: string
        }
        Update: {
          issue_id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_labels_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_messages: {
        Row: {
          created_at: string
          issue_id: string
          message_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          issue_id: string
          message_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          issue_id?: string
          message_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_messages_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          actual_behavior: string | null
          affected_environment: string | null
          affected_product: string | null
          ai_summary: string | null
          assigned_user_id: string | null
          confidence: number | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          created_by_user_id: string | null
          customer_notified_at: string | null
          description: string | null
          due_on: string | null
          duplicate_of_issue_id: string | null
          expected_behavior: string | null
          id: string
          identifier: string
          impact: string | null
          kanban_position: number
          number: number
          parent_issue_id: string | null
          priority: string
          reproduction_steps_json: Json
          resolved_at: string | null
          source: string
          status: string
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_behavior?: string | null
          affected_environment?: string | null
          affected_product?: string | null
          ai_summary?: string | null
          assigned_user_id?: string | null
          confidence?: number | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          created_by_user_id?: string | null
          customer_notified_at?: string | null
          description?: string | null
          due_on?: string | null
          duplicate_of_issue_id?: string | null
          expected_behavior?: string | null
          id?: string
          identifier: string
          impact?: string | null
          kanban_position?: number
          number: number
          parent_issue_id?: string | null
          priority?: string
          reproduction_steps_json?: Json
          resolved_at?: string | null
          source?: string
          status?: string
          title: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_behavior?: string | null
          affected_environment?: string | null
          affected_product?: string | null
          ai_summary?: string | null
          assigned_user_id?: string | null
          confidence?: number | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          created_by_user_id?: string | null
          customer_notified_at?: string | null
          description?: string | null
          due_on?: string | null
          duplicate_of_issue_id?: string | null
          expected_behavior?: string | null
          id?: string
          identifier?: string
          impact?: string | null
          kanban_position?: number
          number?: number
          parent_issue_id?: string | null
          priority?: string
          reproduction_steps_json?: Json
          resolved_at?: string | null
          source?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_duplicate_of_issue_id_fkey"
            columns: ["duplicate_of_issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_parent_issue_id_fkey"
            columns: ["parent_issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          dead_at: string | null
          dedupe_key: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          dead_at?: string | null
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          status?: string
          type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          dead_at?: string | null
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          body: string
          category: string
          created_at: string
          created_by_user_id: string | null
          id: string
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connection_secrets: {
        Row: {
          access_token_encrypted: string | null
          client_id_encrypted: string | null
          client_secret_encrypted: string | null
          connection_id: string
          headers_encrypted: string | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          client_id_encrypted?: string | null
          client_secret_encrypted?: string | null
          connection_id: string
          headers_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          client_id_encrypted?: string | null
          client_secret_encrypted?: string | null
          connection_id?: string
          headers_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connections: {
        Row: {
          allowed_tool_names_json: Json
          auth_mode: string
          created_at: string
          created_by_user_id: string | null
          description: string
          id: string
          last_error: string | null
          last_tested_at: string | null
          name: string
          server_url: string
          status: string
          tools_json: Json
          updated_at: string
          workspace_id: string
          write_modes_json: Json
        }
        Insert: {
          allowed_tool_names_json?: Json
          auth_mode?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name: string
          server_url: string
          status?: string
          tools_json?: Json
          updated_at?: string
          workspace_id: string
          write_modes_json?: Json
        }
        Update: {
          allowed_tool_names_json?: Json
          auth_mode?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          name?: string
          server_url?: string
          status?: string
          tools_json?: Json
          updated_at?: string
          workspace_id?: string
          write_modes_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_oauth_states: {
        Row: {
          connection_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          issuer: string | null
          state_hash: string
          user_id: string
          verifier_encrypted: string
          workspace_id: string
        }
        Insert: {
          connection_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          issuer?: string | null
          state_hash: string
          user_id: string
          verifier_encrypted: string
          workspace_id: string
        }
        Update: {
          connection_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          issuer?: string | null
          state_hash?: string
          user_id?: string
          verifier_encrypted?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_states_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tool_executions: {
        Row: {
          approval_request_id: string | null
          arguments_hmac: string
          connection_id: string
          created_at: string
          id: string
          idempotency_key: string
          mode: string
          openai_response_id: string | null
          source_message_id: string
          status: string
          tool_name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_request_id?: string | null
          arguments_hmac: string
          connection_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          mode: string
          openai_response_id?: string | null
          source_message_id: string
          status?: string
          tool_name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_request_id?: string | null
          arguments_hmac?: string
          connection_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          mode?: string
          openai_response_id?: string | null
          source_message_id?: string
          status?: string
          tool_name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tool_executions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "mcp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_tool_executions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_tool_executions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          batch_id: string | null
          conversation_id: string
          created_at: string
          declared_mime_type: string | null
          detected_mime_type: string | null
          duration_seconds: number | null
          error_code: string | null
          height: number | null
          id: string
          kind: string
          metadata_json: Json
          original_file_name: string
          original_storage_path: string
          size_bytes: number
          status: string
          updated_at: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          batch_id?: string | null
          conversation_id: string
          created_at?: string
          declared_mime_type?: string | null
          detected_mime_type?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          height?: number | null
          id?: string
          kind: string
          metadata_json?: Json
          original_file_name: string
          original_storage_path: string
          size_bytes: number
          status?: string
          updated_at?: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          batch_id?: string | null
          conversation_id?: string
          created_at?: string
          declared_mime_type?: string | null
          detected_mime_type?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          height?: number | null
          id?: string
          kind?: string
          metadata_json?: Json
          original_file_name?: string
          original_storage_path?: string
          size_bytes?: number
          status?: string
          updated_at?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "media_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_batches: {
        Row: {
          conversation_id: string
          created_at: string
          created_by_user_id: string | null
          id: string
          status: string
          total_bytes: number
          total_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          status?: string
          total_bytes?: number
          total_count?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          status?: string
          total_bytes?: number
          total_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_batches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_send_requests: {
        Row: {
          asset_id: string
          attempts: number
          batch_id: string | null
          conversation_id: string
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          message_id: string | null
          provider_message_id: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          attempts?: number
          batch_id?: string | null
          conversation_id: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          message_id?: string | null
          provider_message_id?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          attempts?: number
          batch_id?: string | null
          conversation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          message_id?: string | null
          provider_message_id?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_send_requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_send_requests_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "media_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_send_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_send_requests_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_send_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_variants: {
        Row: {
          asset_id: string
          channel: string
          created_at: string
          id: string
          metadata_json: Json
          mime_type: string
          purpose: string
          size_bytes: number
          storage_path: string
          workspace_id: string
        }
        Insert: {
          asset_id: string
          channel?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          mime_type: string
          purpose: string
          size_bytes: number
          storage_path: string
          workspace_id: string
        }
        Update: {
          asset_id?: string
          channel?: string
          created_at?: string
          id?: string
          metadata_json?: Json
          mime_type?: string
          purpose?: string
          size_bytes?: number
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_variants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_variants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_generated: boolean
          caption: string | null
          channel_connection_id: string
          conversation_id: string
          created_at: string
          direction: string
          duration_seconds: number | null
          file_name: string | null
          file_size: number | null
          id: string
          is_deleted: boolean
          media_asset_id: string | null
          media_batch_id: string | null
          media_error_code: string | null
          media_remote_url: string | null
          media_status: string
          media_storage_path: string | null
          message_type: string
          mime_type: string | null
          origin: string
          participant_name: string | null
          provider_message_id: string
          provider_status: string | null
          provider_timestamp: string | null
          quoted_message_id: string | null
          read_at: string | null
          sender_type: string
          sent_by_user_id: string | null
          text: string | null
          transcription_error_code: string | null
          transcription_status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_generated?: boolean
          caption?: string | null
          channel_connection_id: string
          conversation_id: string
          created_at?: string
          direction: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_deleted?: boolean
          media_asset_id?: string | null
          media_batch_id?: string | null
          media_error_code?: string | null
          media_remote_url?: string | null
          media_status?: string
          media_storage_path?: string | null
          message_type?: string
          mime_type?: string | null
          origin?: string
          participant_name?: string | null
          provider_message_id: string
          provider_status?: string | null
          provider_timestamp?: string | null
          quoted_message_id?: string | null
          read_at?: string | null
          sender_type: string
          sent_by_user_id?: string | null
          text?: string | null
          transcription_error_code?: string | null
          transcription_status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_generated?: boolean
          caption?: string | null
          channel_connection_id?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_deleted?: boolean
          media_asset_id?: string | null
          media_batch_id?: string | null
          media_error_code?: string | null
          media_remote_url?: string | null
          media_status?: string
          media_storage_path?: string | null
          message_type?: string
          mime_type?: string | null
          origin?: string
          participant_name?: string | null
          provider_message_id?: string
          provider_status?: string | null
          provider_timestamp?: string | null
          quoted_message_id?: string | null
          read_at?: string | null
          sender_type?: string
          sent_by_user_id?: string | null
          text?: string | null
          transcription_error_code?: string | null
          transcription_status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_media_batch_id_fkey"
            columns: ["media_batch_id"]
            isOneToOne: false
            referencedRelation: "media_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_quoted_message_id_fkey"
            columns: ["quoted_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          payload_json: Json
          read_at: string | null
          title: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          payload_json?: Json
          read_at?: string | null
          title: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          payload_json?: Json
          read_at?: string | null
          title?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_events: {
        Row: {
          all_day: boolean
          created_at: string
          ends_at: string | null
          id: string
          location: string | null
          starts_at: string
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          location?: string | null
          starts_at: string
          title: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          location?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          due_on: string | null
          id: string
          kanban_position: number
          notes: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          kanban_position?: number
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          kanban_position?: number
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      repositories: {
        Row: {
          agent_provider: string
          allowed_commands: Json
          created_at: string
          default_branch: string
          execution_plane: string
          github_installation_id: string | null
          github_owner: string | null
          github_repo: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_provider?: string
          allowed_commands?: Json
          created_at?: string
          default_branch?: string
          execution_plane?: string
          github_installation_id?: string | null
          github_owner?: string | null
          github_repo?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_provider?: string
          allowed_commands?: Json
          created_at?: string
          default_branch?: string
          execution_plane?: string
          github_installation_id?: string | null
          github_owner?: string | null
          github_repo?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repositories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata_json: Json
          workspace_id: string
        }
        Insert: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata_json?: Json
          workspace_id: string
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          interface_language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          interface_language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          interface_language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          delivery_count: number
          direction: string | null
          event_name: string
          id: string
          instance_name: string
          job_id: string
          last_error: string | null
          last_seen_at: string
          message_id: string | null
          message_type: string | null
          payload_hash: string
          processed_at: string | null
          provider: string
          provider_message_id: string
          received_at: string
          remote_jid_hash: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          delivery_count?: number
          direction?: string | null
          event_name: string
          id?: string
          instance_name: string
          job_id: string
          last_error?: string | null
          last_seen_at?: string
          message_id?: string | null
          message_type?: string | null
          payload_hash: string
          processed_at?: string | null
          provider: string
          provider_message_id: string
          received_at?: string
          remote_jid_hash?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          delivery_count?: number
          direction?: string | null
          event_name?: string
          id?: string
          instance_name?: string
          job_id?: string
          last_error?: string | null
          last_seen_at?: string
          message_id?: string | null
          message_type?: string | null
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          provider_message_id?: string
          received_at?: string
          remote_jid_hash?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_agent_credentials: {
        Row: {
          config_json: Json
          created_at: string
          encrypted_api_key: string
          id: string
          provider: string
          task: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          encrypted_api_key: string
          id?: string
          provider: string
          task: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          encrypted_api_key?: string
          id?: string
          provider?: string
          task?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agent_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          delivery_kind: string | null
          delivery_status: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          last_error_code: string | null
          revoked_at: string | null
          role: string
          sent_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          delivery_kind?: string | null
          delivery_status?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          last_error_code?: string | null
          revoked_at?: string | null
          role?: string
          sent_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          delivery_kind?: string | null
          delivery_status?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          last_error_code?: string | null
          revoked_at?: string | null
          role?: string
          sent_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          ai_policy_json: Json
          created_at: string
          default_language: string
          github_connected_at: string | null
          github_installation_id: string | null
          github_owner: string | null
          id: string
          issue_prefix: string
          name: string
          next_issue_number: number
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          ai_policy_json?: Json
          created_at?: string
          default_language?: string
          github_connected_at?: string | null
          github_installation_id?: string | null
          github_owner?: string | null
          id?: string
          issue_prefix?: string
          name: string
          next_issue_number?: number
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          ai_policy_json?: Json
          created_at?: string
          default_language?: string
          github_connected_at?: string | null
          github_installation_id?: string | null
          github_owner?: string | null
          id?: string
          issue_prefix?: string
          name?: string
          next_issue_number?: number
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          created_at: string
          display_name: string | null
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_workspace_member: {
        Args: { p_role?: string; p_user_id: string; p_workspace_id: string }
        Returns: {
          created_at: string
          display_name: string | null
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      advance_bug_case: {
        Args: {
          p_bug_case_id: string
          p_customer_response_status?: string
          p_decision?: string
          p_deployment_url?: string
          p_event_type: string
          p_fix_agent_run_id?: string
          p_health_status?: string
          p_idempotency_key: string
          p_investigation_agent_run_id?: string
          p_last_error?: string
          p_merge_sha?: string
          p_message: string
          p_metadata?: Json
          p_pr_number?: number
          p_pr_url?: string
          p_stage: string
          p_status?: string
          p_verdict?: string
          p_workspace_id: string
        }
        Returns: {
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          customer_response_status: string
          decision: string
          deployment_url: string | null
          duplicate_of_issue_id: string | null
          evidence_json: Json
          fingerprint: string | null
          fix_agent_run_id: string | null
          health_status: string
          id: string
          investigation_agent_run_id: string | null
          issue_id: string
          last_error: string | null
          merge_sha: string | null
          pr_number: number | null
          pr_url: string | null
          signal_message_id: string | null
          stage: string
          started_at: string
          status: string
          suspicion_score: number | null
          updated_at: string
          verdict: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bug_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_ai_reply_send: {
        Args: {
          p_conversation_id: string
          p_idempotency_key: string
          p_source_message_id: string
          p_workspace_id: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          provider_message_id: string | null
          sent_at: string | null
          source_message_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_outbound_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_issue_number: {
        Args: { target_workspace_id: string }
        Returns: string
      }
      claim_next_job: {
        Args: { lease_seconds?: number; worker_id: string }
        Returns: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          dead_at: string | null
          dedupe_key: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_job: {
        Args: { p_completed_at?: string; p_job_id: string; p_worker_id: string }
        Returns: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          dead_at: string | null
          dedupe_key: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: {
        Args: {
          p_default_language?: string
          p_issue_prefix?: string
          p_name: string
          p_slug: string
          p_timezone?: string
        }
        Returns: {
          ai_policy_json: Json
          created_at: string
          default_language: string
          github_connected_at: string | null
          github_installation_id: string | null
          github_owner: string | null
          id: string
          issue_prefix: string
          name: string
          next_issue_number: number
          slug: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace_invitation: {
        Args: { p_email: string; p_role?: string; p_workspace_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          delivery_kind: string | null
          delivery_status: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          last_error_code: string | null
          revoked_at: string | null
          role: string
          sent_at: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_job: {
        Args: {
          p_error: string
          p_failed_at?: string
          p_job_id: string
          p_worker_id: string
        }
        Returns: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          dead_at: string | null
          dedupe_key: string | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      inbox_create_evidence: {
        Args: {
          p_actor_user_id?: string
          p_body?: string
          p_issue_id: string
          p_kind: string
          p_label: string
          p_message_id: string
          p_metadata?: Json
          p_mime_type?: string
          p_size_bytes?: number
          p_storage_path?: string
          p_timeline_key?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      inbox_ingest_message: {
        Args: {
          p_actor_type?: string
          p_actor_user_id?: string
          p_ai_generated?: boolean
          p_caption?: string
          p_channel_connection_id: string
          p_direction: string
          p_display_name: string
          p_duration_seconds?: number
          p_file_name?: string
          p_file_size?: number
          p_media_remote_url?: string
          p_media_storage_path?: string
          p_message_type: string
          p_metadata?: Json
          p_mime_type?: string
          p_phone_number: string
          p_provider_contact_id: string
          p_provider_message_id: string
          p_provider_timestamp?: string
          p_quoted_provider_message_id?: string
          p_sender_type: string
          p_sent_by_user_id?: string
          p_text?: string
          p_timeline_key?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      inbox_link_issue_message: {
        Args: {
          p_actor_user_id?: string
          p_issue_id: string
          p_message_id: string
          p_metadata?: Json
          p_timeline_key?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      inbox_set_conversation_state: {
        Args: {
          p_action: string
          p_actor_user_id?: string
          p_conversation_id: string
          p_metadata?: Json
          p_snoozed_until?: string
          p_timeline_key?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      list_workspace_members_with_email: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }[]
      }
      pause_conversation_ai: {
        Args: {
          p_conversation_id: string
          p_reason?: string
          p_workspace_id: string
        }
        Returns: {
          automation_state: string
          conversation_id: string
          created_at: string
          current_summary: string | null
          human_takeover_at: string | null
          human_takeover_by: string | null
          human_takeover_reason: string | null
          id: string
          last_decision: string | null
          last_decision_at: string | null
          last_decision_reason: string | null
          last_human_message_id: string | null
          last_triaged_at: string | null
          last_triaged_message_id: string | null
          latest_confidence: number | null
          latest_intent: string | null
          needs_human: boolean
          needs_human_reason: string | null
          paused_until: string | null
          sentiment: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_ai_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_workspace_invitation_delivery: {
        Args: {
          p_error_code?: string
          p_invitation_id: string
          p_kind?: string
          p_status: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          delivery_kind: string | null
          delivery_status: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          last_error_code: string | null
          revoked_at: string | null
          role: string
          sent_at: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_workspace_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      resume_conversation_ai: {
        Args: { p_conversation_id: string; p_workspace_id: string }
        Returns: {
          automation_state: string
          conversation_id: string
          created_at: string
          current_summary: string | null
          human_takeover_at: string | null
          human_takeover_by: string | null
          human_takeover_reason: string | null
          id: string
          last_decision: string | null
          last_decision_at: string | null
          last_decision_reason: string | null
          last_human_message_id: string | null
          last_triaged_at: string | null
          last_triaged_message_id: string | null
          latest_confidence: number | null
          latest_intent: string | null
          needs_human: boolean
          needs_human_reason: string | null
          paused_until: string | null
          sentiment: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_ai_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string; p_workspace_id: string }
        Returns: boolean
      }
      update_workspace_invitation: {
        Args: {
          p_invitation_id: string
          p_role: string
          p_workspace_id: string
        }
        Returns: {
          accepted_at: string | null
          created_at: string
          delivery_kind: string | null
          delivery_status: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          last_error_code: string | null
          revoked_at: string | null
          role: string
          sent_at: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_workspace_member_role: {
        Args: { p_role: string; p_user_id: string; p_workspace_id: string }
        Returns: {
          created_at: string
          display_name: string | null
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workspace_can: {
        Args: { allowed_roles: string[]; target_workspace_id: string }
        Returns: boolean
      }
      workspace_member_role: {
        Args: { target_workspace_id: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
