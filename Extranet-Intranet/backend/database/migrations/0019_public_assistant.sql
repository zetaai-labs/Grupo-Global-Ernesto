-- Public AI assistant (client meeting, 26 Nov 2026): answers visitors' and members' questions about
-- Grupo Global, membership and registration, only from approved knowledge that staff maintain.

CREATE TABLE IF NOT EXISTS assistant_knowledge (
  entry_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 100,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Questions it could not answer, so staff can add the missing knowledge. No names, emails or IP addresses;
-- deleted after 90 days.
CREATE TABLE IF NOT EXISTS assistant_questions (
  question_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question    VARCHAR(500) NOT NULL,
  language    VARCHAR(8),
  answered    BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_questions_created ON assistant_questions (created_at DESC);

-- "Talk to the team": the visitor leaves a contact and the team answers by email.
CREATE TABLE IF NOT EXISTS assistant_contact_requests (
  request_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  company     VARCHAR(255),
  question    VARCHAR(2000) NOT NULL,
  language    VARCHAR(8),
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED')),
  handled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  handled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_contacts_status ON assistant_contact_requests (status, created_at DESC);

-- Starting knowledge, taken from Grupo Global's own documents. Staff edit it under "AI assistant knowledge".
-- Prices are never written here: the assistant reads them live from the membership plans.
INSERT INTO assistant_knowledge (title, content, sort_order)
SELECT * FROM (VALUES
  ('Who we are',
   'Grupo Global (Grupo Global Plataforma Bilateral) is an international business group with its corporate headquarters in Spain. Its platform connects business units, international delegations and partner companies, with a focus on the Spain - European Union - India bilateral corridor and other international nodes. The platform is developed together with its technology partner Zeta AI Labs.', 10),
  ('Where we operate',
   'Spain and the European Union (headquarters and main legal jurisdiction); India (technology and engineering centre, Asia-Pacific expansion); UAE / Dubai (regional financial hub); Latin America (regional market relations); United States and Canada (commercial and institutional alliances); Morocco (gateway for North African trade).', 20),
  ('Business units',
   'Grupo Global Nexus: strategic partnerships and international alliances. Grupo Global Ciber Seguridad: cybersecurity governance, audits and threat intelligence. Financiera Grupo Global: financial management, cross-border services and investment oversight. Grupo Global Inmobiliaria: international real estate. Grupo Global Clínica Dental World: healthcare. Grupo Global Net: telecommunications and the digital platform.', 30),
  ('How a company joins',
   'A company registers on the platform''s registration page ("Register your organisation" on the login page) and goes through five steps: 1) pre-registration with company details and a short survey; 2) upload of legal documents (incorporation certificate, proof of legal representation, director identity document); 3) automatic validation of the tax ID and EU VAT number; 4) anti-money-laundering, sanctions and politically-exposed-person screening; 5) approval by the Compliance Office, which issues the account and a confidentiality agreement (NDA).', 40),
  ('Membership',
   'New member companies pay a membership for 1, 2 or 3 years. Existing direct partners of Grupo Global do not pay a membership fee; Compliance confirms this during approval. The membership is paid only after Compliance approves the company: the invoice appears in the member''s portal under Billing.', 50),
  ('Payments',
   'Invoices and memberships can be paid online by card (Stripe) or with PayPal, from Billing in the member portal. The platform never stores card details. Prices are in euros; Spanish VAT is added where it applies.', 60),
  ('Languages',
   'The platform is available in English, Spanish, Arabic, Russian and French, and posts and messages can be translated automatically into Spanish, English, Arabic, Hindi, Russian and French.', 70),
  ('Privacy and security',
   'Every user must accept the privacy policy before using the platform, in line with the GDPR and Spanish data protection law. Connections and stored files are encrypted, administrators use two-step sign-in, and every sensitive action is recorded in an audit log. The privacy policy, terms of use and cookie policy are published on the platform.', 80)
) AS seed(title, content, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM assistant_knowledge);
