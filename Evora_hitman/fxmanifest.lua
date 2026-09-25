fx_version 'cerulean'
game 'gta5'

author 'LR @qwxlr'
description 'Evora_hitman - Premium Hitman System'
version '1.1.0'

dependencies {
    'vrp',
    'oxmysql'  -- REQUIRED: this resource reads/writes through oxmysql only.
               -- mysql-async / ghmattimysql are NOT supported.
}

shared_scripts {
    '@vrp/lib/utils.lua', -- REQUIRED: this is what provides the 'Proxy' global used below.
    'config.lua'
}

client_scripts {
    'client.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/css/style.css',
    'html/js/app.js',
    'html/js/chat.js',
    'html/js/civilian.js',
    'html/js/hitman.js',
    -- Optional UI backgrounds (Config.UIBackground) — drop files in html/img/
    'html/img/*.gif',
    'html/img/*.png',
    'html/img/*.jpg',
    'html/img/*.jpeg',
    'html/img/*.webp'
}

lua54 'yes'
