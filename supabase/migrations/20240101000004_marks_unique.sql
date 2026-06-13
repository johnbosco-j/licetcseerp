ALTER TABLE marks ADD CONSTRAINT marks_student_subject_exam_unique 
  UNIQUE (student_id, subject_id, exam_type);
