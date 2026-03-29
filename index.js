/**
 * Name Override — SillyTavern Extension v5
 *
 * Makes {{char}}/{{user}} resolve to custom names by overriding the data sources.
 * Three strategies applied simultaneously:
 *   A. registerMacro('char'/'user', ...) → override macro resolution
 *   B. characters[id].name modification → override the name2 data source
 *   C. fetch interceptor → ultimate fallback on the HTTP request
 */

const MODULE_NAME = 'name_override';
const DEBUG = true;

function dbg(msg) {
    if (DEBUG) toastr.info(msg, 'NameOvr', { timeOut: 2500 });
    console.log(`[${MODULE_NAME}] ${msg}`);
}

// ── settings ─────────────────────────────────────────────────────────

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) extensionSettings[MODULE_NAME] = {};
    return extensionSettings[MODULE_NAME];
}

function getCharKey() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    return char?.avatar ?? null;
}

function getOverrides() {
    const key = getCharKey();
    if (!key) return { charName: '', userName: '' };
    return getSettings()[key] ?? { charName: '', userName: '' };
}

function saveOverrides(charName, userName) {
    const key = getCharKey();
    if (!key) return;
    getSettings()[key] = { charName, userName };
    SillyTavern.getContext().saveSettingsDebounced();
}

// ── state tracking ───────────────────────────────────────────────────
// We track the original character name so we can restore it when
// switching to another character (prevents polluting the char card data)

let originalCharName = null;  // original characters[id].name
let currentCharId = null;     // characterId we modified
let macrosRegistered = false;

// ── Strategy A: Macro registration ───────────────────────────────────

function registerMacroOverrides() {
    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    const ctx = SillyTavern.getContext();

    // Try new macro engine first (ST 1.17+)
    if (ctx.macros?.register) {
        try {
            if (newChar) {
                ctx.macros.register('char', {
                    description: 'Name Override: custom char name',
                    handler: () => newChar,
                });
                dbg(`A1: macros.register char → ${newChar}`);
            }
            if (newUser) {
                ctx.macros.register('user', {
                    description: 'Name Override: custom user name',
                    handler: () => newUser,
                });
                dbg(`A1: macros.register user → ${newUser}`);
            }
            macrosRegistered = true;
            return;
        } catch (e) {
            dbg(`A1 failed: ${e.message}`);
        }
    }

    // Fallback: legacy registerMacro (deprecated but widely supported)
    if (ctx.registerMacro) {
        try {
            if (newChar) {
                ctx.registerMacro('char', newChar);
                dbg(`A2: registerMacro char → ${newChar}`);
            }
            if (newUser) {
                ctx.registerMacro('user', newUser);
                dbg(`A2: registerMacro user → ${newUser}`);
            }
            macrosRegistered = true;
            return;
        } catch (e) {
            dbg(`A2 failed: ${e.message}`);
        }
    }

    dbg('A: no macro API available');
}

function unregisterMacroOverrides() {
    if (!macrosRegistered) return;
    const ctx = SillyTavern.getContext();

    try {
        if (ctx.macros?.registry?.unregisterMacro) {
            ctx.macros.registry.unregisterMacro('char');
            ctx.macros.registry.unregisterMacro('user');
        } else if (ctx.unregisterMacro) {
            ctx.unregisterMacro('char');
            ctx.unregisterMacro('user');
        }
    } catch (e) {
        // Might fail if they weren't registered; that's fine
    }
    macrosRegistered = false;
}

// ── Strategy B: Direct character name modification ───────────────────

function applyCharacterNameOverride() {
    const ctx = SillyTavern.getContext();
    const charId = ctx.characterId;
    if (charId == null || !ctx.characters?.[charId]) return;

    const { charName } = getOverrides();
    const newChar = charName?.trim();

    // Restore previous character's name if we switched
    restoreCharacterName();

    if (newChar) {
        originalCharName = ctx.characters[charId].name;
        currentCharId = charId;
        ctx.characters[charId].name = newChar;
        dbg(`B: char name → "${newChar}" (was "${originalCharName}")`);
    }
}

function restoreCharacterName() {
    if (originalCharName != null && currentCharId != null) {
        const ctx = SillyTavern.getContext();
        if (ctx.characters?.[currentCharId]) {
            ctx.characters[currentCharId].name = originalCharName;
        }
        originalCharName = null;
        currentCharId = null;
    }
}

// ── Strategy C: Fetch interceptor (fallback) ─────────────────────────

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceName(text, original, replacement) {
    if (!text || !original || !replacement || original === replacement) return text;
    try {
        return text.replace(new RegExp(`\\b${escapeRegex(original)}\\b`, 'g'), replacement);
    } catch {
        return text.replaceAll(original, replacement);
    }
}

const originalFetch = window.fetch;
window.fetch = async function (input, init) {
    if (init?.body && typeof init.body === 'string') {
        try {
            const body = JSON.parse(init.body);
            if (body.messages || body.prompt) {
                const { charName, userName } = getOverrides();
                const newChar = charName?.trim();
                const newUser = userName?.trim();
                if (newChar || newUser) {
                    // We need original names for replacement. Since we may have
                    // already changed characters[].name, use our saved original.
                    const origChar = originalCharName || '';
                    const ctx = SillyTavern.getContext();
                    const origUser = ctx.name1;

                    const bodyStr = init.body;
                    let newBodyStr = bodyStr;
                    if (newChar && origChar) {
                        newBodyStr = replaceName(newBodyStr, origChar, newChar);
                    }
                    if (newUser && origUser) {
                        newBodyStr = replaceName(newBodyStr, origUser, newUser);
                    }
                    if (newBodyStr !== bodyStr) {
                        init = { ...init, body: newBodyStr };
                        dbg('C: fetch body replaced');
                    }
                }
            }
        } catch { /* not JSON */ }
    }
    return originalFetch.call(this, input, init);
};

// ── apply all strategies ─────────────────────────────────────────────

function applyAllOverrides() {
    unregisterMacroOverrides();
    registerMacroOverrides();    // Strategy A
    applyCharacterNameOverride(); // Strategy B
    // Strategy C is always active via fetch patch
}

// ── UI ───────────────────────────────────────────────────────────────

function updateUI() {
    const overrides = getOverrides();
    $('#name_override_char').val(overrides.charName || '');
    $('#name_override_user').val(overrides.userName || '');

    // Show original name as placeholder
    // Use saved original if we've already overridden, otherwise read current
    const ctx = SillyTavern.getContext();
    const displayOrigChar = originalCharName || ctx.name2 || '(char)';
    const displayOrigUser = ctx.name1 || '(user)';
    $('#name_override_char').attr('placeholder', displayOrigChar);
    $('#name_override_user').attr('placeholder', displayOrigUser);
}

// ── lifecycle ────────────────────────────────────────────────────────

function onChatChanged() {
    // When switching characters, first restore the old one
    restoreCharacterName();
    // Then apply overrides for the new character
    applyAllOverrides();
    updateUI();
}

function onSettingsInput() {
    const charVal = $('#name_override_char').val();
    const userVal = $('#name_override_user').val();
    saveOverrides(charVal, userVal);

    // Re-apply after settings change
    restoreCharacterName();
    applyAllOverrides();
    updateUI();
}

// ── init ─────────────────────────────────────────────────────────────

jQuery(async () => {
    const ctx = SillyTavern.getContext();
    const { eventSource, event_types } = ctx;

    getSettings();

    const settingsHtml = `
    <div id="name_override_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Name Override</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="name_override_field">
                    <label for="name_override_char">char →</label>
                    <input id="name_override_char" type="text" class="text_pole" />
                </div>
                <div class="name_override_field">
                    <label for="name_override_user">user →</label>
                    <input id="name_override_user" type="text" class="text_pole" />
                </div>
                <small class="name_override_hint">
                    Leave empty = default. Saved per character card.
                </small>
            </div>
        </div>
    </div>`;

    const $container = $('#extensions_settings2').length
        ? $('#extensions_settings2')
        : $('#extensions_settings');
    $container.append(settingsHtml);

    $('#name_override_char').on('input', onSettingsInput);
    $('#name_override_user').on('input', onSettingsInput);

    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    // Also clean up if page unloads
    window.addEventListener('beforeunload', restoreCharacterName);

    dbg('Extension loaded OK');
    applyAllOverrides();
    updateUI();
});
