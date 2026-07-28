import {ActionSpreadsheetOca} from "@spreadsheet_oca/spreadsheet/bundle/spreadsheet_action.esm";
import {patch} from "@web/core/utils/patch";
import {useSubEnv} from "@odoo/owl";

/**
 * Expose the open spreadsheet's identity on the env.
 *
 * The OCA action renders the editor, which hands its ``env`` to the
 * o-spreadsheet model's ``custom`` config. By publishing ``saleResId`` here we
 * give the field-mapping plugin (running inside that model) a way to load its
 * sale context and write results back to the order — without having to touch
 * any spreadsheet_oca source.
 */
patch(ActionSpreadsheetOca.prototype, {
    setup() {
        super.setup();
        useSubEnv({saleResId: this.spreadsheetId, saleModel: this.model});
    },
});
