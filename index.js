/**
 * Name Override — SillyTavern Extension
 *
 * Replaces {{char}} / {{user}} resolved names in the prompt sent to the API.
 * Settings are saved per character card.
 *
 * NOTE: Import paths assume the standard ST third-party extension location:
 *   public/scripts/extensions/third-party/name-override/
 * If your ST version uses a different layout, adjust the relative paths.
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';

const EXT_NAME = 'name-override';

// ── helpers ──────────────────────────────────────────────────────────

/** Escape special regex chars in a string */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Get a stable per-character key (avatar filename) */
function getCharKey() {
    const ctx = getContext();
    const char = ctx?.characters?.[ctx.characterId];
    // avatar is the most stable unique id for a character card in ST
    return char?.avatar ?? null;
}

/** Read overrides for current character */
function getOverrides() {
    const key = getCharKey();
    if (!key) return { charName: '', userName: '' };
    return extension_settings[EXT_NAME]?.[key] ?? { charName: '', userName: '' };
}

/** Save overrides for current character */
function saveOverrides(charName, userName) {
    const key = getCharKey();
    if (!key) return;
    if (!extension_settings[EXT_NAME]) extension_settings[EXT_NAME] = {};
    extension_settings[EXT_NAME][key] = { charName, userName };
    saveSettingsDebounced();
}

/**
 * Replace `original` with `replacement` in text, using word-boundary regex.
 * Falls back to plain replaceAll if the name contains characters that make
 * word-boundary matching unreliable (e.g. names ending in non-word chars).
 */
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

/** Apply both char & user name replacements to a string */
function applyReplacements(text, origChar, origUser, newChar, newUser) {
    if (newChar) text = replaceName(text, origChar, newChar);
    if (newUser) text = replaceName(text, origUser, newUser);
    return text;
}

// ── prompt hooks ─────────────────────────────────────────────────────

/**
 * Hook for Chat Completion APIs (OpenAI-compatible).
 * Event data is expected to be { messages: [...] } or { chat: [...] }.
 */
function onChatCompletionReady(data) {
    const ctx = getContext();
    if (!ctx) return;

    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;

    // ST versions may use different property names
    const messages = data?.messages ?? data?.chat;
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
        // Replace inside message content
        if (typeof msg.content === 'string') {
            msg.content = applyReplacements(msg.content, origChar, origUser, newChar, newUser);
        }
        // Also handle content arrays (vision messages etc.)
        if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' && typeof part.text === 'string') {
                    part.text = applyReplacements(part.text, origChar, origUser, newChar, newUser);
                }
            }
        }
        // Replace the name field if present
        if (msg.name) {
            if (newChar && msg.name === origChar) msg.name = newChar;
            if (newUser && msg.name === origUser) msg.name = newUser;
        }
    }
}

/**
 * Hook for Text Completion APIs.
 * Event data is expected to be { prompt: "..." } or a plain string
 * (depending on ST version).
 */
function onGenerateAfterCombine(data) {
    const ctx = getContext();
    if (!ctx) return;

    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();
    if (!newChar && !newUser) return;

    const origChar = ctx.name2;
    const origUser = ctx.name1;

    if (typeof data === 'object' && data !== null) {
        // Try common property names
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

    // Show current default names as placeholder hints
    const ctx = getContext();
    if (ctx) {
        $('#name_override_char').attr('placeholder', ctx.name2 || '(char name)');
        $('#name_override_user').attr('placeholder', ctx.name1 || '(user name)');
    }
}

// ── init ─────────────────────────────────────────────────────────────

jQuery(async () => {
    // Ensure settings object exists
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {};
    }

    // Inject settings panel HTML
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
                        <span>{{char}} → </span>
                    </label>
                    <input id="name_override_char" type="text" class="text_pole" />
                </div>
                <div class="name_override_field">
                    <label for="name_override_user">
                        <span>{{user}} → </span>
                    </label>
                    <input id="name_override_user" type="text" class="text_pole" />
                </div>
                <small class="name_override_hint">
                    Leave empty = use default. Saved per character card.
                </small>
            </div>
        </div>
    </div>`;

    $('#extensions_settings').append(settingsHtml);

    // Bind input events
    $('#name_override_char').on('input', function () {
        saveOverrides($(this).val(), $('#name_override_user').val());
    });
    $('#name_override_user').on('input', function () {
        saveOverrides($('#name_override_char').val(), $(this).val());
    });

    // Sync UI when switching chats / characters
    eventSource.on(event_types.CHAT_CHANGED, updateUI);

    // Register prompt hooks
    if (event_types.CHAT_COMPLETION_PROMPT_READY) {
        eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionReady);
    }
    if (event_types.GENERATE_AFTER_COMBINE) {
        eventSource.on(event_types.GENERATE_AFTER_COMBINE, onGenerateAfterCombine);
    }

    console.log(`[${EXT_NAME}] loaded`);
    updateUI();
});
