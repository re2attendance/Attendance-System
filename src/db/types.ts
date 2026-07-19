export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      academic_calendar_events: {
        Row: {
          class_section_id: string | null
          created_at: string
          declared_at: string
          declared_by: string | null
          ends_on: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          id: string
          institution_id: string
          reason: string | null
          semester_id: string | null
          starts_on: string
          title: string
          updated_at: string
        }
        Insert: {
          class_section_id?: string | null
          created_at?: string
          declared_at?: string
          declared_by?: string | null
          ends_on: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          id?: string
          institution_id: string
          reason?: string | null
          semester_id?: string | null
          starts_on: string
          title: string
          updated_at?: string
        }
        Update: {
          class_section_id?: string | null
          created_at?: string
          declared_at?: string
          declared_by?: string | null
          ends_on?: string
          event_type?: Database["public"]["Enums"]["calendar_event_type"]
          id?: string
          institution_id?: string
          reason?: string | null
          semester_id?: string | null
          starts_on?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_calendar_events_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_calendar_events_declared_by_fkey"
            columns: ["declared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_calendar_events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_calendar_events_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          institution_id: string
          name: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          institution_id: string
          name: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          institution_id?: string
          name?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_disputes: {
        Row: {
          created_at: string
          evidence_path: string | null
          id: string
          message: string
          record_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          responded_at: string | null
          responded_by: string | null
          response_note: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_path?: string | null
          id?: string
          message: string
          record_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_path?: string | null
          id?: string
          message?: string
          record_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_note?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_disputes_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_disputes_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_disputes_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_disputes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          anti_proxy_flags: string[]
          attachment_path: string | null
          class_section_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["attendance_decision"] | null
          deleted_at: string | null
          device_fingerprint: string | null
          geofence_distance_m: number | null
          id: string
          is_override: boolean
          overridden_by: string | null
          override_reason: string | null
          permission_decided_at: string | null
          permission_decided_by: string | null
          permission_decision:
            | Database["public"]["Enums"]["permission_decision"]
            | null
          permission_decision_note: string | null
          permission_note: string | null
          permission_reason_id: string | null
          rules_snapshot_id: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          submission_source:
            | Database["public"]["Enums"]["submission_source"]
            | null
          submitted_at: string | null
          submitted_ip: unknown
          updated_at: string
          verification_latency_seconds: number | null
        }
        Insert: {
          anti_proxy_flags?: string[]
          attachment_path?: string | null
          class_section_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["attendance_decision"] | null
          deleted_at?: string | null
          device_fingerprint?: string | null
          geofence_distance_m?: number | null
          id?: string
          is_override?: boolean
          overridden_by?: string | null
          override_reason?: string | null
          permission_decided_at?: string | null
          permission_decided_by?: string | null
          permission_decision?:
            | Database["public"]["Enums"]["permission_decision"]
            | null
          permission_decision_note?: string | null
          permission_note?: string | null
          permission_reason_id?: string | null
          rules_snapshot_id?: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          submission_source?:
            | Database["public"]["Enums"]["submission_source"]
            | null
          submitted_at?: string | null
          submitted_ip?: unknown
          updated_at?: string
          verification_latency_seconds?: number | null
        }
        Update: {
          anti_proxy_flags?: string[]
          attachment_path?: string | null
          class_section_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["attendance_decision"] | null
          deleted_at?: string | null
          device_fingerprint?: string | null
          geofence_distance_m?: number | null
          id?: string
          is_override?: boolean
          overridden_by?: string | null
          override_reason?: string | null
          permission_decided_at?: string | null
          permission_decided_by?: string | null
          permission_decision?:
            | Database["public"]["Enums"]["permission_decision"]
            | null
          permission_decision_note?: string | null
          permission_note?: string | null
          permission_reason_id?: string | null
          rules_snapshot_id?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          submission_source?:
            | Database["public"]["Enums"]["submission_source"]
            | null
          submitted_at?: string | null
          submitted_ip?: unknown
          updated_at?: string
          verification_latency_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_permission_decided_by_fkey"
            columns: ["permission_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_permission_reason_id_fkey"
            columns: ["permission_reason_id"]
            isOneToOne: false
            referencedRelation: "permission_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_rules_snapshot_id_fkey"
            columns: ["rules_snapshot_id"]
            isOneToOne: false
            referencedRelation: "attendance_rule_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_rule_snapshots: {
        Row: {
          allow_late_submission: boolean
          auto_close_minutes_after_end: number
          beyond_late_window: Database["public"]["Enums"]["beyond_late_window"]
          created_at: string
          grace_period_minutes: number
          id: string
          late_submission_window_hours: number
          late_within_minutes: number
          min_attendance_percent: number
          present_within_minutes: number
          source_rule_id: string | null
          source_version: number | null
        }
        Insert: {
          allow_late_submission?: boolean
          auto_close_minutes_after_end?: number
          beyond_late_window: Database["public"]["Enums"]["beyond_late_window"]
          created_at?: string
          grace_period_minutes?: number
          id?: string
          late_submission_window_hours?: number
          late_within_minutes: number
          min_attendance_percent: number
          present_within_minutes: number
          source_rule_id?: string | null
          source_version?: number | null
        }
        Update: {
          allow_late_submission?: boolean
          auto_close_minutes_after_end?: number
          beyond_late_window?: Database["public"]["Enums"]["beyond_late_window"]
          created_at?: string
          grace_period_minutes?: number
          id?: string
          late_submission_window_hours?: number
          late_within_minutes?: number
          min_attendance_percent?: number
          present_within_minutes?: number
          source_rule_id?: string | null
          source_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_rule_snapshots_source_rule_id_fkey"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "attendance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_rules: {
        Row: {
          allow_late_submission: boolean
          auto_close_minutes_after_end: number
          beyond_late_window: Database["public"]["Enums"]["beyond_late_window"]
          created_at: string
          created_by: string | null
          effective_from: string
          grace_period_minutes: number
          id: string
          institution_id: string
          late_submission_window_hours: number
          late_within_minutes: number
          min_attendance_percent: number
          present_within_minutes: number
          scope: Database["public"]["Enums"]["rule_scope"]
          scope_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          allow_late_submission?: boolean
          auto_close_minutes_after_end?: number
          beyond_late_window?: Database["public"]["Enums"]["beyond_late_window"]
          created_at?: string
          created_by?: string | null
          effective_from?: string
          grace_period_minutes?: number
          id?: string
          institution_id: string
          late_submission_window_hours?: number
          late_within_minutes: number
          min_attendance_percent?: number
          present_within_minutes: number
          scope: Database["public"]["Enums"]["rule_scope"]
          scope_id?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          allow_late_submission?: boolean
          auto_close_minutes_after_end?: number
          beyond_late_window?: Database["public"]["Enums"]["beyond_late_window"]
          created_at?: string
          created_by?: string | null
          effective_from?: string
          grace_period_minutes?: number
          id?: string
          institution_id?: string
          late_submission_window_hours?: number
          late_within_minutes?: number
          min_attendance_percent?: number
          present_within_minutes?: number
          scope?: Database["public"]["Enums"]["rule_scope"]
          scope_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_rules_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_event_id: string | null
          cancelled_reason: string | null
          class_section_id: string
          closed_at: string | null
          closed_by: string | null
          code_rotated_at: string | null
          created_at: string
          description: string | null
          ends_at: string
          generated_from_schedule_rule_id: string | null
          geofence_lat: number | null
          geofence_lng: number | null
          geofence_radius_m: number | null
          id: string
          opened_at: string | null
          opened_by: string | null
          room: string | null
          rules_snapshot_id: string | null
          session_code: string | null
          session_date: string
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_event_id?: string | null
          cancelled_reason?: string | null
          class_section_id: string
          closed_at?: string | null
          closed_by?: string | null
          code_rotated_at?: string | null
          created_at?: string
          description?: string | null
          ends_at: string
          generated_from_schedule_rule_id?: string | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number | null
          id?: string
          opened_at?: string | null
          opened_by?: string | null
          room?: string | null
          rules_snapshot_id?: string | null
          session_code?: string | null
          session_date: string
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_event_id?: string | null
          cancelled_reason?: string | null
          class_section_id?: string
          closed_at?: string | null
          closed_by?: string | null
          code_rotated_at?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string
          generated_from_schedule_rule_id?: string | null
          geofence_lat?: number | null
          geofence_lng?: number | null
          geofence_radius_m?: number | null
          id?: string
          opened_at?: string | null
          opened_by?: string | null
          room?: string | null
          rules_snapshot_id?: string | null
          session_code?: string | null
          session_date?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_cancelled_by_event_id_fkey"
            columns: ["cancelled_by_event_id"]
            isOneToOne: false
            referencedRelation: "academic_calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_generated_from_schedule_rule_id_fkey"
            columns: ["generated_from_schedule_rule_id"]
            isOneToOne: false
            referencedRelation: "schedule_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_rules_snapshot_id_fkey"
            columns: ["rules_snapshot_id"]
            isOneToOne: false
            referencedRelation: "attendance_rule_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_summaries: {
        Row: {
          absent_count: number
          attendance_percent: number | null
          attended_count: number
          cancelled_count: number
          class_section_id: string
          countable_total: number
          excused_count: number
          late_count: number
          pending_count: number
          permission_granted_count: number
          present_count: number
          rejected_count: number
          student_id: string
          unverified_count: number
          updated_at: string
        }
        Insert: {
          absent_count?: number
          attendance_percent?: number | null
          attended_count?: number
          cancelled_count?: number
          class_section_id: string
          countable_total?: number
          excused_count?: number
          late_count?: number
          pending_count?: number
          permission_granted_count?: number
          present_count?: number
          rejected_count?: number
          student_id: string
          unverified_count?: number
          updated_at?: string
        }
        Update: {
          absent_count?: number
          attendance_percent?: number | null
          attended_count?: number
          cancelled_count?: number
          class_section_id?: string
          countable_total?: number
          excused_count?: number
          late_count?: number
          pending_count?: number
          permission_granted_count?: number
          present_count?: number
          rejected_count?: number
          student_id?: string
          unverified_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_summaries_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_summaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          ip: unknown
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          ip?: unknown
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip?: unknown
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sections: {
        Row: {
          capacity: number | null
          course_id: string
          created_at: string
          id: string
          institution_id: string
          instructor_id: string | null
          room: string | null
          section_code: string
          semester_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          course_id: string
          created_at?: string
          id?: string
          institution_id: string
          instructor_id?: string | null
          room?: string | null
          section_code: string
          semester_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          course_id?: string
          created_at?: string
          id?: string
          institution_id?: string
          instructor_id?: string | null
          room?: string | null
          section_code?: string
          semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      course_rep_assignments: {
        Row: {
          assigned_by: string | null
          class_section_id: string
          created_at: string
          ends_at: string | null
          id: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          class_section_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          class_section_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rep_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rep_assignments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rep_assignments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rep_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          academic_year_id: string
          code: string
          created_at: string
          credit_units: number
          department_id: string
          id: string
          institution_id: string
          level: number
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          code: string
          created_at?: string
          credit_units: number
          department_id: string
          id?: string
          institution_id: string
          level: number
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          code?: string
          created_at?: string
          credit_units?: number
          department_id?: string
          id?: string
          institution_id?: string
          level?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          faculty_id: string
          id: string
          institution_id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          faculty_id: string
          id?: string
          institution_id: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          faculty_id?: string
          id?: string
          institution_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json | null
          provider_message_id: string | null
          recipient: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          provider_message_id?: string | null
          recipient?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json | null
          provider_message_id?: string | null
          recipient?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_section_id: string
          created_at: string
          dropped_at: string | null
          enrolled_at: string
          id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          class_section_id: string
          created_at?: string
          dropped_at?: string | null
          enrolled_at?: string
          id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          class_section_id?: string
          created_at?: string
          dropped_at?: string | null
          enrolled_at?: string
          id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faculties: {
        Row: {
          code: string
          created_at: string
          id: string
          institution_id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          institution_id: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          institution_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculties_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      institutions: {
        Row: {
          allow_self_registration: boolean
          created_at: string
          id: string
          name: string
          short_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          allow_self_registration?: boolean
          created_at?: string
          id?: string
          name: string
          short_name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          allow_self_registration?: boolean
          created_at?: string
          id?: string
          name?: string
          short_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          enroll_in_section_id: string | null
          expires_at: string
          id: string
          institution_id: string
          invited_by: string | null
          matric_number: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["role_scope_type"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          enroll_in_section_id?: string | null
          expires_at: string
          id?: string
          institution_id: string
          invited_by?: string | null
          matric_number?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type: Database["public"]["Enums"]["role_scope_type"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          enroll_in_section_id?: string | null
          expires_at?: string
          id?: string
          institution_id?: string
          invited_by?: string | null
          matric_number?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["role_scope_type"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_enroll_in_section_id_fkey"
            columns: ["enroll_in_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          result: Json | null
          run_key: string
          started_at: string
          status: Database["public"]["Enums"]["job_run_status"]
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          result?: Json | null
          run_key: string
          started_at?: string
          status?: Database["public"]["Enums"]["job_run_status"]
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          result?: Json | null
          run_key?: string
          started_at?: string
          status?: Database["public"]["Enums"]["job_run_status"]
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          event_type: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          event_type: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          event_type?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          event_type: string
          id: string
          link_path: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          link_path?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          link_path?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_reasons: {
        Row: {
          code: string
          counts_as_excused: boolean
          created_at: string
          id: string
          institution_id: string
          is_active: boolean
          label: string
          requires_attachment: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          counts_as_excused?: boolean
          created_at?: string
          id?: string
          institution_id: string
          is_active?: boolean
          label: string
          requires_attachment?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          counts_as_excused?: boolean
          created_at?: string
          id?: string
          institution_id?: string
          is_active?: boolean
          label?: string
          requires_attachment?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_reasons_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          department_id: string | null
          email: string
          full_name: string
          id: string
          institution_id: string
          level: number | null
          matric_number: string | null
          program_id: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          full_name: string
          id: string
          institution_id: string
          level?: number | null
          matric_number?: string | null
          program_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          institution_id?: string
          level?: number | null
          matric_number?: string | null
          program_id?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          code: string
          created_at: string
          department_id: string
          duration_years: number
          id: string
          institution_id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id: string
          duration_years?: number
          id?: string
          institution_id: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string
          duration_years?: number
          id?: string
          institution_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_rules: {
        Row: {
          class_section_id: string
          created_at: string
          day_of_week: number
          effective_from: string
          effective_to: string | null
          ends_at_local: string
          id: string
          room: string | null
          starts_at_local: string
          updated_at: string
        }
        Insert: {
          class_section_id: string
          created_at?: string
          day_of_week: number
          effective_from: string
          effective_to?: string | null
          ends_at_local: string
          id?: string
          room?: string | null
          starts_at_local: string
          updated_at?: string
        }
        Update: {
          class_section_id?: string
          created_at?: string
          day_of_week?: number
          effective_from?: string
          effective_to?: string | null
          ends_at_local?: string
          id?: string
          room?: string | null
          starts_at_local?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_rules_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          academic_year_id: string
          add_drop_deadline: string | null
          created_at: string
          ends_on: string
          finalized_at: string | null
          id: string
          institution_id: string
          name: string
          starts_on: string
          status: Database["public"]["Enums"]["semester_status"]
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          add_drop_deadline?: string | null
          created_at?: string
          ends_on: string
          finalized_at?: string | null
          id?: string
          institution_id: string
          name: string
          starts_on: string
          status?: Database["public"]["Enums"]["semester_status"]
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          add_drop_deadline?: string | null
          created_at?: string
          ends_on?: string
          finalized_at?: string | null
          id?: string
          institution_id?: string
          name?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["semester_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "semesters_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_makeups: {
        Row: {
          cancelled_session_id: string
          created_at: string
          created_by: string | null
          id: string
          makeup_session_id: string
        }
        Insert: {
          cancelled_session_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          makeup_session_id: string
        }
        Update: {
          cancelled_session_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          makeup_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_makeups_cancelled_session_id_fkey"
            columns: ["cancelled_session_id"]
            isOneToOne: true
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_makeups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_makeups_makeup_session_id_fkey"
            columns: ["makeup_session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id: string | null
          scope_type: Database["public"]["Enums"]["role_scope_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type: Database["public"]["Enums"]["role_scope_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: Database["public"]["Enums"]["role_scope_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      attendance_summary_view: {
        Row: {
          absent_count: number | null
          attendance_percent: number | null
          attended_count: number | null
          cancelled_count: number | null
          class_section_id: string | null
          countable_total: number | null
          course_code: string | null
          course_title: string | null
          excused_count: number | null
          late_count: number | null
          matric_number: string | null
          pending_count: number | null
          permission_granted_count: number | null
          present_count: number | null
          rejected_count: number | null
          section_code: string | null
          semester_id: string | null
          student_id: string | null
          student_name: string | null
          unverified_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_summaries_class_section_id_fkey"
            columns: ["class_section_id"]
            isOneToOne: false
            referencedRelation: "class_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_summaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sections_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_full_name: string; p_token_hash: string }
        Returns: string
      }
      attendance_decide_one: {
        Args: {
          p_decision: Database["public"]["Enums"]["attendance_decision"]
          p_record_id: string
          p_status: Database["public"]["Enums"]["attendance_status"]
        }
        Returns: string
      }
      auth_can_administer_section: {
        Args: { p_section_id: string }
        Returns: boolean
      }
      auth_day_is_declared: {
        Args: { p_class_section_id: string; p_date: string }
        Returns: boolean
      }
      auth_has_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_scope_id?: string
          p_scope_type?: Database["public"]["Enums"]["role_scope_type"]
        }
        Returns: boolean
      }
      auth_is_active_rep_for_section: {
        Args: { p_section_id: string }
        Returns: boolean
      }
      auth_is_admin: { Args: never; Returns: boolean }
      auth_is_enrolled_in_section: {
        Args: { p_section_id: string }
        Returns: boolean
      }
      auth_is_instructor_for_section: {
        Args: { p_section_id: string }
        Returns: boolean
      }
      auth_section_is_finalized: {
        Args: { p_section_id: string }
        Returns: boolean
      }
      auth_session_accepts_submissions: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      cancel_session: {
        Args: { p_reason: string; p_session_id: string }
        Returns: undefined
      }
      close_due_sessions: {
        Args: never
        Returns: {
          absences: number
          closed: number
        }[]
      }
      close_session: {
        Args: { p_session_id: string }
        Returns: {
          absences_written: number
          pending_swept: number
        }[]
      }
      decide_attendance: {
        Args: {
          p_decision: Database["public"]["Enums"]["attendance_decision"]
          p_record_id: string
          p_status: Database["public"]["Enums"]["attendance_status"]
        }
        Returns: {
          record_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          was_already_decided: boolean
        }[]
      }
      decide_attendance_bulk: {
        Args: {
          p_decision: Database["public"]["Enums"]["attendance_decision"]
          p_items: Json
        }
        Returns: {
          decided: number
          skipped: number
        }[]
      }
      declare_calendar_event: {
        Args: {
          p_class_section_id?: string
          p_ends_on: string
          p_event_type: Database["public"]["Enums"]["calendar_event_type"]
          p_reason?: string
          p_starts_on: string
          p_title: string
        }
        Returns: {
          event_id: string
          records_voided: number
          sessions_cancelled: number
        }[]
      }
      generate_sessions: {
        Args: { p_class_section_id: string; p_from: string; p_to: string }
        Returns: number
      }
      get_invitation_by_token_hash: {
        Args: { p_token_hash: string }
        Returns: {
          email: string
          institution_name: string
          invalid_reason: string
          is_valid: boolean
          role: Database["public"]["Enums"]["app_role"]
          scope_id: string
          scope_type: Database["public"]["Enums"]["role_scope_type"]
        }[]
      }
      import_roster: {
        Args: { p_rows: Json }
        Returns: {
          already_enrolled: number
          enrolled: number
          invited: number
        }[]
      }
      institution_today: { Args: { p_institution_id: string }; Returns: string }
      log_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id?: string
          p_entity_type: string
          p_ip?: unknown
          p_user_agent?: string
        }
        Returns: number
      }
      open_session: { Args: { p_session_id: string }; Returns: undefined }
      recalc_attendance_summary: {
        Args: { p_class_section_id: string; p_student_id: string }
        Returns: undefined
      }
      report_present: {
        Args: {
          p_device_fingerprint?: string
          p_ip?: unknown
          p_session_id: string
        }
        Returns: {
          record_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }[]
      }
      resolve_rule_snapshot: {
        Args: { p_class_section_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "instructor" | "course_rep" | "student"
      attendance_decision: "approved" | "rejected"
      attendance_status:
        | "pending_verification"
        | "pending_permission_review"
        | "unverified"
        | "present"
        | "late"
        | "permission_granted"
        | "absent"
        | "rejected"
        | "excused"
        | "cancelled"
      beyond_late_window: "late" | "absent"
      calendar_event_type: "holiday" | "break" | "exam_period" | "emergency"
      dispute_status: "open" | "responded" | "resolved" | "rejected"
      enrollment_status: "enrolled" | "dropped" | "withdrawn"
      job_run_status: "running" | "succeeded" | "failed"
      notification_channel: "email" | "in_app" | "off"
      permission_decision: "granted" | "rejected"
      profile_status: "active" | "suspended" | "withdrawn" | "graduated"
      role_scope_type:
        | "global"
        | "institution"
        | "faculty"
        | "department"
        | "course"
        | "class_section"
      rule_scope: "global" | "department" | "course" | "class_section"
      semester_status: "upcoming" | "active" | "closed" | "finalized"
      session_status: "scheduled" | "open" | "closed" | "cancelled"
      submission_source: "student_web" | "rep_manual" | "system"
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
    Enums: {
      app_role: ["admin", "instructor", "course_rep", "student"],
      attendance_decision: ["approved", "rejected"],
      attendance_status: [
        "pending_verification",
        "pending_permission_review",
        "unverified",
        "present",
        "late",
        "permission_granted",
        "absent",
        "rejected",
        "excused",
        "cancelled",
      ],
      beyond_late_window: ["late", "absent"],
      calendar_event_type: ["holiday", "break", "exam_period", "emergency"],
      dispute_status: ["open", "responded", "resolved", "rejected"],
      enrollment_status: ["enrolled", "dropped", "withdrawn"],
      job_run_status: ["running", "succeeded", "failed"],
      notification_channel: ["email", "in_app", "off"],
      permission_decision: ["granted", "rejected"],
      profile_status: ["active", "suspended", "withdrawn", "graduated"],
      role_scope_type: [
        "global",
        "institution",
        "faculty",
        "department",
        "course",
        "class_section",
      ],
      rule_scope: ["global", "department", "course", "class_section"],
      semester_status: ["upcoming", "active", "closed", "finalized"],
      session_status: ["scheduled", "open", "closed", "cancelled"],
      submission_source: ["student_web", "rep_manual", "system"],
    },
  },
} as const

