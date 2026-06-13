-- ── Insert CSE Department ──────────────────────────────────────────────────
INSERT INTO departments (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Computer Science & Engineering', 'CSE');

-- ── Create auth users + profiles for faculty via SQL ──────────────────────
-- We insert directly into auth.users then profiles

-- HOD: Dr. Sharmila VJ
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'hodcse@licet.ac.in',
  crypt('licet@sharmila', gen_salt('bf')),
  NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, role, department_id, full_name, email, employee_id, is_active)
VALUES ('10000000-0000-0000-0000-000000000001', 'HOD', '00000000-0000-0000-0000-000000000001', 'Dr. Sharmila VJ', 'hodcse@licet.ac.in', 'FAC001', true)
ON CONFLICT (id) DO NOTHING;

-- Faculty members
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud) VALUES
  ('10000000-0000-0000-0000-000000000002', 'reme@licet.ac.in',             crypt('licet@reme',          gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'arulmozhi.p@licet.ac.in',       crypt('licet@arulmozhi',     gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000004', 'drgk81@licet.ac.in',            crypt('licet@gopalakrishnan',gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000005', 'sharmila.vj@licet.ac.in',       crypt('licet@sharmila',     gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000006', 'jainish.gr@licet.ac.in',        crypt('licet@jainish',       gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000007', 'delphy.p@licet.ac.in',          crypt('licet@delphy',        gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000008', 'freesiegreta.l@licet.ac.in',    crypt('licet@freesie',       gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000009', 'jeevitha.a@licet.ac.in',        crypt('licet@jeevitha',      gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000010', 'sathiapriya.r@licet.ac.in',     crypt('licet@sathia',        gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000011', 'dayamarymathew@licet.ac.in',    crypt('licet@daya',          gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000012', 'accelia.s@licet.ac.in',         crypt('licet@accelia',       gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000013', 'priya.a@licet.ac.in',           crypt('licet@priya',         gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000014', 'reshma.m@licet.ac.in',          crypt('licet@reshma',        gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000015', 'shirlysudhakaran@licet.ac.in',  crypt('licet@shirly',        gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000016', 'limsajoshi@licet.ac.in',        crypt('licet@limsa',         gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000017', 'iqac@licet.ac.in',              crypt('licet@nirmala',       gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, role, department_id, full_name, email, employee_id, is_active) VALUES
  ('10000000-0000-0000-0000-000000000002', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Dr. Remegius Praveen L',    'reme@licet.ac.in',            'FAC002', true),
  ('10000000-0000-0000-0000-000000000003', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Dr. Arulmozhi P',           'arulmozhi.p@licet.ac.in',     'FAC003', true),
  ('10000000-0000-0000-0000-000000000004', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Dr. Gopalakrishnan K',      'drgk81@licet.ac.in',          'FAC004', true),
  ('10000000-0000-0000-0000-000000000005', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Dr. Sharmila VJ (Member)',  'sharmila.vj@licet.ac.in',     'FAC005', true),
  ('10000000-0000-0000-0000-000000000006', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Dr. Jainish GR',            'jainish.gr@licet.ac.in',      'FAC006', true),
  ('10000000-0000-0000-0000-000000000007', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Delphy P',              'delphy.p@licet.ac.in',        'FAC007', true),
  ('10000000-0000-0000-0000-000000000008', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Freesie Greta L',       'freesiegreta.l@licet.ac.in',  'FAC008', true),
  ('10000000-0000-0000-0000-000000000009', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Jeevitha A',            'jeevitha.a@licet.ac.in',      'FAC009', true),
  ('10000000-0000-0000-0000-000000000010', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Sathia Priya R',        'sathiapriya.r@licet.ac.in',   'FAC010', true),
  ('10000000-0000-0000-0000-000000000011', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Daya Mary Mathew',      'dayamarymathew@licet.ac.in',  'FAC011', true),
  ('10000000-0000-0000-0000-000000000012', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Accelia S',             'accelia.s@licet.ac.in',       'FAC012', true),
  ('10000000-0000-0000-0000-000000000013', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Priya A',               'priya.a@licet.ac.in',         'FAC013', true),
  ('10000000-0000-0000-0000-000000000014', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Reshma M',              'reshma.m@licet.ac.in',        'FAC014', true),
  ('10000000-0000-0000-0000-000000000015', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Shirly Sudhakaran',     'shirlysudhakaran@licet.ac.in','FAC015', true),
  ('10000000-0000-0000-0000-000000000016', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Limsa Joshi',           'limsajoshi@licet.ac.in',      'FAC016', true),
  ('10000000-0000-0000-0000-000000000017', 'PROFESSOR', '00000000-0000-0000-0000-000000000001', 'Ms. Nirmala Santiago',      'iqac@licet.ac.in',            'FAC017', true)
ON CONFLICT (id) DO NOTHING;
