-- Parents can sign themselves up. Their details wait on the emailed sign-in request and only become
-- a family (guardian, children) once they've proved the email is theirs with the code or link.
alter table auth.sign_in_requests add column registration jsonb;
alter table guardians add column self_registered_at timestamptz;
