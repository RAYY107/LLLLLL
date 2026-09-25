-- ============================================================
--  LR_hitmansystem - FRESH DATABASE INSTALL
--  -----------------------------------------------------------
--  Resets ALL hitman system tables and creates them empty.
--
--  HOW TO USE (buyer):
--    1. Open your database tool (HeidiSQL / phpMyAdmin / mysql CLI)
--    2. Select the SAME database your vRP uses
--    3. Run this whole file once
--
--  NOTE: The resource also auto-creates any missing tables on
--  startup, so running this file is optional but recommended
--  to guarantee a clean state.
-- ============================================================

-- Drop in dependency-safe order (children first)
DROP TABLE IF EXISTS hitman_contract_messages;
DROP TABLE IF EXISTS hitman_wallets;
DROP TABLE IF EXISTS hitman_blacklist;
DROP TABLE IF EXISTS hitman_stats;
DROP TABLE IF EXISTS hitman_contracts;

-- ─── Contracts ─────────────────────────────────────────────
CREATE TABLE hitman_contracts (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    requester_id  INT NOT NULL,
    target_id     INT NOT NULL,
    price         INT NOT NULL,
    notes         TEXT,
    priority      VARCHAR(20) DEFAULT 'normal',
    anonymous     TINYINT(1) DEFAULT 0,
    status        VARCHAR(20) DEFAULT 'open',
    created_at    BIGINT NOT NULL,
    expires_at    BIGINT NOT NULL,
    hitman_id     INT DEFAULT NULL,
    accepted_at   BIGINT DEFAULT NULL,
    completed_at  BIGINT DEFAULT NULL,
    INDEX idx_status (status),
    INDEX idx_target (target_id),
    INDEX idx_hitman (hitman_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Hitman stats & ranks ──────────────────────────────────
CREATE TABLE hitman_stats (
    user_id        INT PRIMARY KEY,
    kills          INT DEFAULT 0,
    earnings       BIGINT DEFAULT 0,
    missions_taken INT DEFAULT 0,
    missions_failed INT DEFAULT 0,
    updated_at     BIGINT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Blacklisted players (cannot request or be targeted) ───
CREATE TABLE hitman_blacklist (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL UNIQUE,
    reason     TEXT,
    added_at   BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Fallback wallet (ONLY used if vRP wallet API is unreachable) ───
CREATE TABLE hitman_wallets (
    user_id  INT PRIMARY KEY,
    balance  BIGINT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Contract chat messages ────────────────────────────────
CREATE TABLE hitman_contract_messages (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    contract_id INT NOT NULL,
    sender_uid  INT NOT NULL,
    sender_role VARCHAR(10) NOT NULL,
    message     TEXT NOT NULL,
    created_at  BIGINT NOT NULL,
    INDEX idx_cmsg_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
