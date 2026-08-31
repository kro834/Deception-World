-- The public AI chat feature has been retired. Remove all application-owned
-- requests, encrypted results, rate-limit identities, and breaker history.
DROP TABLE IF EXISTS archive_ai_rate_charges;
DROP TABLE IF EXISTS archive_ai_requests;
DROP TABLE IF EXISTS archive_ai_circuit_breakers;
DROP TABLE IF EXISTS archive_ai_rate_limits;
