/**
 * Name Override — SillyTavern Extension v6.1
 *
 * Adds a "Replace Names" item to the Magic Wand (extensions) menu.
 * Click it to replace {{char}} and {{user}} in your message with
 * custom names before sending. Settings saved per character card.
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

    let changed = false;

    if (newChar) {
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

function addWandMenuItem() {
    // The wand menu item — uses the same HTML pattern as ST's built-in
    // extension menu items (a list-group-item inside the wand container)
    const menuItemHtml = `
        <div id="name_override_wand_btn" class="list-group-item flex-container flexGap5"
             title="Replace {{char}}/{{user}} in input with custom names">
            <i class="fa-solid fa-arrow-right-arrow-left extensionsMenuExtensionButton"></i>
            Replace Names
        </div>`;

    // Try known wand menu containers (varies by ST version)
    const wandSelectors = [
        '#extensionsMenu',                       // Common in many versions
        '#extensions_wand_container',             // Some versions
        '.extensions_block .dropdown-menu',       // Dropdown style
        '#leftSendForm .dropdown-menu',           // Left send form dropdown
    ];

    let placed = false;
    for (const sel of wandSelectors) {
        const $container = $(sel);
        if ($container.length) {
            $container.append(menuItemHtml);
            placed = true;
            console.log(`[${MODULE_NAME}] Wand menu item added to ${sel}`);
            break;
        }
    }

    if (!placed) {
        // Fallback: look for any container that already has wand-style items
        const $existingItems = $('.extensionsMenuExtensionButton').first().closest('[class*="menu"], [class*="container"], [class*="dropdown"]');
        if ($existingItems.length) {
            $existingItems.append(menuItemHtml);
            placed = true;
            console.log(`[${MODULE_NAME}] Wand menu item added via fallback parent`);
        }
    }

    if (!placed) {
        // Last resort: tiny icon button before send, but styled to match ST
        const $btn = $(`<div id="name_override_wand_btn" class="fa-solid fa-arrow-right-arrow-left interactable"
            title="Replace {{char}}/{{user}} with custom names"
            style="cursor:pointer; padding:3px; opacity:0.6; font-size:0.8em;"></div>`);
        $('#send_but').before($btn);
        console.log(`[${MODULE_NAME}] Fallback: small button added near send`);
    }

    // Bind click
    $(document).on('click', '#name_override_wand_btn', doReplace);
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
                    Type {{char}}/{{user}} in chat, then use the wand menu
                    "Replace Names" to swap them before sending.
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

    // Add the wand menu item
    addWandMenuItem();

    eventSource.on(event_types.CHAT_CHANGED, updateUI);

    console.log(`[${MODULE_NAME}] loaded`);
    updateUI();
});
