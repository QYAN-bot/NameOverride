/**
 * Name Override — SillyTavern Extension v4
 *
 * Strategy:
 *   1. generate_interceptor → permanently modifies chat history messages
 *   2. fetch monkey-patch → replaces names in the actual HTTP request body
 *      sent to the ST server, guaranteeing the API sees correct names
 */

const MODULE_NAME = 'name_override';
const DEBUG = true;

function dbg(msg) {
    if (DEBUG) toastr.info(msg, 'Name Override', { timeOut: 3000 });
    console.log(`[${MODULE_NAME}] ${msg}`);
}

// ── helpers ──────────────────────────────────────────────────────────

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCharKey() {
    const ctx = SillyTavern.getContext();
    const char = ctx.characters?.[ctx.characterId];
    return char?.avatar ?? null;
}

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = {};
    }
    return extensionSettings[MODULE_NAME];
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

function replaceName(text, original, replacement) {
    if (!text || !original || !replacement || original === replacement) return text;
    // Use word boundary for latin names; fallback to replaceAll
    try {
        return text.replace(new RegExp(`\\b${escapeRegex(original)}\\b`, 'g'), replacement);
    } catch {
        return text.replaceAll(original, replacement);
    }
}

function applyReplacements(text, origChar, origUser, newChar, newUser) {
    if (typeof text !== 'string') return text;
    if (newChar) text = replaceName(text, origChar, newChar);
    if (newUser) text = replaceName(text, origUser, newUser);
    return text;
}

// ── current replacement context (set before each generation) ─────────

let activeReplacement = null;

function buildReplacementContext() {
    const ctx = SillyTavern.getContext();
    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return null;
    return {
        origChar: ctx.name2,
        origUser: ctx.name1,
        newChar: newChar || null,
        newUser: newUser || null,
    };
}

// ── generate_interceptor (permanent chat history modification) ────────

globalThis.nameOverrideInterceptor = async function (chat, contextSize, abort, type) {
    const rep = buildReplacementContext();
    if (!rep) { activeReplacement = null; return; }

    // Set active context for the fetch interceptor
    activeReplacement = rep;

    let count = 0;
    for (const msg of chat) {
        let changed = false;
        if (typeof msg.mes === 'string') {
            const before = msg.mes;
            msg.mes = applyReplacements(msg.mes, rep.origChar, rep.origUser, rep.newChar, rep.newUser);
            if (msg.mes !== before) changed = true;
        }
        if (msg.name) {
            const before = msg.name;
            if (rep.newChar && msg.name === rep.origChar) msg.name = rep.newChar;
            if (rep.newUser && msg.name === rep.origUser) msg.name = rep.newUser;
            if (msg.name !== before) changed = true;
        }
        if (changed) count++;
    }
    if (count > 0) dbg(`Chat history: ${count} msg(s) modified`);
};

// ── fetch interceptor (modify actual HTTP request body) ──────────────

function replaceInObject(obj, rep) {
    if (!obj || !rep) return;

    // Handle messages array (Chat Completion format)
    if (Array.isArray(obj.messages)) {
        for (const msg of obj.messages) {
            if (typeof msg.content === 'string') {
                msg.content = applyReplacements(msg.content, rep.origChar, rep.origUser, rep.newChar, rep.newUser);
            }
            if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    if (part?.type === 'text' && typeof part.text === 'string') {
                        part.text = applyReplacements(part.text, rep.origChar, rep.origUser, rep.newChar, rep.newUser);
                    }
                }
            }
            if (msg.name) {
                if (rep.newChar && msg.name === rep.origChar) msg.name = rep.newChar;
                if (rep.newUser && msg.name === rep.origUser) msg.name = rep.newUser;
            }
        }
    }

    // Handle prompt string (Text Completion format)
    if (typeof obj.prompt === 'string') {
        obj.prompt = applyReplacements(obj.prompt, rep.origChar, rep.origUser, rep.newChar, rep.newUser);
    }
}

const originalFetch = window.fetch;

window.fetch = async function (input, init) {
    // Only intercept if we have an active replacement context
    if (activeReplacement && init?.body && typeof init.body === 'string') {
        try {
            const body = JSON.parse(init.body);

            // Check if this looks like a generation request
            if (body.messages || body.prompt) {
                replaceInObject(body, activeReplacement);
                init = { ...init, body: JSON.stringify(body) };
                dbg('Fetch: replaced names in request body');
            }
        } catch {
            // Not JSON or parse error — skip
        }
    }

    return originalFetch.call(this, input, init);
};

// Clear active replacement after generation ends
function onGenerationEnded() {
    activeReplacement = null;
}

// ── UI ───────────────────────────────────────────────────────────────

function updateUI() {
    const overrides = getOverrides();
    $('#name_override_char').val(overrides.charName || '');
    $('#name_override_user').val(overrides.userName || '');

    const ctx = SillyTavern.getContext();
    if (ctx) {
        $('#name_override_char').attr('placeholder', ctx.name2 || '(char)');
        $('#name_override_user').attr('placeholder', ctx.name1 || '(user)');
    }
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
                    Leave empty = default. Saved per character.
                </small>
            </div>
        </div>
    </div>`;

    const $container = $('#extensions_settings2').length
        ? $('#extensions_settings2')
        : $('#extensions_settings');
    $container.append(settingsHtml);

    $('#name_override_char').on('input', function () {
        saveOverrides($(this).val(), $('#name_override_user').val());
    });
    $('#name_override_user').on('input', function () {
        saveOverrides($('#name_override_char').val(), $(this).val());
    });

    eventSource.on(event_types.CHAT_CHANGED, updateUI);
    eventSource.on(event_types.GENERATION_ENDED, onGenerationEnded);

    dbg('Extension loaded OK!');
    updateUI();
});
