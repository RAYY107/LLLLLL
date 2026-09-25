-- ============================================================
--  HITMAN SYSTEM - Client Side
--  Standalone (no vRP client dependency)
-- ============================================================

-- ─── STATE ───────────────────────────────────────────────
local isNUIOpen      = false
local nuiMode        = nil   -- "civilian" | "hitman"
local activeTracking = nil   -- { targetServerId, blip }
local playerList     = {}
local nuiLastPong    = 0     -- heartbeat timestamp (watchdog)

-- ─── UTILITY ─────────────────────────────────────────────
local function debugLog(msg)
    if Config.Debug then
        print("^3[LR_hitmansystem] ^7" .. tostring(msg))
    end
end

local function notify(msg, notifType, title)
    SendNUIMessage({
        action  = "notify",
        type    = notifType or "info",
        title   = title or (notifType == "error" and "خطأ" or "تنبيه"),
        message = msg
    })
end

-- ─── PREVIEW SYSTEM ──────────────────────────────────────
-- Ped-headshot handles for the target mugshot preview.
-- Every registered handle MUST be unregistered on close, otherwise
-- the game's headshot pool leaks a little more each time.
local headshots = {}

local function cleanupPreview()
    for _, id in pairs(headshots) do
        UnregisterPedheadshot(id)
    end
    headshots = {}
end

-- ─── NUI MANAGEMENT ──────────────────────────────────────
local function openNUI(mode, data)
    if isNUIOpen then
        -- Mode switch instead of silently ignoring the request
        SetNuiFocus(false, false)
        SendNUIMessage({ action = "close" })
    end
    isNUIOpen   = true
    nuiMode     = mode
    nuiLastPong = GetGameTimer()

    data = data or {}
    data.theme = Config.UITheme -- UI colors (config.lua)

    SetNuiFocus(true, true)
    SendNUIMessage({
        action = "open",
        mode   = mode,
        data   = data
    })
    debugLog("NUI opened in mode: " .. mode)
end

local function closeNUI()
    if not isNUIOpen then return end
    isNUIOpen   = false
    nuiMode     = nil
    nuiLastPong = 0
    cleanupPreview()
    SetNuiFocus(false, false)
    SendNUIMessage({ action = "close" })
    debugLog("NUI closed")
end

-- The page requests the UI colors once it loads, so notifications are
-- themed even before a window has been opened.
RegisterNUICallback('nuiReady', function(data, cb)
    cb({ theme = Config.UITheme })
end)

-- Backup: __cfx_nui:closeUI via NuiFocusReleased (fires when user presses Escape while NUI has focus)
RegisterNUICallback('focusReleased', function(data, cb)
    closeNUI()
    cb({ ok = true })
end)

-- ─── NUI HEARTBEAT WATCHDOG ──────────────────────────────
-- The NUI page answers every "ping" with an nuiPong callback.
-- If it stops responding while we consider it open, the page is
-- dead/stuck: force-close so the player is never locked out.
RegisterNUICallback('nuiPong', function(data, cb)
    nuiLastPong = GetGameTimer()
    cb({ ok = true })
end)

Citizen.CreateThread(function()
    while true do
        Citizen.Wait(1000)
        if isNUIOpen then
            SendNUIMessage({ action = "ping" })
            if nuiLastPong > 0 and (GetGameTimer() - nuiLastPong) > 4000 then
                debugLog("NUI heartbeat timeout - forcing close")
                closeNUI()
            end
        end
    end
end)

-- Backup Escape key detection thread (catches cases where NUI JS fails to send closeUI)
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(0)
        if isNUIOpen then
            DisableControlAction(0, 200, true) -- INPUT_FRONTEND_PAUSE_ALTERNATE (Escape/P)
            if IsDisabledControlJustPressed(0, 200) then
                closeNUI()
            end
        else
            Citizen.Wait(500)
        end
    end
end)

-- ─── PLAYER LIST BUILDER ─────────────────────────────────
-- ─── PLAYER LIST BUILDER ─────────────────────────────────
local function buildPlayerList(serverPlayers)
    local players = {}
    local myId = GetPlayerServerId(PlayerId())

    if serverPlayers and #serverPlayers > 0 then
        for _, p in ipairs(serverPlayers) do
            table.insert(players, {
                serverId = p.serverId,
                userId   = p.userId, -- vRP ID: what players know & what contracts use
                localId  = p.serverId,
                name     = p.name,
                x        = 0.0,
                y        = 0.0,
                z        = 0.0,
                isSelf   = (p.serverId == myId)
            })
        end
    else
        for _, i in ipairs(GetActivePlayers()) do
            local ped = GetPlayerPed(i)
            if ped and ped ~= 0 and DoesEntityExist(ped) then
                local serverId = GetPlayerServerId(i)
                local name = GetPlayerName(i)
                local pos  = GetEntityCoords(ped)
                table.insert(players, {
                    serverId  = serverId,
                    localId   = i,
                    name      = name,
                    x         = pos.x,
                    y         = pos.y,
                    z         = pos.z,
                    isSelf    = (serverId == myId)
                })
            end
        end
    end
    return players
end

-- ─── CIVILIAN: Open from K menu or command ───────────────
RegisterNetEvent('hitman:client:openCivilian')
AddEventHandler('hitman:client:openCivilian', function(data)
    local myId = GetPlayerServerId(PlayerId())
    TriggerServerEvent('hitman:civilian:requestOpen', myId)
end)

-- Civilian Command Registration
local civCmd = Config.CivilianCommand or "hitcontract"
RegisterCommand(civCmd, function()
    -- Same panel open → toggle closed. Different mode → server switches it.
    if isNUIOpen and nuiMode == "civilian" then
        closeNUI()
        return
    end
    local myId = GetPlayerServerId(PlayerId())
    TriggerServerEvent('hitman:civilian:requestOpen', myId)
end, false)

-- Server responds with permission + config data
RegisterNetEvent('hitman:civilian:openUI')
AddEventHandler('hitman:civilian:openUI', function(data)
    playerList = buildPlayerList(data.onlinePlayers)
    data.players = playerList
    data.myId    = GetPlayerServerId(PlayerId())
    openNUI("civilian", data)
end)

-- Hitman Panel Command & KeyMapping Registration
local hitmanCmd = Config.HitmanCommand or "hitmanpanel"
local keybind   = Config.HitmanKeyBind or "F9"
local keydesc   = Config.HitmanKeyBindDescription or "فتح لوحة القاتل المأجور"

RegisterCommand(hitmanCmd, function()
    -- Same panel open → toggle closed. Different mode → server switches it.
    if isNUIOpen and nuiMode == "hitman" then
        closeNUI()
        return
    end
    TriggerServerEvent('hitman:hitman:requestOpen')
end, false)

if keybind and keybind ~= "" then
    RegisterKeyMapping(hitmanCmd, keydesc, 'keyboard', keybind)
end

RegisterNetEvent('hitman:hitman:openUI')
AddEventHandler('hitman:hitman:openUI', function(data)
    data.myId = GetPlayerServerId(PlayerId())
    openNUI("hitman", data)
end)

-- ─── NUI CALLBACKS ───────────────────────────────────────

RegisterNUICallback('closeUI', function(data, cb)
    closeNUI()
    cb({ ok = true })
end)

RegisterNUICallback('submitContract', function(data, cb)
    local myId = GetPlayerServerId(PlayerId())
    TriggerServerEvent('hitman:server:createContract', {
        requesterId  = myId,
        targetId     = tonumber(data.targetId),
        price        = tonumber(data.price),
        notes        = tostring(data.notes or ""),
        anonymous    = data.anonymous == true,
        priority     = data.priority or "normal"
    })
    cb({ ok = true })
end)

RegisterNUICallback('acceptContract', function(data, cb)
    local myId = GetPlayerServerId(PlayerId())
    TriggerServerEvent('hitman:server:acceptContract', {
        contractId = data.contractId,
        hitmanId   = myId
    })
    cb({ ok = true })
end)

RegisterNUICallback('rejectContract', function(data, cb)
    TriggerServerEvent('hitman:server:rejectContract', {
        contractId = data.contractId
    })
    cb({ ok = true })
end)

RegisterNUICallback('abandonMission', function(data, cb)
    local myId = GetPlayerServerId(PlayerId())
    TriggerServerEvent('hitman:server:abandonMission', {
        contractId = data.contractId,
        hitmanId   = myId
    })
    cb({ ok = true })
end)

RegisterNUICallback('startPedPreview', function(data, cb)
    local targetServerId = tonumber(data.serverId)
    if not targetServerId then return cb({ ok = false }) end

    cleanupPreview()

    local targetPed = nil
    for _, player in ipairs(GetActivePlayers()) do
        if GetPlayerServerId(player) == targetServerId then
            targetPed = GetPlayerPed(player)
            break
        end
    end

    if not targetPed or targetPed == 0 then
        return cb({ ok = false, error = "Target not nearby" })
    end

    local handle = RegisterPedheadshot(targetPed)
    local timeout = 2000
    while not IsPedheadshotReady(handle) and timeout > 0 do
        Citizen.Wait(10)
        timeout = timeout - 10
    end

    if IsPedheadshotReady(handle) then
        local txd = GetPedheadshotTxdString(handle)
        table.insert(headshots, handle)
        cb({ ok = true, mugshot = "https://nui-img/" .. txd .. "/" .. txd })
    else
        UnregisterPedheadshot(handle)
        cb({ ok = false, error = "Headshot timeout" })
    end
end)

RegisterNUICallback('stopPedPreview', function(data, cb)
    cleanupPreview()
    cb({ ok = true })
end)

RegisterNUICallback('getPlayerList', function(data, cb)
    local players = buildPlayerList()
    cb({ players = players })
end)

RegisterNUICallback('refreshHitmanData', function(data, cb)
    TriggerServerEvent('hitman:server:getHitmanData')
    cb({ ok = true })
end)

-- ─── MY CONTRACTS & CHAT ─────────────────────────────────
RegisterNUICallback('requestMyContracts', function(data, cb)
    TriggerServerEvent('hitman:server:requestMyContracts')
    cb({ ok = true })
end)

RegisterNUICallback('openContractChat', function(data, cb)
    TriggerServerEvent('hitman:server:openContractChat', {
        contractId = tonumber(data.contractId)
    })
    cb({ ok = true })
end)

RegisterNUICallback('sendChatMessage', function(data, cb)
    TriggerServerEvent('hitman:server:sendChatMessage', {
        contractId = tonumber(data.contractId),
        message    = tostring(data.message or "")
    })
    cb({ ok = true })
end)

RegisterNetEvent('hitman:client:myContracts')
AddEventHandler('hitman:client:myContracts', function(contracts)
    SendNUIMessage({ action = "myContracts", data = { contracts = contracts or {} } })
end)

RegisterNetEvent('hitman:client:contractChatData')
AddEventHandler('hitman:client:contractChatData', function(payload)
    SendNUIMessage({ action = "contractChatData", data = payload })
end)

RegisterNetEvent('hitman:client:chatMessage')
AddEventHandler('hitman:client:chatMessage', function(payload)
    SendNUIMessage({
        action = "chatMessage",
        data   = {
            contractId = payload and payload.contractId,
            message    = payload and payload.message,
            yourRole   = payload and payload.yourRole
        }
    })
end)

-- ─── SERVER CALLBACKS → NUI RESPONSES ────────────────────

RegisterNetEvent('hitman:client:contractResult')
AddEventHandler('hitman:client:contractResult', function(success, message)
    SendNUIMessage({
        action  = "contractResult",
        success = success,
        message = message
    })
    if success then
        Citizen.Wait(1500)
        closeNUI()
    end
end)

RegisterNetEvent('hitman:client:acceptResult')
AddEventHandler('hitman:client:acceptResult', function(success, message, data)
    SendNUIMessage({
        action  = "acceptResult",
        success = success,
        message = message,
        data    = data
    })
end)

RegisterNetEvent('hitman:client:updateHitmanData')
AddEventHandler('hitman:client:updateHitmanData', function(data)
    data.myId = GetPlayerServerId(PlayerId())
    SendNUIMessage({
        action = "updateHitmanData",
        data   = data
    })
end)

-- ─── TARGET NOTIFICATION ─────────────────────────────────
RegisterNetEvent('hitman:client:targetWarning')
AddEventHandler('hitman:client:targetWarning', function()
    local start = GetGameTimer()
    Citizen.CreateThread(function()
        while GetGameTimer() - start < 3000 do
            DrawRect(0.5, 0.5, 1.0, 1.0, 200, 0, 0, math.floor(
                80 * math.abs(math.sin((GetGameTimer() - start) / 300))
            ))
            Citizen.Wait(0)
        end
    end)

    PlaySoundFrontend(-1, "PICK_UP_WEAPON_PLAYER", "HUD_AMMO_SHOP_SOUNDSET", true)

    SendNUIMessage({
        action  = "notify",
        type    = "error",
        title   = "⚠️ تحذير أمني",
        message = Config.TargetWarningMessage or "تم التعاقد مع قاتل مأجور لتصديقك. استعد!"
    })
end)

-- ─── NEW CONTRACT NOTIFICATION ───────────────────────────
RegisterNetEvent('hitman:client:newContractNotify')
AddEventHandler('hitman:client:newContractNotify', function(data)
    PlaySoundFrontend(-1, "Text_Arrive_Tone", "Phone_SoundSet_Default", true)
    local pLabel = data.priority == "urgent" and "عاجل" or data.priority == "high" and "عالي" or "عادي"
    SendNUIMessage({
        action  = "notify",
        type    = "info",
        title   = "📋 عقد جديد",
        message = "عقد بمستوى " .. pLabel .. " متاح! المكافأة: $" .. (data.reward or 0)
    })
end)

-- ─── TRACKING SYSTEM ─────────────────────────────────────
RegisterNetEvent('hitman:client:startTracking')
AddEventHandler('hitman:client:startTracking', function(targetServerId)
    if activeTracking then
        if activeTracking.blip and DoesBlipExist(activeTracking.blip) then
            RemoveBlip(activeTracking.blip)
        end
        activeTracking = nil
    end

    local blip = AddBlipForCoord(0.0, 0.0, 0.0)
    SetBlipSprite(blip, Config.BlipSprite)
    SetBlipColour(blip, Config.BlipColor)
    SetBlipScale(blip, 1.2)
    SetBlipAsShortRange(blip, false)
    BeginTextCommandSetBlipName("STRING")
    AddTextComponentSubstringPlayerName("🎯 الهدف")
    EndTextCommandSetBlipName(blip)

    activeTracking = {
        targetServerId = targetServerId,
        blip           = blip
    }

    debugLog("Tracking started for server ID: " .. targetServerId)
end)

RegisterNetEvent('hitman:client:stopTracking')
AddEventHandler('hitman:client:stopTracking', function()
    if activeTracking then
        if activeTracking.blip and DoesBlipExist(activeTracking.blip) then
            RemoveBlip(activeTracking.blip)
        end
        activeTracking = nil
    end
    debugLog("Tracking stopped")
end)

-- ─── TRACKING LOOP ────────────────────────────────────────
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(Config.TrackingUpdateInterval * 1000)

        if activeTracking then
            local targetPed = nil
            for i = 0, 254 do
                if NetworkIsPlayerActive(i) then
                    if GetPlayerServerId(i) == activeTracking.targetServerId then
                        targetPed = GetPlayerPed(i)
                        break
                    end
                end
            end

            if targetPed and targetPed ~= 0 then
                local pos = GetEntityCoords(targetPed)
                SetBlipCoords(activeTracking.blip, pos.x, pos.y, pos.z)

                if Config.TrackingFadeDistance > 0 then
                    local myPed  = PlayerPedId()
                    local myPos  = GetEntityCoords(myPed)
                    local dist   = #(pos - myPos)
                    local alpha  = math.max(60, math.min(255, math.floor(255 * (1 - (dist / (Config.TrackingFadeDistance * 2))))))
                    SetBlipAlpha(activeTracking.blip, alpha)
                end
            else
                TriggerServerEvent('hitman:server:requestTargetCoords', activeTracking.targetServerId)
            end
        end
    end
end)

RegisterNetEvent('hitman:client:updateTargetCoords')
AddEventHandler('hitman:client:updateTargetCoords', function(x, y, z)
    if activeTracking and activeTracking.blip and DoesBlipExist(activeTracking.blip) then
        SetBlipCoords(activeTracking.blip, x, y, z)
    end
end)

-- ─── BULLETPROOF KILL / DEATH / COMA DETECTION ─────────────────
local isLocalPlayerDead = false

local function reportPlayerDeath(victimServerId, attackerServerId)
    TriggerServerEvent('hitman:server:onPlayerDeath', {
        victimServerId   = victimServerId or GetPlayerServerId(PlayerId()),
        attackerServerId = attackerServerId
    })
end

-- 1. FiveM Game Event Listener (CEventNetworkEntityDamage)
AddEventHandler('gameEventTriggered', function(name, data)
    if name == 'CEventNetworkEntityDamage' then
        local victim = data[1]
        local attacker = data[2]
        local isFatal = data[6] == 1

        if victim and DoesEntityExist(victim) and IsEntityAPed(victim) and IsPedAPlayer(victim) then
            local victimPlayer = NetworkGetPlayerIndexFromPed(victim)
            local victimServerId = (victimPlayer and victimPlayer ~= -1) and GetPlayerServerId(victimPlayer) or nil
            local health = GetEntityHealth(victim)

            if isFatal or health <= 105 or IsEntityDead(victim) or IsPedDeadOrDying(victim, true) then
                local attackerServerId = nil
                if attacker and DoesEntityExist(attacker) and IsEntityAPed(attacker) and IsPedAPlayer(attacker) then
                    local attackerPlayer = NetworkGetPlayerIndexFromPed(attacker)
                    if attackerPlayer and attackerPlayer ~= -1 then
                        attackerServerId = GetPlayerServerId(attackerPlayer)
                    end
                end
                if victimServerId then
                    reportPlayerDeath(victimServerId, attackerServerId)
                end
            end
        end
    end
end)

-- 2. Hook vRP / Delix Coma Event
RegisterNetEvent('Delix:deathTimer')
AddEventHandler('Delix:deathTimer', function(timer)
    if timer then
        reportPlayerDeath(GetPlayerServerId(PlayerId()), nil)
    end
end)

-- 3. Baseevents listeners
AddEventHandler('baseevents:onPlayerDied', function(killerType, coords)
    reportPlayerDeath(GetPlayerServerId(PlayerId()), nil)
end)

AddEventHandler('baseevents:onPlayerKilled', function(killerId, killData)
    local killerServerId = killerId and GetPlayerServerId(killerId) or nil
    reportPlayerDeath(GetPlayerServerId(PlayerId()), killerServerId)
end)

-- 4. Fast Local Player Health & Coma Monitoring Thread (500ms)
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(500)
        local ped = PlayerPedId()
        if DoesEntityExist(ped) then
            local health = GetEntityHealth(ped)
            if health <= 105 or IsEntityDead(ped) or IsPedDeadOrDying(ped, true) then
                if not isLocalPlayerDead then
                    isLocalPlayerDead = true
                    local killerPed = GetPedSourceOfDeath(ped)
                    local killerServerId = nil
                    if killerPed and DoesEntityExist(killerPed) and IsPedAPlayer(killerPed) then
                        local killerPlayer = NetworkGetPlayerIndexFromPed(killerPed)
                        if killerPlayer and killerPlayer ~= -1 then
                            killerServerId = GetPlayerServerId(killerPlayer)
                        end
                    end
                    reportPlayerDeath(GetPlayerServerId(PlayerId()), killerServerId)
                end
            else
                isLocalPlayerDead = false
            end
        end
    end
end)

-- 5. Tracked Target Death Detection Loop on Hitman Client (Backup)
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(1000)
        if activeTracking then
            for _, i in ipairs(GetActivePlayers()) do
                if GetPlayerServerId(i) == activeTracking.targetServerId then
                    local ped = GetPlayerPed(i)
                    if ped and ped ~= 0 and (GetEntityHealth(ped) <= 105 or IsEntityDead(ped) or IsPedDeadOrDying(ped, true)) then
                        local killerPed = GetPedSourceOfDeath(ped)
                        local killerServerId = nil
                        if killerPed and DoesEntityExist(killerPed) and IsPedAPlayer(killerPed) then
                            local killerPlayer = NetworkGetPlayerIndexFromPed(killerPed)
                            if killerPlayer and killerPlayer ~= -1 then
                                killerServerId = GetPlayerServerId(killerPlayer)
                            end
                        end
                        reportPlayerDeath(activeTracking.targetServerId, killerServerId)
                        Citizen.Wait(3000)
                    end
                    break
                end
            end
        end
    end
end)

-- ─── HITMAN DEATH ────────────────────────────────────────
AddEventHandler('baseevents:onPlayerDied', function(killer, coords)
    if activeTracking and Config.FailOnHitmanDeath then
        TriggerServerEvent('hitman:server:hitmanDied')
    end
end)

-- ─── MISSION COMPLETE NOTIFICATION ───────────────────────
RegisterNetEvent('hitman:client:missionComplete')
AddEventHandler('hitman:client:missionComplete', function(reward, customMsg)
    SendNUIMessage({
        action  = "notify",
        type    = "success",
        title   = "✅ تم الإنجاز",
        message = (customMsg or "تم إكمال العقد بنجاح!") .. " المكافأة: $" .. reward
    })
    PlaySoundFrontend(-1, "CHALLENGE_UNLOCKED", "HUD_AWARDS", true)
end)

RegisterNetEvent('hitman:client:missionFailed')
AddEventHandler('hitman:client:missionFailed', function(reason)
    SendNUIMessage({
        action  = "notify",
        type    = "error",
        title   = "❌ فشل المهمة",
        message = reason or "فشلت المهمة لسبب غير معروف."
    })
end)

RegisterNetEvent('hitman:client:notify')
AddEventHandler('hitman:client:notify', function(msg)
    notify(msg or "", "info", "📋 نظام الاغتيالات")
end)

RegisterNetEvent('hitman:client:contractDoneNotify')
AddEventHandler('hitman:client:contractDoneNotify', function()
    PlaySoundFrontend(-1, "CHALLENGE_UNLOCKED", "HUD_AWARDS", true)
    SendNUIMessage({
        action  = "notify",
        type    = "success",
        title   = "✅ اكتمال العقد",
        message = "تمت تصفية الهدف بنجاح وإتمام العقد الذي طلبتـه."
    })
end)

RegisterNetEvent('hitman:client:contractAcceptedNotify')
AddEventHandler('hitman:client:contractAcceptedNotify', function()
    SendNUIMessage({
        action  = "notify",
        type    = "warning",
        title   = "📋 تحديث العقد",
        message = "تم قبول عقدك من قبل قاتل مأجور."
    })
end)

debugLog("Client script loaded.")
