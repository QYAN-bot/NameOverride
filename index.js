/**
 * Name Override — SillyTavern Extension v7
 *
 * 在输入框中替换 char/user 占位符为自定义名字。
 * 支持三种格式级联检测：{{char}} → <char> → char（纯文本）
 * 设置按角色卡独立记忆。
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

// ── core: cascading replacement ──────────────────────────────────────
// For each keyword (char / user), try formats in order:
//   1. {{keyword}}  — most specific, lowest false-positive risk
//   2. <keyword>    — medium specificity
//   3. keyword      — plain word boundary match, most aggressive
// Stops at the first format that matches.

function tryReplace(text, keyword, replacement) {
    if (!replacement) return { text, changed: false, format: null };

    // 1. {{keyword}}
    const re1 = new RegExp(`\\{\\{${keyword}\\}\\}`, 'gi');
    if (re1.test(text)) {
        return { text: text.replace(re1, replacement), changed: true, format: `{{${keyword}}}` };
    }

    // 2. <keyword>
    const re2 = new RegExp(`<${keyword}>`, 'gi');
    if (re2.test(text)) {
        return { text: text.replace(re2, replacement), changed: true, format: `<${keyword}>` };
    }

    // 3. plain word (word boundary)
    const re3 = new RegExp(`\\b${keyword}\\b`, 'gi');
    if (re3.test(text)) {
        return { text: text.replace(re3, replacement), changed: true, format: keyword };
    }

    return { text, changed: false, format: null };
}

function doReplace() {
    const $input = $('#send_textarea');
    if (!$input.length) return;

    let text = $input.val();
    if (!text) return;

    const { charName, userName } = getOverrides();
    const newChar = charName?.trim();
    const newUser = userName?.trim();

    if (!newChar && !newUser) {
        toastr.warning('未设置替换名', '名称替换', { timeOut: 2000 });
        return;
    }

    const formats = [];

    const charResult = tryReplace(text, 'char', newChar);
    text = charResult.text;
    if (charResult.changed) formats.push(`${charResult.format} → ${newChar}`);

    const userResult = tryReplace(text, 'user', newUser);
    text = userResult.text;
    if (userResult.changed) formats.push(`${userResult.format} → ${newUser}`);

    if (formats.length > 0) {
        $input.val(text).trigger('input');
        toastr.success(formats.join('，'), '名称替换', { timeOut: 2500 });
    } else {
        toastr.warning('未检测到 char/user 占位符', '名称替换', { timeOut: 2000 });
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
    const menuItemHtml = `
        <div id="name_override_wand_btn" class="list-group-item flex-container flexGap5"
             title="替换输入框中的 char/user 占位符">
            <i class="fa-solid fa-arrow-right-arrow-left extensionsMenuExtensionButton"></i>
            名称替换
        </div>`;

    const wandSelectors = [
        '#extensionsMenu',
        '#extensions_wand_container',
        '.extensions_block .dropdown-menu',
        '#leftSendForm .dropdown-menu',
    ];

    let placed = false;
    for (const sel of wandSelectors) {
        const $container = $(sel);
        if ($container.length) {
            $container.append(menuItemHtml);
            placed = true;
            break;
        }
    }

    if (!placed) {
        const $parent = $('.extensionsMenuExtensionButton').first()
            .closest('[class*="menu"], [class*="container"], [class*="dropdown"]');
        if ($parent.length) {
            $parent.append(menuItemHtml);
            placed = true;
        }
    }

    if (!placed) {
        const $btn = $(`<div id="name_override_wand_btn" class="fa-solid fa-arrow-right-arrow-left interactable"
            title="名称替换" style="cursor:pointer; padding:3px; opacity:0.6; font-size:0.8em;"></div>`);
        $('#send_but').before($btn);
    }

    $(document).on('click', '#name_override_wand_btn', doReplace);
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
                <b>名称替换设置</b>
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
                    输入后在魔棒菜单内选择「名称替换」即可。
                    支持三种格式：<code>{{char}}</code>、<code>&lt;char&gt;</code>、<code>char</code>
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

    addWandMenuItem();
    eventSource.on(event_types.CHAT_CHANGED, updateUI);

    console.log(`[${MODULE_NAME}] loaded`);
    updateUI();
});
