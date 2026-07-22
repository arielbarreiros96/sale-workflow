import {Component, onMounted, onWillStart, useState} from "@odoo/owl";
import {ControlPanel} from "@web/search/control_panel/control_panel";
import {OdooDataProvider} from "@spreadsheet/data_sources/odoo_data_provider";
import {OdooSpreadsheetModel} from "@spreadsheet/model";
import {SpreadsheetComponent} from "@spreadsheet/actions/spreadsheet_component";
import {WarningDialog} from "@web/core/errors/error_dialogs";
import {_t} from "@web/core/l10n/translation";
import {registerSaleFieldMapping} from "../field_mapping/field_mapping_registration.esm";
import {registry} from "@web/core/registry";
import {useDebounced} from "@web/core/utils/timing";
import {useService} from "@web/core/utils/hooks";
import {useSetupAction} from "@web/search/action_hook";

export class CalculatorSpreadsheetAction extends Component {
    static template = "sale_spreadsheet_calculator.CalculatorSpreadsheetAction";
    static components = {ControlPanel, SpreadsheetComponent};
    static props = {"*": true};

    setup() {
        this.orm = useService("orm");
        this.notification = useService("notification");
        this.dialog = useService("dialog");
        this.action = useService("action");
        this.calculatorId = this.props.action.params.calculator_id;
        this.controlPanelDisplay = {};
        this.state = useState({busy: false});
        this._dirty = false;

        registerSaleFieldMapping();

        this.debouncedSave = useDebounced(() => this._save(), 2000, {
            execBeforeUnmount: true,
        });
        useSetupAction({beforeLeave: () => this._save()});

        onWillStart(this.loadData.bind(this));
        onMounted(() => {
            requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
        });
    }

    get canWrite() {
        return Boolean(this.orderId);
    }

    async loadData() {
        const [record] = await this.orm.read(
            "sale.quote.calculator",
            [this.calculatorId],
            ["spreadsheet_data", "order_id"]
        );
        this.orderId = record.order_id ? record.order_id[0] : false;
        this.orderName = record.order_id ? record.order_id[1] : "";
        const mappingLines = await this.orm.call(
            "sale.quote.calculator",
            "get_mapping_lines",
            [[this.calculatorId]]
        );

        let data = {};
        if (record.spreadsheet_data) {
            try {
                data = JSON.parse(record.spreadsheet_data);
            } catch {
                data = {};
            }
        }
        const odooDataProvider = new OdooDataProvider(this.env);
        this.model = new OdooSpreadsheetModel(data, {
            custom: {env: this.env, odooDataProvider, mappingLines},
        });
        odooDataProvider.addEventListener("data-source-updated", () =>
            this.model.dispatch("EVALUATE_CELLS")
        );
        this.model.on("update", this, () => {
            this._dirty = true;
            this.debouncedSave();
        });
    }

    _collectMappings() {
        const mappings = [];
        const seen = {};
        const duplicates = new Set();
        for (const [
            position,
            fieldMapping,
        ] of this.model.getters.getAllFieldMappings()) {
            const cell = this.model.getters.getEvaluatedCell(position);
            if (cell && cell.type === "error") {
                continue;
            }
            const isEmpty = !cell || cell.type === "empty" || cell.value === "";
            const key = `${fieldMapping.position}/${fieldMapping.fieldName}`;
            const ref = this.model.getters.getRangeString(
                this.model.getters.getRangeFromZone(position.sheetId, {
                    left: position.col,
                    right: position.col,
                    top: position.row,
                    bottom: position.row,
                }),
                position.sheetId
            );
            if (seen[key]) {
                duplicates.add(key);
            }
            seen[key] = ref;
            mappings.push({
                key,
                ref,
                position: fieldMapping.position,
                field: fieldMapping.fieldName,
                value: isEmpty ? null : cell.value,
            });
        }
        const errors = [...duplicates].map((key) => {
            const refs = mappings.filter((m) => m.key === key).map((m) => m.ref);
            return _t(
                "Several cells target the same field of the same line: %s",
                refs.join(", ")
            );
        });
        return {mappings, errors};
    }

    async _save() {
        if (!this.model || !this.calculatorId || !this._dirty) {
            return;
        }
        this._dirty = false;
        await this.orm.write("sale.quote.calculator", [this.calculatorId], {
            spreadsheet_data: JSON.stringify(this.model.exportData()),
        });
    }

    async onWriteToOrder() {
        if (this.state.busy || !this.canWrite) {
            return;
        }
        this.state.busy = true;
        try {
            const {mappings, errors} = this._collectMappings();
            if (errors.length) {
                this.dialog.add(WarningDialog, {
                    title: _t("Unable to write to the order"),
                    message: errors.join("\n\n"),
                });
                return;
            }
            await this._save();
            const result = await this.orm.call("sale.order", "apply_field_mappings", [
                [this.orderId],
                mappings.map(({position, field, value}) => ({position, field, value})),
            ]);
            this.notification.add(
                _t("Updated %s order line(s) from the calculator.", result.updated),
                {type: "success"}
            );
            this.action.doAction({type: "ir.actions.act_window_close"});
        } finally {
            this.state.busy = false;
        }
    }
}

registry
    .category("actions")
    .add("sale_spreadsheet_calculator.calculator_editor", CalculatorSpreadsheetAction, {
        force: true,
    });
