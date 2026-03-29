/**
 * Name Override — SillyTavern Extension v2
 *
 * Replaces resolved char/user names in the prompt sent to the API.
 * Settings are saved per character card (keyed by avatar filename).
 *
 * Uses generate_interceptor (declared in manifest.json) as the primary
 * prompt hook, plus CHAT_COMPLETION_PROMPT_READY as a secondary hook
 * for Chat Completion APIs.
 */

const MODULE_NAME = 'name_override';

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
    const settings = getSettings();
    return settings[key] ?? { charName: '', userName: '' };
}

function saveOverrides(charName, userName) {
    const key = getCharKey();
    if (!key) return;
    const settings = getSettings();
    settings[key] = { charName, userName };
    SillyTavern.getContext().saveSettingsDebounced();
}

function replaceName(text, original, replacement) {
    if (!text || !original || !replacement) return text;
    if (original === replacement) return text;
    try {
        const re = new RegExp(`\\b${escapeRegex(original)}\\b`, 'g');
        return text.replace(re, replacement);
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

// ── generate_interceptor (primary hook) ──────────────────────────────
// This global function is called by ST before prompt construction.
// It receives the chat message array. We use structuredClone to avoid
// permanently modifying chat history.

globalThis.nameOverrideInterceptor = async function (chat, contextSize, abort, type) {
    const ctx = SillyTavern.getContext();
    if (!ctx) return;

    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;

    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];

        // Check if this message needs any changes
        const mesNeedsChange = typeof msg.mes === 'string' &&
            ((newChar && msg.mes.includes(origChar)) ||
             (newUser && msg.mes.includes(origUser)));
        const nameNeedsChange =
            (newChar && msg.name === origChar) ||
            (newUser && msg.name === origUser);

        if (!mesNeedsChange && !nameNeedsChange) continue;

        // Clone to avoid permanently changing chat history
        const clone = structuredClone(msg);

        if (typeof clone.mes === 'string') {
            clone.mes = applyReplacements(clone.mes, origChar, origUser, newChar, newUser);
        }
        if (clone.name) {
            if (newChar && clone.name === origChar) clone.name = newChar;
            if (newUser && clone.name === origUser) clone.name = newUser;
        }

        chat[i] = clone;
    }
};

// ── CHAT_COMPLETION_PROMPT_READY (secondary hook for CC APIs) ────────
// This catches the final messages array for Chat Completion APIs
// after all prompt construction is done, as a safety net.

function onChatCompletionPromptReady(data) {
    const ctx = SillyTavern.getContext();
    if (!ctx) return;

    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;

    const messages = data?.messages ?? data?.chat;
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            msg.content = applyReplacements(msg.content, origChar, origUser, newChar, newUser);
        }
        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' && typeof part.text === 'string') {
                    part.text = applyReplacements(part.text, origChar, origUser, newChar, newUser);
                }
            }
        }
        if (msg.name) {
            if (newChar && msg.name === origChar) msg.name = newChar;
            if (newUser && msg.name === origUser) msg.name = newUser;
        }
    }
}

// ── GENERATE_AFTER_COMBINE_PROMPTS (secondary hook for TC APIs) ──────
// For Text Completion APIs, the prompt is a combined string.

function onGenerateAfterCombine(data) {
    const ctx = SillyTavern.getContext();
    if (!ctx) return;

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

(function init() {
    const ctx = SillyTavern.getContext();
    const { eventSource, event_types } = ctx;

    // Ensure settings object exists
    getSettings();

    // Inject settings panel
    const settingsHtml = `
    <div id="name_override_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Name Override</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="name_override_field">
                    <label for="name_override_char">
                        <span>char →</span>
                    </label>
                    <input id="name_override_char" type="text" class="text_pole" />
                </div>
                <div class="name_override_field">
                    <label for="name_override_user">
                        <span>user →</span>
                    </label>
                    <input id="name_override_user" type="text" class="text_pole" />
                </div>
                <small class="name_override_hint">
                    Leave empty = use default name. Saved per character card.
                </small>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(settingsHtml);

    // Bind input events
    $('#name_override_char').on('input', function () {
        saveOverrides($(this).val(), $('#name_override_user').val());
    });
    $('#name_override_user').on('input', function () {
        saveOverrides($('#name_override_char').val(), $(this).val());
    });

    // Sync UI when switching chats / characters
    eventSource.on(event_types.CHAT_CHANGED, updateUI);

    // Register secondary event hooks
    if (event_types.CHAT_COMPLETION_PROMPT_READY) {
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    }
    if (event_types.GENERATE_AFTER_COMBINE_PROMPTS) {
        eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, onGenerateAfterCombine);
    }

    console.log(`[${MODULE_NAME}] Extension loaded`);
    updateUI();
})();
