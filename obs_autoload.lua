obs = obslua

-- ---------------------------------------------------------------------------
-- Auto-lance OverlayTwitch.exe au demarrage d'OBS (si pas deja en cours).
--
-- INSTALLATION :
-- 1. Copiez ce fichier dans LE MEME DOSSIER que OverlayTwitch.exe.
-- 2. Dans OBS : Outils > Scripts > "+" > selectionnez ce fichier .lua.
-- 3. C'est tout : a chaque demarrage d'OBS, ce script verifie si l'overlay
--    tourne deja, et le lance sinon (fenetre reduite dans la barre des taches).
-- ---------------------------------------------------------------------------

local EXE_NAME = "OverlayTwitch.exe"
local script_dir = nil

function script_description()
    return "Lance automatiquement " .. EXE_NAME .. " au demarrage d'OBS, s'il n'est pas deja en cours d'execution.\n\nPlacez ce script dans le meme dossier que l'exe."
end

function is_overlay_running()
    local handle = io.popen('tasklist /FI "IMAGENAME eq ' .. EXE_NAME .. '" /NH 2>NUL')
    if not handle then return false end
    local result = handle:read("*a")
    handle:close()
    return result ~= nil and result:find(EXE_NAME, 1, true) ~= nil
end

function launch_overlay()
    if is_overlay_running() then
        obs.script_log(obs.LOG_INFO, EXE_NAME .. " est deja en cours d'execution, rien a faire.")
        return
    end

    local exe_path = (script_dir .. EXE_NAME):gsub("/", "\\")

    if not os.rename(exe_path, exe_path) then
        obs.script_log(obs.LOG_WARNING, "Introuvable : " .. exe_path .. " -- verifiez que le .lua est bien dans le meme dossier que l'exe.")
        return
    end

    -- /MIN : lance la fenetre console minimisee dans la barre des taches
    -- (elle doit rester ouverte pendant tout le stream, comme en lancement manuel)
    local cmd = string.format('start "OverlayTwitch" /MIN "%s"', exe_path)
    os.execute(cmd)
    obs.script_log(obs.LOG_INFO, "Overlay Twitch lance : " .. exe_path)
end

function script_load(settings)
    script_dir = script_path()
    launch_overlay()
end
