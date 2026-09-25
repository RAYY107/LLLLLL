-- ============================================================
--  Evora_hitman - Server Side
--  Universal vRP integration (works on any vRP FiveM server)
-- ============================================================

-- ─── STARTUP BANNER ──────────────────────────────────────
print([[

^6    ███████╗██╗   ██╗ ██████╗ ██████╗  █████╗
^6    ██╔════╝██║   ██║██╔═══██╗██╔══██╗██╔══██╗
^6    █████╗  ██║   ██║██║   ██║██████╔╝███████║
^6    ██╔══╝  ╚██╗ ██╔╝██║   ██║██╔══██╗██╔══██║
^6    ███████╗ ╚████╔╝ ╚██████╔╝██║  ██║██║  ██║
^6    ╚══════╝  ╚═══╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝^7     — Made by LR
]])

-- ─── UNIVERSAL vRP PROXY LOADER ──────────────────────────
-- Auto-detects the vRP variant running on the server:
--   • Standard vRP / vRP 2.x  → 'Proxy' is already a global
--   • Delix / dunko / modded  → 'Proxy' must be loaded via module("lib/Proxy")
-- This ensures the resource works on ANY vRP server out of the box.
local _Proxy
if Proxy then
    -- Standard vRP: Proxy is already set as a global by @vrp/lib/utils.lua
    _Proxy = Proxy
elseif module then
    -- Module-based vRP (Delix, dunko, etc.): load Proxy through the module system
    local ok, result = pcall(module, "lib/Proxy")
    if ok and result then
        _Proxy = result
    end
end

if not _Proxy then
    print("^1[Evora_hitman] FATAL: Could not find vRP Proxy.^7")
    print("^1[Evora_hitman] Make sure '@vrp/lib/utils.lua' is in shared_scripts of fxmanifest.lua^7")
    print("^1[Evora_hitman] and that the 'vrp' resource is started BEFORE Evora_hitman.^7")
    return -- stop loading the rest of the file
end

vRP = _Proxy.getInterface("vRP")

-- ─── OPTIONAL vRP EXTRAS (Config-gated) ──────────────────
-- vRP.notify / vRP.getHealth are missing on some vRP builds and
-- produce "proxy call ... not found" spam. These wrappers skip
-- the proxy call entirely when disabled in config.
local function safeNotify(user_id, msg)
    if Config.UseVrpNotifications then
        vRPcall(vRP.notify, user_id, msg)
    end
end

local function safeGetHealth(user_id)
    if not Config.UseVrpGetHealth then return nil end
    return vRPcall(vRP.getHealth, user_id)
end

-- ─── UNIVERSAL vRP CALL WRAPPER ──────────────────────────
-- In vRP, Proxy calls from external resources pass function parameters
-- packaged in a single table: vRP.funcName({arg1, arg2})
local function vRPcall(fn, ...)
    if not fn then return nil end
    local args = {...}
    -- 1. Try table-wrapped call (vRP Proxy standard)
    local ok, res1, res2 = pcall(fn, args)
    if ok then
        return res1, res2
    end
    -- 2. Fallback to positional call (if vRP table is directly accessible)
    local ok2, r1, r2 = pcall(fn, table.unpack(args))
    if ok2 then
        return r1, r2
    end
    return nil
end

local sessionRejections = {} -- user_id -> { contractId -> true }

-- ─── UTILITY ─────────────────────────────────────────────
local function debugLog(msg)
    if Config.Debug then
        print("^3[Evora_hitman/Server] ^7" .. tostring(msg))
    end
end

local function getTimestamp()
    return os.time()
end

-- ─── PLAYER IDENTIFICATION (vRP) ──────────────────────────
local function getUserId(source)
    local uid = vRPcall(vRP.getUserId, source)
    if not uid or uid == false then return nil end
    return uid
end

local function getUserSource(user_id)
    local src = vRPcall(vRP.getUserSource, user_id)
    if not src or src == false then return nil end
    return src
end

-- ─── HITMAN ACCESS CHECK ─────────────────────────────────
-- Grants access if EITHER:
--   1) the player's identifier is in Config.HitmanIdentifiers (manual whitelist), OR
local function isHitman(source)
    if not source or source == 0 then return false end

    -- 1) vRP group permission check
    if Config.HitmanPermission and Config.HitmanPermission ~= "" then
        local user_id = getUserId(source)
        if user_id then
            local has = vRPcall(vRP.hasPermission, user_id, Config.HitmanPermission)
            if has == true then return true end
        end
    end

    -- 2) Manual Whitelist Identifiers check (optional fallback)
    local ids = GetPlayerIdentifiers(source)
    if ids and Config.HitmanIdentifiers and #Config.HitmanIdentifiers > 0 then
        for _, id in ipairs(ids) do
            for _, hitmanId in ipairs(Config.HitmanIdentifiers) do
                if id == hitmanId then return true end
            end
        end
    end

    return false
end

-- ─── MONEY SYSTEM (real vRP wallet) ──────────────────────
-- All payments go through the player's ACTUAL vRP wallet, so money
-- visibly leaves/enters the normal cash balance shown in-game.
-- The internal hitman_wallets table is kept ONLY as a last-resort
-- fallback for exotic vRP builds that don't expose the wallet API.

local warnedWalletFallback = false
local function warnWalletFallback()
    if not warnedWalletFallback then
        warnedWalletFallback = true
        print("^1[Evora_hitman] =============================================^7")
        print("^1[Evora_hitman] WARNING: vRP wallet API not reachable (tryPayment/getMoney).^7")
        print("^1[Evora_hitman] Falling back to the INTERNAL hitman_wallets table.^7")
        print("^1[Evora_hitman] This money is FAKE and separate from your server economy!^7")
        print("^1[Evora_hitman] =============================================^7")
    end
end

local function dbTakeMoney(userId, amount, cb)
    MySQL.Async.fetchAll(
        "SELECT balance FROM hitman_wallets WHERE user_id = @uid",
        { ['@uid'] = userId },
        function(rows)
            local balance = (rows and #rows > 0) and (tonumber(rows[1].balance) or 0) or Config.StartingBalance
            if balance < amount then
                cb(false)
                return
            end
            MySQL.Async.execute(
                "UPDATE hitman_wallets SET balance = balance - @amt WHERE user_id = @uid AND balance >= @amt",
                { ['@uid'] = userId, ['@amt'] = amount },
                function(affected)
                    cb(affected and affected > 0)
                end
            )
        end
    )
end

local function dbGiveMoney(userId, amount)
    MySQL.Async.execute(
        "INSERT INTO hitman_wallets (user_id, balance) VALUES (@uid, @amt) ON DUPLICATE KEY UPDATE balance = balance + @amt",
        { ['@uid'] = userId, ['@amt'] = amount }
    )
end

local function takeMoney(userId, amount, cb)
    -- Preferred: deduct from the REAL vRP wallet (cash first, then bank).
    local ok = vRPcall(vRP.tryPayment, userId, amount)
    if ok == nil then
        ok = vRPcall(vRP.tryFullPayment, userId, amount)
    end
    if ok ~= nil then
        cb(ok == true)
        return
    end
    -- Fallback: internal wallet table
    warnWalletFallback()
    dbTakeMoney(userId, amount, cb)
end

local function giveMoney(userId, amount)
    -- Verify the real vRP wallet responds before trusting giveMoney;
    -- this prevents silently losing the payout on broken forks.
    local before = tonumber(vRPcall(vRP.getMoney, userId))
    if type(before) == "number" then
        vRPcall(vRP.giveMoney, userId, amount)
        local after = tonumber(vRPcall(vRP.getMoney, userId))
        if type(after) == "number" and after >= before + amount then
            return -- credited to the real vRP wallet
        end
    end
    -- Fallback: internal wallet table
    warnWalletFallback()
    dbGiveMoney(userId, amount)
end

-- ─── COOLDOWN TRACKING ───────────────────────────────────
local contractCooldowns  = {}
local targetCooldowns    = {}

local function isOnCooldown(userId)
    local cd = contractCooldowns[tostring(userId)]
    if not cd then return false end
    return (getTimestamp() - cd) < Config.ContractCooldown
end

local function getCooldownRemaining(userId)
    local cd = contractCooldowns[tostring(userId)]
    if not cd then return 0 end
    return math.max(0, Config.ContractCooldown - (getTimestamp() - cd))
end

local function setContractCooldown(userId)
    contractCooldowns[tostring(userId)] = getTimestamp()
end

local function isTargetOnCooldown(userId, targetId)
    local key = tostring(userId) .. "-" .. tostring(targetId)
    local cd  = targetCooldowns[key]
    if not cd then return false end
    return (getTimestamp() - cd) < Config.SameTargetCooldown
end

local function setTargetCooldown(userId, targetId)
    local key = tostring(userId) .. "-" .. tostring(targetId)
    targetCooldowns[key] = getTimestamp()
end

-- ─── RANK HELPER ─────────────────────────────────────────
local function getRank(kills)
    local rank = Config.Ranks[1]
    for _, r in ipairs(Config.Ranks) do
        if kills >= r.minKills then
            rank = r
        end
    end
    return rank
end

-- ─── DATABASE SETUP ──────────────────────────────────────
-- Requires oxmysql (declared as a hard dependency in fxmanifest).
Citizen.CreateThread(function()
    local waited = 0
    while (not MySQL or not MySQL.Sync or not MySQL.Sync.execute) and waited < 30000 do
        Citizen.Wait(250)
        waited = waited + 250
    end

    if not MySQL or not MySQL.Sync or not MySQL.Sync.execute then
        print("^1[Evora_hitman]^7 ERROR: oxmysql not found after 30s. Install & start oxmysql before this resource.")
        return
    end

    MySQL.Sync.execute([[
        CREATE TABLE IF NOT EXISTS hitman_contracts (
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
        )
    ]], {})

    MySQL.Sync.execute([[
        CREATE TABLE IF NOT EXISTS hitman_stats (
            user_id        INT PRIMARY KEY,
            kills          INT DEFAULT 0,
            earnings       BIGINT DEFAULT 0,
            missions_taken INT DEFAULT 0,
            missions_failed INT DEFAULT 0,
            updated_at     BIGINT DEFAULT 0
        )
    ]], {})

    MySQL.Sync.execute([[
        CREATE TABLE IF NOT EXISTS hitman_blacklist (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            user_id    INT NOT NULL UNIQUE,
            reason     TEXT,
            added_at   BIGINT NOT NULL
        )
    ]], {})

    MySQL.Sync.execute([[
        CREATE TABLE IF NOT EXISTS hitman_wallets (
            user_id  INT PRIMARY KEY,
            balance  BIGINT DEFAULT 0
        )
    ]], {})

    MySQL.Sync.execute([[
        CREATE TABLE IF NOT EXISTS hitman_contract_messages (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            contract_id INT NOT NULL,
            sender_uid  INT NOT NULL,
            sender_role VARCHAR(10) NOT NULL,
            message     TEXT NOT NULL,
            created_at  BIGINT NOT NULL,
            INDEX idx_cmsg_contract (contract_id)
        )
    ]], {})

    debugLog("Database tables initialized.")
end)

-- ─── AUTOMATIC CONTRACT EXPIRATION & CLEANUP THREAD ───────
local completeContractForHitman -- forward declaration (defined below)

Citizen.CreateThread(function()
    while true do
        Citizen.Wait(60000) -- Runs every 60 seconds
        local now = getTimestamp()

        -- 1. Automatically expire open contracts past their expiration date
        MySQL.Async.execute([[
            UPDATE hitman_contracts
            SET status = 'expired'
            WHERE status = 'open' AND expires_at <= @now
        ]], { ['@now'] = now })

        -- 2. Automatically fail active missions exceeding MissionTimeLimit
        if Config.MissionTimeLimit and Config.MissionTimeLimit > 0 then
            local timeLimitSecs = Config.MissionTimeLimit
            MySQL.Async.fetchAll([[
                SELECT id, hitman_id FROM hitman_contracts
                WHERE status = 'active' AND accepted_at IS NOT NULL AND (accepted_at + @limit) <= @now
            ]], { ['@limit'] = timeLimitSecs, ['@now'] = now }, function(timedOutMissions)
                if timedOutMissions then
                    for _, mission in ipairs(timedOutMissions) do
                        MySQL.Async.execute([[
                            UPDATE hitman_contracts
                            SET status = 'failed'
                            WHERE id = @cid AND status = 'active'
                        ]], { ['@cid'] = mission.id })

                        if mission.hitman_id then
                            local hitmanSrc = getUserSource(mission.hitman_id)
                            if hitmanSrc then
                                TriggerClientEvent('hitman:client:missionFailed', hitmanSrc, "انتهت المهلة الزمنية المحددة للمهمة.")
                                TriggerClientEvent('hitman:client:stopTracking', hitmanSrc)
                                -- Native vRP notification (visible even when the panel is closed)
                                safeNotify(mission.hitman_id, "~r~⏱~s~ انتهت المهلة الزمنية للمهمة وفشلت.")
                            end
                            MySQL.Async.execute([[
                                INSERT INTO hitman_stats (user_id, missions_failed, updated_at)
                                VALUES (@uid, 1, @ts)
                                ON DUPLICATE KEY UPDATE missions_failed = missions_failed + 1, updated_at = @ts
                            ]], { ['@uid'] = mission.hitman_id, ['@ts'] = now })
                        end
                    end
                end
            end)
        end

        -- 3. Automatically check target health / coma on server side for active contracts
        MySQL.Async.fetchAll([[
            SELECT * FROM hitman_contracts WHERE status = 'active'
        ]], {}, function(activeContracts)
            if activeContracts then
                for _, contract in ipairs(activeContracts) do
                    local targetUserId = contract.target_id
                    local hitmanUserId = contract.hitman_id

                    if targetUserId and hitmanUserId then
                        local targetSrc = getUserSource(targetUserId)
                        if targetSrc then
                            local targetHealth = safeGetHealth(targetUserId)
                            local ped = GetPlayerPed(targetSrc)
                            local pedHealth = (ped and ped ~= 0) and GetEntityHealth(ped) or 200

                            if (targetHealth and targetHealth <= 105) or (pedHealth <= 105) then
                                completeContractForHitman(contract, hitmanUserId, "target health <= 105 on server tick")
                            end
                        end
                    end
                end
            end
        end)
    end
end)

-- ─── BLACKLIST CHECK ─────────────────────────────────────
local function isBlacklisted(userId, cb)
    MySQL.Async.fetchScalar(
        "SELECT COUNT(*) FROM hitman_blacklist WHERE user_id = @uid",
        { ['@uid'] = userId },
        function(count)
            cb(count and count > 0)
        end
    )
end

-- ─── GET OR CREATE STATS ─────────────────────────────────
local function getStats(userId, cb)
    MySQL.Async.fetchAll(
        "SELECT * FROM hitman_stats WHERE user_id = @uid",
        { ['@uid'] = userId },
        function(rows)
            if rows and #rows > 0 then
                cb(rows[1])
            else
                MySQL.Async.execute(
                    "INSERT IGNORE INTO hitman_stats (user_id, updated_at) VALUES (@uid, @ts)",
                    { ['@uid'] = userId, ['@ts'] = getTimestamp() },
                    function()
                        cb({ user_id = userId, kills = 0, earnings = 0, missions_taken = 0, missions_failed = 0 })
                    end
                )
            end
        end
    )
end

local function updateStats(userId, kills, earnings)
    MySQL.Async.execute([[
        INSERT INTO hitman_stats (user_id, kills, earnings, missions_taken, updated_at)
        VALUES (@uid, @k, @e, 1, @ts)
        ON DUPLICATE KEY UPDATE
          kills = kills + @k,
          earnings = earnings + @e,
          missions_taken = missions_taken + 1,
          updated_at = @ts
    ]], {
        ['@uid'] = userId,
        ['@k']   = kills,
        ['@e']   = earnings,
        ['@ts']  = getTimestamp()
    })
end

local function getOnlinePlayers()
    local list = {}
    for _, pidStr in ipairs(GetPlayers()) do
        local pid = tonumber(pidStr)
        if pid then
            local uid  = getUserId(pid)
            local name = GetPlayerName(pid) or ("Player " .. pid)
            table.insert(list, {
                serverId = pid,
                userId   = uid,
                name     = name
            })
        end
    end
    return list
end

-- Cached online-hitman list: isHitman() does a vRP permission proxy call per
-- player, which used to run on EVERY contract creation. Cache it briefly.
local hitmenCache, hitmenCacheTs = nil, 0
local function getOnlineHitmen()
    local now = getTimestamp()
    if hitmenCache and (now - hitmenCacheTs) < 15 then
        return hitmenCache
    end
    local list = {}
    for _, pidStr in ipairs(GetPlayers()) do
        local pid = tonumber(pidStr)
        if pid and isHitman(pid) then
            list[#list + 1] = pid
        end
    end
    hitmenCache, hitmenCacheTs = list, now
    return list
end

-- ─── CIVILIAN: OPEN UI ───────────────────────────────────
local function openCivilianUIFor(source)
    local user_id = getUserId(source)
    if not user_id then return end

    vRPcall(vRP.closeMenu, source)

    isBlacklisted(user_id, function(bl)
        if bl then
            TriggerClientEvent('hitman:client:contractResult', source, false,
                "لقد تم وضعك في القائمة السوداء لنظام الاغتيال.")
            return
        end

        local cooldownLeft = getCooldownRemaining(user_id)
        TriggerClientEvent('hitman:civilian:openUI', source, {
            minPrice         = Config.MinContractPrice,
            maxPrice         = Config.MaxContractPrice,
            cooldown         = cooldownLeft,
            fee              = Config.ServiceFee,
            anonymityFee     = Config.AnonymityFee,
            anonymityEnabled = Config.AnonymityEnabled,
            priorities       = Config.Priorities,
            uiBackground     = Config.UIBackground,
            uiBackgroundDim  = Config.UIBackgroundDim,
            onlinePlayers    = getOnlinePlayers()
        })
    end)
end

RegisterNetEvent('hitman:civilian:requestOpen')
AddEventHandler('hitman:civilian:requestOpen', function(clientId)
    openCivilianUIFor(source)
end)

-- ─── CREATE CONTRACT ─────────────────────────────────────
local creatingContractLock = {}
local hitmanAcceptTimes    = {} -- user_id -> last successful accept timestamp

RegisterNetEvent('hitman:server:createContract')
AddEventHandler('hitman:server:createContract', function(data)
    local source    = source
    local user_id   = getUserId(source)
    if not user_id then return end

    -- Instant lock check to prevent rapid duplicate event triggers
    local nowTs = getTimestamp()
    if creatingContractLock[user_id] and (nowTs - creatingContractLock[user_id]) < 3 then
        return
    end
    creatingContractLock[user_id] = nowTs

    local targetServerId = data.targetId
    local price          = tonumber(data.price) or 0
    local notes          = data.notes or ""
    local anonymous      = data.anonymous or false
    local priority       = data.priority or "normal"

    -- Cooldown check
    if isOnCooldown(user_id) then
        creatingContractLock[user_id] = nil
        local rem = getCooldownRemaining(user_id)
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "فترة الانتظار نشطة. يرجى الانتظار " .. math.ceil(rem/60) .. " دقيقة إضافية.")
        return
    end

    -- Price check
    if price < Config.MinContractPrice then
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "الحد الأدنى لسعر العقد هو $" .. Config.MinContractPrice)
        return
    end
    if price > Config.MaxContractPrice then
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "الحد الأقصى لسعر العقد هو $" .. Config.MaxContractPrice)
        return
    end

    -- Self-target check happens AFTER the target is resolved (below)

    -- Resolve inputTargetId (could be a vRP User ID or FiveM Server ID)
    local inputTargetId = tonumber(data.targetId)
    if not inputTargetId then return end

    local targetServerId = nil
    local targetUserId   = nil

    -- 1. Try if inputTargetId is a vRP User ID
    local src = getUserSource(inputTargetId)
    if src and GetPlayerName(src) then
        targetUserId = inputTargetId
        targetServerId = src
    else
        -- 2. Try if inputTargetId is a FiveM Server ID
        local name = GetPlayerName(inputTargetId)
        if name and name ~= "" then
            targetServerId = inputTargetId
            targetUserId = getUserId(targetServerId)
        end
    end

    if not targetUserId or not targetServerId then
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "لم يتم العثور على هوية للهدف أو اللاعب غير متصل.")
        return
    end

    -- Self-target check (blocks the contract-on-self money loop)
    if tonumber(targetUserId) == tonumber(user_id) then
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "لا يمكنك وضع عقد على نفسك.")
        return
    end

    -- Same-target cooldown
    if isTargetOnCooldown(user_id, targetUserId) then
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "لقد وضعت عقداً على هذا اللاعب مؤخراً. يرجى الانتظار.")
        return
    end

    -- Max contracts on same target limit check
    MySQL.Async.fetchScalar([[
        SELECT COUNT(*) FROM hitman_contracts
        WHERE target_id = @tid AND status IN ('open', 'active')
    ]], { ['@tid'] = targetUserId }, function(targetContractsCount)
        if targetContractsCount and targetContractsCount >= (Config.MaxContractsOnSameTarget or 3) then
            TriggerClientEvent('hitman:client:contractResult', source, false,
                "تم الوصول للحد الأقصى للعقود المسموح بوضعها على هذا الشخص حالياً (" .. Config.MaxContractsOnSameTarget .. ").")
            return
        end

        -- Check target blacklist
        isBlacklisted(targetUserId, function(blTarget)
            if blTarget then
                TriggerClientEvent('hitman:client:contractResult', source, false,
                    "لا يمكن استهداف هذا اللاعب.")
                return
            end

            -- Calculate total cost
            local totalCost = price
            if anonymous then
                totalCost = totalCost + Config.AnonymityFee
            end
            local fee    = math.floor(totalCost * Config.ServiceFee)
            local reward = totalCost - fee

            -- Deduct money
            takeMoney(user_id, totalCost, function(success)
                if not success then
                    TriggerClientEvent('hitman:client:contractResult', source, false,
                        "رصيد غير كافٍ. تحتاج إلى $" .. totalCost)
                    return
                end

                -- Get priority multiplier
                local multiplier = 1.0
                for _, p in ipairs(Config.Priorities) do
                    if p.id == priority then
                        multiplier = p.multiplier
                        break
                    end
                end
                reward = math.floor(reward * multiplier)

                local now     = getTimestamp()
                local expires = now + (Config.ContractExpireHours * 3600)

                MySQL.Async.execute([[
                    INSERT INTO hitman_contracts
                    (requester_id, target_id, price, notes, priority, anonymous, status, created_at, expires_at)
                    VALUES (@rid, @tid, @price, @notes, @priority, @anon, 'open', @now, @exp)
                ]], {
                    -- Keep the real requester id even for anonymous contracts:
                    -- ownership (my-contracts/chat) + refunds depend on it.
                    -- The `anonymous` flag alone hides identity from hitmen.
                    ['@rid']      = user_id,
                    ['@tid']      = targetUserId,
                    ['@price']    = reward,
                    ['@notes']    = notes,
                    ['@priority'] = priority,
                    ['@anon']     = anonymous and 1 or 0,
                    ['@now']      = now,
                    ['@exp']      = expires
                }, function()
                    setContractCooldown(user_id)
                    setTargetCooldown(user_id, targetUserId)

                    TriggerClientEvent('hitman:client:contractResult', source, true,
                        "تم نشر العقد بنجاح! تم خصم $" .. totalCost .. " من رصيدك.")

                    -- ─── ALERT ALL ONLINE HITMEN ABOUT THE NEW CONTRACT ───
                    for _, pid in ipairs(getOnlineHitmen()) do
                        local hUid = getUserId(pid)
                        TriggerClientEvent('hitman:client:newContractNotify', pid, {
                            reward   = reward,
                            priority = priority
                        })
                        safeNotify(hUid,
                            "~y~📋~s~ عقد جديد متاح بمكافأة ~g~$" .. reward .. "~s~!")
                    end

                    debugLog("Contract created by user " .. user_id ..
                        " targeting user " .. targetUserId .. " for $" .. reward)

                end)
            end)
        end)
    end)
end)

-- ─── UNIFIED HITMAN DATA FETCH ────────────────────────────
local function fetchHitmanPayload(user_id, callback)
    local now = getTimestamp()

    -- 1. Ensure expired contracts are updated in database first
    MySQL.Async.execute([[
        UPDATE hitman_contracts
        SET status = 'expired'
        WHERE status = 'open' AND expires_at <= @now
    ]], { ['@now'] = now }, function()

        -- 2. Fetch valid open contracts
        MySQL.Async.fetchAll([[
            SELECT * FROM hitman_contracts
            WHERE status = 'open' AND expires_at > @now
            ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, price DESC
        ]], { ['@now'] = now }, function(contracts)
            contracts = contracts or {}
            local finalContracts = {}
            for _, c in ipairs(contracts) do
                if not (sessionRejections[user_id] and sessionRejections[user_id][c.id]) then
                    table.insert(finalContracts, c)
                end
            end

            -- 3. Fetch active missions for hitman
            MySQL.Async.fetchAll([[
                SELECT * FROM hitman_contracts WHERE status = 'active' AND hitman_id = @hid
            ]], { ['@hid'] = user_id }, function(activeMissions)
                activeMissions = activeMissions or {}

                -- 4. Fetch completed missions
                MySQL.Async.fetchAll([[
                    SELECT * FROM hitman_contracts
                    WHERE status = 'completed' AND hitman_id = @hid
                    ORDER BY completed_at DESC LIMIT 20
                ]], { ['@hid'] = user_id }, function(completedMissions)
                    completedMissions = completedMissions or {}

                    -- 5. Fetch stats and rank
                    getStats(user_id, function(stats)
                        local rank      = getRank(stats.kills)
                        stats.rank      = rank.name
                        stats.rankColor = rank.color
                        stats.rankBonus = rank.bonus

                        callback({
                            contracts         = finalContracts,
                            activeMissions    = activeMissions,
                            completedMissions = completedMissions,
                            stats             = stats,
                            ranks             = Config.Ranks,
                            uiBackground      = Config.UIBackground,
                            uiBackgroundDim   = Config.UIBackgroundDim
                        })
                    end)
                end)
            end)
        end)
    end)
end

-- ─── HITMAN: OPEN PANEL ──────────────────────────────────
local function openHitmanPanelFor(source)
    local user_id = getUserId(source)
    if not user_id then return end

    vRPcall(vRP.closeMenu, source)

    if not isHitman(source) then
        TriggerClientEvent('hitman:client:contractResult', source, false,
            "أنت لست قاتلاً مأجوراً مرخصاً.")
        return
    end

    fetchHitmanPayload(user_id, function(payload)
        TriggerClientEvent('hitman:hitman:openUI', source, payload)
    end)
end

RegisterNetEvent('hitman:hitman:requestOpen')
AddEventHandler('hitman:hitman:requestOpen', function()
    local source = source
    openHitmanPanelFor(source)
end)

-- ─── ACCEPT CONTRACT ─────────────────────────────────────
RegisterNetEvent('hitman:server:acceptContract')
AddEventHandler('hitman:server:acceptContract', function(data)
    local source     = source
    local user_id    = getUserId(source)
    local contractId = data.contractId
    if not user_id or not contractId then return end
    if not isHitman(source) then return end

    -- Cooldown between accepting missions (Config.HitmanAcceptCooldown)
    local nowTs      = getTimestamp()
    local lastAccept = hitmanAcceptTimes[user_id]
    if Config.HitmanAcceptCooldown and Config.HitmanAcceptCooldown > 0 and
       lastAccept and (nowTs - lastAccept) < Config.HitmanAcceptCooldown then
        TriggerClientEvent('hitman:client:acceptResult', source, false,
            "انتظر " .. (Config.HitmanAcceptCooldown - (nowTs - lastAccept)) .. " ثانية قبل قبول مهمة أخرى.")
        return
    end

    MySQL.Async.fetchScalar([[
        SELECT COUNT(*) FROM hitman_contracts WHERE hitman_id = @hid AND status = 'active'
    ]], { ['@hid'] = user_id }, function(activeCount)
        if activeCount and activeCount >= Config.MaxActiveContracts then
            TriggerClientEvent('hitman:client:acceptResult', source, false,
                "لقد وصلت إلى الحد الأقصى من المهام النشطة (" .. Config.MaxActiveContracts .. ")")
            return
        end

        MySQL.Async.execute([[
            UPDATE hitman_contracts
            SET status = 'active', hitman_id = @hid, accepted_at = @now
            WHERE id = @cid AND status = 'open' AND expires_at > @now
        ]], {
            ['@hid'] = user_id,
            ['@cid'] = contractId,
            ['@now'] = getTimestamp()
        }, function(affected)
            if not affected or affected == 0 then
                TriggerClientEvent('hitman:client:acceptResult', source, false,
                    "العقد لم يعد متاحاً.")
                return
            end

            hitmanAcceptTimes[user_id] = getTimestamp()

            MySQL.Async.fetchAll(
                "SELECT * FROM hitman_contracts WHERE id = @cid",
                { ['@cid'] = contractId },
                function(rows)
                    if not rows or #rows == 0 then return end
                    local contract = rows[1]

                    -- Find target's online source via rayy_ids
                    local targetSource = getUserSource(contract.target_id)

                    if targetSource then
                        TriggerClientEvent('hitman:client:targetWarning', targetSource)
                        TriggerClientEvent('hitman:client:startTracking', source, targetSource)
                        -- Native vRP warning for the target (visible even when the panel is closed)
                        safeNotify(contract.target_id,
                            "~r~⚠~s~ " .. (Config.TargetWarningMessage or "تم التعاقد مع قاتل مأجور لتصفيتك."))
                    end

                    -- Notify requester
                    if contract.anonymous == 0 and contract.requester_id ~= 0 then
                        local reqSource = getUserSource(contract.requester_id)
                        if reqSource then
                            TriggerClientEvent('hitman:client:contractAcceptedNotify', reqSource)
                        end
                        safeNotify(contract.requester_id, "~b~📋~s~ تم قبول عقدك من قبل قاتل مأجور.")
                    end

                    TriggerClientEvent('hitman:client:acceptResult', source, true,
                        "تم قبول المهمة! تم تتبع الهدف على خريطتك.", {
                            contractId = contractId,
                            targetId   = targetSource
                        })

                    debugLog("Contract " .. contractId .. " accepted by hitman " .. user_id)
                end
            )
        end)
    end)
end)

-- ─── REJECT CONTRACT ─────────────────────────────────────
RegisterNetEvent('hitman:server:rejectContract')
AddEventHandler('hitman:server:rejectContract', function(data)
    local source  = source
    local user_id = getUserId(source)
    local cid     = tonumber(data.contractId)
    if not user_id or not cid then return end
    if not isHitman(source) then return end -- only licensed hitmen can reject contracts

    MySQL.Async.fetchAll([[
        SELECT requester_id, price, anonymous, status 
        FROM hitman_contracts 
        WHERE id = @id
    ]], { ['@id'] = cid }, function(rows)
        if rows and #rows > 0 then
            local contract = rows[1]
            if contract.status == 'open' then
                -- Update status to cancelled
                MySQL.Async.execute("UPDATE hitman_contracts SET status = 'cancelled' WHERE id = @id", { ['@id'] = cid })

                -- Calculate refund (price + anonymity fee if applicable)
                local refundAmount = contract.price
                if contract.anonymous == 1 or contract.anonymous == true then
                    refundAmount = refundAmount + (Config.AnonymityFee or 0)
                end

                -- Refund requester
                if contract.requester_id then
                    giveMoney(contract.requester_id, refundAmount)
                    local requesterSrc = getUserSource(contract.requester_id)
                    if requesterSrc then
                        TriggerClientEvent('hitman:client:notify', requesterSrc, "تم رفض عقدك وإرجاع $" .. refundAmount .. " إلى رصيدك.")
                    end
                    safeNotify(contract.requester_id, "~y~↩~s~ تم رفض عقدك وإرجاع $" .. refundAmount .. " إلى رصيدك.")
                end

                TriggerClientEvent('hitman:client:notify', source, "تم إلغاء العقد بالكامل بنجاح.")
                debugLog("Contract " .. cid .. " was cancelled by Hitman " .. user_id)
            else
                TriggerClientEvent('hitman:client:notify', source, "هذا العقد لم يعد متاحاً للإلغاء.")
            end
        end
    end)
end)

-- ─── ABANDON MISSION ─────────────────────────────────────
RegisterNetEvent('hitman:server:abandonMission')
AddEventHandler('hitman:server:abandonMission', function(data)
    local source     = source
    local user_id    = getUserId(source)
    local contractId = data.contractId
    if not user_id or not contractId then return end

    MySQL.Async.execute([[
        UPDATE hitman_contracts
        SET status = 'failed', accepted_at = @ts
        WHERE id = @cid AND hitman_id = @hid AND status = 'active'
    ]], {
        ['@cid'] = contractId,
        ['@hid'] = user_id,
        ['@ts']  = getTimestamp()
    }, function(affected)
        if affected and affected > 0 then
            MySQL.Async.execute([[
                INSERT INTO hitman_stats (user_id, missions_failed, updated_at)
                VALUES (@uid, 1, @ts)
                ON DUPLICATE KEY UPDATE missions_failed = missions_failed + 1, updated_at = @ts
            ]], { ['@uid'] = user_id, ['@ts'] = getTimestamp() })

            TriggerClientEvent('hitman:client:stopTracking', source)
            TriggerClientEvent('hitman:client:missionFailed', source, "تم إلغاء المهمة.")
            safeNotify(user_id, "~r~✖~s~ تم إلغاء المهمة.")
        end
    end)
end)

-- ─── KILL & DEATH COMPLETION LOGIC ───────────────────────
local deathProcessed = {}

function completeContractForHitman(contract, hitmanUserId, reasonMsg)
    if not contract or not hitmanUserId then return end

    -- ATOMIC CLAIM: flip the row from 'active' to 'completed' first.
    -- Only the caller whose UPDATE affects a row gets to pay out —
    -- this makes double/triple payouts from racing death events impossible.
    local claimTs = getTimestamp()
    MySQL.Async.execute([[
        UPDATE hitman_contracts
        SET status = 'completed', completed_at = @now
        WHERE id = @cid AND status = 'active'
    ]], { ['@now'] = claimTs, ['@cid'] = contract.id }, function(claimed)
        if not claimed or claimed == 0 then return end -- someone else already completed it

        local baseReward = contract.price or 0
        getStats(hitmanUserId, function(stats)
            local rank          = getRank(stats.kills)
            local rankBonus     = rank.bonus
            local fastBonus     = 0.0
            local now           = getTimestamp()
            local elapsedMins   = (now - (contract.accepted_at or now)) / 60

            if Config.FastCompletionBonus.enabled and
               elapsedMins <= Config.FastCompletionBonus.minutes then
                fastBonus = Config.FastCompletionBonus.bonus
            end

            local totalMultiplier = 1.0 + rankBonus + fastBonus
            local finalReward     = math.floor(baseReward * totalMultiplier)

            -- Pay hitman
            giveMoney(hitmanUserId, finalReward)

            -- Update hitman stats
            updateStats(hitmanUserId, 1, finalReward)

            local hitmanSource = getUserSource(hitmanUserId)
            if hitmanSource then
                TriggerClientEvent('hitman:client:stopTracking', hitmanSource)
                TriggerClientEvent('hitman:client:missionComplete', hitmanSource, finalReward,
                    Config.HitCompleteMessage or "تم إكمال العقد بنجاح!")
            end

            -- Native vRP notification so the payout is visible outside the NUI panel
            safeNotify(hitmanUserId, "~g~+$" .. finalReward .. "~s~ تم استلام مبلغ العقد")

            -- ─── ALERT THE HIT CALLER (contract requester) ───
            if contract.anonymous == 0 and contract.requester_id and contract.requester_id ~= 0 then
                local reqSource = getUserSource(contract.requester_id)
                if reqSource then
                    TriggerClientEvent('hitman:client:contractDoneNotify', reqSource, finalReward)
                    -- Native vRP notification so the alert is visible even with the UI closed
                    safeNotify(contract.requester_id,
                        "~g~✔~s~ تمت تصفية الهدف وإتمام العقد الذي طلبتـه بنجاح.")
                end
            end

            debugLog("Contract " .. contract.id .. " completed (" .. (reasonMsg or "target died") .. "). Hitman " ..
                hitmanUserId .. " earned $" .. finalReward)
        end)
    end)
end

-- Resolve the real killer SERVER-SIDE so a hacked client cannot fake
-- "the hitman killed me" to force payouts. Fail-closed: unknown killer = nil.
local function getKillerServerId(victimServerId)
    local victimPed = GetPlayerPed(victimServerId)
    if not victimPed or victimPed == 0 or not DoesEntityExist(victimPed) then return nil end

    local killerPed = GetPedSourceOfDeath(victimPed)
    if killerPed and killerPed ~= 0 and DoesEntityExist(killerPed) and IsPedAPlayer(killerPed) then
        -- SERVER-SIDE: NetworkGetEntityOwner already returns the owner's
        -- SERVER ID (there is no GetPlayerServerId native on the server).
        local owner = NetworkGetEntityOwner(killerPed)
        if owner and owner > 0 and GetPlayerName(owner) then
            return owner
        end
    end
    return nil
end

RegisterNetEvent('hitman:server:onPlayerDeath')
AddEventHandler('hitman:server:onPlayerDeath', function(data)
    local victimServerId = data and data.victimServerId or source
    if not victimServerId then return end
    -- NOTE: client-supplied data.attackerServerId is deliberately IGNORED.

    local targetUserId = getUserId(victimServerId)
    if not targetUserId then return end

    if deathProcessed[targetUserId] and (getTimestamp() - deathProcessed[targetUserId]) < 5 then
        return
    end

    MySQL.Async.fetchAll([[
        SELECT * FROM hitman_contracts
        WHERE target_id = @tid AND status = 'active'
    ]], { ['@tid'] = targetUserId }, function(rows)
        if not rows or #rows == 0 then return end

        deathProcessed[targetUserId] = getTimestamp()

        -- Killer is verified server-side once per death event.
        local killerServerId  = getKillerServerId(victimServerId)

        for _, contract in ipairs(rows) do
            local hitmanUserId = contract.hitman_id
            if hitmanUserId then
                local hitmanServerId = getUserSource(hitmanUserId)
                local killedByHitman = (killerServerId and hitmanServerId and tonumber(killerServerId) == tonumber(hitmanServerId))

                -- Complete if killed by hitman OR if Config.CompleteOnAnyTargetDeath is enabled
                if killedByHitman or Config.CompleteOnAnyTargetDeath then
                    completeContractForHitman(contract, hitmanUserId, killedByHitman and "killed by hitman (verified)" or "target died (any cause)")
                end
            end
        end
    end)
end)

-- NOTE: the old 'hitman:server:reportKill' endpoint was REMOVED for security:
-- it was never called by the legit client and let any hitman instantly
-- complete an active contract (and get paid) without actually killing the target.
-- Completion is now only driven by verified death events + the server health tick.

-- ─── HITMAN DIED ─────────────────────────────────────────
RegisterNetEvent('hitman:server:hitmanDied')
AddEventHandler('hitman:server:hitmanDied', function()
    local source       = source
    local hitmanUserId = getUserId(source)
    if not hitmanUserId then return end
    if not Config.FailOnHitmanDeath then return end

    MySQL.Async.execute([[
        UPDATE hitman_contracts
        SET status = 'open', hitman_id = NULL, accepted_at = NULL
        WHERE hitman_id = @hid AND status = 'active'
    ]], { ['@hid'] = hitmanUserId }, function()
        TriggerClientEvent('hitman:client:stopTracking', source)
        local failMsg = Config.HitFailedMessage or "لقد تمت تصفيتك وفشلت مهمتك."
        TriggerClientEvent('hitman:client:missionFailed', source, failMsg)
        safeNotify(hitmanUserId, "~r~☠~s~ " .. failMsg)
    end)
end)

-- ─── TARGET COORDS REQUEST ───────────────────────────────
RegisterNetEvent('hitman:server:requestTargetCoords')
AddEventHandler('hitman:server:requestTargetCoords', function(targetServerId)
    local source = source
    local ped    = GetPlayerPed(targetServerId)
    if ped and ped ~= 0 then
        local pos = GetEntityCoords(ped)
        TriggerClientEvent('hitman:client:updateTargetCoords', source, pos.x, pos.y, pos.z)
    end
end)

-- ─── TARGET DISCONNECT HANDLER ───────────────────────────
local processedLeaves = {}

local function handlePlayerLeave(user_id)
    if not user_id then return end
    if processedLeaves[user_id] then return end
    processedLeaves[user_id] = true
    SetTimeout(5000, function() processedLeaves[user_id] = nil end)

    if Config.PauseOnTargetDisconnect then
        MySQL.Async.fetchAll([[
            SELECT hitman_id FROM hitman_contracts
            WHERE target_id = @tid AND status = 'active'
        ]], { ['@tid'] = user_id }, function(rows)
            if rows then
                for _, row in ipairs(rows) do
                    local hitmanSource = getUserSource(row.hitman_id)
                    if hitmanSource then
                        TriggerClientEvent('hitman:client:missionFailed', hitmanSource,
                            "لقد خرج الهدف من الخادم.")
                        TriggerClientEvent('hitman:client:stopTracking', hitmanSource)
                        safeNotify(row.hitman_id, "~r~🚪~s~ لقد خرج الهدف من الخادم وفشلت المهمة.")
                    end
                end
            end
        end)

        MySQL.Async.execute([[
            UPDATE hitman_contracts
            SET status = 'open', hitman_id = NULL, accepted_at = NULL
            WHERE target_id = @tid AND status = 'active'
        ]], { ['@tid'] = user_id })
    end
end

AddEventHandler('playerDropped', function(reason)
    local src = source
    local user_id = getUserId(src)
    if user_id then
        handlePlayerLeave(user_id)
    end
end)

AddEventHandler('vRP:playerLeave', function(user_id, source)
    handlePlayerLeave(user_id)
end)

AddEventHandler('rayy_ids:playerLeave', function(user_id, source)
    handlePlayerLeave(user_id)
end)

-- ─── TARGET RECONNECT HANDLER ────────────────────────────
AddEventHandler('vRP:playerSpawn', function(user_id, source, first_spawn)
    if first_spawn and user_id then
        MySQL.Async.fetchAll([[
            SELECT id, hitman_id FROM hitman_contracts
            WHERE target_id = @tid AND status = 'active'
        ]], { ['@tid'] = user_id }, function(rows)
            if rows and #rows > 0 then
                TriggerClientEvent('hitman:client:targetWarning', source)
                for _, r in ipairs(rows) do
                    if r.hitman_id then
                        local hitmanSource = getUserSource(r.hitman_id)
                        if hitmanSource then
                            TriggerClientEvent('hitman:client:startTracking', hitmanSource, source)
                        end
                    end
                end
            end
        end)
    end
end)

-- ─── REFRESH HITMAN DATA ─────────────────────────────────
RegisterNetEvent('hitman:server:getHitmanData')
AddEventHandler('hitman:server:getHitmanData', function()
    local source  = source
    local user_id = getUserId(source)
    if not user_id then return end
    if not isHitman(source) then return end

    fetchHitmanPayload(user_id, function(payload)
        TriggerClientEvent('hitman:client:updateHitmanData', source, payload)
    end)
end)

-- ─── MY CONTRACTS + CONTRACT CHAT (requester & hitman) ───
-- Contract details/chat stay available for Config.ChatHistoryHours
-- after completion, then vanish completely.

local function getChatRole(user_id, contract)
    if not contract then return nil end

    -- Vanished once 24h (Config.ChatHistoryHours) passed since completion
    if contract.status == 'completed' and contract.completed_at then
        local cutoff = getTimestamp() - ((Config.ChatHistoryHours or 24) * 3600)
        if contract.completed_at <= cutoff then return nil end
    end

    if contract.requester_id and contract.requester_id == user_id then return 'requester' end
    if contract.hitman_id and contract.hitman_id == user_id then return 'hitman' end
    return nil
end

local function buildChatSummary(contract)
    return {
        id             = contract.id,
        price          = contract.price,
        status         = contract.status,
        priority       = contract.priority,
        anonymous      = contract.anonymous,
        notes          = contract.notes,
        created_at     = contract.created_at,
        accepted_at    = contract.accepted_at,
        completed_at   = contract.completed_at,
        target_name    = "ID: " .. tostring(contract.target_id),
        requester_name = (contract.anonymous == 1)
            and "مجهول"
            or ("ID: " .. tostring(contract.requester_id))
    }
end

-- Civilian: fetch contracts HE posted (open/active always, finished ones for 24h)
RegisterNetEvent('hitman:server:requestMyContracts')
AddEventHandler('hitman:server:requestMyContracts', function()
    local source  = source
    local user_id = getUserId(source)
    if not user_id then return end

    local cutoff = getTimestamp() - ((Config.ChatHistoryHours or 24) * 3600)
    MySQL.Async.fetchAll([[
        SELECT * FROM hitman_contracts
        WHERE requester_id = @uid
          AND (status IN ('open','active') OR COALESCE(completed_at, created_at) >= @cutoff)
        ORDER BY created_at DESC
        LIMIT 50
    ]], { ['@uid'] = user_id, ['@cutoff'] = cutoff }, function(rows)
        local list = {}
        for _, r in ipairs(rows or {}) do
            local item = buildChatSummary(r)
            item.notes = nil -- keep the list light; details come from openContractChat
            table.insert(list, item)
        end
        TriggerClientEvent('hitman:client:myContracts', source, list)
    end)
end)

-- Open a contract's details + chat history (participants only)
RegisterNetEvent('hitman:server:openContractChat')
AddEventHandler('hitman:server:openContractChat', function(data)
    local source  = source
    local user_id = getUserId(source)
    local cid     = tonumber(data and data.contractId)
    if not user_id or not cid then return end

    MySQL.Async.fetchAll(
        "SELECT * FROM hitman_contracts WHERE id = @cid",
        { ['@cid'] = cid },
        function(rows)
            if not rows or #rows == 0 then
                TriggerClientEvent('hitman:client:contractChatData', source, { ok = false, error = "العقد غير موجود." })
                return
            end

            local contract = rows[1]
            local role = getChatRole(user_id, contract)
            if not role then
                TriggerClientEvent('hitman:client:contractChatData', source, { ok = false, error = "انتهت مدة توفر هذا العقد أو لا تملك صلاحية الوصول." })
                return
            end

            MySQL.Async.fetchAll([[
                SELECT * FROM hitman_contract_messages
                WHERE contract_id = @cid
                ORDER BY created_at ASC
                LIMIT 100
            ]], { ['@cid'] = cid }, function(msgs)
                TriggerClientEvent('hitman:client:contractChatData', source, {
                    ok       = true,
                    role     = role,
                    contract = buildChatSummary(contract),
                    messages = msgs or {}
                })
            end)
        end
    )
end)

-- Send a chat message on a contract (participants only)
RegisterNetEvent('hitman:server:sendChatMessage')
AddEventHandler('hitman:server:sendChatMessage', function(data)
    local source  = source
    local user_id = getUserId(source)
    local cid     = tonumber(data and data.contractId)
    local text    = tostring(data and data.message or ""):gsub("^%s+", ""):gsub("%s+$", "")
    if not user_id or not cid or text == "" then return end
    if #text > 200 then text = text:sub(1, 200) end

    MySQL.Async.fetchAll(
        "SELECT * FROM hitman_contracts WHERE id = @cid",
        { ['@cid'] = cid },
        function(rows)
            if not rows or #rows == 0 then return end
            local contract = rows[1]
            local role = getChatRole(user_id, contract)
            if not role then return end

            local nowTs = getTimestamp()
            MySQL.Async.execute([[
                INSERT INTO hitman_contract_messages (contract_id, sender_uid, sender_role, message, created_at)
                VALUES (@cid, @uid, @role, @msg, @ts)
            ]], {
                ['@cid'] = cid, ['@uid'] = user_id, ['@role'] = role,
                ['@msg'] = text, ['@ts'] = nowTs
            }, function()
                local outMsg = {
                    contract_id = cid,
                    sender_uid  = user_id,
                    sender_role = role,
                    message     = text,
                    created_at  = nowTs
                }

                -- Live delivery to both participants that are online
                local participants = {}
                if contract.requester_id and contract.requester_id ~= 0 then
                    participants[#participants + 1] = { uid = contract.requester_id, role = 'requester' }
                end
                if contract.hitman_id and contract.hitman_id ~= contract.requester_id then
                    -- Skip if same person is both requester and hitman (contract on self)
                    participants[#participants + 1] = { uid = contract.hitman_id, role = 'hitman' }
                end

                local delivered = {}
                for _, p in ipairs(participants) do
                    if not delivered[p.uid] then
                        delivered[p.uid] = true
                        local pSrc = getUserSource(p.uid)
                        if pSrc then
                            TriggerClientEvent('hitman:client:chatMessage', pSrc, {
                                contractId = cid,
                                message    = outMsg,
                                yourRole   = p.role
                            })
                        end
                    end
                end
            end)
        end
    )
end)

-- Purge chat history of contracts completed longer than ChatHistoryHours ago
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(600000) -- every 10 minutes
        local cutoff = getTimestamp() - ((Config.ChatHistoryHours or 24) * 3600)
        MySQL.Async.execute([[
            DELETE m FROM hitman_contract_messages m
            INNER JOIN hitman_contracts c ON c.id = m.contract_id
            WHERE c.completed_at IS NOT NULL AND c.completed_at <= @cutoff
        ]], { ['@cutoff'] = cutoff })
    end
end)

-- ─── MAIN MENU INTEGRATION ────────────────────────────────
-- Auto-registers Hitman System entries into the vRP main menu builder
-- (the default K-menu) on resource start. Works on any vRP server that
-- loads 'vrp' before this resource — nothing to edit in main.lua.
--
-- Compatibility: some vRP forks (Delix, dunko) expect Proxy calls with
-- arguments wrapped in a single table, while standard vRP uses positional
-- arguments. We try both conventions automatically.
if Config.RegisterInMainMenu then
    local menuNames = Config.MainMenuBuilderName
    if type(menuNames) == "string" then
        menuNames = { menuNames }
    end

    local function builder(add, data)
        local psource = data and data.player
        if not psource then return end

        local choices = {}

        if Config.CivilianMenuTitle and Config.CivilianMenuTitle ~= "" then
            choices[Config.CivilianMenuTitle] = {
                function(player)
                    openCivilianUIFor(player)
                end,
                Config.CivilianMenuDescription or ""
            }
        end

        if isHitman(psource) and Config.HitmanMenuTitle and Config.HitmanMenuTitle ~= "" then
            choices[Config.HitmanMenuTitle] = {
                function(player)
                    openHitmanPanelFor(player)
                end,
                Config.HitmanMenuDescription or ""
            }
        end

        add(choices)
    end

    if type(menuNames) == "table" then
        for _, mName in ipairs(menuNames) do
            local res = vRPcall(vRP.registerMenuBuilder, mName, builder)
            if res ~= nil then
                debugLog("Registered Evora_hitman into vRP '" .. tostring(mName) .. "' menu builder.")
            end
        end
    end
end

-- ─── ADMIN COMMANDS ──────────────────────────────────────
-- Gated through vRP permissions (Config.AdminPermission) instead of
-- FiveM ACE flags, so vRP admins work out of the box. The server
-- console (source 0) is always allowed.
local function isAdminSender(sender)
    if not sender or sender == 0 then return true end
    local uid = getUserId(sender)
    if uid and Config.AdminPermission and Config.AdminPermission ~= "" then
        return vRPcall(vRP.hasPermission, uid, Config.AdminPermission) == true
    end
    return false
end

RegisterCommand('hitman_blacklist', function(source, args, rawCommand)
    if not isAdminSender(source) then
        if source and source ~= 0 then print("[Evora_hitman] Player " .. source .. " tried /hitman_blacklist without permission.") end
        return
    end
    local targetId = tonumber(args[1])
    local reason   = args[2] or "No reason"
    if not targetId then
        print("[Evora_hitman] Usage: /hitman_blacklist <userId> [reason]")
        return
    end

    MySQL.Async.execute([[
        INSERT INTO hitman_blacklist (user_id, reason, added_at)
        VALUES (@uid, @r, @ts)
        ON DUPLICATE KEY UPDATE reason = @r, added_at = @ts
    ]], {
        ['@uid'] = targetId,
        ['@r']   = reason,
        ['@ts']  = getTimestamp()
    }, function()
        print("[Evora_hitman] User " .. targetId .. " blacklisted.")
    end)
end, false)

RegisterCommand('hitman_unblacklist', function(source, args, rawCommand)
    if not isAdminSender(source) then return end
    local targetId = tonumber(args[1])
    if not targetId then return end
    MySQL.Async.execute(
        "DELETE FROM hitman_blacklist WHERE user_id = @uid",
        { ['@uid'] = targetId },
        function()
            print("[Evora_hitman] User " .. targetId .. " removed from blacklist.")
        end
    )
end, false)

debugLog("Server script loaded.")
