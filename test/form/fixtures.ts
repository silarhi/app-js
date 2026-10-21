/*
 * This file is part of the @silarhi/app-js package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

/** What Symfony renders for a `user` form, ids and names included. */
export const USER_FORM = `
    <form name="user" id="user-form">
        <div id="user">
            <div class="form-group"><label for="user_name">Name</label><input id="user_name" name="user[name]" value="Ada"></div>
            <div class="form-group"><label>Start</label><input id="user_start_date" name="user[start_date]"></div>
            <div class="form-group">
                <input id="user_agree" name="user[agree]" type="checkbox"><label class="form-check-label">Agree</label>
            </div>
            <div id="user_address">
                <div class="form-group"><input id="user_address_city" name="user[address][city]"></div>
            </div>
            <fieldset class="form-group">
                <legend>Size</legend>
                <div id="user_size">
                    <input id="user_size_0" name="user[size]" type="radio" value="s">
                    <input id="user_size_1" name="user[size]" type="radio" value="m" checked>
                </div>
            </fieldset>
            <div class="form-group">
                <label>Tags</label>
                <div id="user_tags">
                    <input id="user_tags_0" name="user[tags][]" type="checkbox" value="a" checked>
                    <input id="user_tags_1" name="user[tags][]" type="checkbox" value="b">
                    <input id="user_tags_2" name="user[tags][]" type="checkbox" value="c" checked>
                </div>
            </div>
            <div class="form-group">
                <select id="user_roles" name="user[roles][]" multiple><option value="a" selected></option><option value="b"></option></select>
            </div>
            <div id="user_phones" data-prototype='<div><input id="user_phones___name___number" name="user[phones][__name__][number]"></div>'>
                <div class="form-group"><input id="user_phones_0_number" name="user[phones][0][number]" value="01"></div>
                <div class="form-group"><input id="user_phones_2_number" name="user[phones][2][number]" value="02"></div>
            </div>
            <div id="user_notes" data-prototype='<input id="user_notes___name__" name="user[notes][__name__]">'></div>
            <input type="hidden" id="user__token" name="user[_token]" value="t">
        </div>
    </form>
    <input id="outside" name="outside">`
