/**
 * Name Override — SillyTavern Extension v6
 *
 * Adds a button next to the input box. Click it to replace
 * {{char}} and {{user}} in your message with custom names.
 * Settings saved per character card.
 */

const MODULE_NAME = 'name_override';

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

// ── core: replace text in input box ──────────────────────────────────

function doReplace() {
    const $input = $('#send_textarea');
    if (!$input.length) return;

    let text = $input.val();
    if (!text) return;

    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();

    // Also support the original card name as fallback source
    const ctx = SillyTavern.getContext();

    let changed = false;

    if (newChar) {
        // Replace {{char}} (case-insensitive)
        const re = /\{\{char\}\}/gi;
        if (re.test(text)) {
            text = text.replace(re, newChar);
            changed = true;
        }
    }

    if (newUser) {
        const re = /\{\{user\}\}/gi;
        if (re.test(text)) {
            text = text.replace(re, newUser);
            changed = true;
        }
    }

    if (changed) {
        $input.val(text).trigger('input');
        toastr.success('Names replaced!', 'Name Override', { timeOut: 1500 });
    } else {
        toastr.warning('No {{char}}/{{user}} found, or no names set', 'Name Override', { timeOut: 2000 });
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

    getSettings();

    // ── Settings panel ──
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
                    Type {{char}} / {{user}} in chat, then click the 🔄 button to replace.
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

    // ── Replace button next to send ──
    const $btn = $(`
        <div id="name_override_btn" class="fa-solid fa-arrow-right-arrow-left"
             title="Replace {{char}}/{{user}} with custom names">
        </div>
    `);
    // Insert before the send button
    const $sendBtn = $('#send_but');
    if ($sendBtn.length) {
        $sendBtn.before($btn);
    } else {
        // Fallback: append to the input area
        $('#send_form').append($btn);
    }

    $btn.on('click', doReplace);

    // Sync settings when switching characters
    eventSource.on(event_types.CHAT_CHANGED, updateUI);

    console.log(`[${MODULE_NAME}] loaded`);
    updateUI();
});
