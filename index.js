/**
 * Name Override — SillyTavern Extension v3
 *
 * Replaces resolved char/user names in prompts AND permanently in chat history.
 * Settings saved per character card (keyed by avatar filename).
 */

const MODULE_NAME = 'name_override';
// Set to true to show toastr debug messages; flip to false once it works
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

// ── generate_interceptor ─────────────────────────────────────────────
// Global function declared in manifest. Called before each generation.
// Modifies chat array IN PLACE = permanent change to chat history.

globalThis.nameOverrideInterceptor = async function (chat, contextSize, abort, type) {
    const ctx = SillyTavern.getContext();
    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;
    let count = 0;

    for (const msg of chat) {
        let changed = false;

        if (typeof msg.mes === 'string') {
            const before = msg.mes;
            msg.mes = applyReplacements(msg.mes, origChar, origUser, newChar, newUser);
            if (msg.mes !== before) changed = true;
        }

        if (msg.name) {
            const before = msg.name;
            if (newChar && msg.name === origChar) msg.name = newChar;
            if (newUser && msg.name === origUser) msg.name = newUser;
            if (msg.name !== before) changed = true;
        }

        if (changed) count++;
    }

    if (count > 0) {
        dbg(`Interceptor: replaced names in ${count} message(s)`);
    }
};

// ── CHAT_COMPLETION_PROMPT_READY (for Chat Completion APIs) ──────────

function onChatCompletionPromptReady(data) {
    const ctx = SillyTavern.getContext();
    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;
    const messages = data?.messages ?? data?.chat;
    if (!Array.isArray(messages)) return;

    let count = 0;
    for (const msg of messages) {
        let changed = false;

        if (typeof msg.content === 'string') {
            const before = msg.content;
            msg.content = applyReplacements(msg.content, origChar, origUser, newChar, newUser);
            if (msg.content !== before) changed = true;
        }
        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' && typeof part.text === 'string') {
                    const before = part.text;
                    part.text = applyReplacements(part.text, origChar, origUser, newChar, newUser);
                    if (part.text !== before) changed = true;
                }
            }
        }
        if (msg.name) {
            const before = msg.name;
            if (newChar && msg.name === origChar) msg.name = newChar;
            if (newUser && msg.name === origUser) msg.name = newUser;
            if (msg.name !== before) changed = true;
        }
        if (changed) count++;
    }

    if (count > 0) {
        dbg(`CC prompt: replaced names in ${count} message(s)`);
    }
}

// ── GENERATE_AFTER_COMBINE_PROMPTS (for Text Completion APIs) ────────

function onGenerateAfterCombine(data) {
    const ctx = SillyTavern.getContext();
    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;

    if (typeof data === 'object' && data !== null) {
        for (const key of ['prompt', 'data', 'text']) {
            if (typeof data[key] === 'string') {
                data[key] = applyReplacements(data[key], origChar, origUser, newChar, newUser);
            }
        }
        dbg('TC prompt: applied replacements');
    }
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

    // Ensure settings object
    getSettings();

    // Settings panel HTML
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
                    Leave empty = default name. Saved per character.
                </small>
            </div>
        </div>
    </div>`;

    // Try both known settings containers
    const $container = $('#extensions_settings2').length
        ? $('#extensions_settings2')
        : $('#extensions_settings');
    $container.append(settingsHtml);

    // Bind input events
    $('#name_override_char').on('input', function () {
        saveOverrides($(this).val(), $('#name_override_user').val());
    });
    $('#name_override_user').on('input', function () {
        saveOverrides($('#name_override_char').val(), $(this).val());
    });

    // Update UI on chat switch
    eventSource.on(event_types.CHAT_CHANGED, updateUI);

    // Register event hooks as secondary coverage
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);

    // This event name uses the string directly as a fallback
    const afterCombine = event_types.GENERATE_AFTER_COMBINE_PROMPTS
        ?? 'generate_after_combine_prompts';
    eventSource.on(afterCombine, onGenerateAfterCombine);

    dbg('Extension loaded OK!');
    updateUI();
});
