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
  public: {
    Tables: {
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
        Relationships: []
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
        Relationships: []
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
          fix_run_id: string | null
          health_status: string
          id: string
          investigation_run_id: string | null
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
          fix_run_id?: string | null
          health_status?: string
          id?: string
          investigation_run_id?: string | null
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
          fix_run_id?: string | null
          health_status?: string
          id?: string
          investigation_run_id?: string | null
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
            foreignKeyName: "bug_cases_fix_run_id_fkey"
            columns: ["fix_run_id"]
            isOneToOne: false
            referencedRelation: "coding_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_cases_investigation_run_id_fkey"
            columns: ["investigation_run_id"]
            isOneToOne: false
            referencedRelation: "coding_runs"
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
      coding_run_events: {
        Row: {
          coding_run_id: string
          created_at: string
          event_type: string
          id: string
          message: string
          metadata_json: Json
          workspace_id: string
        }
        Insert: {
          coding_run_id: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata_json?: Json
          workspace_id: string
        }
        Update: {
          coding_run_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata_json?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coding_run_events_coding_run_id_fkey"
            columns: ["coding_run_id"]
            isOneToOne: false
            referencedRelation: "coding_runs"
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
      coding_runs: {
        Row: {
          branch_name: string | null
          commit_sha: string | null
          created_at: string
          created_by_user_id: string | null
          finished_at: string | null
          id: string
          issue_id: string
          mode: string
          progress: number
          repository_id: string | null
          result_json: Json
          started_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          branch_name?: string | null
          commit_sha?: string | null
          created_at?: string
          created_by_user_id?: string | null
          finished_at?: string | null
          id?: string
          issue_id: string
          mode: string
          progress?: number
          repository_id?: string | null
          result_json?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          branch_name?: string | null
          commit_sha?: string | null
          created_at?: string
          created_by_user_id?: string | null
          finished_at?: string | null
          id?: string
          issue_id?: string
          mode?: string
          progress?: number
          repository_id?: string | null
          result_json?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
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
          last_triaged_at: string | null
          last_human_message_id: string | null
          last_decision: string | null
          last_decision_at: string | null
          last_decision_reason: string | null
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
          last_triaged_at?: string | null
          last_human_message_id?: string | null
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
          last_triaged_at?: string | null
          last_human_message_id?: string | null
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
          resolved_at: string | null
          snoozed_until: string | null
          status: string
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
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: string
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
          resolved_at?: string | null
          snoozed_until?: string | null
          status?: string
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
            foreignKeyName: "github_setup_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
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
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
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
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
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
          media_remote_url: string | null
          media_storage_path: string | null
          media_asset_id?: string | null
          media_batch_id?: string | null
          media_status?: string
          message_type: string
          origin?: string
          mime_type: string | null
          provider_message_id: string
          participant_name: string | null
          provider_status: string | null
          provider_timestamp: string | null
          quoted_message_id: string | null
          sender_type: string
          sent_by_user_id: string | null
          text: string | null
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
          media_remote_url?: string | null
          media_storage_path?: string | null
          media_asset_id?: string | null
          media_batch_id?: string | null
          media_status?: string
          message_type?: string
          origin?: string
          mime_type?: string | null
          provider_message_id: string
          participant_name?: string | null
          provider_status?: string | null
          provider_timestamp?: string | null
          quoted_message_id?: string | null
          sender_type: string
          sent_by_user_id?: string | null
          text?: string | null
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
          media_remote_url?: string | null
          media_storage_path?: string | null
          media_asset_id?: string | null
          media_batch_id?: string | null
          media_status?: string
          message_type?: string
          origin?: string
          mime_type?: string | null
          provider_message_id?: string
          participant_name?: string | null
          provider_status?: string | null
          provider_timestamp?: string | null
          quoted_message_id?: string | null
          sender_type?: string
          sent_by_user_id?: string | null
          text?: string | null
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
            foreignKeyName: "personal_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "personal_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_tasks_workspace_id_fkey"
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
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
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
          local_path: string
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
          local_path: string
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
          local_path?: string
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
      mcp_connections: {
        Row: {
          id: string
          workspace_id: string
          name: string
          description: string
          server_url: string
          auth_mode: string
          status: string
          tools_json: Json
          allowed_tool_names_json: Json
          write_modes_json: Json
          last_error: string | null
          last_tested_at: string | null
          created_by_user_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          description?: string
          server_url: string
          auth_mode?: string
          status?: string
          tools_json?: Json
          allowed_tool_names_json?: Json
          write_modes_json?: Json
          last_error?: string | null
          last_tested_at?: string | null
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          description?: string
          server_url?: string
          auth_mode?: string
          status?: string
          tools_json?: Json
          allowed_tool_names_json?: Json
          write_modes_json?: Json
          last_error?: string | null
          last_tested_at?: string | null
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_connection_secrets: {
        Row: {
          connection_id: string
          headers_encrypted: string | null
          access_token_encrypted: string | null
          refresh_token_encrypted: string | null
          client_id_encrypted: string | null
          client_secret_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          connection_id: string
          headers_encrypted?: string | null
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          client_id_encrypted?: string | null
          client_secret_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          connection_id?: string
          headers_encrypted?: string | null
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          client_id_encrypted?: string | null
          client_secret_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mcp_oauth_states: {
        Row: {
          id: string
          state_hash: string
          connection_id: string
          workspace_id: string
          user_id: string
          verifier_encrypted: string
          issuer: string | null
          expires_at: string
          consumed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          state_hash: string
          connection_id: string
          workspace_id: string
          user_id: string
          verifier_encrypted: string
          issuer?: string | null
          expires_at: string
          consumed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          state_hash?: string
          connection_id?: string
          workspace_id?: string
          user_id?: string
          verifier_encrypted?: string
          issuer?: string | null
          expires_at?: string
          consumed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      mcp_tool_executions: {
        Row: {
          id: string
          workspace_id: string
          connection_id: string
          source_message_id: string
          idempotency_key: string
          tool_name: string
          arguments_hmac: string
          mode: string
          status: string
          openai_response_id: string | null
          approval_request_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          connection_id: string
          source_message_id: string
          idempotency_key: string
          tool_name: string
          arguments_hmac: string
          mode: string
          status?: string
          openai_response_id?: string | null
          approval_request_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          connection_id?: string
          source_message_id?: string
          idempotency_key?: string
          tool_name?: string
          arguments_hmac?: string
          mode?: string
          status?: string
          openai_response_id?: string | null
          approval_request_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
      workspaces: {
        Row: {
          ai_policy_json: Json
          created_at: string
          default_language: string
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
      advance_bug_case: {
        Args: {
          p_bug_case_id: string
          p_customer_response_status?: string
          p_decision?: string
          p_deployment_url?: string
          p_event_type: string
          p_fix_run_id?: string
          p_health_status?: string
          p_idempotency_key: string
          p_investigation_run_id?: string
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
          fix_run_id: string | null
          health_status: string
          id: string
          investigation_run_id: string | null
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
      }
      claim_ai_reply_send: {
        Args: {
          p_conversation_id: string
          p_idempotency_key: string
          p_source_message_id: string
          p_workspace_id: string
        }
        Returns: Json
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
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
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
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
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
      }
      create_workspace_invitation: {
        Args: {
          p_email: string
          p_role?: string
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
      }
      list_workspace_members_with_email: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string
          user_id: string
          workspace_id: string
        }[]
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
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string; p_workspace_id: string }
        Returns: boolean
      }
      record_workspace_invitation_delivery: {
        Args: {
          p_error_code?: string | null
          p_invitation_id: string
          p_kind?: string | null
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
      }
      pause_conversation_ai: {
        Args: {
          p_conversation_id: string
          p_reason?: string
          p_workspace_id: string
        }
        Returns: Json
      }
      resume_conversation_ai: {
        Args: { p_conversation_id: string; p_workspace_id: string }
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
  public: {
    Enums: {},
  },
} as const
