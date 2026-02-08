-- ============================================
-- LICENSE KEY SYSTEM - Database Migration
-- Run this in your PostgreSQL database
-- ============================================

-- Add license columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_key VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_activated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_status VARCHAR(20) DEFAULT 'pending' CHECK (license_status IN ('pending', 'active', 'suspended', 'revoked'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_issued_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_issued_at TIMESTAMP;

-- Create license audit table for tracking
CREATE TABLE IF NOT EXISTS license_audit (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    license_key VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    performed_by INTEGER REFERENCES users(id),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_license_key ON users(license_key);
CREATE INDEX IF NOT EXISTS idx_users_license_status ON users(license_status);
CREATE INDEX IF NOT EXISTS idx_license_audit_user ON license_audit(user_id);

-- Function to generate license key
-- Format: ZENO-[INITIALS]-[YEAR]-[ROLE_CODE]
-- Example: ZENO-DAN0-2026-PRINC
CREATE OR REPLACE FUNCTION generate_license_key(user_name VARCHAR, role_slug VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    initials VARCHAR(4);
    year_part VARCHAR(4);
    role_code VARCHAR(5);
    random_suffix VARCHAR(2);
    final_key VARCHAR(50);
BEGIN
    -- Extract initials (up to 4 chars from name)
    initials := UPPER(LEFT(REGEXP_REPLACE(user_name, '[^a-zA-Z]', '', 'g'), 3));
    IF LENGTH(initials) < 3 THEN
        initials := initials || REPEAT('X', 3 - LENGTH(initials));
    END IF;
    -- Add a digit for uniqueness
    initials := initials || (FLOOR(RANDOM() * 10))::TEXT;
    
    -- Year
    year_part := EXTRACT(YEAR FROM NOW())::TEXT;
    
    -- Role code (first 5 chars uppercase)
    role_code := UPPER(LEFT(COALESCE(role_slug, 'USER'), 5));
    
    -- Random suffix for extra uniqueness
    random_suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 2));
    
    final_key := 'ZENO-' || initials || '-' || year_part || '-' || role_code;
    
    RETURN final_key;
END;
$$ LANGUAGE plpgsql;

-- Update existing users without license keys (optional - run manually if needed)
-- UPDATE users SET license_key = generate_license_key(name, 'user'), license_status = 'active', license_activated_at = NOW() WHERE license_key IS NULL;
