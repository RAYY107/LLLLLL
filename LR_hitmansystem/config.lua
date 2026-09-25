-- ============================================================
--  HITMAN SYSTEM - Configuration
-- ============================================================

Config = {}

-- Optional whitelist of player identifiers (fivem:, discord:, license:) for instant access.
-- Leave empty {} if you want access strictly controlled by the vRP permission below.
Config.HitmanIdentifiers = {}

-- vRP permission required to access the Hitman Panel.
-- Add this string to any group in vrp/cfg/groups.lua to grant access, e.g.:
--   Groups["hitman"] = {"hitman.use"}
-- then give players that group (vRP admin menu or /setgroup).
Config.HitmanPermission = "hitman.use"

-- vRP permission required to use the admin commands
-- (/hitman_blacklist, /hitman_unblacklist). Server console is always allowed.
Config.AdminPermission = "hitman.admin"

-- ─── MAIN MENU & COMMAND INTEGRATION ──────────────────────
-- Automatically registers Hitman System entries into vRP menus.
Config.RegisterInMainMenu        = true

-- Specify where the menu options should appear in vRP:
--   "phone"          → Appears inside the vRP Phone menu (الجوال)
--   "main"           → Appears inside the main K-menu (القائمة الرئيسية)
--   {"main", "phone"} → Appears in BOTH main K-menu and Phone menu (الجوال والقائمة الرئيسية)
Config.MainMenuBuilderName       = {"main", "phone"}

-- Civilian Contract Menu Config
Config.CivilianMenuTitle         = "نظام الاغتيالات"
Config.CivilianMenuDescription   = "طلب تعاقد على لاعب"
Config.CivilianCommand           = "hitcontract"        -- Console command to open Civilian UI

-- Hitman Panel Config
Config.HitmanMenuTitle           = "لوحة القاتل المأجور"
Config.HitmanMenuDescription     = "إدارة العقود المتاحة"
Config.HitmanCommand             = "hitmanpanel"        -- Console command to open Hitman Panel
Config.HitmanKeyBind             = "F9"                 -- Default keybind for Hitman Panel
Config.HitmanKeyBindDescription  = "فتح لوحة القاتل المأجور"

-- ─── CONTRACT PRICING ────────────────────────────────────
Config.MinContractPrice = 5000
Config.MaxContractPrice = 500000
Config.ServiceFee       = 0.10              -- 10% fee

-- ─── COOLDOWNS & ANTI-ABUSE LIMITS ───────────────────────
-- مدة الانتظار بين طلب عقد وطلب عقد آخر لنفس الشخص (بالثواني - 600 = 10 دقائق)
Config.ContractCooldown         = 600

-- مدة الانتظار قبل وضع عقد جديد على نفس الهدف مرة أخرى (بالثواني - 3600 = ساعة)
Config.SameTargetCooldown       = 3600

-- الحد الأقصى لعدد العقود المسموح بوضعها على نفس الشخص بنفس الوقت
Config.MaxContractsOnSameTarget = 3

-- مدة الانتظار للقاتل المأجور بين قبول مهمة وأخرى (بالثواني)
Config.HitmanAcceptCooldown     = 30

-- ─── MISSION RULES ───────────────────────────────────────
Config.MaxActiveContracts        = 3
Config.ContractExpireHours       = 24
Config.MissionTimeLimit          = 3600
Config.FailOnHitmanDeath         = false
Config.PauseOnTargetDisconnect   = true

-- احتساب إنجاز المهمة عند موت الهدف بأي سبب (حادث/سقوط/قتله شخص آخر) بعد قبول المهمة
-- true = تحتسب مكتملة بأي سبب موت | false = تحتسب مكتملة فقط إذا القاتل المأجور هو من قتله
Config.CompleteOnAnyTargetDeath  = true

-- ─── TRACKING ────────────────────────────────────────────
Config.TrackingUpdateInterval = 5
Config.TrackingFadeDistance   = 500.0
Config.BlipSprite             = 153
Config.BlipColor              = 1

-- ─── RANKING SYSTEM ──────────────────────────────────────
Config.Ranks = {
    { name = "مبتدئ",        minKills = 0,   bonus = 0.00,  color = "#888888" },
    { name = "متدرب",        minKills = 5,   bonus = 0.05,  color = "#4CAF50" },
    { name = "محترف",        minKills = 15,  bonus = 0.10,  color = "#2196F3" },
    { name = "خبير",         minKills = 30,  bonus = 0.15,  color = "#9C27B0" },
    { name = "نخبة",         minKills = 60,  bonus = 0.20,  color = "#FF9800" },
    { name = "ظلال",         minKills = 100, bonus = 0.25,  color = "#F44336" },
    { name = "شبح",          minKills = 200, bonus = 0.30,  color = "#00BCD4" },
    { name = "أسطورة",       minKills = 500, bonus = 0.40,  color = "#FFD700" },
}

-- ─── CONTRACT PRIORITY ───────────────────────────────────
Config.Priorities = {
    { id = "normal",  label = "عادي",  multiplier = 1.0,  color = "#4CAF50" },
    { id = "high",    label = "عالي",    multiplier = 1.25, color = "#FF9800" },
    { id = "urgent",  label = "عاجل",  multiplier = 1.5,  color = "#F44336" },
}

-- ─── CONTRACT DETAILS & CHAT ─────────────────────────────
-- How long (hours) a finished contract's details/chat stay visible
-- to its owner/hitman before they vanish completely.
Config.ChatHistoryHours = 24

-- ─── FAST COMPLETION BONUS ───────────────────────────────
Config.FastCompletionBonus = {
    enabled  = true,
    minutes  = 30,
    bonus    = 0.15,
}

-- ─── ANONYMITY ───────────────────────────────────────────
Config.AnonymityEnabled  = true
Config.AnonymityFee      = 500


-- ─── MONEY ───────────────────────────────────────────────
Config.StartingBalance = 50000  -- New players start with this

-- ─── NOTIFICATIONS ───────────────────────────────────────
Config.TargetWarningMessage  = "⚠️ تم التعاقد مع قاتل مأجور لتصفيتك. كن حذراً."
Config.HitCompleteMessage    = "✅ اكتمل العقد. تم إيداع المبلغ."
Config.HitFailedMessage      = "❌ فشلت المهمة. قام الهدف بالقضاء عليك."

-- ─── DEBUG ───────────────────────────────────────────────
-- Keep false in production. true prints verbose debug lines.
Config.Debug = false

-- ─── vRP PROXY EXTRAS ────────────────────────────────────
-- Some vRP builds do NOT expose these functions in the proxy interface.
-- If your console spams errors like:
--    "proxy call vRP:notify not found"
--    "proxy call vRP:getHealth not found"
-- simply set the matching option to false. Nothing else breaks:
--   • Notifications still arrive through the built-in UI toasts
--   • Coma/death detection still works via the server-side health fallback
Config.UseVrpNotifications = true -- vRP.notify (native chat-area messages)
Config.UseVrpGetHealth     = true -- vRP.getHealth (extra coma detection layer)

-- ─── UI BACKGROUND (NEW) ─────────────────────────────────
-- Optional background image / GIF behind the tablet screens.
--   • Local file: put the file inside html/img/ and set the path
--     relative to the html folder, e.g. "img/mybackground.gif"
--   • Or a full URL: "https://mysite.com/bg.gif"
-- Leave "" to keep the plain background (colored by Config.UITheme below).
-- Any image/GIF size works — it is auto-scaled to fill (cover).
Config.UIBackground       = ""
Config.UIBackgroundDim    = 0.45  -- 0.0 = full brightness, 1.0 = fully dark

-- ─── UI COLORS (THEME) ───────────────────────────────────
-- Every color in the UI comes from this table. Use hex colors: "#RRGGBB".
--   • To recolor the whole UI, change "primary" only — every value set to
--     "auto" is generated from it (hover, dark shade, accent).
--   • Any key that is removed or invalid keeps its default.
--   • Rank dot colors come from Config.Ranks above.
-- ألوان الواجهة: غيّر "primary" فقط لتغيير لون الواجهة بالكامل، والقيم "auto"
-- تُولَّد تلقائياً منه. استخدم صيغة الألوان "#RRGGBB".
-- Examples for primary: "#8673CE" purple (default) · "#E0626E" red
--                       "#4F8EF7" blue · "#3FB68B" green · "#D4A94C" gold
Config.UITheme = {
    -- Accent
    primary       = "#8673CE", -- buttons, active tabs, selections, progress
    primaryHover  = "auto",    -- button hover                ("auto" = lighter primary)
    primaryDark   = "auto",    -- your chat bubbles, gradients ("auto" = darker primary)
    accent        = "auto",    -- icons, rewards, highlights   ("auto" = soft primary tint)

    -- Backgrounds
    background    = "#08080D", -- window background
    surface       = "#11111A", -- panels, cards, sidebar, notifications
    surface2      = "#15151F", -- hover states, secondary buttons
    surface3      = "#1C1A28", -- raised elements, active tab
    input         = "#0C0C13", -- inputs and inset boxes
    border        = "#272433", -- borders
    borderStrong  = "#383349", -- hover borders, dividers

    -- Text
    text          = "#F5F3FA", -- headings and main text
    textSecondary = "#B8B3C7", -- body text
    textMuted     = "#777286", -- hints and labels
    textOnAccent  = "#FFFFFF", -- text on primary buttons

    -- Status
    success       = "#5DBB8C", -- completed, success notifications
    warning       = "#D6A35C", -- high priority, in progress, cooldown
    danger        = "#E0626E", -- urgent priority, errors, cancel buttons
}
