-- Every role the platform uses must exist without the demo seed, or a new production database has no Super Administrator role.
INSERT INTO roles (name, description) VALUES
  ('admin', 'Full platform administration'),
  ('employee', 'Internal intranet access'),
  ('partner', 'External extranet access'),
  ('hr', 'Human resources — intranet access and user directory'),
  ('manager', 'Department manager — intranet access and AutoFlow approvals'),
  ('client', 'External client — extranet access'),
  ('supplier', 'External supplier/vendor — extranet access'),
  ('tech_admin', 'Technical Administrator — infrastructure, security policy, integrations'),
  ('investor', 'Confidential Investor — isolated investor vault access'),
  ('finance', 'Finance Manager — budgets, revenue and financial oversight')
ON CONFLICT (name) DO NOTHING;

UPDATE roles r SET code = v.code, authority_level = v.level
FROM (VALUES
  ('admin', 'ROLE_SUPER_ADMIN', '0'), ('tech_admin', 'ROLE_TECH_ADMIN', '1'), ('hr', 'ROLE_HR_MGR', '2'),
  ('finance', 'ROLE_FINANCE_MGR', '2'), ('manager', 'ROLE_EMPLOYEE_DELEGATE', '3'), ('employee', 'ROLE_EMPLOYEE_DELEGATE', '3'),
  ('partner', 'ROLE_CLIENT_PARTNER', '4'), ('client', 'ROLE_CLIENT_PARTNER', '4'),
  ('supplier', 'ROLE_CLIENT_PARTNER', '4'), ('investor', 'ROLE_INVESTOR_VAULT', '0-S')
) AS v(name, code, level)
WHERE r.name = v.name AND (r.code IS DISTINCT FROM v.code OR r.authority_level IS DISTINCT FROM v.level);
