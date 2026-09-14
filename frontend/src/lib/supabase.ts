import { createClient } from '@supabase/supabase-js';

// Type definitions for the Supabase database schema
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          hashed_password: string
          name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          hashed_password: string
          name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          hashed_password?: string
          name?: string | null
          created_at?: string
        }
      }
      scans: {
        Row: {
          id: string
          user_id: string
          repo: string
          branch: string
          system_name: string
          status: string
          log: Json
          started_at: string
        }
        Insert: {
          id?: string
          user_id: string
          repo: string
          branch: string
          system_name: string
          status: string
          log?: Json
          started_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          repo?: string
          branch?: string
          system_name?: string
          status?: string
          log?: Json
          started_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          event_type: string
          title: string
          description: string
          actor: string
          metadata: Json | null
          occurred_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_type: string
          title: string
          description: string
          actor: string
          metadata?: Json | null
          occurred_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_type?: string
          title?: string
          description?: string
          actor?: string
          metadata?: Json | null
          occurred_at?: string
        }
      }
      github_connections: {
        Row: {
          user_id: string
          token_encrypted: string
          login: string
          avatar_url: string
          scopes: string[]
          method: string
          connected_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          token_encrypted: string
          login: string
          avatar_url: string
          scopes: string[]
          method: string
          connected_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          token_encrypted?: string
          login?: string
          avatar_url?: string
          scopes?: string[]
          method?: string
          connected_at?: string
          updated_at?: string
        }
      }
      oauth_states: {
        Row: {
          state: string
          user_id: string
          created_at: string
          expires_at: string
        }
        Insert: {
          state: string
          user_id: string
          created_at?: string
          expires_at: string
        }
        Update: {
          state?: string
          user_id?: string
          created_at?: string
          expires_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
