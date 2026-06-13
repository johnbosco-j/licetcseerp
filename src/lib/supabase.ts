import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
})

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'HOD' | 'PROFESSOR' | 'STUDENT'
          department_id: string | null
          full_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          roll_no: string | null
          employee_id: string | null
          batch_year: number | null
          section: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      departments: { Row: { id: string; name: string; code: string; created_at: string } }
      subjects: {
        Row: {
          id: string; code: string; name: string
          department_id: string | null; semester: number
          credits: number; section: string | null
          academic_year: string | null; created_at: string
        }
      }
      attendance: {
        Row: {
          id: string; student_id: string; subject_id: string
          faculty_id: string; date: string
          status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
          marked_via: string; created_at: string
        }
      }
      marks: {
        Row: {
          id: string; student_id: string; subject_id: string
          faculty_id: string; exam_type: string
          marks_obtained: number; max_marks: number; recorded_at: string
        }
      }
      finance_ledger: {
        Row: {
          id: string; department_id: string; txn_type: 'CREDIT' | 'DEBIT'
          category: string; amount: number; description: string
          reference_no: string | null; created_by: string; created_at: string
          prev_hash: string | null; entry_hash: string | null; sequence_no: number
        }
      }
      announcements: {
        Row: {
          id: string; department_id: string | null; title: string
          body: string; audience: string; is_urgent: boolean
          expires_at: string | null; created_by: string; created_at: string
        }
      }
      leaves: {
        Row: {
          id: string; applicant_id: string; leave_type: string
          from_date: string; to_date: string; reason: string
          document_url: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'
          reviewed_by: string | null; review_note: string | null
          reviewed_at: string | null; created_at: string
        }
      }
      inventory: {
        Row: {
          id: string; department_id: string; asset_tag: string
          name: string; category: string
          status: 'OPERATIONAL' | 'MAINTENANCE' | 'RETIRED'
          location: string | null; purchase_date: string | null
          purchase_value: number | null; next_service_date: string | null
          notes: string | null; created_at: string
        }
      }
      placements: {
        Row: {
          id: string; department_id: string; company_name: string
          role_title: string; package_lpa: number | null
          visit_date: string | null; description: string | null
          apply_url: string | null; is_active: boolean
          created_by: string; created_at: string
        }
      }
      grievances: {
        Row: {
          id: string; student_id: string; category: string
          subject_line: string; description: string; status: string
          assigned_to: string | null; resolution: string | null
          created_at: string; updated_at: string
        }
      }
      student_risk_scores: {
        Row: {
          id: string; student_id: string; risk_score: number
          risk_level: 'SAFE' | 'WATCH' | 'AT_RISK' | 'CRITICAL'
          attendance_pct: number; avg_marks_pct: number
          grade_trend: string; last_computed: string
        }
      }
    }
  }
}
// Append to Database type — subject_locks table
// (added separately to avoid rewriting the full type)
